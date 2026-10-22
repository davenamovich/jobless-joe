/**
 * Ask Joe, rebuilt for the people who actually watch: men and women over 40
 * (a lot of boomers) who are job hunting after a layoff, driving for
 * DoorDash, or trying to work out what AI is for. Joe is their guy: wry, warm,
 * never talking down, with one useful thing to do by the end of every bit.
 *
 * This file holds everything that is not the letters themselves:
 *   - Settings: who Joe is talking to, how spicy he is, how long he runs, the
 *     side projects viewers get first access to, what a video costs.
 *   - Segment kinds beyond the mailbag: "start using AI", "videos for a
 *     penny", "first access", "this week's news".
 *   - How today's headlines go into the prompt, so the cold open and the
 *     letters touch what is happening in the world.
 *   - The writers' room: a chat that turns "do one on DoorDash and AI
 *     scams" into a segment plan, ready to write.
 *
 * Pure prompt-building and parsing; see ask-joe-server.ts for the I/O.
 */

// Browser-safe: the settings UI imports this file, so nothing here may pull in
// server code. The headline pull and the writers' room model call live in
// ask-joe-server.ts.

// ── Settings ────────────────────────────────────────────────────────────────

export const SEGMENT_KINDS = ["letters", "ai-start", "penny-videos", "early-access", "news"] as const;
export type SegmentKind = (typeof SEGMENT_KINDS)[number];

export const SEGMENT_LABELS: Record<SegmentKind, { label: string; blurb: string }> = {
  letters: { label: "Mailbag", blurb: "Viewer letters, answered over the top with one real tip each" },
  "ai-start": { label: "Start using AI", blurb: "A first-steps walk-through for someone who has never opened ChatGPT" },
  "penny-videos": { label: "Videos for a penny", blurb: "How Joe makes these videos for about a cent, and how a viewer can too" },
  "early-access": { label: "First access", blurb: "Joe's side projects, with viewers first in line" },
  news: { label: "In the news", blurb: "This week's headlines through the eyes of a guy over 40 looking for work" },
};

export const FOCUS_AREAS = ["jobhunt", "gig", "ai-beginner", "side-hustle", "scams", "money"] as const;
export type FocusArea = (typeof FOCUS_AREAS)[number];

export const FOCUS_LABELS: Record<FocusArea, string> = {
  jobhunt: "Job hunting over 40",
  gig: "DoorDash and gig work",
  "ai-beginner": "Figuring out AI",
  "side-hustle": "Side hustles",
  scams: "Scams and AI fakes",
  money: "Making the money last",
};

export const SPICE_LEVELS = ["warm", "wry", "roast"] as const;
export type Spice = (typeof SPICE_LEVELS)[number];
/** How long the monologue runs, in seconds: the buttons on the Ask Joe panel. */
export const LENGTH_CHOICES = [30, 60, 90, 120, 180] as const;
export type ShowLength = (typeof LENGTH_CHOICES)[number];

/** A speaking pace for a late-night host, in words per second (the page voices at about this). */
export const WORDS_PER_SECOND = 2.5;

export function lengthLabel(sec: number): string {
  return sec < 120 ? `${sec}s` : `${sec / 60} min`;
}

export interface SideProject {
  name: string;
  /** One line on what it is. */
  blurb: string;
  /** Where viewers get on the list. */
  url: string;
}

export interface AskJoeSettings {
  /** What Joe's viewers are dealing with; the writers lean on these. */
  focus: FocusArea[];
  /** warm: a hug with a punchline. wry: dry and kind. roast: bigger swings (at bosses, systems and Joe, never viewers). */
  spice: Spice;
  /** Target length of the whole monologue, in seconds (one of LENGTH_CHOICES). */
  length: ShowLength;
  /** Open with, and tie letters to, what is in the news today. */
  useNews: boolean;
  /** How Joe talks about what one of his videos costs. Never invented beyond this. */
  costNote: string;
  /** Side projects viewers get first access to. Joe mentions only these. */
  sideProjects: SideProject[];
  /** The closing line that sends people to the first-access list. */
  accessCta: string;
}

export const DEFAULT_SETTINGS: AskJoeSettings = {
  focus: ["jobhunt", "gig", "ai-beginner"],
  spice: "wry",
  length: 90,
  useNews: true,
  costNote: "about a penny a video",
  sideProjects: [],
  accessCta: "",
};

function clean(v: unknown, max: number): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

/** A length from the browser: a number of seconds, or the old "short"/"standard"/"long" a saved setting may still hold. */
export function normalizeLength(v: unknown): ShowLength {
  const old: Record<string, ShowLength> = { short: 60, standard: 90, long: 120 };
  if (typeof v === "string" && v in old) return old[v];
  const n = Number(v);
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.length;
  // The nearest choice, so any number lands on a button.
  return LENGTH_CHOICES.reduce((best, c) => (Math.abs(c - n) < Math.abs(best - n) ? c : best), LENGTH_CHOICES[0]) as ShowLength;
}

/** Anything the browser sends, made safe: unknown keys dropped, lengths capped, bad values defaulted. */
export function normalizeSettings(raw: unknown): AskJoeSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const focus = Array.isArray(r.focus) ? (r.focus.filter((f): f is FocusArea => (FOCUS_AREAS as readonly string[]).includes(String(f))) as FocusArea[]) : null;
  const projects = Array.isArray(r.sideProjects) ? r.sideProjects : [];
  return {
    focus: focus && focus.length ? [...new Set(focus)] : DEFAULT_SETTINGS.focus,
    spice: (SPICE_LEVELS as readonly string[]).includes(String(r.spice)) ? (r.spice as Spice) : DEFAULT_SETTINGS.spice,
    length: normalizeLength(r.length),
    useNews: typeof r.useNews === "boolean" ? r.useNews : DEFAULT_SETTINGS.useNews,
    costNote: clean(r.costNote, 80) || DEFAULT_SETTINGS.costNote,
    sideProjects: projects
      .map((p) => {
        const o = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
        return { name: clean(o.name, 60), blurb: clean(o.blurb, 160), url: /^https?:\/\//i.test(String(o.url ?? "").trim()) ? clean(o.url, 200) : "" };
      })
      .filter((p) => p.name)
      .slice(0, 6),
    accessCta: clean(r.accessCta, 160),
  };
}

// ── The audience ────────────────────────────────────────────────────────────

const AUDIENCE = `WHO JOE IS TALKING TO
Joe's viewers are mostly men and women over 40, plenty of them boomers: laid off after twenty years, sending out applications that vanish, driving for DoorDash or Uber to cover the bills, and trying to work out what AI is and whether it is coming for them or can help them. They are not dumb and they are not tech people. They were good at their jobs.
- Joe is one of them: a laid-off crooner who is also figuring it out. He talks like a friend across a diner table, not a keynote. Plain words. No jargon without a one-line explanation. No "leverage", "synergy" or "unlock".
- Respect first. Never mock the viewer for their age, their phone skills or being out of work. The jokes land on the hiring machine (applicant tracking systems, "overqualified", ghosting, ten rounds of interviews), on bosses, on scams and on Joe himself. The viewers are the heroes.
- Be honest about AI: it is useful for specific things and it is not magic or a cure. Never promise income. Never say anyone will get rich.
- Everything ends on something a viewer could do tonight, in one or two plain steps, with a free or cheap tool.`;

const FOCUS_NOTES: Record<FocusArea, string> = {
  jobhunt: "job hunting past 40: resumes that get filtered out, 'overqualified', ghosting, long interview chains, how to use AI to rewrite a resume for a specific job",
  gig: "driving for DoorDash, Uber or Instacart: tips and bad days, gas and tax math, using AI to track expenses or write messages, side income that does not wreck your car",
  "ai-beginner": "figuring out AI from zero: what it is, the first five things to ask it, keeping your private information out of it",
  "side-hustle": "small side projects and side hustles that a regular person can start for almost nothing (no get-rich promises)",
  scams: "scams, fake job offers, voice-cloning and AI fakes aimed at older people, and how to spot them",
  money: "making a layoff payout or unemployment last: budgets, cutting subscriptions, what to do first",
};

const SPICE_NOTES: Record<Spice, string> = {
  warm: "Tone: warm. A hug with a punchline. Gentle teasing of the system, lots of encouragement.",
  wry: "Tone: wry. Dry, kind and quick; one sharp line per beat, then a heart.",
  roast: "Tone: roast. Bigger swings and more outrage, aimed only at bosses, HR policy, recruiters, scammers, the system and Joe himself. Never at the viewers, never cruel.",
};

/** The length instruction: the whole spoken monologue, in seconds and words, overriding any per-letter counts. */
export function lengthNote(sec: ShowLength): string {
  const words = Math.round(sec * WORDS_PER_SECOND);
  const lo = Math.round(words * 0.9);
  const hi = Math.round(words * 1.1);
  return `LENGTH (this overrides any word counts above): the whole monologue, cold open to sign-off, is about ${lengthLabel(sec)} spoken, ${lo} to ${hi} words in total. Share the words across the open, each letter or step, and the sign-off; keep the useful tip in every part and cut the extra bits rather than the tip.`;
}

/** What the writer needs to know about the audience and the settings, as prompt text. */
export function audienceBlock(s: AskJoeSettings): string {
  return [
    AUDIENCE,
    `Tonight's focus (lean on these, never force all of them): ${s.focus.map((f) => FOCUS_NOTES[f]).join("; ")}.`,
    SPICE_NOTES[s.spice],
    lengthNote(s.length),
  ].join("\n\n");
}

// ── Headlines ───────────────────────────────────────────────────────────────

export interface Headline {
  title: string;
  source: string;
}

export function newsBlock(headlines: Headline[]): string {
  if (!headlines.length) return "";
  return `WHAT IS HAPPENING TODAY (real headlines)
${headlines.map((h) => `- ${h.title} (${h.source})`).join("\n")}
Use one or two of these in the cold open or a letter's setup, in Joe's own words, as something his viewers are living through. Skip any that only matter to programmers or tech insiders; if none fit his viewers, skip the news. Treat a headline as a claim you can joke about, never as a fact you can add to: do not invent numbers, quotes, dates, names or companies that are not in it. Skip any that are tragic.`;
}

// ── Segments ────────────────────────────────────────────────────────────────

export interface SegmentRequest {
  kind: SegmentKind;
  /** What the segment is about, in the producer's words ("DoorDash tipping and AI scams"). */
  topic?: string;
  /** Extra direction from the writers' room chat. */
  notes?: string;
}

const AI_START_STEPS = `SEGMENT: START USING AI
Joe walks a total beginner through starting with AI, tonight. Cover, in this order: (1) what it is in one plain sentence, (2) free tools to start with (name a couple of mainstream ones; say plans and prices change so check the site), (3) the first thing to type, with the exact words on screen and spoken, (4) three useful first tasks for this audience (rewrite a resume for one job posting; draft a polite follow-up email; explain a confusing letter or bill in plain English), (5) what NOT to paste in (Social Security number, bank info, anything private) and how to double-check what it says, (6) one small thing to do before bed. Joe is learning too; he can admit what confused him. About 4 to 6 steps; each step is two or three short lines.`;

function pennyVideos(s: AskJoeSettings): string {
  return `SEGMENT: VIDEOS FOR A PENNY
Joe pulls back the curtain: this very video is made by a regular person with AI for ${s.costNote}. Walk through how, in plain steps a viewer could copy: (1) write the script (or have AI draft it from a real news story), (2) have an AI voice read it, (3) a simple animated character does the acting, (4) captions and a post. Say the cost in Joe's own voice as "${s.costNote}" (never mention a producer or where the wording came from), and that his time is the real cost. Do NOT name prices for specific tools or make other cost, earnings or view-count claims. Be honest: it takes practice, it is not a get-rich scheme, and plenty of videos get ten views. End with the first tiny step a viewer can take tonight.`;
}

function earlyAccess(s: AskJoeSettings): string {
  const projects = s.sideProjects.length
    ? s.sideProjects.map((p) => `- ${p.name}: ${p.blurb || "no description yet"}${p.url ? ` (${p.url})` : ""}`).join("\n")
    : "(none listed)";
  return `SEGMENT: FIRST ACCESS
Joe lets the viewers in on his side projects, and tells them they get first access before anyone else. Mention ONLY these projects, and say only what is written here (no comparisons, no claims about quality, privacy, speed or results):
${projects}
${s.sideProjects.length ? "" : "There are none listed, so Joe teases that he is tinkering on a few things in the garage and does not name or describe any.\n"}Do not invent launch dates, prices, features or numbers of people waiting. Make "first access" feel like being let in the back door by a friend, not a pitch. ${s.accessCta ? `Close with this line, in Joe's own words: "${s.accessCta}".` : "Close by telling viewers where to follow along; no URLs read aloud."}`;
}

const NEWS_TAKE = `SEGMENT: IN THE NEWS
Joe takes the day's headlines through the eyes of a guy over 40 who is looking for work. For each of two to four headlines: what it means for the person at the kitchen table in one plain sentence, Joe's reaction, and one thing the viewer can do about it. If the headlines are thin, say so and make the segment about what the viewer can control.`;

/** The segment-specific instructions appended to the show prompt. */
export function segmentInstructions(req: SegmentRequest, s: AskJoeSettings): string {
  const body =
    req.kind === "ai-start" ? AI_START_STEPS : req.kind === "penny-videos" ? pennyVideos(s) : req.kind === "early-access" ? earlyAccess(s) : req.kind === "news" ? NEWS_TAKE : "";
  const topic = req.topic ? `\nTopic from the producer: ${req.topic}` : "";
  const notes = req.notes ? `\nDirection from the producer: ${req.notes}` : "";
  return body ? `${body}${topic}${notes}\n\nThis segment replaces the letters: write it as one flowing bit with Joe's cold open and a sign-off, no "Dear Joe" letters unless the topic asks for them. The questions field should list the searches this segment answers.` : "";
}

/**
 * The retention format for Ask Joe: the shape of the whole show, in plain
 * spoken lines (the beat names are never written into the script).
 */
export function retentionBlock(s: AskJoeSettings, req: SegmentRequest = { kind: "letters" }): string {
  const unit = req.kind === "letters" ? "letter" : "step or point";
  return `THE RETENTION FORMAT (the shape of the whole show; these rules override the cold-open and transition rules above)
The script stays plain spoken lines: never write these beat names in it, the voice would read them out.
1. HOOK: the first line is spoken within two seconds, twelve words at most: the funniest or most painfully true thing in tonight's first ${unit}, said mid-thought. No "Welcome to Ask Joe" and no greeting first.
2. LOCK-IN ZONE: two or three short lines right after the hook. Name tonight's topic in searchable words, say why it hits the viewer, and promise one specific payoff that arrives at the end ("Stay for the last one: it's the one that got me."). A promise you keep, not a vague "stick around".
3. BODY BLOCKS: each ${unit} is one block with something real in it: the reaction, the bit, and one useful tip someone can use today.
4. REHOOKS: every change from one ${unit} to the next gets its own rehook line (N blocks, N - 1 rehooks). It escalates ("That one was annoying. This one is expensive."), teases a specific detail of what's next, or flips what the viewer expects. Never a plain handover: "Next up", "Moving on", "Now for…", "Our next letter" are not rehooks. The rehook before the last block points back at the promised payoff.
5. CLOSING: pay off the promise from the lock-in with the best laugh of the show.
6. CTA: one natural line that follows from tonight's content. For job-hunt or AI content, point to Jobless Joe's Bootcamp, which teaches ordinary people to start using AI; otherwise ask for a comment (a specific, easy-to-answer question) or a follow. Never invent an offer, download, discount, guide or price. The CTA comes after the payoff and is one line.
Before replying, check: the first line stops the scroll, the lock-in is two or three lines and ends on the promise, every ${unit} after the first has a real rehook, the ending pays off, the CTA fits, and the whole show fits about ${lengthLabel(s.length)}.`;
}

/** Everything added to the evening-show writer for these settings, headlines and segment. */
export function askJoeAddendum(s: AskJoeSettings, headlines: Headline[], req: SegmentRequest = { kind: "letters" }): { system: string; user: string } {
  const tease =
    req.kind === "letters" && s.sideProjects.length
      ? `FIRST ACCESS TEASE\nIn the sign-off only, one short line telling viewers they get first access to Joe's side projects (${s.sideProjects.map((p) => p.name).join(", ")}). Say nothing else about them: no description, no comparison, no claim about what they do or how well.${s.accessCta ? ` Use this wording: "${s.accessCta}".` : ""}`
      : "";
  const system = [audienceBlock(s), s.useNews ? newsBlock(headlines) : "", tease, retentionBlock(s, req)].filter(Boolean).join("\n\n");
  const user = req.kind === "letters" ? (req.notes ? `Direction from the producer: ${req.notes}` : "") : segmentInstructions(req, s);
  return { system, user };
}

/** Letter topics for this audience, mixed into the generic work ones. */
export const AUDIENCE_LETTER_TOPICS = [
  "being told you are 'overqualified' after 25 years in the job",
  "an online application system that wants your whole work history typed in again after you uploaded a resume",
  "a job ad for an entry-level role asking for 5 years of AI experience",
  "a video interview with a 24-year-old who keeps saying 'digital native'",
  "a DoorDash order that is 9 miles away for $2.50",
  "a customer who tracks the driver's every move and still complains",
  "a first-timer asking an AI chatbot for a resume and getting someone else's name back",
  "a grandson showing you ChatGPT and you not wanting to look lost",
  "a text from a 'recruiter' who wants a gift-card deposit",
  "a phone call that sounds exactly like a grandchild asking for money",
  "an AI that wrote a cover letter saying you speak fluent French",
  "a layoff paid out in a box of pens and a group email",
  "an unemployment portal that logs you out every four minutes",
  "learning a new software at 55 while the training video is at 2x speed",
  "starting a side hustle with $0 and a laptop from 2014",
];

// ── The writers' room chat ──────────────────────────────────────────────────

export interface ChatTurn {
  role: "user" | "joe";
  content: string;
}

export function normalizeTurns(raw: unknown): ChatTurn[] {
  return (Array.isArray(raw) ? raw : [])
    .map((t) => {
      const o = (t && typeof t === "object" ? t : {}) as Record<string, unknown>;
      return { role: o.role === "joe" ? ("joe" as const) : ("user" as const), content: clean(o.content, 1200) };
    })
    .filter((t) => t.content)
    .slice(-20);
}

export interface SegmentPlan {
  kind: SegmentKind;
  topic: string;
  notes: string;
  /** For the mailbag: letters the writers drafted from the chat. */
  letters: { from: string; question: string }[];
}

export const PLANNER_SYSTEM = `You are the head writer in the writers' room for "Ask Joe", a late-night segment hosted by Joe, a laid-off crooner who helps people over 40 with job hunting, gig work and getting started with AI. The producer chats with you to plan a segment. Be brief, practical and a little funny. Ask at most one question at a time, only when something important is missing.

Segment kinds you can plan:
- letters: a mailbag of viewer letters (2 to 6). Draft the letters yourself from what the producer says.
- ai-start: a beginner walk-through of starting with AI.
- penny-videos: how Joe makes videos for about a cent and how viewers can too.
- early-access: Joe's side projects, viewers first.
- news: today's headlines through the eyes of a viewer over 40 looking for work.

Reply with ONLY this JSON:
{"reply": "what you say to the producer, 1 to 3 sentences", "plan": null or {"kind": "letters|ai-start|penny-videos|early-access|news", "topic": "short topic", "notes": "direction for the writer: angle, must-include points, things to avoid", "letters": [{"from": "funny sign-off", "question": "the letter, 1 to 3 sentences"}]}}
Set "plan" as soon as you have enough to write a segment, and update it as the producer changes their mind. Letters only for kind "letters". Nothing cruel, sexual, medical, or about real people or companies; no claims about earnings.`;

export function parsePlanReply(raw: string): { reply: string; plan: SegmentPlan | null } {
  const m = /\{[\s\S]*\}/.exec(raw);
  if (!m) return { reply: clean(raw, 600) || "Tell me more about the segment.", plan: null };
  try {
    const j = JSON.parse(m[0]) as { reply?: unknown; plan?: Record<string, unknown> | null };
    const reply = clean(j.reply, 600) || "Got it.";
    const p = j.plan;
    if (!p || typeof p !== "object") return { reply, plan: null };
    const kind = (SEGMENT_KINDS as readonly string[]).includes(String(p.kind)) ? (p.kind as SegmentKind) : null;
    if (!kind) return { reply, plan: null };
    const letters =
      kind === "letters" && Array.isArray(p.letters)
        ? p.letters
            .map((l) => {
              const o = (l && typeof l === "object" ? l : {}) as Record<string, unknown>;
              return { from: clean(o.from, 80), question: clean(o.question, 500) };
            })
            .filter((l) => l.question)
            .slice(0, 6)
        : [];
    return { reply, plan: { kind, topic: clean(p.topic, 140), notes: clean(p.notes, 500), letters } };
  } catch {
    return { reply: clean(raw, 600) || "Tell me more about the segment.", plan: null };
  }
}

export function plannerPrompt(turns: ChatTurn[], s: AskJoeSettings, headlines: Headline[]): string {
  const convo = turns.map((t) => `${t.role === "user" ? "Producer" : "Head writer"}: ${t.content}`).join("\n");
  const news = headlines.length ? `\n\nToday's headlines you can suggest angles from:\n${headlines.map((h) => `- ${h.title}`).join("\n")}` : "";
  const projects = s.sideProjects.length ? `\n\nJoe's side projects (for first access): ${s.sideProjects.map((p) => p.name).join(", ")}` : "";
  return `Viewer focus right now: ${s.focus.map((f) => FOCUS_LABELS[f]).join(", ")}.${news}${projects}\n\nConversation so far:\n${convo}\n\nReply as the head writer.`;
}
