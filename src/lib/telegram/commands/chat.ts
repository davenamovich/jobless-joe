// /src/lib/telegram/commands/chat.ts — Chat with Joe (Ralph-style, from meme-loop-engine).
// Plain text is a conversation: Joe answers in character, remembers the last
// dozen messages and a few facts about the person, and every reply carries a
// "Make it a song" button that sings about what they just told him.

import { tg, safeReply } from "../bot";
import { telegramApi, type TelegramCallbackQuery, type TelegramMessage } from "../types";
import { getSession, updateSession } from "../sessions";
import { joeChatReply, normalizeChat, normalizeFacts, songTopicFromChat, type JoeChatMemory } from "@/lib/joe-chat";
import { requestTopicSong } from "../handlers/message";

export const SONG_CALLBACK = "joesong";

const songKeyboard = {
  inline_keyboard: [[{ text: "🎙️ Make it a song", callback_data: SONG_CALLBACK }]],
};

function memoryFor(chatId: number, handle: string, firstName: string): JoeChatMemory {
  const sess = getSession(chatId, handle, firstName);
  return { messages: normalizeChat(sess.joeChat), facts: normalizeFacts(sess.joeFacts) };
}

/** Joe's reply to a plain-text message. */
export async function chatWithJoe(msg: TelegramMessage, text: string): Promise<void> {
  const chatId = msg.chat.id;
  const memory = memoryFor(chatId, msg.from?.username || "", msg.from?.first_name || "");
  await safeReply(() => telegramApi("sendChatAction", { chat_id: chatId, action: "typing" }), "send typing");

  const { reply, memory: next } = await joeChatReply({
    messages: [...memory.messages, { role: "user", text }],
    facts: memory.facts,
  });
  updateSession(chatId, { joeChat: next.messages, joeFacts: next.facts });

  await safeReply(
    () => tg.sendMessage({ chat_id: chatId, text: reply, reply_markup: songKeyboard }),
    "send joe chat reply",
  );
}

/** /newchat: Joe forgets the conversation (and what he learned). */
export async function handleNewChat(_args: string[], msg: TelegramMessage) {
  getSession(msg.chat.id, msg.from?.username || "", msg.from?.first_name || "");
  updateSession(msg.chat.id, { joeChat: [], joeFacts: [] });
  await safeReply(
    () => tg.sendMessage({ chat_id: msg.chat.id, text: "Fresh napkin, baby. What's the job hunt doing to you this week?" }),
    "send new chat",
  );
}

/** The 🎙️ Make it a song button under Joe's chat replies. */
export async function handleSongCallback(cq: TelegramCallbackQuery) {
  const chat = cq.message?.chat;
  await safeReply(() => tg.answerCallbackQuery(cq.id, "Joe's warming up…"), "answer song callback");
  if (!chat || !cq.message) return;

  const memory = memoryFor(chat.id, cq.from.username || "", cq.from.first_name || "");
  const topic = songTopicFromChat(memory);
  // The button sits on the bot's message; sing as the person who pressed it.
  await requestTopicSong({ ...cq.message, from: cq.from }, topic);
}
