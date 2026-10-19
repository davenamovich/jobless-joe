// /src/lib/telegram/commands/start.ts
import { tg, safeReply, HELP_TEXT } from "../bot";
import type { TelegramMessage } from "../types";
import { getSession, resetSession } from "../sessions";
import { escapeHtml } from "../song-flow";

export async function handleStart(_args: string[], msg: TelegramMessage) {
  const chatId = msg.chat.id;
  const handle = msg.from?.username || "unknown";
  const name = msg.from?.first_name || "Friend";

  getSession(chatId, handle, name);
  resetSession(chatId);

  await safeReply(
    () =>
      tg.sendMessage({
        chat_id: chatId,
        text:
          `👋 Hey ${escapeHtml(name)}!\n\n${HELP_TEXT}\n\n` +
          `Try: <i>Joe gets replaced by a self-checkout machine</i>`,
        parse_mode: "HTML",
      }),
    "send start menu",
  );
}
