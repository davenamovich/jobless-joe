/**
 * TTS Service — turns Jobless Joe lyrics into a single playable audio file.
 *
 * Strategy:
 *  - The Z.ai TTS API accepts up to 1024 characters per call.
 *  - Joe's lyrics are often longer than that, so we split on sentence
 *    boundaries (see splitLyricsIntoChunks), generate each chunk separately,
 *    and concatenate the resulting MP3 buffers into one file.
 *  - MP3 frames are independently decodable, so naive byte concatenation
 *    works for playback (the slight discontinuity at frame boundaries is
 *    imperceptible for spoken-word content).
 *  - The final file is written to /public/audio/ and served statically,
 *    so the browser <audio> element can stream it efficiently.
 *  - We persist an AudioTrack row keyed by (episodeId, voice) so we never
 *    regenerate the same audio twice.
 */

import fs from "node:fs/promises";
import path from "node:path";
import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import {
  splitLyricsIntoChunks,
  estimateChunkDurationSec,
  getVoice,
} from "@/lib/voices";
import {
  ACE_STEP_DEFAULT_MODEL,
  ACE_STEP_DEFAULT_URL,
  loadBackendConfig,
  type BackendConfig,
} from "@/lib/ai-backend";
import { buildAceCaption } from "@/lib/crooner-styles";
import { getLanguage } from "@/lib/languages";
import type { SongOutput } from "@/lib/joe-prompts";
import { ensureTrackTiming } from "@/lib/song-timing";

const AUDIO_DIR = path.join(process.cwd(), "public", "audio");
const PUBLIC_PREFIX = "/audio";

export interface GenerateAudioResult {
  ok: boolean;
  audioTrackId?: string;
  audioUrl?: string;
  durationSec?: number;
  chunkCount?: number;
  voice?: string;
  /** Which engine produced (or served) this track */
  engine?: "zai" | "acestep";
  error?: string;
}

/** Ensure the public/audio directory exists. */
async function ensureAudioDir() {
  await fs.mkdir(AUDIO_DIR, { recursive: true });
}

/**
 * Renders currently in flight, keyed `episodeId:voice`.
 *
 * Music generation is kicked off in the background after /api/generate
 * responds, so a dev-server reload (or a crash) can drop the job while
 * ACE-Step itself keeps working. Tracking in-flight renders lets the UI
 * distinguish "still rendering" from "nothing is rendering — restart it"
 * instead of spinning forever.
 */
const inFlight = new Map<string, Promise<GenerateAudioResult>>();

/** True while a render for this episode is running in *this* process. */
export function isAudioRendering(episodeId: string): boolean {
  for (const key of inFlight.keys()) {
    if (key.startsWith(`${episodeId}:`)) return true;
  }
  return false;
}

/**
 * Generate (or fetch from cache) an audio track for an episode + voice.
 *
 * Concurrent calls for the same episode + voice share one render, so a UI
 * retry can never start a second ACE-Step job.
 *
 * @param episodeId The episode to generate audio for.
 * @param voice Voice key from VOICES.
 * @returns Either an existing AudioTrack or a freshly-generated one.
 */
export function ensureAudioTrack(
  episodeId: string,
  voice: string
): Promise<GenerateAudioResult> {
  const key = `${episodeId}:${voice}`;
  const running = inFlight.get(key);
  if (running) return running;

  let job: Promise<GenerateAudioResult>;
  job = runEnsureAudioTrack(episodeId, voice).finally(() => {
    if (inFlight.get(key) === job) inFlight.delete(key);
  });
  inFlight.set(key, job);
  return job;
}

async function runEnsureAudioTrack(
  episodeId: string,
  voice: string
): Promise<GenerateAudioResult> {
  const voiceDef = getVoice(voice);
  const cfg = await loadBackendConfig();
  const engine = cfg.audioEngine;
  // Z.ai produces WAV (spoken), ACE-Step produces MP3 (sung/music). The format
  // lets us detect a cached track made by the other engine and regenerate.
  const expectedFormat = engine === "acestep" ? "mp3" : "wav";

  // 1. Look for an existing track.
  const existing = await db.audioTrack.findUnique({
    where: { episodeId_voice: { episodeId, voice } },
  });
  if (existing) {
    if (existing.format === expectedFormat) {
      return {
        ok: true,
        audioTrackId: existing.id,
        audioUrl: existing.filePath,
        durationSec: existing.durationSec,
        chunkCount: existing.chunkCount,
        voice: existing.voice,
        engine,
      };
    }
    // Made by a different engine — replace it.
    await db.audioTrack.delete({ where: { id: existing.id } });
  }

  // 2. Load the episode + extract lyrics.
  const episode = await db.episode.findUnique({ where: { id: episodeId } });
  if (!episode) {
    return { ok: false, error: "Episode not found." };
  }
  let output: SongOutput;
  try {
    output = JSON.parse(episode.output) as SongOutput;
  } catch {
    return { ok: false, error: "Episode output is corrupted." };
  }
  const lyrics = output.lyrics?.trim() ?? "";
  if (!lyrics && engine !== "acestep") {
    return { ok: false, error: "Episode has no lyrics to speak." };
  }

  // === ACE-Step: render music from the written lyrics + direction. ===
  if (engine === "acestep") {
    await ensureAudioDir();
    let rendered: { buffer: Buffer; format: string; durationSec: number };
    try {
      rendered = await generateAceStepAudio(
        output,
        episode.duration,
        cfg,
        episode.language
      );
    } catch (e) {
      console.error("ACE-Step generation failed", e);
      return {
        ok: false,
        error: `ACE-Step failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
    const filename = `ep_${episodeId}_${voice}.${rendered.format}`;
    await fs.writeFile(path.join(AUDIO_DIR, filename), rendered.buffer);
    const filePath = `${PUBLIC_PREFIX}/${filename}`;
    // Another worker may have finished the same render first (inFlight only
    // dedupes inside one process), so write the row idempotently instead of
    // failing the whole song on the (episodeId, voice) unique constraint.
    const data = {
      format: rendered.format,
      speed: 1,
      durationSec: Math.round(rendered.durationSec),
      chunkCount: 1,
      filePath,
      lineStarts: "", // new audio, old timing no longer applies
    };
    const track = await db.audioTrack.upsert({
      where: { episodeId_voice: { episodeId, voice: voiceDef.key } },
      create: { episodeId, voice: voiceDef.key, ...data },
      update: data,
    });
    void ensureTrackTiming(track.id);
    return {
      ok: true,
      audioTrackId: track.id,
      audioUrl: filePath,
      durationSec: Math.round(rendered.durationSec),
      chunkCount: 1,
      voice: track.voice,
      engine,
    };
  }

  // 3. Split into TTS-sized chunks.
  const chunks = splitLyricsIntoChunks(lyrics, 900);
  if (chunks.length === 0) {
    return { ok: false, error: "Lyrics are empty after cleaning." };
  }

  // 4. Generate each chunk.
  await ensureAudioDir();
  let zai: Awaited<ReturnType<typeof ZAI.create>>;
  try {
    zai = await ZAI.create();
  } catch (e) {
    console.error("ZAI init failed for TTS", e);
    return { ok: false, error: "TTS backend failed to initialize." };
  }

  const buffers: Buffer[] = [];
  let totalDurationSec = 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    try {
      const response = await zai.audio.tts.create({
        input: chunk,
        voice: voiceDef.key,
        speed: voiceDef.speed,
        response_format: "wav",
        stream: false,
      });
      const arrayBuffer = await response.arrayBuffer();
      const buf = Buffer.from(new Uint8Array(arrayBuffer));
      if (buf.length === 0) {
        console.warn(`TTS chunk ${i + 1}/${chunks.length} returned empty buffer`);
      } else {
        buffers.push(buf);
        totalDurationSec += estimateChunkDurationSec(chunk, voiceDef.speed);
      }
    } catch (e) {
      console.error(`TTS chunk ${i + 1}/${chunks.length} failed`, e);
      return {
        ok: false,
        error: `TTS failed on chunk ${i + 1} of ${chunks.length}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      };
    }
  }

  if (buffers.length === 0) {
    return { ok: false, error: "All TTS chunks failed." };
  }

  // 5. Concatenate buffers and write to disk.
  // For WAV, naive concatenation doesn't quite work — WAV has a single
  // header followed by raw PCM samples. We strip the first 44-byte header
  // from each subsequent chunk so they play as one continuous stream.
  // For a single chunk, just write it as-is.
  const combined =
    buffers.length === 1
      ? buffers[0]
      : concatWavBuffers(buffers);
  const filename = `ep_${episodeId}_${voice}.wav`;
  const fullPath = path.join(AUDIO_DIR, filename);
  await fs.writeFile(fullPath, combined);
  const publicPath = `${PUBLIC_PREFIX}/${filename}`;

  // 6. Persist AudioTrack row. Upsert: a parallel render in another worker
  // can win this race, and that is not a failure — the audio is the same.
  const audioData = {
    format: "wav",
    speed: voiceDef.speed,
    durationSec: Math.round(totalDurationSec),
    chunkCount: buffers.length,
    filePath: publicPath,
    lineStarts: "", // new audio, old timing no longer applies
  };
  const track = await db.audioTrack.upsert({
    where: { episodeId_voice: { episodeId, voice: voiceDef.key } },
    create: { episodeId, voice: voiceDef.key, ...audioData },
    update: audioData,
  });
  void ensureTrackTiming(track.id);

  return {
    ok: true,
    audioTrackId: track.id,
    audioUrl: publicPath,
    durationSec: Math.round(totalDurationSec),
    chunkCount: buffers.length,
    voice: voiceDef.key,
    engine: "zai",
  };
}

// ---------------- ACE-Step (music generation) ----------------

/** ACE-Step answers a 503 until a DiT model is initialized; init can take ~20s. */
const ACE_STEP_TIMEOUT_MS = 15 * 60 * 1000;

/** Accept a bare host, http(s) URL, or URL ending in /v1. */
function aceStepBase(raw: string): string {
  let url = (raw || ACE_STEP_DEFAULT_URL).trim().replace(/\/+$/, "");
  url = url.replace(/\/v1$/i, "");
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  return url;
}

/** "acestep/acestep-v15-turbo" -> "acestep-v15-turbo" (what /v1/init expects). */
function aceStepInitModel(model: string): string {
  return model.replace(/^[^/]+\//, "").trim();
}

function aceStepHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    // Free ngrok tunnels can serve an HTML warning page to browser-like clients.
    "ngrok-skip-browser-warning": "true",
  };
  const key = process.env.ACESTEP_API_KEY?.trim();
  if (key) headers["Authorization"] = `Bearer ${key}`;
  return headers;
}

/** "60s" / "60 seconds — ..." -> seconds, clamped to a sane ACE-Step range. */
function aceStepDurationSec(durationKey: string, label?: string): number {
  const keyMatch = /^(\d+)s$/.exec(durationKey?.trim() ?? "");
  const labelMatch = /(\d+)\s*(?:s\b|sec|seconds)/i.exec(label ?? "");
  const seconds = keyMatch
    ? Number(keyMatch[1])
    : labelMatch
      ? Number(labelMatch[1])
      : 30;
  return Math.min(240, Math.max(10, seconds));
}

interface AceStepChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
      audio?: Array<{ audio_url?: { url?: string } }>;
    };
    finish_reason?: string;
  }>;
  error?: { message?: string };
}

/**
 * Ask ACE-Step to render Joe's lyrics as an actual song. Returns the decoded
 * audio buffer; the caller persists it and the AudioTrack row.
 *
 * Works against a local server (http://localhost:8001) or an ngrok tunnel.
 */
async function generateAceStepAudio(
  output: SongOutput,
  durationKey: string,
  cfg: BackendConfig,
  language?: string
): Promise<{ buffer: Buffer; format: string; durationSec: number }> {
  const base = aceStepBase(cfg.aceStepBaseUrl);
  const model = cfg.aceStepModel?.trim() || ACE_STEP_DEFAULT_MODEL;
  const seconds = aceStepDurationSec(durationKey, output.duration);
  const lyrics = output.lyrics?.trim() ?? "";
  // Always the same Joe voice brief, with a short episode-specific clause
  // appended — see ACE_CROONER_STYLE_PROMPT.
  const caption = buildAceCaption(output);

  const payload = {
    model,
    messages: [
      {
        role: "user",
        content: lyrics
          ? `<prompt>${caption}</prompt><lyrics>${lyrics}</lyrics>`
          : caption,
      },
    ],
    stream: false,
    thinking: false,
    use_format: false,
    // No lyrics? Let ACE-Step invent everything from the caption.
    ...(lyrics ? {} : { sample_mode: true }),
    audio_config: {
      duration: seconds,
      format: "mp3",
      vocal_language: getLanguage(language).ace,
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ACE_STEP_TIMEOUT_MS);
  const headers = aceStepHeaders();
  const url = `${base}/v1/chat/completions`;

  const send = () =>
    fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

  try {
    let res = await send();

    // Fresh server: models exist but aren't loaded. Initialize and retry once.
    if (res.status === 503) {
      const text = await res.text().catch(() => "");
      if (!/not initialized/i.test(text)) {
        throw new Error(`HTTP 503: ${text.slice(0, 300)}`);
      }
      const initRes = await fetch(`${base}/v1/init`, {
        method: "POST",
        headers,
        body: JSON.stringify({ model: aceStepInitModel(model), init_llm: false }),
        signal: controller.signal,
      });
      if (!initRes.ok) {
        const initText = await initRes.text().catch(() => "");
        throw new Error(
          `model init failed (${initRes.status}): ${initText.slice(0, 300)}`
        );
      }
      res = await send();
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
    }

    const json = (await res.json()) as AceStepChatResponse;
    if (json.error?.message) throw new Error(json.error.message);

    const choice = json.choices?.[0];
    if (choice?.finish_reason === "error") {
      throw new Error(choice.message?.content || "generation failed");
    }

    const dataUrl = choice?.message?.audio?.[0]?.audio_url?.url;
    if (!dataUrl || !dataUrl.startsWith("data:")) {
      const preview = (choice?.message?.content ?? "").slice(0, 200);
      throw new Error(`no audio in response${preview ? `: ${preview}` : ""}`);
    }

    const comma = dataUrl.indexOf(",");
    if (comma === -1) throw new Error("malformed audio data URL");
    const mime = dataUrl.slice(5, comma).split(";")[0] || "audio/mpeg";
    const buffer = Buffer.from(dataUrl.slice(comma + 1), "base64");
    if (buffer.length === 0) throw new Error("decoded audio was empty");

    const format = /wav/i.test(mime)
      ? "wav"
      : /flac/i.test(mime)
        ? "flac"
        : "mp3";
    return { buffer, format, durationSec: seconds };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("timed out waiting for ACE-Step (15 min)");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Concatenate WAV buffers. Z.ai's WAV files include extra RIFF chunks
 * (`AIGC` metadata, `LIST`) before the `data` chunk — the standard 44-byte
 * strip assumption doesn't work. Instead we:
 *  1. Parse each buffer's RIFF chunk list.
 *  2. Extract the PCM samples (the `data` chunk payload).
 *  3. Re-emit a single canonical WAV with one fmt header + one data chunk.
 *  4. Carry the fmt params (sampleRate, channels, bitsPerSample) from the
 *     first buffer.
 */
function concatWavBuffers(buffers: Buffer[]): Buffer {
  if (buffers.length === 0) return Buffer.alloc(0);
  if (buffers.length === 1) return buffers[0];

  const parsed = buffers.map(parseWav);
  // All chunks should have the same fmt params (same voice + speed), but
  // take the first as canonical.
  const fmt = parsed[0].fmt;
  const totalPcm = Buffer.concat(parsed.map((p) => p.data));

  // Build the new WAV: RIFF header (12) + fmt chunk (8+16) + data chunk (8 + pcm.length)
  const wav = Buffer.alloc(12 + 24 + 8 + totalPcm.length);
  // RIFF header
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(36 + totalPcm.length, 4);
  wav.write("WAVE", 8, "ascii");
  // fmt chunk
  wav.write("fmt ", 12, "ascii");
  wav.writeUInt32LE(16, 16); // subchunk1Size = 16 for PCM
  wav.writeUInt16LE(1, 20);  // audioFormat = 1 (PCM)
  wav.writeUInt16LE(fmt.numChannels, 22);
  wav.writeUInt32LE(fmt.sampleRate, 24);
  wav.writeUInt32LE(fmt.byteRate, 28);
  wav.writeUInt16LE(fmt.blockAlign, 32);
  wav.writeUInt16LE(fmt.bitsPerSample, 34);
  // data chunk
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(totalPcm.length, 40);
  totalPcm.copy(wav, 44);
  return wav;
}

interface ParsedWav {
  fmt: {
    numChannels: number;
    sampleRate: number;
    byteRate: number;
    blockAlign: number;
    bitsPerSample: number;
  };
  data: Buffer;
}

/** Parse a WAV buffer into fmt params + the raw PCM `data` chunk. */
function parseWav(buf: Buffer): ParsedWav {
  if (buf.length < 12 || buf.subarray(0, 4).toString("ascii") !== "RIFF") {
    throw new Error("Not a RIFF/WAV buffer");
  }
  let pos = 12;
  let fmt: ParsedWav["fmt"] | null = null;
  let data: Buffer | null = null;
  while (pos + 8 <= buf.length) {
    const id = buf.subarray(pos, pos + 4).toString("ascii");
    const size = buf.readUInt32LE(pos + 4);
    const payloadStart = pos + 8;
    const payloadEnd = payloadStart + size;
    if (id === "fmt ") {
      fmt = {
        numChannels: buf.readUInt16LE(payloadStart + 2),
        sampleRate: buf.readUInt32LE(payloadStart + 4),
        byteRate: buf.readUInt32LE(payloadStart + 8),
        blockAlign: buf.readUInt16LE(payloadStart + 12),
        bitsPerSample: buf.readUInt16LE(payloadStart + 14),
      };
    } else if (id === "data") {
      data = buf.subarray(payloadStart, payloadEnd);
    }
    // Chunks are word-aligned: if size is odd, pad by 1.
    pos = payloadEnd + (size % 2 === 1 ? 1 : 0);
  }
  if (!fmt) throw new Error("WAV missing fmt chunk");
  if (!data) throw new Error("WAV missing data chunk");
  return { fmt, data };
}

/** Fetch the AudioTrack for an episode + voice (returns null if not yet generated). */
export async function getAudioTrack(
  episodeId: string,
  voice: string
): Promise<{
  audioUrl: string;
  durationSec: number;
  voice: string;
  format: string;
} | null> {
  const track = await db.audioTrack.findUnique({
    where: { episodeId_voice: { episodeId, voice } },
  });
  if (!track) return null;
  return {
    audioUrl: track.filePath,
    durationSec: track.durationSec,
    voice: track.voice,
    format: track.format,
  };
}
