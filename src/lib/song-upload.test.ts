// Run: npx tsx --test src/lib/song-upload.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_UPLOAD_BYTES,
  cleanUploadLyrics,
  songUploadText,
  titleFromFileName,
  uploadAudioFormat,
  uploadProblem,
  withAudioSrc,
} from "./song-upload";
import { parseSongLines } from "./stickman-scenes";
import { buildStickmanVideoHtml } from "./stickman-video";

describe("uploadAudioFormat", () => {
  it("takes MP3 and WAV by extension, any case", () => {
    assert.equal(uploadAudioFormat("Song.MP3"), "mp3");
    assert.equal(uploadAudioFormat("take 2.wav", "application/octet-stream"), "wav");
  });
  it("falls back to the MIME type only when there's no extension", () => {
    assert.equal(uploadAudioFormat("blob", "audio/mpeg"), "mp3");
    assert.equal(uploadAudioFormat("blob", "audio/x-wav"), "wav");
    assert.equal(uploadAudioFormat("song.m4a", "audio/mpeg"), null);
  });
  it("refuses other files", () => {
    assert.equal(uploadAudioFormat("song.ogg", "audio/ogg"), null);
    assert.equal(uploadAudioFormat("notes.txt", "text/plain"), null);
    assert.equal(uploadAudioFormat("", ""), null);
  });
});

describe("uploadProblem", () => {
  it("passes a normal song, and one whose length can't be read", () => {
    assert.equal(uploadProblem(4_000_000, 150), null);
    assert.equal(uploadProblem(4_000_000, null), null);
    assert.equal(uploadProblem(MAX_UPLOAD_BYTES, 180), null);
  });
  it("refuses empty, over-24MB and over-3-minute files", () => {
    assert.match(uploadProblem(0, null)!, /empty/);
    assert.match(uploadProblem(MAX_UPLOAD_BYTES + 1, 60)!, /24MB/);
    assert.match(uploadProblem(5_000_000, 200)!, /3:20.*3 minutes/);
  });
});

describe("withAudioSrc", () => {
  it("points the page's audio at the local file", () => {
    const html = buildStickmanVideoHtml({ title: "T", episodeLabel: "", lyrics: "one line", audioFile: "song.mp3", durationSec: 30 });
    const local = withAudioSrc(html, "song.mp3", "blob:http://localhost:3000/abc");
    assert.ok(local.includes('<audio id="a" preload="auto" src="blob:http://localhost:3000/abc">'));
    assert.ok(!local.includes('src="song.mp3"'));
  });
});

describe("titleFromFileName", () => {
  it("drops the extension and underscores", () => {
    assert.equal(titleFromFileName("my_song-final (v2).mp3"), "my song final (v2)");
    assert.equal(titleFromFileName(".mp3"), "");
  });
});

describe("cleanUploadLyrics", () => {
  it("strips LRC timestamps and metadata, keeps section tags", () => {
    const lrc = "[ti:Résumé Moon]\r\n[ar:Joe]\r\n[VERSE]\r\n[00:12.34]I sent my résumé to the moon\r\n\r\n\r\n[OUTRO]\r\n[01:02]Still unpaid\r\n\r\n";
    assert.equal(cleanUploadLyrics(lrc), "[VERSE]\nI sent my résumé to the moon\n\n[OUTRO]\nStill unpaid");
  });
});

describe("songUploadText", () => {
  it("uses typed title and lyrics; the last OUTRO line is the punchline", () => {
    const out = songUploadText({
      title: "  Résumé Moon ",
      lyrics: "[VERSE]\nI sent my résumé to the moon\n[OUTRO]\nThey said the job was unpaid",
      fileName: "x.mp3",
    });
    assert.equal(out.title, "Résumé Moon");
    assert.equal(out.fromTitle, false);
    const lines = parseSongLines(out.lyrics);
    assert.equal(lines.length, 2);
    assert.equal(lines[1].punch, true);
  });
  it("titles from the file name when the title is blank", () => {
    assert.equal(songUploadText({ fileName: "laundromat_blues.wav" }).title, "laundromat blues");
    assert.equal(songUploadText({}).title, "Untitled Song");
  });
  it("with no sung lines, the title is the one line", () => {
    for (const lyrics of ["", "  \n ", "[VERSE]\n[CHORUS]"]) {
      const out = songUploadText({ title: "Job Fair Blues", lyrics });
      assert.equal(out.fromTitle, true);
      assert.equal(out.lyrics, "Job Fair Blues");
    }
  });
  it("caps the title length", () => {
    assert.equal(songUploadText({ title: "x".repeat(300) }).title.length, 120);
  });
});
