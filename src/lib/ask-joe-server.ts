/**
 * Ask Joe's server side: today's headlines (the Morning Show's job, layoff and
 * AI sources) and one turn of the writers' room chat. The prompts and parsing
 * are in ask-joe.ts, which the browser also imports.
 */

import { chat, loadBackendConfig } from "@/lib/ai-backend";
import { getMorningPosts } from "@/lib/morning-show";
import { SOMBER } from "@/lib/trending";
import {
  parsePlanReply,
  PLANNER_SYSTEM,
  plannerPrompt,
  type AskJoeSettings,
  type ChatTurn,
  type Headline,
  type SegmentPlan,
} from "@/lib/ask-joe";

/** Headlines worth a joke: not tragedies, no nonsense. */
export function usableHeadlines(posts: { title: string; source: string }[], n = 6): Headline[] {
  const seen = new Set<string>();
  const out: Headline[] = [];
  // Joe's viewers are job hunters and gig drivers, not programmers: tech-insider sources go to the back.
  const insider = (s: string) => /hacker news|cscareerquestions/i.test(s);
  const ordered = [...posts.filter((p) => !insider(p.source)), ...posts.filter((p) => insider(p.source))];
  for (const p of ordered) {
    const title = p.title.replace(/\s+/g, " ").trim();
    if (!title || SOMBER.test(title) || seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    out.push({ title: title.slice(0, 160), source: p.source });
    if (out.length >= n) break;
  }
  return out;
}

/** Today's job, layoff and AI headlines (the Morning Show's sources). Empty when they can't be reached. */
export async function todaysHeadlines(n = 6): Promise<Headline[]> {
  try {
    const { posts } = await getMorningPosts(10);
    return usableHeadlines(posts, n);
  } catch (e) {
    console.warn("[ask-joe] headlines unavailable:", e instanceof Error ? e.message : e);
    return [];
  }
}

/** One turn of the writers' room: Joe's head writer replies and keeps the segment plan up to date. */
export async function planSegment(turns: ChatTurn[], settings: AskJoeSettings): Promise<{ reply: string; plan: SegmentPlan | null }> {
  if (turns.at(-1)?.role !== "user") throw new Error("Say something first.");
  const [cfg, headlines] = await Promise.all([loadBackendConfig(), settings.useNews ? todaysHeadlines(5) : Promise.resolve([] as Headline[])]);
  const result = await chat(PLANNER_SYSTEM, plannerPrompt(turns, settings, headlines), cfg);
  return parsePlanReply(result.content);
}
