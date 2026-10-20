// ─── Telegram Bot Types & Configuration ─────────────────────────────────────────
// Lightweight types for the Telegram Bot API (no external deps — raw fetch only).
// We only model the subset of the API we use: messages, callback queries, and
// inline keyboards. This keeps the bundle size zero and avoids framework lock-in.

// ─── Environment Config ────────────────────────────────────────────────────────

export function getTelegramConfig() {
  return {
    botToken: process.env.TELEGRAM_BOT_TOKEN || "",
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || "",
    /** The public URL where the bot webhook is registered (e.g. https://yourdomain.com/api/telegram/webhook) */
    webhookUrl: process.env.TELEGRAM_WEBHOOK_URL || "",
    /** Chat IDs allowed to use the bot (comma-separated). Empty = allow all. */
    allowedChatIds: (process.env.TELEGRAM_ALLOWED_CHAT_IDS || "").split(",").filter(Boolean),
  };
}

// ─── Telegram Bot API Types (subset) ────────────────────────────────────────────

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramMessageEntity {
  type: "url" | "text_link" | "mention" | "hashtag" | "bot_command" | "bold" | "italic" | string;
  offset: number;
  length: number;
  url?: string;
  user?: TelegramUser;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  /** Text sent along with a file. */
  caption?: string;
  audio?: { file_id: string; file_name?: string; file_size?: number; mime_type?: string; title?: string; performer?: string };
  voice?: { file_id: string; file_size?: number; mime_type?: string };
  document?: { file_id: string; file_name?: string; file_size?: number; mime_type?: string };
  entities?: TelegramMessageEntity[];
  reply_to_message?: TelegramMessage;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  chat_instance: string;
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

export interface SendMessageParams {
  chat_id: number | string;
  text: string;
  parse_mode?: "HTML" | "Markdown" | "MarkdownV2";
  reply_markup?: InlineKeyboardMarkup;
  reply_to_message_id?: number;
  disable_web_page_preview?: boolean;
}

export interface EditMessageTextParams {
  chat_id: number | string;
  message_id: number;
  text: string;
  parse_mode?: "HTML" | "MarkdownV2";
  reply_markup?: InlineKeyboardMarkup;
}

export interface AnswerCallbackQueryParams {
  callback_query_id: string;
  text?: string;
  show_alert?: boolean;
}

// ─── Session state (persisted to JSON file) ─────────────────────────────────

export type BotStep = "idle" | "awaiting_input";

export interface TelegramSession {
  chatId: number;
  telegramHandle: string;
  firstName: string;
  step: BotStep;
  /** User's default CTA link, language pref, or any other per-user setting your service needs. */
  [key: string]: unknown;
  createdAt: number;
  updatedAt: number;
}

// ─── Conversation State (in-memory, per-process) ────────────────────────────
// Tracks where a user is mid-flow. Lost on redeploy/restart — fine for
// short-lived flows; use TelegramSession (JSON file) for anything durable.

export type ConversationStage = "idle" | "processing" | "reviewing";

export interface ConversationState {
  stage: ConversationStage;
  chatId: number;
  messageId?: number; // The bot's last message (for editing)
  startedAt: number;
  [key: string]: unknown;
}

// ─── Telegram API Helper ─────────────────────────────────────────────────────────

const TELEGRAM_API = "https://api.telegram.org";

export async function telegramApi(method: string, params: any): Promise<unknown> {
  const { botToken } = getTelegramConfig();
  if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN not set");

  const res = await fetch(`${TELEGRAM_API}/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  const data = await res.json();
  if (!data.ok) {
    console.error(`[Telegram] API error (${method}):`, data.description);
    throw new Error(`Telegram API ${method} failed: ${data.description}`);
  }
  return data.result;
}

export async function getFileUrl(fileId: string): Promise<string> {
  const result: any = await telegramApi("getFile", { file_id: fileId });
  const { botToken } = getTelegramConfig();
  return `https://api.telegram.org/file/bot${botToken}/${result.file_path}`;
}

export async function sendMessage(params: SendMessageParams): Promise<TelegramMessage> {
  return telegramApi("sendMessage", params) as Promise<TelegramMessage>;
}

export async function editMessageText(
  chatIdOrParams: number | string | EditMessageTextParams,
  messageId?: number,
  text?: string,
  replyMarkup?: InlineKeyboardMarkup,
): Promise<void> {
  if (typeof chatIdOrParams === "object") {
    await telegramApi("editMessageText", chatIdOrParams);
  } else {
    await telegramApi("editMessageText", {
      chat_id: chatIdOrParams,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      reply_markup: replyMarkup,
      disable_web_page_preview: false,
    });
  }
}

export async function answerCallbackQuery(
  callbackQueryIdOrParams: string | AnswerCallbackQueryParams,
  text?: string,
): Promise<void> {
  if (typeof callbackQueryIdOrParams === "object") {
    await telegramApi("answerCallbackQuery", callbackQueryIdOrParams);
  } else {
    await telegramApi("answerCallbackQuery", {
      callback_query_id: callbackQueryIdOrParams,
      text,
    });
  }
}

// ─── Optional: sending a file (e.g. generated audio/video) back to the user ──
// Swap "audio"/"sendAudio" for "video"/"sendVideo" or "document"/"sendDocument"
// if your service produces a different media type.

export async function sendPhotoFile(
  chatId: number | string,
  png: Buffer,
  caption?: string,
): Promise<void> {
  const { botToken } = getTelegramConfig();
  if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN not set");

  const fd = new FormData();
  fd.append("chat_id", String(chatId));
  fd.append("photo", new Blob([new Uint8Array(png)], { type: "image/png" }), "joe-meme.png");
  if (caption) {
    fd.append("caption", caption);
    fd.append("parse_mode", "HTML");
  }

  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
    method: "POST",
    body: fd,
  });
  const data = await res.json();
  if (!data.ok) {
    console.error(`[Telegram] sendPhotoFile failed:`, data.description);
    throw new Error(`Telegram API sendPhoto failed: ${data.description}`);
  }
}

export async function sendAudioFile(
  chatId: number | string,
  audioBase64: string,
  audioFormat: string,
  caption?: string,
  replyMarkup?: InlineKeyboardMarkup,
): Promise<void> {
  const { botToken } = getTelegramConfig();
  if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN not set");

  const fd = new FormData();
  fd.append("chat_id", String(chatId));

  const buffer = Buffer.from(audioBase64, "base64");
  const extension = audioFormat === "mp3" ? "mp3" : "wav";
  const mimeType = audioFormat === "mp3" ? "audio/mpeg" : "audio/wav";

  fd.append("audio", new Blob([buffer], { type: mimeType }), `output.${extension}`);

  if (caption) {
    fd.append("caption", caption);
    fd.append("parse_mode", "HTML");
  }
  if (replyMarkup) {
    fd.append("reply_markup", JSON.stringify(replyMarkup));
  }

  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendAudio`, {
    method: "POST",
    body: fd,
  });

  const data = await res.json();
  if (!data.ok) {
    console.error(`[Telegram] sendAudioFile failed:`, data.description);
    throw new Error(`Telegram API sendAudio failed: ${data.description}`);
  }
}
