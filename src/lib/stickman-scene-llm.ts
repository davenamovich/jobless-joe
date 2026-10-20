/**
 * The song video's storyboard from the active chat backend, laid over the
 * keyword scenes (stickman-scenes.ts). Never throws: a slow, failing or
 * nonsensical model just leaves the keyword storyboard in place.
 */

import { chat, loadBackendConfig } from "@/lib/ai-backend";
import { SCENE_SYSTEM, buildScenePrompt, keywordScenes, mergeLlmScenes, parseSongLines, type Scene } from "@/lib/stickman-scenes";

const TIMEOUT_MS = 40_000;
const CACHE_MAX = 20;

/** Same lyrics, same storyboard: the preview and the publish don't pay twice. */
const cache = new Map<string, Scene[]>();

export interface ScenePlan {
  scenes: Scene[];
  /** "llm" when the model staged at least half the lines. */
  source: "llm" | "keywords";
}

export async function planSongScenes(lyrics: string, title = ""): Promise<ScenePlan> {
  const fallback = keywordScenes(lyrics);
  if (fallback.length === 0) return { scenes: fallback, source: "keywords" };

  const key = `${title}\n${lyrics}`;
  const hit = cache.get(key);
  if (hit) return { scenes: hit, source: "llm" };

  try {
    const cfg = await loadBackendConfig();
    const prompt = buildScenePrompt(parseSongLines(lyrics), title);
    const res = await Promise.race([
      chat(SCENE_SYSTEM, prompt, cfg),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`no answer in ${TIMEOUT_MS / 1000}s`)), TIMEOUT_MS)),
    ]);
    const { scenes, used } = mergeLlmScenes(fallback, res.content);
    if (used >= Math.ceil(fallback.length / 2)) {
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
      cache.set(key, scenes);
      return { scenes, source: "llm" };
    }
    console.warn(`[stickman-scenes] model staged ${used}/${fallback.length} lines; using keyword scenes`);
  } catch (err) {
    console.warn("[stickman-scenes] storyboard model failed, using keyword scenes:", err instanceof Error ? err.message : err);
  }
  return { scenes: fallback, source: "keywords" };
}
