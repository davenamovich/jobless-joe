/**
 * The Morning Show — the morning's top posts about work, jobs and AI, and a
 * Sit-down with Joe monologue that runs through them.
 *
 *   1. Posts: the day's top Reddit posts from job-hunt and AI communities,
 *      plus the Hacker News front page. Ranked by how hot each is within its
 *      own source (so Reddit's big numbers can't drown out HN), somber
 *      headlines dropped, cached for half an hour.
 *   2. Monologue: the model writes Joe's desk monologue — a cold open, one
 *      bit per story (what happened, plainly, then Joe's joke) and a sign-off.
 *      Plain lines, ready for the Sit-down with Joe video.
 */

import { chat, loadBackendConfig } from "@/lib/ai-backend";
import { SOMBER, fetchHackerNews } from "@/lib/trending";

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

async function fetchRedditTop(sub: string): Promise<MorningPost[]> {
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

const MONOLOGUE_SYSTEM = `You write the morning monologue for "Jobless Joe", a vintage American crooner turned late-night host: a laid-off working-class guy with too much confidence who is learning to use AI and runs an AI bootcamp for people like him. He sits at his desk with a coffee mug and talks to camera.

You get this morning's top posts. Write the monologue that runs through them.

Structure:
- Cold open: one or two lines greeting the morning crowd with a joke about Joe's own job hunt.
- One short bit per post, in the order given. First say plainly what the post is about, so a viewer who missed it understands. Then Joe's take: one or two jokes that tie it to job hunting, work, money or AI.
- A one-line transition into the next story.
- Sign-off: one line, the best laugh. A light nod to the bootcamp is fine; never a sales pitch.

Rules:
- Every line must make literal sense said out loud. One idea per line. Short, conversational sentences.
- Mock systems and hype, never private people. Public figures only in passing, never insulted.
- No stage directions, no speaker labels, no emojis, no hashtags.
- About 40 to 60 words per story, plus the open and sign-off.

Reply with ONLY this JSON: {"title": "a short funny episode title", "script": "the monologue, one line per sentence or beat"}`;

export function monologuePrompt(posts: MorningPost[]): string {
  const list = posts
    .map(
      (p, i) =>
        `${i + 1}. [${p.source}${p.score ? `, ${p.score} upvotes` : ""}] ${p.title}`,
    )
    .join("\n");
  return `This morning's top posts:\n${list}\n\nWrite Joe's morning monologue covering all ${posts.length}.`;
}

export function parseMonologue(
  raw: string,
): { title: string; script: string } | null {
  const m = /\{[\s\S]*\}/.exec(raw);
  if (m) {
    try {
      const j = JSON.parse(m[0]) as { title?: unknown; script?: unknown };
      const script = typeof j.script === "string" ? j.script.trim() : "";
      if (script)
        return {
          title:
            typeof j.title === "string" ? j.title.trim().slice(0, 120) : "",
          script,
        };
    } catch {
      // fall through: a reply that isn't JSON may still be the monologue
    }
  }
  const text = raw.replace(/^```\w*\s*|```\s*$/g, "").trim();
  return text.length > 80 && !text.startsWith("{")
    ? { title: "", script: text }
    : null;
}

/** Joe's monologue about these posts. */
export async function writeMorningMonologue(
  posts: MorningPost[],
): Promise<{ title: string; script: string }> {
  if (!posts.length) throw new Error("No posts to talk about.");
  const result = await chat(
    MONOLOGUE_SYSTEM,
    monologuePrompt(posts),
    await loadBackendConfig(),
  );
  const out = parseMonologue(result.content);
  if (!out) throw new Error("Joe lost his notes. Try again.");
  const day = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  return {
    title: out.title || `Joe's Morning Show, ${day}`,
    script: out.script,
  };
}
