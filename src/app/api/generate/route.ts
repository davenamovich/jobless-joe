import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  ACTIONS,
  buildSystemPrompt,
  buildUserPrompt,
  EMPTY_STORY_BIBLE,
  EPISODES,
  INTENSITIES,
  TARGETS,
  type ActionKey,
  type DurationKey,
  type IntensityKey,
  type SongOutput,
  type StoryBible,
} from "@/lib/joe-prompts";
import { CROONER_STYLES } from "@/lib/crooner-styles";
import { chat, loadBackendConfig } from "@/lib/ai-backend";

export const runtime = "nodejs";
export const maxDuration = 60;

interface GenerateBody {
  episodeKey: string;
  episodeLabel: string;
  customTopic?: string;
  duration: DurationKey;
  intensity: IntensityKey;
  target: string;
  croonerStyle?: string;
  action: ActionKey;
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

/** Find the most recent episode (any action) to use as context for refinements. */
async function loadLastEpisode(): Promise<{
  title: string;
  lyrics: string;
  closingLine: string;
  nextEpisodeTeaser: string;
} | null> {
  const last = await db.episode.findFirst({
    orderBy: { createdAt: "desc" },
  });
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
    nextEpisodeTeaser: out.nextEpisodeTeaser || "",
    nextEpisodeTitle: out.nextEpisodeTitle || "The Next Chapter",
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

  const validEpisode =
    body.episodeKey === "custom" || EPISODES.some((e) => e.key === body.episodeKey);
  if (!validEpisode) {
    return NextResponse.json({ error: "Unknown episode theme." }, { status: 400 });
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

  const storyBible = await loadStoryBible();
  const previousEpisode =
    body.action === "generate" ? null : await loadLastEpisode();

  const systemPrompt = buildSystemPrompt(croonerStyleKey);
  const userPrompt = buildUserPrompt({
    episodeKey: body.episodeKey,
    episodeLabel: body.episodeLabel,
    customTopic: body.customTopic,
    duration: body.duration,
    intensity: body.intensity,
    target: body.target,
    croonerStyle: croonerStyleKey,
    action: body.action,
    storyBible,
    previousEpisode,
  });

  // === Pick the AI backend (Z.ai default, or OpenAI-compatible for local /
  // ngrok-hosted models like Ace 1.5). ===
  const backendCfg = await loadBackendConfig();

  let raw = "";
  let usedModel = "";
  let usedBackend = "zai";
  try {
    const result = await chat(systemPrompt, userPrompt, backendCfg);
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

  const cleaned = sanitizeOutput(parsed);

  const newEpisodeCount =
    body.action === "generate" || body.action === "continue"
      ? storyBible.episodeCount + 1
      : storyBible.episodeCount;

  const createdEpisode = await db.episode.create({
    data: {
      episodeTheme: body.episodeKey,
      episodeLabel: body.episodeLabel,
      customTopic: body.customTopic ?? null,
      duration: body.duration,
      intensity: body.intensity,
      target: body.target,
      croonerStyle: croonerStyleKey,
      backend: usedBackend,
      backendModel: usedModel || null,
      action: body.action,
      title: cleaned.episodeTitle,
      output: JSON.stringify(cleaned),
      teaser: cleaned.nextEpisodeTeaser,
      nextTitle: cleaned.nextEpisodeTitle,
    },
  });

  await saveStoryBible(cleaned.storyBibleUpdate, newEpisodeCount);

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
    storyBible: {
      ...cleaned.storyBibleUpdate,
      episodeCount: newEpisodeCount,
    },
    backend: usedBackend,
    model: usedModel,
    croonerStyle: croonerStyleKey,
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
