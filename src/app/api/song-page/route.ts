import { NextRequest, NextResponse } from "next/server";
import { publishFiles } from "@/lib/herenow";
import { buildSongPageHtml, songPageStickmanEnabled } from "@/lib/song-page";
import { downloadName, loadSongArtifacts } from "@/lib/song-artifacts";

export const runtime = "nodejs";
export const maxDuration = 90;

/**
 * GET /api/song-page?episodeId=... — preview the standalone page HTML with the
 * audio served from this app. Useful before publishing anywhere.
 */
export async function GET(req: NextRequest) {
  const episodeId = new URL(req.url).searchParams.get("episodeId");
  if (!episodeId) {
    return NextResponse.json(
      { error: "episodeId query parameter is required." },
      { status: 400 }
    );
  }

  try {
    const song = await loadSongArtifacts(episodeId);
    const html = buildSongPageHtml({
      title: song.title,
      episodeLabel: song.episodeLabel,
      episodeDuration: song.duration,
      lyrics: song.lyrics,
      musicalDirection: song.musicalDirection,
      audioFile: `/audio/${encodeURIComponent(song.fileName)}`,
      downloadName: downloadName(song.title, song.format),
      stickman: songPageStickmanEnabled(),
    });
    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 404 });
  }
}

/**
 * POST /api/song-page — publish the song page + MP3 to here.now.
 * Body: { episodeId: string }
 */
export async function POST(req: NextRequest) {
  let body: { episodeId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.episodeId) {
    return NextResponse.json(
      { error: "episodeId is required." },
      { status: 400 }
    );
  }

  try {
    const song = await loadSongArtifacts(body.episodeId);
    const audioPath = `song.${song.format}`;

    const html = buildSongPageHtml({
      title: song.title,
      episodeLabel: song.episodeLabel,
      episodeDuration: song.duration,
      lyrics: song.lyrics,
      musicalDirection: song.musicalDirection,
      audioFile: audioPath,
      downloadName: downloadName(song.title, song.format),
      durationSec: 0,
      temporary: !process.env.HERENOW_API_KEY,
      stickman: songPageStickmanEnabled(),
    });

    const result = await publishFiles(
      [
        {
          path: "index.html",
          buffer: Buffer.from(html, "utf8"),
          contentType: "text/html; charset=utf-8",
        },
        {
          path: audioPath,
          buffer: song.buffer,
          contentType: song.contentType,
        },
      ],
      {
        apiKey: process.env.HERENOW_API_KEY?.trim() || undefined,
        ttlSeconds: 24 * 3600,
      }
    );

    const base = result.url.replace(/\/$/, "");
    return NextResponse.json({
      ok: true,
      url: base,
      claimUrl: result.claimUrl,
      expiresAt: result.expiresAt,
      ttlSeconds: result.ttlSeconds,
      audioUrl: `${base}/${audioPath}`,
    });
  } catch (e) {
    console.error("here.now publish failed", e);
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
