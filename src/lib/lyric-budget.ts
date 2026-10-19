/**
 * Lyric budgeting — keeps a song's words inside the time it has.
 *
 * The audio engines are handed an exact number of seconds (`audio_config.
 * duration` for ACE-Step) and sing whatever lyrics they get inside that window.
 * A song that runs long doesn't get an extra verse; its ending gets cut off
 * mid-line. So the writer is held to a word budget derived from the requested
 * time, and the closing line has to land inside it.
 *
 * The rates are deliberately conservative for Joe's tempo — a lounge crooner
 * holding notes, not a rap verse: aim for ~1.9 sung words per second, never
 * past ~2.1. That keeps his existing ~25/55/110/170/230-word scale but makes it
 * a limit instead of a suggestion.
 *
 * Only performed words count: bracketed section tags and blank lines are
 * staging, not singing, so they're excluded from every measurement here.
 */

/** Aim for this many sung words per second of song. */
export const WORDS_PER_SECOND = 1.9;
/** Past this, the render clips the ending. */
export const MAX_WORDS_PER_SECOND = 2.1;

export interface DurationBudget {
  /** Duration key as used by the studio, e.g. "60s". */
  key: string;
  seconds: number;
  /** Aim for this. */
  targetWords: number;
  /** Hard ceiling — the ending is at risk beyond it. */
  maxWords: number;
  /** The skeleton that fits this length. */
  sections: string[];
}

/** "60s" / "60 seconds — standard song episode" → 60, clamped like ACE-Step. */
export function durationSeconds(durationKey: string, label?: string): number {
  const keyMatch = /^(\d+)s$/.exec((durationKey ?? "").trim());
  // The song's own `duration` field is a label like "60 seconds", so the key
  // position is searched too — callers can pass either, or both.
  const labelMatch = /(\d+)\s*(?:s\b|sec|seconds)/i.exec(
    `${durationKey ?? ""} ${label ?? ""}`
  );
  const seconds = keyMatch
    ? Number(keyMatch[1])
    : labelMatch
      ? Number(labelMatch[1])
      : 30;
  return Math.min(240, Math.max(10, seconds));
}

/**
 * The section skeleton per length. Short songs get fewer sections, not the same
 * sections with fewer words.
 */
function sectionsFor(seconds: number): string[] {
  if (seconds <= 20) return ["INTRO", "VERSE 1", "OUTRO"];
  if (seconds <= 45) return ["VERSE 1", "CHORUS", "OUTRO"];
  if (seconds <= 75) return ["INTRO", "VERSE 1", "CHORUS", "OUTRO"];
  if (seconds <= 105) return ["INTRO", "VERSE 1", "CHORUS", "VERSE 2", "OUTRO"];
  return ["INTRO", "VERSE 1", "CHORUS", "VERSE 2", "BRIDGE", "OUTRO"];
}

export function budgetFor(durationKey: string, label?: string): DurationBudget {
  const seconds = durationSeconds(durationKey, label);
  return {
    key: durationKey,
    seconds,
    targetWords: Math.round(seconds * WORDS_PER_SECOND),
    maxWords: Math.round(seconds * MAX_WORDS_PER_SECOND),
    sections: sectionsFor(seconds),
  };
}

/** Performed words only: section tags and blank lines don't get sung. */
export function countSungWords(lyrics: string): number {
  return String(lyrics ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^\[[^\]]+\]$/.test(line))
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;
}

/** Section tags in the order they appear, uppercased. */
export function lyricSections(lyrics: string): string[] {
  return [...String(lyrics ?? "").matchAll(/^\s*\[([^\]]+)\]\s*$/gm)].map((m) =>
    m[1].trim().toUpperCase()
  );
}

/** The last line that actually gets sung. */
export function lastSungLine(lyrics: string): string {
  const lines = String(lyrics ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^\[[^\]]+\]$/.test(l));
  return lines[lines.length - 1] ?? "";
}

export interface LyricFit {
  seconds: number;
  words: number;
  targetWords: number;
  maxWords: number;
  /** Words past the ceiling — 0 means it fits. */
  overBy: number;
  fits: boolean;
  sections: string[];
  /** Skeleton sections this lyric never reaches. */
  missingSections: string[];
  hasOutro: boolean;
  lastLine: string;
}

/**
 * Measure a lyric against the time it has. `fits` covers the ending too: a song
 * with no closing section can't end properly inside its budget.
 */
export function analyzeLyricFit(
  lyrics: string,
  durationKey: string,
  label?: string
): LyricFit {
  const budget = budgetFor(durationKey, label);
  const words = countSungWords(lyrics);
  const sections = lyricSections(lyrics);
  const missingSections = budget.sections.filter(
    (s) => !sections.some((present) => present === s || present.startsWith(`${s} `))
  );
  // Very short songs carry their punchline in the verse — only ask for an
  // explicit [OUTRO] once there is room to close a section.
  const needsOutro = budget.seconds > 20;
  const hasOutro = sections.some((s) => s.startsWith("OUTRO"));
  return {
    seconds: budget.seconds,
    words,
    targetWords: budget.targetWords,
    maxWords: budget.maxWords,
    overBy: Math.max(0, words - budget.maxWords),
    fits:
      words <= budget.maxWords && (!needsOutro || hasOutro),
    sections,
    missingSections,
    hasOutro,
    lastLine: lastSungLine(lyrics),
  };
}

/** The numbers, phrased for the songwriter model. */
export function budgetBrief(durationKey: string, label?: string): string {
  const b = budgetFor(durationKey, label);
  return `${b.seconds}s song = at most ${b.maxWords} sung words (aim for ~${b.targetWords}). Sections that fit: ${b.sections.map((s) => `[${s}]`).join(" → ")}.`;
}
