/**
 * Expression tags for Fish Audio's expressive voice (drama-3): the model
 * reads [directions] and sounds in square brackets, and <scoped>…</scoped>
 * tags around words, and acts them out instead of saying them.
 *
 * "Add expression" asks the writer to tag an existing sit-down script without
 * changing a single spoken word; `sameWords` rejects any reply that did.
 */

import { chat, loadBackendConfig } from "@/lib/ai-backend";
import { getLanguage } from "@/lib/languages";
import { stripExpressionTags } from "@/lib/sitdown-video";

export const EXPRESSION_SYSTEM = `You are the voice director for "Jobless Joe", a laid-off vintage crooner turned late-night host, delivering a comedy monologue or interview at his desk. The script will be performed by an expressive text-to-speech voice that acts out tags.

Add performance tags to the script so it sounds like a live comedy show:
- Directions and sounds in square brackets, placed exactly where they happen: emotions and tones like [excited], [deadpan], [smug], [exasperated], [conspiratorial], [mock serious], [warm]; sounds like [laugh], [chuckle], [sigh], [breath], [pause]. Short free-form directions are fine, e.g. [like he just remembered his rent is due].
- Scoped tags around a few words: <whisper>…</whisper>, <emphasis>…</emphasis>, <stress>…</stress>, <soft>…</soft>, <slow>…</slow>, <fast>…</fast>, <forceful>…</forceful>.

Rules:
- NEVER change, add, remove or reorder a spoken word. Only insert tags.
- Keep every line break and every speaker label ("SARAH:", "JOE:") exactly where it is. Tags go after the label.
- One or two tags per line at most; many lines need none. Put a [pause] before punchlines and a [laugh] or [chuckle] after Joe's own jokes now and then. Vary the emotions.
- No parentheses, no markdown, no notes.

Reply with the full tagged script and nothing else.`;

/** The spoken words of a script, ignoring tags, case and punctuation. */
function words(script: string): string {
  return script
    .split("\n")
    .map(stripExpressionTags)
    .join(" ")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}' ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the tagged script says exactly what the original said. */
export function sameWords(original: string, tagged: string): boolean {
  return words(original) === words(tagged);
}

export function cleanTaggedReply(raw: string): string {
  return raw
    .replace(/^```\w*\s*|```\s*$/g, "")
    .trim();
}

/** The script with expression tags added; throws if the writer changed words. */
export async function addExpressionTags(script: string, language?: string): Promise<string> {
  const original = script.trim();
  if (!original) throw new Error("The script is empty.");
  const lang = getLanguage(language);
  const result = await chat(
    EXPRESSION_SYSTEM,
    `${lang.key === "en" ? "" : `The script is in ${lang.label}. Keep it in ${lang.label}; the tags themselves stay in English.\n\n`}SCRIPT\n======\n${original}`,
    await loadBackendConfig(),
  );
  const tagged = cleanTaggedReply(result.content);
  if (!tagged || !sameWords(original, tagged)) {
    throw new Error("The tags came back with changed words. Try again.");
  }
  return tagged;
}
