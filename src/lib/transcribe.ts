/**
 * Song transcription — Groq Whisper with word timestamps.
 *
 * Two callers: lyric timing for Joe's own songs (we know the words, we need
 * *when* they're sung) and dropped-in MP3s (we need the words too). Both want
 * the same thing from Whisper, tuned for vocals over music:
 *   - whisper-large-v3, not turbo — turbo mishears far more over a backing track
 *   - temperature 0, the song's language, and a prompt with the title/lyrics
 *   - word + segment timestamps
 *   - made-up lines ("thanks for watching", lone ♪) dropped using the
 *     confidence numbers verbose_json already returns
 *
 * No ffmpeg in the runtime image, so nothing is re-encoded: the file is sent
 * as what its bytes say it is, and anything over Groq's 25 MB cap is refused.
 */

import { getLanguage, isLanguageKey } from "./languages";

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface Transcript {
  text: string;
  segments: TranscriptSegment[];
  words: TranscriptWord[];
  durationSec: number;
  /** Language Whisper heard (its own naming, e.g. "english"). */
  language?: string;
}

/** Why a transcription came back empty — each needs a different fix. */
export type TranscribeFailure = "no-key" | "key-rejected" | "bad-audio" | "too-big" | "no-speech" | "error";

export type AudioFormat = "mp3" | "wav" | "m4a" | "ogg" | "flac" | "webm";

export const MAX_TRANSCRIBE_BYTES = 25 * 1024 * 1024;
const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const DEFAULT_MODEL = "whisper-large-v3";
const PROMPT_MAX_CHARS = 800;

const MIME: Record<AudioFormat, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  flac: "audio/flac",
  webm: "audio/webm",
};

/** What the bytes really are, whatever the file is called. Null = not audio we know. */
export function sniffAudioFormat(buf: Buffer): AudioFormat | null {
  if (buf.length < 12) return null;
  const ascii = (from: number, to: number) => buf.toString("latin1", from, to);
  if (ascii(0, 3) === "ID3") return "mp3";
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return "mp3"; // bare MPEG frame sync
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") return "wav";
  if (ascii(4, 8) === "ftyp") return "m4a";
  if (ascii(0, 4) === "OggS") return "ogg";
  if (ascii(0, 4) === "fLaC") return "flac";
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return "webm";
  return null;
}

/** Episode language key ("pt-BR") -> Whisper's ISO-639-1 code ("pt"). Unknown keys send nothing. */
export function whisperLanguage(key: string | null | undefined): string | undefined {
  return isLanguageKey(key) ? getLanguage(key).ace : undefined;
}

/**
 * Whisper's prompt: vocabulary hints, not instructions. Title first, then the
 * known lyrics (section tags stripped), trimmed to ~800 chars on a word
 * boundary — Groq only reads the first ~224 tokens.
 */
export function buildWhisperPrompt(parts: { title?: string; lyrics?: string }): string | undefined {
  const lyrics = (parts.lyrics ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/\[[^\]]*\]/g, "").trim())
    .filter(Boolean)
    .join(" ");
  const text = [parts.title?.trim(), lyrics].filter(Boolean).join(". ").replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  if (text.length <= PROMPT_MAX_CHARS) return text;
  const cut = text.slice(0, PROMPT_MAX_CHARS);
  const space = cut.lastIndexOf(" ");
  return space > PROMPT_MAX_CHARS / 2 ? cut.slice(0, space) : cut;
}

/** One verbose_json segment, with the confidence fields we filter on. */
export interface WhisperSegment {
  start: number;
  end: number;
  text: string;
  avg_logprob?: number;
  no_speech_prob?: number;
  compression_ratio?: number;
}

const FILLER = /^(thanks? (you )?for watching|please subscribe|subscribe|like and subscribe|\[?music\]?|\(?music\)?|♪+|[♪\s.]+)[.!\s]*$/i;

/** True when a segment is Whisper filling silence or music, not someone singing. */
export function isHallucinated(s: WhisperSegment): boolean {
  const text = (s.text ?? "").trim();
  if (!text) return true;
  if (FILLER.test(text)) return true;
  if ((s.no_speech_prob ?? 0) > 0.6 && (s.avg_logprob ?? 0) < -1) return true;
  if ((s.compression_ratio ?? 0) > 2.4) return true; // repetition loop
  return false;
}

/** Drop made-up segments and the words inside them. */
export function dropHallucinatedSegments(
  segments: WhisperSegment[],
  words: TranscriptWord[],
): { segments: TranscriptSegment[]; words: TranscriptWord[] } {
  const kept: TranscriptSegment[] = [];
  const dropped: Array<[number, number]> = [];
  for (const s of segments) {
    if (isHallucinated(s)) dropped.push([s.start, s.end]);
    else kept.push({ start: s.start, end: s.end, text: s.text.trim() });
  }
  const inDropped = (w: TranscriptWord) => {
    const mid = (w.start + w.end) / 2;
    return dropped.some(([a, b]) => mid >= a && mid <= b);
  };
  return {
    segments: kept,
    words: words.map((w) => ({ ...w, word: w.word.trim() })).filter((w) => w.word && !inDropped(w)),
  };
}

interface WhisperResponse {
  text?: string;
  duration?: number;
  language?: string;
  segments?: WhisperSegment[];
  words?: TranscriptWord[];
}

/** Turn Groq's verbose_json into a Transcript, or null when nothing real was heard. */
export function parseWhisperResponse(data: WhisperResponse): Transcript | null {
  const { segments, words } = dropHallucinatedSegments(data.segments ?? [], data.words ?? []);
  if (segments.length === 0) return null;
  return {
    text: segments.map((s) => s.text).join("\n"),
    segments,
    words,
    durationSec: data.duration || segments[segments.length - 1].end,
    language: data.language,
  };
}

/** Saved Settings key first, then GROQ_API_KEY — both are tried if they differ. */
async function groqKeys(): Promise<string[]> {
  const keys: string[] = [];
  try {
    const { loadBackendConfig } = await import("./ai-backend");
    const cfg = await loadBackendConfig();
    if (cfg.groqApiKey.trim()) keys.push(cfg.groqApiKey.trim());
  } catch {
    /* no DB — env only */
  }
  const env = process.env.GROQ_API_KEY?.trim();
  if (env && !keys.includes(env)) keys.push(env);
  return keys;
}

/** True when a Groq key is configured anywhere. */
export async function hasTranscriptionKey(): Promise<boolean> {
  return (await groqKeys()).length > 0;
}

export interface TranscribeOptions {
  /** Episode language key ("en", "pt-BR"); omitted = Whisper detects it. */
  language?: string;
  title?: string;
  /** Known lyrics, used as a vocabulary prompt. */
  lyrics?: string;
  /** Override the configured keys (tests, callers that already hold one). */
  apiKeys?: string[];
}

export async function transcribeAudio(
  buf: Buffer,
  opts: TranscribeOptions = {},
): Promise<{ transcript: Transcript | null; failure?: TranscribeFailure }> {
  if (buf.length > MAX_TRANSCRIBE_BYTES) return { transcript: null, failure: "too-big" };
  const format = sniffAudioFormat(buf);
  if (!format) return { transcript: null, failure: "bad-audio" };
  const keys = opts.apiKeys ?? (await groqKeys());
  if (!keys.length) return { transcript: null, failure: "no-key" };

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buf)], { type: MIME[format] }), `song.${format}`);
  form.append("model", process.env.WHISPER_MODEL?.trim() || DEFAULT_MODEL);
  form.append("response_format", "verbose_json");
  form.append("temperature", "0");
  form.append("timestamp_granularities[]", "word");
  form.append("timestamp_granularities[]", "segment");
  const language = whisperLanguage(opts.language);
  if (language) form.append("language", language);
  const prompt = buildWhisperPrompt({ title: opts.title, lyrics: opts.lyrics });
  if (prompt) form.append("prompt", prompt);

  let failure: TranscribeFailure = "error";
  for (let i = 0; i < keys.length; i++) {
    try {
      const res = await fetch(GROQ_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${keys[i]}` },
        body: form,
        signal: AbortSignal.timeout(180_000),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        console.warn(`[transcribe] Groq key ${i + 1} failed (${format}, ${buf.length}B):`, res.status, detail.slice(0, 200));
        if (res.status === 400 && /invalid_media_file|valid media file/i.test(detail)) {
          return { transcript: null, failure: "bad-audio" }; // same file for every key
        }
        if (res.status === 413) return { transcript: null, failure: "too-big" };
        if (res.status === 401 || res.status === 403) failure = "key-rejected";
        continue;
      }
      const transcript = parseWhisperResponse((await res.json()) as WhisperResponse);
      return transcript ? { transcript } : { transcript: null, failure: "no-speech" };
    } catch (e) {
      console.warn(`[transcribe] Groq key ${i + 1} error:`, e instanceof Error ? e.message : e);
    }
  }
  return { transcript: null, failure };
}

/** The user-facing line for a failed transcription. */
export function transcribeFailureMessage(failure: TranscribeFailure | undefined): string {
  switch (failure) {
    case "no-key":
      return "Couldn't transcribe the song: no Groq key is set. Add one in Settings → Transcription.";
    case "key-rejected":
      return "Couldn't transcribe the song: Groq rejected the key. Check it in Settings → Transcription.";
    case "bad-audio":
      return "Couldn't transcribe the song: that file isn't audio I can read. Send an MP3, M4A, WAV, OGG or FLAC.";
    case "too-big":
      return "Couldn't transcribe the song: the file is over 25 MB. Send a smaller MP3.";
    case "no-speech":
      return "Couldn't transcribe the song: no vocals were recognized in it.";
    default:
      return "Couldn't transcribe the song right now (Groq didn't answer). Try again in a minute.";
  }
}
