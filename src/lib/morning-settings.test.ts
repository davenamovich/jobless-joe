// Run: npx tsx --test src/lib/morning-settings.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MORNING_SETTINGS, morningAddendum, normalizeMorningSettings } from "./morning-settings";

describe("Morning Show settings", () => {
  it("defaults to punchy, hook-first, looping, 60 seconds", () => {
    assert.deepEqual(normalizeMorningSettings(undefined), DEFAULT_MORNING_SETTINGS);
    assert.equal(DEFAULT_MORNING_SETTINGS.style, "punchy");
    assert.equal(DEFAULT_MORNING_SETTINGS.ending, "loop");
    assert.equal(DEFAULT_MORNING_SETTINGS.length, 60);
  });

  it("drops junk and lands length on a button", () => {
    const s = normalizeMorningSettings({ style: "nuclear", hook: "pov", ending: "comment", length: 100, spice: "roast", focus: ["scams", "bogus"] });
    assert.equal(s.style, "punchy");
    assert.equal(s.hook, "pov");
    assert.equal(s.ending, "comment");
    assert.equal(s.length, 90);
    assert.equal(s.spice, "roast");
    assert.deepEqual(s.focus, ["scams"]);
  });

  it("the viral rules override the greeting and the old word counts, and set the length", () => {
    const t = morningAddendum({ ...DEFAULT_MORNING_SETTINGS, length: 30 });
    assert.match(t, /override the cold-open, greeting and word-count rules above/);
    assert.match(t, /No "Good morning", no "Welcome"/);
    assert.match(t, /twelve words at most/);
    assert.match(t, /about 30s spoken/);
    assert.match(t, /over 40/, "the audience block comes along");
    assert.match(t, /never invented facts|Stay accurate/);
  });

  it("builds the show on the retention format with a CTA placed for each ending", () => {
    const t = morningAddendum(DEFAULT_MORNING_SETTINGS);
    assert.match(t, /THE RETENTION FORMAT/);
    assert.match(t, /LOCK-IN ZONE/);
    assert.match(t, /always two or three lines, never one/);
    assert.match(t, /N segments has N - 1 rehooks/);
    assert.match(t, /"Next up", "Moving on"/);
    assert.match(t, /never write these beat names in it/);
    assert.match(t, /Never invent an offer/);
    assert.match(t, /line just before the loop line/);
    assert.match(morningAddendum({ ...DEFAULT_MORNING_SETTINGS, ending: "comment" }), /comment question is the CTA/);
    assert.match(morningAddendum({ ...DEFAULT_MORNING_SETTINGS, length: 30 }), /fits about 30s/);
  });

  it("each hook, style and ending changes the instructions", () => {
    assert.match(morningAddendum({ ...DEFAULT_MORNING_SETTINGS, hook: "pov" }), /Open with "POV:"/);
    assert.match(morningAddendum({ ...DEFAULT_MORNING_SETTINGS, hook: "stat" }), /never invent a statistic/);
    assert.match(morningAddendum({ ...DEFAULT_MORNING_SETTINGS, style: "chaotic" }), /Maximum energy|maximum energy/);
    assert.match(morningAddendum({ ...DEFAULT_MORNING_SETTINGS, style: "classic" }), /still open on the hook/);
    assert.match(morningAddendum({ ...DEFAULT_MORNING_SETTINGS, ending: "loop" }), /runs straight back into the first line/);
    assert.match(morningAddendum({ ...DEFAULT_MORNING_SETTINGS, ending: "comment" }), /question for the comments/);
    assert.match(morningAddendum({ ...DEFAULT_MORNING_SETTINGS, ending: "plain" }), /one line, the best laugh/);
  });
});
