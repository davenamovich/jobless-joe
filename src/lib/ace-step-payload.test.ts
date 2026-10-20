// Run: npx tsx --test src/lib/ace-step-payload.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import {
  ACE_INFERENCE_STEPS,
  ACE_LM_NEGATIVE_PROMPT,
  buildAceStepTaskPayload,
  renderAceStepTask,
} from "./ace-step-payload";

const LYRICS = "[VERSE]\nI sent my resume to the moon.\n\n[OUTRO]\nThe moon is hiring, but only at night.";

describe("buildAceStepTaskPayload", () => {
  it("sends the vocal-clarity settings", () => {
    const p = buildAceStepTaskPayload({
      caption: "warm crooner, brushed drums",
      lyrics: LYRICS,
      durationSec: 90,
      vocalLanguage: "en",
      model: "acestep/acestep-v15-turbo",
    });
    assert.equal(p.task_type, "text2music");
    assert.equal(p.thinking, true);
    assert.equal(p.inference_steps, ACE_INFERENCE_STEPS);
    assert.equal(p.inference_steps, 8);
    assert.equal(p.lm_negative_prompt, ACE_LM_NEGATIVE_PROMPT);
    assert.match(p.lm_negative_prompt, /mumbled vocals, unclear words, buried vocals/);
    assert.equal(p.audio_format, "mp3");
    assert.equal(p.audio_duration, 90);
    assert.equal(p.vocal_language, "en");
    assert.equal(p.model, "acestep-v15-turbo");
    assert.equal(p.sample_mode, undefined);
  });

  it("keeps lyrics out of the prompt", () => {
    const p = buildAceStepTaskPayload({ caption: "crooner", lyrics: LYRICS, durationSec: 60 });
    assert.equal(p.prompt, "crooner");
    assert.equal(p.lyrics, LYRICS);
    assert.doesNotMatch(p.prompt, /<lyrics>|resume/);
  });

  it("keeps Joe's [OUTRO] punchline (no [End] rewrite)", () => {
    const p = buildAceStepTaskPayload({ caption: "c", lyrics: LYRICS, durationSec: 60 });
    assert.match(p.lyrics, /\[OUTRO\]\nThe moon is hiring, but only at night\.$/);
    assert.doesNotMatch(p.lyrics, /\[End\]/i);
  });

  it("floors the duration at 60s", () => {
    for (const d of [15, 30, 59]) {
      assert.equal(buildAceStepTaskPayload({ caption: "c", lyrics: LYRICS, durationSec: d }).audio_duration, 60);
    }
    assert.equal(buildAceStepTaskPayload({ caption: "c", lyrics: LYRICS, durationSec: 120 }).audio_duration, 120);
    assert.equal(buildAceStepTaskPayload({ caption: "c", lyrics: LYRICS, durationSec: NaN }).audio_duration, 60);
  });

  it("normalizes the vocal language to an ISO code", () => {
    const lang = (v?: string) =>
      buildAceStepTaskPayload({ caption: "c", lyrics: LYRICS, durationSec: 60, vocalLanguage: v }).vocal_language;
    assert.equal(lang("es"), "es");
    assert.equal(lang("pt-BR"), "pt");
    assert.equal(lang(undefined), "en");
    assert.equal(lang("English"), "en");
  });

  it("falls back to sample mode when there are no lyrics", () => {
    const p = buildAceStepTaskPayload({ caption: "c", lyrics: "   ", durationSec: 60 });
    assert.equal(p.lyrics, "");
    assert.equal(p.sample_mode, true);
    assert.equal(p.thinking, true);
  });

  it("omits the model when none is given", () => {
    const p = buildAceStepTaskPayload({ caption: "c", lyrics: LYRICS, durationSec: 60 });
    assert.equal("model" in p, false);
  });
});

// ---------------- client against a fake ACE-Step server ----------------

interface Hit {
  method: string;
  path: string;
  body: Record<string, unknown>;
}

async function fakeAce(opts: { initialized: boolean; runningPolls?: number }) {
  const hits: Hit[] = [];
  let initialized = opts.initialized;
  let polls = 0;
  let failedTask = "";
  const server: Server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks).toString();
    const url = new URL(req.url ?? "/", "http://x");
    hits.push({ method: req.method ?? "", path: url.pathname, body: raw ? JSON.parse(raw) : {} });
    const send = (body: unknown) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (url.pathname === "/release_task") {
      const id = `task-${hits.length}`;
      if (!initialized) failedTask = id;
      return send({ code: 200, data: { task_id: id, status: "queued" } });
    }
    if (url.pathname === "/query_result") {
      const id = (hits.at(-1)!.body.task_id_list as string[])[0];
      if (id === failedTask) {
        return send({
          code: 200,
          data: [{ task_id: id, status: 2, result: JSON.stringify([{ file: "", error: "Model not initialized and no init kwargs available" }]) }],
        });
      }
      if (polls++ < (opts.runningPolls ?? 0)) {
        return send({ code: 200, data: [{ task_id: id, status: 0, result: "[]" }] });
      }
      const file = `/v1/audio?path=${encodeURIComponent("C:\\tmp\\out.mp3")}`;
      return send({ code: 200, data: [{ task_id: id, status: 1, result: JSON.stringify([{ file, status: 1 }]) }] });
    }
    if (url.pathname === "/v1/init") {
      initialized = true;
      return send({ code: 200, data: { ok: true } });
    }
    if (url.pathname === "/v1/audio") {
      res.writeHead(200, { "Content-Type": "audio/mpeg" });
      return res.end(Buffer.from("ID3fakeaudio"));
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no port");
  return {
    hits,
    base: `http://127.0.0.1:${addr.port}`,
    stop: () => new Promise<void>((r) => server.close(() => r())),
  };
}

describe("renderAceStepTask", () => {
  const payload = buildAceStepTaskPayload({ caption: "c", lyrics: LYRICS, durationSec: 60, vocalLanguage: "en" });

  it("submits, polls until done, then downloads the mp3", async () => {
    const ace = await fakeAce({ initialized: true, runningPolls: 2 });
    try {
      const out = await renderAceStepTask(payload, { base: ace.base, headers: {}, initModel: "acestep/acestep-v15-turbo", pollMs: 1 });
      assert.equal(out.format, "mp3");
      assert.equal(out.buffer.toString(), "ID3fakeaudio");
      assert.deepEqual(ace.hits.map((h) => h.path), ["/release_task", "/query_result", "/query_result", "/query_result", "/v1/audio"]);
      assert.deepEqual(ace.hits[0].body, payload);
    } finally {
      await ace.stop();
    }
  });

  it("initializes DiT + LM and retries once when the server is not initialized", async () => {
    const ace = await fakeAce({ initialized: false });
    try {
      const out = await renderAceStepTask(payload, { base: ace.base, headers: {}, initModel: "acestep/acestep-v15-turbo", pollMs: 1 });
      assert.equal(out.buffer.toString(), "ID3fakeaudio");
      const init = ace.hits.find((h) => h.path === "/v1/init");
      assert.deepEqual(init?.body, { model: "acestep-v15-turbo", init_llm: true });
      assert.equal(ace.hits.filter((h) => h.path === "/release_task").length, 2);
    } finally {
      await ace.stop();
    }
  });
});
