import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clampLetters, eveningShowPrompt, isAdviceQuestion, parseLetters } from "./evening-show";

describe("Evening Show", () => {
  it("keeps advice questions, drops news and heavy topics", () => {
    assert.ok(isAdviceQuestion("My manager wants me on call during PTO. What do I do?"));
    assert.ok(isAdviceQuestion("Should I tell HR my boss reads my Slack?"));
    assert.ok(!isAdviceQuestion("Company announces 10,000 layoffs"));
    assert.ok(!isAdviceQuestion("How do I handle harassment from my manager?"));
  });

  it("parses made-up letters", () => {
    const letters = parseLetters(
      '```json\n{"letters":[{"from":"Reply-All Victim in Tampa","question":"Karen in HR sent me a 40-page PDF when I asked where the stapler is."},{"from":"x"}]}\n```',
    );
    assert.equal(letters.length, 1);
    assert.equal(letters[0].source, "made up");
    assert.match(letters[0].question, /Karen in HR/);
  });

  it("tells the writer which letters are real posts to rewrite", () => {
    const p = eveningShowPrompt(
      [
        { from: "", question: "Is it normal to be asked to train my AI replacement?", source: "r/AskHR" },
        { from: "Stapler Hostage", question: "Karen took my stapler.", source: "made up" },
      ],
      ["how to deal with hr"],
    );
    assert.match(p, /1\. \(real post from r\/AskHR: rewrite it\)/);
    assert.match(p, /2\. \(made up\) From "Stapler Hostage":/);
    assert.match(p, /- how to deal with hr/);
  });

  it("clamps the letter count", () => {
    assert.equal(clampLetters(1), 2);
    assert.equal(clampLetters(9), 6);
    assert.equal(clampLetters("x"), 4);
  });
});
