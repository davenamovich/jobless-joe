/**
 * Morning Show autopilot — once a day, at the hour picked in the Morning
 * Show tab, Joe does the whole show on his own:
 *
 *   1. getMorningPosts()        the morning's top posts
 *   2. writeMorningMonologue()  search-led script + YouTube copy
 *   3. publishVoicedSitdown()   voice it (Fish Audio etc.), publish the page
 *   4. waitForMp4()             P&R films it (25 credits)
 *   5. postMp4ToSocials()       Upload-Post, with the search-led YouTube copy
 *
 * Ticks with the song autopilot's one-minute scheduler. The last run time
 * lives in the DB, so a restart doesn't post twice in one morning.
 */

import { db } from "@/lib/db";
import { loadBackendConfig } from "@/lib/ai-backend";
import { getMorningPosts, writeMorningMonologue } from "@/lib/morning-show";
import { publishVoicedSitdown } from "@/lib/sitdown-page";
import { waitForMp4 } from "@/lib/pr-mcp";
import { postMp4ToSocials } from "@/lib/upload-post";
import { sendMessage } from "@/lib/telegram/types";
import { escapeHtml } from "@/lib/telegram/song-flow";

export interface MorningAutopilotStatus {
  enabled: boolean;
  hour: number;
  count: number;
  timeZone: string;
  running: boolean;
  step: string;
  lastRunAt: string | null;
  lastResult: string;
}

interface State {
  running: boolean;
  step: string;
  lastResult: string;
}

const g = globalThis as typeof globalThis & { __joeMorningAuto?: State };
const state: State = (g.__joeMorningAuto ??= { running: false, step: "", lastResult: "" });

/** The calendar day and hour at `at` in `timeZone` ("" = the server's zone). */
export function localDayHour(at: Date, timeZone: string): { day: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone || undefined,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { day: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) % 24 };
}

/** Due once the local hour is reached, and only once per local day. */
export function isMorningDue(now: Date, hour: number, timeZone: string, lastRunAt: Date | null): boolean {
  const today = localDayHour(now, timeZone);
  if (today.hour < hour) return false;
  return !lastRunAt || localDayHour(lastRunAt, timeZone).day !== today.day;
}

async function lastRunAt(): Promise<Date | null> {
  const row = await db.backendConfig.findUnique({ where: { id: "current" }, select: { morningLastRunAt: true } });
  return row?.morningLastRunAt ?? null;
}

async function markRun(at: Date) {
  await db.backendConfig.upsert({
    where: { id: "current" },
    create: { id: "current", morningLastRunAt: at },
    update: { morningLastRunAt: at },
  });
}

async function notify(chatId: string, html: string) {
  if (!chatId || !process.env.TELEGRAM_BOT_TOKEN) return;
  await sendMessage({ chat_id: Number(chatId), text: html, parse_mode: "HTML" }).catch((e) =>
    console.error("[morning-autopilot] telegram notify failed", e),
  );
}

export async function morningAutopilotStatus(): Promise<MorningAutopilotStatus> {
  const cfg = await loadBackendConfig();
  const last = await lastRunAt().catch(() => null);
  return {
    enabled: cfg.morningEnabled,
    hour: cfg.morningHour,
    count: cfg.morningCount,
    timeZone: cfg.morningTimeZone,
    running: state.running,
    step: state.step,
    lastRunAt: last ? last.toISOString() : null,
    lastResult: state.lastResult,
  };
}

/**
 * Make and post one Morning Show. Returns false if one is already running.
 * Never throws: the outcome lands in lastResult and the autopilot's Telegram chat.
 */
export async function runMorningShow(reason: "schedule" | "manual" = "manual"): Promise<boolean> {
  if (state.running) return false;
  state.running = true;
  state.step = "pulling top posts";
  // Stamp the start: a failed run still waits until tomorrow.
  await markRun(new Date()).catch((e) => console.error("[morning-autopilot] couldn't save run time", e));

  const cfg = await loadBackendConfig();
  let title = "";
  try {
    console.log(`[morning-autopilot] ${reason} run, top ${cfg.morningCount}`);
    if (!cfg.prApiKey.trim()) throw new Error("it needs a Plunder & Riffle API key to film the MP4.");
    if (!cfg.upApiKey.trim()) throw new Error("it needs an Upload-Post API key to post.");

    const { posts } = await getMorningPosts(cfg.morningCount, { refresh: true });
    if (!posts.length) throw new Error("there were no posts to talk about.");

    state.step = "writing the show";
    const show = await writeMorningMonologue(posts);
    title = show.title;

    state.step = "voicing the show";
    const pageUrl = await publishVoicedSitdown(show.title, show.script);

    state.step = "filming MP4";
    const mp4Url = await waitForMp4({ mcpUrl: cfg.prMcpUrl, apiKey: cfg.prApiKey }, pageUrl, {
      giveUpMs: 15 * 60_000,
    });

    state.step = "posting to socials";
    const { summary } = await postMp4ToSocials(mp4Url, show.title, { youtube: show.youtube });
    state.lastResult = `“${title}” posted — ${summary}`;
    await notify(
      cfg.autoChatId,
      `☕ <b>${escapeHtml(title)}</b> (Morning Show)\n🎬 ${mp4Url}\n📤 ${escapeHtml(summary)}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[morning-autopilot] run failed", err);
    state.lastResult = `failed${title ? ` on “${title}”` : ""} while ${state.step}: ${msg}`;
    await notify(cfg.autoChatId, `☕😵 Morning Show ${escapeHtml(state.lastResult)}`);
  } finally {
    state.running = false;
    state.step = "";
  }
  return true;
}

/** One scheduler tick: run if enabled and due. */
export async function morningTick(now = new Date()): Promise<void> {
  if (state.running) return;
  try {
    const cfg = await loadBackendConfig();
    if (!cfg.morningEnabled) return;
    if (!isMorningDue(now, cfg.morningHour, cfg.morningTimeZone, await lastRunAt())) return;
    void runMorningShow("schedule");
  } catch (e) {
    console.error("[morning-autopilot] tick failed", e);
  }
}
