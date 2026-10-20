// Run: npx tsx --test src/lib/song-import.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  acceptTaggedLyrics,
  buildUploadOutput,
  durationKeyFor,
  languageFromWhisper,
  titleFromFilename,
  transcriptToLyrics,
} from "./song-import";
import { audioAttachment, TELEGRAM_MAX_DOWNLOAD } from "./telegram/upload-flow";
import type { TelegramMessage } from "./telegram/types";

describe("titleFromFilename", () => {
  it("uses the file's own name", () => {
    assert.equal(titleFromFilename("My_Landlord_Blues.mp3"), "My Landlord Blues");
    assert.equal(titleFromFilename("C:/music/Joe - Take Two.m4a"), "Joe - Take Two");
  });
  it("ignores names that say nothing", () => {
    for (const n of ["audio.mp3", "song 2.mp3", "voice.ogg", "20240101.wav", "track_03.flac", ""]) {
      assert.equal(titleFromFilename(n), "", n);
    }
  });
});

describe("languageFromWhisper", () => {
  it("maps Whisper's names and codes to episode keys", () => {
    assert.equal(languageFromWhisper("english"), "en");
    assert.equal(languageFromWhisper("Spanish"), "es");
    assert.equal(languageFromWhisper("portuguese"), "pt-BR");
    assert.equal(languageFromWhisper("ja"), "ja");
  });
  it("falls back to the default", () => {
    assert.equal(languageFromWhisper("klingon"), "en");
    assert.equal(languageFromWhisper(undefined), "en");
  });
});

describe("durationKeyFor", () => {
  it("picks the nearest length", () => {
    assert.equal(durationKeyFor(12), "15s");
    assert.equal(durationKeyFor(70), "60s");
    assert.equal(durationKeyFor(80), "90s");
    assert.equal(durationKeyFor(240), "120s");
  });
});

describe("transcriptToLyrics", () => {
  it("one line per segment, a blank line at long pauses, long lines split", () => {
    const lyrics = transcriptToLyrics([
      { start: 10, end: 13, text: " I lost my job today" },
      { start: 13.4, end: 16, text: "to a robot in a tie" },
      { start: 22, end: 30, text: "one two three four five six seven eight nine ten eleven twelve" },
    ]);
    assert.equal(
      lyrics,
      "I lost my job today\nto a robot in a tie\n\none two three four five six\nseven eight nine ten eleven twelve",
    );
  });
});

describe("acceptTaggedLyrics", () => {
  const plain = "I lost my job\nto a robot\n\nno job no problem";
  it("takes the tags when the lines are untouched", () => {
    const tagged = "[VERSE 1]\nI lost my job\nto a robot\n\n[CHORUS]\nNo job, no problem!";
    assert.equal(acceptTaggedLyrics(plain, tagged), tagged);
  });
  it("keeps the transcript if the model rewrote, dropped or added a line", () => {
    assert.equal(acceptTaggedLyrics(plain, "[VERSE]\nI lost my gig\nto a robot\n[CHORUS]\nno job no problem"), plain);
    assert.equal(acceptTaggedLyrics(plain, "[VERSE]\nI lost my job\n[CHORUS]\nno job no problem"), plain);
    assert.equal(acceptTaggedLyrics(plain, "[VERSE]\nI lost my job\nto a robot\nyeah\nno job no problem"), plain);
  });
  it("keeps the transcript when there are no tags or no reply", () => {
    assert.equal(acceptTaggedLyrics(plain, plain.toUpperCase()), plain);
    assert.equal(acceptTaggedLyrics(plain, undefined), plain);
  });
});

describe("buildUploadOutput", () => {
  it("is a complete song even when the model gave nothing", () => {
    const out = buildUploadOutput({ lyrics: "line one\nline two", title: "Given", durationKey: "60s", meta: {} });
    assert.equal(out.episodeTitle, "Given");
    assert.equal(out.lyrics, "line one\nline two");
    assert.equal(out.closingLine, "line two");
    assert.equal(out.hooks.length, 3);
    assert.equal(out.adCopy.headlines.length, 3);
    assert.equal(out.duration, "60s");
  });
  it("uses the model's title, hooks and tags", () => {
    const out = buildUploadOutput({
      lyrics: "line one\nline two",
      title: "",
      durationKey: "30s",
      meta: { episodeTitle: "Better Title", lyrics: "[CHORUS]\nline one\nline two", hooks: ["a", "b", "c", "d"] },
    });
    assert.equal(out.episodeTitle, "Better Title");
    assert.equal(out.lyrics, "[CHORUS]\nline one\nline two");
    assert.deepEqual(out.hooks, ["a", "b", "c"]);
  });
});

describe("telegram audioAttachment", () => {
  const base = { message_id: 1, chat: { id: 5 }, date: 0 } as unknown as TelegramMessage;
  it("finds audio, voice notes and audio documents", () => {
    assert.deepEqual(
      audioAttachment({ ...base, audio: { file_id: "a", title: "Blues", performer: "Joe", file_size: 10 } }),
      { fileId: "a", fileName: "Joe - Blues.mp3", size: 10, title: "Blues" },
    );
    assert.equal(audioAttachment({ ...base, voice: { file_id: "v" } })?.fileName, "voice.ogg");
    assert.equal(audioAttachment({ ...base, document: { file_id: "d", file_name: "take2.m4a" } })?.fileId, "d");
    assert.equal(audioAttachment({ ...base, document: { file_id: "d", file_name: "x.bin", mime_type: "audio/mpeg" } })?.fileId, "d");
  });
  it("ignores everything else", () => {
    assert.equal(audioAttachment({ ...base, document: { file_id: "d", file_name: "notes.pdf" } }), null);
    assert.equal(audioAttachment({ ...base, text: "hi" }), null);
  });
  it("knows Telegram's download cap", () => {
    assert.equal(TELEGRAM_MAX_DOWNLOAD, 20 * 1024 * 1024);
  });
});
