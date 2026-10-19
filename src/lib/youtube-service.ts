/**
 * YouTube publishing for finished Joe videos.
 *
 * Plunder & Riffle's MCP server has no YouTube tool — its only publish tool
 * posts to X and Telegram — so the video engine ends at "captioned MP4 + copy".
 * Everything from there to a real upload lives here:
 *
 *   1. Mirror the P&R MP4 onto our own disk (their render link lives ~24h).
 *   2. Build the metadata: title, description (Joe's hook, the free-course CTA
 *      and the tracked song link, then the lyrics), tags and category.
 *   3. Build a caption track. The P&R page carries its own scene timeline
 *      (`BOUNDS`) plus the on-screen caption text per scene, so the SRT is in
 *      sync with the render — no speech-to-text pass needed.
 *   4. Upload with the YouTube Data API v3 (resumable), then captions.insert.
 *
 * The OAuth client belongs to the user's own Google Cloud project; the consent
 * flow stores a long-lived refresh token in BackendConfig.
 */

import { db } from "@/lib/db";
import {
  loadBackendConfig,
  saveBackendConfig,
  type BackendConfig,
} from "@/lib/ai-backend";
import { mirrorMp4 } from "@/lib/video-service";
import type { SongOutput } from "@/lib/joe-prompts";
import { getLanguage } from "@/lib/languages";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

/**
 * Google endpoints. YT_API_BASE and YT_OAUTH_TOKEN_URL are test seams so the
 * consent + upload path can be exercised against a local stub; neither is set
 * in a real deployment, and both default to Google.
 */
const GOOGLE_TOKEN_URL =
  process.env.YT_OAUTH_TOKEN_URL ?? "https://oauth2.googleapis.com/token";
const API_BASE = (process.env.YT_API_BASE ?? "https://www.googleapis.com").replace(
  /\/+$/,
  ""
);
const DATA_BASE = `${API_BASE}/youtube/v3`;
const UPLOAD_BASE = `${API_BASE}/upload`;

/** youtube.force-ssl covers captions.insert; youtube.upload covers videos.insert. */
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.force-ssl",
];

export const YOUTUBE_CALLBACK_PATH = "/api/youtube/callback";

/** Category 10 = Music; these are song videos. */
const CATEGORY_MUSIC = "10";

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

/** In-flight consent attempts, so a stale/forged `state` is rejected. */
const pendingStates = new Map<string, { redirectUri: string; at: number }>();
const STATE_TTL_MS = 10 * 60 * 1000;

/** Access tokens keyed by refresh token, kept in memory only. */
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

function randomToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export function callbackUriFor(origin: string): string {
  return `${origin.replace(/\/+$/, "")}${YOUTUBE_CALLBACK_PATH}`;
}

export function isYouTubeConfigured(cfg: BackendConfig): boolean {
  return Boolean(cfg.ytClientId.trim() && cfg.ytClientSecret.trim());
}

export function isYouTubeConnected(cfg: BackendConfig): boolean {
  return isYouTubeConfigured(cfg) && Boolean(cfg.ytRefreshToken.trim());
}

export interface YouTubeStatus {
  configured: boolean;
  connected: boolean;
  channelTitle: string;
  privacy: string;
  /** The exact URI that must be listed in the Google Cloud OAuth client. */
  redirectUri: string;
}

export async function youtubeStatus(origin: string): Promise<YouTubeStatus> {
  const cfg = await loadBackendConfig();
  return {
    configured: isYouTubeConfigured(cfg),
    connected: isYouTubeConnected(cfg),
    channelTitle: cfg.ytChannelTitle,
    privacy: cfg.ytPrivacy,
    redirectUri: callbackUriFor(origin),
  };
}

/** Start the consent flow: returns the Google URL to open and its redirect_uri. */
export async function buildAuthUrl(
  origin: string
): Promise<{ url: string; redirectUri: string }> {
  const cfg = await loadBackendConfig();
  if (!isYouTubeConfigured(cfg)) {
    throw new Error(
      "Add a Google OAuth client id and client secret first — create one in Google Cloud Console (OAuth client type: Web application) and paste it above."
    );
  }

  const redirectUri = callbackUriFor(origin);
  const state = randomToken();
  const now = Date.now();
  for (const [key, value] of pendingStates) {
    if (now - value.at > STATE_TTL_MS) pendingStates.delete(key);
  }
  pendingStates.set(state, { redirectUri, at: now });

  const params = new URLSearchParams({
    client_id: cfg.ytClientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    // offline + consent is what actually returns a refresh token.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return { url: `${GOOGLE_AUTH_URL}?${params.toString()}`, redirectUri };
}

function consumeState(state: string): { redirectUri: string } {
  const found = pendingStates.get(state);
  if (!found || Date.now() - found.at > STATE_TTL_MS) {
    pendingStates.delete(state);
    throw new Error(
      "This sign-in link has expired or was started before the server restarted. Press Connect again."
    );
  }
  pendingStates.delete(state);
  return found;
}

/** Finish the consent flow: swap the code for a refresh token and save it. */
export async function completeAuth(
  code: string,
  state: string
): Promise<{ channelTitle: string; channelId: string }> {
  const cfg = await loadBackendConfig();
  if (!isYouTubeConfigured(cfg)) {
    throw new Error("The Google OAuth client is no longer configured.");
  }
  const { redirectUri } = consumeState(state);

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.ytClientId,
      client_secret: cfg.ytClientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;

  if (!res.ok || !json.access_token) {
    throw new Error(
      `Google rejected the sign-in (${res.status}): ${json.error_description ?? json.error ?? "unknown error"}. Check that ${redirectUri} is listed as an authorised redirect URI.`
    );
  }
  if (!json.refresh_token) {
    throw new Error(
      "Google didn't return a refresh token. Remove this app's access at myaccount.google.com/permissions and connect again."
    );
  }

  await saveBackendConfig({
    ...cfg,
    ytRefreshToken: json.refresh_token,
    ytChannelId: "",
    ytChannelTitle: "",
  });
  tokenCache.set(json.refresh_token, {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  });

  // Record which channel the token belongs to, as proof the connection works.
  try {
    const channel = await fetchChannel(json.access_token);
    await saveBackendConfig({
      ...cfg,
      ytRefreshToken: json.refresh_token,
      ytChannelId: channel.channelId,
      ytChannelTitle: channel.channelTitle,
    });
    return channel;
  } catch {
    return { channelTitle: "", channelId: "" };
  }
}

export async function disconnectYouTube(): Promise<void> {
  const cfg = await loadBackendConfig();
  tokenCache.delete(cfg.ytRefreshToken);
  await saveBackendConfig({
    ...cfg,
    ytRefreshToken: "",
    ytChannelId: "",
    ytChannelTitle: "",
  });
}

async function fetchChannel(
  accessToken: string
): Promise<{ channelTitle: string; channelId: string }> {
  const res = await fetch(
    `${DATA_BASE}/channels?part=snippet&mine=true`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(30_000),
    }
  );
  const json = (await res.json().catch(() => ({}))) as {
    items?: Array<{ id?: string; snippet?: { title?: string } }>;
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(
      `Could not read the YouTube channel (${res.status}): ${json.error?.message ?? "unknown error"}`
    );
  }
  const item = json.items?.[0];
  return {
    channelId: item?.id ?? "",
    channelTitle: item?.snippet?.title ?? "",
  };
}

async function getAccessToken(cfg: BackendConfig): Promise<string> {
  if (!isYouTubeConnected(cfg)) {
    throw new Error(
      "Connect your YouTube channel in Backend settings first."
    );
  }
  const refreshToken = cfg.ytRefreshToken;
  const cached = tokenCache.get(refreshToken);
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token;

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.ytClientId,
      client_secret: cfg.ytClientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !json.access_token) {
    throw new Error(
      `Google refused the saved token (${res.status}): ${json.error_description ?? json.error ?? "unknown error"}. Reconnect YouTube in Backend settings.`
    );
  }
  tokenCache.set(refreshToken, {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  });
  return json.access_token;
}

// ---------------------------------------------------------------------------
// Captions — built from the P&R page's own scene timeline
// ---------------------------------------------------------------------------

export interface CaptionCue {
  start: number;
  end: number;
  text: string;
}

export interface CaptionTrack {
  srt: string;
  cues: CaptionCue[];
  /** "page" = timed by the pack's own BOUNDS array; "even" = spread evenly. */
  source: "page" | "even";
}

function decodeEntities(s: string): string {
  return String(s ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function srtTime(seconds: number): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

export function cuesToSrt(cues: CaptionCue[]): string {
  return cues
    .map(
      (cue, i) =>
        `${i + 1}\n${srtTime(cue.start)} --> ${srtTime(cue.end)}\n${cue.text}\n`
    )
    .join("\n");
}

/**
 * Read a pack page's scenes and their timeline.
 *
 * P&R renders each scene with `data-i` (its index) and puts the on-screen words
 * in `.take-text` / `.slide-text` (with the plain text in aria-label) or in
 * `.bubble` rows for the iMessage scene; the `BOUNDS` array holds each scene's
 * [start, end] in seconds. That's a caption track for free.
 */
export function parsePackCaptions(
  html: string,
  opts: { fallbackDurationSec?: number } = {}
): CaptionTrack {
  const boundsRaw = /var BOUNDS\s*=\s*(\[[\d.,[\]\s]+\])/.exec(html);
  let bounds: Array<[number, number]> = [];
  if (boundsRaw) {
    try {
      const parsed = JSON.parse(boundsRaw[1]) as unknown;
      if (Array.isArray(parsed)) {
        bounds = parsed.filter(
          (b): b is [number, number] =>
            Array.isArray(b) && b.length >= 2 && typeof b[1] === "number"
        );
      }
    } catch {
      bounds = [];
    }
  }

  const body = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "");

  const starts = [...body.matchAll(/<div class="scene(?:\s[^"]*)?"[^>]*>/g)];
  const scenes: Array<{ index: number; text: string }> = [];

  for (let n = 0; n < starts.length; n++) {
    const start = starts[n].index ?? 0;
    const end = n + 1 < starts.length ? (starts[n + 1].index ?? body.length) : body.length;
    const block = body.slice(start, end);
    const tag = starts[n][0];

    // 1. A single headline node — aria-label carries the clean text.
    const labelled =
      /class="(?:take-text|slide-text|cta-headline)"[^>]*aria-label="([^"]*)"/.exec(
        block
      ) ??
      /class="(?:take-text|slide-text|cta-headline)"[^>]*>([\s\S]*?)<\/div>/.exec(
        block
      );
    // 2. iMessage scenes: each bubble is a line.
    const bubbles = [...block.matchAll(/class="bubble"[^>]*>([\s\S]*?)<\/div>/g)]
      .map((m) => decodeEntities(m[1]))
      .filter(Boolean);

    const text = decodeEntities(labelled?.[1] ?? "") || bubbles.join(" ");
    if (!text) continue;

    const dataI = /data-i="(\d+)"/.exec(tag);
    const index = dataI ? Number(dataI[1]) : scenes.length;
    scenes.push({ index, text });
  }

  const cues: CaptionCue[] = [];
  if (bounds.length > 0) {
    scenes.forEach((scene, n) => {
      const span = bounds[scene.index] ?? bounds[n];
      if (!span) return;
      const [start, end] = span;
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
        cues.push({ start, end, text: scene.text });
      }
    });
    return dedupeCues(cues, "page");
  }

  // Unknown timeline (an older or different pack shape): spread the lines
  // evenly across the song so the captions are still usable.
  const total = opts.fallbackDurationSec && opts.fallbackDurationSec > 0
    ? opts.fallbackDurationSec
    : 60;
  const each = total / Math.max(1, scenes.length);
  scenes.forEach((scene, n) => {
    cues.push({
      start: n * each,
      end: Math.min(total, (n + 1) * each),
      text: scene.text,
    });
  });
  return dedupeCues(cues, "even");
}

/** Drop a cue that repeats the previous one, and any zero-length cue. */
function dedupeCues(cues: CaptionCue[], source: "page" | "even"): CaptionTrack {
  const out: CaptionCue[] = [];
  for (const cue of cues) {
    if (!cue.text.trim()) continue;
    if (cue.end - cue.start < 0.2) continue;
    const prev = out[out.length - 1];
    if (prev && prev.text.toLowerCase() === cue.text.toLowerCase()) {
      prev.end = cue.end;
      continue;
    }
    out.push({ ...cue });
  }
  return { cues: out, srt: cuesToSrt(out), source };
}

export async function buildCaptionTrack(
  pageUrl: string,
  fallbackDurationSec?: number
): Promise<CaptionTrack> {
  if (!pageUrl) return { cues: [], srt: "", source: "even" };
  const res = await fetch(pageUrl, {
    headers: {
      "ngrok-skip-browser-warning": "true",
      "user-agent": "jobless-joe/1.0 (+youtube-captions)",
    },
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) {
    throw new Error(`Could not read the P&R page for captions (${res.status}).`);
  }
  return parsePackCaptions(await res.text(), { fallbackDurationSec });
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export interface YouTubeMetadata {
  title: string;
  description: string;
  tags: string[];
  language: string;
  privacy: string;
}

/** "60s" → 60. Used for the Shorts check and the caption fallback. */
function durationSeconds(duration: string | undefined): number {
  const m = /(\d+)/.exec(duration ?? "");
  return m ? Number(m[1]) : 0;
}

const HASHTAGS = "#JoblessJoe #AIForEveryone";

export function buildYouTubeMetadata(input: {
  episodeTitle: string;
  output: SongOutput;
  /** Joe's video caption: hook, closing line, CTA and the tracked link. */
  postCopy: string;
  languageKey: string;
  privacy: string;
}): YouTubeMetadata {
  const { output, languageKey } = input;
  const lang = getLanguage(languageKey);

  // Title: Joe's episode title, with the show name unless it's already there.
  let title = (input.episodeTitle || output.episodeTitle || "Jobless Joe").trim();
  if (!/jobless joe/i.test(title)) title = `${title} — Jobless Joe`;
  if (title.length > 100) title = `${title.slice(0, 97).trimEnd()}…`;

  // Description: what Joe says first, then the lyrics, then the hashtags.
  const sections: string[] = [];
  if (input.postCopy.trim()) sections.push(input.postCopy.trim());

  const lyrics = (output.lyrics ?? "").trim();
  if (lyrics) sections.push(`🎙️ Lyrics\n${lyrics}`);

  const bits = [`🎧 Performed by Jobless Joe`, `🌍 ${lang.nativeLabel} (${lang.label})`];
  const seconds = durationSeconds(output.duration);
  if (seconds > 0 && seconds <= 180) bits.push("#Shorts");
  sections.push(bits.join(" · "));
  sections.push(HASHTAGS);

  let description = sections.join("\n\n").trim();
  if (description.length > 5000) {
    description = `${description.slice(0, 4990).trimEnd()}…`;
  }

  // Tags: descriptive only — nothing invented about the song.
  const tags = Array.from(
    new Set(
      [
        "jobless joe",
        "ai song",
        "ai comedy",
        "ai for everyone",
        "unemployed",
        "crooner",
        lang.label.toLowerCase(),
        ...output.hooks.slice(0, 2).map((h) => h.trim().toLowerCase()),
      ]
        .map((t) => t.replace(/\s+/g, " ").trim())
        .filter((t) => t.length > 1 && t.length <= 60)
    )
  ).slice(0, 15);

  return {
    title,
    description,
    tags,
    // YouTube caption tracks want a BCP-47 code; our keys already are one.
    language: lang.key,
    privacy: input.privacy,
  };
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

interface VideoResource {
  id?: string;
  snippet?: { title?: string };
  status?: { uploadStatus?: string; privacyStatus?: string; failureReason?: string };
  error?: { message?: string };
}

async function uploadVideo(
  accessToken: string,
  bytes: Buffer,
  meta: YouTubeMetadata
): Promise<string> {
  const init = await fetch(
    `${UPLOAD_BASE}/youtube/v3/videos?uploadType=resumable&part=snippet,status`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": String(bytes.length),
        "X-Upload-Content-Type": "video/mp4",
      },
      body: JSON.stringify({
        snippet: {
          title: meta.title,
          description: meta.description,
          tags: meta.tags,
          categoryId: CATEGORY_MUSIC,
          defaultLanguage: meta.language,
          defaultAudioLanguage: meta.language,
        },
        status: {
          privacyStatus: meta.privacy,
          selfDeclaredMadeForKids: false,
        },
      }),
      signal: AbortSignal.timeout(60_000),
    }
  );

  if (!init.ok) {
    const detail = await init.text().catch(() => "");
    throw new Error(
      `YouTube refused the upload (${init.status}): ${detail.slice(0, 300) || "no detail"}`
    );
  }
  const location = init.headers.get("location");
  if (!location) {
    throw new Error("YouTube did not return an upload URL.");
  }

  const put = await fetch(location, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(bytes.length),
    },
    body: new Uint8Array(bytes),
    signal: AbortSignal.timeout(600_000),
  });
  const json = (await put.json().catch(() => ({}))) as VideoResource;

  if (!put.ok) {
    throw new Error(
      `The video upload failed (${put.status}): ${json.error?.message ?? "no detail"}`
    );
  }
  if (json.status?.uploadStatus === "failed" || json.status?.uploadStatus === "rejected") {
    throw new Error(
      `YouTube rejected the video: ${json.status.failureReason ?? "unknown reason"}.`
    );
  }

  const id = json.id ?? /[?&]id=([\w-]+)/.exec(location)?.[1] ?? "";
  if (!id) throw new Error("YouTube accepted the upload but returned no video id.");
  return id;
}

async function insertCaptions(
  accessToken: string,
  videoId: string,
  language: string,
  name: string,
  srt: string
): Promise<void> {
  const boundary = `joe${randomToken()}`;
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${JSON.stringify({
          snippet: { videoId, language, name, isDraft: false },
        })}\r\n`,
      "utf8"
    ),
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`,
      "utf8"
    ),
    Buffer.from(srt, "utf8"),
    Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"),
  ]);

  const res = await fetch(`${UPLOAD_BASE}/youtube/v3/captions?part=snippet`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: new Uint8Array(payload),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Caption upload failed (${res.status}): ${detail.slice(0, 200) || "no detail"}`
    );
  }
}

// ---------------------------------------------------------------------------
// The one call the UI makes
// ---------------------------------------------------------------------------

export interface YouTubePublishResult {
  videoId: string;
  url: string;
  title: string;
  captions: boolean;
  captionNote: string;
  localMp4: string;
  bytes: number;
}

/**
 * Publish an episode's finished video to YouTube.
 *
 * Requires a rendered MP4 — the captions are timed against that
 * render, so there is nothing to upload before it exists.
 */
export async function publishToYouTube(
  jobId: string,
  opts: { privacy?: string; captions?: boolean } = {}
): Promise<YouTubePublishResult> {
  const cfg = await loadBackendConfig();
  if (!isYouTubeConnected(cfg)) {
    throw new Error(
      "Connect your YouTube channel in Backend settings first (Google OAuth client + Connect)."
    );
  }

  const job = await db.videoJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("Video job not found.");
  const episode = await db.episode.findUnique({ where: { id: job.episodeId } });
  if (!episode) throw new Error("Episode not found.");

  let output: SongOutput;
  try {
    output = JSON.parse(episode.output) as SongOutput;
  } catch {
    throw new Error("Episode output is corrupted.");
  }

  const track = await db.audioTrack.findFirst({
    where: { episodeId: episode.id },
    orderBy: { createdAt: "desc" },
  });
  const privacy = (opts.privacy || cfg.ytPrivacy || "unlisted").toLowerCase();

  const meta = buildYouTubeMetadata({
    episodeTitle: episode.title,
    output,
    postCopy: job.postCopy,
    languageKey: episode.language,
    privacy: ["public", "private", "unlisted"].includes(privacy)
      ? privacy
      : "unlisted",
  });

  await db.videoJob.update({
    where: { id: job.id },
    data: { ytStatus: "publishing", ytError: "" },
  });

  try {
    const file = await mirrorMp4(job.id);
    const token = await getAccessToken(cfg);
    const videoId = await uploadVideo(token, file.bytes, meta);
    const url = `https://youtu.be/${videoId}`;

    // Captions are best-effort: a failure never discards a live upload.
    let captions = false;
    let captionNote = "";
    if (opts.captions !== false) {
      try {
        const trackCues = await buildCaptionTrack(
          job.pageUrl,
          track?.durationSec ?? durationSeconds(output.duration)
        );
        if (!trackCues.cues.length) {
          captionNote = "No caption lines on the pack page — burned-in captions only.";
        } else {
          await insertCaptions(
            token,
            videoId,
            meta.language,
            `${episode.title} (${getLanguage(episode.language).label})`,
            trackCues.srt
          );
          captions = true;
          captionNote = `${trackCues.cues.length} caption lines from the pack page.`;
        }
      } catch (e) {
        captionNote = e instanceof Error ? e.message : "Caption upload failed.";
      }
    }

    await db.videoJob.update({
      where: { id: job.id },
      data: {
        ytStatus: "published",
        ytVideoId: videoId,
        ytUrl: url,
        ytCaptions: captions,
        ytError: captionNote,
      },
    });

    return {
      videoId,
      url,
      title: meta.title,
      captions,
      captionNote,
      localMp4: file.url,
      bytes: file.bytes.length,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "YouTube upload failed.";
    await db.videoJob.update({
      where: { id: job.id },
      data: { ytStatus: "failed", ytError: message.slice(0, 500) },
    });
    throw e;
  }
}

/** Preview the title, description, tags and SRT without uploading anything. */
export async function previewYouTube(jobId: string): Promise<{
  meta: YouTubeMetadata;
  cues: CaptionCue[];
  srt: string;
  source: "page" | "even";
  connected: boolean;
}> {
  const cfg = await loadBackendConfig();
  const job = await db.videoJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("Video job not found.");
  const episode = await db.episode.findUnique({ where: { id: job.episodeId } });
  if (!episode) throw new Error("Episode not found.");

  let output: SongOutput;
  try {
    output = JSON.parse(episode.output) as SongOutput;
  } catch {
    throw new Error("Episode output is corrupted.");
  }

  const track = await db.audioTrack.findFirst({
    where: { episodeId: episode.id },
    orderBy: { createdAt: "desc" },
  });
  const captions = await buildCaptionTrack(
    job.pageUrl,
    track?.durationSec ?? durationSeconds(output.duration)
  );

  return {
    meta: buildYouTubeMetadata({
      episodeTitle: episode.title,
      output,
      postCopy: job.postCopy,
      languageKey: episode.language,
      privacy: cfg.ytPrivacy,
    }),
    cues: captions.cues,
    srt: captions.srt,
    source: captions.source,
    connected: isYouTubeConnected(cfg),
  };
}
