import { NextRequest, NextResponse } from "next/server";
import { youtubeStatus } from "@/lib/youtube-service";
import { requestOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/youtube/status — are we configured, connected, and to which channel?
 * Also returns the exact redirect URI to paste into the Google Cloud client.
 */
export async function GET(req: NextRequest) {
  try {
    return NextResponse.json({ ok: true, ...(await youtubeStatus(requestOrigin(req))) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not read YouTube status." },
      { status: 500 }
    );
  }
}
