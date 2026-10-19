/**
 * Freshness — keep Joe from writing the same song twice.
 *
 * The model only ever saw the single previous song and a self-curated list of
 * punchlines, so premises, openers and images drifted back to the same few
 * ideas (the chatbot that can't spell his name, the VC with no customers…).
 * Two fixes, both fed into the user prompt:
 *   1. A "do not reuse" digest of the last N songs: title, opener, chorus hook
 *      and punchline.
 *   2. A random comic ANGLE (setting × device) so new songs start from a
 *      different place even when the episode theme repeats.
 */

export interface RecentSong {
  title: string;
  topic?: string;
  opener: string;
  hook: string;
  punchline: string;
}

/** Where the joke happens. */
export const SETTINGS = [
  "a DMV line that has achieved sentience",
  "a self-checkout machine that demands a cover letter",
  "a wedding toast Joe agreed to give",
  "a group chat with his old high-school friends",
  "a laundromat at 2 a.m.",
  "a parent-teacher conference",
  "a car dealership's 'finance office'",
  "a dentist's chair mid-cleaning",
  "a community-theater audition",
  "a pickleball league with corporate sponsors",
  "a hotel breakfast buffet",
  "a cooking class Joe signed up for by accident",
  "a city council open-comment session",
  "a gym where the trainer is an app",
  "an airport gate during a four-hour delay",
  "a garage sale of his former office furniture",
  "a smart-home that won't let him into his own kitchen",
  "a podcast he was invited onto by mistake",
  "a family reunion potluck",
  "a bowling alley league night",
  "a library's free-Wi-Fi corner",
  "a food truck he's helping a friend launch",
  "a customer-service hold queue, minute 47",
  "a church bake sale with a QR-code menu",
];

/** How the joke works. */
export const DEVICES = [
  "a mock-serious love song addressed to an inanimate object",
  "a duet where Joe argues with his AI agent and loses",
  "a step-by-step 'how-to' that goes wrong at every step",
  "a breakup song with his old job",
  "an awards-show acceptance speech for something tiny",
  "a courtroom drama where Joe is both lawyer and defendant",
  "a nature-documentary narration of office life",
  "a heist song: Joe plans to 'steal back' his own time",
  "a lullaby for a startup that will never wake up",
  "an infomercial that keeps getting interrupted by honesty",
  "a sports play-by-play of a job interview",
  "a letter to his younger self, who does not believe him",
  "a weather forecast for the job market",
  "a cooking recipe where the ingredients are buzzwords",
  "a travel diary of a trip to the 'cloud'",
  "a confession booth scene with a chatbot priest",
  "a talent-show where every contestant is a résumé",
  "a detective noir about a missing paycheck",
  "a karaoke night where the lyrics on screen are wrong",
  "a eulogy for a dead browser tab",
];

export interface ComicAngle {
  setting: string;
  device: string;
}

/** Pick a setting × device. `rand` is injectable for tests. */
export function pickAngle(rand: () => number = Math.random): ComicAngle {
  return {
    setting: SETTINGS[Math.floor(rand() * SETTINGS.length) % SETTINGS.length],
    device: DEVICES[Math.floor(rand() * DEVICES.length) % DEVICES.length],
  };
}

const TAG_LINE = /^\s*\[[^\]]+\]\s*$/;

/** Sung lines only, section tags dropped, grouped by section name. */
function sections(lyrics: string): { name: string; lines: string[] }[] {
  const out: { name: string; lines: string[] }[] = [];
  let current = { name: "", lines: [] as string[] };
  for (const raw of String(lyrics ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (TAG_LINE.test(line)) {
      if (current.lines.length || current.name) out.push(current);
      current = { name: line.replace(/[[\]]/g, "").trim().toUpperCase(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.length || current.name) out.push(current);
  return out.filter((s) => s.lines.length);
}

/** Digest one stored song (Episode.output JSON) into what must not repeat. */
export function digestSong(
  output: { episodeTitle?: string; lyrics?: string; closingLine?: string },
  topic?: string | null,
): RecentSong | null {
  const secs = sections(output.lyrics ?? "");
  const all = secs.flatMap((s) => s.lines);
  if (!output.episodeTitle && !all.length) return null;
  const chorus = secs.find((s) => s.name.startsWith("CHORUS"));
  return {
    title: String(output.episodeTitle ?? "").trim(),
    topic: topic?.trim() || undefined,
    opener: all[0] ?? "",
    hook: chorus?.lines[0] ?? "",
    punchline: String(output.closingLine || all[all.length - 1] || "").trim(),
  };
}

function clip(s: string, n = 140): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

/**
 * The prompt block. `fresh` = a brand-new song (generate / continue), which
 * also gets a comic angle; remixes only get the do-not-reuse list.
 */
export function freshnessBlock(recent: RecentSong[], angle: ComicAngle | null): string {
  const list = recent
    .map((s, i) => {
      const bits = [
        `"${clip(s.title, 80)}"`,
        s.topic ? `topic: ${clip(s.topic, 80)}` : "",
        s.opener ? `opened: "${clip(s.opener)}"` : "",
        s.hook ? `hook: "${clip(s.hook)}"` : "",
        s.punchline ? `punchline: "${clip(s.punchline)}"` : "",
      ].filter(Boolean);
      return `${i + 1}. ${bits.join(" · ")}`;
    })
    .join("\n");

  const angleBlock = angle
    ? `
FRESH ANGLE FOR THIS SONG (use it — it is how this one differs from the last ones)
- Setting: ${angle.setting}
- Comic device: ${angle.device}
Bend the episode theme through this angle. The theme says WHAT happens to Joe; the angle decides WHERE it happens and HOW the joke is built.`
    : "";

  return `FRESHNESS (hard rule — Joe never writes the same song twice)
==========================================================
${recent.length ? `Joe's most recent songs — do NOT reuse their premises, opening images, hooks, punchlines, comparisons, title patterns or rhyme pairs:
${list}` : "(No earlier songs yet.)"}

Before writing, silently list 3 premises you could use and throw out any that resembles a song above or a running joke in the Story Bible. Write the most surprising one left.
- New opening image. New central comparison. New chorus hook. New final punchline.
- Running jokes may return as a quick callback (one line), never as the main premise.
- Avoid the defaults this series has worn out unless the request names them: chatbots misspelling Joe's name, "five years of experience with a tool released yesterday", VCs funding companies with no customers, building an app before coffee.${angleBlock}`;
}
