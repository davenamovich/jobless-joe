// /src/lib/telegram/process.ts — Dispatch an incoming Telegram update to the right handler.
// Called fire-and-forget from the webhook route so we never block the 200 response.

import type { TelegramUpdate } from "./types";
import { dispatch, register } from "./commands/registry";
import { sendMessage, getTelegramConfig } from "./types";
import { handleStart } from "./commands/start";
import { handleHelp } from "./commands/help";
import * as song from "./commands/song";
import { handleMeme } from "./commands/meme";
import { handleVideo, handleMp4Callback, MP4_CALLBACK_PREFIX } from "./commands/video";
import { handleArc, handleRalph } from "./commands/ralph";
import { answerCallbackQuery } from "./types";
import { handleNonCommandMessage } from "./handlers/message";

// Register all commands once, at module load. Keep BOT_COMMANDS in bot.ts in
// sync so they show up in Telegram's "/" menu.
register("start", handleStart);
register("help", handleHelp);
register("song", song.handleSong);
register("lyrics", song.handleLyrics);
register("episode", song.handleEpisode);
register("next", song.handleNext);
register("resetstory", song.handleResetStory);
register("ralph", handleRalph);
register("arc", handleArc);
register("funnier", song.handleFunnier);
register("sharper", song.handleSharper);
register("attitude", song.handleAttitude);
register("ending", song.handleEnding);
register("ad", song.handleAd);
register("meme", handleMeme);
register("video", handleVideo);
register("length", song.handleLength);
register("mood", song.handleMood);
register("style", song.handleStyle);
register("language", song.handleLanguage);
register("settings", song.handleSettings);

export async function processUpdate(update: TelegramUpdate): Promise<void> {
  try {
    // Handle callback queries (inline keyboard button presses).
    const config = getTelegramConfig();

    if (update.callback_query) {
      const cq = update.callback_query;
      const cqChat = String(cq.message?.chat.id ?? "");
      if (config.allowedChatIds.length > 0 && !config.allowedChatIds.includes(cqChat)) {
        await answerCallbackQuery(cq.id, "🔒 This bot is private.").catch(() => {});
        return;
      }
      if (cq.data?.startsWith(MP4_CALLBACK_PREFIX)) await handleMp4Callback(cq);
      else await answerCallbackQuery(cq.id).catch(() => {});
      return;
    }

    const msg = update.message;
    if (!msg) return;

    // Auth check: if allowedChatIds is set, only respond to those chats.
    if (config.allowedChatIds.length > 0) {
      const chatIdStr = String(msg.chat.id);
      if (!config.allowedChatIds.includes(chatIdStr)) {
        await sendMessage({
          chat_id: msg.chat.id,
          text: "🔒 This bot is private. Contact the owner for access.",
        });
        return;
      }
    }

    // Try command dispatch (text-only messages).
    if (msg.text) {
      const handled = await dispatch(msg);
      if (handled) return;

      // Fall through to non-command message handler.
      await handleNonCommandMessage(msg);
    }
  } catch (err) {
    console.error("[telegram.process] update failed", update.update_id, err);
  }
}
