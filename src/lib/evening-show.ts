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
import { getLanguage } from "@/lib/languages";
import { freshnessNote, itemKey, recentShows, recordShow } from "@/lib/show-history";
import {
  fetchRedditTop,
  getSearchQuestions,
  morningShowYouTube,
  parseMonologue,
  showLanguageNote,
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

/** The top advice questions from work subreddits today, skipping ones Joe already answered. */
export async function fetchRedditLetters(count: number, used: Set<string> = new Set()): Promise<ViewerLetter[]> {
  const settled = await Promise.allSettled(ADVICE_SUBS.map(fetchRedditTop));
  const posts: MorningPost[] = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  const seen = new Set<string>();
  return posts
    .filter(
      (p) =>
        isAdviceQuestion(p.title) &&
        !used.has(itemKey(p.title)) &&
        !seen.has(p.title.toLowerCase()) &&
        seen.add(p.title.toLowerCase()),
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map((p) => ({ from: "", question: p.title, source: p.source }));
}

/** The office's recurring characters. */
export const CAST_MEMBERS = [
  "Karen in HR, who answers every question with a policy PDF",
  'Chad the 26-year-old manager who says "let\'s circle back" and "we\'re a family"',
  'Brenda in accounting, who has been "about to retire" since 2009',
  "the CEO who just announced record profits and a pizza party instead of raises",
  "the AI chatbot that replaced the help desk",
  'the LinkedIn recruiter who calls everything a "rockstar opportunity"',
];

const CAST = `The office cast (running gags; use them now and then, never all at once): ${CAST_MEMBERS.join("; ")}.`;

/** Everyday work problems, rotated so the mailbag isn't always the same few. */
export const LETTER_TOPICS = [
  "return-to-office mandates",
  "a raise or promotion that never comes",
  "a coworker who steals credit",
  "meetings that should have been emails",
  "being asked to train the AI that replaces you",
  "job interviews with too many rounds",
  "a ghosting recruiter",
  "unpaid overtime dressed up as 'passion'",
  "a manager who micromanages",
  "a group chat or reply-all disaster",
  "performance reviews",
  "a boss who texts on weekends",
  "an office birthday collection",
  "a job ad asking for 10 years of a new tool",
  "badge swipes and productivity tracking",
  "a four-day week that became four ten-hour days",
  "the team-building retreat",
  "a coworker who microwaves fish",
  "salary transparency and finding out the new hire earns more",
  "quiet quitting, accused of",
];

/** n different items, shuffled. `rand` is injectable for tests. */
export function pickSome<T>(list: T[], n: number, rand: () => number = Math.random): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

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

/** The request for made-up letters: fresh topics, a couple of cast members, nothing already answered. */
export function madeUpLettersPrompt(count: number, avoid: string[], rand: () => number = Math.random): string {
  const topics = pickSome(LETTER_TOPICS, count, rand);
  const cast = pickSome(CAST_MEMBERS, 2, rand);
  const done = avoid.length
    ? `\n\nJoe already answered these. Don't repeat them or anything close:\n${avoid.map((q) => `- ${q.slice(0, 160)}`).join("\n")}`
    : "";
  return `Write ${count} different letters, one about each of these problems:\n${topics.map((t) => `- ${t}`).join("\n")}\n\nIf a cast member fits, use one of these tonight: ${cast.join("; ")}. Most letters are about the viewer's own boss or coworkers, not the cast.${done}`;
}

async function madeUpLetters(count: number, language?: string, avoid: string[] = []): Promise<ViewerLetter[]> {
  const lang = getLanguage(language);
  const inLanguage = lang.key === "en" ? "" : ` Write the letters and sign-offs in ${lang.label}. ${lang.prompt}`;
  const result = await chat(
    LETTERS_SYSTEM,
    `${madeUpLettersPrompt(count, avoid)}${inLanguage}`,
    await loadBackendConfig(),
  );
  return parseLetters(result.content).slice(0, count);
}

/** Viewer letters for tonight's show. Falls back to made-up letters if Reddit is down. */
export async function getViewerLetters(count: number, source: LetterSource, language?: string): Promise<ViewerLetter[]> {
  const n = clampLetters(count);
  const answered = (await recentShows("evening")).flatMap((s) => s.items);
  const used = new Set(answered.map(itemKey));
  const fromReddit = source === "madeup" ? 0 : source === "mix" ? Math.ceil(n / 2) : n;
  const reddit = fromReddit
    ? await fetchRedditLetters(fromReddit, used).catch((e) => {
        console.warn("[evening-show] reddit unavailable", e);
        return [] as ViewerLetter[];
      })
    : [];
  const need = n - reddit.length;
  const madeUp = need > 0 ? await madeUpLetters(need, language, answered.slice(0, 30)) : [];
  const letters = [...reddit, ...madeUp];
  if (!letters.length) throw new Error("Joe's mailbag is empty. Try again.");
  return letters;
}

const SHOW_SYSTEM = `You write "Ask Joe", the evening show of "Jobless Joe": a laid-off vintage crooner turned late-night host who runs an AI bootcamp. He sits at his desk at night with a mug of something and answers viewer letters about work. The goal is a viral clip: over the top, relatable, quotable.

${CAST}

You get tonight's letters. Some came from real online posts: use only the dilemma, rewrite it as a short letter in your own words, give it a funny anonymous sign-off, and never include usernames, real names, employers or other identifying details. Letters that already have a sign-off can be used as written.

Structure:
- Cold open: one or two lines welcoming viewers to Ask Joe, plus a fresh joke about something that happened to Joe today.
- For each letter, in order:
  1. Joe reads the letter out loud ("Dear Joe…"), with the sign-off.
  2. His reaction: one line of disbelief.
  3. His advice: escalate into absurd, theatrical advice, one or two beats. Invent a new bit for each letter that fits that letter's problem; never use the same kind of bit twice in a show.
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
export async function writeEveningShow(letters: ViewerLetter[], language?: string): Promise<{
  title: string;
  script: string;
  questions: string[];
  youtube: { title: string; description: string; tags: string[] };
}> {
  if (!letters.length) throw new Error("No letters to answer.");
  const [cfg, searchQuestions] = await Promise.all([loadBackendConfig(), getSearchQuestions()]);
  const past = await recentShows("evening");
  const result = await chat(
    SHOW_SYSTEM,
    eveningShowPrompt(letters, searchQuestions) + freshnessNote(past, "letters") + showLanguageNote(language),
    cfg,
  );
  const out = parseMonologue(result.content);
  if (!out) throw new Error("Joe lost the mailbag. Try again.");
  const day = new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  const youtube = morningShowYouTube(out, { fallbackTitle: `Ask Joe, ${day}`, courseUrl: cfg.courseUrl });
  await recordShow("evening", { title: youtube.title, items: letters.map((l) => l.question), script: out.script });
  return { title: youtube.title, script: out.script, questions: out.questions, youtube };
}
