/**
 * Ralph — Joe's writers'-room lead. Borrowed from meme-loop-engine's story-arc
 * builder (bot/src/lib/xaiver/story-arc-builder.ts) and narrowed to one show.
 *
 * Two model calls:
 *   - ralphReply: chat with the owner about the season (audience, cast, running
 *     gags, tone, where it ends), one or two sharp questions at a time.
 *   - generateArc: turn that conversation into a StoryArc the songwriter
 *     follows (season.ts), validated and normalized before it is saved.
 *
 * The saved arc lives in the StoryArc table; no row means Season 1.
 */

import { db } from "@/lib/db";
import { chat, loadBackendConfig } from "@/lib/ai-backend";
import {
  DEFAULT_ARC,
  type SeasonAct,
  type SeasonEpisode,
  type StoryArc,
} from "@/lib/season";

export interface RalphMessage {
  role: "user" | "ralph";
  text: string;
}

/** Ralph remembers the last dozen messages; older ones fall away. */
export const RALPH_WINDOW = 12;

const SHOW_BRIEF = `THE SHOW
Jobless Joe is a stick-figure, old-school American crooner who got laid off. Every song is a funny, painfully relatable story about one of three things: the reality of today's job market (no jobs, bots rejecting people, ghosting, "entry level, 10 years' experience"), Joe adopting AI, or Joe launching his AI bootcamp for other job seekers. Songs are short-form videos (stick-figure animation) built to be shared: a hook in the first line, one quotable line, a punchline people repeat. The bootcamp is the only product; never invent prices, features, guarantees or claims for it. No real people.`;

const ARC_SHAPE = `ARC SHAPE (spread these beats across the acts, in order)
1. QUESTION — what the audience gets wrong about their job hunt, shown as a situation they recognize instantly.
2. MODEL — Joe tries the old way and it fails, hilariously.
3. PROOF — Joe tries AI; something small actually works.
4. TURN — change one variable (money, the people who ignored him, his friends asking how) and the stakes rise.
5. PAYOFF — return to the opening situation, now read correctly. The reveal is the payoff; the CTA is one next step (the bootcamp).`;

const CHAT_SYSTEM = `You are RALPH, head writer in Jobless Joe's writers' room. You and the show's owner are planning a season: a story arc of acts and short song episodes.

${SHOW_BRIEF}

${ARC_SHAPE}

HOW YOU WORK
- Start from the audience's misconception: that's the season's opening question.
- Find out, a little at a time: who the audience is, Joe's recurring characters (3-6, no real people), running gags, tone, and where the season should end.
- Ask one or two sharp questions per reply, never a questionnaire. Pitch concrete names, bits and episode premises the owner can react to ("What if the recruiter is a chatbot named Brenda who only speaks in emojis?").
- Keep every idea on message (job market, AI, the bootcamp) and relatable before it's absurd.
- Replies under 120 words, plain text, no markdown headings.
- When there's enough for a season, say so and tell them to hit GENERATE ARC.`;

const GEN_SYSTEM = `You turn a writers'-room conversation into Jobless Joe's season story arc.

${SHOW_BRIEF}

${ARC_SHAPE}

Respond with ONE JSON object and nothing else, matching:
{
  "title": string,            // the season's name
  "premise": string,          // one or two sentences
  "tone": string,
  "rules": [string],          // 3-6 story rules that hold in every episode
  "characters": [{ "name": string, "role": string, "catchphrase": string }],  // 3-6, Joe first
  "acts": [{
    "title": string,
    "theme": string,          // what this act is about
    "episodes": [{
      "title": string,        // a song title a stranger gets
      "beat": string,         // ONE scene, at most 2 characters: the situation the song is about
      "relatable": string     // the painfully true job-hunt detail the hook is built on
    }]                        // 2-4 per act
  }],
  "reveal": string,
  "cta": string
}

Use exactly the number of acts asked for. Every episode is one clear situation, on message, in order. Build on what the owner said in the conversation; fill gaps with your best pitches.`;

function transcript(messages: RalphMessage[]): string {
  return messages
    .slice(-RALPH_WINDOW)
    .map((m) => `${m.role === "ralph" ? "RALPH" : "OWNER"}: ${m.text.trim()}`)
    .join("\n\n");
}

function arcSummary(arc: StoryArc): string {
  return `CURRENT ARC: ${arc.title}
Premise: ${arc.premise}
Acts: ${arc.acts
    .map(
      (a) =>
        `${a.n}. ${a.title} (${arc.episodes
          .filter((e) => e.act === a.n)
          .map((e) => e.label)
          .join("; ")})`
    )
    .join(" | ")}`;
}

/** Ralph's next line in the writers' room. */
export async function ralphReply(
  messages: RalphMessage[],
  arc?: StoryArc
): Promise<string> {
  const cfg = await loadBackendConfig();
  const user = `${arc ? `${arcSummary(arc)}\n\n` : ""}CONVERSATION SO FAR
${transcript(messages) || "(the owner just walked in)"}

Reply as Ralph.`;
  const res = await chat(CHAT_SYSTEM, user, cfg);
  return res.content.replace(/^\s*RALPH:\s*/i, "").trim();
}

function str(v: unknown, max = 400): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

/**
 * Validate and normalize the model's arc. Throws when there's nothing usable,
 * so a bad generation never replaces a good arc.
 */
export function normalizeArc(raw: unknown): StoryArc {
  const r = (raw ?? {}) as Record<string, unknown>;
  const rawActs = Array.isArray(r.acts) ? (r.acts as Record<string, unknown>[]) : [];
  const acts: SeasonAct[] = [];
  const episodes: SeasonEpisode[] = [];
  rawActs.slice(0, 6).forEach((a) => {
    const n = acts.length + 1;
    const eps = (Array.isArray(a.episodes) ? (a.episodes as Record<string, unknown>[]) : [])
      .slice(0, 4)
      .map((e) => ({
        label: str(e.title, 80),
        arc: str(e.beat),
        relatable: str(e.relatable) || str(e.beat),
      }))
      .filter((e) => e.label && e.arc);
    if (!eps.length) return;
    acts.push({ n, title: str(a.title, 60) || `Act ${n}`, theme: str(a.theme ?? a.summary) });
    eps.forEach((e, i) =>
      episodes.push({ key: `arc-${n}-${i + 1}-${slug(e.label)}`, act: n, ...e })
    );
  });
  if (!episodes.length) throw new Error("Ralph's arc came back without any episodes. Try again.");

  const characters = (Array.isArray(r.characters) ? (r.characters as Record<string, unknown>[]) : [])
    .slice(0, 6)
    .map((c) => ({
      name: str(c.name, 40),
      role: str(c.role, 120),
      catchphrase: str(c.catchphrase, 120) || undefined,
    }))
    .filter((c) => c.name);
  if (!characters.some((c) => /joe/i.test(c.name))) {
    characters.unshift({ name: "Jobless Joe", role: "Laid-off stick-figure crooner", catchphrase: undefined });
  }
  const rules = (Array.isArray(r.rules) ? r.rules : []).map((x) => str(x, 200)).filter(Boolean).slice(0, 6);

  return {
    title: str(r.title, 80) || "Jobless Joe: New Season",
    premise: str(r.premise, 600),
    tone: str(r.tone, 300) || DEFAULT_ARC.tone,
    rules: rules.length ? rules : DEFAULT_ARC.rules,
    characters,
    acts,
    episodes,
    reveal: str(r.reveal, 400),
    cta: str(r.cta, 200) || DEFAULT_ARC.cta,
  };
}

function extractJson(raw: string): string {
  let s = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end > start) s = s.slice(start, end + 1);
  return s;
}

/** Write the season from the writers'-room conversation. */
export async function generateArc(
  messages: RalphMessage[],
  opts: { actCount?: number; current?: StoryArc } = {}
): Promise<StoryArc> {
  const actCount = Math.min(6, Math.max(2, opts.actCount ?? 4));
  const cfg = await loadBackendConfig();
  const user = `${opts.current ? `${arcSummary(opts.current)}\n(Revise it where the conversation asks; keep what works.)\n\n` : ""}WRITERS' ROOM CONVERSATION
${transcript(messages) || "(no conversation: pitch your best season)"}

Write the season in ${actCount} acts. JSON only.`;
  const res = await chat(GEN_SYSTEM, user, cfg);
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(res.content));
  } catch {
    throw new Error("Ralph's arc wasn't valid JSON. Try GENERATE ARC again.");
  }
  return normalizeArc(parsed);
}

/** The arc the songwriter follows: the saved one, else Season 1. */
export async function loadArc(): Promise<{ arc: StoryArc; custom: boolean }> {
  const row = await db.storyArc.findUnique({ where: { id: "current" } }).catch(() => null);
  if (!row) return { arc: DEFAULT_ARC, custom: false };
  try {
    return { arc: normalizeStoredArc(JSON.parse(row.arc)), custom: true };
  } catch {
    return { arc: DEFAULT_ARC, custom: false };
  }
}

/** Validate an arc in our own shape (a stored one, or one posted back by the UI). */
export function normalizeStoredArc(a: StoryArc): StoryArc {
  return normalizeArc(fromStored(a));
}

function fromStored(a: StoryArc): unknown {
  if (!a || !Array.isArray(a.acts) || !Array.isArray(a.episodes)) return {};
  return {
    ...a,
    acts: a.acts.map((act) => ({
      title: act.title,
      theme: act.theme,
      episodes: a.episodes
        .filter((e) => e.act === act.n)
        .map((e) => ({ title: e.label, beat: e.arc, relatable: e.relatable })),
    })),
  };
}

export async function saveArc(arc: StoryArc): Promise<void> {
  const json = JSON.stringify(arc);
  await db.storyArc.upsert({
    where: { id: "current" },
    create: { id: "current", arc: json },
    update: { arc: json },
  });
}

/** Go back to the built-in Season 1. */
export async function clearArc(): Promise<void> {
  await db.storyArc.deleteMany({ where: { id: "current" } });
}
