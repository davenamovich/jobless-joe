// /src/lib/telegram/commands/meme.ts — /meme: stickman Joe memes as photos.
//
//   /meme            three memes from the most recent song
//   /meme 5          five of them (1-5)
//   /meme <topic>    three memes about anything

import { tg, safeReply, tryAcquireRateLimit } from "../bot";
import type { TelegramMessage } from "../types";
import { escapeHtml } from "../song-flow";
import { renderMemePng, writeMemes, type MemeSource } from "@/lib/joe-memes";
import { songMemeSource } from "@/lib/meme-source";

const DEFAULT_COUNT = 3;
const MAX_COUNT = 5;

// One batch at a time per chat.
const busyChats = new Set<number>();

async function say(chatId: number, text: string, label: string) {
  return safeReply(() => tg.sendMessage({ chat_id: chatId, text, parse_mode: "HTML" }), label);
}

/** "/meme 4" → count 4; "/meme 4 robots" → count 4 + topic; "/meme robots" → topic. */
export function parseMemeArgs(args: string[]): { count: number; topic: string } {
  const n = Number(args[0]);
  const hasCount = Number.isInteger(n) && n >= 1 && n <= MAX_COUNT;
  return {
    count: hasCount ? n : DEFAULT_COUNT,
    topic: (hasCount ? args.slice(1) : args).join(" ").trim().slice(0, 300),
  };
}

export async function handleMeme(args: string[], msg: TelegramMessage) {
  const chatId = msg.chat.id;
  if (busyChats.has(chatId)) {
    await say(chatId, `🎨 Joe is still drawing your last batch — hang tight.`, "send meme busy");
    return;
  }
  if (tryAcquireRateLimit(chatId)) {
    await say(chatId, `⏳ Slow down! Wait a few seconds before trying again.`, "send meme rate limit");
    return;
  }

  const { count, topic } = parseMemeArgs(args);
  const source: MemeSource | null = topic ? { topic } : await songMemeSource();
  if (!source) {
    await say(chatId, `No song yet — make one with /song, or send <code>/meme your topic</code>.`, "send meme no song");
    return;
  }

  busyChats.add(chatId);
  try {
    const about = escapeHtml(source.title || source.topic || "the job hunt");
    await say(chatId, `🎨 Joe is drawing ${count} meme${count > 1 ? "s" : ""} about <b>${about}</b>…`, "send meme status");

    const memes = await writeMemes(source, count);
    let sent = 0;
    for (const m of memes) {
      try {
        const png = await renderMemePng(m);
        const ok = await safeReply(() => tg.sendPhotoFile(chatId, png).then(() => true), "send meme photo");
        if (ok) sent++;
      } catch (err) {
        console.error("[telegram.meme] render failed", err);
      }
    }
    await say(
      chatId,
      sent > 0
        ? `More: /meme · About anything: <code>/meme your topic</code> · New song: /song`
        : `😵 Joe dropped his pencil — no memes this time. Try /meme again in a moment.`,
      "send meme done",
    );
  } finally {
    busyChats.delete(chatId);
  }
}
