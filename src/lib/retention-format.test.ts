// Run: npx tsx --test src/lib/retention-format.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  beatsFor,
  buildBeatRegenPrompt,
  sanitizeVideoScript,
  scriptSkeletonBrief,
  videoScriptCaptions,
  videoScriptText,
} from "./retention-format";

describe("beatsFor", () => {
  it("keeps hook, lock-in, both rehooks and the CTA on a 15s video", () => {
    assert.deepEqual(beatsFor("15s"), ["hook", "lockIn", "body1", "rehook1", "body2", "rehook2", "cta"]);
  });
  it("adds the closing at 60s and body 3 at 90s", () => {
    assert.ok(beatsFor("60s").includes("closing"));
    assert.ok(!beatsFor("60s").includes("body3"));
    assert.ok(beatsFor("90s").includes("body3"));
  });
  it("describes the skeleton for the prompt", () => {
    assert.match(scriptSkeletonBrief("30s"), /"hook" → "lockIn"/);
  });
});

describe("sanitizeVideoScript", () => {
  it("drops unknown and duplicate sections and sorts into format order", () => {
    const out = sanitizeVideoScript([
      { section: "cta", timing: "28–30s", voiceover: "Join the bootcamp", caption: "Link in bio" },
      { section: "intro", voiceover: "nope" },
      { section: "hook", timing: "0–3s", voiceover: "They fired me by email", caption: "FIRED BY EMAIL" },
      { section: "hook", voiceover: "second hook" },
      { section: "body1", voiceover: "", caption: "" },
    ]);
    assert.deepEqual(out?.map((b) => b.section), ["hook", "cta"]);
    assert.equal(out?.[0].voiceover, "They fired me by email");
    assert.equal(out?.[0].sound, "");
  });
  it("returns undefined for nothing usable", () => {
    assert.equal(sanitizeVideoScript(undefined), undefined);
    assert.equal(sanitizeVideoScript([{ section: "nope" }]), undefined);
  });
});

describe("script text", () => {
  const script = sanitizeVideoScript([
    { section: "hook", timing: "0–3s", voiceover: "Line one", caption: "CAP ONE", visual: "close-up" },
    { section: "cta", timing: "27–30s", voiceover: "Comment JOE", caption: "CAP TWO" },
  ])!;
  it("labels each beat for copying", () => {
    const text = videoScriptText(script);
    assert.match(text, /\[HOOK\] 0–3s\nVO: Line one\nCAPTION: CAP ONE\nVISUAL: close-up/);
    assert.match(text, /\[CTA \+ LEAD MAGNET\] 27–30s/);
  });
  it("copies captions alone", () => {
    assert.equal(videoScriptCaptions(script), "CAP ONE\nCAP TWO");
  });
  it("asks for exactly one beat and forbids invented offers", () => {
    const p = buildBeatRegenPrompt({ title: "T", lyrics: "la", script, section: "rehook1" });
    assert.match(p, /Rehook 1/);
    assert.match(p, /never invent another offer/);
    assert.match(p, /"section": "rehook1"/);
  });
});
