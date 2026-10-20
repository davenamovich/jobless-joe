// Run: npx tsx --test src/lib/stickman-video.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { audioDurationSec } from "./song-artifacts";
import { buildStickmanVideoHtml, END_CARD_MS } from "./stickman-video";
import { MP4_CALLBACK_PREFIX, previewKeyboard, rememberPage, type VideoPageRef } from "./telegram/commands/video";

function wav(secs: number, sr = 8000): Buffer {
  const n = sr * secs;
  const b = Buffer.alloc(44 + n);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr, 28);
  b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write("data", 36); b.writeUInt32LE(n, 40);
  return b;
}

/** A CBR MPEG-1 Layer III stream: 128 kbps, 44.1 kHz, `frames` frames of 417 bytes. */
function mp3(frames: number): Buffer {
  const frame = Buffer.alloc(417);
  frame.writeUInt32BE(0xfffb9000, 0); // sync, MPEG1, Layer III, 128 kbps, 44.1 kHz
  return Buffer.concat(Array.from({ length: frames }, () => frame));
}

describe("audio duration", () => {
  it("reads WAV exactly and estimates CBR MP3 from the bitrate", () => {
    assert.equal(audioDurationSec(wav(12), "wav"), 12);
    const secs = audioDurationSec(mp3(383), "mp3")!; // 383 frames × 1152 / 44100 ≈ 10.0s
    assert.ok(Math.abs(secs - 10) < 0.1, String(secs));
    assert.equal(audioDurationSec(Buffer.from("nope"), "mp3"), null);
  });
});

describe("stickman video page", () => {
  const html = buildStickmanVideoHtml({
    title: "Jobless <in> a Tie",
    episodeLabel: "Episode 3",
    lyrics: "[VERSE]\nThey handed me a cardboard box\nNow I apply online all day\n[CHORUS]\nOh I'm jobless baby",
    audioFile: "song.mp3",
    durationSec: 42,
  });

  it("follows the recorder contract: record=1, startShow, recordDurationMs, its own audio", () => {
    assert.ok(html.includes("/[?&]record=1\\b/.test"), "a real word boundary in the page, not a backspace");
    assert.match(html, /window\.startShow = startShow/);
    assert.match(html, new RegExp(`recordDurationMs: durMs \\+ END_MS`));
    assert.match(html, /var durMs = 42000;/);
    assert.match(html, new RegExp(`var END_MS = ${END_CARD_MS};`));
    assert.match(html, /<audio id="a" preload="auto" src="song\.mp3">/);
  });

  it("ships the rig: one beat per sung line, the engine, one live figure; escapes the title", () => {
    const data = JSON.parse(/<script type="application\/json" id="smData">([\s\S]*?)<\/script>/.exec(html)![1]);
    assert.equal(data.beats.length, 3);
    assert.equal(data.beats[0].pose, "carry");
    assert.equal(data.beats[2].dance, true, "chorus lines dance");
    assert.match(html, /window\.JoeRig = \{ mount: mount \}/);
    assert.equal((html.match(/class="sm-joe"/g) || []).length, 1);
    assert.doesNotMatch(html, /<in>/);
    assert.match(html, /Jobless &lt;in&gt; a Tie/);
  });
});

describe("Joe's TV", () => {
  it("picks a slide from the lyric's topic, the same one for a repeated line", async () => {
    const { beatToSlide } = await import("./stickman-tv");
    const beat = (text: string) => ({ text, pose: "sing" as const, expression: "happy" as const });
    assert.equal(beatToSlide(beat("I sent my resume online")).title, "APPLICATION FUNNEL");
    assert.equal(beatToSlide(beat("the robots took my job")).title, "JOBS: ROBOTS vs JOE");
    assert.equal(beatToSlide(beat("ghosted again")).kind, "pie");
    assert.deepEqual(beatToSlide(beat("la la la")), beatToSlide(beat("la la la")));
  });

  it("ships a title card plus one slide per line, and swaps them on the page clock", async () => {
    const { TV_JS } = await import("./stickman-tv");
    const html = buildStickmanVideoHtml({
      title: "Jobless <in> a Tie",
      episodeLabel: "Episode 3",
      lyrics: "They handed me a cardboard box\nNow I apply online all day\nOh I'm jobless baby",
      audioFile: "song.mp3",
      durationSec: 42,
    });
    const tv = JSON.parse(/<script type="application\/json" id="tvData">([\s\S]*?)<\/script>/.exec(html)![1]);
    assert.equal(tv.order.length, 4, "title card + 3 lines");
    assert.equal(tv.at[0], 0);
    assert.match(tv.slides[0], /Jobless &lt;in&gt; a Tie/);
    assert.match(html, /if \(tv\) tv\.update\(/);
    assert.doesNotMatch(TV_JS, /\$\{|`/);
    assert.doesNotThrow(() => new Function(TV_JS), "parses as JS");
  });
});

describe("/video buttons", () => {
  const ref = (token: string): VideoPageRef => ({ token, url: `https://x.here.now/${token}`, title: token, createdAt: 0 });

  it("keeps the newest few previews, replacing a repeat", () => {
    let list: VideoPageRef[] = [];
    for (const t of ["a", "b", "c", "d", "e", "f"]) list = rememberPage(list, ref(t), 5);
    assert.deepEqual(list.map((p) => p.token), ["f", "e", "d", "c", "b"]);
    list = rememberPage(list, { ...ref("d"), mp4Url: "https://x/v.mp4" });
    assert.equal(list[0].token, "d");
    assert.equal(list.filter((p) => p.token === "d").length, 1);
  });

  it("offers watch + Make MP4, and drops the MP4 button once tapped", () => {
    const kb = previewKeyboard(ref("abc123"));
    assert.equal(kb.inline_keyboard[0][0].url, "https://x.here.now/abc123");
    assert.equal(kb.inline_keyboard[1][0].callback_data, `${MP4_CALLBACK_PREFIX}abc123`);
    assert.ok(Buffer.byteLength(kb.inline_keyboard[1][0].callback_data!) <= 64, "Telegram's callback_data limit");
    assert.equal(previewKeyboard(ref("abc123"), false).inline_keyboard.length, 1);
  });
});

describe("stickman rig", () => {
  it("anchors hand props to the hand and gives every prop an entrance", async () => {
    const { propRig, buildRigData } = await import("./stickman-rig");
    assert.equal(propRig("coffee", false).anchor, "lh");
    assert.equal(propRig("phone", false).anchor, "rh");
    assert.equal(propRig("cloud", false).anchor, "head");
    assert.equal(propRig("box", true).enter, "pop");
    assert.equal(propRig("box", false).enter, "drop");
    const data = buildRigData([{ text: "my dog and me", pose: "stand", expression: "happy", prop: "dog" }]);
    assert.equal(data.beats[0].cx, 200, "floor props push Joe left");
    assert.ok(data.poses.stepL && data.poses.guns, "dance moves ship with the poses");
  });

  it("uses measured line timing when it fits, the estimate when it doesn't", () => {
    const lyrics = "[VERSE]\nThey handed me a cardboard box\nNow I apply online all day\n[CHORUS]\nOh I'm jobless baby";
    const page = (lineStarts?: number[] | null) => {
      const html = buildStickmanVideoHtml({ title: "T", episodeLabel: "E", lyrics, audioFile: "song.mp3", durationSec: 60, lineStarts });
      const rig = JSON.parse(/id="smData">([\s\S]*?)<\/script>/.exec(html)![1]);
      const tv = JSON.parse(/id="tvData">([\s\S]*?)<\/script>/.exec(html)![1]);
      return { rig: rig.beats.map((b: { at: number }) => b.at), tv: tv.at };
    };
    const real = page([0.2, 0.45, 0.7]);
    assert.deepEqual(real.rig, [0.2, 0.45, 0.7]);
    assert.deepEqual(real.tv, [0, 0.2, 0.45, 0.7], "the TV flips on the same lines");
    const estimate = page();
    assert.equal(estimate.rig[0], 0.04);
    assert.deepEqual(page([0.2, 0.45]).rig, estimate.rig, "wrong length falls back");
  });

  it("keeps the engine free of template holes and backticks (inlined verbatim)", async () => {
    const { JOE_RIG_JS } = await import("./stickman-rig");
    assert.doesNotMatch(JOE_RIG_JS, /\$\{|`/);
    assert.doesNotThrow(() => new Function(JOE_RIG_JS), "parses as JS");
  });
});
