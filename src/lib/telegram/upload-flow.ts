// /src/lib/telegram/upload-flow.ts — A song sent to the bot becomes an episode.
//
// Audio, voice notes, and audio sent as a file all land here: download it,
// transcribe + save it (lib/song-import.ts), publish the song page, and offer
// the stickman video. A caption, if any, is the title.

import { importSong } from "@/lib/song-import";
import { songPageStickmanEnabled } from "@/lib/song-page";
import { tg, safeReply, tryAcquireRateLimit } from "./bot";
import { escapeHtml, postJson } from "./song-flow";
import { getFileUrl, type TelegramMessage } from "./types";

/** Bots can only download files up to 20 MB. */
export const TELEGRAM_MAX_DOWNLOAD = 20 * 1024 * 1024;
const AUDIO_EXT = /\.(mp3|m4a|wav|ogg|oga|opus|flac|webm|aac)$/i;

export interface AudioAttachment {
  fileId: string;
  fileName: string;
  size?: number;
  /** Title from the file's own tags, when Telegram has one. */
  title?: string;
}

/** The song in this message, if there is one. */
export function audioAttachment(msg: TelegramMessage): AudioAttachment | null {
  if (msg.audio) {
    const { audio } = msg;
    const tagged = [audio.performer, audio.title].filter(Boolean).join(" - ");
    return { fileId: audio.file_id, fileName: audio.file_name || `${tagged || "song"}.mp3`, size: audio.file_size, title: audio.title };
  }
  if (msg.voice) return { fileId: msg.voice.file_id, fileName: "voice.ogg", size: msg.voice.file_size };
  const doc = msg.document;
  if (doc && (doc.mime_type?.startsWith("audio/") || AUDIO_EXT.test(doc.file_name || ""))) {
    return { fileId: doc.file_id, fileName: doc.file_name || "song.mp3", size: doc.file_size };
  }
  return null;
}

// One import at a time per chat.
const busyChats = new Set<number>();

async function say(chatId: number, text: string, label: string) {
  return safeReply(() => tg.sendMessage({ chat_id: chatId, text, parse_mode: "HTML" }), label);
}

export async function handleAudioMessage(msg: TelegramMessage, file: AudioAttachment): Promise<void> {
  const chatId = msg.chat.id;
  if (busyChats.has(chatId)) {
    await say(chatId, `🎧 Still transcribing your last song — one at a time.`, "send upload busy");
    return;
  }
  if (tryAcquireRateLimit(chatId)) {
    await say(chatId, `⏳ Slow down! Wait a few seconds before trying again.`, "send rate limit");
    return;
  }
  if (file.size && file.size > TELEGRAM_MAX_DOWNLOAD) {
    await say(
      chatId,
      `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — Telegram only lets bots download up to 20 MB. ` +
        `Send a smaller MP3, or drop it into the web app (up to 25 MB).`,
      "send upload too big",
    );
    return;
  }

  busyChats.add(chatId);
  const status = await say(chatId, `🎧 Got it — transcribing <b>${escapeHtml(file.fileName)}</b>…`, "send upload status");
  const update = async (text: string) => {
    if (status) {
      const edited = await safeReply(
        () => tg.editMessageText({ chat_id: chatId, message_id: status.message_id, text, parse_mode: "HTML" }).then(() => true),
        "edit upload status",
      );
      if (edited !== undefined) return;
    }
    await say(chatId, text, "send upload status (fallback)");
  };

  try {
    const res = await fetch(await getFileUrl(file.fileId), { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`Couldn't download the file from Telegram (${res.status}).`);
    const buffer = Buffer.from(await res.arrayBuffer());

    const result = await importSong({
      buffer,
      filename: file.fileName,
      title: msg.caption?.trim() || file.title,
      source: "telegram",
    });
    if (!result.ok) {
      await update(`😵 ${escapeHtml(result.error)}`);
      return;
    }

    const title = escapeHtml(result.title);
    await update(`📡 <b>${title}</b>\n\n${result.lines} lines transcribed. Publishing the song page…`);
    const page = await postJson<{ url: string; claimUrl?: string; ttlSeconds?: number }>("/api/song-page", {
      episodeId: result.episodeId,
    });
    const hours = Math.round((page.ttlSeconds ?? 24 * 3600) / 3600);
    const expiry = page.claimUrl ? `\n\n<i>Temporary page — gone in ~${hours}h.</i>` : "";
    const stage = songPageStickmanEnabled() ? `\n▶️ Press play — stickman Joe acts it out.` : "";
    await update(
      `🎶 <b>${title}</b>\n\n${page.url}${stage}${expiry}\n\n` +
        `🎬 Stickman video: /video · 🎨 Memes: /meme\n` +
        `Joe's own take on it: /funnier /sharper /attitude`,
    );
  } catch (err) {
    console.error("[telegram.upload] failed", err);
    await update(`😵 Couldn't take that song: ${escapeHtml(err instanceof Error ? err.message : String(err))}`);
  } finally {
    busyChats.delete(chatId);
  }
}
