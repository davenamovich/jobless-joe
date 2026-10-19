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
    assert.match(html, /record=1/);
    assert.match(html, /window\.startShow = startShow/);
    assert.match(html, new RegExp(`recordDurationMs: durMs \\+ END_MS`));
    assert.match(html, /var durMs = 42000;/);
    assert.match(html, new RegExp(`var END_MS = ${END_CARD_MS};`));
    assert.match(html, /<audio id="a" preload="auto" src="song\.mp3">/);
  });

  it("has one stage beat per sung line and escapes the title", () => {
    assert.equal((html.match(/class="sm-beat/g) || []).length, 3);
    assert.doesNotMatch(html, /<in>/);
    assert.match(html, /Jobless &lt;in&gt; a Tie/);
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
