import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { loadBackendConfig } from "@/lib/ai-backend";
import {
  ensureVideoJob,
  refreshVideoJob,
  toView,
} from "@/lib/video-service";

export const runtime = "nodejs";
// create_video_pack and then request_mp4 each hold the call open up to 100s
// before handing back a job to poll.
export const maxDuration = 240;

/** GET /api/video?episodeId=… — latest video for an episode (cheap, no charge). */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const jobId = url.searchParams.get("jobId");
  const episodeId = url.searchParams.get("episodeId");

  try {
    const cfg = await loadBackendConfig();
    if (jobId) {
      return NextResponse.json({
        ok: true,
        video: await refreshVideoJob(jobId),
        courseUrl: cfg.courseUrl,
      });
    }
    if (!episodeId) {
      return NextResponse.json(
        { error: "episodeId or jobId is required." },
        { status: 400 }
      );
    }
    const row = await db.videoJob.findFirst({
      where: { episodeId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({
      ok: true,
      video: row ? toView(row) : null,
      courseUrl: cfg.courseUrl,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not load the video." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/video — one click: make (or resume) Joe's video page and its MP4.
 * Body: { episodeId, force? }
 */
export async function POST(req: NextRequest) {
  let body: { episodeId?: string; force?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.episodeId) {
    return NextResponse.json({ error: "episodeId is required." }, { status: 400 });
  }

  try {
    const video = await ensureVideoJob(body.episodeId, { force: !!body.force });
    const cfg = await loadBackendConfig();
    return NextResponse.json({ ok: true, video, courseUrl: cfg.courseUrl });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Video generation failed." },
      { status: 502 }
    );
  }
}
