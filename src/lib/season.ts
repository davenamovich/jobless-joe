/**
 * Jobless Joe, Season 1: the story arc every series song walks.
 *
 * Four acts, twelve episodes: no jobs → Joe meets AI → Joe gets paid → Joe
 * launches his AI bootcamp. Each episode is one relatable situation from the
 * real job market, so a stranger gets the joke from the title alone.
 *
 * "Continue the story" plays the next episode in order, using the Story
 * Bible's episodeCount as the position; past the finale Joe keeps running the
 * bootcamp (Season 2 beats are improvised from the bible).
 */

export interface SeasonAct {
  n: number;
  title: string;
  /** What this act is about, for the songwriter. */
  theme: string;
}

export interface SeasonEpisode {
  key: string;
  label: string;
  /** 1-based act number. */
  act: number;
  /** The one situation the song is about. */
  arc: string;
  /** The specific, painfully true detail the hook is built on. */
  relatable: string;
}

export const ACTS: SeasonAct[] = [
  { n: 1, title: "No Jobs", theme: "The job market is absurd and Joe is stuck in it." },
  { n: 2, title: "Joe Meets AI", theme: "Joe discovers AI and finds out he can make things." },
  { n: 3, title: "Joe Gets Paid", theme: "What Joe made with AI starts earning; the people who ignored him notice." },
  { n: 4, title: "The Bootcamp", theme: "Joe launches Jobless Joe's AI Bootcamp to teach other job seekers." },
];

export const SEASON: SeasonEpisode[] = [
  {
    key: "unemployed-intro",
    label: "The Unemployed Introduction",
    act: 1,
    arc: "Joe gets laid off by an email signed \"The Team\" and introduces himself to the job market.",
    relatable: "Laid off by email, then applying for one opening against 400 other people.",
  },
  {
    key: "rejection-blues",
    label: "The Rejection Letter Blues",
    act: 1,
    arc: "Joe gets rejected by an applicant-tracking bot at 3 a.m., 0.4 seconds after applying. The rejections keep coming, each weirder than the last.",
    relatable: "Instant automated rejections that nobody human ever read.",
  },
  {
    key: "entry-level",
    label: "Entry Level, Ten Years' Experience",
    act: 1,
    arc: "Joe finds the perfect entry-level job. It wants ten years' experience in a tool released last spring and an unpaid \"trial project\".",
    relatable: "Entry-level ads that demand senior experience and free work.",
  },
  {
    key: "ghosted",
    label: "Ghosted After Round Seven",
    act: 1,
    arc: "Seven interviews, a personality test and a take-home assignment later, the company goes silent. Joe waits by the phone.",
    relatable: "Endless interview rounds that end in silence.",
  },
  {
    key: "joe-discovers-ai",
    label: "Joe Discovers AI",
    act: 2,
    arc: "Joe's nephew shows him an AI chatbot. It answers instantly, says please, and is nicer than every recruiter Joe has met.",
    relatable: "The first time you try AI and it's more helpful than the people who were supposed to help.",
  },
  {
    key: "joe-vs-resume",
    label: "Joe vs. The Résumé",
    act: 2,
    arc: "Joe has AI rewrite his résumé, then realizes the recruiter's AI is reading it. Two robots discuss Joe while Joe waits outside.",
    relatable: "Writing a résumé for a bot that screens résumés.",
  },
  {
    key: "joe-builds-first-app",
    label: "Joe Builds His First App",
    act: 2,
    arc: "Joe describes what he wants to an AI and builds his first app, a tracker for recruiters who ghosted him. It is rough. He is impossibly proud.",
    relatable: "Making something real without a degree, a bootcamp loan, or permission.",
  },
  {
    key: "joe-first-customer",
    label: "Joe's First Customer",
    act: 3,
    arc: "A neighbor pays Joe real money for something he made with AI. It's his first paycheck in months, and he doesn't know where to put it.",
    relatable: "The first money you earn on your own terms.",
  },
  {
    key: "joe-ai-expert-overnight",
    label: "Joe Becomes an Expert Overnight",
    act: 3,
    arc: "LinkedIn calls Joe a thought leader. The recruiters who ghosted him now slide into his messages asking if he's open to opportunities.",
    relatable: "The people who ignored you suddenly wanting a meeting.",
  },
  {
    key: "bootcamp-revelation",
    label: "The Bootcamp Revelation",
    act: 4,
    arc: "Joe's laid-off friends keep asking how he did it. He realizes he can teach anyone what he learned by accident.",
    relatable: "Friends stuck in the same job hunt you just escaped.",
  },
  {
    key: "bootcamp-launch",
    label: "Opening Night at the Bootcamp",
    act: 4,
    arc: "Joe launches Jobless Joe's AI Bootcamp. The first class is a room full of fellow job seekers, one projector and a lot of hope. Things go gloriously wrong and then right.",
    relatable: "Learning AI alongside people in the same boat.",
  },
  {
    key: "graduation-night",
    label: "Graduation Night",
    act: 4,
    arc: "Joe's first students show off what they built with AI. Joe sings them out like a lounge act closing the night, and hints there's a bigger stage coming.",
    relatable: "Watching people who were written off build their own way in.",
  },
];

/**
 * Episodes from before Season 1 was laid out. They stay valid so old songs
 * can still be remixed, but no picker offers them.
 */
export const RETIRED_EPISODES: { key: string; label: string; arc: string }[] = [
  { key: "joe-discovers-vibe-coding", label: "Joe Discovers Vibe Coding", arc: "Joe learns he can describe what he wants and watch it appear." },
  { key: "joe-roasts-silicon-valley", label: "Joe Roasts Silicon Valley", arc: "Joe has opinions about founders who burn billions building nothing." },
  { key: "joe-vs-college-degree", label: "Joe vs. The College Degree", arc: "Joe debates whether the four-year degree is still the gatekeeper." },
  { key: "joe-explains-ai-family", label: "Joe Explains AI to His Family", arc: "Joe's aunt thinks AI is a cabal. Joe tries to bring her along gently." },
  { key: "joe-starts-business", label: "Joe Starts His Own Business", arc: "Joe hangs a shingle. It is digital. He has no shingle budget." },
  { key: "joe-vs-vcs", label: "Joe Challenges the Venture Capitalists", arc: "Joe meets a VC who asks for his TAM. Joe defines TAM differently." },
  { key: "joe-builds-empire", label: "Joe Builds His Digital Empire", arc: "Joe's empire is small, but it is his, and it has a coffee budget." },
  { key: "next-chapter", label: "The Next Chapter", arc: "Joe hints at where the story is going next. Curiosity rises." },
];

/**
 * A whole story arc: the built-in Season 1, or one written with Ralph in the
 * writers' room (ralph.ts) and saved as the active arc.
 */
export interface StoryArc {
  title: string;
  premise: string;
  tone: string;
  /** Story rules that hold in every episode. */
  rules: string[];
  characters: { name: string; role: string; catchphrase?: string }[];
  acts: SeasonAct[];
  episodes: SeasonEpisode[];
  /** Where the season lands, and the one next step it points viewers to. */
  reveal: string;
  cta: string;
}

export const DEFAULT_ARC: StoryArc = {
  title: "Jobless Joe, Season 1",
  premise:
    "A laid-off crooner can't get past the bots of a broken job market, discovers AI, gets paid on his own terms and opens an AI bootcamp for everyone else who got written off.",
  tone: "Relatable first, then absurd. Deadpan lounge-crooner swagger about painfully real job-hunt moments.",
  rules: [
    "Every episode is about the job market, Joe adopting AI, or his AI bootcamp.",
    "One situation per episode that a job seeker recognizes instantly.",
    "Joe is no genius: he's an ordinary guy who learned the tools.",
  ],
  characters: [{ name: "Jobless Joe", role: "Laid-off stick-figure crooner" }],
  acts: ACTS,
  episodes: SEASON,
  reveal: "Anyone written off by the job market can use AI to build their own way in.",
  cta: "Join Jobless Joe's AI Bootcamp.",
};

/** Where an episode sits in an arc, or null for a retired/custom one. */
export function seasonPosition(key: string, arc: StoryArc = DEFAULT_ARC): number | null {
  const i = arc.episodes.findIndex((e) => e.key === key);
  return i < 0 ? null : i;
}

/**
 * The episode "Continue the story" plays next: the arc in order by how many
 * series episodes exist, or null once the season is over.
 */
export function nextSeasonEpisode(
  episodeCount: number,
  arc: StoryArc = DEFAULT_ARC
): SeasonEpisode | null {
  return arc.episodes[Math.max(0, episodeCount)] ?? null;
}

/**
 * The songwriter's view of the arc: every act, with the episodes already
 * sung, the one being written now and the ones still to come.
 */
export function seasonBrief(current: SeasonEpisode | null, arc: StoryArc = DEFAULT_ARC): string {
  const at = current ? arc.episodes.indexOf(current) : arc.episodes.length;
  const lines: string[] = [];
  for (const act of arc.acts) {
    lines.push(`ACT ${act.n}: ${act.title} — ${act.theme}`);
    arc.episodes.forEach((ep, i) => {
      if (ep.act !== act.n) return;
      const mark = i < at ? "done" : i === at ? "NOW" : "later";
      lines.push(`  ${i + 1}. [${mark}] ${ep.label}`);
    });
  }
  const custom = arc !== DEFAULT_ARC;
  const world = custom
    ? `Premise: ${arc.premise}
Tone: ${arc.tone}
Cast (use by name when it fits, never force): ${arc.characters
        .map((c) => `${c.name} (${c.role}${c.catchphrase ? `, "${c.catchphrase}"` : ""})`)
        .join("; ")}
Story rules (always): ${arc.rules.join(" · ")}
Where it lands: ${arc.reveal}
`
    : "";
  const now = current
    ? `
THIS EPISODE: ${arc.episodes.indexOf(current) + 1}. ${current.label} (Act ${current.act})
- The situation: ${current.arc}
- The relatable truth the hook is built on: ${current.relatable}
- Stay inside this episode. Don't jump ahead to later episodes or acts; a teaser for the next one goes in nextEpisodeTeaser only.`
    : `
THE SEASON IS OVER: Joe now runs Jobless Joe's AI Bootcamp. Write the next episode about running it: a new student, a new job-market absurdity they bring in, and how AI helps them through it.`;
  return `STORY ARC: ${arc.title.toUpperCase()}
${"=".repeat(Math.min(60, arc.title.length + 11))}
${world}${lines.join("\n")}
${now}`;
}

/**
 * The arc episode a request is writing: the next one in order for
 * "continue", the picked one otherwise, null for a custom topic or an
 * episode outside the arc (and for "continue" once the season is over).
 */
export function seasonEpisodeFor(
  episodeKey: string,
  action: string,
  episodeCount: number,
  arc: StoryArc = DEFAULT_ARC
): SeasonEpisode | null {
  if (episodeKey === "custom") return null;
  if (action === "continue") return nextSeasonEpisode(episodeCount, arc);
  return arc.episodes.find((e) => e.key === episodeKey) ?? null;
}
