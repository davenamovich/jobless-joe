import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { EMPTY_STORY_BIBLE, type StoryBible } from "@/lib/joe-prompts";

export const runtime = "nodejs";

function safeParseArr(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export async function GET() {
  const row = await db.storyBible.findUnique({ where: { id: "current" } });
  if (!row) {
    return NextResponse.json({ storyBible: EMPTY_STORY_BIBLE });
  }
  const sb: StoryBible = {
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
  return NextResponse.json({ storyBible: sb });
}
