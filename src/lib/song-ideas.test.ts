import { test } from "node:test";
import assert from "node:assert/strict";
import { SONG_IDEAS } from "./song-ideas";
import { buildSystemPrompt } from "./joe-prompts";

test("song ideas are the eight Old Joe concepts, each with a premise", () => {
  assert.equal(SONG_IDEAS.length, 8);
  for (const idea of SONG_IDEAS) assert.ok(idea.topic.startsWith(idea.label + ":"), idea.label);
});

test("the songwriter prompt carries Old Joe, the viral formula and the clip fields", () => {
  const p = buildSystemPrompt();
  for (const s of [
    "Old Joe",
    "CRYPTO REGRET",
    "THE VIRAL SONG FORMULA",
    "I trained the AI that took my job",
    '"viralHook": string',
    '"socialClip"',
    '"songPremise": string',
    "The future is bright",
    // Kept from earlier rules: clean endings and the title in the chorus.
    "Every song CLOSES",
    "The chorus sings the song title",
  ])
    assert.ok(p.includes(s), s);
});
