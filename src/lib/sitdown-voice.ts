/**
 * Voices a sit-down script when no audio file was uploaded: each line is
 * spoken separately (Joe in his voice, the guest in another), then joined
 * into one WAV with a short pause between lines. Because every line is its
 * own clip, the page gets each caption's exact start time.
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

async function speakFish(cfg: BackendConfig, line: SitdownLine): Promise<{ fmt: Fmt; data: Buffer }> {
  const voice = (line.speaker === "joe" ? cfg.fishJoeVoiceId : cfg.fishGuestVoiceId).trim();
  const res = await fetch(FISH_TTS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.fishApiKey.trim()}`,
      model: "s1",
    },
    body: JSON.stringify({
      text: line.text,
      format: "wav",
      sample_rate: FISH_SAMPLE_RATE,
      normalize: true,
      ...(voice ? { reference_id: voice } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Fish Audio ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return wavPcm(Buffer.from(await res.arrayBuffer()));
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
      const clips: Buffer[] = [];
      let fmt: Fmt | null = null;
      for (const line of lines) {
        const clip = await speakFish(cfg, line);
        fmt = fmt ?? clip.fmt;
        clips.push(clip.data);
      }
      return joinClips(clips, fmt!);
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
