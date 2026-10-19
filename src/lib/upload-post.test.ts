// Run: npx tsx --test src/lib/upload-post.test.ts
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  defaultFirstComment,
  describeResults,
  normalizeResults,
  parsePlatforms,
  postTitle,
  uploadVideo,
} from "./upload-post";
import { isDue, nextEpisode, nextTarget } from "./autopilot";
import { EPISODES, TARGETS } from "./joe-prompts";
import { POST_CALLBACK_PREFIX, postKeyboard } from "./telegram/commands/video";

describe("upload-post helpers", () => {
  it("parsePlatforms keeps known platforms, lowercased, deduped", () => {
    assert.deepEqual(parsePlatforms("TikTok, instagram  youtube,tiktok,myspace"), ["tiktok", "instagram", "youtube"]);
    assert.deepEqual(parsePlatforms(["X", "threads"]), ["x", "threads"]);
    assert.deepEqual(parsePlatforms(""), []);
  });

  it("postTitle stays within YouTube's 100 chars", () => {
    assert.equal(postTitle("Rejection Blues"), "Rejection Blues #joblessjoe #shorts");
    assert.equal(postTitle("x".repeat(150)).length, 100);
    assert.match(postTitle("  "), /^Jobless Joe/);
  });

  it("normalizeResults handles the sync map and the status array", () => {
    const fromMap = normalizeResults({ tiktok: { success: true, url: "https://t/1" }, instagram: { success: false, error: "nope" } });
    assert.deepEqual(fromMap, [
      { platform: "tiktok", success: true, status: undefined, message: undefined, url: "https://t/1", skipped: undefined },
      { platform: "instagram", success: false, status: undefined, message: "nope", url: undefined, skipped: undefined },
    ]);
    const fromArray = normalizeResults([{ platform: "youtube", status: "skipped", skipped: true }]);
    assert.equal(fromArray[0].skipped, true);
    assert.deepEqual(normalizeResults(undefined), []);
  });

  it("describeResults summarises each platform", () => {
    assert.equal(
      describeResults([
        { platform: "tiktok", success: true },
        { platform: "instagram", skipped: true },
        { platform: "youtube", status: "failed", message: "quota" },
        { platform: "x", status: "processing" },
      ]),
      "✅ tiktok · ⏭️ instagram (not connected) · ❌ youtube — quota · ⏳ x",
    );
  });

  it("defaultFirstComment links the course URL, or nothing", () => {
    assert.match(defaultFirstComment(" https://www.plunderandriffle.com/joblessjoe "), /: https:\/\/www\.plunderandriffle\.com\/joblessjoe$/);
    assert.equal(defaultFirstComment(""), "");
  });
});

describe("uploadVideo first comment", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  /** Run uploadVideo against a stub fetch and return the form it sent. */
  async function sentForm(firstComment?: string): Promise<FormData> {
    let body: FormData | undefined;
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      body = init?.body as FormData;
      return new Response(JSON.stringify({ success: true, request_id: "r1" }), { status: 200 });
    }) as typeof fetch;
    const cfg = { apiKey: "k", user: "joe", platforms: ["youtube", "instagram"] };
    await uploadVideo(cfg, { url: "https://cdn/x.mp4", title: "Rejection Blues", firstComment });
    assert.ok(body instanceof FormData);
    return body;
  }

  it("sends first_comment when given", async () => {
    const form = await sentForm("  Full song: https://www.plunderandriffle.com/joblessjoe  ");
    assert.equal(form.get("first_comment"), "Full song: https://www.plunderandriffle.com/joblessjoe");
    assert.deepEqual(form.getAll("platform[]"), ["youtube", "instagram"]);
  });

  it("leaves first_comment out when empty or missing", async () => {
    assert.equal((await sentForm(undefined)).has("first_comment"), false);
    assert.equal((await sentForm("")).has("first_comment"), false);
    assert.equal((await sentForm("   ")).has("first_comment"), false);
  });
});

describe("autopilot scheduling", () => {
  it("nextEpisode walks the story and wraps", () => {
    assert.equal(nextEpisode(undefined).key, EPISODES[0].key);
    assert.equal(nextEpisode("custom").key, EPISODES[0].key);
    assert.equal(nextEpisode(EPISODES[0].key).key, EPISODES[1].key);
    assert.equal(nextEpisode(EPISODES[EPISODES.length - 1].key).key, EPISODES[0].key);
  });

  it("nextTarget rotates audiences", () => {
    assert.equal(nextTarget(TARGETS[0].key).key, TARGETS[1].key);
    assert.equal(nextTarget(null).key, TARGETS[0].key);
  });

  it("isDue respects the interval", () => {
    const now = Date.UTC(2026, 9, 19, 12, 0);
    assert.equal(isDue(null, 60, now), true);
    assert.equal(isDue(new Date(now - 59 * 60_000), 60, now), false);
    assert.equal(isDue(new Date(now - 60 * 60_000), 60, now), true);
  });
});

describe("telegram post button", () => {
  it("carries the page token", () => {
    const kb = postKeyboard({ token: "abc123" });
    assert.equal(kb.inline_keyboard[0][0].callback_data, `${POST_CALLBACK_PREFIX}abc123`);
  });
});
