/**
 * "Drop in any song": an uploaded MP3/WAV that Joe acts out as a stickman
 * video (POST /api/stickman-video/upload). Pure checks and text handling;
 * the route measures, plans scenes and publishes.
 */

/** P&R films audio up to 24MB / 3 minutes (video-service.ts). */
export const MAX_UPLOAD_BYTES = 24 * 1024 * 1024;
export const MAX_UPLOAD_SEC = 180;

export const UPLOAD_AUDIO_TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
};

/** "mp3" or "wav" from the file name, else the MIME type; null for anything else. */
export function uploadAudioFormat(fileName: string, mimeType = ""): "mp3" | "wav" | null {
  const ext = /\.([a-z0-9]+)$/i.exec(fileName || "")?.[1]?.toLowerCase();
  if (ext === "mp3" || ext === "wav") return ext;
  if (ext) return null;
  if (/mpeg|mp3/i.test(mimeType)) return "mp3";
  if (/wav/i.test(mimeType)) return "wav";
  return null;
}

/** Why P&R would refuse this upload, or null when it's fine. Unknown length passes. */
export function uploadProblem(bytes: number, durationSec: number | null): string | null {
  if (bytes <= 0) return "That audio file is empty.";
  if (bytes > MAX_UPLOAD_BYTES) {
    return `That file is ${(bytes / 1024 / 1024).toFixed(1)}MB. Songs can be up to 24MB.`;
  }
  if (durationSec !== null && durationSec > MAX_UPLOAD_SEC + 0.5) {
    const m = Math.floor(durationSec / 60);
    const s = Math.round(durationSec % 60).toString().padStart(2, "0");
    return `That song runs ${m}:${s}. Songs can be up to 3 minutes.`;
  }
  return null;
}

/**
 * The published page with its audio pointed somewhere else (the dropped
 * file's blob: URL), for a local preview before or without here.now.
 */
export function withAudioSrc(html: string, audioFile: string, src: string): string {
  return html.split(`src="${audioFile}"`).join(`src="${src.replace(/"/g, "&quot;")}"`);
}

/** "my_song-final (v2).mp3" → "my song final (v2)". */
export function titleFromFileName(fileName: string): string {
  return String(fileName || "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const LRC_STAMP = /\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]/g;
const LRC_META = /^\[(ar|ti|al|by|offset|length|re|ve|au):[^\]]*\]$/i;

/**
 * Lyrics as typed or pasted: CRLF and LRC timestamps/metadata removed, blank
 * runs collapsed. Section tags ([VERSE], [CHORUS], [OUTRO]) stay.
 */
export function cleanUploadLyrics(lyrics: string): string {
  const out: string[] = [];
  for (const raw of String(lyrics ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (LRC_META.test(line)) continue;
    const text = line.replace(LRC_STAMP, "").replace(/\s+/g, " ").trim();
    if (!text && (out.length === 0 || out[out.length - 1] === "")) continue;
    out.push(text);
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join("\n");
}

/**
 * The title and lyrics Joe acts out. Title: typed, else the file name, else
 * "Untitled Song". Lyrics: cleaned; with none, the title is the one line
 * (and so the punchline).
 */
export function songUploadText(input: { title?: string; lyrics?: string; fileName?: string }): {
  title: string;
  lyrics: string;
  fromTitle: boolean;
} {
  const title = (String(input.title ?? "").trim() || titleFromFileName(input.fileName ?? "") || "Untitled Song").slice(0, 120);
  const lyrics = cleanUploadLyrics(String(input.lyrics ?? "").slice(0, 20_000));
  const sung = lyrics.split("\n").some((l) => l && !/^\[[^\]]+\]$/.test(l));
  if (sung) return { title, lyrics, fromTitle: false };
  return { title, lyrics: title, fromTitle: true };
}
