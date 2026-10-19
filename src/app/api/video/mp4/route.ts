import { NextRequest, NextResponse } from "next/server";
import { ensureMp4 } from "@/lib/video-service";

export const runtime = "nodejs";
// request_mp4 waits up to 100s before returning a jobId to poll.
export const maxDuration = 120;

/**
 * POST /api/video/mp4 — render the approved P&R page to MP4 (25 credits).
 * Body: { jobId }
 */
export async function POST(req: NextRequest) {
  let body: { jobId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.jobId) {
    return NextResponse.json({ error: "jobId is required." }, { status: 400 });
  }

  try {
    const video = await ensureMp4(body.jobId);
    return NextResponse.json({ ok: true, video });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "MP4 render failed." },
      { status: 502 }
    );
  }
}
