// Run: npx tsx --test src/lib/transcribe.test.ts
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_TRANSCRIBE_BYTES,
  buildWhisperPrompt,
  dropHallucinatedSegments,
  isHallucinated,
  parseWhisperResponse,
  sniffAudioFormat,
  transcribeAudio,
  transcribeFailureMessage,
  whisperLanguage,
} from "./transcribe";

const pad = (head: Buffer | string) => Buffer.concat([Buffer.from(head as string, "latin1"), Buffer.alloc(32)]);
const MP3 = pad("ID3\x04\x00");
const WAV = Buffer.concat([Buffer.from("RIFF\x00\x00\x00\x00WAVE", "latin1"), Buffer.alloc(32)]);

describe("sniffAudioFormat", () => {
  it("names files by their bytes", () => {
    assert.equal(sniffAudioFormat(MP3), "mp3");
    assert.equal(sniffAudioFormat(Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x00]), Buffer.alloc(16)])), "mp3");
    assert.equal(sniffAudioFormat(WAV), "wav");
    assert.equal(sniffAudioFormat(pad("\x00\x00\x00\x20ftypM4A ")), "m4a");
    assert.equal(sniffAudioFormat(pad("OggS")), "ogg");
    assert.equal(sniffAudioFormat(pad("fLaC")), "flac");
  });
  it("rejects what isn't audio", () => {
    assert.equal(sniffAudioFormat(pad("<!DOCTYPE html>")), null);
    assert.equal(sniffAudioFormat(Buffer.from("ID3")), null); // too short
  });
});

describe("whisperLanguage", () => {
  it("maps episode keys to ISO codes", () => {
    assert.equal(whisperLanguage("en"), "en");
    assert.equal(whisperLanguage("pt-BR"), "pt");
  });
  it("sends nothing for unknown keys", () => {
    assert.equal(whisperLanguage("klingon"), undefined);
    assert.equal(whisperLanguage(undefined), undefined);
  });
});

describe("buildWhisperPrompt", () => {
  it("joins the title and lyrics without section tags", () => {
    assert.equal(
      buildWhisperPrompt({ title: "Joe Discovers AI", lyrics: "[VERSE 1]\nI lost my job\n\n[CHORUS]\nTo a robot" }),
      "Joe Discovers AI. I lost my job To a robot",
    );
  });
  it("is undefined with nothing to say", () => {
    assert.equal(buildWhisperPrompt({}), undefined);
    assert.equal(buildWhisperPrompt({ title: "  ", lyrics: "[INTRO]" }), undefined);
  });
  it("trims long lyrics on a word boundary", () => {
    const p = buildWhisperPrompt({ lyrics: "unemployment ".repeat(200) })!;
    assert.ok(p.length <= 800);
    assert.ok(p.endsWith("unemployment"));
  });
});

describe("hallucination filter", () => {
  it("flags filler and low-confidence segments", () => {
    assert.ok(isHallucinated({ start: 0, end: 2, text: " Thanks for watching!" }));
    assert.ok(isHallucinated({ start: 0, end: 2, text: "♪" }));
    assert.ok(isHallucinated({ start: 0, end: 2, text: "[Music]" }));
    assert.ok(isHallucinated({ start: 0, end: 2, text: "la la", no_speech_prob: 0.9, avg_logprob: -1.4 }));
    assert.ok(isHallucinated({ start: 0, end: 2, text: "na na na", compression_ratio: 3.1 }));
  });
  it("keeps real lines, even quiet confident ones", () => {
    assert.ok(!isHallucinated({ start: 0, end: 2, text: "I lost my job to a robot", no_speech_prob: 0.7, avg_logprob: -0.3 }));
  });
  it("drops the words inside dropped segments", () => {
    const out = dropHallucinatedSegments(
      [
        { start: 0, end: 4, text: "Thanks for watching" },
        { start: 4, end: 6, text: " Hello world " },
      ],
      [
        { word: "Thanks", start: 0.5, end: 1 },
        { word: " Hello", start: 4.2, end: 4.8 },
        { word: "world", start: 5, end: 5.6 },
      ],
    );
    assert.deepEqual(out.segments, [{ start: 4, end: 6, text: "Hello world" }]);
    assert.deepEqual(out.words.map((w) => w.word), ["Hello", "world"]);
  });
});

describe("parseWhisperResponse", () => {
  it("is null when only filler was heard", () => {
    assert.equal(parseWhisperResponse({ segments: [{ start: 0, end: 30, text: "♪" }] }), null);
  });
  it("falls back to the last segment end for duration", () => {
    const t = parseWhisperResponse({ segments: [{ start: 1, end: 7.5, text: "hi" }], words: [] })!;
    assert.equal(t.durationSec, 7.5);
    assert.equal(t.text, "hi");
  });
});

describe("transcribeAudio", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  function stubFetch(responses: Array<{ status: number; body: unknown }>) {
    const sent: Array<{ auth: string; form: FormData }> = [];
    let i = 0;
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      sent.push({ auth: (init.headers as Record<string, string>).Authorization, form: init.body as FormData });
      const r = responses[Math.min(i++, responses.length - 1)];
      const text = typeof r.body === "string" ? r.body : JSON.stringify(r.body);
      return new Response(text, { status: r.status });
    }) as typeof fetch;
    return sent;
  }

  it("sends the tuned request", async () => {
    const sent = stubFetch([{ status: 200, body: { duration: 9, segments: [{ start: 0, end: 3, text: "hi" }], words: [{ word: "hi", start: 0.2, end: 0.6 }] } }]);
    const r = await transcribeAudio(MP3, { apiKeys: ["k1"], language: "pt-BR", title: "Song", lyrics: "[CHORUS]\nhi" });
    assert.equal(r.transcript?.durationSec, 9);
    assert.equal(r.transcript?.words.length, 1);
    const f = sent[0].form;
    assert.equal(sent[0].auth, "Bearer k1");
    assert.equal(f.get("model"), "whisper-large-v3");
    assert.equal(f.get("temperature"), "0");
    assert.equal(f.get("language"), "pt");
    assert.equal(f.get("prompt"), "Song. hi");
    assert.deepEqual(f.getAll("timestamp_granularities[]"), ["word", "segment"]);
    assert.equal((f.get("file") as File).name, "song.mp3");
  });

  it("names a WAV labelled anything as song.wav", async () => {
    const sent = stubFetch([{ status: 200, body: { segments: [{ start: 0, end: 1, text: "x" }] } }]);
    await transcribeAudio(WAV, { apiKeys: ["k"] });
    assert.equal((sent[0].form.get("file") as File).name, "song.wav");
  });

  it("tries the next key after a rejection", async () => {
    const sent = stubFetch([
      { status: 401, body: "bad key" },
      { status: 200, body: { segments: [{ start: 0, end: 1, text: "x" }] } },
    ]);
    const r = await transcribeAudio(MP3, { apiKeys: ["bad", "good"] });
    assert.ok(r.transcript);
    assert.equal(sent.length, 2);
  });

  it("reports why it failed", async () => {
    stubFetch([{ status: 401, body: "nope" }]);
    assert.equal((await transcribeAudio(MP3, { apiKeys: ["a"] })).failure, "key-rejected");

    const sent = stubFetch([{ status: 400, body: '{"error":{"code":"invalid_media_file"}}' }]);
    assert.equal((await transcribeAudio(MP3, { apiKeys: ["a", "b"] })).failure, "bad-audio");
    assert.equal(sent.length, 1, "a bad file is not retried with another key");

    stubFetch([{ status: 200, body: { segments: [{ start: 0, end: 5, text: "Thanks for watching" }] } }]);
    assert.equal((await transcribeAudio(MP3, { apiKeys: ["a"] })).failure, "no-speech");

    assert.equal((await transcribeAudio(MP3, { apiKeys: [] })).failure, "no-key");
    assert.equal((await transcribeAudio(pad("not audio at all"), { apiKeys: ["a"] })).failure, "bad-audio");
    assert.equal((await transcribeAudio(Buffer.alloc(MAX_TRANSCRIBE_BYTES + 1), { apiKeys: ["a"] })).failure, "too-big");
  });

  it("has a message for every failure", () => {
    for (const f of ["no-key", "key-rejected", "bad-audio", "too-big", "no-speech", "error"] as const) {
      assert.match(transcribeFailureMessage(f), /^Couldn't transcribe/);
    }
  });
});
