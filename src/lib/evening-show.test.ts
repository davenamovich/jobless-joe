import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clampLetters, eveningShowPrompt, isAdviceQuestion, parseLetters, LETTER_TOPICS, madeUpLettersPrompt, pickSome } from "./evening-show";
import { digestShow, freshnessNote, itemKey } from "./show-history";

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

describe("new material every show", () => {
  it("digests a past show into its letters, opener and sign-off", () => {
    const d = digestShow({
      title: "Karen Sent Me a Policy PDF | Ask Joe",
      items: JSON.stringify(["My boss texts me at 2 a.m."]),
      script: "[warm] Good evening, it's Ask Joe.\nMy landlord raised the rent on my couch.\n\nDear Joe…\n[pause] Goodnight, and reply-all responsibly.",
    });
    assert.deepEqual(d.items, ["My boss texts me at 2 a.m."]);
    assert.equal(d.opener, "Good evening, it's Ask Joe. My landlord raised the rent on my couch.");
    assert.equal(d.signoff, "Goodnight, and reply-all responsibly.");
    assert.deepEqual(digestShow({ title: "x", items: "not json", script: "" }).items, []);
  });

  it("tells the writer what not to reuse, and nothing when there's no history", () => {
    assert.equal(freshnessNote([], "letters"), "");
    const note = freshnessNote(
      [{ title: "Ask Joe #1", items: ["Boss texts at 2 a.m."], opener: "Good evening", signoff: "Reply-all responsibly." }],
      "letters",
    );
    assert.match(note, /new material only/);
    assert.match(note, /letters: "Boss texts at 2 a\.m\."/);
    assert.match(note, /signed off: "Reply-all responsibly\."/);
  });

  it("made-up letters rotate topics and cast and avoid answered ones", () => {
    let seed = 0.1;
    const rand = () => (seed = (seed * 9301 + 0.49297) % 1);
    const prompt = madeUpLettersPrompt(3, ["My boss texts me at 2 a.m."], rand);
    assert.equal((prompt.match(/^- /gm) ?? []).length, 3 + 1);
    assert.doesNotMatch(prompt, /at least one involves Karen/);
    assert.match(prompt, /already answered[\s\S]*My boss texts me at 2 a\.m\./);
    assert.equal(new Set(pickSome(LETTER_TOPICS, 5, rand)).size, 5);
  });

  it("matches a letter already answered regardless of case and punctuation", () => {
    assert.equal(itemKey("My boss texts me at 2 A.M.?!"), itemKey("my boss texts me at 2 a m"));
  });
});
