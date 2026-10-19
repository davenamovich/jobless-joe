/**
 * Autopilot — Joe makes a new song on a timer and (optionally) posts it.
 *
 * Each run walks the same path a human takes, through the app's own routes:
 *   1. POST /api/generate         next story episode (cycles EPISODES)
 *   2. ensureAudioTrack()         wait for the render
 *   3. POST /api/song-page        publish the song page
 *   4. autoPublish only:
 *      POST /api/stickman-video   stickman preview page
 *      waitForMp4()               P&R films it (25 credits)
 *      postMp4ToSocials()         Upload-Post → TikTok / Reels / Shorts …
 *
 * The scheduler is a one-minute tick started from instrumentation.ts. The
 * last run time lives in the DB, so a restart doesn't fire an extra song.
 * One run at a time, ever.
 */

import { db } from "@/lib/db";
import { loadBackendConfig } from "@/lib/ai-backend";
import { EPISODES, TARGETS } from "@/lib/joe-prompts";
import { ensureAudioTrack } from "@/lib/tts-service";
import { waitForMp4 } from "@/lib/pr-mcp";
import { postMp4ToSocials } from "@/lib/upload-post";
import { getTrendingIdeas, type TrendIdea } from "@/lib/trending";
import { sendMessage } from "@/lib/telegram/types";
import {
  DEFAULT_DURATION,
  DEFAULT_INTENSITY,
  DEFAULT_STYLE,
  escapeHtml,
  postJson,
} from "@/lib/telegram/song-flow";

const TICK_MS = 60_000;

export interface AutopilotStatus {
  running: boolean;
  /** The one-minute ticker is live (started by instrumentation.ts) */
  scheduler: boolean;
  /** What the current run is doing, e.g. "filming MP4" */
  step: string;
  lastRunAt: string | null;
  /** One-line outcome of the last finished run */
  lastResult: string;
  enabled: boolean;
  intervalMin: number;
  publish: boolean;
}

interface AutopilotState {
  running: boolean;
  step: string;
  lastResult: string;
  timer?: ReturnType<typeof setInterval>;
}

// Survives Next's dev hot reloads, so there is only ever one ticker.
const g = globalThis as typeof globalThis & { __joeAutopilot?: AutopilotState };
const state: AutopilotState = (g.__joeAutopilot ??= { running: false, step: "", lastResult: "" });

/** The story episode after `lastTheme`, wrapping around. Custom/unknown → the first. */
export function nextEpisode(lastTheme: string | null | undefined) {
  const i = EPISODES.findIndex((e) => e.key === lastTheme);
  return EPISODES[(i + 1) % EPISODES.length];
}

/** Rotate the target audience so back-to-back songs don't pitch the same crowd. */
export function nextTarget(lastTarget: string | null | undefined) {
  const i = TARGETS.findIndex((t) => t.key === lastTarget);
  return TARGETS[(i + 1) % TARGETS.length];
}

/** Is a run due? `lastRunAt` null = never run = due now. */
export function isDue(lastRunAt: Date | null, intervalMin: number, now = Date.now()): boolean {
  if (!lastRunAt) return true;
  return now - lastRunAt.getTime() >= intervalMin * 60_000;
}

async function lastRunAt(): Promise<Date | null> {
  const row = await db.backendConfig.findUnique({ where: { id: "current" }, select: { autoLastRunAt: true } });
  return row?.autoLastRunAt ?? null;
}

async function markRun(at: Date) {
  await db.backendConfig.upsert({
    where: { id: "current" },
    create: { id: "current", autoLastRunAt: at },
    update: { autoLastRunAt: at },
  });
}

/** A trending idea no recent song has used yet, or null (trends down / all used). */
async function freshTrend(): Promise<TrendIdea | null> {
  try {
    const { ideas } = await getTrendingIdeas();
    const used = await db.episode.findMany({
      where: { episodeTheme: "custom", customTopic: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { customTopic: true },
    });
    return pickUnusedTrend(ideas, used.map((u) => u.customTopic ?? ""));
  } catch (e) {
    console.warn("[autopilot] trending unavailable, singing the story instead", e);
    return null;
  }
}

/** First idea whose topic hasn't been sung (case-insensitive). */
export function pickUnusedTrend(ideas: TrendIdea[], usedTopics: string[]): TrendIdea | null {
  const used = new Set(usedTopics.map((t) => t.trim().toLowerCase()));
  return ideas.find((i) => !used.has(i.topic.trim().toLowerCase())) ?? null;
}

async function notify(chatId: string, html: string) {
  if (!chatId || !process.env.TELEGRAM_BOT_TOKEN) return;
  await sendMessage({ chat_id: Number(chatId), text: html, parse_mode: "HTML" }).catch((e) =>
    console.error("[autopilot] telegram notify failed", e),
  );
}

export async function autopilotStatus(): Promise<AutopilotStatus> {
  const cfg = await loadBackendConfig();
  const last = await lastRunAt().catch(() => null);
  return {
    running: state.running,
    scheduler: !!state.timer,
    step: state.step,
    lastRunAt: last ? last.toISOString() : null,
    lastResult: state.lastResult,
    enabled: cfg.autoEnabled,
    intervalMin: cfg.autoIntervalMin,
    publish: cfg.autoPublish,
  };
}

/**
 * Run once: song → page → (MP4 → socials). Returns false if a run is already
 * going. Never throws — failures land in lastResult and the Telegram chat.
 */
export async function runAutopilot(reason: "schedule" | "manual" = "manual"): Promise<boolean> {
  if (state.running) return false;
  state.running = true;
  state.step = "writing lyrics";
  // Stamp the start, not the end: a run that fails still waits a full interval.
  await markRun(new Date()).catch((e) => console.error("[autopilot] couldn't save run time", e));

  const cfg = await loadBackendConfig();
  const chatId = cfg.autoChatId;
  let title = "";
  try {
    const lastStory = await db.episode.findFirst({
      where: { episodeTheme: { not: "custom" } },
      orderBy: { createdAt: "desc" },
    });
    const latest = await db.episode.findFirst({ orderBy: { createdAt: "desc" } });
    const target = nextTarget(latest?.target);

    // Alternate: after a story episode, sing something trending (if any
    // fresh idea is left); otherwise continue the story.
    const trend = latest && latest.episodeTheme !== "custom" ? await freshTrend() : null;
    const ep = nextEpisode(lastStory?.episodeTheme);
    const song = trend
      ? { episodeKey: "custom", episodeLabel: "Trending", customTopic: trend.topic }
      : { episodeKey: ep.key, episodeLabel: ep.label };
    state.step = trend ? `writing lyrics (trending: ${trend.label})` : "writing lyrics";
    console.log(`[autopilot] ${reason} run: ${trend ? `trending "${trend.label}"` : ep.key} for ${target.key}`);

    const gen = await postJson<{ episodeId: string; output: { episodeTitle: string } }>("/api/generate", {
      ...song,
      duration: DEFAULT_DURATION,
      intensity: DEFAULT_INTENSITY,
      croonerStyle: DEFAULT_STYLE,
      target: target.key,
      action: "generate",
    });
    title = gen.output.episodeTitle;

    state.step = "recording";
    const voice = (await db.backendConfig.findUnique({ where: { id: "current" } }))?.defaultVoice || "jam";
    const audio = await ensureAudioTrack(gen.episodeId, voice);
    if (!audio.ok) throw new Error(audio.error || "Audio render failed.");

    state.step = "publishing song page";
    const page = await postJson<{ url: string }>("/api/song-page", { episodeId: gen.episodeId });
    let line = `🤖 <b>${escapeHtml(title)}</b> (autopilot)\n${page.url}`;

    if (cfg.autoPublish) {
      if (!cfg.prApiKey.trim()) throw new Error("Auto-publish needs a Plunder & Riffle API key for the MP4.");
      state.step = "stickman preview";
      const video = await postJson<{ url: string }>("/api/stickman-video", { episodeId: gen.episodeId });
      state.step = "filming MP4";
      const mp4Url = await waitForMp4({ mcpUrl: cfg.prMcpUrl, apiKey: cfg.prApiKey }, video.url);
      state.step = "posting to socials";
      const { summary } = await postMp4ToSocials(mp4Url, title, { episodeId: gen.episodeId });
      line += `\n🎬 ${mp4Url}\n📤 ${escapeHtml(summary)}`;
      state.lastResult = `“${title}” posted — ${summary}`;
    } else {
      state.lastResult = `“${title}” — song page live`;
    }
    await notify(chatId, line);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[autopilot] run failed", err);
    state.lastResult = `failed${title ? ` on “${title}”` : ""} while ${state.step}: ${msg}`;
    await notify(chatId, `🤖😵 Autopilot ${escapeHtml(state.lastResult)}`);
  } finally {
    state.running = false;
    state.step = "";
  }
  return true;
}

/** One scheduler tick: run if enabled and due. */
export async function autopilotTick(): Promise<void> {
  if (state.running) return;
  try {
    const cfg = await loadBackendConfig();
    if (!cfg.autoEnabled) return;
    if (!isDue(await lastRunAt(), cfg.autoIntervalMin)) return;
    void runAutopilot("schedule");
  } catch (e) {
    console.error("[autopilot] tick failed", e);
  }
}

/** Start the one-minute ticker (idempotent). Called from instrumentation.ts. */
export function startAutopilot(): void {
  if (state.timer) return;
  state.timer = setInterval(() => void autopilotTick(), TICK_MS);
  // Don't keep a process alive just for the ticker.
  state.timer.unref?.();
  console.log("[autopilot] scheduler started");
}
