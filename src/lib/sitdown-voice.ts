/**
 * Voices a sit-down script when no audio file was uploaded: each line is
 * spoken separately (Joe in his voice, the guest in another), then joined
 * into one WAV with a short pause between lines. Because every line is its
 * own clip, the page gets each caption's exact start time.
 *
 * Engine: the OpenAI-compatible backend's /audio/speech when that backend
 * is active, else Z.ai TTS.
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
