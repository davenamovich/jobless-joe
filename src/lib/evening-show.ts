/**
 * The Evening Show — "Ask Joe": Joe reads viewer letters about work and
 * answers them, an over-the-top advice segment built to go viral.
 *
 *   1. Letters: real advice questions from work subreddits (only the
 *      dilemma is used, rewritten so nobody is identifiable), or made-up
 *      ones starring the office's recurring cast (Karen in HR, Chad the
 *      manager…), or a mix.
 *   2. Show: Joe reads each letter dramatically, then gives absurd advice
 *      that ends on something genuinely useful. Same search-led YouTube copy
 *      and expression tags as the Morning Show.
 */

import { chat, loadBackendConfig } from "@/lib/ai-backend";
import { SOMBER } from "@/lib/trending";
import {
  fetchRedditTop,
  getSearchQuestions,
  morningShowYouTube,
  parseMonologue,
  type MorningPost,
} from "@/lib/morning-show";

export type LetterSource = "reddit" | "madeup" | "mix";

export interface ViewerLetter {
  /** Sign-off, e.g. "Spreadsheet Prisoner in Ohio" */
  from: string;
  /** The dilemma, one or two sentences */
  question: string;
  /** "r/AskHR" for a real post, "made up" for a generated one */
  source: string;
}

export const ADVICE_SUBS = ["AskHR", "careerguidance", "WorkAdvice", "jobs", "managers", "antiwork"];
export const MIN_LETTERS = 2;
export const MAX_LETTERS = 6;

export function clampLetters(n: unknown): number {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(MAX_LETTERS, Math.max(MIN_LETTERS, v)) : 4;
}

/** An advice post: a question or a dilemma, not news, memes or rants. */
export function isAdviceQuestion(title: string): boolean {
  if (SOMBER.test(title) || /\b(nsfw|suicid|harass|assault|abuse|pregnan|disabilit|cancer|died|funeral)\w*/i.test(title))
    return false;
  return (
    /\?\s*$/.test(title) ||
    /^(how|should|what|is|am|can|do|does|would|why|my|aita|wibta|help|advice)\b/i.test(title.trim())
  );
}

/** The top advice questions from work subreddits today. */
export async function fetchRedditLetters(count: number): Promise<ViewerLetter[]> {
  const settled = await Promise.allSettled(ADVICE_SUBS.map(fetchRedditTop));
  const posts: MorningPost[] = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  const seen = new Set<string>();
  return posts
    .filter((p) => isAdviceQuestion(p.title) && !seen.has(p.title.toLowerCase()) && seen.add(p.title.toLowerCase()))
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map((p) => ({ from: "", question: p.title, source: p.source }));
}

const CAST = `The office cast (reuse them, they're running gags): Karen in HR, who answers every question with a policy PDF; Chad the 26-year-old manager who says "let's circle back" and "we're a family"; Brenda in accounting, who has been "about to retire" since 2009; the CEO who just announced record profits and a pizza party instead of raises; the AI chatbot that replaced the help desk; the recruiter on LinkedIn who calls everything a "rockstar opportunity".`;

const LETTERS_SYSTEM = `You write viewer letters for "Ask Joe", the evening advice segment of Jobless Joe's late-night show. Joe is a laid-off vintage crooner who now runs an AI bootcamp.

Each letter is a work dilemma, written by the viewer: over the top, absurd and instantly relatable, the kind of thing people share with "this is literally my job". Specific details beat vague ones. Stay with work, bosses, HR, coworkers, job hunting, pay, return-to-office and AI at work. Nothing cruel, sexual, medical, or about real people or companies.

${CAST}

Reply with ONLY this JSON: {"letters": [{"from": "a funny sign-off like 'Reply-All Victim in Tampa'", "question": "the letter, 1 to 3 sentences, in the viewer's voice"}]}`;

export function parseLetters(raw: string): ViewerLetter[] {
  const m = /\{[\s\S]*\}/.exec(raw);
  if (!m) return [];
  try {
    const j = JSON.parse(m[0]) as { letters?: { from?: unknown; question?: unknown }[] };
    return (Array.isArray(j.letters) ? j.letters : [])
      .map((l) => ({
        from: String(l?.from ?? "").trim().slice(0, 80),
        question: String(l?.question ?? "").trim().slice(0, 500),
        source: "made up",
      }))
      .filter((l) => l.question);
  } catch {
    return [];
  }
}

async function madeUpLetters(count: number): Promise<ViewerLetter[]> {
  const result = await chat(
    LETTERS_SYSTEM,
    `Write ${count} different letters. Mix the cast and the problems; at least one involves Karen in HR.`,
    await loadBackendConfig(),
  );
  return parseLetters(result.content).slice(0, count);
}

/** Viewer letters for tonight's show. Falls back to made-up letters if Reddit is down. */
export async function getViewerLetters(count: number, source: LetterSource): Promise<ViewerLetter[]> {
  const n = clampLetters(count);
  const fromReddit = source === "madeup" ? 0 : source === "mix" ? Math.ceil(n / 2) : n;
  const reddit = fromReddit
    ? await fetchRedditLetters(fromReddit).catch((e) => {
        console.warn("[evening-show] reddit unavailable", e);
        return [] as ViewerLetter[];
      })
    : [];
  const need = n - reddit.length;
  const madeUp = need > 0 ? await madeUpLetters(need) : [];
  const letters = [...reddit, ...madeUp];
  if (!letters.length) throw new Error("Joe's mailbag is empty. Try again.");
  return letters;
}

const SHOW_SYSTEM = `You write "Ask Joe", the evening show of "Jobless Joe": a laid-off vintage crooner turned late-night host who runs an AI bootcamp. He sits at his desk at night with a mug of something and answers viewer letters about work. The goal is a viral clip: over the top, relatable, quotable.

${CAST}

You get tonight's letters. Some came from real online posts: use only the dilemma, rewrite it as a short letter in your own words, give it a funny anonymous sign-off, and never include usernames, real names, employers or other identifying details. Letters that already have a sign-off can be used as written.

Structure:
- Cold open: one or two lines. "Good evening, it's Ask Joe" energy, plus a joke about Joe's own day.
- For each letter, in order:
  1. Joe reads the letter out loud ("Dear Joe…"), with the sign-off.
  2. His reaction: one line of disbelief.
  3. His advice: escalate into absurd, theatrical advice (a musical number in the break room, a counter-PowerPoint, replying-all with a sonnet), one or two beats.
  4. Then land it with ONE genuinely useful tip a viewer could actually use (get it in writing, document dates, ask for the raise with numbers, use AI to draft the email). Keep it correct; never give legal advice beyond "check your local rules or talk to a lawyer".
  5. A one-line transition to the next letter.
- Sign-off: one line, the best laugh. A light nod to the AI bootcamp is fine; never a sales pitch.

Rules:
- Every line must make literal sense said out loud. One idea per line. Short, punchy sentences.
- Mock bosses, HR policies, corporate speak and hype. The viewers are always the heroes.
- No speaker labels, no emojis, no hashtags, no URLs.
- Performance tags: the voice acts out tags and the captions hide them. One or two per letter where they help the comedy: [dramatic], [deadpan], [outraged], [whispering], [sigh], [laugh], [pause] before a punchline, or <whisper>…</whisper> / <emphasis>…</emphasis> around a few words. No parentheses.
- About 70 to 110 words per letter, plus the open and sign-off.

Also write the YouTube metadata. People search problems ("what to do when hr ignores you", "how to deal with a micromanager", "how to ask for a raise"), so:
- questions: for each letter, the search question it answers, the way people type it (lowercase). Use one from the live search list when one fits.
- title: at most 70 characters, Title Case. Lead with the funniest hook or the most searched problem, e.g. "My HR Manager Karen Sent Me a Policy PDF | Ask Joe". No clickbait lies, no ALL CAPS.
- hook: one or two sentences, at most 150 characters, with the main search phrase in the first sentence.
- summary: two to four sentences on what Joe answers.
- tags: 12 to 15 lowercase search phrases.
- hashtags: exactly 3, CamelCase, no "#", the first is "JoblessJoe".

Reply with ONLY this JSON:
{"script": "the show, one line per sentence or beat", "questions": ["..."], "title": "...", "hook": "...", "summary": "...", "tags": ["..."], "hashtags": ["JoblessJoe", "...", "..."]}`;

export function eveningShowPrompt(letters: ViewerLetter[], searchQuestions: string[] = []): string {
  const list = letters
    .map((l, i) => {
      const origin = l.source === "made up" ? "made up" : `real post from ${l.source}: rewrite it`;
      return `${i + 1}. (${origin})${l.from ? ` From "${l.from}":` : ""} ${l.question}`;
    })
    .join("\n");
  const searches = searchQuestions.length
    ? `\n\nReal searches people are typing right now (Google autocomplete):\n${searchQuestions.map((q) => `- ${q}`).join("\n")}`
    : "";
  return `Tonight's letters:\n${list}${searches}\n\nWrite tonight's Ask Joe covering all ${letters.length} letters.`;
}

/** Joe's evening show answering these letters. */
export async function writeEveningShow(letters: ViewerLetter[]): Promise<{
  title: string;
  script: string;
  questions: string[];
  youtube: { title: string; description: string; tags: string[] };
}> {
  if (!letters.length) throw new Error("No letters to answer.");
  const [cfg, searchQuestions] = await Promise.all([loadBackendConfig(), getSearchQuestions()]);
  const result = await chat(SHOW_SYSTEM, eveningShowPrompt(letters, searchQuestions), cfg);
  const out = parseMonologue(result.content);
  if (!out) throw new Error("Joe lost the mailbag. Try again.");
  const day = new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  const youtube = morningShowYouTube(out, { fallbackTitle: `Ask Joe, ${day}`, courseUrl: cfg.courseUrl });
  return { title: youtube.title, script: out.script, questions: out.questions, youtube };
}
