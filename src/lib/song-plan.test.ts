// Run: npx tsx --test src/lib/song-plan.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyLineFixes, buildPlanPrompt, buildSenseEditPrompt, flagSuspectLines, parseLineFixes, parseSongPlan, planBlock, syncQuotes, withPlan } from "./song-plan";
import type { SongOutput } from "./joe-prompts";

const PLAN_JSON = {
  retell: "Joe gets rejected by an AI screener for a cashier job, so he uses AI to build his own shop and hires the screener.",
  situation: "Joe applies to be a cashier at a grocery store that now uses an AI to screen applicants.",
  specifics: ["the job ad wants 5 years of self-checkout experience", "the rejection arrives in 4 seconds", "the bot signs off 'Best of luck!'"],
  beats: [
    { section: "[VERSE 1]", beat: "Joe applies; the AI rejects him in four seconds." },
    { section: "[CHORUS]", beat: "Rejected by a robot, the premise in plain words." },
    { section: "[OUTRO]", beat: "Joe builds his own online shop with AI and the screener now works for him." },
  ],
  chorusLine: "Rejected by a robot in four seconds flat",
  twist: "Joe asks an AI to build him an online shop",
  punchline: "Now that robot screens my customers, and it still can't say my name.",
};

describe("song plan", () => {
  it("parses a fenced plan and drops junk", () => {
    const plan = parseSongPlan("Sure!\n```json\n" + JSON.stringify(PLAN_JSON) + "\n```");
    assert.ok(plan);
    assert.equal(plan.beats.length, 3);
    assert.equal(plan.specifics.length, 3);
    assert.equal(parseSongPlan("not json"), null);
    assert.equal(parseSongPlan(JSON.stringify({ ...PLAN_JSON, punchline: "" })), null, "a plan with no ending is no plan");
    assert.equal(parseSongPlan(JSON.stringify({ ...PLAN_JSON, beats: [] })), null);
  });

  it("puts the plan before the songwriter's reminders", () => {
    const plan = parseSongPlan(JSON.stringify(PLAN_JSON))!;
    const user = "EPISODE REQUEST\n...\n\nREMEMBER\n========\n- Respond with JSON.";
    const out = withPlan(user, plan);
    assert.ok(out.indexOf("SONG PLAN") < out.indexOf("REMEMBER"));
    assert.ok(out.includes(plan.punchline));
    assert.equal(withPlan(user, null), user);
    assert.match(buildPlanPrompt(user), /Do not write lyrics yet/);
    assert.match(planBlock(plan), /\[VERSE 1\]: Joe applies/);
  });

  it("asks the editor to fix only broken lines against the plan", () => {
    const plan = parseSongPlan(JSON.stringify(PLAN_JSON))!;
    const p = buildSenseEditPrompt({ lyrics: "[VERSE 1]\nA line", plan });
    assert.match(p, /A line is BROKEN when/);
    assert.match(p, /\[VERSE 1\]\nA line/);
    assert.match(p, /The whole song in one sentence/);
    assert.match(buildSenseEditPrompt({ lyrics: "x", plan: null, premise: "Joe vs a bot" }), /Joe vs a bot/);
  });

  it("re-points the hook and clip at the edited lyrics", () => {
    const out = {
      lyrics: "[VERSE 1]\nI applied at nine\n\n[CHORUS]\nRejected by a robot\nFour seconds flat\n\n[OUTRO]\nNow it works for me",
      viralHook: "Rejected by a bot",
      socialClip: { section: "[CHORUS]", lyrics: "Rejected by a bot\nFour seconds flat" },
    } as SongOutput;
    const synced = syncQuotes(out);
    assert.equal(synced.viralHook, "Rejected by a robot");
    assert.equal(synced.socialClip?.lyrics, "Rejected by a robot\nFour seconds flat");
    const untouched = syncQuotes({ ...out, viralHook: "Four seconds flat" });
    assert.equal(untouched.viralHook, "Four seconds flat");
  });
});

describe("literal-sense editor", () => {
  const nonsense = `[VERSE 1]
The potluck is now court—my aunt bangs a spoon like a gavel.
I'm lawyer and defendant; The Team laid me off by email.
Order in the casserole—my paycheck has vanished.
[CHORUS]
Laid off by email, so I asked AI to write back.`;

  it("flags dash-glued, semicolon and 'is now' lines, not plain ones", () => {
    const flagged = flagSuspectLines(nonsense);
    assert.equal(flagged.length, 3);
    assert.ok(!flagged.some((l) => l.startsWith("Laid off by email")));
    assert.match(buildSenseEditPrompt({ lyrics: nonsense, plan: null }), /look suspicious[\s\S]*The potluck is now court/);
  });

  it("flags Joe talking about himself in the third person, and names the weather-report problem", () => {
    const weather = `[INTRO]
My layoff email said, "The Team has decided."
Joe's job is a weather emergency.
At my friend's food truck, I grabbed the chalk.

[CHORUS]
One salary cloud hides the pay.
I'm Jobless Joe and I'm still here.
Hey Joe, the rent is due.`;
    assert.deepEqual(flagSuspectLines(weather), ["Joe's job is a weather emergency."]);
    const prompt = buildSenseEditPrompt({ lyrics: weather, plan: null });
    assert.match(prompt, /nobody explained/);
    assert.match(prompt, /third person/);
    assert.match(prompt, /weather report/);
  });

  it("applies fixes line by line, ignoring case and punctuation", () => {
    const fixes = parseLineFixes(
      '```json\n{"fixes":[{"line":"the potluck is now court — my aunt bangs a spoon like a gavel","fix":"At the family potluck my aunt asks how the job is going."},{"line":"[CHORUS]","fix":"x"},{"line":"not in the song","fix":"y"}]}\n```',
    );
    const { lyrics, changed } = applyLineFixes(nonsense, fixes);
    assert.equal(changed, 1);
    assert.match(lyrics, /^\[VERSE 1\]\nAt the family potluck my aunt asks how the job is going\.\n/);
    assert.match(lyrics, /\[CHORUS\]/);
  });

  it("rejects a replacement far longer than the line", () => {
    const { changed } = applyLineFixes("[VERSE 1]\nShort line.", [{ line: "Short line.", fix: "x".repeat(80) }]);
    assert.equal(changed, 0);
  });
});
