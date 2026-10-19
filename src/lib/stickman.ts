/**
 * Stickman Joe — a code-drawn stick figure (tie, limbs, face) posed per beat,
 * so he looks the same in every scene with no image API.
 *
 * Ported from meme-loop-engine's ralph/stickman-html.ts. This file is the static
 * drawing (memes) and the lyric → beat mapping; the animated stage on song
 * and video pages is lib/stickman-rig.ts. Beats come from the lyric lines
 * themselves (keyword → pose/prop), so no extra LLM call is needed.
 */

export const STICKMAN_POSES = [
  "stand",
  "sing",
  "shrug",
  "facepalm",
  "point",
  "celebrate",
  "slump",
  "walk",
  "think",
  "carry",
  "type",
] as const;
export type StickmanPose = (typeof STICKMAN_POSES)[number];

export const STICKMAN_EXPRESSIONS = ["neutral", "happy", "sad", "shocked", "deadpan", "smug", "tired"] as const;
export type StickmanExpression = (typeof STICKMAN_EXPRESSIONS)[number];

export const STICKMAN_PROPS = ["mic", "laptop", "phone", "coffee", "box", "dog", "briefcase", "cloud", "lightbulb"] as const;
export type StickmanProp = (typeof STICKMAN_PROPS)[number];

export interface StickmanBeat {
  /** The lyric line (shown as the caption). */
  text: string;
  pose: StickmanPose;
  expression: StickmanExpression;
  prop?: StickmanProp;
  /** Song section this line sits in, e.g. "CHORUS". */
  section?: string;
}

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Lyrics → beats ──────────────────────────────────────────────────────────

interface Cue {
  re: RegExp;
  pose: StickmanPose;
  expression: StickmanExpression;
  prop?: StickmanProp;
}

/** First match wins, so the most specific situations come first. */
const CUES: Cue[] = [
  { re: /\b(laid off|let go|fired|pink slip|clear(ed)? (out )?my desk|cardboard box)\b/i, pose: "carry", expression: "sad", prop: "box" },
  { re: /\b(hired|paycheck|finally)\b/i, pose: "celebrate", expression: "happy" },
  { re: /\b(robots?|a\.?i\.?|machines?|algorithms?|bots?|chatbots?|replaced|software)\b/i, pose: "facepalm", expression: "tired" },
  { re: /\b(laptop|appl(y|ied|ication)s?|r[eé]sum[eé]s?|cv|e-?mails?|inbox|linkedin|portal|online|cover letter)\b/i, pose: "type", expression: "deadpan", prop: "laptop" },
  { re: /\b(rejected|rejection|ghost(ed)?|never called|no reply|no answer)\b/i, pose: "slump", expression: "sad", prop: "cloud" },
  { re: /\b(phones?|calls?|called|texts?|ringing|voicemail|recruiters?)\b/i, pose: "stand", expression: "shocked", prop: "phone" },
  { re: /\b(coffee|latte|espresso|mornings?|alarm)\b/i, pose: "stand", expression: "tired", prop: "coffee" },
  { re: /\b(dogs?|pupp(y|ies)|walkies)\b/i, pose: "stand", expression: "happy", prop: "dog" },
  { re: /\b(rain(ing)?|storms?|cry(ing)?|tears|alone|lonely|blues?|sad|broke)\b/i, pose: "slump", expression: "sad", prop: "cloud" },
  { re: /\b(interviews?|suit|office|commute|briefcase|boss)\b/i, pose: "walk", expression: "smug", prop: "briefcase" },
  { re: /\b(ideas?|think(ing)?|wonder(ing)?|maybe|plans?|dreams?|figure)\b/i, pose: "think", expression: "neutral", prop: "lightbulb" },
  { re: /\b(dance|dancing|party|celebrate|yes|win(ning)?)\b/i, pose: "celebrate", expression: "happy" },
  { re: /\b(why|what now|how come)\b|\?\s*$/i, pose: "shrug", expression: "deadpan" },
];

/** A crooner's resting moves, cycled for lines with no cue. */
const ROTATION: Array<Pick<StickmanBeat, "pose" | "expression" | "prop">> = [
  { pose: "sing", expression: "smug", prop: "mic" },
  { pose: "sing", expression: "happy", prop: "mic" },
  { pose: "shrug", expression: "deadpan" },
  { pose: "sing", expression: "neutral", prop: "mic" },
  { pose: "point", expression: "smug" },
];

/**
 * One beat per sung line. Section tags ([CHORUS] etc.) aren't sung, they set
 * the mood: choruses lean celebratory, bridges thoughtful.
 */
export function lyricsToBeats(lyrics: string, maxBeats = 48): StickmanBeat[] {
  const beats: StickmanBeat[] = [];
  let section = "";
  let rest = 0;
  for (const raw of String(lyrics ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const tag = /^\[([^\]]+)\]$/.exec(line);
    if (tag) {
      section = tag[1].trim().toUpperCase();
      continue;
    }
    const cue = CUES.find((c) => c.re.test(line));
    let look: Pick<StickmanBeat, "pose" | "expression" | "prop">;
    if (cue) look = { pose: cue.pose, expression: cue.expression, prop: cue.prop };
    else if (/CHORUS|HOOK/.test(section)) look = rest++ % 2 ? { pose: "celebrate", expression: "happy" } : { pose: "sing", expression: "happy", prop: "mic" };
    else if (/BRIDGE/.test(section)) look = { pose: "think", expression: "neutral" };
    else look = ROTATION[rest++ % ROTATION.length];
    beats.push({ text: line, ...look, ...(section ? { section } : {}) });
    if (beats.length >= maxBeats) break;
  }
  return beats;
}

/**
 * When each beat starts, as fractions of the song (0..1): each line's share
 * is its word count, inside a small lead-in/out so the first line doesn't
 * land on the intro bar.
 */
export function beatStarts(beats: StickmanBeat[], leadIn = 0.04, leadOut = 0.04): number[] {
  const weights = beats.map((b) => Math.max(2, b.text.split(/\s+/).filter(Boolean).length));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const span = Math.max(0, 1 - leadIn - leadOut);
  const starts: number[] = [];
  let acc = leadIn;
  for (const w of weights) {
    starts.push(Number(acc.toFixed(4)));
    acc += (w / total) * span;
  }
  return starts;
}

// ── The figure ──────────────────────────────────────────────────────────────
// Coordinates are relative to his centre line (x = 0); ground is y = 392.

export type Pt = readonly [number, number];
export interface PoseDef {
  le: Pt; lh: Pt; re: Pt; rh: Pt;
  lk: Pt; lf: Pt; rk: Pt; rf: Pt;
  head?: Pt;
}

const SHOULDER: Pt = [0, 168];
const HIP: Pt = [0, 268];
const HEAD: Pt = [0, 108];
const HEAD_R = 32;
const GROUND = 392;
const VIEW_W = 500;
const VIEW_H = 420;

const LEGS = { lk: [-12, 330], lf: [-20, GROUND], rk: [12, 330], rf: [20, GROUND] } as const;
const L_DOWN = { le: [-22, 215], lh: [-30, 262] } as const;
const R_DOWN = { re: [22, 215], rh: [30, 262] } as const;

export const POSES: Record<StickmanPose, PoseDef> = {
  stand: { ...L_DOWN, ...R_DOWN, ...LEGS },
  sing: { le: [-40, 196], lh: [-66, 168], re: [30, 200], rh: [52, 178], ...LEGS, head: [3, 0] },
  shrug: { le: [-42, 192], lh: [-58, 150], re: [42, 192], rh: [58, 150], ...LEGS },
  facepalm: { ...L_DOWN, re: [38, 190], rh: [10, 114], ...LEGS, head: [-2, 2] },
  point: { ...L_DOWN, re: [42, 160], rh: [88, 140], ...LEGS },
  celebrate: { le: [-34, 128], lh: [-48, 78], re: [34, 128], rh: [48, 78], lk: [-20, 328], lf: [-36, 388], rk: [20, 328], rf: [36, 388] },
  slump: { le: [-14, 222], lh: [-14, 276], re: [14, 222], rh: [14, 276], ...LEGS, head: [6, 14] },
  walk: { le: [-18, 212], lh: [-4, 256], re: [20, 210], rh: [38, 250], lk: [-14, 330], lf: [-40, 388], rk: [18, 326], rf: [30, GROUND] },
  think: { le: [-20, 222], lh: [14, 232], re: [36, 206], rh: [10, 150], ...LEGS },
  carry: { le: [-30, 210], lh: [-40, 240], re: [30, 210], rh: [40, 240], ...LEGS },
  type: { le: [14, 214], lh: [56, 236], re: [34, 206], rh: [74, 232], ...LEGS },
};

const SIDE_PROPS: ReadonlySet<StickmanProp> = new Set(["laptop", "dog", "mic"]);

const pt = (p: Pt) => `${p[0]} ${p[1]}`;

function ink(d: string, delayMs: number, cls = ""): string {
  return `<path d="${d}" pathLength="1" fill="none" class="sm-ink${cls ? " " + cls : ""}" style="--d:${delayMs}ms"/>`;
}

/** A shape with an outline that draws in and a fill that fades in. fill "paper" follows the page theme. */
function filled(shape: string, delayMs: number, fill: string, cls = ""): string {
  const paper = fill === "paper";
  return `<${shape} pathLength="1" fill="${paper ? "#fff" : fill}" class="sm-ink sm-filled${paper ? " sm-paper" : ""}${cls ? " " + cls : ""}" style="--d:${delayMs}ms"/>`;
}

function face(expr: StickmanExpression, hx: number, hy: number, d: number): string {
  const dot = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="3.6" class="sm-pop sm-dot" style="--d:${d}ms"/>`;
  const dots = dot(-11, -5) + dot(11, -5);
  const t = (p: string) => ink(p, d, "sm-thin");
  const ring = (cx: number, cy: number, r: number) =>
    `<circle cx="${cx}" cy="${cy}" r="${r}" pathLength="1" fill="none" class="sm-ink sm-thin" style="--d:${d}ms"/>`;
  const parts: Record<StickmanExpression, string> = {
    neutral: dots + t("M-9 12 L9 12"),
    happy: dots + t("M-12 8 Q0 22 12 8"),
    sad: dots + t("M-11 17 Q0 7 11 17"),
    shocked:
      ring(-11, -6, 5.5) +
      ring(11, -6, 5.5) +
      `<ellipse cx="0" cy="14" rx="6" ry="8" pathLength="1" fill="none" class="sm-ink sm-thin" style="--d:${d}ms"/>` +
      t("M-17 -17 L-6 -19") +
      t("M6 -19 L17 -17"),
    deadpan: t("M-16 -5 L-6 -5") + t("M6 -5 L16 -5") + t("M-7 13 L7 13"),
    smug: t("M-16 -4 L-6 -6") + dot(11, -5) + t("M5 -16 L17 -20") + t("M-8 13 Q4 16 12 6"),
    tired: t("M-16 -4 L-6 -4") + t("M6 -4 L16 -4") + t("M-15 2 Q-11 5 -7 2") + t("M7 2 Q11 5 15 2") + t("M-9 14 Q-4.5 10 0 14 Q4.5 18 9 14"),
  };
  return `<g transform="translate(${hx} ${hy})">${parts[expr]}</g>`;
}

function propSvg(prop: StickmanProp, pose: PoseDef, hx: number, hy: number, carrying: boolean): string {
  const D = 820;
  const [lx, ly] = pose.lh;
  const [rx, ry] = pose.rh;
  switch (prop) {
    case "mic":
      // A crooner's stand mic just in front of him.
      return (
        ink(`M64 ${GROUND} L64 182`, D) +
        ink(`M46 ${GROUND} L82 ${GROUND}`, D) +
        filled(`rect x="55" y="160" width="18" height="26" rx="9"`, D + 120, "#9ca3af") +
        ink(`M64 186 L64 196`, D + 160, "sm-thin")
      );
    case "laptop":
      return (
        ink(`M40 244 L170 244`, D) +
        ink(`M52 244 L52 ${GROUND}`, D) +
        ink(`M158 244 L158 ${GROUND}`, D) +
        filled(`rect x="62" y="234" width="76" height="9" rx="2"`, D + 120, "#d9dde3") +
        ink(`M138 238 L152 184`, D + 160, "sm-thick")
      );
    case "phone":
      return filled(`rect x="${rx - 7}" y="${ry - 24}" width="14" height="25" rx="3"`, D, "paper");
    case "coffee":
      return (
        filled(`path d="M${lx - 10} ${ly - 14} L${lx - 8} ${ly + 8} L${lx + 8} ${ly + 8} L${lx + 10} ${ly - 14} Z"`, D, "paper") +
        ink(`M${lx + 10} ${ly - 8} Q${lx + 19} ${ly - 5} ${lx + 9} ${ly + 3}`, D + 80, "sm-thin") +
        ink(`M${lx - 3} ${ly - 20} Q${lx + 1} ${ly - 26} ${lx - 3} ${ly - 32}`, D + 160, "sm-thin sm-steam") +
        ink(`M${lx + 4} ${ly - 20} Q${lx + 8} ${ly - 26} ${lx + 4} ${ly - 32}`, D + 160, "sm-thin sm-steam")
      );
    case "box": {
      const [bx, by, w, h] = carrying ? [-50, 222, 100, 64] : [56, 334, 84, 58];
      return (
        filled(`rect x="${bx}" y="${by}" width="${w}" height="${h}" rx="3"`, D, "#ead6ad") +
        ink(`M${bx} ${by + 14} L${bx + w} ${by + 14}`, D + 80, "sm-thin") +
        ink(`M${bx + 24} ${by} L${bx + 22} ${by - 28}`, D + 120, "sm-thin") +
        ink(`M${bx + 22} ${by - 18} Q${bx + 6} ${by - 24} ${bx + 4} ${by - 38} Q${bx + 18} ${by - 34} ${bx + 22} ${by - 18}`, D + 160, "sm-thin") +
        ink(`M${bx + 23} ${by - 24} Q${bx + 36} ${by - 34} ${bx + 44} ${by - 44} Q${bx + 42} ${by - 30} ${bx + 23} ${by - 24}`, D + 160, "sm-thin")
      );
    }
    case "dog":
      return (
        ink(`M80 352 L132 352`, D) +
        `<circle cx="144" cy="336" r="12" pathLength="1" fill="none" class="sm-ink" style="--d:${D}ms"/>` +
        ink(`M138 326 L134 314 L147 324`, D + 80, "sm-thin") +
        ink(`M86 352 L82 ${GROUND - 2} M98 352 L100 ${GROUND - 2} M118 352 L114 ${GROUND - 2} M130 352 L134 ${GROUND - 2}`, D + 120) +
        ink(`M80 352 Q66 346 68 330`, D + 160, "sm-wag") +
        `<circle cx="149" cy="334" r="2.6" class="sm-pop sm-dot" style="--d:${D + 300}ms"/>`
      );
    case "briefcase":
      return (
        ink(`M${lx - 7} ${ly + 4} Q${lx} ${ly - 6} ${lx + 7} ${ly + 4}`, D, "sm-thin") +
        filled(`rect x="${lx - 19}" y="${ly + 4}" width="38" height="27" rx="3"`, D + 80, "#7a5134")
      );
    case "cloud": {
      const cx = hx - 6;
      const cy = Math.max(26, hy - 70);
      return (
        filled(
          `path d="M${cx - 42} ${cy + 10} Q${cx - 58} ${cy + 10} ${cx - 54} ${cy - 4} Q${cx - 50} ${cy - 18} ${cx - 34} ${cy - 14} Q${cx - 26} ${cy - 30} ${cx - 8} ${cy - 24} Q${cx + 6} ${cy - 34} ${cx + 18} ${cy - 18} Q${cx + 38} ${cy - 18} ${cx + 34} ${cy - 2} Q${cx + 34} ${cy + 10} ${cx + 18} ${cy + 10} Z"`,
          D,
          "#9aa3ae",
        ) +
        ink(`M${cx - 32} ${cy + 20} l-4 12 M${cx - 10} ${cy + 22} l-4 12 M${cx + 12} ${cy + 20} l-4 12`, D + 200, "sm-thin sm-rain")
      );
    }
    case "lightbulb": {
      const bx = hx - 62;
      const by = Math.max(40, hy - 58);
      return (
        `<circle cx="${bx}" cy="${by}" r="16" pathLength="1" fill="#fde68a" class="sm-ink sm-filled sm-glow" style="--d:${D}ms"/>` +
        ink(`M${bx - 7} ${by + 18} L${bx + 7} ${by + 18} M${bx - 6} ${by + 24} L${bx + 6} ${by + 24}`, D + 100, "sm-thin") +
        ink(`M${bx} ${by - 26} L${bx} ${by - 34} M${bx - 22} ${by - 14} L${bx - 29} ${by - 19} M${bx + 22} ${by - 14} L${bx + 29} ${by - 19}`, D + 200, "sm-thin")
      );
    }
  }
}

/** One beat's drawing: ground, Joe in his pose, his face and the prop. Pure. */
export function renderStickmanSvg(beat: Pick<StickmanBeat, "pose" | "expression" | "prop">, tie: string): string {
  const pose = beat.pose;
  const prop = beat.prop;
  const p = POSES[pose];
  const sideProp = !!prop && (SIDE_PROPS.has(prop) || (prop === "box" && pose !== "carry"));
  const hx = HEAD[0] + (p.head?.[0] ?? 0);
  const hy = HEAD[1] + (p.head?.[1] ?? 0);
  const cx = sideProp ? 200 : 250;
  const [tx, ty] = [hx * 0.6, hy + HEAD_R];

  const parts = [
    `<circle cx="${hx}" cy="${hy}" r="${HEAD_R}" pathLength="1" fill="#fff" class="sm-ink sm-filled sm-paper" style="--d:0ms"/>`,
    ink(`M${tx} ${ty} L${pt(HIP)}`, 200),
    filled(
      `path d="M${tx - 6} ${ty + 4} L${tx + 6} ${ty + 4} L${tx + 4} ${ty + 14} L${tx + 9} ${ty + 54} L${tx} ${ty + 66} L${tx - 9} ${ty + 54} L${tx - 4} ${ty + 14} Z"`,
      320,
      tie,
      "sm-thin",
    ),
    ink(`M${pt(SHOULDER)} L${pt(p.le)} L${pt(p.lh)}`, 380),
    ink(`M${pt(SHOULDER)} L${pt(p.re)} L${pt(p.rh)}`, 440),
    ink(`M${pt(HIP)} L${pt(p.lk)} L${pt(p.lf)}`, 520),
    ink(`M${pt(HIP)} L${pt(p.rk)} L${pt(p.rf)}`, 580),
    face(beat.expression, hx, hy, 700),
    prop ? propSvg(prop, p, hx, hy, pose === "carry") : "",
  ];
  const motion = pose === "walk" ? " sm-walk" : pose === "celebrate" ? " sm-jump" : beat.expression === "shocked" ? " sm-shake" : pose === "sing" ? " sm-sway" : "";
  return `<svg class="sm-joe" viewBox="0 0 ${VIEW_W} ${VIEW_H}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${ink(`M18 ${GROUND} L${VIEW_W - 18} ${GROUND}`, 0, "sm-thin sm-ground")}<g transform="translate(${cx} 0)"><g class="sm-fig${motion}"><g class="sm-bob">${parts.join("")}</g></g></g></svg>`;
}
