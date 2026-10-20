/**
 * Publish a Sit-down with Joe page to here.now: the video page plus its
 * audio, as a temporary (24h) preview the MP4 recorder can film.
 */

import { publishFiles } from "@/lib/herenow";
import { buildSitdownVideoHtml, parseSitdownScript, type SitdownScript } from "@/lib/sitdown-video";
import { voiceSitdown } from "@/lib/sitdown-voice";

export const SITDOWN_AUDIO_TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  webm: "audio/webm",
};

export async function publishSitdownPage(args: {
  title: string;
  script: SitdownScript;
  audio: Buffer;
  format: string;
  durationSec: number;
  startsMs?: number[];
}): Promise<string> {
  const audioFile = `talk.${args.format}`;
  const html = buildSitdownVideoHtml({
    title: args.title,
    script: args.script,
    audioFile,
    durationSec: args.durationSec,
    startsMs: args.startsMs,
  });
  const result = await publishFiles(
    [
      { path: "index.html", buffer: Buffer.from(html, "utf8"), contentType: "text/html; charset=utf-8" },
      { path: audioFile, buffer: args.audio, contentType: SITDOWN_AUDIO_TYPES[args.format] },
    ],
    { apiKey: process.env.HERENOW_API_KEY?.trim() || undefined, ttlSeconds: 24 * 3600 },
  );
  return result.url.replace(/\/$/, "");
}

/** Voice a script (no audio file) and publish its page. Returns the page URL. */
export async function publishVoicedSitdown(title: string, scriptText: string): Promise<string> {
  const script = parseSitdownScript(scriptText.slice(0, 20_000));
  if (!script.lines.length) throw new Error("The script is empty.");
  const voiced = await voiceSitdown(script.lines);
  return publishSitdownPage({
    title,
    script,
    audio: voiced.wav,
    format: "wav",
    durationSec: voiced.durationSec,
    startsMs: voiced.startsMs,
  });
}
