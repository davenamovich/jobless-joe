import { NextRequest, NextResponse } from "next/server";
import { buildAuthUrl } from "@/lib/youtube-service";
import { requestOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/youtube/auth — start the Google consent flow.
 *
 * Returns the URL to open (so the settings dialog can show it, or open a tab).
 * `?redirect=1` sends the browser there instead, which is handy by hand.
 */
export async function GET(req: NextRequest) {
  try {
    const { url, redirectUri } = await buildAuthUrl(requestOrigin(req));
    if (new URL(req.url).searchParams.get("redirect") === "1") {
      return NextResponse.redirect(url, 302);
    }
    return NextResponse.json({ ok: true, url, redirectUri });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not start the YouTube sign-in." },
      { status: 400 }
    );
  }
}
