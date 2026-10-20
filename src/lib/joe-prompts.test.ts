// Run: npx tsx --test src/lib/joe-prompts.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildLyricsSystemPrompt,
  buildSystemPrompt,
  buildUserPrompt,
  cleanLyricsForSinging,
  EMPTY_STORY_BIBLE,
  type GenerateRequest,
} from "./joe-prompts";

const req: GenerateRequest = {
  episodeKey: "rejection-blues",
  episodeLabel: "The Rejection Letter Blues",
  duration: "60s",
  intensity: "deadpan",
  target: "job-seekers",
  action: "generate",
  storyBible: EMPTY_STORY_BIBLE,
};

describe("two-pass song prompts", () => {
  it("keeps Joe's character in both system prompts, JSON only in the package one", () => {
    const lyrics = buildLyricsSystemPrompt();
    const pkg = buildSystemPrompt();
    for (const p of [lyrics, pkg]) assert.match(p, /THE CHARACTER: JOBLESS JOE/);
    assert.match(lyrics, /Return ONLY the lyrics/);
    assert.match(lyrics, /Vocals start immediately/);
    assert.doesNotMatch(lyrics, /single valid JSON object/);
    assert.match(pkg, /single valid JSON object/);
  });

  it("asks the lyrics pass for plain lyrics, not JSON", () => {
    const p = buildUserPrompt({ ...req, mode: "lyrics" });
    assert.match(p, /Reply with the lyrics ONLY/);
    assert.doesNotMatch(p, /Respond with a single valid JSON object/);
  });

  it("locks the written song into the package pass", () => {
    const song = "[VERSE 1]\nDear Joe, we regret to inform you\n[OUTRO]\nI framed it next to the other forty-two";
    const p = buildUserPrompt({ ...req, lockedLyrics: song });
    assert.match(p, /THE SONG IS ALREADY WRITTEN/);
    assert.ok(p.includes(song));
    assert.match(p, /copy them into "lyrics" unchanged/);
    assert.doesNotMatch(buildUserPrompt(req), /ALREADY WRITTEN/, "the one-shot has no locked song");
    assert.doesNotMatch(buildUserPrompt({ ...req, mode: "lyrics", lockedLyrics: song }), /ALREADY WRITTEN/);
  });
});

describe("cleanLyricsForSinging", () => {
  it("drops what the engine would sing as noise, keeps tags and lines", () => {
    const raw = "[VERSE 1]\n(soft piano)\n**Dear Joe** — we regret \u{1F622}\nIt’s “not you” (whispered)\n\n\n\n[OUTRO]\nI framed it";
    assert.equal(cleanLyricsForSinging(raw), "[VERSE 1]\n\nDear Joe, we regret\nIt's \"not you\"\n\n[OUTRO]\nI framed it");
  });
});
