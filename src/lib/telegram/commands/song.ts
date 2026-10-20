// /src/lib/telegram/commands/song.ts — Song creation and per-chat settings.
//
// Creation:  /song /episode /next /funnier /sharper /attitude /ending /ad
// Settings:  /length /mood /style /language /settings
//
// Pickers accept either the key or the list number, since most keys
// ("joe-discovers-ai", "pt-BR") can't be tapped as Telegram commands.

import { tg, safeReply } from "../bot";
import type { TelegramMessage } from "../types";
import { updateSession } from "../sessions";
import { db } from "@/lib/db";
import { resetStoryBible } from "@/lib/story-bible";
import { isAdminChat } from "./ralph";
import { CUSTOM_LABEL, requestLyricSong, requestTopicSong } from "../handlers/message";
import { chatPrefs, escapeHtml, startSong } from "../song-flow";
import { ACTIONS, DURATIONS, EPISODES, INTENSITIES, type ActionKey } from "@/lib/joe-prompts";
import { CROONER_STYLES } from "@/lib/crooner-styles";
import { LANGUAGES } from "@/lib/languages";

async function say(chatId: number, text: string, label: string) {
  await safeReply(() => tg.sendMessage({ chat_id: chatId, text, parse_mode: "HTML" }), label);
}

/** Match an argument against a list by key (case-insensitive) or 1-based number. */
function pick<T extends { key: string }>(list: T[], arg: string | undefined): T | undefined {
  const a = (arg || "").trim().toLowerCase();
  if (!a) return undefined;
  const n = Number(a);
  if (Number.isInteger(n) && n >= 1 && n <= list.length) return list[n - 1];
  return list.find((item) => item.key.toLowerCase() === a);
}

// ─── Creation ─────────────────────────────────────────────────────────────

/** /song <topic> — same as sending plain text. */
export async function handleSong(args: string[], msg: TelegramMessage) {
  await requestTopicSong(msg, args.join(" ").trim());
}

/** /lyrics <your lyrics> — Joe sings your words (pasting 4+ lines does the same). */
export async function handleLyrics(_args: string[], msg: TelegramMessage) {
  // Keep the user's line breaks: take everything after the command word.
  const body = (msg.text || "").replace(/^\/\S+[ 	]*/, "").trim();
  await requestLyricSong(msg, body);
}

/** /episode [n|key] — list the preset story episodes, or sing one. */
export async function handleEpisode(args: string[], msg: TelegramMessage) {
  const episode = pick(EPISODES, args[0]);
  if (!episode) {
    await say(
      msg.chat.id,
      `📺 <b>Story episodes</b> — send <code>/episode 3</code>\n\n` +
        EPISODES.map((e, i) => `${i + 1}. ${escapeHtml(e.label)}`).join("\n"),
      "send episode list",
    );
    return;
  }
  await startSong(msg, {
    episodeKey: episode.key,
    episodeLabel: episode.label,
    action: "generate",
    intro: `✍️ Joe is writing <b>${escapeHtml(episode.label)}</b>`,
  });
}

/**
 * /resetstory — start Joe's shared story over from Season 1, episode 1.
 * The story is shared by every chat, so only chats listed in
 * TELEGRAM_ADMIN_CHAT_IDS (comma-separated) may reset it.
 */
export async function handleResetStory(_args: string[], msg: TelegramMessage) {
  if (!isAdminChat(msg.chat.id)) {
    await say(msg.chat.id, `Only the show's producer can restart Joe's story.`, "send reset refused");
    return;
  }
  await resetStoryBible();
  await say(
    msg.chat.id,
    `🎬 Story reset. /next plays episode 1 of the arc (see /arc).`,
    "send reset done",
  );
}

/** /next — the next chapter of the running story. */
export async function handleNext(_args: string[], msg: TelegramMessage) {
  await runAction(msg, "continue");
}

/** Remixes of the most recent song. */
function remix(action: ActionKey) {
  return (_args: string[], msg: TelegramMessage) => runAction(msg, action);
}

export const handleFunnier = remix("funnier");
export const handleSharper = remix("sharper");
export const handleAttitude = remix("attitude");
export const handleEnding = remix("bigger-ending");
export const handleAd = remix("thirty-ad");

/**
 * Remixes and /next work on the app's most recent song (/api/generate feeds
 * it to the model), so carry that song's theme and topic forward too.
 */
async function runAction(msg: TelegramMessage, action: ActionKey) {
  const def = ACTIONS.find((a) => a.key === action);
  // This chat's own last song. Chats from before lastEpisodeId was tracked
  // fall back to the newest song overall, as before.
  const own = chatPrefs(msg).lastEpisodeId;
  const last =
    (own ? await db.episode.findUnique({ where: { id: own } }) : null) ??
    (await db.episode.findFirst({ orderBy: { createdAt: "desc" } }));
  if (!last) {
    await say(msg.chat.id, `No song yet — make one first with /song or /episode.`, "send no last song");
    return;
  }
  const preset = EPISODES.find((e) => e.key === last.episodeTheme);
  await startSong(msg, {
    // A dropped-in song is remixed as a custom song from its transcript (customScript).
    episodeKey: last.episodeTheme === "upload" ? "custom" : last.episodeTheme,
    // Older bot songs were stored as "Telegram Request"; never feed that back.
    episodeLabel: preset?.label ?? CUSTOM_LABEL,
    topic: last.customTopic ?? undefined,
    script: last.customScript ?? undefined,
    action,
    episodeId: last.id,
    intro: `${def?.emoji ?? "🎙️"} ${escapeHtml(def?.label ?? action)} — working on <b>${escapeHtml(last.title)}</b>…`,
  });
}

// ─── Settings ─────────────────────────────────────────────────────────────

/** /length [n|15s…120s] */
export async function handleLength(args: string[], msg: TelegramMessage) {
  const wanted = pick(DURATIONS, (args[0] || "").replace(/^(\d{2,3})$/, "$1s"));
  if (wanted) {
    updateSession(msg.chat.id, { duration: wanted.key });
    await say(msg.chat.id, `⏱️ Songs will now be ${wanted.key}.`, "send length set");
    return;
  }
  await say(
    msg.chat.id,
    `⏱️ Current length: <b>${chatPrefs(msg).duration}</b> — send <code>/length 30s</code>\n\n` +
      DURATIONS.map((d) => `${d.key} — ${escapeHtml(d.label.split(" — ")[1] ?? d.label)}`).join("\n"),
    "send length options",
  );
}

/** /mood [n|key] */
export async function handleMood(args: string[], msg: TelegramMessage) {
  const wanted = pick(INTENSITIES, args[0]);
  if (wanted) {
    updateSession(msg.chat.id, { intensity: wanted.key });
    await say(msg.chat.id, `🎭 Mood set to ${escapeHtml(wanted.label)}.`, "send mood set");
    return;
  }
  await say(
    msg.chat.id,
    `🎭 Current mood: <b>${chatPrefs(msg).intensity}</b> — send <code>/mood 4</code>\n\n` +
      INTENSITIES.map((m, i) => `${i + 1}. ${escapeHtml(m.label)} — ${escapeHtml(m.hint)}`).join("\n"),
    "send mood options",
  );
}

/** /style [n|key] — crooner style. */
export async function handleStyle(args: string[], msg: TelegramMessage) {
  const wanted = pick(CROONER_STYLES, args[0]);
  if (wanted) {
    updateSession(msg.chat.id, { croonerStyle: wanted.key });
    await say(msg.chat.id, `${wanted.emoji} Style set to ${escapeHtml(wanted.label)}.`, "send style set");
    return;
  }
  await say(
    msg.chat.id,
    `🎷 Current style: <b>${chatPrefs(msg).croonerStyle}</b> — send <code>/style 2</code>\n\n` +
      CROONER_STYLES.map(
        (s, i) => `${i + 1}. ${s.emoji} <b>${escapeHtml(s.label)}</b> — ${escapeHtml(s.description)}`,
      ).join("\n"),
    "send style options",
  );
}

/** /language [n|key] — the language Joe sings in. */
export async function handleLanguage(args: string[], msg: TelegramMessage) {
  const wanted = pick(LANGUAGES, args[0]);
  if (wanted) {
    updateSession(msg.chat.id, { language: wanted.key });
    await say(msg.chat.id, `${wanted.flag} Joe will sing in ${escapeHtml(wanted.label)}.`, "send language set");
    return;
  }
  await say(
    msg.chat.id,
    `🌍 Current language: <b>${chatPrefs(msg).language}</b> — send <code>/language 2</code>\n\n` +
      LANGUAGES.map((l, i) => `${i + 1}. ${l.flag} ${escapeHtml(l.label)}`).join("\n"),
    "send language options",
  );
}

/** /settings — everything the next song will use. */
export async function handleSettings(_args: string[], msg: TelegramMessage) {
  const p = chatPrefs(msg);
  await say(
    msg.chat.id,
    `⚙️ <b>Next song</b>\n\n` +
      `⏱️ Length: ${p.duration}  (/length)\n` +
      `🎭 Mood: ${p.intensity}  (/mood)\n` +
      `🎷 Style: ${p.croonerStyle}  (/style)\n` +
      `🌍 Language: ${p.language}  (/language)`,
    "send settings",
  );
}
