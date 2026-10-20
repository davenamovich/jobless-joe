/**
 * Drop-in songs: an MP3 (or M4A/WAV/OGG/FLAC) from anywhere becomes a normal
 * episode — lyrics transcribed by Whisper, an AudioTrack pointing at the
 * file, real line timing — so the song page, stickman video, P&R video,
 * YouTube and Upload-Post all work on it unchanged.
 *
 * Uploads stay out of Joe's story: no Story Bible update, and autopilot
 * never continues from one. Remixing one (/funnier etc.) has Joe rewrite it
 * as a new song, from the transcript as its script.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { chat, loadBackendConfig } from "@/lib/ai-backend";
import { DURATIONS, MAX_SCRIPT_CHARS, type DurationKey, type SongOutput } from "@/lib/joe-prompts";
import { LANGUAGES, getLanguage, isLanguageKey } from "@/lib/languages";
import { audioDurationSec } from "@/lib/song-artifacts";
import { lineStartsFromTranscript } from "@/lib/song-timing";
import {
  MAX_TRANSCRIBE_BYTES,
  sniffAudioFormat,
  transcribeAudio,
  transcribeFailureMessage,
  type TranscriptSegment,
} from "@/lib/transcribe";

/** AudioTrack.voice for a dropped-in file — never re-rendered by TTS. */
export const UPLOAD_VOICE = "upload";
/** Episode.episodeTheme / action for a dropped-in song. */
export const UPLOAD_THEME = "upload";
export const UPLOAD_LABEL = "Uploaded Song";

const AUDIO_DIR = path.join(process.cwd(), "public", "audio");
const MAX_LINE_WORDS = 10;
const BLOCK_GAP_SEC = 2.5;

export interface ImportSongInput {
  buffer: Buffer;
  /** Original file name; its stem is the fallback title. */
  filename: string;
  title?: string;
  /** Episode language key; omitted = what Whisper heard. */
  language?: string;
  source: "web" | "telegram";
}

export type ImportSongResult =
  | { ok: true; episodeId: string; title: string; lines: number }
  | { ok: false; error: string };

/** "My Song (final) v2.mp3" -> "My Song (final) v2". Empty for junk names. */
export function titleFromFilename(filename: string): string {
  const stem = path.basename(filename || "").replace(/\.[a-z0-9]{2,5}$/i, "");
  const t = stem.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  return /^(audio|song|track|file|voice|recording|untitled)?[\s_-]*\d*$/i.test(t) ? "" : t;
}

/** Whisper's language name ("english", "portuguese") -> an episode key, else the default. */
export function languageFromWhisper(heard: string | undefined): string {
  const h = (heard ?? "").trim().toLowerCase();
  if (!h) return LANGUAGES[0].key;
  if (isLanguageKey(h)) return h;
  const hit = LANGUAGES.find((l) => l.ace === h || l.label.toLowerCase().startsWith(h));
  return hit?.key ?? LANGUAGES[0].key;
}

/** Nearest duration key, so the archive and fit notes show a sensible length. */
export function durationKeyFor(sec: number): DurationKey {
  let best = DURATIONS[0].key;
  for (const d of DURATIONS) {
    if (Math.abs(parseInt(d.key, 10) - sec) < Math.abs(parseInt(best, 10) - sec)) best = d.key;
  }
  return best;
}

/** Split a long run of words into near-equal lines of at most `max` words. */
function splitWords(words: string[], max: number): string[] {
  if (words.length <= max) return [words.join(" ")];
  const parts = Math.ceil(words.length / max);
  const size = Math.ceil(words.length / parts);
  const out: string[] = [];
  for (let i = 0; i < words.length; i += size) out.push(words.slice(i, i + size).join(" "));
  return out;
}

/**
 * Whisper segments -> lyric text: one line per segment (long ones split),
 * a blank line wherever the singer pauses long enough to start a new block.
 */
export function transcriptToLyrics(segments: TranscriptSegment[]): string {
  const out: string[] = [];
  let prevEnd: number | null = null;
  for (const s of segments) {
    const words = s.text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
    if (!words.length) continue;
    if (prevEnd !== null && s.start - prevEnd > BLOCK_GAP_SEC && out.length && out[out.length - 1] !== "") out.push("");
    out.push(...splitWords(words, MAX_LINE_WORDS));
    prevEnd = s.end;
  }
  return out.join("\n").trim();
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
const sungLines = (lyrics: string) =>
  lyrics
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^\[[^\]]+\]$/.test(l));

/**
 * The model's section-tagged lyrics, but only if it added tags and nothing
 * else: same sung lines, same order. Otherwise the plain transcript wins.
 */
export function acceptTaggedLyrics(original: string, tagged: unknown): string {
  if (typeof tagged !== "string" || !tagged.trim()) return original;
  const a = sungLines(original).map(norm);
  const b = sungLines(tagged).map(norm);
  if (a.length !== b.length || a.some((l, i) => l !== b[i])) return original;
  if (!/^\s*\[[^\]]+\]\s*$/m.test(tagged)) return original;
  return tagged
    .split(/\r?\n/)
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const META_SYSTEM = `You are the producer for "Jobless Joe", a dry-witted unemployed crooner who turns songs into short videos.
A user dropped in a finished song. You get its transcribed lyrics. Do not rewrite the lyrics.
Reply with ONLY a JSON object, no prose, no code fences:
{
  "episodeTitle": "short catchy title for this song (use the given title if it fits)",
  "lyrics": "the SAME lyric lines, unchanged and in order, with section tags like [VERSE 1], [CHORUS], [BRIDGE], [OUTRO] on their own lines before each section",
  "hooks": ["three", "alternative 3-second", "video hooks"],
  "adCopy": { "primaryTexts": ["three short", "social post", "texts"], "headlines": ["three", "short", "headlines"], "description": "one line", "cta": "short call to action" },
  "closingLine": "the last sung line",
  "nextEpisodeTeaser": "one line teasing Joe's next song",
  "nextEpisodeTitle": "a title for that next song"
}
Write everything except the lyrics in the song's language.`;

/** Title, hooks, ad copy and section tags from the model; a usable fallback if it fails. */
async function describeSong(lyrics: string, title: string, languageKey: string): Promise<{ output: Partial<SongOutput>; model: string; backend: string }> {
  const cfg = await loadBackendConfig();
  try {
    const user = `Language: ${getLanguage(languageKey).label}\nGiven title: ${title || "(none)"}\n\nLyrics:\n${lyrics.slice(0, 6000)}`;
    const res = await chat(META_SYSTEM, user, cfg);
    let raw = res.content.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) raw = raw.slice(start, end + 1);
    const parsed = JSON.parse(raw) as Partial<SongOutput>;
    return { output: parsed, model: res.model, backend: res.backend };
  } catch (e) {
    console.warn("[song-import] metadata pass failed, using the transcript as is", e instanceof Error ? e.message : e);
    return { output: {}, model: "", backend: cfg.activeBackend };
  }
}

const strings = (v: unknown, n: number, fill: string): string[] => {
  const arr = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).slice(0, n) : [];
  while (arr.length < n) arr.push(fill);
  return arr;
};

/** A complete SongOutput for an uploaded song. Pure: the model's reply is only trusted where it's checked. */
export function buildUploadOutput(args: {
  lyrics: string;
  title: string;
  durationKey: DurationKey;
  meta: Partial<SongOutput>;
}): SongOutput {
  const { meta } = args;
  const lyrics = acceptTaggedLyrics(args.lyrics, meta.lyrics);
  const sung = sungLines(lyrics);
  const title = (typeof meta.episodeTitle === "string" && meta.episodeTitle.trim()) || args.title || "Uploaded Song";
  return {
    episodeTitle: title.slice(0, 120),
    duration: args.durationKey,
    musicalDirection: "",
    lyrics,
    performanceNotes: "",
    closingLine: sung[sung.length - 1] ?? "",
    hooks: strings(meta.hooks, 3, title),
    adCopy: {
      primaryTexts: strings(meta.adCopy?.primaryTexts, 3, `${title} — sung for real.`),
      headlines: strings(meta.adCopy?.headlines, 3, title),
      description: typeof meta.adCopy?.description === "string" ? meta.adCopy.description : "",
      cta: (typeof meta.adCopy?.cta === "string" && meta.adCopy.cta) || "Listen now",
    },
    videoBrief: {
      visualOpening: "",
      performanceShot: "",
      onScreenCaptions: sung.slice(0, 6),
      sceneChanges: [],
      visualPunchline: "",
      finalFrame: "",
      aspectRatio: "9:16",
    },
    nextEpisodeTeaser: typeof meta.nextEpisodeTeaser === "string" ? meta.nextEpisodeTeaser : "",
    nextEpisodeTitle: typeof meta.nextEpisodeTitle === "string" ? meta.nextEpisodeTitle : "",
    storyBibleUpdate: {
      currentSituation: "",
      learnedSkills: [],
      builtThings: [],
      characters: [],
      runningJokes: [],
      previousPunchlines: [],
      unresolvedStorylines: [],
      nextDevelopment: "",
    },
  };
}

export async function importSong(input: ImportSongInput): Promise<ImportSongResult> {
  const { buffer } = input;
  if (buffer.length > MAX_TRANSCRIBE_BYTES) return { ok: false, error: transcribeFailureMessage("too-big") };
  const format = sniffAudioFormat(buffer);
  if (!format) return { ok: false, error: transcribeFailureMessage("bad-audio") };

  const givenTitle = (input.title ?? "").trim() || titleFromFilename(input.filename);
  const wantedLanguage = isLanguageKey(input.language) ? input.language : undefined;

  const { transcript, failure } = await transcribeAudio(buffer, { language: wantedLanguage, title: givenTitle });
  if (!transcript) return { ok: false, error: transcribeFailureMessage(failure) };

  const language = wantedLanguage ?? languageFromWhisper(transcript.language);
  const plain = transcriptToLyrics(transcript.segments);
  const durationSec = audioDurationSec(buffer, format) || transcript.durationSec;
  const meta = await describeSong(plain, givenTitle, language);
  const output = buildUploadOutput({ lyrics: plain, title: givenTitle, durationKey: durationKeyFor(durationSec), meta: meta.output });

  const episode = await db.episode.create({
    data: {
      episodeTheme: UPLOAD_THEME,
      episodeLabel: UPLOAD_LABEL,
      customTopic: null,
      // A remix rewrites the upload as Joe's own song, keeping its beats.
      customScript: sungLines(output.lyrics).join("\n").slice(0, MAX_SCRIPT_CHARS),
      duration: output.duration,
      intensity: "ridiculous",
      target: "job-seekers",
      croonerStyle: "smoky-lounge",
      language,
      backend: meta.backend,
      backendModel: meta.model || null,
      action: UPLOAD_THEME,
      title: output.episodeTitle,
      output: JSON.stringify(output),
      teaser: output.nextEpisodeTeaser,
      nextTitle: output.nextEpisodeTitle,
    },
  });

  try {
    const filename = `ep_${episode.id}_${UPLOAD_VOICE}.${format}`;
    await fs.mkdir(AUDIO_DIR, { recursive: true });
    await fs.writeFile(path.join(AUDIO_DIR, filename), buffer);
    const starts = lineStartsFromTranscript(output.lyrics, transcript, durationSec);
    await db.audioTrack.create({
      data: {
        episodeId: episode.id,
        voice: UPLOAD_VOICE,
        format,
        speed: 1,
        durationSec: Math.round(durationSec),
        chunkCount: 1,
        filePath: `/audio/${filename}`,
        lineStarts: starts ? JSON.stringify(starts) : "",
      },
    });
  } catch (e) {
    await db.episode.delete({ where: { id: episode.id } }).catch(() => {});
    throw e;
  }

  console.log(`[song-import] ${input.source}: "${output.episodeTitle}" (${format}, ${Math.round(durationSec)}s, ${language})`);
  return { ok: true, episodeId: episode.id, title: output.episodeTitle, lines: sungLines(output.lyrics).length };
}
