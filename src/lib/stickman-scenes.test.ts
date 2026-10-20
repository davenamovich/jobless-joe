// Run: npx tsx --test src/lib/stickman-scenes.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SCENE_ITEMS,
  SCENE_SETS,
  buildScenePrompt,
  keywordScenes,
  mergeLlmScenes,
  parseSongLines,
  planTimeline,
  signLabel,
} from "./stickman-scenes";
import { SET_SVG, itemSvg } from "./stickman-sets";
import { buildRigData } from "./stickman-rig";

const SONG = `[INTRO]
Interview froze by the change machine,
Dryer Four flashed "OUT OF ORDER" on screen.

[VERSE 1]
I sent my resume to the moon last night,
She said the job is unpaid but the hours are tight.

[CHORUS]
Entry level, senior-level years,
Fifteen years for software launched in June!

[OUTRO]
At five, I send a six-hour consulting invoice.
They hired me to fix the ad, my first requirement: common sense.`;

describe("parseSongLines", () => {
  it("splits sections and lines and marks the last OUTRO line as the punchline", () => {
    const lines = parseSongLines(SONG);
    assert.equal(lines.length, 8);
    assert.deepEqual([...new Set(lines.map((l) => l.section))], ["INTRO", "VERSE 1", "CHORUS", "OUTRO"]);
    assert.deepEqual(lines.map((l) => l.sectionIndex), [0, 0, 1, 1, 2, 2, 3, 3]);
    assert.deepEqual(lines.map((l) => l.punch), [false, false, false, false, false, false, false, true]);
  });

  it("falls back to the last sung line when there's no OUTRO, and to nothing on empty lyrics", () => {
    const lines = parseSongLines("[VERSE]\nOne line\n[CHORUS]\nLast line");
    assert.equal(lines.findIndex((l) => l.punch), 1);
    assert.deepEqual(parseSongLines(""), []);
    assert.equal(parseSongLines("no tags at all").at(0)?.section, "");
  });

  it("uses the last line of the last OUTRO even if a tag-less tail follows nothing", () => {
    const lines = parseSongLines("[OUTRO]\nfirst outro\nsecond outro\n[OUTRO]\nreal punch");
    assert.equal(lines.find((l) => l.punch)?.text, "real punch");
  });
});

describe("keywordScenes", () => {
  const scenes = keywordScenes(SONG);

  it("gives every sung line a scene with a valid set", () => {
    assert.equal(scenes.length, 8);
    for (const s of scenes) assert.ok((SCENE_SETS as readonly string[]).includes(s.set), s.set);
    for (const s of scenes) if (s.item) assert.ok((SCENE_ITEMS as readonly string[]).includes(s.item), s.item);
  });

  it("acts out the line: résumé to the moon is a throw at a night sky", () => {
    const moon = scenes[2];
    assert.equal(moon.set, "night");
    assert.equal(moon.item, "papers");
    assert.equal(moon.pose, "throw");
  });

  it("puts the opening in the laundromat and keeps the place until the lyric moves", () => {
    assert.equal(scenes[0].set, "laundromat");
    assert.equal(scenes[1].set, "laundromat");
    assert.equal(scenes[1].item, "washer");
    assert.equal(scenes[1].label, "OUT OF ORDER", "the quoted sign is taped to the dryer");
  });

  it("stages specific gags: unpaid sign, chorus back on stage, invoice", () => {
    assert.equal(scenes[3].item, "sign");
    assert.equal(scenes[3].label, "UNPAID");
    assert.equal(scenes[4].set, "stage");
    assert.equal(scenes[5].label, "15 YRS EXP");
    assert.equal(scenes[6].item, "invoice");
    assert.equal(scenes[6].pose, "present");
  });

  it("keeps the punchline last and lands it with a grin (smug, or happy when he's hired)", () => {
    const last = scenes[scenes.length - 1];
    assert.equal(last.punch, true);
    assert.equal(scenes.filter((s) => s.punch).length, 1);
    assert.equal(last.expression, "happy");
    const dry = keywordScenes("[OUTRO]\nThe bot took my job and kept my stapler");
    assert.equal(dry[0].expression, "smug");
  });

  it("never leaves a floor prop where a big item stands", () => {
    const s = keywordScenes("[VERSE]\nI typed my application on the laptop by the washer");
    assert.equal(s[0].item, "washer");
    assert.equal(s[0].prop, undefined);
  });
});

describe("signLabel", () => {
  it("trims labels to 24 characters at a word boundary, and wraps long signs on two lines", async () => {
    const { cleanLabel } = await import("./stickman-scenes");
    const { signLines } = await import("./stickman-sets");
    assert.equal(cleanLabel("fifteen years of common sense, please"), "FIFTEEN YEARS OF COMMON");
    assert.equal(cleanLabel("  no <tags>, hired! "), "NO TAGS HIRED!");
    assert.equal(cleanLabel(""), undefined);
    assert.deepEqual(signLines("UNPAID"), ["UNPAID"]);
    assert.deepEqual(signLines("15 YEARS COMMON SENSE"), ["15 YEARS", "COMMON SENSE"]);
  });

  it("prefers a caps phrase, then N years", () => {
    assert.equal(signLabel('my badge said "JOB SEEKER" today'), "JOB SEEKER");
    assert.equal(signLabel("they want twenty years of it"), "20 YRS EXP");
    assert.equal(signLabel("AI said I was fine"), undefined, "AI / I alone aren't a sign");
  });
});

describe("LLM storyboard", () => {
  const fallback = keywordScenes(SONG);

  it("prompts with numbered lines, section tags and the punchline marked", () => {
    const p = buildScenePrompt(parseSongLines(SONG), "Qualified in 2039");
    assert.match(p, /^Song: Qualified in 2039/);
    assert.match(p, /\[VERSE 1\]\n3\. I sent my resume to the moon last night,/);
    assert.match(p, /8\. They hired me .*← PUNCHLINE$/);
  });

  it("takes valid fields from the model and keeps keyword choices for the rest", () => {
    const reply =
      "Sure! ```json\n" +
      JSON.stringify({
        scenes: [
          { n: 1, pose: "point", face: "shocked", prop: "", set: "laundromat", item: "washer", label: "" },
          { n: 2, pose: "moonwalk", face: "smug", set: "narnia", item: "sign", label: "out of order!!" },
          { n: 8, pose: "celebrate", face: "happy", prop: "none", set: "office", item: "sign", label: "Common Sense" },
        ],
      }) +
      "\n```";
    const { scenes, used } = mergeLlmScenes(fallback, reply);
    assert.equal(used, 2, "line 2 had neither a valid pose nor a valid set");
    assert.equal(scenes[0].pose, "point");
    assert.equal(scenes[0].expression, "shocked");
    assert.equal(scenes[0].item, "washer");
    assert.equal(scenes[0].label, undefined);
    assert.deepEqual(scenes[1], fallback[1]);
    assert.equal(scenes[7].set, "office");
    assert.equal(scenes[7].label, "COMMON SENSE");
    assert.equal(scenes[7].punch, true, "the punchline flag survives the merge");
    assert.equal(scenes[7].text, fallback[7].text, "the lyric itself is never rewritten");
    assert.deepEqual(scenes[3], fallback[3], "lines the model skipped keep their keyword scene");
  });

  it("caps signs at three (the punchline doesn't count), in both storyboards", () => {
    const lyrics = "[VERSE]\n" + Array.from({ length: 7 }, (_, i) => `They want ${i + 2} years of it`).join("\n") + "\n[OUTRO]\nTwenty years of common sense";
    const kw = keywordScenes(lyrics);
    assert.equal(kw.filter((s) => s.item === "sign" && !s.punch).length, 3);
    const reply = JSON.stringify({ scenes: kw.map((_, i) => ({ n: i + 1, pose: "point", set: "stage", item: "sign", label: `SIGN ${i}` })) });
    const { scenes } = mergeLlmScenes(kw, reply);
    assert.equal(scenes.filter((s) => s.item === "sign" && !s.punch).length, 3);
    assert.equal(scenes[scenes.length - 1].item, "sign");
    assert.equal(scenes[scenes.length - 1].label, "SIGN 7");
  });

  it("survives junk", () => {
    assert.equal(mergeLlmScenes(fallback, "no idea, sorry").used, 0);
    assert.equal(mergeLlmScenes(fallback, "{broken").used, 0);
    assert.deepEqual(mergeLlmScenes(fallback, "").scenes, fallback);
  });

  it("accepts a bare array without n", () => {
    const { scenes, used } = mergeLlmScenes(fallback, JSON.stringify([{ pose: "wave", set: "home" }]));
    assert.equal(used, 1);
    assert.equal(scenes[0].pose, "wave");
    assert.equal(scenes[0].set, "home");
  });
});

describe("planTimeline", () => {
  const scenes = keywordScenes(SONG);

  it("covers the whole track in order, starting after an intro", () => {
    const t = planTimeline(scenes, 60);
    assert.equal(t.length, scenes.length);
    assert.ok(t[0].start >= 1 && t[0].start <= 4, String(t[0].start));
    for (let i = 1; i < t.length; i++) {
      assert.ok(t[i].start > t[i - 1].start, `scene ${i} starts after scene ${i - 1}`);
      assert.equal(t[i - 1].end, t[i].start, "no gaps or overlaps");
    }
    assert.equal(t[t.length - 1].end, 60, "the punchline holds to the end");
    for (const s of t) assert.ok(Math.abs(s.at - s.start / 60) < 1e-4);
  });

  it("gives longer lines more time and the punchline a long hold", () => {
    const t = planTimeline(
      [
        { text: "Short line here", section: "VERSE" },
        { text: "A much much longer line that goes on and on and on for ages", section: "VERSE" },
        { text: "Punch", section: "OUTRO", punch: true },
      ],
      30,
    );
    const len = (i: number) => t[i].end - t[i].start;
    assert.ok(len(1) > len(0) * 2, `${len(1)} vs ${len(0)}`);
    assert.ok(len(2) >= 4, `punchline on screen ${len(2)}s`);
  });

  it("keeps the punchline at least minPunch even when lines are crammed in", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ text: "word ".repeat(12), section: i < 39 ? "VERSE" : "OUTRO", punch: i === 39 }));
    const t = planTimeline(many, 60);
    assert.ok(60 - t[39].start >= 4 - 1e-9, String(60 - t[39].start));
  });

  it("scales with the rendered length (60s floor or longer)", () => {
    const a = planTimeline(scenes, 60);
    const b = planTimeline(scenes, 120);
    assert.equal(b[b.length - 1].end, 120);
    assert.ok(b[3].start > a[3].start);
    assert.ok(Math.abs(b[3].at - a[3].at) < 0.05, "fractions stay close: same song, different length");
  });

  it("handles empty and bad durations", () => {
    assert.deepEqual(planTimeline([], 60), []);
    const t = planTimeline([{ text: "only line", punch: true }], NaN);
    assert.equal(t[0].end, 60);
    assert.ok(t[0].start < 5);
  });
});

describe("sets, items and rig data", () => {
  it("draws every set and item, escaping labels", () => {
    for (const set of SCENE_SETS) assert.equal(typeof SET_SVG[set], "string");
    for (const item of SCENE_ITEMS) assert.match(itemSvg(item, 388, 178, "A<B"), /<(rect|path|g|circle)/, item);
    assert.match(itemSvg("sign", 388, 178, "A<B"), /A&lt;B/);
    assert.doesNotMatch(itemSvg("sign", 388, 178, "A<B"), /A<B/);
  });

  it("ships scenes to the rig: starts, sets, items, punchline, Joe moved aside for an item", () => {
    const scenes = keywordScenes(SONG);
    const t = planTimeline(scenes, 60);
    const data = buildRigData(scenes, { starts: t.map((x) => x.at) });
    assert.deepEqual(data.beats.map((b) => b.at), t.map((x) => x.at));
    assert.equal(data.beats[2].set, "night");
    assert.ok(data.sets.night && data.sets.laundromat, "only the sets in use, each once");
    assert.equal(data.sets.office, undefined);
    assert.equal(data.beats[2].cx, 178, "Joe steps left for the flying pages");
    assert.match(data.beats[2].item!.svg, /sm-fly/);
    assert.equal(data.beats[data.beats.length - 1].punch, true);
    assert.equal(data.beats.filter((b) => b.punch).length, 1);
  });

  it("leaves the song page (plain beats) as it was", () => {
    const data = buildRigData([{ text: "my dog and me", pose: "stand", expression: "happy", prop: "dog" }]);
    assert.equal(data.beats[0].cx, 200);
    assert.equal(data.beats[0].set, undefined);
    assert.deepEqual(data.sets, {});
  });
});
