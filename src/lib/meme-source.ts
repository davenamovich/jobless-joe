/**
 * Where a meme batch comes from: a stored song episode (title, lyrics, hooks,
 * closing line). Shared by /meme in Telegram and the web app's Memes button.
 */

import { db } from "@/lib/db";
import type { MemeSource } from "@/lib/joe-memes";
import type { SongOutput } from "@/lib/joe-prompts";

/** The given episode, or the most recent one. Null when there's no song. */
export async function songMemeSource(episodeId?: string): Promise<MemeSource | null> {
  const ep = episodeId
    ? await db.episode.findUnique({ where: { id: episodeId } })
    : await db.episode.findFirst({ orderBy: { createdAt: "desc" } });
  if (!ep) return null;
  let out: Partial<SongOutput> = {};
  try {
    out = JSON.parse(ep.output) as SongOutput;
  } catch {
    // Title alone still makes memes.
  }
  return {
    title: out.episodeTitle || ep.title,
    topic: ep.customTopic ?? undefined,
    lyrics: out.lyrics,
    hooks: Array.isArray(out.hooks) ? out.hooks : undefined,
    closingLine: out.closingLine,
  };
}
