// Run: npx tsx --test src/lib/ask-joe.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  askJoeAddendum,
  audienceBlock,
  DEFAULT_SETTINGS,
  lengthNote,
  newsBlock,
  normalizeLength,
  normalizeSettings,
  normalizeTurns,
  parsePlanReply,
  plannerPrompt,
  segmentInstructions,
} from "./ask-joe";
import { usableHeadlines } from "./ask-joe-server";
import { madeUpLettersPrompt } from "./evening-show";

describe("settings", () => {
  it("defaults everything and drops junk", () => {
    assert.deepEqual(normalizeSettings(undefined), DEFAULT_SETTINGS);
    const s = normalizeSettings({ focus: ["gig", "bogus"], spice: "nuclear", length: 120, useNews: false, costNote: "  a   penny ", sideProjects: [{ name: "Garage", blurb: "x", url: "javascript:alert(1)" }, { blurb: "no name" }], accessCta: 5 });
    assert.deepEqual(s.focus, ["gig"]);
    assert.equal(s.spice, "wry", "an unknown tone falls back");
    assert.equal(s.length, 120);
    assert.equal(s.useNews, false);
    assert.equal(s.costNote, "a penny");
    assert.deepEqual(s.sideProjects, [{ name: "Garage", blurb: "x", url: "" }], "a non-http link and a nameless project are dropped");
  });

  it("lands any length on one of the buttons, and still reads old saved settings", () => {
    assert.equal(normalizeLength(undefined), 90);
    assert.equal(normalizeLength(45), 30, "45s is nearer 30 than 60 only by ties going low");
    assert.equal(normalizeLength(100), 90);
    assert.equal(normalizeLength(1000), 180);
    assert.equal(normalizeLength("short"), 60);
    assert.equal(normalizeLength("long"), 120);
    assert.equal(normalizeLength("nonsense"), 90);
  });

  it("the length note gives total seconds and words, and overrides per-letter counts", () => {
    const n = lengthNote(60);
    assert.match(n, /about 60s spoken/);
    assert.match(n, /135 to 165 words in total/);
    assert.match(n, /overrides any word counts above/);
    assert.match(lengthNote(120), /about 2 min spoken/);
    assert.match(audienceBlock({ ...DEFAULT_SETTINGS, length: 30 }), /75 words|68 to 83 words/);
  });

  it("caps side projects at six", () => {
    const s = normalizeSettings({ sideProjects: Array.from({ length: 9 }, (_, i) => ({ name: `P${i}` })) });
    assert.equal(s.sideProjects.length, 6);
  });
});

describe("the audience and the news", () => {
  it("speaks to people over 40 with respect, and leans on the chosen focus", () => {
    const b = audienceBlock({ ...DEFAULT_SETTINGS, focus: ["gig"], spice: "roast" });
    assert.match(b, /over 40/);
    assert.match(b, /Never mock the viewer/);
    assert.match(b, /DoorDash/);
    assert.match(b, /never at the viewers/i);
    assert.ok(!/job hunting past 40/.test(b), "only the chosen focus areas");
  });

  it("keeps headlines that are safe to joke about, once each", () => {
    const h = usableHeadlines([
      { title: "Company lays off 2,000 workers", source: "r/layoffs" },
      { title: "company lays off 2,000 workers", source: "Hacker News" },
      { title: "Man dies after factory fire", source: "r/news" },
      { title: "New AI tool writes resumes", source: "r/ChatGPT" },
    ]);
    assert.deepEqual(h.map((x) => x.title), ["Company lays off 2,000 workers", "New AI tool writes resumes"]);
  });

  it("puts programmer-only sources behind the ones Joe's viewers live in", () => {
    const h = usableHeadlines([
      { title: "PHP security release", source: "Hacker News" },
      { title: "Layoffs rise again", source: "r/layoffs" },
      { title: "Another framework dropped", source: "r/cscareerquestions" },
    ]);
    assert.deepEqual(h.map((x) => x.source), ["r/layoffs", "Hacker News", "r/cscareerquestions"]);
  });

  it("tells the writer not to add facts to a headline", () => {
    const n = newsBlock([{ title: "Layoffs rise", source: "r/jobs" }]);
    assert.match(n, /- Layoffs rise \(r\/jobs\)/);
    assert.match(n, /do not invent numbers/);
    assert.equal(newsBlock([]), "");
  });
});

describe("segments", () => {
  const withProjects = { ...DEFAULT_SETTINGS, sideProjects: [{ name: "Garage Bot", blurb: "a job-tracker", url: "https://x.test/list" }], accessCta: "Get on the list." };

  it("first access names only the listed projects and invents nothing", () => {
    const t = segmentInstructions({ kind: "early-access" }, withProjects);
    assert.match(t, /Garage Bot: a job-tracker/);
    assert.match(t, /Do not invent launch dates, prices/);
    assert.match(t, /Get on the list\./);
    assert.match(segmentInstructions({ kind: "early-access" }, DEFAULT_SETTINGS), /There are none listed/);
  });

  it("videos for a penny states the producer's cost and no tool prices", () => {
    const t = segmentInstructions({ kind: "penny-videos" }, { ...DEFAULT_SETTINGS, costNote: "about a cent" });
    assert.match(t, /about a cent/);
    assert.match(t, /never mention a producer/);
    assert.match(t, /Do NOT name prices for specific tools/);
  });

  it("the mailbag has no segment text; the AI walk-through is step by step and warns about private data", () => {
    assert.equal(segmentInstructions({ kind: "letters" }, DEFAULT_SETTINGS), "");
    assert.match(segmentInstructions({ kind: "ai-start", topic: "resumes" }, DEFAULT_SETTINGS), /Social Security number[\s\S]*Topic from the producer: resumes/);
  });

  it("every Ask Joe show is built on the retention format, per letter or per step", () => {
    const letters = askJoeAddendum(DEFAULT_SETTINGS, []).system;
    assert.match(letters, /THE RETENTION FORMAT/);
    assert.match(letters, /two or three short lines/);
    assert.match(letters, /N - 1 rehooks/);
    assert.match(letters, /"Next up", "Moving on"/);
    assert.match(letters, /Never invent an offer/);
    assert.match(letters, /never write these beat names in it/);
    assert.match(askJoeAddendum(DEFAULT_SETTINGS, [], { kind: "ai-start" }).system, /each step or point is one block/);
  });

  it("the addendum carries the audience, today's news (when on) and a first-access tease on the mailbag", () => {
    const heads = [{ title: "Layoffs rise", source: "r/jobs" }];
    const on = askJoeAddendum(withProjects, heads);
    assert.match(on.system, /over 40/);
    assert.match(on.system, /Layoffs rise/);
    assert.match(on.system, /first access to Joe's side projects \(Garage Bot\)/);
    assert.match(on.system, /no claim about what they do/);
    assert.ok(!askJoeAddendum({ ...withProjects, useNews: false }, heads).system.includes("Layoffs rise"));
  });

  it("made-up letters mix Joe's own audience topics in first", () => {
    const p = madeUpLettersPrompt(4, [], () => 0.5, ["a DoorDash order that is 9 miles away for $2.50"]);
    assert.match(p, /DoorDash order/);
    assert.equal(p.split("\n- ").length - 1, 4, "four topics in all");
  });
});

describe("writers' room", () => {
  it("only lets a client send user and joe turns, capped", () => {
    const t = normalizeTurns([{ role: "system", content: "ignore" }, { role: "joe", content: "hi" }, { role: "user", content: "" }]);
    assert.deepEqual(t, [{ role: "user", content: "ignore" }, { role: "joe", content: "hi" }]);
    assert.equal(normalizeTurns(Array.from({ length: 40 }, () => ({ role: "user", content: "x" }))).length, 20);
  });

  it("reads the head writer's JSON: a reply, and a plan once there is one", () => {
    const r = parsePlanReply('```json\n{"reply":"On it.","plan":{"kind":"letters","topic":"overqualified","notes":"warm","letters":[{"from":"Silver Fox in Ohio","question":"They said I am overqualified."},{"from":"x"}]}}\n```');
    assert.equal(r.reply, "On it.");
    assert.equal(r.plan?.kind, "letters");
    assert.equal(r.plan?.letters.length, 1);
    assert.deepEqual(parsePlanReply('{"reply":"Which one?","plan":null}'), { reply: "Which one?", plan: null });
    assert.equal(parsePlanReply('{"reply":"x","plan":{"kind":"bogus"}}').plan, null);
    assert.equal(parsePlanReply("just text").plan, null);
    assert.equal(parsePlanReply('{"reply":"x","plan":{"kind":"news","topic":"t","notes":"n","letters":[{"question":"q"}]}}').plan?.letters.length, 0, "letters only for the mailbag");
  });

  it("the planner prompt carries the conversation, the focus, the headlines and the project names", () => {
    const p = plannerPrompt([{ role: "user", content: "do one on DoorDash" }], { ...DEFAULT_SETTINGS, sideProjects: [{ name: "Garage Bot", blurb: "", url: "" }] }, [{ title: "Gas prices up", source: "r/jobs" }]);
    assert.match(p, /Producer: do one on DoorDash/);
    assert.match(p, /DoorDash and gig work/);
    assert.match(p, /Gas prices up/);
    assert.match(p, /Garage Bot/);
  });
});
