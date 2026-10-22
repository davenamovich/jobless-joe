/**
 * Morning Show settings: how viral Joe goes. The show used to open with "Good
 * morning!" and a polite lead-in, which is how a TV host starts and how a
 * viewer scrolls past. These settings turn the writer into someone who makes
 * Shorts for a living: a hook in the first two seconds, a new beat every few
 * seconds, an ending that makes people replay or comment, and an internet-
 * native voice with the vintage-crooner patter dialled right back.
 *
 * Browser-safe (the settings panel imports it): prompt text and parsing only.
 * The search-led SEO copy and the facts rules in morning-show.ts still apply.
 */

import {
  audienceBlock,
  DEFAULT_SETTINGS as ASK_JOE_DEFAULTS,
  FOCUS_AREAS,
  normalizeLength,
  SPICE_LEVELS,
  type FocusArea,
  type ShowLength,
  type Spice,
} from "@/lib/ask-joe";

export const VIRAL_STYLES = ["classic", "punchy", "chaotic"] as const;
export type ViralStyle = (typeof VIRAL_STYLES)[number];

export const STYLE_LABELS: Record<ViralStyle, { label: string; blurb: string }> = {
  classic: { label: "Classic", blurb: "The old Joe: friendly late-night host, a little slower" },
  punchy: { label: "Punchy", blurb: "Fast, direct, internet-native. A beat every few seconds" },
  chaotic: { label: "Chaotic", blurb: "Maximum energy: hard cuts, bits, interruptions, big swings" },
};

export const HOOKS = ["auto", "hot-take", "pov", "stat", "confession", "question"] as const;
export type HookType = (typeof HOOKS)[number];

export const HOOK_LABELS: Record<HookType, string> = {
  auto: "Best fit for the story",
  "hot-take": "Hot take",
  pov: "POV",
  stat: "Shocking number",
  confession: "Confession",
  question: "Question",
};

export const ENDINGS = ["loop", "comment", "plain"] as const;
export type EndingType = (typeof ENDINGS)[number];

export const ENDING_LABELS: Record<EndingType, string> = {
  loop: "Loop (last line runs into the first)",
  comment: "Comment bait (a question to answer)",
  plain: "Plain sign-off",
};

export interface MorningSettings {
  style: ViralStyle;
  hook: HookType;
  ending: EndingType;
  /** Target length of the whole show, in seconds. */
  length: ShowLength;
  spice: Spice;
  /** What Joe's viewers are dealing with (same list as Ask Joe). */
  focus: FocusArea[];
}

export const DEFAULT_MORNING_SETTINGS: MorningSettings = {
  style: "punchy",
  hook: "auto",
  ending: "loop",
  length: 60,
  spice: "wry",
  focus: ASK_JOE_DEFAULTS.focus,
};

const has = <T extends string>(list: readonly T[], v: unknown): v is T => (list as readonly string[]).includes(String(v));

/** Anything the browser sends, made safe: unknown values dropped, defaults filled in. */
export function normalizeMorningSettings(raw: unknown): MorningSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const focus = Array.isArray(r.focus) ? [...new Set(r.focus.filter((f): f is FocusArea => has(FOCUS_AREAS, f)))] : [];
  return {
    style: has(VIRAL_STYLES, r.style) ? r.style : DEFAULT_MORNING_SETTINGS.style,
    hook: has(HOOKS, r.hook) ? r.hook : DEFAULT_MORNING_SETTINGS.hook,
    ending: has(ENDINGS, r.ending) ? r.ending : DEFAULT_MORNING_SETTINGS.ending,
    length: r.length === undefined ? DEFAULT_MORNING_SETTINGS.length : normalizeLength(r.length),
    spice: has(SPICE_LEVELS, r.spice) ? r.spice : DEFAULT_MORNING_SETTINGS.spice,
    focus: focus.length ? focus : DEFAULT_MORNING_SETTINGS.focus,
  };
}

const STYLE_NOTES: Record<ViralStyle, string> = {
  classic: "Voice: friendly late-night host. Keep the warm patter, but still open on the hook (below) instead of a greeting.",
  punchy: "Voice: someone who makes Shorts for a living. Plain, direct, a little deadpan; sentences under ten words; a new beat or a turn every five to eight seconds. Talk to one person, not an audience. No \"ladies and gentlemen\", no \"folks\", no radio-announcer patter.",
  chaotic: "Voice: maximum energy. Hard cuts between ideas, a bit that interrupts itself (\"wait, wait, no\"), a big swing every few seconds, one absurd image per segment. Still every line must make sense out loud, and the tips stay real.",
};

const HOOK_NOTES: Record<HookType, string> = {
  auto: "Pick whichever hook makes the most surprising true thing in the story land in two seconds.",
  "hot-take": "Open on a hot take about the story, stated flat and confident, that a viewer wants to argue with.",
  pov: 'Open with "POV:" and a one-line scene the viewer is living ("POV: the robot rejected your résumé before a human saw it").',
  stat: "Open on the most striking real number or fact in the story (only one that is in the posts; never invent a statistic).",
  confession: "Open on a confession from Joe's own job hunt that connects to the story (\"I got rejected by a chatbot at 2 a.m.\").",
  question: "Open on a sharp question the viewer is already asking themselves.",
};

/** Where the aligned CTA sits for each ending, so it never breaks the loop or buries the comment question. */
const CTA_PLACEMENT: Record<EndingType, string> = {
  loop: "The CTA is the line just before the loop line, so the loop still runs back into the hook.",
  comment: "The comment question is the CTA. A one-line bootcamp nod may come just before it, only if it fits.",
  plain: "Fold the CTA into the sign-off, after the payoff.",
};

const ENDING_NOTES: Record<EndingType, string> = {
  loop: "Ending: a loop. The last line is a half-sentence or a setup that runs straight back into the first line when the video replays, so it plays again without the viewer noticing. No sign-off, no goodbye.",
  comment: "Ending: one question for the comments, specific and easy to answer in a word or two, about the viewer's own life (not \"what do you think?\"). No \"like and subscribe\".",
  plain: "Ending: one line, the best laugh. A light nod to the bootcamp is fine; never a sales pitch.",
};

/** Everything the writer needs for these settings: the audience, the length, and the viral rules that override the traditional opening. */
export function morningAddendum(s: MorningSettings): string {
  const audience = audienceBlock({ ...ASK_JOE_DEFAULTS, focus: s.focus, spice: s.spice, length: s.length });
  return `${audience}

MAKE IT VIRAL (these rules override the cold-open, greeting and word-count rules above)
- The first line is the hook, spoken within two seconds, twelve words at most. No "Good morning", no "Welcome", no throat-clearing, no introducing the show. Start mid-thought on the most surprising thing, then fold the searchable topic into the second line.
- ${HOOK_NOTES[s.hook]}
- Open a loop early (promise a payoff: "the third one cost me a job") and pay it off before the end.
- Keep the useful answers and the search question for each segment, but say each one in the fewest words that still sound like a person.
- One line per segment a viewer would screenshot or repeat: specific, concrete, quotable.
- Change the beat every five to eight seconds (a turn, a number, a question, a shift in energy). No two long sentences in a row.
- ${STYLE_NOTES[s.style]}
- Joe is a laid-off crooner, but that is flavor, not the voice: a passing joke at most, never a vintage patter or a song-and-dance bit.
- ${ENDING_NOTES[s.ending]}
- Stay accurate. Virality never means invented facts, fake numbers or clickbait the story does not pay off; the title still follows the search-led rules.

THE RETENTION FORMAT (the shape of the whole show)
The script stays plain spoken lines: never write these beat names in it, the voice would read them out.
1. HOOK: the first line (above).
2. LOCK-IN ZONE: always two or three lines, never one, between the hook and the first question. Line one names the searchable topic. Line two says why it hits the viewer personally. The last lock-in line opens the loop: it promises one specific payoff that arrives at the end ("Stay for the last one: it's the one that got me."). The open loop is a promise you keep, not a vague "stick around".
3. BODY BLOCKS: each segment is one block (question, what the post is, the useful tip, the joke). Every block delivers something real: a tip someone can use today, or a laugh.
4. REHOOKS: EVERY change of segment gets its own rehook line, so a show with N segments has N - 1 rehooks. No segment starts straight after the previous joke.
   - A rehook gives a new reason to keep watching: it escalates ("That one was annoying. This one is expensive."), teases a specific detail of what's next, or flips what the viewer expects.
   - Each rehook is different. Never a plain handover: "Next up", "Moving on", "Now for…", "Our next story", "Speaking of…" are not rehooks.
   - The rehook before the last segment points back at the open loop ("And here's the one I promised you.").
5. Segments beyond two are optional body blocks: only as many as the length holds, each with its rehook.
6. CLOSING: pay off the open loop, with the payoff you promised in the lock-in, as the best laugh of the show.
7. CTA: one natural line that follows from what the show covered. When the show is about the job hunt or AI, point to Jobless Joe's Bootcamp, which teaches ordinary people to start using AI; otherwise ask for a follow or a comment. Never invent an offer, download, discount, guide or price. ${CTA_PLACEMENT[s.ending]}
Before replying, check: the first line stops the scroll, the lock-in is two or three lines and ends on the open loop, there is a rehook before every segment after the first and none of them is a plain handover, the ending pays off, the CTA fits the content, and the whole show fits about ${s.length}s.`;
}
