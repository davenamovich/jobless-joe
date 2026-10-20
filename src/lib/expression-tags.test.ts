import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cleanTaggedReply, sameWords } from "./expression-tags";

describe("sameWords", () => {
  it("accepts a script with only tags added", () => {
    assert.ok(
      sameWords(
        "Good morning!\nSARAH: I applied to 400 jobs.",
        "[excited] Good morning! [laugh]\nSARAH: [sigh] I applied to <stress>400</stress> jobs.",
      ),
    );
  });
  it("rejects a script whose words changed", () => {
    assert.ok(!sameWords("Good morning!", "[excited] Good evening!"));
  });
  it("strips code fences", () => {
    assert.equal(cleanTaggedReply("```\n[laugh] Hi.\n```"), "[laugh] Hi.");
  });
});
