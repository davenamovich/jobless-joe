/**
 * Real line timing for a rendered song: transcribe the audio track once,
 * align the episode's own lyrics to it, store the result on the track.
 *
 * Runs in the background after every render (tts-service), and on demand the
 * first time a stickman page is built for an older song. Never throws — a
 * song with no timing just keeps the word-count estimate.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import type { SongOutput } from "@/lib/joe-prompts";
import { lineStartFractions, parseLineStarts } from "@/lib/lyric-timing";
import { audioDurationSec } from "@/lib/song-artifacts";
import { lyricsToBeats } from "@/lib/stickman";
import { hasTranscriptionKey, transcribeAudio, type Transcript } from "@/lib/transcribe";

const AUDIO_DIR = path.join(process.cwd(), "public", "audio");
/** Don't retry a track that just failed on every page view. */
const RETRY_AFTER_MS = 10 * 60 * 1000;

const inFlight = new Map<string, Promise<number[] | null>>();
const failedAt = new Map<string, number>();

/** The stickman's beat lines for these lyrics — the same list the rig and TV use. */
export function beatLines(lyrics: string): string[] {
  return lyricsToBeats(lyrics).map((b) => b.text);
}

/** Fractions for each beat from an existing transcript (no Whisper call). */
export function lineStartsFromTranscript(lyrics: string, transcript: Transcript, durationSec?: number): number[] | null {
  const lines = beatLines(lyrics);
  return lineStartFractions(lines, transcript.words, durationSec || transcript.durationSec);
}

/** Time a track if it isn't yet. Resolves to the fractions, or null. */
export function ensureTrackTiming(trackId: string): Promise<number[] | null> {
  const running = inFlight.get(trackId);
  if (running) return running;
  const last = failedAt.get(trackId);
  if (last && Date.now() - last < RETRY_AFTER_MS) return Promise.resolve(null);

  const job = runTiming(trackId)
    .catch((e) => {
      console.warn("[song-timing] failed", trackId, e instanceof Error ? e.message : e);
      return null;
    })
    .then((r) => {
      if (r) failedAt.delete(trackId);
      else failedAt.set(trackId, Date.now());
      return r;
    })
    .finally(() => inFlight.delete(trackId));
  inFlight.set(trackId, job);
  return job;
}

async function runTiming(trackId: string): Promise<number[] | null> {
  const track = await db.audioTrack.findUnique({ where: { id: trackId } });
  if (!track) return null;
  const episode = await db.episode.findUnique({ where: { id: track.episodeId } });
  if (!episode) return null;

  let output: Partial<SongOutput> = {};
  try {
    output = JSON.parse(episode.output) as SongOutput;
  } catch {
    return null;
  }
  const lyrics = output.lyrics ?? "";
  const lines = beatLines(lyrics);
  if (!lines.length) return null;

  const stored = parseLineStarts(track.lineStarts, lines.length);
  if (stored) return stored;
  if (!(await hasTranscriptionKey())) return null;

  const fullPath = path.join(AUDIO_DIR, path.basename(track.filePath));
  const buf = await fs.readFile(fullPath);
  const { transcript, failure } = await transcribeAudio(buf, {
    language: episode.language,
    title: output.episodeTitle || episode.title,
    lyrics,
  });
  if (!transcript) {
    console.warn(`[song-timing] no transcript for ${trackId}: ${failure}`);
    return null;
  }

  const format = path.extname(fullPath).slice(1).toLowerCase();
  const starts = lineStartFractions(lines, transcript.words, audioDurationSec(buf, format) || transcript.durationSec);
  if (!starts) {
    console.warn(`[song-timing] lyrics didn't line up with the transcript for ${trackId}; keeping the estimate`);
    return null;
  }
  await db.audioTrack.update({ where: { id: trackId }, data: { lineStarts: JSON.stringify(starts) } });
  return starts;
}

/** Stored timing only — for pages that must not wait (the song page right after a render). */
export function storedLineStarts(song: { lineStarts: string; lyrics: string }): number[] | null {
  return parseLineStarts(song.lineStarts, beatLines(song.lyrics).length);
}

/** Stored timing, or a bounded wait for it — a page build never hangs on Whisper. */
export async function lineStartsForPage(
  song: { trackId: string; lineStarts: string; lyrics: string },
  waitMs = 45_000,
): Promise<number[] | null> {
  const stored = storedLineStarts(song);
  if (stored) return stored;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), waitMs);
  });
  try {
    return await Promise.race([ensureTrackTiming(song.trackId), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
