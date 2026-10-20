/**
 * Writers' room for Joe's songs: two small passes around the main songwriter
 * call so the lyric tells one clear story.
 *
 *   1. PLAN — before any lyric exists, a short call decides the story: the
 *      one-sentence retell, the concrete scene, what happens in each section,
 *      the chorus line and the final punchline. The songwriter then writes
 *      from that plan instead of juggling the story, the rhymes and twenty
 *      other JSON fields at once.
 *   2. SENSE EDIT — after the song is written, an editor reads it line by
 *      line against the plan and rewrites only the lines that don't make
 *      literal sense or don't follow from the line before.
 *
 * Both passes are optional: if either fails, the song is made exactly as
 * before.
 */

import { getLanguage } from "./languages";
import type { SongOutput } from "./joe-prompts";

export interface SongPlan {
  /** The whole song in one sentence a stranger could repeat. */
  retell: string;
  /** The concrete scene: where Joe is and what is happening. */
  situation: string;
  /** Concrete, real-world details the jokes are built on. */
  specifics: string[];
  /** What happens in each section, in order. */
  beats: { section: string; beat: string }[];
  /** The chorus's key line, which carries the title. */
  chorusLine: string;
  /** The turn: what Joe does with AI or how the situation flips. */
  twist: string;
  /** The last line sung, written out. */
  punchline: string;
}

export const PLAN_SYSTEM = `You are the head writer in Jobless Joe's writers' room. Joe is a vintage American crooner, a laid-off working-class guy with too much confidence, who is learning to use AI and starting an AI bootcamp for people like him. His songs are short comedy songs about the job market, AI taking jobs, crypto regret, the VC circus, money pain, and Joe figuring out the future.

You do NOT write lyrics. You plan ONE song so that a listener hearing it once understands exactly what happened and laughs.

A good plan:
- Is ONE situation with ONE premise, told in order. Cause, then effect. No dream logic, no random images.
- Uses specific, real details people recognise (a job ad, a rejection email, a recruiter's message, a rent notice), not vague feelings.
- Escalates: each section makes the same situation more absurd. It never jumps to an unrelated scene.
- Has a twist Joe earns: he uses AI in a concrete, believable way (writes, builds, automates something specific), or the situation flips on the people who doubted him.
- Ends on a punchline that pays off the setup. The punchline must make sense to someone who only heard this song.

Reply with a single JSON object and nothing else:
{
  "retell": "one plain sentence: Joe ..., so he ..., and ...",
  "situation": "the concrete scene in one or two sentences",
  "specifics": ["3 concrete funny details the lyrics will use"],
  "beats": [{ "section": "[VERSE 1]", "beat": "what literally happens here, in plain words" }],
  "chorusLine": "the chorus's key line, which states the premise and contains the song title",
  "twist": "what Joe does or discovers, concretely",
  "punchline": "the final sung line, written out"
}
"beats" has one entry per section of the skeleton the request gives for its length, in order.`;

/** The planning request: the full episode brief, then the planning task. */
export function buildPlanPrompt(userPrompt: string): string {
  return `${userPrompt}

YOUR TASK RIGHT NOW
===================
Ignore the JSON song format above. Do not write lyrics yet. Plan this one song and reply with the plan JSON only.`;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Parse the planner's reply; null when it isn't a usable plan. */
export function parseSongPlan(raw: string): SongPlan | null {
  let s = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  s = s.slice(start, end + 1);
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(s);
  } catch {
    return null;
  }
  const beats = Array.isArray(j.beats)
    ? (j.beats as unknown[])
        .map((b) => {
          const o = (b ?? {}) as Record<string, unknown>;
          return { section: str(o.section), beat: str(o.beat) };
        })
        .filter((b) => b.beat)
    : [];
  const plan: SongPlan = {
    retell: str(j.retell),
    situation: str(j.situation),
    specifics: Array.isArray(j.specifics) ? (j.specifics as unknown[]).map(str).filter(Boolean).slice(0, 5) : [],
    beats,
    chorusLine: str(j.chorusLine),
    twist: str(j.twist),
    punchline: str(j.punchline),
  };
  // Without the story and its ending there's nothing to follow.
  if (!plan.retell || !plan.punchline || !beats.length) return null;
  return plan;
}

/** The plan as a block the songwriter (and editor) can follow. */
export function planBlock(plan: SongPlan): string {
  return `SONG PLAN (from the writers' room: write THIS song)
====================================================
The whole song in one sentence: ${plan.retell}
The scene: ${plan.situation || "(see the beats)"}
Details to use: ${plan.specifics.length ? plan.specifics.join("; ") : "(choose concrete ones that fit the scene)"}
What happens, section by section:
${plan.beats.map((b) => `- ${b.section || "Section"}: ${b.beat}`).join("\n")}
Chorus key line: ${plan.chorusLine || "(state the premise plainly, with the title)"}
The twist: ${plan.twist || "(see the beats)"}
The last line sung: ${plan.punchline}

Follow the plan: every section tells its beat, in order, in plain sense first and clever wording second. You may polish the wording of the chorus line and the punchline, but keep what they say. Use the plan's details instead of inventing a different story.`;
}

/** The songwriter request with the plan added just before its reminders. */
export function withPlan(userPrompt: string, plan: SongPlan | null): string {
  if (!plan) return userPrompt;
  const block = planBlock(plan);
  const at = userPrompt.lastIndexOf("\nREMEMBER\n");
  return at === -1 ? `${userPrompt}\n\n${block}` : `${userPrompt.slice(0, at)}\n${block}\n${userPrompt.slice(at)}`;
}

export const SENSE_EDIT_SYSTEM = `You are the script editor for Jobless Joe's comedy songs. You fix lyrics that don't make sense. You are strict about meaning and gentle about style.`;

export function buildSenseEditPrompt(args: { lyrics: string; plan: SongPlan | null; premise?: string; language?: string }): string {
  const lang = getLanguage(args.language);
  const story = args.plan ? planBlock(args.plan) : `THE SONG'S STORY: ${args.premise || "(read it from the lyrics)"}`;
  return `${story}

LYRICS TO CHECK
===============
${args.lyrics}

YOUR JOB
========
Read the lyrics line by line, as a listener hearing them once. Rewrite ONLY the lines that:
- don't make literal sense said out loud, or are ungrammatical;
- don't follow from the line before (a jump to a new scene, a new character from nowhere, a pronoun with no clear owner);
- contradict the story or another line;
- are there only because they rhyme, or are a random image or mixed metaphor;
- leave the listener unsure what happened.

Rules:
- Keep everything that already works, word for word. If every line makes sense, return the lyrics unchanged.
- Keep the same bracketed section tags, in the same order, each on its own line.
- Never make the song longer. Replace a broken line with one line of about the same length.
- Keep Joe's voice, the rhyme feel and ${lang.label}.
- The last line sung stays the punchline and stays last.

REPLY WITH THE FULL LYRICS AND NOTHING ELSE: no notes, no list of changes, no JSON, no markdown fences.`;
}

/**
 * After an edit, the viral hook and social clip must still quote the lyric
 * word for word: re-point them at the edited chorus when they no longer match.
 */
export function syncQuotes(out: SongOutput): SongOutput {
  const lyrics = out.lyrics;
  const sectionText = (tag: string): string => {
    const re = new RegExp(`^\\s*${tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "im");
    const m = re.exec(lyrics);
    if (!m) return "";
    const rest = lyrics.slice(m.index + m[0].length);
    const next = rest.search(/^\s*\[[^\]]+\]\s*$/m);
    return (next === -1 ? rest : rest.slice(0, next)).trim();
  };
  const chorus = sectionText("[CHORUS]");
  const next = { ...out };
  if (next.viralHook && !lyrics.includes(next.viralHook)) {
    next.viralHook = chorus.split("\n")[0]?.trim() || next.viralHook;
  }
  if (next.socialClip && next.socialClip.lyrics && !lyrics.includes(next.socialClip.lyrics)) {
    const text = sectionText(next.socialClip.section) || chorus;
    if (text) next.socialClip = { section: sectionText(next.socialClip.section) ? next.socialClip.section : "[CHORUS]", lyrics: text };
  }
  return next;
}
