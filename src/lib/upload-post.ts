/**
 * Upload-Post client (https://docs.upload-post.com).
 *
 * One call posts a finished MP4 to every social account connected to an
 * Upload-Post profile — TikTok, Instagram Reels, YouTube Shorts, X, etc.
 *
 *   POST /api/upload                         multipart: user, platform[], video (URL ok), title
 *   GET  /api/uploadposts/status?request_id  poll an async upload
 *
 * We always send async_upload=true with our own request_id: the API fetches
 * the video URL in the background, and a retry never double-posts.
 */

import { randomUUID } from "node:crypto";
import { loadBackendConfig, type BackendConfig } from "@/lib/ai-backend";
import { youtubeUploadCopy } from "@/lib/youtube-seo";

const UP_BASE = "https://api.upload-post.com/api";

export const UP_PLATFORMS = [
  "tiktok",
  "instagram",
  "youtube",
  "facebook",
  "x",
  "threads",
  "linkedin",
  "bluesky",
  "pinterest",
] as const;

export interface UploadPostConfig {
  apiKey: string;
  user: string;
  platforms: string[];
}

export interface PlatformResult {
  platform: string;
  success?: boolean;
  status?: string;
  message?: string;
  url?: string;
  skipped?: boolean;
}

export interface UploadPostResult {
  requestId: string;
  /** pending | queued | processing | in_progress | completed | failed */
  status: string;
  results: PlatformResult[];
}

/** "TikTok, instagram  youtube" → ["tiktok","instagram","youtube"], known values only, no dupes. */
export function parsePlatforms(raw: string | string[]): string[] {
  const list = Array.isArray(raw) ? raw : String(raw ?? "").split(/[\s,]+/);
  const known = new Set<string>(UP_PLATFORMS);
  return [...new Set(list.map((p) => p.trim().toLowerCase()).filter((p) => known.has(p)))];
}

/** Upload-Post settings from the backend config, or an error saying what's missing. */
export function uploadPostConfig(cfg: BackendConfig): UploadPostConfig {
  if (!cfg.upApiKey.trim()) throw new Error("Add your Upload-Post API key in Backend settings to publish.");
  if (!cfg.upUser.trim()) throw new Error("Set the Upload-Post profile (user) in Backend settings to publish.");
  const platforms = parsePlatforms(cfg.upPlatforms);
  if (!platforms.length) throw new Error("Pick at least one Upload-Post platform in Backend settings.");
  return { apiKey: cfg.upApiKey.trim(), user: cfg.upUser.trim(), platforms };
}

/** Title used on every platform: the song title plus a couple of tags, under YouTube's 100 chars. */
export function postTitle(title: string): string {
  const tags = " #joblessjoe #shorts";
  const base = title.trim() || "Jobless Joe";
  return (base.length + tags.length <= 100 ? base + tags : base.slice(0, 100)).trim();
}

function authHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `Apikey ${apiKey}` };
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || json.success === false) {
    const msg = String(json.message || json.error || `Upload-Post returned ${res.status}.`);
    throw new Error(res.status === 401 ? "Upload-Post rejected the API key." : msg.slice(0, 300));
  }
  return json;
}

/** Results come back as an array (status) or a { platform: {...} } map (sync upload). */
export function normalizeResults(raw: unknown): PlatformResult[] {
  if (Array.isArray(raw)) {
    return raw.map((r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      return {
        platform: String(o.platform ?? ""),
        success: typeof o.success === "boolean" ? o.success : undefined,
        status: o.status ? String(o.status) : undefined,
        message: o.message ? String(o.message) : o.error ? String(o.error) : undefined,
        url: (o.url ?? o.post_url) ? String(o.url ?? o.post_url) : undefined,
        skipped: o.skipped === true || undefined,
      };
    });
  }
  if (raw && typeof raw === "object") {
    return normalizeResults(
      Object.entries(raw as Record<string, unknown>).map(([platform, v]) => ({ platform, ...(v as object) })),
    );
  }
  return [];
}

/**
 * Default first comment: a link back to Joe's site. Song pages expire after
 * a day, so the comment points at the permanent course URL instead.
 */
export function defaultFirstComment(courseUrl: string): string {
  const url = courseUrl.trim();
  return url ? `🎤 More Jobless Joe songs and memes: ${url}` : "";
}

/**
 * Post a public MP4 URL to every configured platform.
 *
 * firstComment is sent as Upload-Post's `first_comment` — posted under the
 * video on Instagram, Facebook, Threads, Bluesky, X, YouTube, LinkedIn and
 * TikTok (X strips URLs from it; TikTok needs the "comments" capability).
 */
export async function uploadVideo(
  cfg: UploadPostConfig,
  video: {
    url: string;
    title: string;
    description?: string;
    firstComment?: string;
    /** SEO copy for YouTube only (youtube-seo.ts); other platforms keep `title`. */
    youtube?: { title: string; description: string; tags: string[]; language?: string };
  },
): Promise<UploadPostResult> {
  const requestId = randomUUID();
  const form = new FormData();
  form.append("user", cfg.user);
  for (const p of cfg.platforms) form.append("platform[]", p);
  form.append("video", video.url);
  form.append("title", postTitle(video.title));
  if (video.description) form.append("description", video.description);
  if (video.youtube && cfg.platforms.includes("youtube")) {
    form.append("youtube_title", video.youtube.title.slice(0, 100));
    form.append("youtube_description", video.youtube.description.slice(0, 5000));
    for (const tag of video.youtube.tags) form.append("tags[]", tag);
    form.append("categoryId", "10"); // Music
    if (video.youtube.language) form.append("defaultLanguage", video.youtube.language);
  }
  const firstComment = video.firstComment?.trim();
  if (firstComment) form.append("first_comment", firstComment);
  form.append("async_upload", "true");
  form.append("request_id", requestId);

  const res = await fetch(`${UP_BASE}/upload`, {
    method: "POST",
    headers: { ...authHeaders(cfg.apiKey), "Idempotency-Key": requestId },
    body: form,
    signal: AbortSignal.timeout(90_000),
  });
  const json = await readJson(res);
  const results = normalizeResults(json.results);
  return {
    requestId: String(json.request_id || requestId),
    status: results.length ? "completed" : "queued",
    results,
  };
}

/** Poll an async upload. */
export async function getUploadStatus(apiKey: string, requestId: string): Promise<UploadPostResult> {
  const res = await fetch(`${UP_BASE}/uploadposts/status?request_id=${encodeURIComponent(requestId)}`, {
    headers: authHeaders(apiKey),
    signal: AbortSignal.timeout(30_000),
  });
  const json = await readJson(res);
  return {
    requestId,
    status: String(json.status || "pending"),
    results: normalizeResults(json.results),
  };
}

/**
 * Post an MP4 with the saved settings and wait (up to giveUpMs) for
 * per-platform results. Shared by Telegram's 📤 button and autopilot.
 * firstComment defaults to a link to the course URL; pass "" for none.
 */
export async function postMp4ToSocials(
  mp4Url: string,
  title: string,
  {
    pollMs = 15_000,
    giveUpMs = 5 * 60_000,
    firstComment,
    episodeId,
    youtube,
  }: {
    pollMs?: number;
    giveUpMs?: number;
    firstComment?: string;
    episodeId?: string;
    /** YouTube copy for a video without an episode (e.g. the Morning Show). */
    youtube?: { title: string; description: string; tags: string[] };
  } = {},
): Promise<{ requestId: string; summary: string }> {
  const backend = await loadBackendConfig();
  const cfg = uploadPostConfig(backend);
  let result = await uploadVideo(cfg, {
    url: mp4Url,
    title,
    firstComment: firstComment ?? defaultFirstComment(backend.courseUrl),
    youtube: episodeId ? await youtubeCopyFor(episodeId) : youtube,
  });
  const deadline = Date.now() + giveUpMs;
  while (!["completed", "failed"].includes(result.status) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollMs));
    result = await getUploadStatus(cfg.apiKey, result.requestId).catch(() => result);
  }
  const summary = result.results.length
    ? describeResults(result.results)
    : `queued on ${cfg.platforms.join(", ")} — still processing`;
  return { requestId: result.requestId, summary };
}

/** The song's YouTube SEO copy, or undefined (never blocks a post). */
export async function youtubeCopyFor(
  episodeId: string,
): Promise<{ title: string; description: string; tags: string[]; language?: string } | undefined> {
  try {
    const copy = await youtubeUploadCopy(episodeId);
    return { title: copy.title, description: copy.description, tags: copy.tags, language: copy.language };
  } catch (e) {
    console.warn("[upload-post] no YouTube SEO copy, posting with the plain title", e);
    return undefined;
  }
}

/** One line per platform, e.g. "✅ tiktok · ⏭️ instagram (not connected)". */
export function describeResults(results: PlatformResult[]): string {
  return results
    .map((r) => {
      if (r.skipped) return `⏭️ ${r.platform} (not connected)`;
      if (r.success === false || r.status === "failed") return `❌ ${r.platform}${r.message ? ` — ${r.message}` : ""}`;
      if (r.success || r.status === "completed") return `✅ ${r.platform}`;
      return `⏳ ${r.platform}`;
    })
    .join(" · ");
}
