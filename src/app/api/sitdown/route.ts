import { NextRequest, NextResponse } from "next/server";
import { publishFiles } from "@/lib/herenow";
import { audioDurationSec } from "@/lib/song-artifacts";
import { buildSitdownVideoHtml, estimateSpeechSec, parseSitdownScript } from "@/lib/sitdown-video";
import { voiceSitdown } from "@/lib/sitdown-voice";

export const runtime = "nodejs";
// Voicing a long script line by line can take a while.
export const maxDuration = 180;

const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
const AUDIO_TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  webm: "audio/webm",
};

function audioFormat(file: File): string | null {
  const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase();
  if (ext && AUDIO_TYPES[ext]) return ext;
  const t = file.type;
  if (/mpeg|mp3/.test(t)) return "mp3";
  if (/wav/.test(t)) return "wav";
  if (/mp4|m4a/.test(t)) return "m4a";
  if (/ogg/.test(t)) return "ogg";
  if (/webm/.test(t)) return "webm";
  return null;
}

/**
 * POST /api/sitdown — a "sit-down with Joe" video page, published to
 * here.now as a temp preview (film it with /api/stickman-video/mp4).
 * Multipart form: title, script (optional), audio (optional file). At least
 * one of script or audio; a script with no audio is voiced for you.
 */
export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Send the sit-down as a form upload." }, { status: 400 });
  }
  const title = String(form.get("title") ?? "").trim().slice(0, 120) || "A Sit-Down with Joe";
  const script = parseSitdownScript(String(form.get("script") ?? "").slice(0, 20_000));
  const upload = form.get("audio");
  const file = upload instanceof File && upload.size > 0 ? upload : null;

  if (!file && !script.lines.length) {
    return NextResponse.json({ error: "Add a script, an audio file, or both." }, { status: 400 });
  }

  try {
    let audio: Buffer;
    let format: string;
    let durationSec: number;
    let startsMs: number[] | undefined;

    if (file) {
      if (file.size > MAX_AUDIO_BYTES) {
        return NextResponse.json({ error: "Audio files can be up to 50 MB." }, { status: 413 });
      }
      const fmt = audioFormat(file);
      if (!fmt) {
        return NextResponse.json({ error: "Use an MP3, WAV, M4A, AAC, OGG or WebM audio file." }, { status: 400 });
      }
      format = fmt;
      audio = Buffer.from(await file.arrayBuffer());
      durationSec = audioDurationSec(audio, format) ?? (script.lines.length ? estimateSpeechSec(script) : 60);
    } else {
      const voiced = await voiceSitdown(script.lines);
      audio = voiced.wav;
      format = "wav";
      durationSec = voiced.durationSec;
      startsMs = voiced.startsMs;
    }

    const audioFile = `talk.${format}`;
    const html = buildSitdownVideoHtml({ title, script, audioFile, durationSec, startsMs });
    const result = await publishFiles(
      [
        { path: "index.html", buffer: Buffer.from(html, "utf8"), contentType: "text/html; charset=utf-8" },
        { path: audioFile, buffer: audio, contentType: AUDIO_TYPES[format] },
      ],
      { apiKey: process.env.HERENOW_API_KEY?.trim() || undefined, ttlSeconds: 24 * 3600 },
    );

    return NextResponse.json({
      ok: true,
      url: result.url.replace(/\/$/, ""),
      title,
      guest: script.guest,
      lines: script.lines.length,
      voiced: !file,
    });
  } catch (e) {
    console.error("sit-down publish failed", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
