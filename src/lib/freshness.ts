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

/**
 * Where the song happens: real places on the job hunt. No talking machines,
 * no surreal twists; the comedy comes from what really happens there.
 */
export const SETTINGS = [
  "a job fair in a hotel ballroom",
  "a video interview with his camera stuck on",
  "the unemployment office phone line, minute 47 on hold",
  "his kitchen table at 2 a.m. with forty browser tabs of job ads",
  "a family dinner where everyone asks how the job hunt is going",
  "a group chat with his old high-school friends",
  "a laundromat at 2 a.m. while he applies to jobs on his phone",
  "a garage sale of his former office furniture",
  "a wedding toast Joe agreed to give while unemployed",
  "a coffee shop where he pretends to work remotely",
  "a recruiter's phone screen",
  "a parent-teacher conference where his kid's teacher asks what he does",
  "a food truck he's helping a friend launch for cash",
  "an airport gate on the way to an interview that just got cancelled",
  "a library's free-Wi-Fi corner",
  "a networking mixer with name tags",
  "the first class of his AI bootcamp, held in a church basement",
  "a car dealership's finance office, asking for proof of income",
];

/**
 * How the story is told. Every shape is literal: things that really happen,
 * told in order. No metaphors or role-play ("a weather forecast for the job
 * market", "Joe is lawyer and defendant") — those made songs that didn't make
 * sense.
 */
export const DEVICES = [
  "a duet where Joe argues with his AI agent and loses",
  "a step-by-step 'how-to' that goes wrong at every step",
  "a breakup song sung to his old job",
  "a letter to his younger self, who does not believe him",
  "one bad day, from the alarm clock to bedtime",
  "a phone call that keeps getting worse",
  "what the job ad said versus what the job turned out to be",
  "a reply-all email disaster",
  "a job interview where Joe answers every question too honestly",
  "Joe filming an ad for his AI bootcamp and blurting out the truth",
  "a pep talk in the mirror interrupted by real rejection emails",
  "Joe takes a recruiter's buzzword literally and acts on it",
  "a bet with his brother-in-law that he'll land an interview by Friday",
  "Joe teaching his first AI bootcamp class and it goes sideways",
  "Joe using AI to apply to 500 jobs, and the replies all arrive at once",
  "a misunderstanding that grows: one small lie on his résumé snowballs",
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
- Story shape: ${angle.device}
Bend the episode theme through this angle. The theme says WHAT happens to Joe; the setting is the ONE place the whole song happens, and the story shape is HOW it unfolds. Tell it literally: real events in order, nothing turns into something else.`
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
