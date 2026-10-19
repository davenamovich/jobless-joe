import { NextRequest, NextResponse } from "next/server";
import { publishFiles } from "@/lib/herenow";
import { audioDurationSec, loadSongArtifacts } from "@/lib/song-artifacts";
import { buildStickmanVideoHtml } from "@/lib/stickman-video";

export const runtime = "nodejs";
export const maxDuration = 90;

/** Song length: read from the audio, else the episode's "60s"-style label, else a minute. */
function durationFor(song: Awaited<ReturnType<typeof loadSongArtifacts>>): number {
  const measured = audioDurationSec(song.buffer, song.format);
  if (measured && measured > 1) return measured;
  const label = /(\d{2,3})\s*s/i.exec(song.duration || "");
  return label ? Number(label[1]) : 60;
}

/**
 * GET /api/stickman-video?episodeId=... — preview the video page with the
 * audio served from this app.
 */
export async function GET(req: NextRequest) {
  const episodeId = new URL(req.url).searchParams.get("episodeId");
  if (!episodeId) {
    return NextResponse.json({ error: "episodeId query parameter is required." }, { status: 400 });
  }
  try {
    const song = await loadSongArtifacts(episodeId);
    const html = buildStickmanVideoHtml({
      title: song.title,
      episodeLabel: song.episodeLabel,
      lyrics: song.lyrics,
      audioFile: `/audio/${encodeURIComponent(song.fileName)}`,
      durationSec: durationFor(song),
    });
    return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 404 });
  }
}

/**
 * POST /api/stickman-video — publish the stickman video page + audio to
 * here.now as a temp page. Body: { episodeId }. The returned url is what
 * request_mp4 films if the human likes it.
 */
export async function POST(req: NextRequest) {
  let body: { episodeId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.episodeId) {
    return NextResponse.json({ error: "episodeId is required." }, { status: 400 });
  }

  try {
    const song = await loadSongArtifacts(body.episodeId);
    const audioPath = `song.${song.format}`;
    const html = buildStickmanVideoHtml({
      title: song.title,
      episodeLabel: song.episodeLabel,
      lyrics: song.lyrics,
      audioFile: audioPath,
      durationSec: durationFor(song),
    });

    const result = await publishFiles(
      [
        { path: "index.html", buffer: Buffer.from(html, "utf8"), contentType: "text/html; charset=utf-8" },
        { path: audioPath, buffer: song.buffer, contentType: song.contentType },
      ],
      { apiKey: process.env.HERENOW_API_KEY?.trim() || undefined, ttlSeconds: 24 * 3600 },
    );

    return NextResponse.json({
      ok: true,
      url: result.url.replace(/\/$/, ""),
      title: song.title,
      claimUrl: result.claimUrl,
      ttlSeconds: result.ttlSeconds,
    });
  } catch (e) {
    console.error("stickman video publish failed", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
