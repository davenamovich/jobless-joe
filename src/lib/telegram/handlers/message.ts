// /src/lib/telegram/handlers/message.ts — Route non-command messages.
// Plain text is the song's subject: a short message is a topic, and a pasted
// multi-line lyric is used as the script Joe sings from.

import { tg, safeReply, showMainMenu } from "../bot";
import type { TelegramMessage } from "../types";
import { getSession } from "../sessions";
import { escapeHtml, startSong } from "../song-flow";
import { MAX_SCRIPT_CHARS, MIN_SCRIPT_CHARS } from "@/lib/joe-prompts";

/** Same label the web UI sends, so the bot never names itself in the prompt. */
export const CUSTOM_LABEL = "Custom Topic";

/** Four or more lines reads as pasted lyrics, not a topic. */
const LYRIC_MIN_LINES = 4;

export async function handleNonCommandMessage(msg: TelegramMessage): Promise<void> {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();

  getSession(chatId, msg.from?.username || "", msg.from?.first_name || "");

  // /menu — resurface the main menu anywhere
  if (text === "/menu") {
    await showMainMenu(chatId);
    return;
  }

  // Unknown slash command — don't write a song about "/foo".
  if (text.startsWith("/")) {
    await safeReply(
      () => tg.sendMessage({ chat_id: chatId, text: `Unknown command. Try /help.` }),
      "send unknown command",
    );
    return;
  }

  const lines = text.split(/\r?\n/).filter((l) => l.trim()).length;
  if (lines >= LYRIC_MIN_LINES) {
    await requestLyricSong(msg, text);
    return;
  }
  await requestTopicSong(msg, text);
}

/** A song about a topic or a bit of context. Shared by plain text and /song. */
export async function requestTopicSong(msg: TelegramMessage, topic: string): Promise<void> {
  if (topic.length < 3) {
    await safeReply(
      () =>
        tg.sendMessage({
          chat_id: msg.chat.id,
          text:
            `Tell me what the song should be about, e.g.\n<i>/song my landlord discovers ChatGPT</i>\n\n` +
            `Or paste lyrics (4+ lines) and Joe will sing those.`,
          parse_mode: "HTML",
        }),
      "send topic prompt",
    );
    return;
  }

  await startSong(msg, {
    episodeKey: "custom",
    episodeLabel: CUSTOM_LABEL,
    topic,
    action: "generate",
    intro: `✍️ Joe is writing a song about:\n<i>${escapeHtml(topic.slice(0, 300))}</i>`,
  });
}

/** A song sung from the user's own lyrics. Shared by pasted lyrics and /lyrics. */
export async function requestLyricSong(msg: TelegramMessage, lyrics: string): Promise<void> {
  if (lyrics.length < MIN_SCRIPT_CHARS) {
    await safeReply(
      () =>
        tg.sendMessage({
          chat_id: msg.chat.id,
          text: `Paste the lyrics after the command, e.g.\n<i>/lyrics</i> followed by your verses on new lines.`,
          parse_mode: "HTML",
        }),
      "send lyrics prompt",
    );
    return;
  }
  if (lyrics.length > MAX_SCRIPT_CHARS) {
    await safeReply(
      () =>
        tg.sendMessage({
          chat_id: msg.chat.id,
          text: `Those lyrics are ${lyrics.length} characters — keep them under ${MAX_SCRIPT_CHARS}.`,
        }),
      "send lyrics too long",
    );
    return;
  }

  await startSong(msg, {
    episodeKey: "custom",
    episodeLabel: CUSTOM_LABEL,
    script: lyrics,
    action: "generate",
    intro: `✍️ Joe is setting your lyrics to music…`,
  });
}
