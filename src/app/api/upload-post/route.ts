import { NextRequest, NextResponse } from "next/server";
import { loadBackendConfig } from "@/lib/ai-backend";
import {
  checkSchedule,
  defaultFirstComment,
  getUploadStatus,
  parsePlatforms,
  uploadPostConfig,
  uploadVideo,
  youtubeCopyFor,
} from "@/lib/upload-post";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/upload-post — post a finished MP4 to the socials connected on
 * Upload-Post. Body: { mp4Url, title, description?, platforms?, firstComment?,
 * schedule? }. schedule = { date: "2026-10-21T09:30", timeZone } posts later.
 * firstComment defaults to a link to the course URL; send "" for none.
 * Returns { requestId, status, results } — poll GET with the requestId.
 */
export async function POST(req: NextRequest) {
  let body: {
    mp4Url?: string;
    title?: string;
    description?: string;
    platforms?: string[] | string;
    firstComment?: string;
    /** When given, YouTube gets the song's SEO title, description and tags. */
    episodeId?: string;
    /** YouTube copy for videos without an episode (e.g. the Morning Show). */
    youtube?: { title?: unknown; description?: unknown; tags?: unknown };
    /** Post later: local wall-clock time in the browser's time zone. */
    schedule?: { date?: unknown; timeZone?: unknown };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const mp4Url = String(body.mp4Url ?? "").trim();
  if (!/^https:\/\//i.test(mp4Url)) {
    return NextResponse.json({ error: "mp4Url must be a public https URL." }, { status: 400 });
  }
  let schedule;
  if (body.schedule) {
    const checked = checkSchedule(String(body.schedule.date ?? ""), String(body.schedule.timeZone ?? ""));
    if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
    schedule = checked.schedule;
  }
  try {
    const backend = await loadBackendConfig();
    const cfg = uploadPostConfig(backend);
    // A per-request platform list may only narrow the saved one.
    if (body.platforms) {
      const picked = parsePlatforms(body.platforms).filter((p) => cfg.platforms.includes(p));
      if (!picked.length) return NextResponse.json({ error: "None of those platforms are enabled." }, { status: 400 });
      cfg.platforms = picked;
    }
    const result = await uploadVideo(cfg, {
      url: mp4Url,
      title: String(body.title ?? ""),
      description: body.description ? String(body.description).slice(0, 2000) : undefined,
      firstComment:
        body.firstComment === undefined || body.firstComment === null
          ? defaultFirstComment(backend.courseUrl)
          : String(body.firstComment).slice(0, 2000),
      youtube: body.episodeId ? await youtubeCopyFor(String(body.episodeId)) : youtubeFromBody(body.youtube),
      schedule,
    });
    return NextResponse.json({ ok: true, ...result, platforms: cfg.platforms });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

function youtubeFromBody(
  y: { title?: unknown; description?: unknown; tags?: unknown } | undefined,
): { title: string; description: string; tags: string[] } | undefined {
  const title = String(y?.title ?? "").trim().slice(0, 100);
  if (!y || !title) return undefined;
  return {
    title,
    description: String(y.description ?? "").slice(0, 5000),
    tags: (Array.isArray(y.tags) ? y.tags : []).map((t) => String(t).slice(0, 60)).slice(0, 15),
  };
}

/** GET /api/upload-post?requestId=... — poll an upload. */
export async function GET(req: NextRequest) {
  const requestId = new URL(req.url).searchParams.get("requestId")?.trim();
  if (!requestId) return NextResponse.json({ error: "requestId is required." }, { status: 400 });
  try {
    const cfg = await loadBackendConfig();
    if (!cfg.upApiKey.trim()) throw new Error("Upload-Post isn't configured.");
    return NextResponse.json({ ok: true, ...(await getUploadStatus(cfg.upApiKey.trim(), requestId)) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
