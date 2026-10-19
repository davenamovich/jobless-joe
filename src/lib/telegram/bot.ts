// ─── Telegram Bot Utilities & API Client ───────────────────────────────────────
// Shared helpers, rate limiter, conversation state, and menu keyboard.
// All handler logic lives in handlers/message.ts, handlers/callback.ts, and
// commands/. The webhook routes through process.ts → these handlers.
//
// Exports:
//   tg                          — Telegram API helpers
//   safeReply                   — error-wrapped Telegram API call
//   tryAcquireRateLimit         — per-chat cooldown guard
//   conversations / getState / setState — in-memory conversation state
//   buildMainMenuKeyboard       — main menu inline keyboard
//   showMainMenu                — sends the main menu to a chat

import {
  type ConversationState,
  sendMessage,
  editMessageText,
  answerCallbackQuery,
  sendAudioFile,
  sendPhotoFile,
} from "./types";

// ─── Telegram API client ──────────────────────────────────────────────────

export const tg = {
  sendMessage,
  editMessageText,
  answerCallbackQuery,
  sendAudioFile,
  sendPhotoFile,
};

// ─── Robustness utilities ─────────────────────────────────────────────────
// Wrap every outbound Telegram call in this. Telegram calls can 403/400 for
// reasons outside your control (user blocked the bot, chat not found from a
// test webhook, etc.) — never let that throw and 500 the webhook handler.

export async function safeReply<T>(fn: () => Promise<T>, label: string): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("403") || msg.includes("400") || msg.includes("chat not found")) {
      console.warn(`[bot] ${label}: Telegram API rejected (likely simulated webhook) — ${msg}`);
    } else {
      console.error(`[bot] ${label}: ${msg}`);
    }
    return undefined;
  }
}

// ─── Rate limiter ─────────────────────────────────────────────────────────
// Per-chat cooldown so one user can't spam expensive generation work.
// Returns true if the caller should BLOCK (still cooling down).

const rateLimiters = new Map<number, number>();
const RATE_LIMIT_MS = 10_000;

export function tryAcquireRateLimit(chatId: number): boolean {
  const last = rateLimiters.get(chatId) || 0;
  if (Date.now() - last < RATE_LIMIT_MS) return true;
  rateLimiters.set(chatId, Date.now());
  return false;
}

// ─── In-memory conversation state ─────────────────────────────────────────
// Per-process, lost on redeploy. Use this for "what step of a multi-turn
// flow is this chat in right now" — not for anything that needs to survive
// a restart (that's TelegramSession in sessions.ts).

export const conversations = new Map<number, ConversationState>();

export function getState(chatId: number): ConversationState {
  return conversations.get(chatId) || { stage: "idle", chatId, startedAt: Date.now() };
}

export function setState(chatId: number, state: Partial<ConversationState>) {
  const current = getState(chatId);
  conversations.set(chatId, { ...current, ...state });
}

// ─── Main Menu ────────────────────────────────────────────────────────────
// Text-only for now: everything is a slash command or a plain-text topic, so
// there are no inline buttons (and no callback handler) to keep in sync.

/** Shown in Telegram's "/" menu (setMyCommands) and in /help. */
export const BOT_COMMANDS: { command: string; description: string }[] = [
  { command: "song", description: "Write a song about a topic" },
  { command: "lyrics", description: "Joe sings your own lyrics" },
  { command: "episode", description: "Sing a story episode" },
  { command: "next", description: "Continue the story" },
  { command: "arc", description: "The season's story arc" },
  { command: "ralph", description: "Pitch ideas to Ralph, Joe's head writer" },
  { command: "funnier", description: "Remix the last song: funnier" },
  { command: "sharper", description: "Remix the last song: sharper punchlines" },
  { command: "attitude", description: "Remix the last song: more attitude" },
  { command: "ending", description: "Remix the last song: bigger ending" },
  { command: "ad", description: "Remix the last song: 30-second ad" },
  { command: "meme", description: "Stickman Joe memes of the last song (or /meme <topic>)" },
  { command: "video", description: "Stickman Joe music video of the last song (preview, then MP4)" },
  { command: "length", description: "Song length (15s to 120s)" },
  { command: "mood", description: "Comedy intensity" },
  { command: "style", description: "Crooner style" },
  { command: "language", description: "Language Joe sings in" },
  { command: "settings", description: "Show settings for the next song" },
  { command: "help", description: "How this works" },
];

export const HELP_TEXT =
  `🎙️ <b>Jobless Joe — Crooner Song Engine</b>\n\n` +
  `Send me a topic and Joe writes, sings and publishes a song about it — ` +
  `or paste your own lyrics (4+ lines) and he sings those. ` +
  `You get back a link to a song page with a player, MP3 download and lyrics.\n\n` +
  BOT_COMMANDS.map((c) => `/${c.command} — ${c.description}`).join("\n");

export async function showMainMenu(chatId: number) {
  await safeReply(
    () => sendMessage({ chat_id: chatId, text: HELP_TEXT, parse_mode: "HTML" }),
    "show main menu",
  );
}
