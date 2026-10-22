/**
 * The short-form retention format: HOOK → LOCK-IN → BODY → REHOOK → BODY →
 * REHOOK → (BODY 3) → (CLOSING) → CTA.
 *
 * It is the default shape for everything the songwriter produces: the song
 * maps its sections onto it, and every episode carries a beat-by-beat video
 * script built on it. Both prompts and the UI read the beats from here so the
 * section names, colours and order can't drift apart.
 */

import { durationSeconds } from "./lyric-budget";

export type RetentionKey =
  | "hook"
  | "lockIn"
  | "body1"
  | "rehook1"
  | "body2"
  | "rehook2"
  | "body3"
  | "closing"
  | "cta";

export const RETENTION_BEATS: {
  key: RetentionKey;
  label: string;
  /** The colour from the reference format. */
  color: "red" | "yellow" | "purple" | "cyan" | "white" | "green";
  optional?: boolean;
  job: string;
}[] = [
  { key: "hook", label: "Hook", color: "red", job: "Stop the scroll with one surprising, funny, emotional, controversial or curiosity-driven line." },
  { key: "lockIn", label: "Lock-in Zone", color: "yellow", job: "2–3 short lines that back up the hook and set the problem, tension or relatable situation." },
  { key: "body1", label: "Body Block 1", color: "purple", job: "The first key story beat, joke, insight or surprising detail." },
  { key: "rehook1", label: "Rehook 1", color: "red", job: "A twist, question, escalation or punchline that opens a new curiosity gap." },
  { key: "body2", label: "Body Block 2", color: "purple", job: "Continue the story, deepen the joke or deliver the payoff." },
  { key: "rehook2", label: "Rehook 2", color: "red", job: "Another reason to stay: a reveal, an unexpected observation, or the setup for the ending." },
  { key: "body3", label: "Body Block 3", color: "cyan", optional: true, job: "One more beat, only when the length needs it." },
  { key: "closing", label: "Closing", color: "white", optional: true, job: "A memorable last line, emotional payoff or final joke." },
  { key: "cta", label: "CTA + Lead Magnet", color: "green", job: "A natural call to action that follows from this content." },
];

export function isRetentionKey(key: unknown): key is RetentionKey {
  return RETENTION_BEATS.some((b) => b.key === key);
}

/** One beat of a short-form video script. */
export interface VideoScriptBeat {
  section: RetentionKey;
  /** e.g. "0–3s". */
  timing: string;
  /** Spoken voiceover or sung line(s) heard during this beat. */
  voiceover: string;
  /** On-screen caption text. */
  caption: string;
  /** The shot or visual. */
  visual: string;
  /** Music or sound-effect cue; may be empty. */
  sound: string;
}

/**
 * The beats a video of this length has room for. Short videos keep the hook,
 * lock-in, both rehooks, the payoff and the CTA; the optional beats come in
 * only when there's time.
 */
export function beatsFor(durationKey: string): RetentionKey[] {
  const seconds = durationSeconds(durationKey);
  return RETENTION_BEATS.filter((b) => {
    if (b.key === "body3") return seconds >= 75;
    if (b.key === "closing") return seconds >= 45;
    return true;
  }).map((b) => b.key);
}

/** The video-script skeleton for one request, for the user prompt. */
export function scriptSkeletonBrief(durationKey: string): string {
  const seconds = durationSeconds(durationKey);
  const keys = beatsFor(durationKey);
  return `VIDEO SCRIPT SKELETON (${seconds}s): ${keys
    .map((k) => `"${k}"`)
    .join(" → ")}. One videoScript entry per beat, in this order, timings adding up to ${seconds}s.`;
}

/** The format, as the songwriter's system prompt sees it. */
export const RETENTION_PROMPT = `=========================
THE RETENTION FORMAT (DEFAULT FOR EVERY SONG AND VIDEO)
=========================

Every song and every video script is built on this short-form retention structure. It's the shape, not a cage: adapt it to the genre, the length and the joke.

1. HOOK — the first line stops the scroll: surprising, funny, emotional, controversial or curiosity-driven. No warm-up.
2. LOCK-IN ZONE — 2–3 short lines that reinforce the hook and give a reason to stay: the problem, the tension, the relatable situation.
3. BODY BLOCK 1 — the first real story beat, joke or surprising detail.
4. REHOOK 1 — a twist, question, escalation or punchline that opens a new curiosity gap.
5. BODY BLOCK 2 — continue the story, deepen the joke, deliver the payoff.
6. REHOOK 2 — another reason to keep watching: a reveal, an unexpected observation, or the setup for the ending.
7. BODY BLOCK 3 (optional) — only when the length needs another beat.
8. CLOSING (optional) — the memorable last line, final joke or emotional payoff.
9. CTA + ALIGNED LEAD MAGNET — a natural next step that follows from THIS content.

IN THE SONG, the sections play these roles (keep the section tags the request gives you):
- The first sung line is the HOOK: the catchiest, funniest or most relatable line. Never an introduction.
- The next 2–3 lines are the LOCK-IN: the subject, character and conflict, established immediately.
- [VERSE 1] is BODY 1: specific, memorable details.
- [CHORUS] is REHOOK 1: a catchy, repeatable phrase people want to sing back.
- [VERSE 2] is BODY 2: escalate with new jokes, twists or stakes.
- The chorus return, or the turn into the [OUTRO], is REHOOK 2: an evolved line with a stronger payoff.
- [BRIDGE], when the length has one, is the twist or change of perspective.
- [OUTRO] is the CLOSING: the strongest payoff, the last line sung.
- The CTA lives in adCopy.cta, socialCaption and firstComment. Weave it into the lyric only if it fits naturally, and never after the punchline.
A song still has to sound like a real song: rhythm, rhyme, repetition, a chorus people remember. Never prose broken into lines.

IN THE VIDEO SCRIPT (videoScript), each beat is one entry:
{ "section": one of "hook" | "lockIn" | "body1" | "rehook1" | "body2" | "rehook2" | "body3" | "closing" | "cta",
  "timing": "0–3s", "voiceover": what is sung or said, "caption": the on-screen text, "visual": the shot, "sound": music or SFX cue (or "") }
- The video is Joe performing THIS song, so voiceover quotes the lyric lines that play during that beat, word for word. The CTA beat may be a short spoken or on-screen line after the song ends.
- Hook beat: 0–3 seconds. Captions are short, punchy, and readable in under two seconds.
- Timings run in order with no gaps and add up to the song's length.
- Made for TikTok, Instagram Reels, YouTube Shorts and Facebook Reels (9:16, caption-safe).
- Every line earns its place: conversational, short sentences, specific details. No filler, no generic AI phrasing, no obvious advertising voice.

THE CTA AND LEAD MAGNET
- The CTA must follow from the content. The one offer that exists is Jobless Joe's Bootcamp, which teaches ordinary people to start using AI. Use it when the content leads there (a job-market song → "get into Jobless Joe's Bootcamp").
- When the bootcamp would feel forced, use an honest engagement CTA instead: comment, share it with the friend it's about, follow for the next episode.
- Never invent an offer, download, discount, guide, template, price or feature that doesn't exist.

QUALITY CHECK (before responding)
- The first line grabs attention immediately.
- The lock-in gives a reason to stay.
- The body delivers story progression and real laughs.
- Both rehooks add fresh curiosity or escalation; neither just repeats.
- The ending pays off. The CTA follows logically. Everything fits the length.`;

/**
 * Clean a model's videoScript: known sections only, in format order, one
 * entry per section. Returns undefined when nothing usable came back, so
 * older episodes and failed generations simply have no script.
 */
export function sanitizeVideoScript(raw: unknown): VideoScriptBeat[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const seen = new Set<RetentionKey>();
  const beats: VideoScriptBeat[] = [];
  for (const item of raw) {
    const o = (item ?? {}) as Record<string, unknown>;
    if (!isRetentionKey(o.section) || seen.has(o.section)) continue;
    const beat: VideoScriptBeat = {
      section: o.section,
      timing: s(o.timing),
      voiceover: s(o.voiceover),
      caption: s(o.caption),
      visual: s(o.visual),
      sound: s(o.sound),
    };
    if (!beat.voiceover && !beat.caption) continue;
    seen.add(o.section);
    beats.push(beat);
  }
  const order = RETENTION_BEATS.map((b) => b.key);
  beats.sort((a, b) => order.indexOf(a.section) - order.indexOf(b.section));
  return beats.length ? beats : undefined;
}

export function beatLabel(key: RetentionKey): string {
  return RETENTION_BEATS.find((b) => b.key === key)?.label ?? key;
}

/** The whole script as plain text, for copying into an editor. */
export function videoScriptText(beats: VideoScriptBeat[]): string {
  return beats
    .map((b) =>
      [
        `[${beatLabel(b.section).toUpperCase()}] ${b.timing}`.trim(),
        b.voiceover && `VO: ${b.voiceover}`,
        b.caption && `CAPTION: ${b.caption}`,
        b.visual && `VISUAL: ${b.visual}`,
        b.sound && `SOUND: ${b.sound}`,
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n");
}

/** Just the on-screen captions, one per line. */
export function videoScriptCaptions(beats: VideoScriptBeat[]): string {
  return beats.map((b) => b.caption).filter(Boolean).join("\n");
}

/**
 * Rewrite ONE beat of an existing script, keeping the rest. The reply is a
 * single beat object.
 */
export function buildBeatRegenPrompt(args: {
  title: string;
  premise?: string;
  lyrics: string;
  script: VideoScriptBeat[];
  section: RetentionKey;
  note?: string;
  language?: string;
}): string {
  const beat = RETENTION_BEATS.find((b) => b.key === args.section)!;
  const current = args.script.find((b) => b.section === args.section);
  return `You are rewriting ONE beat of a short-form video script for a Jobless Joe song. Leave every other beat alone.

SONG: ${args.title}
${args.premise ? `THE JOKE: ${args.premise}\n` : ""}LYRICS:
${args.lyrics}

THE FULL SCRIPT RIGHT NOW:
${videoScriptText(args.script)}

BEAT TO REWRITE: ${beat.label} (section "${beat.key}") — ${beat.job}
${current ? `Its current version is above; write a clearly different, stronger take.` : "It doesn't exist yet; write it to fit between its neighbours."}
${args.note ? `The user asked for: ${args.note}\n` : ""}
Rules:
- Keep its timing${current?.timing ? ` (${current.timing})` : ""} so the rest of the script still lines up.
- Voiceover quotes lyric lines that play during this beat, word for word (the CTA beat may be a short spoken line instead).
- It must flow from the beat before and into the beat after.
- Captions are short and readable in under two seconds.
- The CTA follows from this content. The only real offer is Jobless Joe's Bootcamp; never invent another offer, download, price or feature.
- Audience-facing text in ${args.language ?? "the song's language"}.

Reply with ONLY this JSON object:
{"section": "${beat.key}", "timing": string, "voiceover": string, "caption": string, "visual": string, "sound": string}`;
}
