/**
 * When each known lyric line is actually sung.
 *
 * Joe's songs come with their lyrics, so Whisper isn't asked for the words —
 * only for timestamps. Each line is matched, in order, to the stretch of
 * transcribed words that reads most like it; a misheard word or two still
 * matches, a chorus maps to its next occurrence (never back to the first),
 * and lines Whisper missed are slotted between their matched neighbours.
 *
 * Too few matches means the transcript is no help, and callers keep the
 * word-count estimate (beatStarts) — real timing must never be worse.
 */

import type { TranscriptWord } from "./transcribe";

const MIN_LINE_SCORE = 0.5;
const MIN_MATCHED_SHARE = 0.4;
const DEFAULT_SEC_PER_WORD = 0.45;

/** Han, kana: written without spaces, so compare character by character. */
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  // Accents off Latin/Greek/Cyrillic only — kana and Hangul need theirs.
  const cleaned = text
    .normalize("NFD")
    .replace(/([\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}])\p{M}+/gu, "$1")
    .normalize("NFC")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ");
  for (const t of cleaned.split(" ")) {
    if (!t) continue;
    if (UNSPACED.test(t)) tokens.push(...Array.from(t));
    else tokens.push(t);
  }
  return tokens;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length];
}

/** 1 for the same word, toward 0 the more letters differ ("gonna" ~ "gona"). */
function wordSim(a: string, b: string): number {
  if (a === b) return 1;
  const longest = Math.max(a.length, b.length);
  return longest ? 1 - levenshtein(a, b) / longest : 0;
}

/** How alike two token runs are, 0..1: word-level edit distance with partial credit for near-misses. */
export function lineSimilarity(line: string[], heard: string[]): number {
  const n = line.length;
  const m = heard.length;
  if (!n || !m) return 0;
  const prev = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= m; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (1 - wordSim(line[i - 1], heard[j - 1])));
      diag = up;
    }
  }
  return Math.max(0, 1 - prev[m] / Math.max(n, m));
}

/**
 * Start time (seconds) of each line, null where no stretch of words matched.
 * Matching only moves forward through the transcript.
 */
export function alignLinesToWords(lines: string[], words: TranscriptWord[]): (number | null)[] {
  const heard: { tok: string; start: number }[] = [];
  for (const w of words) for (const tok of tokenize(w.word)) heard.push({ tok, start: w.start });

  const out: (number | null)[] = [];
  let cursor = 0;
  for (const line of lines) {
    const toks = tokenize(line);
    if (!toks.length || cursor >= heard.length) {
      out.push(null);
      continue;
    }
    const n = toks.length;
    // Look a few lines ahead: far enough to skip an ad-lib or a missed line,
    // not so far that a line jumps to a later chorus.
    const searchEnd = Math.min(heard.length, cursor + n * 4 + 24);
    let best = { score: 0, start: -1, len: 0 };
    for (let s = cursor; s < searchEnd; s++) {
      for (const len of [n - 1, n, n + 1]) {
        if (len < 1 || s + len > heard.length) continue;
        const score = lineSimilarity(toks, heard.slice(s, s + len).map((h) => h.tok)) - 0.002 * (s - cursor);
        if (score > best.score) best = { score, start: s, len };
      }
    }
    if (best.start >= 0 && best.score >= MIN_LINE_SCORE) {
      out.push(heard[best.start].start);
      cursor = best.start + best.len;
    } else {
      out.push(null);
    }
  }
  return out;
}

const weight = (line: string) => Math.max(2, tokenize(line).length);

/**
 * Line starts as fractions of the song (0..1), gaps filled, never going
 * backwards. Null when fewer than 40% of lines matched.
 */
export function lineStartFractions(lines: string[], words: TranscriptWord[], durationSec: number): number[] | null {
  if (!lines.length || !(durationSec > 0)) return null;
  const raw = alignLinesToWords(lines, words);
  const matched = raw.map((t, i) => (t === null ? -1 : i)).filter((i) => i >= 0);
  if (matched.length < Math.max(1, Math.ceil(lines.length * MIN_MATCHED_SHARE))) return null;

  const t: number[] = raw.map((v) => v ?? NaN);
  const first = matched[0];
  const last = matched[matched.length - 1];

  // Pace of the matched stretch, for lines outside it.
  let spanWords = 0;
  for (let i = first; i < last; i++) spanWords += weight(lines[i]);
  const secPerWord = last > first && t[last] > t[first] ? (t[last] - t[first]) / spanWords : DEFAULT_SEC_PER_WORD;

  // Between two matched lines: share the gap by word count.
  for (let k = 0; k < matched.length - 1; k++) {
    const a = matched[k];
    const b = matched[k + 1];
    if (b - a < 2) continue;
    let total = 0;
    for (let i = a; i < b; i++) total += weight(lines[i]);
    let acc = 0;
    for (let i = a + 1; i < b; i++) {
      acc += weight(lines[i - 1]);
      t[i] = t[a] + ((t[b] - t[a]) * acc) / total;
    }
  }
  // Before the first match: step back at the song's pace, never below 0.
  for (let i = first - 1; i >= 0; i--) t[i] = Math.max(0, t[i + 1] - weight(lines[i]) * secPerWord);
  // After the last match: step forward, never past the end.
  for (let i = last + 1; i < lines.length; i++) t[i] = Math.min(durationSec * 0.98, t[i - 1] + weight(lines[i - 1]) * secPerWord);

  // Fractions, strictly increasing so no line is skipped outright.
  const out: number[] = [];
  let prev = -1;
  for (const v of t) {
    let f = Math.min(1, Math.max(0, v / durationSec));
    if (f <= prev) f = Math.min(1, prev + 0.0005);
    f = Number(f.toFixed(4));
    out.push(f);
    prev = f;
  }
  return out;
}

/** Stored lineStarts JSON -> fractions, only when it fits these beats. */
export function parseLineStarts(json: string | null | undefined, beatCount: number): number[] | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json);
    if (!Array.isArray(v) || v.length !== beatCount) return null;
    if (!v.every((x) => typeof x === "number" && x >= 0 && x <= 1)) return null;
    return v as number[];
  } catch {
    return null;
  }
}
