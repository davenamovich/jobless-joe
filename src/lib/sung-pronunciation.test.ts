// Run: npx tsx --test src/lib/sung-pronunciation.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { numberWords, singableLine, singableLyrics } from "./sung-pronunciation";

describe("numberWords", () => {
  it("says numbers the way a person sings them", () => {
    assert.equal(numberWords(0), "zero");
    assert.equal(numberWords(15), "fifteen");
    assert.equal(numberWords(42), "forty-two");
    assert.equal(numberWords(401), "four hundred one");
    assert.equal(numberWords(10_000), "ten thousand");
    assert.equal(numberWords(2_500_300), "two million five hundred thousand three hundred");
  });
});

describe("singableLine", () => {
  const cases: Array<[string, string]> = [
    ["I applied to 400 jobs", "I applied to four hundred jobs"],
    ["Fifteen years, 10,000 emails", "Fifteen years, ten thousand emails"],
    ["They offered $50k and a mug", "They offered fifty thousand dollars and a mug"],
    ["Coffee's $1.50 now", "Coffee's one dollar fifty now"],
    ["It pays $1 an hour", "It pays one dollar an hour"],
    ["Up at 9:30 for a 5:00 call", "Up at nine thirty for a five o'clock call"],
    ["The interview's at 7:05pm", "The interview's at seven oh five P.M."],
    ["Out the door by 6am", "Out the door by six A.M."],
    ["My 401(k) is a 401k of tears", "My four-oh-one-k is a four-oh-one-k of tears"],
    ["Working 24/7, 9-to-5, 9 to 5", "Working twenty-four seven, nine to five, nine to five"],
    ["100% unpaid", "one hundred percent unpaid"],
    ["My 3rd rejection on the 21st", "My third rejection on the twenty-first"],
    ["Back in 1999 and in 2025", "Back in nineteen ninety-nine and in twenty twenty-five"],
    ["Since 2008 I've been free", "Since two thousand eight I've been free"],
    ["I sent my résumé to the moon", "I sent my rez-uh-may to the moon"],
    ["Résumés & cover letters", "Rez-uh-mays and cover letters"],
    ["The AI took my job. HR said OK.", "The A.I. took my job. H.R. said okay."],
    ["Ask the CEO about my CV", "Ask the C.E.O. about my C.V."],
    ["Me vs. the ATS", "Me versus the A.T.S."],
    ["Posting on LinkedIn w/ no replies", "Posting on Linked In with no replies"],
  ];
  for (const [input, sung] of cases) {
    it(`"${input}"`, () => assert.equal(singableLine(input), sung));
  }

  it("leaves ordinary words alone", () => {
    const line = "It is what it is, said the boss at the laundromat";
    assert.equal(singableLine(line), line);
  });
  it("doesn't spell out words in a shouted all-caps line", () => {
    assert.equal(singableLine("I LOVE IT"), "I LOVE IT");
  });
});

describe("singableLyrics", () => {
  const lyrics = "[VERSE 1]\nI sent 400 résumés\n\n[OUTRO]\nThe AI got the job";
  it("rewrites sung lines, keeps section tags and blank lines", () => {
    assert.equal(singableLyrics(lyrics), "[VERSE 1]\nI sent four hundred rez-uh-mays\n\n[OUTRO]\nThe A.I. got the job");
  });
  it("doesn't touch tags that look like words", () => {
    assert.equal(singableLyrics("[CHORUS - duet, both voices]\nOK"), "[CHORUS - duet, both voices]\nokay");
  });
  it("leaves other languages unchanged", () => {
    assert.equal(singableLyrics(lyrics, "es"), lyrics);
  });
});
