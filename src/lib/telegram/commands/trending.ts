// /src/lib/telegram/commands/trending.ts — /trending: today's trends as song ideas.
//
//   /trending          list ideas, one "🎙️ Sing" button each
//   /trending refresh  pull fresh trends first
//
// The buttons carry an index into the list saved in the chat's session, so a
// tap sings exactly the idea that was shown, even after the cache moves on.

import { tg, safeReply } from "../bot";
import type { InlineKeyboardMarkup, TelegramCallbackQuery, TelegramMessage } from "../types";
import { escapeHtml, startSong } from "../song-flow";
import { getSession, updateSession } from "../sessions";
import { getTrendingIdeas, type TrendIdea } from "@/lib/trending";

export const TREND_CALLBACK_PREFIX = "tr:";

async function say(chatId: number, text: string, replyMarkup?: InlineKeyboardMarkup) {
  return safeReply(
    () => tg.sendMessage({ chat_id: chatId, text, parse_mode: "HTML", ...(replyMarkup ? { reply_markup: replyMarkup } : {}) }),
    "send trending",
  );
}

export function trendKeyboard(ideas: TrendIdea[]): InlineKeyboardMarkup {
  return {
    inline_keyboard: ideas.map((idea, i) => [
      { text: `🎙️ ${i + 1}. ${idea.label}`.slice(0, 60), callback_data: `${TREND_CALLBACK_PREFIX}${i}` },
    ]),
  };
}

export async function handleTrending(args: string[], msg: TelegramMessage) {
  const chatId = msg.chat.id;
  const refresh = (args[0] || "").toLowerCase() === "refresh";
  const status = await say(chatId, `🔥 Reading today's headlines…`);
  try {
    const { ideas } = await getTrendingIdeas({ refresh });
    if (!ideas.length) {
      await say(chatId, `Nothing singable is trending right now — try <code>/trending refresh</code> later.`);
      return;
    }
    getSession(chatId, msg.from?.username || "", msg.from?.first_name || "");
    updateSession(chatId, { trendIdeas: ideas });
    const text =
      `🔥 <b>Trending now</b> — tap one and Joe sings it:\n\n` +
      ideas.map((idea, i) => `<b>${i + 1}. ${escapeHtml(idea.label)}</b>\n<i>${escapeHtml(idea.topic)}</i>`).join("\n\n");
    if (status) {
      const edited = await safeReply(
        () =>
          tg
            .editMessageText({ chat_id: chatId, message_id: status.message_id, text, parse_mode: "HTML", reply_markup: trendKeyboard(ideas) })
            .then(() => true),
        "edit trending",
      );
      if (edited) return;
    }
    await say(chatId, text, trendKeyboard(ideas));
  } catch (err) {
    console.error("[telegram.trending] failed", err);
    await say(chatId, `😵 Couldn't read the trends: ${escapeHtml(err instanceof Error ? err.message : String(err))}`);
  }
}

/** A "🎙️ Sing" button. */
export async function handleTrendCallback(cq: TelegramCallbackQuery) {
  const chatId = cq.message?.chat.id;
  const answer = (text: string) => safeReply(() => tg.answerCallbackQuery(cq.id, text), "answer trend callback");
  if (!chatId || !cq.message) return void (await answer("This button has expired."));

  const idx = Number((cq.data || "").slice(TREND_CALLBACK_PREFIX.length));
  const raw = getSession(chatId, cq.from.username || "", cq.from.first_name || "").trendIdeas;
  const idea = Array.isArray(raw) ? (raw as TrendIdea[])[idx] : undefined;
  if (!idea) return void (await answer("That list has expired — run /trending again."));

  await answer(`Joe is on it: ${idea.label}`);
  // startSong reads the chat's prefs from msg.from, so speak as the tapper.
  await startSong(
    { ...cq.message, from: cq.from },
    {
      episodeKey: "custom",
      episodeLabel: "Trending",
      topic: idea.topic,
      action: "generate",
      intro: `🔥 <b>${escapeHtml(idea.label)}</b>\nJoe is writing a song about it…`,
    },
  );
}
