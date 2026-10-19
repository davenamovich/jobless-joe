/**
 * Video service — turns a finished Jobless Joe song into a Plunder & Riffle
 * video pack (9:16 /video page, meme slideshow, iMessage, hot take).
 *
 * Flow for one click:
 *   1. Make sure the episode has an audio track.
 *   2. Give P&R a public https URL for that track (PUBLIC_BASE_URL, or a
 *      here.now publish when we're on localhost).
 *   3. create_video_pack with Joe's title + referral code.
 *   4. As soon as the page exists, request_mp4 on it — clicking "Make Joe's
 *      video" is the approval, so there's no second MP4 click.
 *   5. Store the result in VideoJob so the phone and the song page can show it.
 *
 * Resuming is free: if P&R hands back a jobId instead of a page, we call again
 * with source_job_id rather than resending the audio.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import {
  loadBackendConfig,
  type BackendConfig,
} from "@/lib/ai-backend";
import { publishFiles } from "@/lib/herenow";
import {
  createVideoPack,
  getJobStatus,
  parsePack,
  requestMp4,
  PrError,
  type PackResult,
  type PrConfig,
} from "@/lib/pr-mcp";
import type { SongOutput } from "@/lib/joe-prompts";
import { getLanguage } from "@/lib/languages";

/** P&R rejects audio over 24MB / 3 minutes. */
const MAX_AUDIO_BYTES = 24 * 1024 * 1024;

export interface VideoJobView {
  id: string;
  episodeId: string;
  status: string;
  pageUrl: string;
  posterUrl: string;
  /** 9:16 frames from the pack (video, memes, iMessage, hot take) for the phone. */
  frames: string[];
  mp4Url: string;
  /** Our own copy of the MP4 (/video/<id>.mp4) — outlives P&R's ~24h host. */
  localMp4: string;
  postCopy: string;
  audioUrl: string;
  error: string;
  /** YouTube upload state: "" | publishing | published | failed */
  ytStatus: string;
  ytUrl: string;
  ytCaptions: boolean;
  ytError: string;
  createdAt: string;
}

type VideoJobRow = {
  id: string;
  episodeId: string;
  status: string;
  pageUrl: string;
  posterUrl: string;
  mp4Url: string;
  localMp4: string;
  postCopy: string;
  audioUrl: string;
  error: string;
  packJobId: string;
  mp4JobId: string;
  providerRaw: string;
  ytStatus: string;
  ytVideoId: string;
  ytUrl: string;
  ytCaptions: boolean;
  ytError: string;
  createdAt: Date;
};

export function toView(row: VideoJobRow): VideoJobView {
  return {
    id: row.id,
    episodeId: row.episodeId,
    status: row.status,
    pageUrl: row.pageUrl,
    posterUrl: row.posterUrl,
    frames: packFrames(row),
    mp4Url: row.mp4Url,
    localMp4: row.localMp4,
    postCopy: row.postCopy,
    audioUrl: row.audioUrl,
    error: row.error,
    ytStatus: row.ytStatus,
    ytUrl: row.ytUrl,
    ytCaptions: row.ytCaptions,
    ytError: row.ytError,
    createdAt: row.createdAt.toISOString(),
  };
}

function prConfig(cfg: BackendConfig): PrConfig {
  return { mcpUrl: cfg.prMcpUrl, apiKey: cfg.prApiKey };
}

/**
 * The 9:16 story frames inside a stored pack, in pack order. The phone plays
 * these as a slideshow over the song when there is no MP4 yet, so a poster
 * click never has to leave the page.
 */
function packFrames(row: VideoJobRow): string[] {
  const frames: string[] = [];
  if (row.providerRaw) {
    try {
      const raw = JSON.parse(row.providerRaw) as Record<string, unknown>;
      for (const key of ["video", "memes", "imessage", "hottake"]) {
        const piece = raw[key] as
          | { adAssets?: Array<{ format?: string; url?: string }> }
          | undefined;
        const story = piece?.adAssets?.find(
          (a) => a?.format === "story" && typeof a?.url === "string"
        );
        if (story?.url) frames.push(story.url);
      }
    } catch {
      // Old/odd payload — fall back to the poster below.
    }
  }
  if (frames.length === 0 && row.posterUrl) frames.push(row.posterUrl);
  return frames;
}

/** Append the referral code to a link unless it already has one. */
export function withRef(url: string, ref: string): string {
  if (!url || !ref || /[?&]ref=/.test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}ref=${encodeURIComponent(ref)}`;
}

/**
 * Joe's caption for the video: his own punchline, the episode title, the CTA
 * to the free course, and the tracked song link. Deliberately written in the
 * app (not by the provider) so every video sounds like Joe.
 */
export function buildJoeVideoCopy(
  output: SongOutput,
  opts: {
    pageUrl?: string;
    courseUrl: string;
    ref?: string;
    language?: string;
  }
): string {
  const hook = output.hooks?.[0]?.trim();
  const closing = output.closingLine?.trim();
  const lang = getLanguage(opts.language);
  const lines = [
    hook || output.episodeTitle,
    closing ? `“${closing}”` : "",
    "",
    `🎙️ Jobless Joe — ${output.episodeTitle}`,
    opts.pageUrl
      ? lang.caption.watch.replace("{url}", opts.pageUrl)
      : "",
    lang.caption.cta.replace(
      "{course}",
      withRef(opts.courseUrl, opts.ref ?? "")
    ),
    "#JoblessJoe #AIForEveryone",
  ];
  return lines.filter((l) => l !== "").join("\n").trim();
}

/**
 * A public https URL for the episode's audio. P&R only accepts https URLs.
 *
 * With PUBLIC_BASE_URL set (a deployed instance), we point at our own static
 * file. On localhost we publish the MP3 to here.now and use that URL — it
 * lives long enough for P&R to fetch and render.
 */
async function publicAudioUrl(
  filePath: string,
  cfg: BackendConfig
): Promise<string> {
  const base = cfg.publicBaseUrl.replace(/\/+$/, "");
  if (base && !/localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(base)) {
    return `${base}${filePath}`;
  }

  const abs = path.join(process.cwd(), "public", filePath.replace(/^\//, ""));
  const buffer = await fs.readFile(abs);
  if (buffer.length > MAX_AUDIO_BYTES) {
    throw new Error(
      `Song is ${(buffer.length / 1024 / 1024).toFixed(1)}MB — P&R caps audio at 24MB. Use a shorter duration.`
    );
  }

  const published = await publishFiles(
    [{ path: "song.mp3", buffer, contentType: "audio/mpeg" }],
    { apiKey: process.env.HERENOW_API_KEY }
  );
  return `${published.url.replace(/\/+$/, "")}/song.mp3`;
}

async function applyPack(
  jobId: string,
  pack: PackResult,
  raw: string,
  cfg: BackendConfig
): Promise<VideoJobRow> {
  const pageUrl = pack.pageUrl;
  const ready = Boolean(pageUrl || pack.mp4Url);
  const patch = {
    status: ready ? "ready" : "rendering",
    pageUrl,
    posterUrl: pack.posterUrl,
    mp4Url: pack.mp4Url,
    packJobId: ready ? "" : pack.jobId,
    providerRaw: raw.slice(0, 20_000),
    error: "",
  };

  const existing = await db.videoJob.findUnique({ where: { id: jobId } });
  if (!existing) throw new Error("Video job disappeared.");

  // Joe's copy wins over the provider's generic caption.
  const episode = await db.episode.findUnique({
    where: { id: existing.episodeId },
  });
  let postCopy = existing.postCopy;
  if (episode) {
    try {
      const output = JSON.parse(episode.output) as SongOutput;
      postCopy = buildJoeVideoCopy(output, {
        pageUrl,
        courseUrl: cfg.courseUrl,
        ref: cfg.prRef,
        language: episode.language,
      });
    } catch {
      postCopy = pack.postCopy || postCopy;
    }
  }

  return db.videoJob.update({
    where: { id: jobId },
    data: { ...patch, postCopy },
  });
}

/**
 * P&R temp pages expire after ~24h (410 "This meme has expired"), and
 * request_mp4 will happily — and billably — film the expiry notice. Only a
 * definite 404/410 counts as gone; a network blip shouldn't refilm.
 */
async function pageAlive(url: string): Promise<boolean> {
  if (!url) return false;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    void res.body?.cancel();
    return res.status !== 404 && res.status !== 410;
  } catch {
    return true;
  }
}

/**
 * The page alone isn't the deliverable: once P&R has it, go straight on to
 * the MP4. Skipped when one is already rendering or done (never paid twice).
 */
async function withMp4(row: VideoJobRow): Promise<VideoJobView> {
  if (!row.pageUrl || row.mp4Url || row.mp4JobId) return toView(row);
  return ensureMp4(row.id);
}

/**
 * One click: make sure a video (page + MP4) exists for this episode.
 * Idempotent — an in-flight or finished job is reused instead of charged again.
 */
export async function ensureVideoJob(
  episodeId: string,
  opts: { force?: boolean } = {}
): Promise<VideoJobView> {
  const cfg = await loadBackendConfig();
  if (!cfg.prApiKey.trim()) {
    throw new Error(
      "Add your Plunder & Riffle API key in Backend settings before making a video."
    );
  }

  const latest = await db.videoJob.findFirst({
    where: { episodeId },
    orderBy: { createdAt: "desc" },
  });

  // Already finished, or an MP4 is rendering — nothing to buy.
  if (
    latest &&
    !opts.force &&
    (latest.mp4Url || latest.mp4JobId) &&
    latest.status !== "failed"
  ) {
    return toView(latest);
  }

  // Older jobs stopped at the page — finish them with the MP4, unless the
  // page has expired, in which case fall through and film a fresh one.
  if (
    latest &&
    !opts.force &&
    latest.pageUrl &&
    latest.status !== "failed" &&
    (await pageAlive(latest.pageUrl))
  ) {
    return withMp4(latest);
  }

  // Resume a pack that P&R is still rendering (free, no new audio upload).
  if (latest?.status === "rendering" && latest.packJobId) {
    const { pack, text } = await createVideoPack(prConfig(cfg), {
      sourceJobId: latest.packJobId,
      title: "",
      waitSeconds: 90,
    });
    const row = await applyPack(latest.id, pack, text, cfg);
    return withMp4(row);
  }

  const track = await db.audioTrack.findFirst({
    where: { episodeId },
    orderBy: { createdAt: "desc" },
  });
  if (!track) {
    throw new Error("Render the song first — there's no audio to make a video from.");
  }
  const episode = await db.episode.findUnique({ where: { id: episodeId } });
  if (!episode) throw new Error("Episode not found.");

  let output: SongOutput;
  try {
    output = JSON.parse(episode.output) as SongOutput;
  } catch {
    throw new Error("Episode output is corrupted.");
  }

  // Publish the music somewhere P&R can fetch it.
  const audioUrl = await publicAudioUrl(track.filePath, cfg);

  const job = await db.videoJob.create({
    data: {
      episodeId,
      status: "rendering",
      audioUrl,
      postCopy: buildJoeVideoCopy(output, {
        courseUrl: cfg.courseUrl,
        ref: cfg.prRef,
        language: episode.language,
      }),
    },
  });

  try {
    const { pack, text } = await createVideoPack(prConfig(cfg), {
      audioUrl,
      title: `${episode.title} — Jobless Joe`,
      ref: cfg.prRef,
      waitSeconds: 90,
    });
    const row = await applyPack(job.id, pack, text, cfg);
    return withMp4(row);
  } catch (e) {
    const message =
      e instanceof PrError || e instanceof Error ? e.message : String(e);
    await db.videoJob.update({
      where: { id: job.id },
      data: { status: "failed", error: message.slice(0, 500) },
    });
    throw e;
  }
}

/** Where mirrored MP4s live, relative to the public dir. */
export const LOCAL_MP4_DIR = "video";

function localMp4Path(jobId: string): string {
  return `/${LOCAL_MP4_DIR}/${jobId}.mp4`;
}

/**
 * P&R hosts a finished MP4 for ~24h only, and the YouTube upload has to hold
 * those bytes. So we keep our own copy under public/video and hand back the
 * buffer. Idempotent: an existing local file is reused, never re-downloaded.
 */
export async function mirrorMp4(
  jobId: string
): Promise<{ path: string; url: string; bytes: Buffer }> {
  const job = await db.videoJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("Video job not found.");

  const rel = localMp4Path(job.id);
  const abs = path.join(process.cwd(), "public", rel.replace(/^\//, ""));

  if (job.localMp4) {
    try {
      const bytes = await fs.readFile(abs);
      if (bytes.length > 0) return { path: abs, url: rel, bytes };
    } catch {
      // File was cleaned up — fall through and download it again.
    }
  }

  if (!job.mp4Url) {
    throw new Error(
      "Make Joe's video first — there's no MP4 to upload yet."
    );
  }

  let res: Response;
  try {
    res = await fetch(job.mp4Url, { signal: AbortSignal.timeout(180_000) });
  } catch (e) {
    throw new Error(
      `Could not download the MP4 (${e instanceof Error ? e.message : "network error"}). P&R keeps renders for ~24h — render it again if the link expired.`
    );
  }
  if (!res.ok) {
    throw new Error(
      `Could not download the MP4 (${res.status}). P&R keeps renders for ~24h — render it again if the link expired.`
    );
  }

  if (/text\/html/i.test(res.headers.get("content-type") ?? "")) {
    throw new Error("P&R's MP4 link is a web page, not a video file — re-render the MP4.");
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length === 0) throw new Error("P&R returned an empty MP4.");

  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, bytes);
  await db.videoJob.update({
    where: { id: job.id },
    data: { localMp4: rel },
  });
  return { path: abs, url: rel, bytes };
}

/**
 * Fire-and-forget mirror, used the moment a render lands so the file is safe
 * on disk long before the 24h host expires. Failures are silent by design —
 * mirrorMp4() retries from the remote URL whenever it's next needed.
 */
function mirrorSoon(jobId: string): void {
  void mirrorMp4(jobId).catch(() => {
    // The next publish (or stream request) retries this.
  });
}

/** Render the P&R page to MP4. Reuses an in-flight render. */
export async function ensureMp4(jobId: string): Promise<VideoJobView> {
  const cfg = await loadBackendConfig();
  const job = await db.videoJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("Video job not found.");
  if (job.mp4Url) return toView(job);

  if (!job.pageUrl) {
    throw new Error("The P&R page isn't ready yet.");
  }
  if (!job.mp4JobId && !(await pageAlive(job.pageUrl))) {
    throw new Error(
      "This video's P&R page has expired (they last ~24h). Click Make Joe's video to film it again."
    );
  }

  const client = prConfig(cfg);

  // Already rendering — poll instead of paying twice.
  if (job.mp4JobId) {
    const { pack, status } = await getJobStatus(client, "mp4", job.mp4JobId);
    if (pack.mp4Url) {
      const row = await db.videoJob.update({
        where: { id: job.id },
        data: { mp4Url: pack.mp4Url, mp4JobId: "", status: "done" },
      });
      mirrorSoon(row.id);
      return toView(row);
    }
    if (/fail/i.test(status)) {
      return toView(
        await db.videoJob.update({
          where: { id: job.id },
          data: { status: "ready", mp4JobId: "", error: "MP4 render failed." },
        })
      );
    }
    return toView(job);
  }

  await db.videoJob.update({
    where: { id: job.id },
    data: { status: "mp4_rendering", error: "" },
  });

  try {
    const { pack, text } = await requestMp4(client, job.pageUrl);
    const mp4Url = pack.mp4Url;
    const mp4JobId = mp4Url ? "" : pack.jobId;
    const row = await db.videoJob.update({
      where: { id: job.id },
      data: {
        mp4Url,
        mp4JobId,
        status: mp4Url ? "done" : mp4JobId ? "mp4_rendering" : "ready",
        providerRaw: (text || job.providerRaw).slice(0, 20_000),
      },
    });
    if (mp4Url) mirrorSoon(row.id);
    return toView(row);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const row = await db.videoJob.update({
      where: { id: job.id },
      data: { status: "ready", error: message.slice(0, 500) },
    });
    return toView(row);
  }
}

/** Lightweight GET refresh: completes an MP4 poll without charging anything. */
export async function refreshVideoJob(jobId: string): Promise<VideoJobView> {
  let job = await db.videoJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("Video job not found.");

  // Self-heal: re-read the stored provider payload if we failed to pull a
  // poster out of it (the real P&R shape nests assets differently).
  if (!job.posterUrl && job.providerRaw) {
    try {
      const repacked = parsePack(JSON.parse(job.providerRaw));
      if (repacked.posterUrl) {
        job = await db.videoJob.update({
          where: { id: job.id },
          data: { posterUrl: repacked.posterUrl, pageUrl: job.pageUrl || repacked.pageUrl },
        });
      }
    } catch {
      // Keep going with what we have.
    }
  }

  if (!job.mp4JobId || job.mp4Url) return toView(job);

  const cfg = await loadBackendConfig();
  try {
    const { pack, status } = await getJobStatus(
      prConfig(cfg),
      "mp4",
      job.mp4JobId
    );
    if (pack.mp4Url) {
      const row = await db.videoJob.update({
        where: { id: job.id },
        data: { mp4Url: pack.mp4Url, mp4JobId: "", status: "done", error: "" },
      });
      mirrorSoon(row.id);
      return toView(row);
    }
    if (/fail/i.test(status)) {
      return toView(
        await db.videoJob.update({
          where: { id: job.id },
          data: {
            mp4JobId: "",
            status: "ready",
            error: "MP4 render failed.",
          },
        })
      );
    }
  } catch {
    // Provider hiccup — keep the row as-is and let the next poll retry.
  }
  return toView(job);
}

export { parsePack };
