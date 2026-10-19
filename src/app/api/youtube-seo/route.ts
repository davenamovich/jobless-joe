import { NextRequest, NextResponse } from "next/server";
import { getYouTubeSeo, peekYouTubeSeo, saveYouTubeSeo, youtubeUploadCopy } from "@/lib/youtube-seo";

export const runtime = "nodejs";
export const maxDuration = 90;

function fail(e: unknown, status = 502) {
  return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status });
}

/** GET /api/youtube-seo?episodeId=… — the saved copy (no model call), or { seo: null }. */
export async function GET(req: NextRequest) {
  const episodeId = new URL(req.url).searchParams.get("episodeId")?.trim();
  if (!episodeId) return fail("episodeId is required.", 400);
  try {
    if (!(await peekYouTubeSeo(episodeId))) return NextResponse.json({ ok: true, seo: null });
    return NextResponse.json({ ok: true, ...(await youtubeUploadCopy(episodeId)) });
  } catch (e) {
    return fail(e, 404);
  }
}

/** POST /api/youtube-seo { episodeId, regenerate? } — write (or rewrite) the copy. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { episodeId?: string; regenerate?: boolean };
  if (!body.episodeId) return fail("episodeId is required.", 400);
  try {
    await getYouTubeSeo(body.episodeId, { regenerate: !!body.regenerate });
    return NextResponse.json({ ok: true, ...(await youtubeUploadCopy(body.episodeId)) });
  } catch (e) {
    return fail(e);
  }
}

/** PUT /api/youtube-seo { episodeId, title?, hook?, summary?, tags?, hashtags? } — save edits. */
export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    episodeId?: string;
    title?: string;
    hook?: string;
    summary?: string;
    tags?: string[];
    hashtags?: string[];
  };
  if (!body.episodeId) return fail("episodeId is required.", 400);
  try {
    const { episodeId, ...edits } = body;
    await saveYouTubeSeo(episodeId, edits);
    return NextResponse.json({ ok: true, ...(await youtubeUploadCopy(episodeId)) });
  } catch (e) {
    return fail(e);
  }
}
