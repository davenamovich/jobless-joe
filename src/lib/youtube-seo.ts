/**
 * YouTube SEO — search-friendly titles, descriptions and tags for each song.
 *
 * The songwriter's episode title is a punchline ("Telegram Sent Me a Career"),
 * which nobody searches for. This asks the model for metadata built around
 * what people DO search ("funny song about job hunting", "AI career comedy"),
 * then assembles the final description deterministically so the parts YouTube
 * weighs most are always in the right place:
 *
 *   title        ≤ 70 chars, search phrase first, "Jobless Joe" last if it fits
 *   description  1st 150 chars = keyword-rich hook (what shows in search),
 *                then summary → course CTA → lyrics → 3 hashtags (+ #Shorts)
 *   tags         10–15, broad + long-tail, ≤ 480 chars total
 *
 * The result is stored on the episode (output.youtubeSeo) so every upload of
 * that song — YouTube direct or via Upload-Post — uses the same, editable copy.
 */

import { db } from "@/lib/db";
import { chat, loadBackendConfig } from "@/lib/ai-backend";
import { getLanguage } from "@/lib/languages";
import { withRef } from "@/lib/video-service";
import type { SongOutput } from "@/lib/joe-prompts";

export interface YouTubeSeo {
  /** ≤ 100 chars (YouTube's limit); aim ≤ 70 so it isn't cut off in search */
  title: string;
  /** The first ~150 chars — the search-result snippet */
  hook: string;
  /** 2–4 sentences on what the song is about, keywords used naturally */
  summary: string;
  tags: string[];
  /** Without the "#", e.g. ["JoblessJoe", "AIComedy", "JobSearch"] */
  hashtags: string[];
  /** Hand-edited in the UI — never overwritten by a regenerate-on-read */
  edited?: boolean;
  generatedAt?: number;
}

export const TITLE_MAX = 100;
export const TITLE_TARGET = 70;
export const HOOK_MAX = 150;
const TAGS_MAX_CHARS = 480;

function clean(s: unknown): string {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

/** Trim at a word boundary, no dangling punctuation. */
function cut(s: string, max: number): string {
  if (s.length <= max) return s;
  const slice = s.slice(0, max);
  const at = slice.lastIndexOf(" ");
  return (at > max * 0.6 ? slice.slice(0, at) : slice).replace(/[\s,;:–—-]+$/, "");
}

/** Make whatever the model returned safe to upload. */
export function normalizeSeo(raw: Partial<YouTubeSeo>, fallbackTitle: string): YouTubeSeo {
  let title = clean(raw.title) || clean(fallbackTitle) || "Jobless Joe";
  // No shouting: YouTube demotes ALL-CAPS titles.
  if (title.length > 12 && title === title.toUpperCase()) {
    title = title.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }
  title = cut(title.replace(/#\w+/g, "").trim(), TITLE_MAX);

  const hashtags = Array.from(
    new Set(
      (Array.isArray(raw.hashtags) ? raw.hashtags : [])
        .map((h) => clean(h).replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, ""))
        .filter((h) => h.length > 1),
    ),
  );
  if (!hashtags.some((h) => h.toLowerCase() === "joblessjoe")) hashtags.unshift("JoblessJoe");

  const tags: string[] = [];
  let total = 0;
  for (const t of Array.isArray(raw.tags) ? raw.tags : []) {
    const tag = clean(t).replace(/[<>#"]/g, "").toLowerCase();
    if (tag.length < 2 || tag.length > 60 || tags.includes(tag)) continue;
    if (total + tag.length + 1 > TAGS_MAX_CHARS) break;
    tags.push(tag);
    total += tag.length + 1;
  }
  if (!tags.includes("jobless joe")) tags.unshift("jobless joe");

  return {
    title,
    hook: cut(clean(raw.hook), HOOK_MAX),
    summary: clean(raw.summary).slice(0, 1200),
    tags: tags.slice(0, 15),
    hashtags: hashtags.slice(0, 3),
    edited: raw.edited || undefined,
    generatedAt: raw.generatedAt,
  };
}

/** The full description, assembled in the order YouTube cares about. */
export function assembleDescription(
  seo: YouTubeSeo,
  opts: { lyrics?: string; courseUrl?: string; isShort?: boolean; languageLabel?: string },
): string {
  const parts: string[] = [];
  if (seo.hook) parts.push(seo.hook);
  if (seo.summary) parts.push(seo.summary);
  if (opts.courseUrl) parts.push(`🎓 Learn to use AI with Joe — free course: ${opts.courseUrl}`);
  const lyrics = (opts.lyrics ?? "").trim();
  if (lyrics) parts.push(`🎙️ Lyrics\n${lyrics}`);
  const credits = ["🎧 Performed by Jobless Joe"];
  if (opts.languageLabel) credits.push(`🌍 ${opts.languageLabel}`);
  parts.push(credits.join(" · "));
  // YouTube shows the first three hashtags above the title.
  const tags = seo.hashtags.map((h) => `#${h}`);
  if (opts.isShort && !tags.includes("#Shorts")) tags.push("#Shorts");
  parts.push(tags.join(" "));

  let description = parts.join("\n\n").trim();
  if (description.length > 5000) description = `${description.slice(0, 4990).trimEnd()}…`;
  return description;
}

const SEO_SYSTEM = `You are a YouTube SEO specialist for "Jobless Joe", a comedy crooner channel: an unemployed everyman who discovered AI sings funny vintage-style songs about job hunting, work, recruiters, money and AI tools. Videos are short vertical music videos (often YouTube Shorts).

Write search-optimised metadata for ONE song. Rules:
- title: ≤ ${TITLE_TARGET} characters. Lead with the phrase a viewer would actually SEARCH (e.g. "Funny Song About Job Hunting", "AI Comedy Song", "When the Recruiter Ghosts You"), then the song's own hook. End with "| Jobless Joe" only if it still fits. Specific beats generic. No clickbait lies, no ALL CAPS, at most one emoji, no hashtags.
- hook: ONE or TWO sentences, ≤ ${HOOK_MAX} characters — this is the search-result snippet. Put the main keyword in the first sentence and make people want to watch.
- summary: 2–4 sentences on the story of the song, using 2–3 secondary keywords naturally (job search, unemployment, AI tools, career change, side hustle, recruiters — whichever truly fit). Never keyword-stuff, never promise jobs or income.
- tags: 12–15 search phrases, lowercase, mixing broad ("funny songs", "ai comedy") and long-tail ("song about getting ghosted by a recruiter"). Only tags that truly describe this video.
- hashtags: exactly 3, CamelCase, no "#": the first must be "JoblessJoe"; the other two are the most searched relevant topics.
- Write title, hook, summary and hashtags in the song's language; tags may mix in English.

Reply with ONLY this JSON, no prose:
{"title": string, "hook": string, "summary": string, "tags": [string], "hashtags": [string, string, string]}`;

/** Pull the JSON object out of a model reply. */
export function parseSeoReply(raw: string): Partial<YouTubeSeo> | null {
  const m = /\{[\s\S]*\}/.exec(raw);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as Partial<YouTubeSeo>;
  } catch {
    return null;
  }
}

function seoUserPrompt(input: { output: SongOutput; topic?: string | null; theme: string; language: string }): string {
  const o = input.output;
  return [
    `Song title (a punchline, not a search phrase): ${o.episodeTitle}`,
    `Episode theme: ${input.theme}`,
    input.topic ? `Topic: ${input.topic}` : "",
    `Language: ${getLanguage(input.language).label}`,
    `Duration: ${o.duration}`,
    o.closingLine ? `Closing line: ${o.closingLine}` : "",
    o.hooks?.length ? `Scroll-stopping hooks: ${o.hooks.join(" | ")}` : "",
    `Lyrics:\n${(o.lyrics ?? "").slice(0, 2500)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** A no-model fallback built from the song itself. */
export function fallbackSeo(output: SongOutput, topic?: string | null): YouTubeSeo {
  const subject = clean(topic) || "job hunting in the age of AI";
  return normalizeSeo(
    {
      title: `${output.episodeTitle} | Funny Song About ${subject.length < 30 ? subject : "Job Hunting & AI"} | Jobless Joe`,
      hook: output.hooks?.[0] || `A crooner comedy song about ${subject}.`,
      summary: `Jobless Joe, an out-of-work crooner who discovered AI, sings about ${subject}. ${output.closingLine ?? ""}`.trim(),
      tags: ["funny songs", "ai comedy", "job search", "unemployment song", "crooner", "comedy music", "ai song"],
      hashtags: ["JoblessJoe", "AIComedy", "JobSearch"],
    },
    output.episodeTitle,
  );
}

interface EpisodeRow {
  id: string;
  title: string;
  output: string;
  language: string;
  episodeLabel: string;
  customTopic: string | null;
}

async function loadEpisode(episodeId: string): Promise<{ row: EpisodeRow; output: SongOutput & { youtubeSeo?: YouTubeSeo } }> {
  const row = await db.episode.findUnique({
    where: { id: episodeId },
    select: { id: true, title: true, output: true, language: true, episodeLabel: true, customTopic: true },
  });
  if (!row) throw new Error("Episode not found.");
  try {
    return { row, output: JSON.parse(row.output) };
  } catch {
    throw new Error("Episode output is corrupted.");
  }
}

async function saveSeo(row: EpisodeRow, output: SongOutput, seo: YouTubeSeo) {
  await db.episode.update({
    where: { id: row.id },
    data: { output: JSON.stringify({ ...output, youtubeSeo: seo }) },
  });
}

/**
 * The song's SEO metadata: the saved copy, or a freshly generated one.
 * `regenerate` replaces even hand-edited copy (the UI asks first).
 */
export async function getYouTubeSeo(episodeId: string, { regenerate = false } = {}): Promise<YouTubeSeo> {
  const { row, output } = await loadEpisode(episodeId);
  if (output.youtubeSeo && !regenerate) return normalizeSeo(output.youtubeSeo, row.title);

  let seo: YouTubeSeo;
  try {
    const result = await chat(
      SEO_SYSTEM,
      seoUserPrompt({ output, topic: row.customTopic, theme: row.episodeLabel, language: row.language }),
      await loadBackendConfig(),
    );
    const parsed = parseSeoReply(result.content);
    if (!parsed?.title) throw new Error("No usable SEO JSON in the reply.");
    seo = normalizeSeo({ ...parsed, generatedAt: Date.now() }, row.title);
  } catch (e) {
    console.warn("[youtube-seo] model failed, using fallback", e);
    seo = { ...fallbackSeo(output, row.customTopic), generatedAt: Date.now() };
  }
  await saveSeo(row, output, seo);
  return seo;
}

/** The saved copy only — never calls the model. */
export async function peekYouTubeSeo(episodeId: string): Promise<YouTubeSeo | null> {
  const { row, output } = await loadEpisode(episodeId);
  return output.youtubeSeo ? normalizeSeo(output.youtubeSeo, row.title) : null;
}

/** Save hand-edited copy from the UI. */
export async function saveYouTubeSeo(episodeId: string, edits: Partial<YouTubeSeo>): Promise<YouTubeSeo> {
  const { row, output } = await loadEpisode(episodeId);
  const seo = normalizeSeo({ ...(output.youtubeSeo ?? {}), ...edits, edited: true }, row.title);
  await saveSeo(row, output, seo);
  return seo;
}

/** Title + full description + tags, ready to upload. */
export async function youtubeUploadCopy(episodeId: string): Promise<{
  title: string;
  description: string;
  tags: string[];
  /** BCP-47, e.g. "en" */
  language: string;
  seo: YouTubeSeo;
}> {
  const seo = await getYouTubeSeo(episodeId);
  const { row, output } = await loadEpisode(episodeId);
  const cfg = await loadBackendConfig();
  const seconds = Number(/(\d+)/.exec(output.duration ?? "")?.[1] ?? 0);
  const description = assembleDescription(seo, {
    lyrics: output.lyrics,
    courseUrl: cfg.courseUrl ? withRef(cfg.courseUrl, cfg.prRef) : "",
    isShort: seconds > 0 && seconds <= 180,
    languageLabel: getLanguage(row.language).nativeLabel,
  });
  return { title: seo.title, description, tags: seo.tags, language: getLanguage(row.language).key, seo };
}
