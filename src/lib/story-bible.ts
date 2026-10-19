import { db } from "@/lib/db";
import { EMPTY_STORY_BIBLE, type StoryBible } from "@/lib/joe-prompts";

/**
 * Start the story over: the Story Bible goes back to the top of Season 1 and
 * the episode count to 0, so "Continue the story" plays episode 1 next.
 * Songs already made are kept; only the story memory is cleared.
 */
export async function resetStoryBible(): Promise<StoryBible> {
  const sb = EMPTY_STORY_BIBLE;
  const data = {
    currentSituation: sb.currentSituation,
    learnedSkills: JSON.stringify(sb.learnedSkills),
    builtThings: JSON.stringify(sb.builtThings),
    characters: JSON.stringify(sb.characters),
    runningJokes: JSON.stringify(sb.runningJokes),
    previousPunchlines: JSON.stringify(sb.previousPunchlines),
    unresolvedStorylines: JSON.stringify(sb.unresolvedStorylines),
    nextDevelopment: sb.nextDevelopment,
    episodeCount: 0,
  };
  await db.storyBible.upsert({
    where: { id: "current" },
    create: { id: "current", ...data },
    update: data,
  });
  return { ...sb, episodeCount: 0 };
}
