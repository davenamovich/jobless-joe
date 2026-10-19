// /src/lib/telegram/process.ts — Dispatch an incoming Telegram update to the right handler.
// Called fire-and-forget from the webhook route so we never block the 200 response.

import type { TelegramUpdate } from "./types";
import { dispatch, register } from "./commands/registry";
import { sendMessage, getTelegramConfig } from "./types";
import { handleStart } from "./commands/start";
import { handleHelp } from "./commands/help";
import * as song from "./commands/song";
import { handleMeme } from "./commands/meme";
import { handleNonCommandMessage } from "./handlers/message";

// Register all commands once, at module load. Keep BOT_COMMANDS in bot.ts in
// sync so they show up in Telegram's "/" menu.
register("start", handleStart);
register("help", handleHelp);
register("song", song.handleSong);
register("lyrics", song.handleLyrics);
register("episode", song.handleEpisode);
register("next", song.handleNext);
register("funnier", song.handleFunnier);
register("sharper", song.handleSharper);
register("attitude", song.handleAttitude);
register("ending", song.handleEnding);
register("ad", song.handleAd);
register("meme", handleMeme);
register("length", song.handleLength);
register("mood", song.handleMood);
register("style", song.handleStyle);
register("language", song.handleLanguage);
register("settings", song.handleSettings);

export async function processUpdate(update: TelegramUpdate): Promise<void> {
  try {
    // Handle callback queries (inline keyboard button presses).
    if (update.callback_query) {
      // await handleCallbackQuery(update.callback_query);
      return;
    }

    const msg = update.message;
    if (!msg) return;

    const config = getTelegramConfig();

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
