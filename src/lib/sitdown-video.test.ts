// Run: npx tsx --test src/lib/sitdown-video.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildSitdownVideoHtml, estimateSpeechSec, parseSitdownScript, SITDOWN_END_MS } from "./sitdown-video";
import { joinClips, joinTurns, pcmToWav, turnsOf, wavPcm } from "./sitdown-voice";

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

describe("streamed WAV (Fish Audio)", () => {
  it("reads PCM even when the data size is a placeholder", () => {
    const fmt = { numChannels: 1, sampleRate: 44100, byteRate: 88200, blockAlign: 2, bitsPerSample: 16 };
    const wav = pcmToWav(Buffer.alloc(8820, 1), fmt);
    assert.equal(wavPcm(wav).data.length, 8820);
    for (const placeholder of [0, 0xffffffff]) {
      const streamed = Buffer.from(wav);
      streamed.writeUInt32LE(placeholder, 40);
      const out = wavPcm(streamed);
      assert.equal(out.data.length, 8820, `data size ${placeholder}`);
      assert.equal(out.fmt.sampleRate, 44100);
    }
  });
});

it("turnsOf groups one speaker's consecutive lines so Fish voices them in one call", () => {
  const line = (speaker: "joe" | "guest", text: string) => ({ speaker, text }) as Parameters<typeof turnsOf>[0][number];
  const turns = turnsOf([line("joe", "Hi."), line("joe", "Coffee."), line("guest", "Hey."), line("joe", "Bye.")]);
  assert.deepEqual(
    turns.map((t) => t.map((l) => l.text)),
    [["Hi.", "Coffee."], ["Hey."], ["Bye."]],
  );
  // A long monologue splits at line boundaries.
  assert.equal(turnsOf([line("joe", "a".repeat(10)), line("joe", "b".repeat(10))], 15).length, 2);
});

it("joinTurns spreads caption starts across a turn by length", () => {
  const fmt = { numChannels: 1, sampleRate: 1000, byteRate: 2000, blockAlign: 2, bitsPerSample: 16 };
  const out = joinTurns(
    [
      { pcm: Buffer.alloc(4000), lines: ["aaa", "aaa"] },
      { pcm: Buffer.alloc(2000), lines: ["b"] },
    ],
    fmt,
  );
  assert.deepEqual(out.startsMs, [0, 1000, 2350]);
});

describe("expression tags", () => {
  it("voices tags but hides them from captions", () => {
    const { lines, guest } = parseSitdownScript(
      "[excited] Good morning! (laughs) <whisper>Rent is due.</whisper>\n[deadpan] SARAH: [sigh] 401 jobs.",
    );
    assert.equal(guest, "Sarah");
    assert.equal(lines[0].text, "Good morning! Rent is due.");
    assert.match(lines[0].spoken, /^\[excited\] Good morning! \[laughs\] <whisper>Rent is due\.<\/whisper>$/);
    assert.equal(lines[1].speaker, "guest");
    assert.equal(lines[1].text, "401 jobs.");
    assert.equal(lines[1].spoken, "[deadpan] [sigh] 401 jobs.");
  });

  it("drops lines that are only tags", () => {
    assert.equal(parseSitdownScript("[pause]\nHi.").lines.length, 1);
  });
});
