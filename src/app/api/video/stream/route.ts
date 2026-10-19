import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toView } from "@/lib/video-service";
import { buildJoeTvHtml } from "@/lib/joe-tv";
import type { SongOutput } from "@/lib/joe-prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/video/stream — Joe TV as a streamable URL.
 *
 * Query:
 *   ?episodeId=…   stream an episode's newest video pack
 *   ?jobId=…       stream one specific pack
 *   (neither)      the newest pack in the studio
 *   &format=page   autoplay + loop HTML (default) — point a browser source here
 *   &format=mp4    302 to the rendered MP4 file, for a media source / VLC
 *   &format=json   the video job as JSON
 *   &badge=0       drop the corner wordmark
 *   &seconds=5     fallback frame interval when the pack has no MP4 playable… (slideshow only)
 *
 * The page prefers our own /audio/… file over the provider URL, so a stream
 * keeps working after an anonymous here.now link expires.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const jobId = url.searchParams.get("jobId");
  const episodeId = url.searchParams.get("episodeId");
  const format = (url.searchParams.get("format") ?? "page").toLowerCase();
  const badge = url.searchParams.get("badge") !== "0";
  const secondsParam = Number(url.searchParams.get("seconds"));
  const frameSeconds =
    Number.isFinite(secondsParam) && secondsParam > 0 ? secondsParam : 5;

  if (!["page", "mp4", "json"].includes(format)) {
    return NextResponse.json(
      { error: 'format must be "page", "mp4" or "json".' },
      { status: 400 }
    );
  }

  let row = jobId
    ? await db.videoJob.findUnique({ where: { id: jobId } })
    : episodeId
      ? await db.videoJob.findFirst({
          where: { episodeId },
          orderBy: { createdAt: "desc" },
        })
      : await db.videoJob.findFirst({ orderBy: { createdAt: "desc" } });

  if (!row) {
    return NextResponse.json(
      {
        error: episodeId
          ? "That episode has no video pack yet. Make one with POST /api/video."
          : "No video packs exist yet. Make one with POST /api/video.",
      },
      { status: 404 }
    );
  }

  // A stale render can be sitting on a jobId; refreshing is free if it lands
  // the MP4 without another request_mp4 charge.
  const job = toView(row);

  if (format === "json") {
    return NextResponse.json({ ok: true, video: job });
  }

  if (format === "mp4") {
    // Prefer our own mirror: same origin, and it survives the ~24h P&R link.
    const file = job.localMp4 || job.mp4Url;
    if (!file) {
      return NextResponse.json(
        {
          error:
            "No MP4 for this episode yet. Make one with POST /api/video (it renders the MP4 too), or use format=page for the slideshow stream.",
          video: job,
        },
        { status: 409 }
      );
    }
    // A mirrored file is a server-relative path, which redirect() needs absolute.
    return NextResponse.redirect(new URL(file, req.url), 302);
  }

  // Prefer the local file: same origin, no 24h expiry.
  const [track, episode] = await Promise.all([
    db.audioTrack.findFirst({
      where: { episodeId: row.episodeId },
      orderBy: { createdAt: "desc" },
    }),
    db.episode.findUnique({ where: { id: row.episodeId } }),
  ]);

  let title = episode?.title ?? "";
  if (!title && episode?.output) {
    try {
      title = (JSON.parse(episode.output) as SongOutput).episodeTitle ?? "";
    } catch {
      // Keep the fallback title.
    }
  }

  const html = buildJoeTvHtml({
    title,
    mp4Url: job.mp4Url,
    frames: job.frames,
    audioUrl: track?.filePath || job.audioUrl,
    badge,
    frameSeconds,
  });

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
