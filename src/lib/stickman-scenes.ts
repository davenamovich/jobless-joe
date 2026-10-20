/**
 * Stickman scenes — the song video's storyboard. Each sung line becomes a
 * scene: Joe's pose, face and hand prop (as on the song page), plus a set
 * behind him and a big item beside him that act out what the line says
 * ("sent my résumé to the moon" → a night sky, Joe throwing pages at it).
 * The last [OUTRO] line is the punchline: it gets the most time and holds to
 * the end of the track.
 *
 * Pure: an LLM can choose the scenes (buildScenePrompt → mergeLlmScenes, run
 * by stickman-scene-llm.ts) and keywordScenes always works offline.
 * planTimeline spreads the scenes over the rendered audio.
 */

import {
  STICKMAN_EXPRESSIONS,
  STICKMAN_POSES,
  STICKMAN_PROPS,
  lyricsToBeats,
  type StickmanBeat,
  type StickmanExpression,
  type StickmanPose,
  type StickmanProp,
} from "./stickman";

/** Backdrops, drawn behind Joe (stickman-sets.ts). "stage" is the bare crooner stage. */
export const SCENE_SETS = [
  "stage",
  "office",
  "laundromat",
  "interview",
  "jobfair",
  "videocall",
  "night",
  "city",
  "rain",
  "home",
] as const;
export type SceneSet = (typeof SCENE_SETS)[number];

/** Big things beside Joe, drawn on the floor of the set. */
export const SCENE_ITEMS = ["papers", "washer", "webcam", "clock", "robot", "invoice", "sign", "money", "door"] as const;
export type SceneItem = (typeof SCENE_ITEMS)[number];

export interface Scene extends StickmanBeat {
  set: SceneSet;
  item?: SceneItem;
  /** Short ALL-CAPS text for a sign or invoice, e.g. "15 YRS EXP". */
  label?: string;
  /** The song's last line: Joe's punchline. */
  punch?: boolean;
}

export interface SongLine {
  text: string;
  /** Section tag without brackets, upper-cased, e.g. "VERSE 1". */
  section: string;
  /** 0-based index of the section in the song. */
  sectionIndex: number;
  punch: boolean;
}

const TAG = /^\[([^\]]+)\]$/;

/** Sung lines in order, with their section. Mirrors lyricsToBeats' parsing. */
export function parseSongLines(lyrics: string, maxLines = 48): SongLine[] {
  const lines: SongLine[] = [];
  let section = "";
  let sectionIndex = -1;
  for (const raw of String(lyrics ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const tag = TAG.exec(line);
    if (tag) {
      section = tag[1].trim().toUpperCase();
      sectionIndex++;
      continue;
    }
    if (sectionIndex < 0) sectionIndex = 0;
    lines.push({ text: line, section, sectionIndex, punch: false });
    if (lines.length >= maxLines) break;
  }
  // The punchline: the last line of the last OUTRO, else the last line sung.
  let punch = -1;
  for (let i = lines.length - 1; i >= 0 && punch < 0; i--) if (/OUTRO/.test(lines[i].section)) punch = i;
  if (punch < 0) punch = lines.length - 1;
  if (punch >= 0) lines[punch].punch = true;
  return lines;
}

// ── Keyword scenes ──────────────────────────────────────────────────────────

const SET_CUES: Array<{ re: RegExp; set: SceneSet }> = [
  { re: /\b(laundr\w*|washers?|dryers?|rinse\w*|spin cycle|change machine|wash(ing)? machine)\b/i, set: "laundromat" },
  { re: /\b(moon|stars?|outer space|space|rocket|orbit|midnight|night sky)\b/i, set: "night" },
  { re: /\b(job fair|booths?|badge|career fair)\b/i, set: "jobfair" },
  { re: /\b(camera|webcam|zoom call|video call|on screen|filming|on mute|unmute)\b/i, set: "videocall" },
  { re: /\b(interview\w*|recruiters?|hiring manager|panel|hr)\b/i, set: "interview" },
  { re: /\b(office|desk|cubicle|boss|meeting|workflow|staff|coworkers?)\b/i, set: "office" },
  { re: /\b(street|city|bus|subway|commute|downtown|sidewalk|traffic)\b/i, set: "city" },
  { re: /\b(rain\w*|storms?|thunder|flood\w*|umbrella)\b/i, set: "rain" },
  { re: /\b(couch|sofa|home|bed|kitchen|basement|pajamas|living room)\b/i, set: "home" },
];

interface ItemCue {
  re: RegExp;
  item: SceneItem;
  pose?: StickmanPose;
  expression?: StickmanExpression;
  label?: string;
}

/** First match wins, so the most specific gags come first. */
const ITEM_CUES: ItemCue[] = [
  { re: /\b(sent|send|sending|threw|throw|tossed?|fired off|mail(ed)?|launch(ed)?)\b.*\b(r[eé]sum[eé]s?|cvs?|applications?|papers?|cover letters?)\b|\b(r[eé]sum[eé]s?|cvs?|applications?)\b.*\b(to|at|into) the\b/i, item: "papers", pose: "throw", expression: "smug" },
  { re: /\bunpaid\b/i, item: "sign", pose: "shrug", expression: "deadpan", label: "UNPAID" },
  { re: /\b(invoice\w*|billed|bill them|consulting fee)\b/i, item: "invoice", pose: "present", expression: "smug" },
  { re: /\b(paid|paycheck|salary|money|cash|dollars?|raise|bonus)\b|\$\d/i, item: "money", pose: "celebrate", expression: "happy" },
  { re: /\b(fired|let go|laid off|leave the room|walked out|escorted|exit)\b/i, item: "door" },
  { re: /\b(washers?|dryers?|washing machine|spin cycle)\b/i, item: "washer" },
  { re: /\b(camera|webcam|filming|recording)\b/i, item: "webcam" },
  { re: /\b(a\.?i\.?|robots?|bots?|chatbots?|algorithms?|agents?)\b/i, item: "robot" },
  { re: /\b(o'?clock|noon|deadline|due by|hours?|minutes?|at (one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,2}))\b|^(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|noon)\b[,:]/i, item: "clock" },
];

const POSE_CUES: Array<{ re: RegExp; pose: StickmanPose }> = [
  { re: /\b(hello|hi|bye|goodbye|wave[sd]?|waving)\b/i, pose: "wave" },
  { re: /\b(look|behold|ta-?da|here'?s|built|made|demo|showed?|presented?)\b/i, pose: "present" },
];

const NUMBER_WORDS: Record<string, string> = {
  two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  eleven: "11", twelve: "12", fifteen: "15", twenty: "20", thirty: "30", forty: "40", fifty: "50", hundred: "100",
};

/** Words for a sign: a quoted ALL-CAPS phrase ("OUT OF ORDER"), else "N years" → "15 YRS EXP". */
export function signLabel(text: string): string | undefined {
  const caps = /\b([A-Z][A-Z'&]{1,}(?:\s+[A-Z][A-Z'&]*)*)\b/.exec(text.replace(/\bAI\b|\bHR\b|\bI\b/g, ""));
  if (caps && caps[1].replace(/\s/g, "").length >= 4) return cleanLabel(caps[1]);
  const years = /\b(\d+|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty)\s+years?\b/i.exec(text);
  if (years) {
    const n = NUMBER_WORDS[years[1].toLowerCase()] ?? years[1];
    return `${n} YRS EXP`;
  }
  return undefined;
}

export function cleanLabel(v: unknown): string | undefined {
  const s = String(v ?? "")
    .replace(/[^\p{L}\p{N}$%&'!?.:\-\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  if (s.length <= 24) return s || undefined;
  const cut = s.slice(0, 25).replace(/\s+\S*$/, "");
  return cut || s.slice(0, 24);
}

function firstSet(lines: SongLine[]): SceneSet | undefined {
  for (const l of lines) {
    const cue = SET_CUES.find((c) => c.re.test(l.text));
    if (cue) return cue.set;
  }
  return undefined;
}

const isChorus = (section: string) => /CHORUS|HOOK/.test(section);

/** A floor prop beside Joe (laptop, dog, stand mic, a box on the floor). */
export function isFloorProp(prop: StickmanProp | undefined, pose: StickmanPose): boolean {
  return prop === "laptop" || prop === "dog" || prop === "mic" || (prop === "box" && pose !== "carry");
}

/** A big item, or the HR desk, takes the spot a floor prop would stand in. */
function clearFloorProp(scene: Scene): Scene {
  if ((scene.item || scene.set === "interview") && isFloorProp(scene.prop, scene.pose)) delete scene.prop;
  return scene;
}

/**
 * The offline storyboard. Joe's pose/face/prop come from the song page's lyric
 * cues, then the scene cues add a set and an item. A set holds until a line
 * names a new place; choruses go back to the bare stage for the dance.
 */
export function keywordScenes(lyrics: string, maxLines = 48): Scene[] {
  const lines = parseSongLines(lyrics, maxLines);
  const beats = lyricsToBeats(lyrics, maxLines);
  let signs = 0;
  let place: SceneSet = firstSet(lines.filter((l) => l.sectionIndex === lines[0]?.sectionIndex)) ?? firstSet(lines) ?? "stage";
  return lines.map((line, i) => {
    const beat = beats[i] ?? { text: line.text, pose: "sing" as const, expression: "smug" as const };
    const setCue = SET_CUES.find((c) => c.re.test(line.text));
    if (setCue) place = setCue.set;
    const set: SceneSet = setCue ? setCue.set : isChorus(line.section) ? "stage" : place;

    const scene: Scene = { ...beat, text: line.text, set, ...(line.section ? { section: line.section } : {}) };
    const itemCue = ITEM_CUES.find((c) => c.re.test(line.text));
    const poseCue = POSE_CUES.find((c) => c.re.test(line.text));
    if (itemCue) {
      scene.item = itemCue.item;
      if (itemCue.pose) scene.pose = itemCue.pose;
      if (itemCue.expression) scene.expression = itemCue.expression;
      if (itemCue.label) scene.label = itemCue.label;
      else if (itemCue.item === "washer" || itemCue.item === "invoice") {
        const label = signLabel(line.text);
        if (label && !/YRS EXP$/.test(label)) scene.label = label; // "OUT OF ORDER" taped to the dryer
      }
    } else if (signs < MAX_SIGNS || line.punch) {
      const label = signLabel(line.text);
      if (label) {
        signs++;
        scene.item = "sign";
        scene.label = label;
        if (scene.pose === "sing" || scene.pose === "stand") scene.pose = "point";
      }
    }
    if (poseCue && !itemCue?.pose) scene.pose = poseCue.pose;
    if (line.punch) {
      scene.punch = true;
      if (scene.expression !== "happy") scene.expression = "smug";
      if (!scene.item && !isChorus(line.section) && (scene.pose === "sing" || scene.pose === "stand")) scene.pose = "present";
    }
    return clearFloorProp(scene);
  });
}

// ── LLM storyboard ──────────────────────────────────────────────────────────

export const SCENE_SYSTEM = `You storyboard a comedy music video. The star is Jobless Joe, a stick figure in a red tie, acting out his own song line by line on a small ink-drawn set. Make every line visual and literal: if he sings "sent my résumé to the moon", he throws pages at the moon. The punchline (marked PUNCHLINE) must be the funniest, clearest picture.

Return ONLY JSON, no prose:
{"scenes":[{"n":1,"pose":"…","face":"…","prop":"…","set":"…","item":"…","label":"…"}]}

Allowed values (use exactly these words):
pose: ${STICKMAN_POSES.join("|")}  (throw = hurling something off-stage, present = "ta-da" toward the item, carry = arms full)
face: ${STICKMAN_EXPRESSIONS.join("|")}
prop (in his hand or beside him, or ""): ${STICKMAN_PROPS.join("|")}
set (the place behind him): ${SCENE_SETS.join("|")}  (stage = bare spotlight, interview = HR person behind a desk, videocall = he's inside a video-call screen, night = moon and stars)
item (a big thing beside him, or ""): papers = pages flying from his throwing hand, washer, webcam = camera on a tripod, clock = wall clock with a racing hand, robot = the AI, invoice = a bill on an easel (label = the amount), sign = a placard (label = its words), money = cash raining down, door = an EXIT door
label: 1–3 words in CAPS on the sign or invoice ("" otherwise)

Rules: one scene per numbered line, same order; keep the same set for lines in the same place, change it only when the lyric moves somewhere new; choruses may go back to "stage"; most lines need no item — use one only when it is the joke, and a sign at most three times in the whole song; don't repeat the same pose three lines in a row.`;

export function buildScenePrompt(lines: SongLine[], title = ""): string {
  const out: string[] = [];
  if (title) out.push(`Song: ${title}`, "");
  let section = "\u0000";
  lines.forEach((l, i) => {
    if (l.section !== section) {
      section = l.section;
      if (section) out.push(`[${section}]`);
    }
    out.push(`${i + 1}. ${l.text}${l.punch ? "   ← PUNCHLINE" : ""}`);
  });
  return out.join("\n");
}

/** Signs per song, the punchline's not counted. */
const MAX_SIGNS = 3;

function pick<T extends string>(list: readonly T[], v: unknown): T | undefined {
  const key = String(v ?? "").toLowerCase().trim();
  return (list as readonly string[]).includes(key) ? (key as T) : undefined;
}

/**
 * Lay a model's storyboard over the keyword one: every field the model got
 * right wins, anything missing or not in our vocabulary keeps the keyword
 * choice. Returns how many lines the model actually staged.
 */
export function mergeLlmScenes(fallback: Scene[], reply: string): { scenes: Scene[]; used: number } {
  const s = String(reply ?? "");
  const obj = s.indexOf("{");
  const arr = s.indexOf("[");
  const [open, close] = arr >= 0 && (obj < 0 || arr < obj) ? ["[", "]"] : ["{", "}"];
  let list: unknown[] = [];
  try {
    const raw = JSON.parse(s.slice(s.indexOf(open), s.lastIndexOf(close) + 1)) as unknown;
    if (Array.isArray(raw)) list = raw;
    else if (raw && Array.isArray((raw as { scenes?: unknown }).scenes)) list = (raw as { scenes: unknown[] }).scenes;
  } catch {
    list = [];
  }

  const byN = new Map<number, Record<string, unknown>>();
  list.forEach((item, i) => {
    const m = (item ?? {}) as Record<string, unknown>;
    const n = Number(m.n);
    byN.set(Number.isInteger(n) && n >= 1 ? n - 1 : i, m);
  });

  // Models love a sign: past the cap (the punchline excepted), a sign line
  // keeps its keyword item, or none.
  const signsAllowed = MAX_SIGNS - fallback.filter((s, i) => !byN.has(i) && s.item === "sign").length;
  let signs = 0;
  let used = 0;
  const scenes = fallback.map((base, i) => {
    const m = byN.get(i);
    if (!m) return base;
    const pose = pick(STICKMAN_POSES, m.pose);
    const expression = pick(STICKMAN_EXPRESSIONS, m.face ?? m.expression);
    const set = pick(SCENE_SETS, m.set);
    if (!pose && !set) return base;
    used++;
    const propRaw = String(m.prop ?? "").trim().toLowerCase();
    const itemRaw = String(m.item ?? "").trim().toLowerCase();
    const prop: StickmanProp | undefined = propRaw === "" || propRaw === "none" ? undefined : (pick(STICKMAN_PROPS, propRaw) ?? base.prop);
    let item: SceneItem | undefined = itemRaw === "" || itemRaw === "none" ? undefined : (pick(SCENE_ITEMS, itemRaw) ?? base.item);
    if (item === "sign" && !base.punch && ++signs > signsAllowed) item = base.item === "sign" ? undefined : base.item;
    const scene: Scene = {
      ...base,
      pose: pose ?? base.pose,
      expression: expression ?? base.expression,
      set: set ?? base.set,
    };
    if (prop) scene.prop = prop;
    else delete scene.prop;
    if (item) {
      scene.item = item;
      const label = item === "sign" || item === "invoice" ? (cleanLabel(m.label) ?? base.label ?? (item === "sign" ? signLabel(base.text) : undefined)) : undefined;
      if (label) scene.label = label;
      else delete scene.label;
    } else {
      delete scene.item;
      delete scene.label;
    }
    return clearFloorProp(scene);
  });
  return { scenes, used };
}

// ── Timing ──────────────────────────────────────────────────────────────────

export interface TimedScene {
  /** Seconds into the track. */
  start: number;
  end: number;
  /** start as a fraction of the track (what the rig keys on). */
  at: number;
}

export interface TimelineOptions {
  /** Instrumental intro before the first line, seconds (default 5% of the track, 1–4s). */
  leadIn?: number;
  /** Instrumental tail after the last line is sung (default 4% of the track, 0.5–3s). */
  tail?: number;
  /** The punchline is on screen at least this long (default 4s, capped at a quarter of the track). */
  minPunch?: number;
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

function syllables(text: string): number {
  const words = text.toLowerCase().match(/[\p{L}']+|\d+/gu) ?? [];
  let n = 0;
  for (const w of words) {
    if (/^\d+$/.test(w)) n += 2 * w.length;
    else n += Math.max(1, (w.replace(/e$/, "").match(/[aeiouyàâäéèêëïîôöùûü]+/g) ?? []).length);
  }
  return n;
}

/**
 * When each scene is on screen, with no per-line timestamps to go on: the
 * sung stretch (after an intro, before a tail) is shared by syllable count,
 * a breath between sections, and the punchline gets a longer share and holds
 * from its start to the very end of the track.
 */
export function planTimeline(scenes: Array<Pick<Scene, "text" | "section" | "punch">>, durationSec: number, opts: TimelineOptions = {}): TimedScene[] {
  const n = scenes.length;
  if (n === 0) return [];
  const dur = durationSec > 0 && Number.isFinite(durationSec) ? durationSec : 60;
  const lead = clamp(opts.leadIn ?? clamp(dur * 0.05, 1, 4), 0, dur * 0.25);
  const tail = clamp(opts.tail ?? clamp(dur * 0.04, 0.5, 3), 0, dur * 0.2);

  const weights = scenes.map((s, i) => {
    let w = Math.max(3, syllables(s.text));
    if (s.punch) w *= 1.5;
    if (i > 0 && (s.section ?? "") !== (scenes[i - 1].section ?? "")) w += 2; // a breath between sections
    return w;
  });
  const sungEnd = dur - tail;
  const span = Math.max(0.001, sungEnd - lead);
  const total = weights.reduce((a, b) => a + b, 0);

  const starts: number[] = [];
  let acc = lead;
  for (const w of weights) {
    starts.push(acc);
    acc += (w / total) * span;
  }

  // The punchline (wherever it is, normally last) runs to the end of the track.
  const punchIdx = scenes.findIndex((s) => s.punch);
  if (punchIdx === n - 1 && n > 1) {
    const minPunch = Math.min(opts.minPunch ?? 4, dur / 4);
    if (dur - starts[n - 1] < minPunch) {
      // Squeeze everything before it into [lead, dur - minPunch].
      const newEnd = Math.max(lead, dur - minPunch);
      const k = (newEnd - lead) / Math.max(0.001, starts[n - 1] - lead);
      for (let i = 1; i < n; i++) starts[i] = lead + (starts[i] - lead) * k;
    }
  }

  return starts.map((start, i) => {
    const end = i + 1 < n ? starts[i + 1] : dur;
    return {
      start: Number(start.toFixed(3)),
      end: Number(end.toFixed(3)),
      at: Number((start / dur).toFixed(5)),
    };
  });
}
