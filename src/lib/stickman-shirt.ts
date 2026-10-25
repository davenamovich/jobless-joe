/**
 * Stickman shirt — Joe's tee for a song: a meme line from the song printed on
 * a colour picked from the title, drawn on the live rig in place of the tie.
 *
 * The idea and the palette come from the sit-down show's wardrobe
 * (meme-loop-engine, bot/src/lib/sitdown/sitdown-wardrobe.ts); the drawing is
 * redone for the stick-figure rig, where the torso is a single line and the
 * arms are drawn over the shirt.
 */

export interface ShirtDesign {
  /** Fabric colour. */
  color: string;
  /** Print colour, readable on the fabric. */
  ink: string;
  /** The slogan: one or two short lines. */
  lines: string[];
  /** A meme picture for the chest (https only), above the slogan. */
  imageUrl?: string;
}

/** [fabric, print] pairs, all readable. */
export const SHIRT_COLORS: ReadonlyArray<readonly [string, string]> = [
  ["#2f6fdb", "#ffffff"],
  ["#e5383b", "#fff4d6"],
  ["#2a9d6f", "#0d1f17"],
  ["#f2c14e", "#1b1b1b"],
  ["#7b4fd0", "#fdf3ff"],
  ["#ff7a59", "#1d0f0a"],
  ["#1b1b1b", "#f2c14e"],
  ["#e9e4d8", "#b8434f"],
];

const MAX_WORDS = 5;

function clean(s: unknown, max: number): string {
  return String(s ?? "")
    .replace(/https?:\/\/\S+|www\.\S+/gi, "")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[<>{}\[\]*_#`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** A stable number per title, so a re-render wears the same tee. */
export function titleSeed(title: string): number {
  let h = 2166136261;
  for (const ch of title) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** A slogan split into at most two lines of ~12 characters, in caps. */
export function sloganLines(slogan: string, maxLines = 2, width = 12): string[] {
  const words = clean(slogan, 60).toUpperCase().split(" ").filter(Boolean).slice(0, MAX_WORDS);
  const lines: string[] = [""];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if (cur && (cur + " " + w).length > width) {
      if (lines.length === maxLines) break;
      lines.push(w);
    } else lines[lines.length - 1] = cur ? `${cur} ${w}` : w;
  }
  return lines.filter(Boolean);
}

/** The shortest candidate of 2-5 words, else the first one cut to five words. */
export function pickSlogan(candidates: ReadonlyArray<string | undefined>): string {
  const lines = candidates.map((c) => clean(c, 80)).filter(Boolean);
  const fits = lines.filter((l) => l.split(" ").length >= 2 && l.split(" ").length <= MAX_WORDS);
  if (fits.length) return fits.sort((a, b) => a.length - b.length)[0];
  return (lines[0] ?? "").split(" ").slice(0, MAX_WORDS).join(" ");
}

/** The tee for a song: the title picks the colour, the slogan is the meme line. */
export function designShirt(title: string, slogan: string, imageUrl?: string): ShirtDesign {
  const [color, ink] = SHIRT_COLORS[titleSeed(title) % SHIRT_COLORS.length];
  const lines = sloganLines(slogan);
  return {
    color,
    ink,
    lines: lines.length ? lines : sloganLines("still employed (spiritually)"),
    ...(imageUrl && /^https:\/\/[^\s"'<>]+$/.test(imageUrl) ? { imageUrl } : {}),
  };
}

/**
 * The tee in neck space (0,0 = the neck; the shoulders are 28 down, the hip 128):
 * body, short sleeves, and the print. It sits in the rig's tie slot, so it
 * follows the neck and leans with the head, and the arms draw over it.
 */
export function shirtRigSvg(shirt: ShirtDesign): string {
  const img = shirt.imageUrl ?? "";
  const top = img ? 74 : 62;
  const text = shirt.lines
    .slice(0, 2)
    .map((l, i) => {
      const size = Math.max(7, Math.min(15, (44 / Math.max(4, l.length)) * 1.75));
      return `<text x="0" y="${(top + i * (size + 1)).toFixed(1)}" text-anchor="middle" font-family="Impact,'Arial Black',sans-serif" font-size="${size.toFixed(1)}" font-weight="900" fill="${shirt.ink}" stroke="${shirt.color}" stroke-width="1.6" paint-order="stroke" stroke-linejoin="round">${esc(l)}</text>`;
    })
    .join("");
  const pic = img
    ? `<rect x="-18" y="36" width="36" height="28" fill="#111"/><image href="${esc(img)}" x="-18" y="36" width="36" height="28" preserveAspectRatio="xMidYMid slice"/>`
    : "";
  return `<path class="sm-ink sm-thin" pathLength="1" fill="${shirt.color}" d="M-9 0 Q0 8 9 0 L27 8 L42 30 L32 40 L26 33 L25 114 L-25 114 L-26 33 L-32 40 L-42 30 L-27 8 Z" style="--d:320ms"/>${pic}${text}`;
}
