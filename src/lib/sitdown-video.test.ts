// Run: npx tsx --test src/lib/sitdown-video.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildSitdownVideoHtml, estimateSpeechSec, parseSitdownScript, SITDOWN_END_MS } from "./sitdown-video";
import { joinClips } from "./sitdown-voice";

describe("sit-down script", () => {
  it("treats plain lines as Joe's monologue", () => {
    const s = parseSitdownScript("Good evening.\n\nMy fridge says otherwise!\nWho's hiring?");
    assert.equal(s.guest, null);
    assert.deepEqual(
      s.lines.map((l) => [l.speaker, l.gesture]),
      [["joe", "talk"], ["joe", "point"], ["joe", "shrug"]],
    );
  });

  it("puts a labelled guest on the couch and skips stage directions", () => {
    const s = parseSitdownScript("JOE: You applied to 400 jobs?\nsarah lee: 401. (laughs) One was a typo.\nAnd I'd do it again.\nHost: Folks!");
    assert.equal(s.guest, "Sarah Lee");
    assert.deepEqual(
      s.lines.map((l) => `${l.name}: ${l.text}`),
      ["Joe: You applied to 400 jobs?", "Sarah Lee: 401. One was a typo.", "Sarah Lee: And I'd do it again.", "Joe: Folks!"],
    );
    assert.equal(s.lines[1].gesture, "listen");
  });

  it("splits long paragraphs into caption-sized lines", () => {
    const long = Array.from({ length: 8 }, (_, i) => `This is sentence number ${i + 1} of the monologue.`).join(" ");
    const s = parseSitdownScript(long);
    assert.ok(s.lines.length > 1);
    assert.ok(s.lines.every((l) => l.text.length <= 120));
    assert.ok(estimateSpeechSec(s) >= 5);
  });
});

describe("sit-down page", () => {
  it("keeps the recorder contract and escapes the script", () => {
    const script = parseSitdownScript("JOE: </script><b>hi</b>\nBOB: Hello");
    const html = buildSitdownVideoHtml({ title: "Joe & Bob", script, audioFile: "talk.mp3", durationSec: 20, startsMs: [0, 4000] });
    assert.match(html, /window\.startShow = startShow/);
    assert.match(html, new RegExp(`recordDurationMs: durMs \\+ END_MS`));
    assert.match(html, new RegExp(`var END_MS = ${SITDOWN_END_MS}`));
    assert.match(html, /src="talk\.mp3"/);
    assert.match(html, /Joe sits down with Bob/);
    assert.match(html, /"starts":\[0,4000\]/);
    assert.ok(!html.includes("</script><b>"), "script text must not close the script tag");
    assert.match(html, /Joe &amp; Bob/);
  });

  it("drops start times that don't match the lines", () => {
    const script = parseSitdownScript("One.\nTwo.");
    const html = buildSitdownVideoHtml({ title: "x", script, audioFile: "a.wav", durationSec: 5, startsMs: [0] });
    assert.match(html, /"starts":null/);
  });
});

describe("voiced script", () => {
  it("joins clips with pauses and reports each line's start", () => {
    const fmt = { numChannels: 1, sampleRate: 1000, byteRate: 2000, blockAlign: 2, bitsPerSample: 16 };
    const out = joinClips([Buffer.alloc(2000), Buffer.alloc(4000)], fmt); // 1s, 2s
    assert.deepEqual(out.startsMs, [0, 1350]);
    assert.equal(out.durationSec, 3.7);
    assert.equal(out.wav.toString("ascii", 0, 4), "RIFF");
    assert.equal(out.wav.readUInt32LE(40), out.wav.length - 44);
  });
});
