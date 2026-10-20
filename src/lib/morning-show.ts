/**
 * The Morning Show — the morning's top posts about work, jobs and AI, and a
 * Sit-down with Joe monologue that runs through them.
 *
 *   1. Posts: the day's top Reddit posts from job-hunt and AI communities,
 *      plus the Hacker News front page. Ranked by how hot each is within its
 *      own source (so Reddit's big numbers can't drown out HN), somber
 *      headlines dropped, cached for half an hour.
 *   2. Monologue: built for search. Real Google autocomplete questions about
 *      jobs and AI go in with the posts; each segment answers one question out
 *      loud (useful tips, then the joke), and the episode gets a search-led
 *      YouTube title, description and tags. Plain lines, ready for the
 *      Sit-down with Joe video.
 */

import { chat, loadBackendConfig } from "@/lib/ai-backend";
import { DEFAULT_LANGUAGE, getLanguage } from "@/lib/languages";
import { freshnessNote, recentShows, recordShow } from "@/lib/show-history";
import { SOMBER, fetchHackerNews } from "@/lib/trending";
import {
  assembleDescription,
  normalizeSeo,
  type YouTubeSeo,
} from "@/lib/youtube-seo";

export interface MorningPost {
  title: string;
  /** "r/recruitinghell", "Hacker News" */
  source: string;
  score: number;
  comments?: number;
  url?: string;
}

export const REDDIT_SUBS = [
  "recruitinghell",
  "jobs",
  "layoffs",
  "cscareerquestions",
  "artificial",
  "ChatGPT",
];
export const MIN_POSTS = 3;
export const MAX_POSTS = 10;
const CACHE_MS = 30 * 60_000;

const g = globalThis as typeof globalThis & {
  __joeMorning?: { at: number; posts: MorningPost[] };
};

interface RedditListing {
  data?: {
    children?: {
      data?: {
        title?: string;
        score?: number;
        num_comments?: number;
        permalink?: string;
        subreddit?: string;
        over_18?: boolean;
        stickied?: boolean;
      };
    }[];
  };
}

/** Reddit's listing JSON → posts (no NSFW, no pinned mod posts). */
export function parseRedditTop(
  json: RedditListing,
  sub: string,
): MorningPost[] {
  return (json.data?.children ?? [])
    .map((c) => c.data ?? {})
    .filter((d) => d.title && !d.over_18 && !d.stickied)
    .map((d) => ({
      title: String(d.title).trim(),
      source: `r/${d.subreddit || sub}`,
      score: Number(d.score) || 0,
      comments: Number(d.num_comments) || 0,
      url: d.permalink ? `https://www.reddit.com${d.permalink}` : undefined,
    }));
}

export async function fetchRedditTop(sub: string): Promise<MorningPost[]> {
  const res = await fetch(
    `https://www.reddit.com/r/${sub}/top.json?t=day&limit=10`,
    {
      signal: AbortSignal.timeout(15_000),
      headers: { "User-Agent": "JoblessJoe/1.0 (morning show)" },
    },
  );
  if (!res.ok) throw new Error(`r/${sub} returned ${res.status}`);
  return parseRedditTop((await res.json()) as RedditListing, sub);
}

async function fetchHn(): Promise<MorningPost[]> {
  const signals = await fetchHackerNews();
  return signals.map((s) => ({
    title: s.title,
    source: "Hacker News",
    score: Number(/(\d+)/.exec(s.traffic ?? "")?.[1] ?? 0),
  }));
}

/**
 * The top `count` posts: each post's heat is its score relative to the best
 * post from the same source, so every source competes fairly.
 */
export function rankPosts(posts: MorningPost[], count: number): MorningPost[] {
  const best = new Map<string, number>();
  for (const p of posts)
    best.set(p.source, Math.max(best.get(p.source) ?? 0, p.score));
  const seen = new Set<string>();
  return posts
    .filter((p) => {
      const key = p.title.toLowerCase();
      if (seen.has(key) || SOMBER.test(p.title)) return false;
      seen.add(key);
      return true;
    })
    .map((p) => ({ p, heat: p.score / Math.max(1, best.get(p.source) ?? 1) }))
    .sort((a, b) => b.heat - a.heat || b.p.score - a.p.score)
    .slice(0, count)
    .map((x) => x.p);
}

export function clampCount(n: unknown): number {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(MAX_POSTS, Math.max(MIN_POSTS, v)) : 5;
}

/** The morning's top posts (cached half an hour; `refresh` pulls again). */
export async function getMorningPosts(
  count: number,
  { refresh = false } = {},
): Promise<{ posts: MorningPost[]; fetchedAt: number }> {
  const n = clampCount(count);
  const cached = g.__joeMorning;
  if (
    !refresh &&
    cached &&
    Date.now() - cached.at < CACHE_MS &&
    cached.posts.length
  ) {
    return { posts: rankPosts(cached.posts, n), fetchedAt: cached.at };
  }
  const settled = await Promise.allSettled([
    ...REDDIT_SUBS.map(fetchRedditTop),
    fetchHn(),
  ]);
  settled.forEach(
    (r) =>
      r.status === "rejected" &&
      console.warn("[morning-show] source failed", r.reason),
  );
  const all = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  if (!all.length) {
    if (cached?.posts.length)
      return { posts: rankPosts(cached.posts, n), fetchedAt: cached.at };
    throw new Error("Couldn't reach Reddit or Hacker News.");
  }
  g.__joeMorning = { at: Date.now(), posts: all };
  return { posts: rankPosts(all, n), fetchedAt: g.__joeMorning.at };
}

/**
 * Question stems people type into Google and YouTube about work and AI. Their
 * autocomplete suggestions are real searches, so a monologue that answers
 * them out loud (and is titled with them) can show up for those searches.
 */
export const SEARCH_SEEDS = [
  "how to get a job",
  "why is it so hard to get a job",
  "how to get past ats",
  "what to do after being laid off",
  "will ai replace",
  "how to use ai to find a job",
  "how to use chatgpt to",
  "is the job market",
  "how to answer tell me about yourself",
  "how to explain a gap in employment",
  "should i learn ai",
  "how to change careers",
];
const SEARCH_CACHE_MS = 6 * 60 * 60_000;
const gq = globalThis as typeof globalThis & {
  __joeSearchQs?: { at: number; questions: string[] };
};

/** Google autocomplete reply (client=firefox): ["seed", ["suggestion", …]]. */
export function parseSuggestions(json: unknown): string[] {
  const list = Array.isArray(json) && Array.isArray(json[1]) ? json[1] : [];
  return list
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.split(/\s+/).length >= 3 && !SOMBER.test(s));
}

async function fetchSuggestions(seed: string): Promise<string[]> {
  const res = await fetch(
    `https://suggestqueries.google.com/complete/search?client=firefox&hl=en&gl=us&q=${encodeURIComponent(seed)}`,
    { signal: AbortSignal.timeout(10_000) },
  );
  if (!res.ok) throw new Error(`autocomplete returned ${res.status}`);
  return parseSuggestions(await res.json());
}

/** Real search questions about jobs and AI (cached for 6 hours). Never throws. */
export async function getSearchQuestions(): Promise<string[]> {
  const cached = gq.__joeSearchQs;
  if (cached && Date.now() - cached.at < SEARCH_CACHE_MS)
    return cached.questions;
  const settled = await Promise.allSettled(SEARCH_SEEDS.map(fetchSuggestions));
  const questions = Array.from(
    new Set(settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []))),
  ).slice(0, 80);
  if (!questions.length) {
    console.warn("[morning-show] no search suggestions; writing without them");
    return cached?.questions ?? [];
  }
  gq.__joeSearchQs = { at: Date.now(), questions };
  return questions;
}

const MONOLOGUE_SYSTEM = `You write the morning show for "Jobless Joe", a vintage American crooner turned late-night host: a laid-off working-class guy with too much confidence who is learning to use AI and runs an AI bootcamp for people like him. He sits at his desk with a coffee mug and talks to camera.

The show has two jobs: make people laugh, and get FOUND in search. People search YouTube and Google with questions ("how to get past ats", "will ai replace accountants", "what to do after being laid off"). Every segment answers one of those questions out loud, so the video matches what they type.

You get this morning's top posts and a list of real search questions people are typing right now.

For each post, in the order given:
1. Pick the search question it answers. Use one from the list word for word when one fits. Otherwise write the question the way a person would type it into search: plain words, lowercase, starting "how to", "why", "what", "is", "will", "should" or "can".
2. Joe says the question out loud, early and plainly ("So, how do you get past the ATS?").
3. Say in one line what the post is about, so a viewer who missed it understands.
4. Joe answers the question with one or two genuinely useful, correct tips that someone could act on today. Be accurate; never invent statistics, laws or company facts.
5. Then the joke: one or two lines tying it to Joe's own job hunt or his AI bootcamp.

Around the segments:
- Cold open: one or two lines that say the main topic in searchable words ("Good morning! Today: how to get a job when AI reads your resume first.").
- A one-line transition between segments.
- Sign-off: one line, the best laugh. A light nod to the bootcamp is fine; never a sales pitch.

Rules:
- Every line must make literal sense said out loud. One idea per line. Short, conversational sentences.
- Mock systems and hype, never private people. Public figures only in passing, never insulted.
- No speaker labels, no emojis, no hashtags, no URLs.
- Performance tags: the voice acts out tags and the captions hide them. Use one or two per segment, where they help the comedy: emotions in square brackets ([excited], [deadpan], [smug], [exasperated], [conspiratorial]), sounds ([laugh], [chuckle], [sigh], [pause] before a punchline), or <whisper>…</whisper> / <emphasis>…</emphasis> around a few words. No parentheses.
- About 50 to 80 words per segment, plus the open and sign-off.

Also write the YouTube metadata for this episode:
- title: at most 70 characters. Lead with the most searched question or phrase from the show, in Title Case, then a short hook. End with "| Jobless Joe" only if it fits. No clickbait lies, no ALL CAPS.
- hook: one or two sentences, at most 150 characters, with the main search phrase in the first sentence. This is the search-result snippet.
- summary: two to four sentences on what Joe answers, using the questions' keywords naturally.
- tags: 12 to 15 lowercase search phrases, mostly the questions answered plus broad ones ("job search tips", "ai jobs").
- hashtags: exactly 3, CamelCase, no "#", the first is "JoblessJoe".

Reply with ONLY this JSON:
{"script": "the monologue, one line per sentence or beat", "questions": ["the search question for each segment, in order"], "title": "...", "hook": "...", "summary": "...", "tags": ["..."], "hashtags": ["JoblessJoe", "...", "..."]}`;

export function monologuePrompt(
  posts: MorningPost[],
  searchQuestions: string[] = [],
): string {
  const list = posts
    .map(
      (p, i) =>
        `${i + 1}. [${p.source}${p.score ? `, ${p.score} upvotes` : ""}] ${p.title}`,
    )
    .join("\n");
  const searches = searchQuestions.length
    ? `\n\nReal searches people are typing right now (Google autocomplete):\n${searchQuestions.map((q) => `- ${q}`).join("\n")}`
    : "\n\n(No live search list today: write each question the way people type it into search.)";
  return `This morning's top posts:\n${list}${searches}\n\nWrite Joe's morning show covering all ${posts.length} posts.`;
}

export interface MorningShowDraft {
  title: string;
  script: string;
  /** The search question each segment answers, in order. */
  questions: string[];
  seo: Partial<YouTubeSeo> | null;
}

export function parseMonologue(raw: string): MorningShowDraft | null {
  const m = /\{[\s\S]*\}/.exec(raw);
  if (m) {
    try {
      const j = JSON.parse(m[0]) as Record<string, unknown>;
      const script = typeof j.script === "string" ? j.script.trim() : "";
      if (script) {
        const questions = Array.isArray(j.questions)
          ? j.questions
              .filter((q): q is string => typeof q === "string" && !!q.trim())
              .map((q) => q.trim())
              .slice(0, 10)
          : [];
        const title =
          typeof j.title === "string" ? j.title.trim().slice(0, 120) : "";
        const hasSeo = !!(title || j.hook || j.summary || j.tags);
        return {
          title,
          script,
          questions,
          seo: hasSeo ? (j as Partial<YouTubeSeo>) : null,
        };
      }
    } catch {
      // fall through: a reply that isn't JSON may still be the monologue
    }
  }
  const text = raw.replace(/^```\w*\s*|```\s*$/g, "").trim();
  return text.length > 80 && !text.startsWith("{")
    ? { title: "", script: text, questions: [], seo: null }
    : null;
}

/** The YouTube upload copy for a morning show: search-led title, description, tags. */
export function morningShowYouTube(
  draft: MorningShowDraft,
  opts: { fallbackTitle: string; courseUrl?: string },
): { title: string; description: string; tags: string[] } {
  const seo = normalizeSeo(
    {
      ...(draft.seo ?? {}),
      // The questions answered are exactly what people search for.
      tags: [...draft.questions, ...((draft.seo?.tags as string[]) ?? [])],
      hashtags: (draft.seo?.hashtags as string[]) ?? [
        "JoblessJoe",
        "JobSearch",
        "AI",
      ],
    },
    draft.title || opts.fallbackTitle,
  );
  const answered = draft.questions.length
    ? `Joe answers:\n${draft.questions.map((q) => `• ${q.charAt(0).toUpperCase()}${q.slice(1).replace(/\?*$/, "?")}`).join("\n")}`
    : "";
  const summary = [seo.summary, answered].filter(Boolean).join("\n\n");
  return {
    title: seo.title,
    description: assembleDescription(
      { ...seo, summary },
      { courseUrl: opts.courseUrl, isShort: true },
    ),
    tags: seo.tags,
  };
}

/**
 * The language block for a Sit-down show in another language. The search
 * questions come in English, so the writer answers what people search in
 * that language instead. JSON keys and performance tags stay English: the
 * code and the voice read those.
 */
export function showLanguageNote(language?: string): string {
  const lang = getLanguage(language);
  if (lang.key === DEFAULT_LANGUAGE) return "";
  return `

LANGUAGE: ${lang.label.toUpperCase()}
${lang.prompt}
The script, questions, title, hook, summary, tags and hashtags are all in ${lang.label}. Turn any English search question into what ${lang.label} speakers would actually type. Posts or letters in English are retold in ${lang.label}. Keep the JSON keys and the performance tags ([pause], <whisper>…) in English.`;
}

/** Joe's search-led morning show about these posts. */
export async function writeMorningMonologue(
  posts: MorningPost[],
  language?: string,
): Promise<{
  title: string;
  script: string;
  questions: string[];
  youtube: { title: string; description: string; tags: string[] };
}> {
  if (!posts.length) throw new Error("No posts to talk about.");
  const [cfg, searchQuestions, past] = await Promise.all([
    loadBackendConfig(),
    getSearchQuestions(),
    recentShows("morning"),
  ]);
  const result = await chat(
    MONOLOGUE_SYSTEM,
    monologuePrompt(posts, searchQuestions) +
      freshnessNote(past, "posts") +
      showLanguageNote(language),
    cfg,
  );
  const out = parseMonologue(result.content);
  if (!out) throw new Error("Joe lost his notes. Try again.");
  const day = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  const youtube = morningShowYouTube(out, {
    fallbackTitle: `Joe's Morning Show, ${day}`,
    courseUrl: cfg.courseUrl,
  });
  await recordShow("morning", {
    title: youtube.title,
    items: posts.map((p) => p.title),
    script: out.script,
  });
  return {
    title: youtube.title,
    script: out.script,
    questions: out.questions,
    youtube,
  };
}
