// /src/lib/telegram/commands/video.ts — /video: stickman Joe music video.
//
// Two steps, so nobody pays for an MP4 they didn't want:
//   1. /video publishes a temp page (here.now) where Joe acts out the most
//      recent song, and replies with the link plus a "🎬 Make MP4" button.
//   2. The button sends that page to Plunder & Riffle's request_mp4 (25
//      credits, 1–3 min) and posts the finished MP4 back into the chat.
//
// The button carries a short token; the page it points at is kept in the
// chat's session (last few only), so it survives a restart.

import { randomBytes } from "node:crypto";
import { tg, safeReply, tryAcquireRateLimit } from "../bot";
import { telegramApi, type InlineKeyboardMarkup, type TelegramCallbackQuery, type TelegramMessage } from "../types";
import { db } from "@/lib/db";
import { escapeHtml, postJson } from "../song-flow";
import { getSession, updateSession } from "../sessions";
import { loadBackendConfig } from "@/lib/ai-backend";
import { waitForMp4, type PrConfig } from "@/lib/pr-mcp";
import { postMp4ToSocials } from "@/lib/upload-post";

export const MP4_CALLBACK_PREFIX = "mp4:";
export const POST_CALLBACK_PREFIX = "up:";
const KEEP_PAGES = 5;
const MP4_POLL_MS = 15_000;
const MP4_GIVE_UP_MS = 6 * 60_000;

export interface VideoPageRef {
  token: string;
  url: string;
  title: string;
  createdAt: number;
  /** The song this video is of — for its YouTube SEO copy when posting. */
  episodeId?: string;
  mp4Url?: string;
  /** Upload-Post request id once this MP4 was posted — never post twice. */
  postRequestId?: string;
}

// One video job (page or MP4) at a time per chat.
const busyChats = new Set<number>();

async function say(chatId: number, text: string, label: string, replyMarkup?: InlineKeyboardMarkup) {
  return safeReply(
    () => tg.sendMessage({ chat_id: chatId, text, parse_mode: "HTML", ...(replyMarkup ? { reply_markup: replyMarkup } : {}) }),
    label,
  );
}

function storedPages(chatId: number, handle = "", firstName = ""): VideoPageRef[] {
  const raw = getSession(chatId, handle, firstName).videoPages;
  return Array.isArray(raw) ? (raw as VideoPageRef[]) : [];
}

/** Newest first, capped, with this one replaced if its token is already there. */
export function rememberPage(list: VideoPageRef[], ref: VideoPageRef, keep = KEEP_PAGES): VideoPageRef[] {
  return [ref, ...list.filter((p) => p.token !== ref.token)].slice(0, keep);
}

export function previewKeyboard(ref: Pick<VideoPageRef, "token" | "url">, withMp4 = true): InlineKeyboardMarkup {
  const row = [{ text: "▶️ Watch preview", url: ref.url }];
  return {
    inline_keyboard: withMp4 ? [row, [{ text: "🎬 Make MP4", callback_data: MP4_CALLBACK_PREFIX + ref.token }]] : [row],
  };
}

/** /video — publish the stickman preview page for the most recent song. */
export async function handleVideo(_args: string[], msg: TelegramMessage) {
  const chatId = msg.chat.id;
  if (busyChats.has(chatId)) {
    await say(chatId, `🎬 Joe is still on set with your last video — hang tight.`, "send video busy");
    return;
  }
  if (tryAcquireRateLimit(chatId)) {
    await say(chatId, `⏳ Slow down! Wait a few seconds before trying again.`, "send video rate limit");
    return;
  }
  const last = await db.episode.findFirst({ orderBy: { createdAt: "desc" } });
  if (!last) {
    await say(chatId, `No song yet — make one with /song first.`, "send video no song");
    return;
  }

  busyChats.add(chatId);
  const status = await say(chatId, `🎬 Setting up a stickman preview of <b>${escapeHtml(last.title)}</b>…`, "send video status");
  try {
    const page = await postJson<{ url: string; title: string }>("/api/stickman-video", { episodeId: last.id });
    const ref: VideoPageRef = {
      token: randomBytes(6).toString("hex"),
      url: page.url,
      title: page.title,
      createdAt: Date.now(),
      episodeId: last.id,
    };
    updateSession(chatId, {
      videoPages: rememberPage(storedPages(chatId, msg.from?.username || "", msg.from?.first_name || ""), ref),
    });

    const text =
      `🎬 <b>${escapeHtml(page.title)}</b> — stickman preview\n\n${page.url}\n\n` +
      `<i>Temporary page — tap play to watch Joe act it out. Looks good? Tap 🎬 Make MP4 for a video file.</i>`;
    const edited = status
      ? await safeReply(
          () =>
            tg
              .editMessageText({ chat_id: chatId, message_id: status.message_id, text, parse_mode: "HTML", reply_markup: previewKeyboard(ref) })
              .then(() => true),
          "edit video status",
        )
      : undefined;
    if (!edited) await say(chatId, text, "send video preview", previewKeyboard(ref));
  } catch (err) {
    console.error("[telegram.video] preview failed", err);
    await say(chatId, `😵 Couldn't set up the preview: ${escapeHtml(err instanceof Error ? err.message : String(err))}`, "send video error");
  } finally {
    busyChats.delete(chatId);
  }
}

/** Ask P&R for the MP4 and wait for it (polling), up to MP4_GIVE_UP_MS. */
async function renderMp4(client: PrConfig, pageUrl: string): Promise<string> {
  return waitForMp4(client, pageUrl, { pollMs: MP4_POLL_MS, giveUpMs: MP4_GIVE_UP_MS });
}

/** The 🎬 Make MP4 button. */
export async function handleMp4Callback(cq: TelegramCallbackQuery) {
  const chatId = cq.message?.chat.id;
  const token = (cq.data || "").slice(MP4_CALLBACK_PREFIX.length);
  const answer = (text: string) => safeReply(() => tg.answerCallbackQuery(cq.id, text), "answer mp4 callback");
  if (!chatId) return void (await answer("This button has expired."));

  const pages = storedPages(chatId, cq.from.username || "", cq.from.first_name || "");
  const ref = pages.find((p) => p.token === token);
  if (!ref) return void (await answer("That preview has expired — run /video again."));
  if (busyChats.has(chatId)) return void (await answer("Joe is already filming — hang tight."));

  // Already made: just send it again, never pay twice.
  if (ref.mp4Url) {
    await answer("Sending the MP4 again.");
    await sendMp4(chatId, ref);
    return;
  }

  const cfg = await loadBackendConfig();
  if (!cfg.prApiKey.trim()) {
    await answer("MP4s need a Plunder & Riffle API key.");
    await say(chatId, `🔑 Add your Plunder & Riffle API key in the app's Backend settings to make MP4s.`, "send mp4 no key");
    return;
  }

  busyChats.add(chatId);
  await answer("Filming the MP4 — 1 to 3 minutes.");
  // Drop the MP4 button so it can't be tapped twice; keep the preview link.
  if (cq.message) {
    await safeReply(
      () => telegramApi("editMessageReplyMarkup", { chat_id: chatId, message_id: cq.message!.message_id, reply_markup: previewKeyboard(ref, false) }),
      "drop mp4 button",
    );
  }
  await say(chatId, `🎥 Filming <b>${escapeHtml(ref.title)}</b> to MP4 — usually 1–3 minutes…`, "send mp4 status");
  try {
    const mp4Url = await renderMp4({ mcpUrl: cfg.prMcpUrl, apiKey: cfg.prApiKey }, ref.url);
    const saved = { ...ref, mp4Url };
    updateSession(chatId, { videoPages: rememberPage(storedPages(chatId), saved) });
    await sendMp4(chatId, saved);
  } catch (err) {
    console.error("[telegram.video] mp4 failed", err);
    await say(chatId, `😵 ${escapeHtml(err instanceof Error ? err.message : String(err))}`, "send mp4 error", previewKeyboard(ref));
  } finally {
    busyChats.delete(chatId);
  }
}

export function postKeyboard(ref: Pick<VideoPageRef, "token">): InlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "📤 Post to socials", callback_data: POST_CALLBACK_PREFIX + ref.token }]] };
}

/** Post the MP4 as a video; fall back to the link if Telegram won't fetch it. */
async function sendMp4(chatId: number, ref: VideoPageRef & { mp4Url?: string }) {
  if (!ref.mp4Url) return;
  const caption = `🎬 <b>${escapeHtml(ref.title)}</b>\n<i>Hosted ~24h — save it now.</i>`;
  const cfg = await loadBackendConfig();
  // Only offer the button when Upload-Post is set up and this one isn't posted yet.
  const markup = cfg.upApiKey.trim() && !ref.postRequestId ? postKeyboard(ref) : undefined;
  const sent = await safeReply(
    () =>
      telegramApi("sendVideo", {
        chat_id: chatId,
        video: ref.mp4Url,
        caption,
        parse_mode: "HTML",
        supports_streaming: true,
        ...(markup ? { reply_markup: markup } : {}),
      }).then(() => true),
    "send mp4 video",
  );
  if (!sent) await say(chatId, `${caption}\n\n${ref.mp4Url}`, "send mp4 link", markup);
}

/** The 📤 Post to socials button. */
export async function handlePostCallback(cq: TelegramCallbackQuery) {
  const chatId = cq.message?.chat.id;
  const token = (cq.data || "").slice(POST_CALLBACK_PREFIX.length);
  const answer = (text: string) => safeReply(() => tg.answerCallbackQuery(cq.id, text), "answer post callback");
  if (!chatId) return void (await answer("This button has expired."));

  const ref = storedPages(chatId, cq.from.username || "", cq.from.first_name || "").find((p) => p.token === token);
  if (!ref?.mp4Url) return void (await answer("That video has expired — run /video again."));
  if (ref.postRequestId) return void (await answer("Already posted."));
  if (busyChats.has(chatId)) return void (await answer("Joe is busy — try again in a moment."));

  busyChats.add(chatId);
  await answer("Posting to socials…");
  if (cq.message) {
    await safeReply(
      () => telegramApi("editMessageReplyMarkup", { chat_id: chatId, message_id: cq.message!.message_id, reply_markup: { inline_keyboard: [] } }),
      "drop post button",
    );
  }
  try {
    const { requestId, summary } = await postMp4ToSocials(ref.mp4Url, ref.title, { episodeId: ref.episodeId });
    updateSession(chatId, { videoPages: rememberPage(storedPages(chatId), { ...ref, postRequestId: requestId }) });
    await say(chatId, `📤 <b>${escapeHtml(ref.title)}</b>\n${escapeHtml(summary)}`, "send post result");
  } catch (err) {
    console.error("[telegram.video] post failed", err);
    await say(chatId, `😵 ${escapeHtml(err instanceof Error ? err.message : String(err))}`, "send post error", postKeyboard(ref));
  } finally {
    busyChats.delete(chatId);
  }
}
