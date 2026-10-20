/**
 * Voices a sit-down script when no audio file was uploaded: Joe in his voice,
 * the guest in another, joined into one WAV with a short pause between clips.
 * Fish Audio speaks a whole turn per call so Joe keeps one voice, and acts
 * out the script's expression tags; the other engines have fixed named
 * voices, speak line by line and skip the tags.
 *
 * Engine: Fish Audio when a key is saved in Settings (Joe and the guest each
 * get their own voice model), else the OpenAI-compatible backend's
 * /audio/speech when that backend is active, else Z.ai TTS.
 */

import ZAI from "z-ai-web-dev-sdk";
import { loadBackendConfig, type BackendConfig } from "@/lib/ai-backend";
import { parseWav, type ParsedWav } from "@/lib/tts-service";
import type { SitdownLine } from "@/lib/sitdown-video";

const PAUSE_SEC = 0.35;

export interface VoicedSitdown {
  wav: Buffer;
  startsMs: number[];
  durationSec: number;
}

type Fmt = ParsedWav["fmt"];

/** OpenAI "pcm" output: 24 kHz, 16-bit, mono. */
const OPENAI_PCM: Fmt = { numChannels: 1, sampleRate: 24000, byteRate: 48000, blockAlign: 2, bitsPerSample: 16 };

export function pcmToWav(pcm: Buffer, fmt: Fmt): Buffer {
  const wav = Buffer.alloc(44 + pcm.length);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(36 + pcm.length, 4);
  wav.write("WAVEfmt ", 8, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(fmt.numChannels, 22);
  wav.writeUInt32LE(fmt.sampleRate, 24);
  wav.writeUInt32LE(fmt.byteRate, 28);
  wav.writeUInt16LE(fmt.blockAlign, 32);
  wav.writeUInt16LE(fmt.bitsPerSample, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(pcm.length, 40);
  pcm.copy(wav, 44);
  return wav;
}

/** Join per-line PCM clips with a pause after each; returns each line's start. */
export function joinClips(clips: Buffer[], fmt: Fmt): VoicedSitdown {
  const pause = Buffer.alloc(Math.round((fmt.byteRate * PAUSE_SEC) / fmt.blockAlign) * fmt.blockAlign);
  const startsMs: number[] = [];
  const parts: Buffer[] = [];
  let bytes = 0;
  for (const clip of clips) {
    startsMs.push(Math.round((bytes / fmt.byteRate) * 1000));
    parts.push(clip, pause);
    bytes += clip.length + pause.length;
  }
  const pcm = Buffer.concat(parts);
  return { wav: pcmToWav(pcm, fmt), startsMs, durationSec: pcm.length / fmt.byteRate };
}

/**
 * Fish Audio voices a whole turn (one speaker's consecutive lines) per call:
 * separate calls drift to a different-sounding voice, especially without a
 * saved voice ID. Long turns are split at line boundaries.
 */
const FISH_TURN_CHARS = 1500;

export function turnsOf(lines: SitdownLine[], maxChars = FISH_TURN_CHARS): SitdownLine[][] {
  const turns: SitdownLine[][] = [];
  let cur: SitdownLine[] = [];
  let len = 0;
  for (const line of lines) {
    const sameSpeaker = cur.length > 0 && cur[0].speaker === line.speaker;
    if (!sameSpeaker || len + line.text.length + 1 > maxChars) {
      if (cur.length) turns.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(line);
    len += line.text.length + 1;
  }
  if (cur.length) turns.push(cur);
  return turns;
}

/**
 * Join per-turn clips with a pause after each. Inside a turn, each line's
 * start is estimated from its share of the turn's characters.
 */
export function joinTurns(turns: { pcm: Buffer; lines: string[] }[], fmt: Fmt): VoicedSitdown {
  const joined = joinClips(
    turns.map((t) => t.pcm),
    fmt,
  );
  const startsMs: number[] = [];
  turns.forEach((t, i) => {
    const turnMs = (t.pcm.length / fmt.byteRate) * 1000;
    const total = t.lines.reduce((n, l) => n + l.length + 1, 0) || 1;
    let before = 0;
    for (const l of t.lines) {
      startsMs.push(Math.round(joined.startsMs[i] + (before / total) * turnMs));
      before += l.length + 1;
    }
  });
  return { ...joined, startsMs };
}

const FISH_TTS_URL = "https://api.fish.audio/v1/tts";
const FISH_SAMPLE_RATE = 44100;

/**
 * The PCM inside a WAV. Streamed WAVs (Fish Audio's among them) can carry a
 * placeholder data size (0 or 0xFFFFFFFF), so then take the rest of the file.
 */
export function wavPcm(buf: Buffer): { fmt: Fmt; data: Buffer } {
  try {
    const parsed = parseWav(buf);
    if (parsed.data.length > 0) return parsed;
  } catch {
    // fall through to the scan below
  }
  const at = buf.indexOf("data", 12, "ascii");
  if (at === -1 || buf.toString("ascii", 0, 4) !== "RIFF") throw new Error("not a WAV file");
  const fmtAt = buf.indexOf("fmt ", 12, "ascii");
  const f = fmtAt + 8;
  const fmt: Fmt = {
    numChannels: buf.readUInt16LE(f + 2),
    sampleRate: buf.readUInt32LE(f + 4),
    byteRate: buf.readUInt32LE(f + 8),
    blockAlign: buf.readUInt16LE(f + 12),
    bitsPerSample: buf.readUInt16LE(f + 14),
  };
  const data = buf.subarray(at + 8);
  return { fmt, data: data.subarray(0, data.length - (data.length % fmt.blockAlign)) };
}

/**
 * Fish's expressive model reads the script's tags ([excited], [laugh],
 * <whisper>…</whisper>). If the account can't use it, fall back to s1 with
 * the tags taken out so they aren't read aloud.
 */
const FISH_MODELS = ["drama-3", "s1"] as const;

async function speakFish(cfg: BackendConfig, turn: SitdownLine[]): Promise<{ fmt: Fmt; data: Buffer }> {
  const voice = (turn[0].speaker === "joe" ? cfg.fishJoeVoiceId : cfg.fishGuestVoiceId).trim();
  let lastError = "";
  for (const model of FISH_MODELS) {
    const res = await fetch(FISH_TTS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.fishApiKey.trim()}`,
        model,
      },
      body: JSON.stringify({
        text: turn.map((l) => (model === "s1" ? l.text : l.spoken)).join("\n"),
        format: "wav",
        sample_rate: FISH_SAMPLE_RATE,
        normalize: true,
        ...(voice ? { reference_id: voice } : {}),
      }),
    });
    if (res.ok) return wavPcm(Buffer.from(await res.arrayBuffer()));
    lastError = `Fish Audio ${res.status}: ${(await res.text()).slice(0, 160)}`;
    // Only a rejected model is worth retrying; a bad key or no credit isn't.
    if (res.status === 401 || res.status === 402) break;
  }
  throw new Error(lastError);
}

async function speakOpenAI(cfg: BackendConfig, line: SitdownLine): Promise<Buffer> {
  const base = cfg.openaiBaseUrl.trim().replace(/\/+$/, "");
  const res = await fetch(`${base}/audio/speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.openaiApiKey.trim()}` },
    body: JSON.stringify({
      model: "tts-1",
      voice: line.speaker === "joe" ? "onyx" : "nova",
      input: line.text,
      response_format: "pcm",
    }),
  });
  if (!res.ok) throw new Error(`speech ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function voiceSitdown(lines: SitdownLine[]): Promise<VoicedSitdown> {
  if (!lines.length) throw new Error("The script is empty.");
  const cfg = await loadBackendConfig();
  try {
    if (cfg.fishApiKey.trim()) {
      const clips: { pcm: Buffer; lines: string[] }[] = [];
      let fmt: Fmt | null = null;
      for (const turn of turnsOf(lines)) {
        const clip = await speakFish(cfg, turn);
        fmt = fmt ?? clip.fmt;
        clips.push({ pcm: clip.data, lines: turn.map((l) => l.text) });
      }
      return joinTurns(clips, fmt!);
    }
    if (cfg.activeBackend === "openai-compat" && cfg.openaiBaseUrl.trim() && cfg.openaiApiKey.trim()) {
      const clips: Buffer[] = [];
      for (const line of lines) clips.push(await speakOpenAI(cfg, line));
      return joinClips(clips, OPENAI_PCM);
    }
    const zai = await ZAI.create();
    const clips: Buffer[] = [];
    let fmt: Fmt | null = null;
    for (const line of lines) {
      const res = await zai.audio.tts.create({
        input: line.text.slice(0, 1000),
        voice: line.speaker === "joe" ? "jam" : "tongtong",
        speed: line.speaker === "joe" ? 0.95 : 1,
        response_format: "wav",
        stream: false,
      });
      const parsed = parseWav(Buffer.from(new Uint8Array(await res.arrayBuffer())));
      fmt = fmt ?? parsed.fmt;
      clips.push(parsed.data);
    }
    return joinClips(clips, fmt!);
  } catch (e) {
    throw new Error(
      `Couldn't voice the script (${e instanceof Error ? e.message : String(e)}). Upload an audio file of it instead.`,
    );
  }
}
