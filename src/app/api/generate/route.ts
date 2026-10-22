import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  ACTIONS,
  isEpisodeKey,
  buildSystemPrompt,
  buildTightenPrompt,
  buildUserPrompt,
  DURATIONS,
  EMPTY_STORY_BIBLE,
  INTENSITIES,
  MAX_SCRIPT_CHARS,
  MIN_SCRIPT_CHARS,
  TARGETS,
  type ActionKey,
  type DurationKey,
  type IntensityKey,
  type SongOutput,
  type StoryBible,
} from "@/lib/joe-prompts";
import {
  analyzeLyricFit,
  lastSungLine,
  type LyricFit,
} from "@/lib/lyric-budget";
import { CROONER_STYLES } from "@/lib/crooner-styles";
import { DEFAULT_LANGUAGE, isLanguageKey } from "@/lib/languages";
import { chat, loadBackendConfig } from "@/lib/ai-backend";
import { digestSong, freshnessBlock, pickAngle, type RecentSong } from "@/lib/freshness";
import { cleanYouTubeSeo } from "@/lib/youtube-service";
import { sanitizeVideoScript } from "@/lib/retention-format";
import { seasonEpisodeFor } from "@/lib/season";
import { loadArc } from "@/lib/ralph";
import {
  PLAN_SYSTEM,
  SENSE_EDIT_SYSTEM,
  buildPlanPrompt,
  buildSenseEditPrompt,
  applyLineFixes,
  parseLineFixes,
  parseSongPlan,
  syncQuotes,
  withPlan,
  type SongPlan,
} from "@/lib/song-plan";

export const runtime = "nodejs";
// Plan + song + sense edit (+ an occasional tighten) are up to four model calls.
export const maxDuration = 180;

interface GenerateBody {
  episodeKey: string;
  episodeLabel: string;
  customTopic?: string;
  customScript?: string;
  duration: DurationKey;
  intensity: IntensityKey;
  target: string;
  croonerStyle?: string;
  language?: string;
  action: ActionKey;
  /**
   * The song a refine action (funnier, continue…) works on. Without it the
   * newest episode in the DB is used, which may be another chat's song.
   */
  episodeId?: string;
}

/** Pull a fresh Story Bible out of the DB (or return the default one). */
async function loadStoryBible(): Promise<StoryBible> {
  const row = await db.storyBible.findUnique({ where: { id: "current" } });
  if (!row) return { ...EMPTY_STORY_BIBLE };
  return {
    currentSituation: row.currentSituation,
    learnedSkills: safeParseArr(row.learnedSkills),
    builtThings: safeParseArr(row.builtThings),
    characters: safeParseArr(row.characters),
    runningJokes: safeParseArr(row.runningJokes),
    previousPunchlines: safeParseArr(row.previousPunchlines),
    unresolvedStorylines: safeParseArr(row.unresolvedStorylines),
    nextDevelopment: row.nextDevelopment,
    episodeCount: row.episodeCount,
  };
}

function safeParseArr(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

/** Persist the latest Story Bible as updated by the LLM. */
async function saveStoryBible(sb: SongOutput["storyBibleUpdate"], episodeCount: number) {
  const data = {
    currentSituation: sb.currentSituation,
    learnedSkills: JSON.stringify(sb.learnedSkills ?? []),
    builtThings: JSON.stringify(sb.builtThings ?? []),
    characters: JSON.stringify(sb.characters ?? []),
    runningJokes: JSON.stringify(sb.runningJokes ?? []),
    previousPunchlines: JSON.stringify(sb.previousPunchlines ?? []),
    unresolvedStorylines: JSON.stringify(sb.unresolvedStorylines ?? []),
    nextDevelopment: sb.nextDevelopment ?? "",
    episodeCount,
  };
  await db.storyBible.upsert({
    where: { id: "current" },
    create: { id: "current", ...data },
    update: data,
  });
}

/**
 * The episode a refinement works on: the one asked for, else the most recent.
 */
async function loadLastEpisode(episodeId?: string): Promise<{
  title: string;
  lyrics: string;
  closingLine: string;
  nextEpisodeTeaser: string;
} | null> {
  const last =
    (episodeId
      ? await db.episode.findUnique({ where: { id: episodeId } })
      : null) ??
    (await db.episode.findFirst({
      orderBy: { createdAt: "desc" },
    }));
  if (!last) return null;
  try {
    const out: SongOutput = JSON.parse(last.output);
    return {
      title: out.episodeTitle,
      lyrics: out.lyrics,
      closingLine: out.closingLine,
      nextEpisodeTeaser: out.nextEpisodeTeaser,
    };
  } catch {
    return null;
  }
}

/** How many recent songs the songwriter is told not to repeat. */
const RECENT_SONGS = 12;

/** Digest the latest songs (newest first) into what the next one must not reuse. */
async function loadRecentSongs(take: number): Promise<RecentSong[]> {
  const rows = await db.episode.findMany({
    orderBy: { createdAt: "desc" },
    take,
    select: { output: true, customTopic: true },
  });
  return rows.flatMap((r) => {
    try {
      const song = digestSong(JSON.parse(r.output), r.customTopic);
      return song ? [song] : [];
    } catch {
      return [];
    }
  });
}

/**
 * The editor pass replies with lyrics, but may still wrap them in fences or
 * prepend a sentence. Keep only the lyric body.
 */
/** Commentary a model wraps lyrics in, before the song starts. */
const EDITOR_PREAMBLE =
  /^(sure|okay|ok|certainly|of course|here (are|is|you)|below (are|is|you)|tightened|rewritten|edited|note:)/i;

/**
 * Commentary a model appends after the song. It matters more than the preamble:
 * anything left at the end is the last thing sung, so a stray "Let me know if
 * you want it shorter!" would replace the punchline.
 */
const EDITOR_SIGNOFF =
  /^(let me know|want me to|would you like|should i|do you want|hope (this|that|you)|enjoy\b|that('|’)?s (it|all)|happy to|i can (make|cut|trim)|note:|end of (the )?(song|lyric))/i;

/** Lines that are only a fenced block marker rather than anything singable. */
function stripFences(raw: string): string {
  return (raw ?? "")
    .replace(/^\s*```[a-z]*\s*$/gim, "")
    .replace(/```/g, "")
    .trim();
}

/**
 * Drop commentary from the end of a lyric, keeping the punchline.
 *
 * Idempotent and conservative: it only removes trailing lines that read as an
 * aside, so a real closing line is never mistaken for one. That the lyric ends
 * on a punchline is checked separately in hasSingableLastLine().
 */
export function trimLyricSignoff(lyrics: string): string {
  const lines = String(lyrics ?? "").split(/\r?\n/);
  while (lines.length > 1) {
    const last = lines[lines.length - 1].trim();
    if (last === "") {
      lines.pop();
      continue;
    }
    if (/^\[[^\]]+\]$/.test(last)) break;
    if (EDITOR_SIGNOFF.test(last) || /^(let me know|hope this helps)/i.test(last)) {
      lines.pop();
      continue;
    }
    break;
  }
  return lines.join("\n").trim();
}

/**
 * The editor pass replies with lyrics, but models fence them, announce them
 * first ("Sure! Here are the tightened lyrics:") and sign off after them. Keep
 * only the song.
 *
 * Fences go wherever they appear; the preamble is dropped line by line only
 * while it reads as commentary — a lyric is allowed to open on a sung line,
 * since plenty of them start with no [INTRO].
 */
function cleanLyricReply(raw: string): string {
  const unfenced = stripFences(raw);
  if (!unfenced) return "";

  const lines = unfenced.split(/\r?\n/);
  while (lines.length > 1) {
    const first = lines[0].trim();
    if (first === "") {
      lines.shift();
      continue;
    }
    if (/^\[[^\]]+\]$/.test(first)) break;
    if (EDITOR_PREAMBLE.test(first)) {
      lines.shift();
      continue;
    }
    break;
  }
  return trimLyricSignoff(lines.join("\n"));
}

/**
 * Does this lyric end on a punchline? Cheap structural stand-in for taste: the
 * closing line has to be a real sung line (not a tag, not a fragment), and a
 * song with an [OUTRO] must have something inside it.
 */
function hasPunchlineEnding(fit: LyricFit): boolean {
  return hasSingableLastLine(fit.lastLine);
}

/**
 * A punchline is a line, not a stub: reject a bare tag, an empty tail, or a
 * one-or-two-word fragment like "oh yeah" — that's the shape of an ending that
 * got clipped, which is exactly what this pass exists to prevent.
 */
function hasSingableLastLine(line: string): boolean {
  const trimmed = lastSungLine(line);
  if (!trimmed || /^\[[^\]]+\]$/.test(trimmed)) return false;
  // A sign-off would become the last thing sung — that's not a punchline.
  if (EDITOR_SIGNOFF.test(trimmed)) return false;
  return trimmed.split(/\s+/).filter(Boolean).length >= 3;
}

/**
 * The LLM is sometimes chatty. Strip any markdown code fences and extract
 * just the JSON object.
 */
function extractJson(raw: string): string {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    s = s.slice(start, end + 1);
  }
  return s;
}

function sanitizeOutput(out: SongOutput): SongOutput {
  const hooks = Array.isArray(out.hooks) ? out.hooks.slice(0, 3) : [];
  while (hooks.length < 3) hooks.push("(no hook available)");

  const primaryTexts = Array.isArray(out.adCopy?.primaryTexts)
    ? out.adCopy.primaryTexts.slice(0, 3)
    : [];
  while (primaryTexts.length < 3) primaryTexts.push("Joe's next adventure starts now.");

  const headlines = Array.isArray(out.adCopy?.headlines)
    ? out.adCopy.headlines.slice(0, 3)
    : [];
  while (headlines.length < 3) headlines.push("Jobless Joe Sings Again");

  return {
    episodeTitle: out.episodeTitle || "Untitled Episode",
    songPremise: typeof out.songPremise === "string" ? out.songPremise : "",
    viralHook: typeof out.viralHook === "string" ? out.viralHook : "",
    socialClip:
      out.socialClip && typeof out.socialClip.lyrics === "string"
        ? { section: String(out.socialClip.section ?? ""), lyrics: out.socialClip.lyrics }
        : undefined,
    duration: out.duration || "",
    musicalDirection: out.musicalDirection || "",
    lyrics: out.lyrics || "",
    performanceNotes: out.performanceNotes || "",
    closingLine: out.closingLine || "",
    hooks,
    adCopy: {
      primaryTexts,
      headlines,
      description: out.adCopy?.description || "",
      cta: out.adCopy?.cta || "",
    },
    videoBrief: {
      visualOpening: out.videoBrief?.visualOpening || "",
      performanceShot: out.videoBrief?.performanceShot || "",
      onScreenCaptions: Array.isArray(out.videoBrief?.onScreenCaptions)
        ? out.videoBrief.onScreenCaptions
        : [],
      sceneChanges: Array.isArray(out.videoBrief?.sceneChanges)
        ? out.videoBrief.sceneChanges
        : [],
      visualPunchline: out.videoBrief?.visualPunchline || "",
      finalFrame: out.videoBrief?.finalFrame || "",
      aspectRatio: out.videoBrief?.aspectRatio || "9:16 vertical (caption-safe)",
    },
    videoScript: sanitizeVideoScript(out.videoScript),
    socialCaption: typeof out.socialCaption === "string" ? out.socialCaption : "",
    firstComment: typeof out.firstComment === "string" ? out.firstComment : "",
    nextEpisodeTeaser: out.nextEpisodeTeaser || "",
    nextEpisodeTitle: out.nextEpisodeTitle || "The Next Chapter",
    youtube: cleanYouTubeSeo(out.youtube),
    storyBibleUpdate: out.storyBibleUpdate ?? {
      currentSituation: "",
      learnedSkills: [],
      builtThings: [],
      characters: [],
      runningJokes: [],
      previousPunchlines: [],
      unresolvedStorylines: [],
      nextDevelopment: "",
    },
  };
}

export async function POST(req: NextRequest) {
  let body: GenerateBody;
  try {
    body = (await req.json()) as GenerateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // The arc the series follows: one written with Ralph, else Season 1.
  const { arc } = await loadArc();
  const validEpisode =
    body.episodeKey === "custom" ||
    isEpisodeKey(body.episodeKey) ||
    arc.episodes.some((e) => e.key === body.episodeKey);
  if (!validEpisode) {
    return NextResponse.json({ error: "Unknown episode theme." }, { status: 400 });
  }
  // "Continue the story" always means the season, even when the song on
  // screen was a one-off custom topic: it plays the next season episode.
  if (body.action === "continue" && body.episodeKey === "custom") {
    body = {
      ...body,
      episodeKey: arc.episodes[0].key,
      episodeLabel: arc.episodes[0].label,
      customTopic: undefined,
      customScript: undefined,
    };
  }
  if (!INTENSITIES.some((i) => i.key === body.intensity)) {
    return NextResponse.json({ error: "Unknown intensity." }, { status: 400 });
  }
  if (!ACTIONS.some((a) => a.key === body.action)) {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
  if (!TARGETS.some((t) => t.key === body.target)) {
    return NextResponse.json({ error: "Unknown target audience." }, { status: 400 });
  }
  const croonerStyleKey =
    body.croonerStyle && CROONER_STYLES.some((s) => s.key === body.croonerStyle)
      ? body.croonerStyle!
      : "smoky-lounge";
  const language = isLanguageKey(body.language)
    ? body.language
    : DEFAULT_LANGUAGE;

  // A custom script seeds the song: Joe keeps its beats and rewrites the lines.
  const customScript = (body.customScript ?? "").trim();
  if (customScript.length > MAX_SCRIPT_CHARS) {
    return NextResponse.json(
      {
        error: `That script is ${customScript.length} characters — keep it under ${MAX_SCRIPT_CHARS}. Joe needs a seed, not a screenplay.`,
      },
      { status: 400 }
    );
  }
  const script =
    customScript.length >= MIN_SCRIPT_CHARS ? customScript : undefined;

  const storyBible = await loadStoryBible();
  const previousEpisode =
    body.action === "generate" ? null : await loadLastEpisode(body.episodeId);

  // Brand-new songs (generate / continue) get a comic angle; remixes rewrite
  // the latest song, so that one is left off the do-not-reuse list.
  const isNewSong = body.action === "generate" || body.action === "continue";
  const recentSongs = await loadRecentSongs(RECENT_SONGS + (isNewSong ? 0 : 1));
  const freshness = freshnessBlock(
    isNewSong ? recentSongs : recentSongs.slice(1),
    isNewSong ? pickAngle() : null
  );

  const systemPrompt = buildSystemPrompt(croonerStyleKey, language);
  const userPrompt = buildUserPrompt({
    episodeKey: body.episodeKey,
    episodeLabel: body.episodeLabel,
    customTopic: body.customTopic,
    customScript: script,
    duration: body.duration,
    intensity: body.intensity,
    target: body.target,
    croonerStyle: croonerStyleKey,
    language,
    action: body.action,
    storyBible,
    arc,
    previousEpisode,
    freshness,
  });

  // === Pick the AI backend (Z.ai default, or OpenAI-compatible for local /
  // ngrok-hosted models like Ace 1.5). ===
  const backendCfg = await loadBackendConfig();

  let raw = "";
  let usedModel = "";
  let usedBackend = "zai";
  // === Writers' room: plan the story before writing a new song. ===
  // A short call decides what happens in each section and how it ends, so
  // the songwriter writes one clear story instead of improvising it inside a
  // twenty-field JSON. If planning fails, the song is written without one.
  let plan: SongPlan | null = null;
  if (isNewSong) {
    try {
      const planned = await chat(PLAN_SYSTEM, buildPlanPrompt(userPrompt), backendCfg);
      plan = parseSongPlan(planned.content);
      if (!plan) console.warn("Song plan unusable; writing without one:", planned.content.slice(0, 300));
    } catch (e) {
      console.error("Song planning failed; writing without a plan", e);
    }
  }

  try {
    const result = await chat(systemPrompt, withPlan(userPrompt, plan), backendCfg);
    raw = result.content;
    usedModel = result.model;
    usedBackend = result.backend;
  } catch (e) {
    console.error("Backend chat failed", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        error: `The crooner lost his voice (${backendCfg.activeBackend}): ${msg}`,
      },
      { status: 502 }
    );
  }

  if (!raw.trim()) {
    return NextResponse.json(
      { error: "Empty response from the model." },
      { status: 502 }
    );
  }

  let parsed: SongOutput;
  try {
    const jsonStr = extractJson(raw);
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    console.error("JSON parse failed", e, "\nRaw (truncated):", raw.slice(0, 800));
    return NextResponse.json(
      {
        error: "The songwriter returned an unparseable response. Please try again.",
        raw: raw.slice(0, 1000),
      },
      { status: 502 }
    );
  }

  let cleaned = sanitizeOutput(parsed);
  // A sign-off written inside the lyrics field would be sung as the ending.
  cleaned = { ...cleaned, lyrics: trimLyricSignoff(cleaned.lyrics) };

  // === Script editor: fix lines that don't make sense. ===
  // Reads the song against its plan and rewrites only broken lines. Kept
  // only when it changed something, didn't grow the song and still ends on
  // a real punchline.
  const durationLabelForEdit = DURATIONS.find((d) => d.key === body.duration)?.label;
  try {
    const before = analyzeLyricFit(cleaned.lyrics, body.duration, durationLabelForEdit);
    const edited = await chat(
      SENSE_EDIT_SYSTEM,
      buildSenseEditPrompt({ lyrics: cleaned.lyrics, plan, premise: cleaned.songPremise, language }),
      backendCfg
    );
    const { lyrics: candidate, changed } = applyLineFixes(cleaned.lyrics, parseLineFixes(edited.content));
    const after = changed ? analyzeLyricFit(candidate, body.duration, durationLabelForEdit) : null;
    // Line-for-line fixes can't restructure the song; just make sure it
    // didn't grow past its running time or lose its ending.
    const sameShape =
      !!after &&
      (after.overBy <= before.overBy || after.fits) &&
      (!before.hasOutro || after.hasOutro) &&
      hasPunchlineEnding(after);
    if (changed && sameShape) {
      cleaned = syncQuotes({ ...cleaned, lyrics: candidate });
      console.log(`Lyrics sense-edited: ${changed} line(s) fixed`);
    } else if (changed) {
      console.warn("Sense edit rejected (song ran long or lost its ending)");
    }
  } catch (e) {
    // A failed edit must never cost the user their song.
    console.error("Sense edit failed", e);
  }

  // === Make the song fit its own running time before anything is stored. ===
  // The audio engines get an exact number of seconds; a lyric that runs long
  // has its ending clipped mid-line. So measure against the budget for the
  // requested duration and, when the song overshoots or never closes, ask the
  // editor pass for the same song tightened to fit.
  const durationLabel = DURATIONS.find((d) => d.key === body.duration)?.label;
  let lyricFit = analyzeLyricFit(cleaned.lyrics, body.duration, durationLabel);
  let tightened = false;
  if (!lyricFit.fits) {
    const before = lyricFit;
    try {
      const edited = await chat(
        systemPrompt,
        buildTightenPrompt({
          lyrics: cleaned.lyrics,
          durationKey: body.duration,
          durationLabel,
          words: before.words,
          targetWords: before.targetWords,
          maxWords: before.maxWords,
          missingSections: before.missingSections,
          hasOutro: before.hasOutro,
          language,
        }),
        backendCfg
      );
      const candidate = cleanLyricReply(edited.content);
      const after = candidate
        ? analyzeLyricFit(candidate, body.duration, durationLabel)
        : null;
      // Keep the edit only when it is genuinely better on one axis and no
      // worse on the other: never longer, never missing the close a song of
      // this length needs, and never without a punchline at the end.
      const needsOutro = (after?.seconds ?? before.seconds) > 20;
      const improves =
        !!after &&
        (after.overBy < before.overBy ||
          (needsOutro && !before.hasOutro && after.hasOutro));
      if (
        after &&
        after.words > 20 &&
        after.overBy <= before.overBy &&
        (!needsOutro || after.hasOutro) &&
        improves &&
        hasPunchlineEnding(after)
      ) {
        cleaned = { ...cleaned, lyrics: candidate };
        lyricFit = after;
        tightened = true;
        console.log(
          `Lyrics tightened for ${body.duration}: ${before.words} -> ${after.words} words (max ${after.maxWords})`
        );
      } else {
        console.warn(
          `Lyric tightening rejected for ${body.duration}: draft ${before.words} words (fits=${before.fits}, outro=${before.hasOutro})` +
            (after
              ? `, edit ${after.words} words (fits=${after.fits}, outro=${after.hasOutro})`
              : ", no usable edit")
        );
      }
    } catch (e) {
      // A failed edit must never cost the user their song.
      console.error("Lyric tightening failed", e);
    }
  }

  const newEpisodeCount =
    body.action === "generate" || body.action === "continue"
      ? storyBible.episodeCount + 1
      : storyBible.episodeCount;

  // "Continue" plays the next season episode; file the song under that one so
  // remixes and the next "continue" know where the story is.
  const played = seasonEpisodeFor(body.episodeKey, body.action, storyBible.episodeCount, arc);

  const createdEpisode = await db.episode.create({
    data: {
      episodeTheme: played?.key ?? body.episodeKey,
      episodeLabel: played?.label ?? body.episodeLabel,
      customTopic: body.customTopic ?? null,
      customScript: script ?? null,
      duration: body.duration,
      intensity: body.intensity,
      target: body.target,
      croonerStyle: croonerStyleKey,
      language,
      backend: usedBackend,
      backendModel: usedModel || null,
      action: body.action,
      title: cleaned.episodeTitle,
      output: JSON.stringify(cleaned),
      teaser: cleaned.nextEpisodeTeaser,
      nextTitle: cleaned.nextEpisodeTitle,
    },
  });

  // Only the series moves the story on. A one-off custom topic or pasted
  // script (anything a Telegram user types) would otherwise rewrite the shared
  // Story Bible, and every later song would carry its side plot forward.
  const updatesSeries = body.episodeKey !== "custom";
  if (updatesSeries) {
    await saveStoryBible(cleaned.storyBibleUpdate, newEpisodeCount);
  }

  // === Fire TTS audio generation in the background. ===
  // We don't await this — generation can take 5-30s for a long song, and the
  // user should see their lyrics immediately. The phone UI fetches the audio
  // lazily when the user hits Play, polling until it's ready.
  const voiceForTts = await defaultVoice();
  void generateAudioInBackground(createdEpisode.id, voiceForTts).catch((e) => {
    console.error("Background TTS failed:", e);
  });

  return NextResponse.json({
    ok: true,
    output: cleaned,
    episodeId: createdEpisode.id,
    lyricFit: { ...lyricFit, tightened },
    storyBible: updatesSeries
      ? { ...cleaned.storyBibleUpdate, episodeCount: newEpisodeCount }
      : storyBible,
    backend: usedBackend,
    model: usedModel,
    croonerStyle: croonerStyleKey,
    language,
    audio: {
      voice: voiceForTts,
      status: "generating",
    },
  });
}

/** Pull the default voice from BackendConfig (falling back to "jam"). */
async function defaultVoice(): Promise<string> {
  const cfg = await db.backendConfig.findUnique({ where: { id: "current" } });
  return cfg?.defaultVoice || "jam";
}

/**
 * Kick off audio generation in the background. The result (success or
 * failure) is logged but doesn't affect the API response — the UI polls
 * /api/audio?episodeId=...&voice=... to know when it's ready.
 */
async function generateAudioInBackground(episodeId: string, voice: string) {
  try {
    const { ensureAudioTrack } = await import("@/lib/tts-service");
    const result = await ensureAudioTrack(episodeId, voice);
    if (!result.ok) {
      console.warn(`Audio generation failed for ${episodeId}: ${result.error}`);
    } else {
      console.log(`Audio generated for ${episodeId} (${voice}): ${result.audioUrl}`);
    }
  } catch (e) {
    console.error("Audio generation error:", e);
  }
}
