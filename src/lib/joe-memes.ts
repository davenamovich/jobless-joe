/**
 * Stickman Joe memes — top/bottom caption memes with the code-drawn Joe in
 * the middle (lib/stickman.ts), rendered to PNG with sharp so Telegram gets
 * a real photo.
 *
 * Captions come from the active AI backend when it answers, and fall back to
 * the song's own hooks / closing line / punchiest lyrics when it doesn't, so
 * /meme always returns something. Joe's pose comes from the bottom line's
 * keywords (same cues as the song-page stage) unless the model picked one.
 */

import sharp from "sharp";
import { chat, loadBackendConfig } from "@/lib/ai-backend";
import {
  STICKMAN_EXPRESSIONS,
  STICKMAN_POSES,
  STICKMAN_PROPS,
  lyricsToBeats,
  renderStickmanSvg,
  type StickmanExpression,
  type StickmanPose,
  type StickmanProp,
} from "@/lib/stickman";

export interface JoeMeme {
  top: string;
  bottom: string;
  pose: StickmanPose;
  expression: StickmanExpression;
  prop?: StickmanProp;
}

/** What a meme batch is about: a finished song, or a free-text topic. */
export interface MemeSource {
  title?: string;
  topic?: string;
  lyrics?: string;
  hooks?: string[];
  closingLine?: string;
}

const W = 1080;
const H = 1350;
const TIE = "#b8434f";

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function clean(s: unknown, maxWords: number): string {
  return String(s ?? "")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[*_#`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .slice(0, maxWords)
    .join(" ");
}

function pick<T extends string>(list: readonly T[], v: unknown): T | undefined {
  const key = String(v ?? "").toLowerCase().trim().replace(/[\s_]+/g, "-");
  return (list as readonly string[]).includes(key) ? (key as T) : undefined;
}

/** Joe's look for a line: the lyric cues, as on the song page. */
function lookFor(text: string): Pick<JoeMeme, "pose" | "expression" | "prop"> {
  const beat = lyricsToBeats(text, 1)[0];
  return beat ? { pose: beat.pose, expression: beat.expression, prop: beat.prop } : { pose: "shrug", expression: "deadpan" };
}

/** Lines worth putting on a meme: hooks and the closing line first, then the shortest punchy lyrics. */
export function fallbackMemes(src: MemeSource, n = 3): JoeMeme[] {
  const lyricLines = String(src.lyrics ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^\[.*\]$/.test(l))
    .sort((a, b) => a.length - b.length)
    .filter((l) => l.split(/\s+/).length >= 4);
  const lines = [...(src.hooks ?? []), src.closingLine ?? "", ...lyricLines]
    .map((l) => clean(l, 16))
    .filter(Boolean);
  const unique = [...new Set(lines)];
  const top = clean(src.title || src.topic || "The job hunt", 10) || "The job hunt";
  const fillers = ["Me, checking my inbox for the 40th time", "Still waiting on a reply", "At least the tie still fits"];
  const out: JoeMeme[] = [];
  for (let i = 0; i < n; i++) {
    const bottom = unique[i] ?? fillers[i % fillers.length];
    out.push({ top, bottom, ...lookFor(bottom) });
  }
  return out;
}

/** Pull a JSON array out of a model reply (tolerates code fences and chatter). */
export function parseMemeJson(text: string): JoeMeme[] {
  const s = String(text ?? "");
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(s.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const memes: JoeMeme[] = [];
  for (const item of raw) {
    const m = (item ?? {}) as Record<string, unknown>;
    const top = clean(m.top, 12);
    const bottom = clean(m.bottom, 14);
    if (!top || !bottom) continue;
    const cue = lookFor(bottom);
    memes.push({
      top,
      bottom,
      pose: pick(STICKMAN_POSES, m.pose) ?? cue.pose,
      expression: pick(STICKMAN_EXPRESSIONS, m.expression) ?? cue.expression,
      prop: pick(STICKMAN_PROPS, m.prop) ?? cue.prop,
    });
  }
  return memes;
}

const MEME_SYSTEM = `You are Jobless Joe: laid off, trained the software that took his job, now a lounge crooner. Dry, self-deprecating humour about job hunting, rejection emails, LinkedIn and AI replacing people. Punch at the situation, never at the person.

Write top/bottom caption memes starring a stick figure of Joe in a tie. Return ONLY a JSON array, no prose:
[{"top": "setup, ≤10 words", "bottom": "punchline, ≤12 words", "pose": "stand|sing|shrug|facepalm|point|celebrate|slump|walk|think|carry|type", "expression": "neutral|happy|sad|shocked|deadpan|smug|tired", "prop": "mic|laptop|phone|coffee|box|dog|briefcase|cloud|lightbulb or omit"}]

Rules: each meme a different joke; the pose and prop act out the punchline; no real company names, no pay figures, no income promises, no hashtags or emojis.`;

/** n memes about a song or topic. Never throws: falls back to the song's own lines. */
export async function writeMemes(src: MemeSource, n = 3): Promise<JoeMeme[]> {
  const brief = [
    src.title ? `Song title: ${src.title}` : "",
    src.topic ? `Topic: ${src.topic}` : "",
    src.lyrics ? `Lyrics:\n${String(src.lyrics).slice(0, 2500)}` : "",
    `Write ${n} memes.`,
  ]
    .filter(Boolean)
    .join("\n\n");
  try {
    const cfg = await loadBackendConfig();
    const res = await chat(MEME_SYSTEM, brief, cfg);
    const memes = parseMemeJson(res.content).slice(0, n);
    if (memes.length > 0) {
      const extra = memes.length < n ? fallbackMemes(src, n).slice(memes.length) : [];
      return [...memes, ...extra];
    }
  } catch (err) {
    console.warn("[joe-memes] caption writer failed, using the song's own lines:", err instanceof Error ? err.message : err);
  }
  return fallbackMemes(src, n);
}

// ── Rendering ───────────────────────────────────────────────────────────────

/** Split into lines of at most maxChars, never mid-word, at most maxLines (the last one ellipsized). */
export function wrapCaption(text: string, maxChars: number, maxLines: number): string[] {
  const lines: string[] = [];
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const last = lines[lines.length - 1];
    if (last !== undefined && (last + " " + w).length <= maxChars) lines[lines.length - 1] = last + " " + w;
    else lines.push(w);
  }
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].replace(/[.,;:!?]*$/, "") + "…";
    return kept;
  }
  return lines;
}

/** Meme-style caption block: big bold uppercase, white fill, black outline. */
function captionSvg(text: string, y0: number, fromBottom: boolean): string {
  const upper = text.toUpperCase();
  const size = upper.length > 60 ? 62 : upper.length > 36 ? 72 : 84;
  // Sized for DejaVu Sans Bold (the Docker image's font), which is wider than Impact.
  const lines = wrapCaption(upper, Math.floor(980 / (size * 0.66)), 3);
  const lh = size * 1.08;
  const first = fromBottom ? y0 - (lines.length - 1) * lh : y0;
  return lines
    .map(
      (l, i) =>
        `<text x="${W / 2}" y="${Math.round(first + i * lh)}" font-size="${size}" class="cap">${esc(l)}</text>`,
    )
    .join("");
}

/** The whole meme as one SVG (static colours only; librsvg has no CSS variables). */
export function memeSvg(m: JoeMeme, footer = "JOBLESS JOE"): string {
  const joe = renderStickmanSvg(m, TIE)
    // 880×740 keeps his ground line (y≈911) clear of a three-line bottom caption.
    .replace('class="sm-joe"', `x="100" y="220" width="${W - 200}" height="740"`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>
.sm-ink{stroke:#1d1b18;stroke-width:6;stroke-linecap:round;stroke-linejoin:round}
.sm-thin{stroke-width:4}.sm-thick{stroke-width:9}.sm-ground{stroke-width:3;opacity:.45}
.sm-paper{fill:#ffffff}.sm-dot{fill:#1d1b18}
.cap{font-family:Impact,'Anton','Arial Black','DejaVu Sans',sans-serif;font-weight:900;fill:#ffffff;stroke:#111111;stroke-width:7;paint-order:stroke;stroke-linejoin:round;text-anchor:middle;letter-spacing:1px}
.foot{font-family:'DejaVu Sans',Arial,sans-serif;font-size:26px;font-weight:700;fill:#1d1b18;opacity:.45;text-anchor:middle;letter-spacing:4px}
</style>
<rect width="${W}" height="${H}" fill="#f7f3ea"/>
<rect x="0" y="0" width="${W}" height="${H}" fill="url(#g)"/>
<defs><radialGradient id="g" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="#fffdf8"/><stop offset="1" stop-color="#ece5d6"/></radialGradient></defs>
${joe}
${captionSvg(m.top, 120, false)}
${captionSvg(m.bottom, H - 110, true)}
<text x="${W / 2}" y="${H - 34}" class="foot">${esc(footer)}</text>
</svg>`;
}

/** One meme as a PNG buffer. */
export async function renderMemePng(m: JoeMeme, footer?: string): Promise<Buffer> {
  return sharp(Buffer.from(memeSvg(m, footer))).png().toBuffer();
}
