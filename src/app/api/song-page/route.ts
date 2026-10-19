import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { publishFiles } from "@/lib/herenow";
import { buildSongPageHtml, songPageStickmanEnabled } from "@/lib/song-page";
import type { SongOutput } from "@/lib/joe-prompts";

export const runtime = "nodejs";
export const maxDuration = 90;

const AUDIO_DIR = path.join(process.cwd(), "public", "audio");

interface SongArtifacts {
  title: string;
  episodeLabel: string;
  duration: string;
  lyrics: string;
  musicalDirection: string;
  fileName: string;
  format: string;
  contentType: string;
  buffer: Buffer;
}

/** Load the episode, its newest audio track, and the MP3 bytes. */
async function loadSongArtifacts(episodeId: string): Promise<SongArtifacts> {
  const episode = await db.episode.findUnique({ where: { id: episodeId } });
  if (!episode) throw new Error("Episode not found.");

  const track = await db.audioTrack.findFirst({
    where: { episodeId },
    orderBy: { createdAt: "desc" },
  });
  if (!track) {
    throw new Error("This song is still rendering. Try again once it's ready.");
  }

  const fileName = path.basename(track.filePath);
  const fullPath = path.join(AUDIO_DIR, fileName);
  if (path.dirname(fullPath) !== AUDIO_DIR) {
    throw new Error("Invalid audio path.");
  }

  let buffer: Buffer;
  try {
    buffer = await fs.readFile(fullPath);
  } catch {
    throw new Error("Audio file is missing from disk. Re-render the song.");
  }

  let output: Partial<SongOutput> = {};
  try {
    output = JSON.parse(episode.output) as SongOutput;
  } catch {
    // Keep the fallbacks below.
  }

  const ext = path.extname(fileName).toLowerCase();
  const contentType =
    ext === ".wav"
      ? "audio/wav"
      : ext === ".flac"
        ? "audio/flac"
        : "audio/mpeg";

  return {
    title: output.episodeTitle || episode.title || "Untitled Song",
    episodeLabel: episode.episodeLabel || "Jobless Joe",
    duration: output.duration || episode.duration,
    lyrics: output.lyrics || "",
    musicalDirection: output.musicalDirection || "",
    fileName,
    format: ext.replace(".", "") || "mp3",
    contentType,
    buffer,
  };
}

function downloadName(title: string, format: string): string {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "jobless-joe-song";
  return `${slug}.${format}`;
}

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
