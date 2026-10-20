/**
 * ACE-Step song render: the /release_task payload (pure, unit tested) and the
 * submit → poll /query_result → fetch /v1/audio client.
 *
 * Why /release_task and not /v1/chat/completions: the chat endpoint honors
 * `thinking`, `lyrics` and `inference_steps`, but never forwards
 * `lm_negative_prompt` to the generator (acestep/openrouter_adapter.py
 * _to_generate_music_request), so the anti-mumble negative prompt is lost.
 *
 * Settings ported from StudioStack (apps/studio/src/lib/providers/ace-submit.ts):
 *  - thinking: true — thinking:false skips the 5Hz LM pass ("dit behavior") and
 *    the words come out garbled.
 *  - lyrics in their own field, never inline in the prompt.
 *  - ISO vocal_language ("en", not "English").
 *  - inference_steps 8 — acestep-v15-turbo is tuned for 8 steps.
 *  - lm_negative_prompt that bans mumbled / unclear / buried vocals.
 *  - 60s duration floor — the LM rushes very short renders.
 *
 * Deliberately NOT ported: StudioStack replaces [Outro] with [End]. Joe's last
 * sung line is the punchline, so his [OUTRO] stays.
 */

/** Same anti-slop list StudioStack ships as DEFAULT_INFER.lm_negative_prompt. */
export const ACE_LM_NEGATIVE_PROMPT =
  "stock library, MIDI placeholder, dated sound, lo-fi demo, amateur mix, " +
  "muddy low-mids, excessive reverb, 8-bit, chiptune, video game music, " +
  "vintage retro preset, cheap synthesizer, plastic drum machine, " +
  "thin sound, no energy, forgettable, background elevator music, static, garbled, distorted, " +
  "mumbled vocals, unclear words, buried vocals, muddy vocal mix, bad mixing";

/** acestep-v15-turbo is tuned for 8 steps; more over-denoises the vocals. */
export const ACE_INFERENCE_STEPS = 8;

/** Shorter renders come out rushed and garbled. */
export const ACE_MIN_DURATION_SEC = 60;

export interface AceStepTaskInput {
  /** Style caption only — lyrics never go in here. */
  caption: string;
  /** Section-tagged lyrics. Empty → ACE invents a song from the caption. */
  lyrics: string;
  durationSec: number;
  /** ISO code ("en") as stored in LanguageDef.ace. */
  vocalLanguage?: string;
  /** "acestep/acestep-v15-turbo" or bare "acestep-v15-turbo". */
  model?: string;
}

export interface AceStepTaskPayload {
  task_type: "text2music";
  prompt: string;
  lyrics: string;
  thinking: true;
  vocal_language: string;
  audio_duration: number;
  audio_format: "mp3";
  inference_steps: number;
  lm_negative_prompt: string;
  model?: string;
  sample_mode?: true;
}

/** "acestep/acestep-v15-turbo" -> "acestep-v15-turbo" (what the server expects). */
export function aceStepModelName(model: string): string {
  return model.replace(/^[^/]+\//, "").trim();
}

/** ISO code or "en". ACE only accepts codes; a name like "English" garbles vocals. */
function isoLanguage(raw: string | undefined): string {
  const base = (raw ?? "").trim().toLowerCase().split(/[-_]/)[0];
  return /^[a-z]{2,3}$/.test(base) ? base : "en";
}

/** Build the /release_task body for one Joe song. Pure. */
export function buildAceStepTaskPayload(input: AceStepTaskInput): AceStepTaskPayload {
  const lyrics = (input.lyrics ?? "").trim();
  const requested = Number.isFinite(input.durationSec) ? input.durationSec : 0;
  const model = input.model ? aceStepModelName(input.model) : "";
  return {
    task_type: "text2music",
    prompt: input.caption,
    lyrics,
    thinking: true,
    vocal_language: isoLanguage(input.vocalLanguage),
    audio_duration: Math.max(ACE_MIN_DURATION_SEC, requested),
    audio_format: "mp3",
    inference_steps: ACE_INFERENCE_STEPS,
    lm_negative_prompt: ACE_LM_NEGATIVE_PROMPT,
    ...(model ? { model } : {}),
    // No lyrics? Let ACE-Step invent everything from the caption.
    ...(lyrics ? {} : { sample_mode: true as const }),
  };
}

// ---------------- Client: submit → poll → download ----------------

export interface AceStepRenderOptions {
  /** Base URL without /v1, e.g. http://localhost:8001. */
  base: string;
  headers: Record<string, string>;
  /** Model passed to /v1/init when the server has nothing loaded. */
  initModel: string;
  signal?: AbortSignal;
  pollMs?: number;
}

export interface AceStepRendered {
  buffer: Buffer;
  format: string;
}

interface AceEnvelope<T> {
  code?: number;
  error?: string | null;
  data?: T;
}

interface AceQueryItem {
  task_id?: string;
  status?: number;
  /** JSON string: [{ file, status, error? }] */
  result?: string;
}

class AceNotInitializedError extends Error {}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });

async function submit(
  payload: AceStepTaskPayload,
  opts: AceStepRenderOptions
): Promise<string> {
  const res = await fetch(`${opts.base}/release_task`, {
    method: "POST",
    headers: opts.headers,
    body: JSON.stringify(payload),
    signal: opts.signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 503 && /not initialized/i.test(text)) {
      throw new AceNotInitializedError(text);
    }
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as AceEnvelope<{ task_id?: string }>;
  const taskId = json.data?.task_id;
  if (!taskId) {
    throw new Error(`release_task gave no task_id: ${json.error || JSON.stringify(json)}`);
  }
  return taskId;
}

/** Poll until the task succeeds; returns the /v1/audio?path=… URL. */
async function waitForFile(taskId: string, opts: AceStepRenderOptions): Promise<string> {
  for (;;) {
    const res = await fetch(`${opts.base}/query_result`, {
      method: "POST",
      headers: opts.headers,
      body: JSON.stringify({ task_id_list: [taskId] }),
      signal: opts.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`query_result HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    const json = (await res.json()) as AceEnvelope<AceQueryItem[]>;
    const item = json.data?.[0];
    let results: Array<{ file?: string; error?: string | null }> = [];
    try {
      results = JSON.parse(item?.result || "[]");
    } catch {
      results = [];
    }
    if (item?.status === 1) {
      const file = results.find((r) => r.file)?.file;
      if (!file) throw new Error("ACE-Step finished but returned no audio file");
      return file;
    }
    if (item?.status === 2) {
      const message = results.find((r) => r.error)?.error || "generation failed";
      if (/not initialized/i.test(message)) throw new AceNotInitializedError(message);
      throw new Error(message);
    }
    await sleep(opts.pollMs ?? 3000, opts.signal);
  }
}

async function initModels(opts: AceStepRenderOptions): Promise<void> {
  const res = await fetch(`${opts.base}/v1/init`, {
    method: "POST",
    headers: opts.headers,
    // thinking:true needs the 5Hz LM, so load it alongside the DiT.
    body: JSON.stringify({ model: aceStepModelName(opts.initModel), init_llm: true }),
    signal: opts.signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`model init failed (${res.status}): ${text.slice(0, 300)}`);
  }
}

/**
 * Render one song. A fresh server answers "not initialized" until models are
 * loaded; initialize and retry once.
 */
export async function renderAceStepTask(
  payload: AceStepTaskPayload,
  opts: AceStepRenderOptions
): Promise<AceStepRendered> {
  const run = async () => waitForFile(await submit(payload, opts), opts);
  let file: string;
  try {
    file = await run();
  } catch (e) {
    if (!(e instanceof AceNotInitializedError)) throw e;
    await initModels(opts);
    file = await run();
  }

  const url = /^https?:\/\//i.test(file) ? file : `${opts.base}${file}`;
  const res = await fetch(url, { headers: opts.headers, signal: opts.signal });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`audio download HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  const buffer = Buffer.from(new Uint8Array(await res.arrayBuffer()));
  if (buffer.length === 0) throw new Error("downloaded audio was empty");

  const hint = `${res.headers.get("content-type") ?? ""} ${decodeURIComponent(file)}`;
  const format = /wav/i.test(hint) ? "wav" : /flac/i.test(hint) ? "flac" : "mp3";
  return { buffer, format };
}
