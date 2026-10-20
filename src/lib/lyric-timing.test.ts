// Run: npx tsx --test src/lib/lyric-timing.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { alignLinesToWords, lineSimilarity, lineStartFractions, parseLineStarts, tokenize } from "./lyric-timing";
import type { TranscriptWord } from "./transcribe";

/** Words heard one after another, `gap` seconds apart, starting at `from`. */
function heard(text: string, from: number, gap = 0.4): TranscriptWord[] {
  return text.split(/\s+/).filter(Boolean).map((word, i) => ({ word, start: from + i * gap, end: from + i * gap + gap * 0.8 }));
}

describe("tokenize", () => {
  it("drops case, punctuation, accents and apostrophes", () => {
    assert.deepEqual(tokenize("I'm Café-ready, Joe!"), ["im", "cafe", "ready", "joe"]);
  });
  it("splits unspaced scripts into characters", () => {
    assert.deepEqual(tokenize("仕事がない"), ["仕", "事", "が", "な", "い"]);
  });
  it("keeps Hangul syllables whole", () => {
    assert.deepEqual(tokenize("일자리 없어"), ["일자리", "없어"]);
  });
});

describe("lineSimilarity", () => {
  it("is 1 for the same words and high for a near-miss", () => {
    assert.equal(lineSimilarity(["lost", "my", "job"], ["lost", "my", "job"]), 1);
    assert.ok(lineSimilarity(["gonna", "lose", "it"], ["gona", "lose", "it"]) > 0.85);
    assert.ok(lineSimilarity(["lost", "my", "job"], ["the", "weather", "today"]) < 0.3);
  });
});

describe("alignLinesToWords", () => {
  it("finds each line, including after an instrumental intro", () => {
    const words = [...heard("I lost my job today", 12), ...heard("to a robot in a tie", 15)];
    const starts = alignLinesToWords(["I lost my job today", "To a robot in a tie"], words);
    assert.deepEqual(starts, [12, 15]);
  });

  it("still matches a misheard word", () => {
    const words = heard("my resume went to the void", 5);
    assert.deepEqual(alignLinesToWords(["My résumé went into the void"], words), [5]);
  });

  it("maps a repeated chorus to each occurrence in turn", () => {
    const chorus = "no job no problem";
    const words = [...heard(chorus, 10), ...heard("verse words in the middle here", 13), ...heard(chorus, 20)];
    const starts = alignLinesToWords([chorus, "verse words in the middle here", chorus], words);
    assert.deepEqual(starts, [10, 13, 20]);
  });

  it("leaves a line Whisper missed as null and keeps going", () => {
    const words = [...heard("first line is here", 2), ...heard("third line is here", 8)];
    const starts = alignLinesToWords(["first line is here", "completely different sentence entirely", "third line is here"], words);
    assert.equal(starts[0], 2);
    assert.equal(starts[1], null);
    assert.equal(starts[2], 8);
  });
});

describe("lineStartFractions", () => {
  it("fills gaps between matched lines and returns increasing fractions", () => {
    const words = [...heard("first line is here", 10), ...heard("third line is here", 30)];
    const f = lineStartFractions(["first line is here", "zzz qqq xxx yyy", "third line is here"], words, 100)!;
    assert.equal(f[0], 0.1);
    assert.ok(f[1] > 0.1 && f[1] < 0.3, `middle line slotted between, got ${f[1]}`);
    assert.equal(f[2], 0.3);
  });

  it("steps back for lines before the first match and forward after the last", () => {
    const words = [...heard("two two two two", 20), ...heard("three three three three", 24)];
    const f = lineStartFractions(["one one one one", "two two two two", "three three three three", "four four four four"], words, 60)!;
    assert.ok(f[0] < f[1] && f[0] >= 0);
    assert.ok(f[3] > f[2] && f[3] <= 0.98);
  });

  it("is null when too few lines match", () => {
    const words = heard("nothing like the lyrics at all", 0);
    assert.equal(lineStartFractions(["I lost my job", "to a robot", "in a tie", "on a monday"], words, 60), null);
  });

  it("is null without lines or a duration", () => {
    assert.equal(lineStartFractions([], heard("a b", 0), 60), null);
    assert.equal(lineStartFractions(["a b"], heard("a b", 0), 0), null);
  });
});

describe("parseLineStarts", () => {
  it("accepts a fitting array", () => {
    assert.deepEqual(parseLineStarts("[0.1,0.5]", 2), [0.1, 0.5]);
  });
  it("rejects a mismatch, junk or empty", () => {
    assert.equal(parseLineStarts("[0.1,0.5]", 3), null);
    assert.equal(parseLineStarts("[0.1,2]", 2), null);
    assert.equal(parseLineStarts("nope", 1), null);
    assert.equal(parseLineStarts("", 1), null);
  });
});
