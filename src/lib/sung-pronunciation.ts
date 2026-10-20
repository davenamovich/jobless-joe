/**
 * Singable lyrics: the copy of Joe's lyrics that ACE-Step sings, rewritten
 * so the words come out right. The singer reads text, not meaning, so it
 * mangles digits ("401", "$50k", "9:30"), symbols ("&", "%"), acronyms
 * ("AI" sung as "eye") and loanwords ("résumé" sung as "re-zoom").
 *
 * Only the sung copy changes. The lyrics stored on the episode, shown in the
 * app and on the song page / stickman video stay exactly as written.
 * English only: other languages come back unchanged.
 */

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function under100(n: number): string {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : "");
}

function under1000(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (!h) return under100(rest);
  return `${ONES[h]} hundred${rest ? ` ${under100(rest)}` : ""}`;
}

/** 0 … 999,999,999 in words: 401 → "four hundred one". */
export function numberWords(n: number): string {
  if (!Number.isFinite(n) || n < 0 || n >= 1e9 || !Number.isInteger(n)) return String(n);
  if (n < 1000) return under1000(n);
  const parts: string[] = [];
  const millions = Math.floor(n / 1e6);
  const thousands = Math.floor((n % 1e6) / 1000);
  const rest = n % 1000;
  if (millions) parts.push(`${under1000(millions)} million`);
  if (thousands) parts.push(`${under1000(thousands)} thousand`);
  if (rest) parts.push(under1000(rest));
  return parts.join(" ");
}

/** 1999 → "nineteen ninety-nine", 2005 → "two thousand five", 2025 → "twenty twenty-five". */
function yearWords(n: number): string {
  const hi = Math.floor(n / 100);
  const lo = n % 100;
  if (n >= 2000 && n < 2010) return numberWords(n);
  if (lo === 0) return `${under100(hi)} hundred`;
  return `${under100(hi)} ${lo < 10 ? `oh ${ONES[lo]}` : under100(lo)}`;
}

const ORDINAL_FIX: Record<string, string> = { one: "first", two: "second", three: "third", five: "fifth", eight: "eighth", nine: "ninth", twelve: "twelfth" };
function ordinalWords(n: number): string {
  const words = numberWords(n);
  const m = /(\w+)$/.exec(words)!;
  const last = m[1];
  const ord = ORDINAL_FIX[last] ?? (last.endsWith("y") ? `${last.slice(0, -1)}ieth` : `${last}th`);
  return words.slice(0, m.index) + ord;
}

const SCALE: Record<string, string> = { k: "thousand", m: "million", b: "billion" };

function plainNumber(raw: string): string {
  const digits = raw.replace(/,/g, "");
  const [int, dec] = digits.split(".");
  const n = Number(int);
  if (!dec && /^(1[1-9]|20)\d\d$/.test(int) && n !== 2000) return yearWords(n);
  const head = numberWords(n);
  if (!dec) return head;
  return `${head} point ${[...dec].map((d) => ONES[Number(d)]).join(" ")}`;
}

/** Acronyms the singer gets wrong as written, and how to make it sing them. */
const ACRONYMS: Record<string, string> = {
  AI: "A.I.",
  HR: "H.R.",
  CEO: "C.E.O.",
  CFO: "C.F.O.",
  CTO: "C.T.O.",
  CV: "C.V.",
  ATS: "A.T.S.",
  PTO: "P.T.O.",
  KPI: "K.P.I.",
  KPIs: "K.P.I.s",
  ROI: "R.O.I.",
  MBA: "M.B.A.",
  PhD: "P.H.D.",
  IT: "I.T.",
  PR: "P.R.",
  TV: "T.V.",
  DM: "D.M.",
  DMs: "D.M.s",
  PDF: "P.D.F.",
  URL: "U.R.L.",
  USA: "U.S.A.",
  ASAP: "A.S.A.P.",
  FAQ: "F.A.Q.",
  LLC: "L.L.C.",
  NYC: "N.Y.C.",
  LA: "L.A.",
  IRS: "I.R.S.",
};

/** Words ACE-Step mispronounces as spelled. Keys are lower-case. */
const RESPELL: Record<string, string> = {
  "résumé": "rez-uh-may",
  "résumés": "rez-uh-mays",
  "resumé": "rez-uh-may",
  "resumés": "rez-uh-mays",
  "café": "ca-fay",
  "cliché": "clee-shay",
  "clichés": "clee-shays",
  "fiancé": "fee-on-say",
  "fiancée": "fee-on-say",
  "naïve": "nigh-eve",
  "touché": "too-shay",
  "linkedin": "Linked In",
  "youtube": "You Tube",
  "chatgpt": "Chat G.P.T.",
  "gpt": "G.P.T.",
  "gif": "jiff",
  "gifs": "jiffs",
  "vs.": "versus",
  "vs": "versus",
  "etc.": "et cetera",
  "w/": "with",
  "w/o": "without",
  "ok": "okay",
};

/** "Résumé" → "Rez-uh-may"; an all-caps "OK" isn't a capitalized word, so → "okay". */
function keepCase(original: string, spoken: string): string {
  const capitalized = /^\p{Lu}/u.test(original) && /\p{Ll}/u.test(original);
  return capitalized && /^[a-z]/.test(spoken) ? spoken[0].toUpperCase() + spoken.slice(1) : spoken;
}

/** One sung line, rewritten. */
export function singableLine(line: string): string {
  let s = line;

  // Special cases before the generic number rules.
  s = s.replace(/\b401\s*\(?k\)?(?=\W|$)/gi, "four-oh-one-k");
  s = s.replace(/\b24\/7\b/g, "twenty-four seven");
  s = s.replace(/\b9(?:\s*-\s*|\s+to\s+|-to-)5\b/gi, "nine to five");

  // Money: $50 → fifty dollars, $50k → fifty thousand dollars, $1.50 → one dollar fifty.
  s = s.replace(/\$\s?(\d[\d,]*)(?:\.(\d{1,2}))?(?:\s?([kmb]))?\b/gi, (_m, int: string, cents: string | undefined, scale: string | undefined) => {
    const n = Number(int.replace(/,/g, ""));
    const sc = scale ? ` ${SCALE[scale.toLowerCase()]}` : "";
    const dollars = `${numberWords(n)}${sc} ${n === 1 && !sc ? "dollar" : "dollars"}`;
    const c = cents ? Number(cents.padEnd(2, "0")) : 0;
    return c ? `${dollars} ${under100(c)}` : dollars;
  });

  // Times: 9:30 → nine thirty, 5:00 → five o'clock, 7:05 → seven oh five.
  s = s.replace(/\b(\d{1,2}):(\d{2})\s?(am|pm|a\.m\.|p\.m\.)?(?=\W|$)/gi, (_m, h: string, mm: string, ap: string | undefined) => {
    const min = Number(mm);
    const words = `${numberWords(Number(h))} ${min === 0 ? "o'clock" : min < 10 ? `oh ${ONES[min]}` : under100(min)}`;
    return ap ? `${words} ${ap.replace(/\./g, "").toUpperCase().split("").join(".")}.` : words;
  });
  s = s.replace(/\b(\d{1,2})\s?(am|pm)\b/gi, (_m, h: string, ap: string) => `${numberWords(Number(h))} ${ap.toUpperCase().split("").join(".")}.`);

  // Percent, ordinals, scaled numbers (50k), then plain numbers.
  s = s.replace(/\b(\d[\d,]*(?:\.\d+)?)\s?%/g, (_m, n: string) => `${plainNumber(n)} percent`);
  s = s.replace(/\b(\d+)(st|nd|rd|th)\b/gi, (_m, n: string) => ordinalWords(Number(n)));
  s = s.replace(/\b(\d[\d,]*)k\b/gi, (_m, n: string) => `${numberWords(Number(n.replace(/,/g, "")))} thousand`);
  s = s.replace(/\b(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\b/g, (m) => plainNumber(m));

  // Symbols.
  s = s.replace(/\s&\s/g, " and ").replace(/\s\+\s/g, " plus ").replace(/(^|\s)@(?=\w)/g, "$1at ").replace(/(^|\s)#(?=\w)/g, "$1hashtag ");

  // Acronyms and respellings, whole words only. A shouted all-caps line
  // ("I LOVE IT") isn't full of acronyms, so only respell there.
  const letters = s.replace(/[^\p{L}]/gu, "");
  const shouting = letters.length > 3 && letters === letters.toUpperCase();
  s = s.replace(/(?<![\p{L}\d.])(w\/o?|\p{L}[\p{L}\d']*\.?)(?![\p{L}\d])/gu, (word) => {
    const bare = word.endsWith(".") && !RESPELL[word.toLowerCase()] ? word.slice(0, -1) : word;
    const tail = word.slice(bare.length);
    const acronym = shouting ? undefined : ACRONYMS[bare];
    const re = acronym ?? (RESPELL[bare.toLowerCase()] ? keepCase(bare, RESPELL[bare.toLowerCase()]) : undefined);
    if (!re) return word;
    // "A.I." at the end of a sentence: one full stop, not two.
    return re.endsWith(".") && tail === "." ? re : re + tail;
  });
  return s;
}

const TAG = /^\s*\[[^\]]*\]\s*$/;

/**
 * The lyrics as sent to the singer. Section tags ([VERSE], [OUTRO]) and blank
 * lines are left alone; every sung line goes through singableLine.
 */
export function singableLyrics(lyrics: string, language = "en"): string {
  if (!/^en\b/i.test(language.trim() || "en")) return lyrics;
  return String(lyrics ?? "")
    .split("\n")
    .map((line) => (TAG.test(line) || !line.trim() ? line : singableLine(line)))
    .join("\n");
}
