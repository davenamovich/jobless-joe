// Run: npx tsx --test src/lib/freshness.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEVICES, SETTINGS, digestSong, freshnessBlock, pickAngle } from "./freshness";
import { cleanSignals, fallbackIdeas, parseGoogleTrendsRss, parseIdeas } from "./trending";
import { pickUnusedTrend } from "./autopilot";
import { buildSystemPrompt, buildUserPrompt, EMPTY_STORY_BIBLE } from "./joe-prompts";

const LYRICS = `[INTRO]
Telegram offered me a career—no punctuation.

[VERSE 1]
A stranger said, "Promote this blender, Joe."

[CHORUS]
Affiliate, sweetheart, I finally found a lane.
No boss—just a tracking code and name.

[OUTRO]
I'm not chasing a career, darling—I'm clicking "reply."`;

describe("freshness", () => {
  it("digestSong pulls opener, chorus hook and punchline", () => {
    const d = digestSong({ episodeTitle: "Telegram Sent Me a Career", lyrics: LYRICS, closingLine: "" }, " blenders ");
    assert.deepEqual(d, {
      title: "Telegram Sent Me a Career",
      topic: "blenders",
      opener: "Telegram offered me a career—no punctuation.",
      hook: "Affiliate, sweetheart, I finally found a lane.",
      punchline: `I'm not chasing a career, darling—I'm clicking "reply."`,
    });
    assert.equal(digestSong({}), null);
  });

  it("pickAngle stays in range, even at the edges", () => {
    assert.deepEqual(pickAngle(() => 0), { setting: SETTINGS[0], device: DEVICES[0] });
    const top = pickAngle(() => 0.9999999);
    assert.equal(top.setting, SETTINGS[SETTINGS.length - 1]);
    assert.equal(top.device, DEVICES[DEVICES.length - 1]);
  });

  it("every angle is literal: no parody formats or role-play", () => {
    for (const d of [...DEVICES, ...SETTINGS])
      assert.doesNotMatch(d, /forecast|weather|courtroom|lawyer|noir|priest|documentary|play-by-play|eulogy|lullaby|recipe|sentien|achieved/i, d);
    assert.match(freshnessBlock([], { setting: SETTINGS[0], device: DEVICES[0] }), /ONE place the whole song happens/);
  });

  it("freshnessBlock lists recent songs and only adds an angle for new songs", () => {
    const recent = [digestSong({ episodeTitle: "Telegram Sent Me a Career", lyrics: LYRICS })!];
    const withAngle = freshnessBlock(recent, { setting: "a laundromat at 2 a.m.", device: "a heist song" });
    assert.match(withAngle, /1\. "Telegram Sent Me a Career"/);
    assert.match(withAngle, /hook: "Affiliate, sweetheart/);
    assert.match(withAngle, /Setting: a laundromat at 2 a\.m\./);
    assert.doesNotMatch(freshnessBlock(recent, null), /FRESH ANGLE/);
    assert.match(freshnessBlock([], null), /No earlier songs yet/);
  });

  it("the prompts carry the freshness block and no longer seed the worn-out openers", () => {
    const user = buildUserPrompt({
      episodeKey: "joe-discovers-ai",
      episodeLabel: "Joe Discovers AI",
      duration: "60s",
      intensity: "ridiculous",
      target: "job-seekers",
      action: "generate",
      storyBible: EMPTY_STORY_BIBLE,
      freshness: "FRESHNESS (hard rule — test)",
    });
    assert.match(user, /FRESHNESS \(hard rule — test\)/);
    assert.doesNotMatch(buildSystemPrompt(), /Examples \(inspiration only/);
    assert.match(buildSystemPrompt(), /off-limits/);
  });
});

describe("trending", () => {
  const RSS = `<rss><channel>
    <item><title>grand theft auto vi</title><ht:approx_traffic>500+</ht:approx_traffic>
      <ht:news_item><ht:news_item_title>&apos;It gives me the ick&apos;: cheating with a game?</ht:news_item_title></ht:news_item></item>
    <item><title>storm victims</title><ht:news_item><ht:news_item_title>Hurricane kills 3</ht:news_item_title></ht:news_item></item>
  </channel></rss>`;

  it("parses Google Trends RSS and decodes entities", () => {
    const s = parseGoogleTrendsRss(RSS);
    assert.equal(s.length, 2);
    assert.deepEqual(s[0], {
      title: "grand theft auto vi",
      traffic: "500+",
      context: "'It gives me the ick': cheating with a game?",
      source: "google",
    });
  });

  it("drops somber headlines and duplicates", () => {
    const s = cleanSignals([...parseGoogleTrendsRss(RSS), { title: "Grand Theft Auto VI", source: "hn" }]);
    assert.deepEqual(s.map((x) => x.title), ["grand theft auto vi"]);
  });

  it("parseIdeas reads a fenced array and filters bad entries", () => {
    const raw = 'Sure!\n```json\n[{"label":"GTA VI","topic":"Joe lists GTA on his résumé","source":"google"},{"label":"x"},{"label":"Sad","topic":"a funeral song"}]\n```';
    assert.deepEqual(parseIdeas(raw), [{ label: "GTA VI", topic: "Joe lists GTA on his résumé", source: "google" }]);
    assert.deepEqual(parseIdeas("no json here"), []);
  });

  it("fallbackIdeas turns headlines into topics", () => {
    const [idea] = fallbackIdeas([{ title: "grand theft auto vi", source: "google" }]);
    assert.equal(idea.label, "grand theft auto vi");
    assert.match(idea.topic, /grand theft auto vi/);
  });

  it("pickUnusedTrend skips topics already sung", () => {
    const ideas = [
      { label: "A", topic: "Topic A", source: "google" as const },
      { label: "B", topic: "Topic B", source: "hn" as const },
    ];
    assert.equal(pickUnusedTrend(ideas, ["  topic a "])?.label, "B");
    assert.equal(pickUnusedTrend(ideas, ["Topic A", "Topic B"]), null);
  });
});
