/**
 * A finished song's publishable pieces — episode text plus the newest MP3 on
 * disk. Shared by the song page and the stickman video page, which both ship
 * the audio next to their HTML on here.now.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import type { SongOutput } from "@/lib/joe-prompts";

const AUDIO_DIR = path.join(process.cwd(), "public", "audio");

export interface SongArtifacts {
  title: string;
  episodeLabel: string;
  duration: string;
  lyrics: string;
  musicalDirection: string;
  fileName: string;
  format: string;
  contentType: string;
  buffer: Buffer;
  language: string;
  /** The audio track's id and stored line timing (see lib/song-timing.ts). */
  trackId: string;
  lineStarts: string;
}

/** Load the episode, its newest audio track, and the audio bytes. */
export async function loadSongArtifacts(episodeId: string): Promise<SongArtifacts> {
  const episode = await db.episode.findUnique({ where: { id: episodeId } });
  if (!episode) throw new Error("Episode not found.");

  const track = await db.audioTrack.findFirst({
    where: { episodeId },
    orderBy: { createdAt: "desc" },
  });
  if (!track) {
    throw new Error("This song is still rendering. Try again once it's ready.");
  }

  const fileName = path.basename(track.filePath);
  const fullPath = path.join(AUDIO_DIR, fileName);
  if (path.dirname(fullPath) !== AUDIO_DIR) {
    throw new Error("Invalid audio path.");
  }

  let buffer: Buffer;
  try {
    buffer = await fs.readFile(fullPath);
  } catch {
    throw new Error("Audio file is missing from disk. Re-render the song.");
  }

  let output: Partial<SongOutput> = {};
  try {
    output = JSON.parse(episode.output) as SongOutput;
  } catch {
    // Keep the fallbacks below.
  }

  const ext = path.extname(fileName).toLowerCase();
  // Dropped-in songs can be any of these; Joe's own renders are WAV or MP3.
  const CONTENT_TYPES: Record<string, string> = {
    ".wav": "audio/wav",
    ".flac": "audio/flac",
    ".m4a": "audio/mp4",
    ".ogg": "audio/ogg",
    ".webm": "audio/webm",
  };
  const contentType = CONTENT_TYPES[ext] ?? "audio/mpeg";

  return {
    title: output.episodeTitle || episode.title || "Untitled Song",
    episodeLabel: episode.episodeLabel || "Jobless Joe",
    duration: output.duration || episode.duration,
    lyrics: output.lyrics || "",
    musicalDirection: output.musicalDirection || "",
    fileName,
    format: ext.replace(".", "") || "mp3",
    contentType,
    buffer,
    language: episode.language,
    trackId: track.id,
    lineStarts: track.lineStarts,
  };
}

export function downloadName(title: string, format: string): string {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "jobless-joe-song";
  return `${slug}.${format}`;
}

/**
 * Seconds of audio, read from the file itself: exact for WAV, the frame
 * bitrate for MP3 (Xing frame count when present). Null when unreadable.
 */
export function audioDurationSec(buf: Buffer, format: string): number | null {
  try {
    if (format === "wav") {
      const byteRate = buf.readUInt32LE(28);
      let off = 12;
      while (off + 8 <= buf.length) {
        const id = buf.toString("ascii", off, off + 4);
        const size = buf.readUInt32LE(off + 4);
        if (id === "data") return byteRate ? size / byteRate : null;
        off += 8 + size + (size % 2);
      }
      return null;
    }
    if (format === "mp3") {
      let off = 0;
      if (buf.toString("ascii", 0, 3) === "ID3") {
        const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
        off = 10 + size;
      }
      while (off + 4 < buf.length && !(buf[off] === 0xff && (buf[off + 1] & 0xe0) === 0xe0)) off++;
      if (off + 4 >= buf.length) return null;
      const h = buf.readUInt32BE(off);
      const version = (h >> 19) & 3; // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
      const layer = (h >> 17) & 3; // 1 = Layer III
      const brIdx = (h >> 12) & 15;
      const srIdx = (h >> 10) & 3;
      if (layer !== 1 || brIdx === 0 || brIdx === 15 || srIdx === 3) return null;
      const v1 = version === 3;
      const BR1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
      const BR2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
      const SR = [44100, 48000, 32000][srIdx] / (v1 ? 1 : version === 2 ? 2 : 4);
      const samplesPerFrame = v1 ? 1152 : 576;
      const mono = ((h >> 6) & 3) === 3;
      const xingOff = off + 4 + (v1 ? (mono ? 17 : 32) : mono ? 9 : 17);
      const tag = buf.toString("ascii", xingOff, xingOff + 4);
      if ((tag === "Xing" || tag === "Info") && buf.readUInt32BE(xingOff + 4) & 1) {
        return (buf.readUInt32BE(xingOff + 8) * samplesPerFrame) / SR;
      }
      const kbps = (v1 ? BR1 : BR2)[brIdx];
      return ((buf.length - off) * 8) / (kbps * 1000);
    }
  } catch {
    // Fall through.
  }
  return null;
}
