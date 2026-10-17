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
import type { SongOutput } from "@/lib/joe-prompts";

const AUDIO_DIR = path.join(process.cwd(), "public", "audio");
const PUBLIC_PREFIX = "/audio";

export interface GenerateAudioResult {
  ok: boolean;
  audioTrackId?: string;
  audioUrl?: string;
  durationSec?: number;
  chunkCount?: number;
  voice?: string;
  error?: string;
}

/** Ensure the public/audio directory exists. */
async function ensureAudioDir() {
  await fs.mkdir(AUDIO_DIR, { recursive: true });
}

/**
 * Generate (or fetch from cache) an audio track for an episode + voice.
 *
 * @param episodeId The episode to generate audio for.
 * @param voice Voice key from VOICES.
 * @returns Either an existing AudioTrack or a freshly-generated one.
 */
export async function ensureAudioTrack(
  episodeId: string,
  voice: string
): Promise<GenerateAudioResult> {
  const voiceDef = getVoice(voice);

  // 1. Look for an existing track.
  const existing = await db.audioTrack.findUnique({
    where: { episodeId_voice: { episodeId, voice } },
  });
  if (existing) {
    return {
      ok: true,
      audioTrackId: existing.id,
      audioUrl: existing.filePath,
      durationSec: existing.durationSec,
      chunkCount: existing.chunkCount,
      voice: existing.voice,
    };
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
  if (!lyrics) {
    return { ok: false, error: "Episode has no lyrics to speak." };
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

  // 6. Persist AudioTrack row.
  const track = await db.audioTrack.create({
    data: {
      episodeId,
      voice: voiceDef.key,
      format: "wav",
      speed: voiceDef.speed,
      durationSec: Math.round(totalDurationSec),
      chunkCount: buffers.length,
      filePath: publicPath,
    },
  });

  return {
    ok: true,
    audioTrackId: track.id,
    audioUrl: publicPath,
    durationSec: Math.round(totalDurationSec),
    chunkCount: buffers.length,
    voice: voiceDef.key,
  };
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
): Promise<{ audioUrl: string; durationSec: number; voice: string } | null> {
  const track = await db.audioTrack.findUnique({
    where: { episodeId_voice: { episodeId, voice } },
  });
  if (!track) return null;
  return {
    audioUrl: track.filePath,
    durationSec: track.durationSec,
    voice: track.voice,
  };
}
