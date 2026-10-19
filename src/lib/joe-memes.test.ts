// Run: npx tsx --test src/lib/joe-memes.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fallbackMemes, memeSvg, parseMemeJson, renderMemePng, wrapCaption } from "./joe-memes";
import { lyricsToBeats, beatStarts } from "./stickman";
import { parseMemeArgs } from "./telegram/commands/meme";

describe("joe memes", () => {
  it("reads the model's JSON, fixes loose poses and falls back to lyric cues", () => {
    const memes = parseMemeJson(
      'Sure! ```json\n[{"top":"me at 2am","bottom":"applying to my 40th job online","pose":"Typing"},' +
        '{"top":"","bottom":"no top"},{"top":"hr","bottom":"we went with a robot","pose":"facepalm","expression":"TIRED","prop":"Cloud"}]\n```',
    );
    assert.equal(memes.length, 2, "a meme with no top line is dropped");
    assert.equal(memes[0].pose, "type", "unknown pose → the laptop cue from the punchline");
    assert.equal(memes[0].prop, "laptop");
    assert.equal(memes[1].expression, "tired");
    assert.equal(memes[1].prop, "cloud");
    assert.deepEqual(parseMemeJson("no json here"), []);
  });

  it("always has n memes from a song's own lines, hooks first", () => {
    const memes = fallbackMemes({ title: "Jobless in a Tie", hooks: ["The robot took my chair"], lyrics: "[VERSE]\nShort\nRejected in a second flat today" }, 3);
    assert.equal(memes.length, 3);
    assert.equal(memes[0].bottom, "The robot took my chair");
    assert.equal(memes[0].pose, "facepalm");
    assert.ok(memes.every((m) => m.top === "Jobless in a Tie"));
  });

  it("wraps captions on words and ellipsizes past the line limit", () => {
    assert.deepEqual(wrapCaption("ONE TWO THREE", 7, 3), ["ONE TWO", "THREE"]);
    const long = wrapCaption("A B C D E F G H I J", 3, 2);
    assert.equal(long.length, 2);
    assert.ok(long[1].endsWith("…"));
  });

  it("escapes captions and renders a 1080x1350 PNG", async () => {
    const m = { top: "<b>boss</b> & me", bottom: "we'll be in touch", pose: "shrug" as const, expression: "deadpan" as const };
    assert.doesNotMatch(memeSvg(m), /<b>boss/);
    const png = await renderMemePng(m);
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    assert.equal(png.readUInt32BE(16), 1080);
    assert.equal(png.readUInt32BE(20), 1350);
  });

  it("parses /meme arguments", () => {
    assert.deepEqual(parseMemeArgs([]), { count: 3, topic: "" });
    assert.deepEqual(parseMemeArgs(["5"]), { count: 5, topic: "" });
    assert.deepEqual(parseMemeArgs(["9", "robots"]), { count: 3, topic: "9 robots" });
    assert.deepEqual(parseMemeArgs(["2", "my", "landlord"]), { count: 2, topic: "my landlord" });
  });
});

describe("song-page stage", () => {
  it("turns sung lines into beats and skips section tags", () => {
    const beats = lyricsToBeats("[VERSE 1]\nThey handed me a cardboard box\n\n[CHORUS]\nOh I'm jobless baby\nStill in a tie");
    assert.equal(beats.length, 3);
    assert.equal(beats[0].pose, "carry");
    assert.equal(beats[1].section, "CHORUS");
  });

  it("spreads beat starts across the song in order", () => {
    const starts = beatStarts(lyricsToBeats("one two three\nfour five six seven\neight nine"));
    assert.equal(starts[0], 0.04);
    assert.ok(starts[1] > starts[0] && starts[2] > starts[1] && starts[2] < 0.96);
  });
});
