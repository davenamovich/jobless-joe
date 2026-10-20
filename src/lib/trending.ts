/**
 * Trending ideas — what people are talking about right now, turned into
 * Jobless Joe song topics.
 *
 *   1. Raw signals: Google Trends daily RSS (US) + the Hacker News front page.
 *   2. The songwriter model turns them into song ideas with a Joe angle (work,
 *      jobs, AI, money, modern absurdity), and drops anything tragic, partisan
 *      or about private people — a crooner comedy can't sing over a disaster.
 *   3. Cached for an hour; ?refresh forces a new pull.
 *
 * If the model is down, a keyword filter over the raw headlines still gives
 * usable ideas, so the chips never come back empty for a flaky backend.
 */

import { chat, loadBackendConfig } from "@/lib/ai-backend";

export interface TrendSignal {
  title: string;
  /** e.g. "500+" searches, or HN points */
  traffic?: string;
  context?: string;
  source: "google" | "hn";
}

export interface TrendIdea {
  /** Short label for the chip, e.g. "GTA VI release" */
  label: string;
  /** The custom topic sent to /api/generate */
  topic: string;
  source: "google" | "hn" | "mixed";
}

const CACHE_MS = 60 * 60_000;
const MAX_IDEAS = 8;

// Headlines a comedy song must never touch.
export const SOMBER =
  /\b(dies|died|dead|death|killed|kill|shooting|shot|murder|crash|victims?|funeral|obituary|war|attack|bomb|terror|hostage|abuse|assault|suicide|cancer|overdose|earthquake|hurricane|flood|wildfire|tornado|missing child|kidnap|massacre|genocide)\b/i;

const g = globalThis as typeof globalThis & {
  __joeTrends?: { at: number; ideas: TrendIdea[]; signals: TrendSignal[] };
};

function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

/** Parse Google Trends' RSS: each <item> → title, traffic, first news headline. */
export function parseGoogleTrendsRss(xml: string): TrendSignal[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  return items.map((item) => {
    const pick = (tag: string) => {
      const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(item);
      return m ? decodeXml(m[1]) : "";
    };
    return {
      title: pick("title"),
      traffic: pick("ht:approx_traffic") || undefined,
      context: pick("ht:news_item_title") || undefined,
      source: "google" as const,
    };
  }).filter((s) => s.title);
}

async function fetchGoogleTrends(geo = "US"): Promise<TrendSignal[]> {
  const res = await fetch(`https://trends.google.com/trending/rss?geo=${encodeURIComponent(geo)}`, {
    signal: AbortSignal.timeout(15_000),
    headers: { "User-Agent": "Mozilla/5.0 JoblessJoe/1.0" },
  });
  if (!res.ok) throw new Error(`Google Trends returned ${res.status}`);
  return parseGoogleTrendsRss(await res.text()).slice(0, 20);
}

export async function fetchHackerNews(): Promise<TrendSignal[]> {
  const res = await fetch("https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=20", {
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Hacker News returned ${res.status}`);
  const json = (await res.json()) as { hits?: { title?: string; points?: number }[] };
  return (json.hits ?? [])
    .filter((h) => h.title)
    .map((h) => ({ title: String(h.title), traffic: h.points ? `${h.points} pts` : undefined, source: "hn" as const }));
}

/** Drop somber headlines, dupes and empties. */
export function cleanSignals(signals: TrendSignal[]): TrendSignal[] {
  const seen = new Set<string>();
  return signals.filter((s) => {
    const key = s.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return !SOMBER.test(`${s.title} ${s.context ?? ""}`);
  });
}

/** No model? Turn the cleanest headlines straight into topics. */
export function fallbackIdeas(signals: TrendSignal[]): TrendIdea[] {
  return signals.slice(0, MAX_IDEAS).map((s) => ({
    label: s.title.length > 48 ? `${s.title.slice(0, 47)}…` : s.title,
    topic: `Everyone is talking about "${s.title}"${s.context ? ` (${s.context})` : ""}. Joe has opinions — and somehow it's about his job hunt and AI.`,
    source: s.source,
  }));
}

/** Pull the JSON array out of a model reply, tolerating fences and prose. */
export function parseIdeas(raw: string): TrendIdea[] {
  const m = /\[[\s\S]*\]/.exec(raw);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[0]) as Array<Partial<TrendIdea>>;
    return arr
      .filter((i) => i && typeof i.label === "string" && typeof i.topic === "string")
      .map((i): TrendIdea => ({
        label: String(i.label).trim().slice(0, 60),
        topic: String(i.topic).trim().slice(0, 400),
        source: i.source === "google" || i.source === "hn" ? i.source : "mixed",
      }))
      .filter((i) => i.label && i.topic && !SOMBER.test(i.topic))
      .slice(0, MAX_IDEAS);
  } catch {
    return [];
  }
}

const IDEA_SYSTEM = `You pick song topics for Jobless Joe, a comedy crooner: an unemployed everyman who discovered AI and now sings about jobs, hiring, money, tech hype and modern absurdity.

You get today's trending searches and tech headlines. Turn the best ones into song ideas.

Rules:
- Each idea must tie the trend to Joe's world: job hunting, work, side hustles, AI tools, bosses, recruiters, money, being underestimated.
- Satirize systems and hype, never a real private person. Public figures only as a passing mention, never insulted.
- SKIP anything involving death, injury, crime victims, disasters, war, illness or partisan politics. If in doubt, skip it.
- Every idea must be different from the others — different trend, different angle.
- The series has worn these out; never build an idea on them: "five years of experience with a tool released yesterday", a chatbot misspelling Joe's name, building an app before coffee, a VC funding a company with no customers.
- "label": 2–6 words naming the trend for a button. "topic": one or two sentences — the premise Joe sings about, specific and funny.

Reply with ONLY a JSON array, no prose:
[{"label": string, "topic": string, "source": "google" | "hn"}]`;

async function ideasFromModel(signals: TrendSignal[]): Promise<TrendIdea[]> {
  const list = signals
    .map((s) => `- [${s.source}] ${s.title}${s.traffic ? ` (${s.traffic})` : ""}${s.context ? ` — ${s.context}` : ""}`)
    .join("\n");
  const result = await chat(
    IDEA_SYSTEM,
    `Today's signals:\n${list}\n\nGive me up to ${MAX_IDEAS} song ideas.`,
    await loadBackendConfig(),
  );
  return parseIdeas(result.content);
}

/** Trending song ideas, cached for an hour. */
export async function getTrendingIdeas({ refresh = false } = {}): Promise<{ ideas: TrendIdea[]; fetchedAt: number }> {
  const cached = g.__joeTrends;
  if (!refresh && cached && Date.now() - cached.at < CACHE_MS && cached.ideas.length) {
    return { ideas: cached.ideas, fetchedAt: cached.at };
  }

  const settled = await Promise.allSettled([fetchGoogleTrends(), fetchHackerNews()]);
  const raw = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  settled.forEach((r) => r.status === "rejected" && console.warn("[trending] source failed", r.reason));
  // Interleave so one source can't crowd out the other.
  const google = cleanSignals(raw.filter((s) => s.source === "google"));
  const hn = cleanSignals(raw.filter((s) => s.source === "hn"));
  const signals: TrendSignal[] = [];
  for (let i = 0; i < Math.max(google.length, hn.length); i++) {
    if (google[i]) signals.push(google[i]);
    if (hn[i]) signals.push(hn[i]);
  }
  if (!signals.length) {
    if (cached?.ideas.length) return { ideas: cached.ideas, fetchedAt: cached.at };
    throw new Error("Couldn't reach Google Trends or Hacker News.");
  }

  let ideas: TrendIdea[] = [];
  try {
    ideas = await ideasFromModel(signals.slice(0, 30));
  } catch (e) {
    console.warn("[trending] idea model failed, using raw headlines", e);
  }
  if (!ideas.length) ideas = fallbackIdeas(signals);

  g.__joeTrends = { at: Date.now(), ideas, signals };
  return { ideas, fetchedAt: g.__joeTrends.at };
}
