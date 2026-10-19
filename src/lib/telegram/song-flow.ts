// /src/lib/telegram/song-flow.ts — Song request in, published here.now song page out.
//
// Reuses the app's own routes so the bot gets exactly what the web UI gets:
//   1. POST /api/generate   — lyrics + Story Bible update (also starts the render)
//   2. ensureAudioTrack()   — joins that same in-flight render and waits for it
//   3. POST /api/song-page  — publishes page + MP3 to here.now, returns the URL

import { db } from "@/lib/db";
import {
  DURATIONS,
  INTENSITIES,
  MAX_SCRIPT_CHARS,
  type ActionKey,
  type DurationKey,
  type IntensityKey,
} from "@/lib/joe-prompts";
import { CROONER_STYLES } from "@/lib/crooner-styles";
import { DEFAULT_LANGUAGE, isLanguageKey } from "@/lib/languages";
import { ensureAudioTrack } from "@/lib/tts-service";
import { songPageStickmanEnabled } from "@/lib/song-page";
import { tg, safeReply, tryAcquireRateLimit } from "./bot";
import { getSession, updateSession } from "./sessions";
import type { TelegramMessage } from "./types";

export const DEFAULT_DURATION: DurationKey = "60s";
export const DEFAULT_INTENSITY: IntensityKey = "ridiculous";
export const DEFAULT_STYLE = "smoky-lounge";

export function isDurationKey(v: unknown): v is DurationKey {
  return DURATIONS.some((d) => d.key === v);
}

export function isIntensityKey(v: unknown): v is IntensityKey {
  return INTENSITIES.some((i) => i.key === v);
}

export function isStyleKey(v: unknown): v is string {
  return CROONER_STYLES.some((s) => s.key === v);
}

/** The chat's saved preferences, with defaults filled in. */
export function chatPrefs(msg: TelegramMessage) {
  const sess = getSession(msg.chat.id, msg.from?.username || "", msg.from?.first_name || "");
  return {
    duration: isDurationKey(sess.duration) ? sess.duration : DEFAULT_DURATION,
    intensity: isIntensityKey(sess.intensity) ? sess.intensity : DEFAULT_INTENSITY,
    croonerStyle: isStyleKey(sess.croonerStyle) ? sess.croonerStyle : DEFAULT_STYLE,
    language: isLanguageKey(sess.language) ? sess.language : DEFAULT_LANGUAGE,
    /** This chat's newest song, so remixes never pick up another chat's. */
    lastEpisodeId: typeof sess.lastEpisodeId === "string" ? sess.lastEpisodeId : undefined,
  };
}

/** Where this server can reach itself. Loopback by default (works in Docker too). */
function internalBaseUrl(): string {
  const explicit = process.env.APP_INTERNAL_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  return `http://127.0.0.1:${process.env.PORT || 3000}`;
}

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${internalBaseUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `${path} failed (${res.status})`);
  return data;
}

export function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function say(chatId: number, text: string, label: string) {
  await safeReply(() => tg.sendMessage({ chat_id: chatId, text, parse_mode: "HTML" }), label);
}

// One song at a time per chat — a render can take minutes.
const busyChats = new Set<number>();

export interface SongRequest {
  /** EPISODES[].key, or "custom" for a free-text topic or lyrics. */
  episodeKey: string;
  episodeLabel: string;
  topic?: string;
  /** User's own lyrics — Joe keeps their beats and sings them. */
  script?: string;
  action: ActionKey;
  /** For refine actions: the song being reworked. */
  episodeId?: string;
  /** First line of the status message, already HTML-escaped. */
  intro: string;
}

/**
 * Guard against overlap and spam, then run the whole pipeline for this chat,
 * editing one status message as it goes. Returns once the link is posted.
 */
export async function startSong(msg: TelegramMessage, req: SongRequest): Promise<void> {
  const chatId = msg.chat.id;

  if (busyChats.has(chatId)) {
    await say(chatId, `🎙️ Joe is still recording your last song — hang tight, the link is coming.`, "send busy");
    return;
  }
  if (tryAcquireRateLimit(chatId)) {
    await say(chatId, `⏳ Slow down! Wait a few seconds before trying again.`, "send rate limit");
    return;
  }

  const prefs = chatPrefs(msg);
  busyChats.add(chatId);

  const status = await safeReply(
    () =>
      tg.sendMessage({
        chat_id: chatId,
        text: `${req.intro}\n<i>${prefs.duration} · ${prefs.intensity} · ${prefs.croonerStyle} · ${prefs.language}</i>`,
        parse_mode: "HTML",
      }),
    "send song status",
  );

  // Edit the status message in place; fall back to a new message if that fails.
  const update = async (text: string) => {
    if (status) {
      const edited = await safeReply(
        () =>
          tg
            .editMessageText({
              chat_id: chatId,
              message_id: status.message_id,
              text,
              parse_mode: "HTML",
            })
            .then(() => true),
        "edit song status",
      );
      if (edited !== undefined) return;
    }
    await say(chatId, text, "send song status (fallback)");
  };

  try {
    const gen = await postJson<{ episodeId: string; output: { episodeTitle: string } }>(
      "/api/generate",
      {
        episodeKey: req.episodeKey,
        episodeLabel: req.episodeLabel,
        customTopic: req.topic?.slice(0, MAX_SCRIPT_CHARS),
        customScript: req.script,
        duration: prefs.duration,
        intensity: prefs.intensity,
        croonerStyle: prefs.croonerStyle,
        language: prefs.language,
        target: "job-seekers",
        action: req.action,
        episodeId: req.episodeId,
      },
    );
    // /funnier, /next… rework this chat's song, not whatever another chat made last.
    updateSession(chatId, { lastEpisodeId: gen.episodeId });
    const title = escapeHtml(gen.output.episodeTitle);

    await update(`🎙️ <b>${title}</b>\n\nLyrics done. Joe is in the booth recording (this can take a few minutes)…`);

    // /api/generate already started the render with the default voice;
    // ensureAudioTrack joins that in-flight job instead of starting another.
    const cfg = await db.backendConfig.findUnique({ where: { id: "current" } });
    const audio = await ensureAudioTrack(gen.episodeId, cfg?.defaultVoice || "jam");
    if (!audio.ok) throw new Error(audio.error || "Audio render failed.");

    await update(`📡 <b>${title}</b>\n\nPublishing the song page…`);

    const page = await postJson<{ url: string; claimUrl?: string; ttlSeconds?: number }>(
      "/api/song-page",
      { episodeId: gen.episodeId },
    );

    // Anonymous here.now publishes come back with a claim URL and expire.
    const hours = Math.round((page.ttlSeconds ?? 24 * 3600) / 3600);
    const expiry = page.claimUrl
      ? `\n\n<i>Temporary page — gone in ~${hours}h. Download the MP3 to keep it.</i>`
      : "";
    const stage = songPageStickmanEnabled() ? `\n▶️ Press play — stickman Joe acts it out.` : "";
    await update(
      `🎶 <b>${title}</b>\n\n${page.url}${stage}${expiry}\n\n` +
        `Remix it: /funnier /sharper /attitude /ending · Keep going: /next\n` +
        `🎨 Memes: /meme · 🎬 Stickman video: /video`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[telegram.song] flow failed", err);
    await update(`😵 Joe lost his voice: ${escapeHtml(msg)}\n\nTry again in a moment.`);
  } finally {
    busyChats.delete(chatId);
  }
}
