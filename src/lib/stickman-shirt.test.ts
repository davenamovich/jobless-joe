// Run: npx tsx --test src/lib/stickman-shirt.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { designShirt, pickSlogan, shirtRigSvg, sloganLines, titleSeed } from "./stickman-shirt";
import { buildStickmanVideoHtml } from "./stickman-video";

describe("stickman shirt", () => {
  it("wears the same colour for the same title", () => {
    assert.deepEqual(designShirt("Laid Off Blues", "x"), designShirt("Laid Off Blues", "x"));
    assert.equal(titleSeed("a"), titleSeed("a"));
  });
  it("prefers a short 2-5 word line and cuts long ones to five words", () => {
    assert.equal(pickSlogan(["Me checking my inbox for the 40th time today", "Still waiting on a reply"]), "Still waiting on a reply");
    assert.equal(pickSlogan(["one two three four five six seven"]), "one two three four five");
  });
  it("splits the slogan over at most two lines, in caps", () => {
    const lines = sloganLines("still waiting on a reply");
    assert.ok(lines.length <= 2 && lines.every((l) => l === l.toUpperCase()));
  });
  it("escapes the print and only takes https pictures", () => {
    const svg = shirtRigSvg(designShirt("t", `<b>"hi"</b>`, "http://x/y.gif"));
    assert.ok(!svg.includes("<b>") && !svg.includes("<image"));
    assert.ok(shirtRigSvg(designShirt("t", "hi", "https://x.test/y.gif")).includes("<image"));
  });
  it("puts the tee on the video's Joe in place of the tie", () => {
    const base = { title: "T", episodeLabel: "E", lyrics: "I lost my job today", audioFile: "song.mp3", durationSec: 30 };
    const tee = buildStickmanVideoHtml({ ...base, shirt: designShirt("T", "Still waiting on a reply") });
    assert.ok(tee.includes(">STILL") && tee.includes('<g class="sm-tie">'));
    assert.ok(buildStickmanVideoHtml(base).includes("sm-tie\" pathLength"));
  });
});
