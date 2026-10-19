import { NextRequest, NextResponse } from "next/server";
import { publishToYouTube } from "@/lib/youtube-service";
import { loadBackendConfig } from "@/lib/ai-backend";

export const runtime = "nodejs";
// Downloading the render and pushing it to YouTube can take minutes.
export const maxDuration = 300;

/**
 * POST /api/youtube/publish — upload an episode's finished video to YouTube.
 *
 * Body: { jobId, privacy?: "unlisted" | "public" | "private", captions?: boolean }
 *
 * Requires a rendered MP4: the caption track is timed against that render, so
 * there is nothing to upload before it exists (POST /api/video/mp4 first).
 */
export async function POST(req: NextRequest) {
  let body: { jobId?: string; privacy?: string; captions?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.jobId) {
    return NextResponse.json({ error: "jobId is required." }, { status: 400 });
  }

  try {
    const result = await publishToYouTube(body.jobId, {
      privacy: body.privacy,
      captions: body.captions,
    });
    const cfg = await loadBackendConfig();
    return NextResponse.json({
      ok: true,
      result,
      defaultPrivacy: cfg.ytPrivacy,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "YouTube upload failed." },
      { status: 502 }
    );
  }
}
