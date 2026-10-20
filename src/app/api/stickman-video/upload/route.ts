import { NextRequest, NextResponse } from "next/server";
import { publishFiles } from "@/lib/herenow";
import { audioDurationSec } from "@/lib/song-artifacts";
import { planSongScenes } from "@/lib/stickman-scene-llm";
import { buildStickmanVideoHtml } from "@/lib/stickman-video";
import { UPLOAD_AUDIO_TYPES, songUploadText, uploadAudioFormat, uploadProblem } from "@/lib/song-upload";

export const runtime = "nodejs";
export const maxDuration = 90;

/**
 * POST /api/stickman-video/upload — any song (MP3 or WAV) acted out by
 * stickman Joe. Multipart form: audio (file), title, lyrics (both optional).
 * Returns the page's html (audio at "song.<ext>", for a local preview with
 * the file the browser already has) and, when here.now took it, the temp
 * page url that "Make MP4" (/api/stickman-video/mp4) films.
 */
export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Send the song as a form upload." }, { status: 400 });
  }
  const upload = form.get("audio");
  const file = upload instanceof File && upload.size > 0 ? upload : null;
  if (!file) return NextResponse.json({ error: "Drop in an MP3 or WAV." }, { status: 400 });

  const format = uploadAudioFormat(file.name, file.type);
  if (!format) return NextResponse.json({ error: "Use an MP3 or WAV file." }, { status: 400 });
  const tooBig = uploadProblem(file.size, null);
  if (tooBig) return NextResponse.json({ error: tooBig }, { status: 413 });

  const audio = Buffer.from(await file.arrayBuffer());
  const measured = audioDurationSec(audio, format);
  const tooLong = uploadProblem(audio.length, measured);
  if (tooLong) return NextResponse.json({ error: tooLong }, { status: 413 });

  const { title, lyrics, fromTitle } = songUploadText({
    title: String(form.get("title") ?? ""),
    lyrics: String(form.get("lyrics") ?? ""),
    fileName: file.name,
  });
  const audioPath = `song.${format}`;

  try {
    const { scenes, source } = await planSongScenes(lyrics, title);
    const html = buildStickmanVideoHtml({
      scenes,
      title,
      episodeLabel: "Joe acts it out",
      lyrics,
      audioFile: audioPath,
      // The page reads the real length once the audio loads.
      durationSec: measured && measured > 1 ? measured : 60,
    });
    const meta = { title, audioFile: audioPath, scenes: scenes.length, source, fromTitle, durationSec: measured };

    try {
      const result = await publishFiles(
        [
          { path: "index.html", buffer: Buffer.from(html, "utf8"), contentType: "text/html; charset=utf-8" },
          { path: audioPath, buffer: audio, contentType: UPLOAD_AUDIO_TYPES[format] },
        ],
        { apiKey: process.env.HERENOW_API_KEY?.trim() || undefined, ttlSeconds: 24 * 3600 },
      );
      return NextResponse.json({ ok: true, ...meta, html, url: result.url.replace(/\/$/, ""), ttlSeconds: result.ttlSeconds });
    } catch (e) {
      // The local preview still works; only filming needs the here.now page.
      console.error("uploaded stickman video publish failed", e);
      return NextResponse.json({ ok: true, ...meta, html, url: null, publishError: e instanceof Error ? e.message : String(e) });
    }
  } catch (e) {
    console.error("uploaded stickman video failed", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
