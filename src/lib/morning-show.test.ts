import { test } from "node:test";
import assert from "node:assert/strict";
import { clampCount, monologuePrompt, parseMonologue, parseRedditTop, rankPosts, type MorningPost } from "./morning-show";

test("parseRedditTop skips NSFW and pinned posts", () => {
  const posts = parseRedditTop(
    {
      data: {
        children: [
          { data: { title: "Got ghosted after 6 rounds", score: 900, num_comments: 80, permalink: "/r/recruitinghell/x", subreddit: "recruitinghell" } },
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
  assert.deepEqual(top, ["Big reddit post", "Top HN story", "Small reddit post"]);
});

test("clampCount keeps 3-10", () => {
  assert.equal(clampCount(1), 3);
  assert.equal(clampCount("7"), 7);
  assert.equal(clampCount(50), 10);
  assert.equal(clampCount("x"), 5);
});

test("monologue prompt lists the posts; parse reads JSON or plain text", () => {
  assert.match(monologuePrompt([{ title: "A", source: "r/jobs", score: 3 }]), /1\. \[r\/jobs, 3 upvotes\] A/);
  assert.deepEqual(parseMonologue('```json\n{"title":"T","script":"Good morning."}\n```'), { title: "T", script: "Good morning." });
  const plain = "Good morning, unemployed America. ".repeat(4);
  assert.equal(parseMonologue(plain)?.script, plain.trim());
  assert.equal(parseMonologue("nope"), null);
});
