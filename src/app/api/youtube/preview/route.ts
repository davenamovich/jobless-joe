import { NextRequest, NextResponse } from "next/server";
import { previewYouTube } from "@/lib/youtube-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Reading the pack page for the caption timeline is a network round trip.
export const maxDuration = 60;

/**
 * GET /api/youtube/preview?jobId=… — exactly what would be uploaded.
 * Title, description, tags and the SRT, with nothing sent to YouTube.
 */
export async function GET(req: NextRequest) {
  const jobId = new URL(req.url).searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: "jobId is required." }, { status: 400 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await previewYouTube(jobId)) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not build the preview." },
      { status: 400 }
    );
  }
}
