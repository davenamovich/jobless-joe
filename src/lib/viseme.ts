/**
 * Word-specific mouth shapes for the stickman engines.
 *
 * The mouths used to open and close with the audio's loudness only, so "boom"
 * and "tea" looked the same. This reads the word being said and how far
 * through it the voice is, and picks one of four shapes:
 *
 *   closed  lips together: m, b, p at the start (or the end) of a word
 *   round   o, u, w and "ow/ou/oo": narrower and taller
 *   wide    ee, ay, i, e, y: wider and flatter
 *   mid     everything else (a, plain consonants): the neutral open mouth
 *
 * The loudness still decides HOW OPEN the mouth is; the shape decides WHAT IT
 * LOOKS LIKE. The engines run plain ES5 inside HTML strings, so the logic is
 * written once as that source (VISEME_JS) and compiled here for the tests.
 */

export type Viseme = "closed" | "round" | "wide" | "mid";

/** ES5 source, pasted into the Sit-down and stickman engines. */
export const VISEME_JS = String.raw`
  // Width and height of the open mouth for each shape (closed shows the lips line).
  var MOUTH_LOOK = { mid: [1, 1], round: [0.62, 1.3], wide: [1.38, 0.62], closed: [1, 0] };
  function visemeOf(word, p) {
    var w = String(word || "").toLowerCase().replace(/[^a-z]/g, "");
    if (!w) return "mid";
    var lips = "mbp";
    if (p < 0.22 && lips.indexOf(w.charAt(0)) >= 0) return "closed";
    if (p > 0.82 && w.length > 1 && lips.indexOf(w.charAt(w.length - 1)) >= 0) return "closed";
    var groups = w.match(/[aeiouy]+/g) || [];
    // A silent final e ("make", "time") is not a sound of its own.
    if (groups.length > 1 && groups[groups.length - 1] === "e" && /e$/.test(w)) groups.pop();
    if (/^w/.test(w) && p < 0.3) return "round";
    if (!groups.length) return "mid";
    var g = groups[Math.min(groups.length - 1, Math.floor(p * groups.length))];
    if (/o|u/.test(g)) return "round";
    if (/e|i|y/.test(g)) return "wide";
    return "mid";
  }
`;

export const visemeOf: (word: string, progress: number) => Viseme = new Function(`${VISEME_JS}; return visemeOf;`)();

/** The shape factors the engines apply to the mouth's width and height. */
export const MOUTH_LOOK: Record<Viseme, [number, number]> = new Function(`${VISEME_JS}; return MOUTH_LOOK;`)();
