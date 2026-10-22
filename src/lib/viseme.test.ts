// Run: npx tsx --test src/lib/viseme.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MOUTH_LOOK, visemeOf } from "./viseme";

describe("visemeOf", () => {
  it("closes the lips on m, b, p at the start of a word", () => {
    assert.equal(visemeOf("maybe", 0.05), "closed");
    assert.equal(visemeOf("boom", 0.1), "closed");
    assert.equal(visemeOf("pay", 0.1), "closed");
    assert.notEqual(visemeOf("pay", 0.5), "closed");
  });
  it("closes on a final m, b, p only at the very end", () => {
    assert.equal(visemeOf("room", 0.95), "closed");
    assert.equal(visemeOf("room", 0.5), "round");
  });
  it("rounds o and u sounds", () => {
    for (const w of ["you", "food", "now", "go", "job", "robot"]) assert.equal(visemeOf(w, 0.4), "round", w);
    assert.equal(visemeOf("we", 0.1), "round", "w starts rounded");
  });
  it("widens ee, ay, i and e sounds", () => {
    for (const w of ["tea", "free", "say", "this", "tell", "my"]) assert.equal(visemeOf(w, 0.5), "wide", w);
  });
  it("leaves a and plain consonants neutral", () => {
    assert.equal(visemeOf("cat", 0.5), "mid");
    assert.equal(visemeOf("hmm", 0.5), "mid");
  });
  it("ignores punctuation and a silent final e", () => {
    assert.equal(visemeOf("“Boom,”", 0.1), "closed");
    assert.equal(visemeOf("make", 0.9), "mid");
  });
  it("moves through a word's vowels as it is said", () => {
    assert.equal(visemeOf("robot", 0.1), "round");
    assert.equal(visemeOf("legal", 0.1), "wide");
    assert.equal(visemeOf("legal", 0.9), "mid");
  });
  it("never throws on empty input and has a look for every shape", () => {
    assert.equal(visemeOf("", 0.5), "mid");
    assert.equal(visemeOf("123", 0.5), "mid");
    for (const k of ["mid", "round", "wide", "closed"] as const) assert.equal(MOUTH_LOOK[k].length, 2);
  });
});

describe("engines carry the viseme logic", async () => {
  const { buildSitdownVideoHtml, parseSitdownScript } = await import("./sitdown-video");
  const { JOE_RIG_JS } = await import("./stickman-rig");
  it("is embedded in the Sit-down page and the stickman rig", () => {
    const html = buildSitdownVideoHtml({ title: "t", script: parseSitdownScript("hello"), audioFile: "a.mp3", durationSec: 5 });
    assert.match(html, /function visemeOf\(/);
    assert.match(html, /MOUTH_LOOK\[shape\]/);
    assert.match(JOE_RIG_JS, /function visemeOf\(/);
    assert.match(JOE_RIG_JS, /wordShape\(songMs/);
  });
});
