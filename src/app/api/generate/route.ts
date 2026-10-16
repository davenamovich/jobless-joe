import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
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

export const runtime = "nodejs";
export const maxDuration = 60;

interface GenerateBody {
  episodeKey: string;
  episodeLabel: string;
  customTopic?: string;
  duration: DurationKey;
  intensity: IntensityKey;
  target: string;
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

  const storyBible = await loadStoryBible();
  const previousEpisode =
    body.action === "generate" ? null : await loadLastEpisode();

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt({
    episodeKey: body.episodeKey,
    episodeLabel: body.episodeLabel,
    customTopic: body.customTopic,
    duration: body.duration,
    intensity: body.intensity,
    target: body.target,
    action: body.action,
    storyBible,
    previousEpisode,
  });

  let zai: Awaited<ReturnType<typeof ZAI.create>>;
  try {
    zai = await ZAI.create();
  } catch (e) {
    console.error("ZAI init failed", e);
    return NextResponse.json(
      { error: "AI backend failed to initialize." },
      { status: 500 }
    );
  }

  let raw = "";
  try {
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      thinking: { type: "disabled" },
    });
    raw = completion.choices[0]?.message?.content ?? "";
  } catch (e) {
    console.error("ZAI completion failed", e);
    return NextResponse.json(
      { error: "The crooner lost his voice. Please try again." },
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

  await Promise.all([
    db.episode.create({
      data: {
        episodeTheme: body.episodeKey,
        episodeLabel: body.episodeLabel,
        customTopic: body.customTopic ?? null,
        duration: body.duration,
        intensity: body.intensity,
        target: body.target,
        action: body.action,
        title: cleaned.episodeTitle,
        output: JSON.stringify(cleaned),
        teaser: cleaned.nextEpisodeTeaser,
        nextTitle: cleaned.nextEpisodeTitle,
      },
    }),
    saveStoryBible(cleaned.storyBibleUpdate, newEpisodeCount),
  ]);

  return NextResponse.json({
    ok: true,
    output: cleaned,
    storyBible: {
      ...cleaned.storyBibleUpdate,
      episodeCount: newEpisodeCount,
    },
  });
}
