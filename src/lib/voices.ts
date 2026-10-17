/**
 * TTS Voice Catalog
 *
 * Maps the Z.ai TTS voices to friendly crooner-style names. Each voice gets
 * a different timbre — useful for matching the crooner style or for giving
 * different branded walls their own voice.
 *
 * Available Z.ai voices (per the TTS skill docs):
 *   tongtong  - 温暖亲切 (warm, friendly)
 *   chuichui  - 活泼可爱 (lively, cute)
 *   xiaochen  - 沉稳专业 (calm, professional)
 *   jam       - 英音绅士 (British gentleman)  ← default for Joe's crooner
 *   kazi      - 清晰标准 (clear, standard)
 *   douji     - 自然流畅 (natural, fluent)
 *   luodo     - 富有感染力 (expressive, moving)
 *
 * For Joe we default to `jam` — the British-gentleman baritone fits the
 * crooner persona best.
 */

export interface Voice {
  key: string;
  label: string;
  description: string;
  /** Suggested TTS speed for this voice — slower reads sound more crooner */
  speed: number;
}

export const VOICES: Voice[] = [
  {
    key: "jam",
    label: "Joe's Crooner (jam)",
    description: "British-gentleman baritone. The signature Joe voice.",
    speed: 0.9,
  },
  {
    key: "xiaochen",
    label: "Late-Night DJ (xiaochen)",
    description: "Calm, professional, late-night radio energy.",
    speed: 0.85,
  },
  {
    key: "luodo",
    label: "Torch Singer (luodo)",
    description: "Expressive and moving. Wounded-dignity delivery.",
    speed: 0.85,
  },
  {
    key: "tongtong",
    label: "Warm Host (tongtong)",
    description: "Warm, friendly, conversational.",
    speed: 0.95,
  },
  {
    key: "kazi",
    label: "Standard Narrator (kazi)",
    description: "Clear, standard, neutral.",
    speed: 1.0,
  },
  {
    key: "douji",
    label: "Natural Flow (douji)",
    description: "Natural, fluent, every-day.",
    speed: 0.95,
  },
  {
    key: "chuichui",
    label: "Lively (chuichui)",
    description: "Lively, cute, high-energy.",
    speed: 1.05,
  },
];

export function getVoice(key: string | undefined | null): Voice {
  if (!key) return VOICES[0];
  return VOICES.find((v) => v.key === key) ?? VOICES[0];
}

/**
 * Split text into TTS chunks of at most `maxLength` characters. Splits on
 * sentence boundaries when possible, falls back to hard splits. Each chunk
 * keeps a trailing sentence terminator if present so the TTS engine pauses
 * naturally.
 */
export function splitLyricsIntoChunks(
  text: string,
  maxLength = 900
): string[] {
  // First strip section tags like [VERSE 1] / [CHORUS] — the TTS engine can't
  // sing them and they'd sound weird spoken aloud.
  const cleaned = text
    .replace(/\[[A-Z][A-Z0-9 ]*?\]/gi, "")
    .replace(/\n{2,}/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();

  if (cleaned.length <= maxLength) return [cleaned];

  const chunks: string[] = [];
  // Split on sentence terminators followed by whitespace/newline.
  const sentences = cleaned.match(/[^.!?]+[.!?]+[\s]*/g) ?? [cleaned];
  let current = "";
  for (const s of sentences) {
    if (s.length > maxLength) {
      // Hard-split very long sentences on commas / spaces.
      if (current) {
        chunks.push(current.trim());
        current = "";
      }
      const sub = s.match(/[^,;]+[,;]+\s*/g) ?? [s];
      for (const piece of sub) {
        if ((current + piece).length <= maxLength) {
          current += piece;
        } else {
          if (current) chunks.push(current.trim());
          current = piece;
        }
      }
    } else if ((current + s).length <= maxLength) {
      current += s;
    } else {
      if (current) chunks.push(current.trim());
      current = s;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter((c) => c.length > 0);
}

/**
 * Approximate WAV/MP3 chunk durations for caption syncing before the audio
 * actually plays. The TTS engine produces ~14 characters per second at
 * speed 1.0 for English text.
 */
export function estimateChunkDurationSec(text: string, speed: number): number {
  const charCount = text.length;
  const baseSeconds = charCount / 14;
  return baseSeconds / Math.max(0.5, Math.min(2.0, speed));
}
