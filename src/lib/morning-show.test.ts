import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clampCount,
  monologuePrompt,
  morningShowYouTube,
  parseMonologue,
  parseRedditTop,
  parseSuggestions,
  rankPosts,
  type MorningPost,
} from "./morning-show";

test("parseRedditTop skips NSFW and pinned posts", () => {
  const posts = parseRedditTop(
    {
      data: {
        children: [
          {
            data: {
              title: "Got ghosted after 6 rounds",
              score: 900,
              num_comments: 80,
              permalink: "/r/recruitinghell/x",
              subreddit: "recruitinghell",
            },
          },
          { data: { title: "Weekly thread", score: 5, stickied: true } },
          { data: { title: "nope", score: 50, over_18: true } },
        ],
      },
    },
    "recruitinghell",
  );
  assert.equal(posts.length, 1);
  assert.equal(posts[0].source, "r/recruitinghell");
  assert.equal(posts[0].url, "https://www.reddit.com/r/recruitinghell/x");
});

test("rankPosts weighs each source fairly, dedupes and drops somber posts", () => {
  const posts: MorningPost[] = [
    { title: "Big reddit post", source: "r/jobs", score: 20000 },
    { title: "Small reddit post", source: "r/jobs", score: 2000 },
    { title: "Top HN story", source: "Hacker News", score: 500 },
    { title: "top hn story", source: "Hacker News", score: 400 },
    { title: "Shooting at office", source: "Hacker News", score: 450 },
  ];
  const top = rankPosts(posts, 3).map((p) => p.title);
  assert.deepEqual(top, [
    "Big reddit post",
    "Top HN story",
    "Small reddit post",
  ]);
});

test("clampCount keeps 3-10", () => {
  assert.equal(clampCount(1), 3);
  assert.equal(clampCount("7"), 7);
  assert.equal(clampCount(50), 10);
  assert.equal(clampCount("x"), 5);
});

test("monologue prompt lists the posts; parse reads JSON or plain text", () => {
  assert.match(
    monologuePrompt([{ title: "A", source: "r/jobs", score: 3 }]),
    /1\. \[r\/jobs, 3 upvotes\] A/,
  );
  const fenced = parseMonologue(
    '```json\n{"title":"T","script":"Good morning."}\n```',
  );
  assert.equal(fenced?.title, "T");
  assert.equal(fenced?.script, "Good morning.");
  const plain = "Good morning, unemployed America. ".repeat(4);
  assert.equal(parseMonologue(plain)?.script, plain.trim());
  assert.equal(parseMonologue("nope"), null);
});

test("parseSuggestions keeps real multi-word searches", () => {
  assert.deepEqual(
    parseSuggestions([
      "how to get a job",
      ["How to get a job with no experience", "jobs", 4],
    ]),
    ["how to get a job with no experience"],
  );
  assert.deepEqual(parseSuggestions({}), []);
});

test("monologue prompt carries the live search questions", () => {
  const p = monologuePrompt(
    [{ title: "A", source: "r/jobs", score: 3 }],
    ["how to get past ats"],
  );
  assert.match(p, /Real searches people are typing/);
  assert.match(p, /- how to get past ats/);
});

test("parseMonologue reads questions and SEO; YouTube copy is search-led", () => {
  const draft = parseMonologue(
    JSON.stringify({
      script: "Good morning.",
      questions: ["how to get past ats", "will ai replace recruiters"],
      title: "How to Get Past ATS | Jobless Joe",
      hook: "How to get past the ATS, with Joe.",
      summary: "Joe answers job search questions.",
      tags: ["job search tips"],
      hashtags: ["JoblessJoe", "JobSearch", "AI"],
    }),
  )!;
  assert.deepEqual(draft.questions, [
    "how to get past ats",
    "will ai replace recruiters",
  ]);
  const yt = morningShowYouTube(draft, { fallbackTitle: "Joe's Morning Show" });
  assert.equal(yt.title, "How to Get Past ATS | Jobless Joe");
  assert.ok(yt.tags.includes("how to get past ats"));
  assert.match(yt.description, /^How to get past the ATS/);
  assert.match(yt.description, /• Will ai replace recruiters\?/);
  assert.match(yt.description, /#Shorts/);
});
