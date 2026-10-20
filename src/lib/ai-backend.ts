/**
 * AI Backend Abstraction
 *
 * Supports two backends:
 *  1. "zai"          — the built-in z-ai-web-dev-sdk (default, no config needed)
 *  2. "openai-compat" — any OpenAI-compatible HTTP endpoint, including:
 *                       - Local LLM servers (LM Studio, Ollama, vLLM, LocalAI,
 *                         text-generation-webui with the OpenAI extension)
 *                       - Cloud-hosted custom models
 *                       - A model exposed via ngrok tunnel (e.g. Ace 1.5)
 *
 * Configuration is read from the DB (BackendConfig table) at runtime, so the
 * user can swap backends via the Settings dialog without restarting the server.
 * Env vars can also be used for headless operation:
 *   AI_BACKEND=zai|openai-compat
 *   OPENAI_BASE_URL=https://abc.ngrok.app/v1
 *   OPENAI_API_KEY=...
 *   OPENAI_MODEL=ace-1.5
 */

import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";

export type BackendKey = "zai" | "openai-compat";
export type AudioEngine = "zai" | "acestep";

export interface BackendConfig {
  activeBackend: BackendKey;
  openaiBaseUrl: string;
  openaiApiKey: string;
  openaiModel: string;
  /** Which engine renders the song audio. Text generation is unaffected. */
  audioEngine: AudioEngine;
  /** ACE-Step API base, e.g. http://localhost:8001 or https://abc.ngrok.app */
  aceStepBaseUrl: string;
  /** ACE-Step model ID from GET /v1/models */
  aceStepModel: string;

  /** Plunder & Riffle MCP endpoint (video engine) */
  prMcpUrl: string;
  /** Agent API key for Plunder & Riffle (sent as Authorization: Bearer) */
  prApiKey: string;
  /** Referral code appended to P&R links (?ref=...) */
  prRef: string;
  /** Public https base serving /audio/*; empty = publish via here.now */
  publicBaseUrl: string;
  /** Free-course CTA link */
  courseUrl: string;

  /** YouTube upload (Google Cloud OAuth client + consent-granted token) */
  ytClientId: string;
  ytClientSecret: string;
  ytRefreshToken: string;
  ytChannelId: string;
  ytChannelTitle: string;
  /** unlisted | public | private */
  ytPrivacy: string;

  /** Upload-Post API key (Authorization: Apikey ...) */
  upApiKey: string;
  /** Upload-Post profile the social accounts are connected to */
  upUser: string;
  /** Comma-separated platform[] values */
  upPlatforms: string;
  /** Facebook Page ID for Upload-Post (needed when several Pages are connected) */
  upFacebookPageId: string;

  /** Autopilot: a new song every autoIntervalMin minutes */
  autoEnabled: boolean;
  autoIntervalMin: number;
  /** Film the MP4 and post it via Upload-Post after each autopilot song */
  autoPublish: boolean;
  /** Telegram chat that hears about autopilot runs */
  autoChatId: string;

  /** Fish Audio TTS for the sit-down videos (key + voice model ids) */
  fishApiKey: string;
  fishJoeVoiceId: string;
  fishGuestVoiceId: string;

  /** Morning Show autopilot: make and post the show once a day */
  morningEnabled: boolean;
  /** Local hour (0-23) in morningTimeZone */
  morningHour: number;
  /** Top posts per show */
  morningCount: number;
  /** IANA time zone; empty = the server's */
  morningTimeZone: string;
}

export const UP_DEFAULT_PLATFORMS = "tiktok,instagram,youtube";
export const MORNING_DEFAULT_HOUR = 7;
export const MORNING_DEFAULT_COUNT = 5;
export const AUTO_DEFAULT_INTERVAL_MIN = 60;

export const ACE_STEP_DEFAULT_URL = "http://localhost:8001";
export const ACE_STEP_DEFAULT_MODEL = "acestep/acestep-v15-turbo";
export const PR_MCP_DEFAULT_URL = "https://bot.plunderandriffle.com/api/mcp";
export const COURSE_DEFAULT_URL = "https://www.plunderandriffle.com/joblessjoe";

export interface ChatResult {
  content: string;
  /** Model name as reported by the backend */
  model: string;
  /** Which backend produced this result */
  backend: BackendKey;
}

const DEFAULT_CONFIG: BackendConfig = {
  activeBackend: "zai",
  openaiBaseUrl: "",
  openaiApiKey: "",
  openaiModel: "",
  audioEngine: "zai",
  aceStepBaseUrl: ACE_STEP_DEFAULT_URL,
  aceStepModel: ACE_STEP_DEFAULT_MODEL,
  prMcpUrl: PR_MCP_DEFAULT_URL,
  prApiKey: "",
  prRef: "",
  publicBaseUrl: "",
  courseUrl: COURSE_DEFAULT_URL,
  ytClientId: "",
  ytClientSecret: "",
  ytRefreshToken: "",
  ytChannelId: "",
  ytChannelTitle: "",
  ytPrivacy: "unlisted",
  upApiKey: "",
  upUser: "",
  upPlatforms: UP_DEFAULT_PLATFORMS,
  upFacebookPageId: "",
  autoEnabled: false,
  autoIntervalMin: AUTO_DEFAULT_INTERVAL_MIN,
  autoPublish: false,
  autoChatId: "",
  fishApiKey: "",
  fishJoeVoiceId: "",
  fishGuestVoiceId: "",
  morningEnabled: false,
  morningHour: MORNING_DEFAULT_HOUR,
  morningCount: MORNING_DEFAULT_COUNT,
  morningTimeZone: "",
};

/** Upload-Post + autopilot fields from env (headless deployments). */
function envPublishing(): Pick<
  BackendConfig,
  "upApiKey" | "upUser" | "upPlatforms" | "upFacebookPageId" | "autoEnabled" | "autoIntervalMin" | "autoPublish" | "autoChatId"
> {
  return {
    upApiKey: process.env.UPLOAD_POST_API_KEY ?? "",
    upUser: process.env.UPLOAD_POST_USER ?? "",
    upPlatforms: process.env.UPLOAD_POST_PLATFORMS ?? UP_DEFAULT_PLATFORMS,
    upFacebookPageId: process.env.UPLOAD_POST_FACEBOOK_PAGE_ID ?? "",
    autoEnabled: process.env.AUTOPILOT === "1" || process.env.AUTOPILOT === "true",
    autoIntervalMin: Number(process.env.AUTOPILOT_INTERVAL_MIN) || AUTO_DEFAULT_INTERVAL_MIN,
    autoPublish: process.env.AUTOPILOT_PUBLISH === "1" || process.env.AUTOPILOT_PUBLISH === "true",
    autoChatId: process.env.AUTOPILOT_CHAT_ID ?? "",
  };
}

/** Defaults for a fresh install: the env vars a headless deployment sets. */
function envDefaults(): BackendConfig {
  return {
    activeBackend: "zai",
    openaiBaseUrl: "",
    openaiApiKey: "",
    openaiModel: "",
    audioEngine: DEFAULT_CONFIG.audioEngine,
    aceStepBaseUrl: process.env.ACESTEP_BASE_URL ?? ACE_STEP_DEFAULT_URL,
    aceStepModel: process.env.ACESTEP_MODEL ?? ACE_STEP_DEFAULT_MODEL,
    prMcpUrl: process.env.PR_MCP_URL ?? PR_MCP_DEFAULT_URL,
    prApiKey: process.env.PR_API_KEY ?? "",
    prRef: process.env.PR_REF ?? "",
    publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "",
    courseUrl: process.env.COURSE_URL ?? COURSE_DEFAULT_URL,
    ytClientId: process.env.YT_CLIENT_ID ?? "",
    ytClientSecret: process.env.YT_CLIENT_SECRET ?? "",
    ytRefreshToken: process.env.YT_REFRESH_TOKEN ?? "",
    ytChannelId: "",
    ytChannelTitle: "",
    ytPrivacy: process.env.YT_PRIVACY ?? "unlisted",
    ...envPublishing(),
    fishApiKey: process.env.FISH_AUDIO_API_KEY ?? "",
    fishJoeVoiceId: process.env.FISH_JOE_VOICE_ID ?? "",
    fishGuestVoiceId: process.env.FISH_GUEST_VOICE_ID ?? "",
    morningEnabled: false,
    morningHour: MORNING_DEFAULT_HOUR,
    morningCount: MORNING_DEFAULT_COUNT,
    morningTimeZone: process.env.TZ ?? "",
  };
}

/**
 * Read the current backend config: the Settings saved in the DB, else env
 * defaults. AI_BACKEND / OPENAI_* (when set and non-empty) still pin the text
 * model for headless deployments, but only those fields: P&R, YouTube,
 * Upload-Post and autopilot always come from what was saved in Settings.
 */
export async function loadBackendConfig(): Promise<BackendConfig> {
  let cfg: BackendConfig;
  try {
    const row = await db.backendConfig.findUnique({ where: { id: "current" } });
    if (row) {
      cfg = {
        activeBackend: (row.activeBackend as BackendKey) ?? "zai",
        openaiBaseUrl: row.openaiBaseUrl || "",
        openaiApiKey: row.openaiApiKey || "",
        openaiModel: row.openaiModel || "",
        audioEngine: (row.audioEngine as AudioEngine) ?? "zai",
        aceStepBaseUrl: row.aceStepBaseUrl || ACE_STEP_DEFAULT_URL,
        aceStepModel: row.aceStepModel || ACE_STEP_DEFAULT_MODEL,
        prMcpUrl: row.prMcpUrl || PR_MCP_DEFAULT_URL,
        prApiKey: row.prApiKey || "",
        prRef: row.prRef || "",
        publicBaseUrl: row.publicBaseUrl || "",
        courseUrl: row.courseUrl || COURSE_DEFAULT_URL,
        ytClientId: row.ytClientId || "",
        ytClientSecret: row.ytClientSecret || "",
        ytRefreshToken: row.ytRefreshToken || "",
        ytChannelId: row.ytChannelId || "",
        ytChannelTitle: row.ytChannelTitle || "",
        ytPrivacy: row.ytPrivacy || "unlisted",
        upApiKey: row.upApiKey || process.env.UPLOAD_POST_API_KEY || "",
        upUser: row.upUser || process.env.UPLOAD_POST_USER || "",
        upPlatforms: row.upPlatforms || UP_DEFAULT_PLATFORMS,
        upFacebookPageId: row.upFacebookPageId || process.env.UPLOAD_POST_FACEBOOK_PAGE_ID || "",
        autoEnabled: !!row.autoEnabled,
        autoIntervalMin: row.autoIntervalMin || AUTO_DEFAULT_INTERVAL_MIN,
        autoPublish: !!row.autoPublish,
        autoChatId: row.autoChatId || "",
        fishApiKey: row.fishApiKey || process.env.FISH_AUDIO_API_KEY || "",
        fishJoeVoiceId: row.fishJoeVoiceId || process.env.FISH_JOE_VOICE_ID || "",
        fishGuestVoiceId: row.fishGuestVoiceId || process.env.FISH_GUEST_VOICE_ID || "",
        morningEnabled: !!row.morningEnabled,
        morningHour: row.morningHour ?? MORNING_DEFAULT_HOUR,
        morningCount: row.morningCount || MORNING_DEFAULT_COUNT,
        morningTimeZone: row.morningTimeZone || "",
      };
    } else {
      cfg = envDefaults();
    }
  } catch {
    cfg = envDefaults();
  }

  const envBackend = process.env.AI_BACKEND?.trim() as BackendKey | undefined;
  const envUrl = process.env.OPENAI_BASE_URL?.trim();
  if (envBackend || envUrl) {
    cfg = {
      ...cfg,
      activeBackend: envBackend || "openai-compat",
      openaiBaseUrl: envUrl || cfg.openaiBaseUrl,
      openaiApiKey: process.env.OPENAI_API_KEY?.trim() || cfg.openaiApiKey,
      openaiModel: process.env.OPENAI_MODEL?.trim() || cfg.openaiModel,
    };
  }
  if (process.env.AUDIO_ENGINE === "acestep" || process.env.AUDIO_ENGINE === "zai") {
    cfg = { ...cfg, audioEngine: process.env.AUDIO_ENGINE as AudioEngine };
  }
  return cfg;
}

/** Persist a new backend config to the DB. */
export async function saveBackendConfig(cfg: BackendConfig): Promise<void> {
  await db.backendConfig.upsert({
    where: { id: "current" },
    create: {
      id: "current",
      activeBackend: cfg.activeBackend,
      openaiBaseUrl: cfg.openaiBaseUrl,
      openaiApiKey: cfg.openaiApiKey,
      openaiModel: cfg.openaiModel,
      audioEngine: cfg.audioEngine,
      aceStepBaseUrl: cfg.aceStepBaseUrl,
      aceStepModel: cfg.aceStepModel,
      prMcpUrl: cfg.prMcpUrl,
      prApiKey: cfg.prApiKey,
      prRef: cfg.prRef,
      publicBaseUrl: cfg.publicBaseUrl,
      courseUrl: cfg.courseUrl,
      ytClientId: cfg.ytClientId,
      ytClientSecret: cfg.ytClientSecret,
      ytRefreshToken: cfg.ytRefreshToken,
      ytChannelId: cfg.ytChannelId,
      ytChannelTitle: cfg.ytChannelTitle,
      ytPrivacy: cfg.ytPrivacy,
      upApiKey: cfg.upApiKey,
      upUser: cfg.upUser,
      upPlatforms: cfg.upPlatforms,
      upFacebookPageId: cfg.upFacebookPageId,
      autoEnabled: cfg.autoEnabled,
      autoIntervalMin: cfg.autoIntervalMin,
      autoPublish: cfg.autoPublish,
      autoChatId: cfg.autoChatId,
      fishApiKey: cfg.fishApiKey,
      fishJoeVoiceId: cfg.fishJoeVoiceId,
      fishGuestVoiceId: cfg.fishGuestVoiceId,
      morningEnabled: cfg.morningEnabled,
      morningHour: cfg.morningHour,
      morningCount: cfg.morningCount,
      morningTimeZone: cfg.morningTimeZone,
    },
    update: {
      activeBackend: cfg.activeBackend,
      openaiBaseUrl: cfg.openaiBaseUrl,
      openaiApiKey: cfg.openaiApiKey,
      openaiModel: cfg.openaiModel,
      audioEngine: cfg.audioEngine,
      aceStepBaseUrl: cfg.aceStepBaseUrl,
      aceStepModel: cfg.aceStepModel,
      prMcpUrl: cfg.prMcpUrl,
      prApiKey: cfg.prApiKey,
      prRef: cfg.prRef,
      publicBaseUrl: cfg.publicBaseUrl,
      courseUrl: cfg.courseUrl,
      ytClientId: cfg.ytClientId,
      ytClientSecret: cfg.ytClientSecret,
      ytRefreshToken: cfg.ytRefreshToken,
      ytChannelId: cfg.ytChannelId,
      ytChannelTitle: cfg.ytChannelTitle,
      ytPrivacy: cfg.ytPrivacy,
      upApiKey: cfg.upApiKey,
      upUser: cfg.upUser,
      upPlatforms: cfg.upPlatforms,
      upFacebookPageId: cfg.upFacebookPageId,
      autoEnabled: cfg.autoEnabled,
      autoIntervalMin: cfg.autoIntervalMin,
      autoPublish: cfg.autoPublish,
      autoChatId: cfg.autoChatId,
      fishApiKey: cfg.fishApiKey,
      fishJoeVoiceId: cfg.fishJoeVoiceId,
      fishGuestVoiceId: cfg.fishGuestVoiceId,
      morningEnabled: cfg.morningEnabled,
      morningHour: cfg.morningHour,
      morningCount: cfg.morningCount,
      morningTimeZone: cfg.morningTimeZone,
    },
  });
}

/**
 * Run a chat completion against the active backend.
 * Both backends take the same shape: a system message + a user message, and
 * return a single assistant string.
 */
export async function chat(
  system: string,
  user: string,
  cfg: BackendConfig
): Promise<ChatResult> {
  if (cfg.activeBackend === "openai-compat") {
    return chatOpenAICompat(system, user, cfg);
  }
  return chatZai(system, user);
}

// ---------------- Z.AI ----------------

async function chatZai(system: string, user: string): Promise<ChatResult> {
  const zai = await ZAI.create();
  const completion = await zai.chat.completions.create({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    thinking: { type: "disabled" },
  });
  const content = completion.choices[0]?.message?.content ?? "";
  // The Z.ai SDK doesn't expose the model name cleanly, so we report a stable
  // label. (You can change this if your deployment pins a specific model.)
  return { content, model: "zai-glm", backend: "zai" };
}

// ---------------- OpenAI-compatible ----------------

type MessageContent = string | Array<{ type?: string; text?: string }>;

interface OpenAIChatResponse {
  choices?: Array<{
    message?: {
      content?: MessageContent | null;
      /** Reasoning models put their scratchpad here, not in `content`. */
      reasoning_content?: string;
      reasoning?: string;
    };
    finish_reason?: string;
  }>;
  model?: string;
  error?: { message?: string; type?: string; code?: string };
  usage?: {
    completion_tokens?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
  };
}

interface ChatAttempt {
  content: string;
  model?: string;
  finishReason?: string;
  usage?: OpenAIChatResponse["usage"];
}

/** Error from a non-2xx chat completion response, with the status kept. */
class BackendHttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "BackendHttpError";
  }
}

/**
 * The visible text of an assistant message. Newer OpenAI-compatible servers
 * may return `content` as an array of parts rather than a single string.
 */
function messageText(content: MessageContent | null | undefined): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "string" ? part : part?.text ?? ""))
      .join("");
  }
  return "";
}

/** Describe why a completion came back with nothing to show. */
function emptyResponseDetail(attempt: ChatAttempt): string {
  const bits: string[] = [];
  if (attempt.finishReason) bits.push(`finish_reason: ${attempt.finishReason}`);
  const reasoning = attempt.usage?.completion_tokens_details?.reasoning_tokens;
  if (reasoning) bits.push(`${reasoning} reasoning tokens`);
  const completion = attempt.usage?.completion_tokens;
  if (completion) bits.push(`${completion} completion tokens`);
  return bits.length ? ` (${bits.join(", ")})` : "";
}

/** POST one chat completion and return its visible content plus diagnostics. */
async function postChatCompletion(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>
): Promise<ChatAttempt> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000); // 2-min timeout for slow local models

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new BackendHttpError(
        res.status,
        `Backend returned ${res.status} ${res.statusText}${text ? `: ${text.slice(0, 300)}` : ""}`
      );
    }

    const json = (await res.json()) as OpenAIChatResponse;
    if (json.error) {
      throw new Error(
        `Backend error: ${json.error.message || json.error.type || "unknown"}`
      );
    }
    const choice = json.choices?.[0];
    return {
      content: messageText(choice?.message?.content),
      model: json.model,
      finishReason: choice?.finish_reason,
      usage: json.usage,
    };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("Backend timed out after 120s.");
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

async function chatOpenAICompat(
  system: string,
  user: string,
  cfg: BackendConfig
): Promise<ChatResult> {
  const baseUrl = cfg.openaiBaseUrl.trim().replace(/\/+$/, "");
  if (!baseUrl) {
    throw new Error(
      "OpenAI-compatible backend is selected but no base URL is configured."
    );
  }
  if (!cfg.openaiModel.trim()) {
    throw new Error(
      "OpenAI-compatible backend is selected but no model name is configured."
    );
  }

  const url = `${baseUrl}/chat/completions`;
  const messages = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    // Free ngrok tunnels may serve an HTML warning page to browser-like clients.
    "ngrok-skip-browser-warning": "true",
  };
  if (cfg.openaiApiKey.trim()) {
    headers["Authorization"] = `Bearer ${cfg.openaiApiKey.trim()}`;
  }
  // Some local servers (LM Studio, Ollama) accept "api-key" header too — include both for safety.
  if (cfg.openaiApiKey.trim()) {
    headers["api-key"] = cfg.openaiApiKey.trim();
  }

  // Reasoning models (GPT-5-style, Qwen3, ...) spend part of the completion
  // budget thinking before they write a single visible token. At 4096 the
  // scratchpad can eat the whole budget and the answer arrives empty with
  // finish_reason "length". Joe's JSON is long, so start with headroom for
  // both the reasoning and the song, then retry wider if it still comes back
  // empty (also covers an upstream that occasionally drops a response).
  const legacyBody = (maxTokens: number) => ({
    model: cfg.openaiModel,
    messages,
    temperature: 0.85,
    max_tokens: maxTokens,
    stream: false,
  });
  // Newer models reject `max_tokens` and want `max_completion_tokens`; they
  // also pin temperature to the default, so leave it out of this body.
  const modernBody = (maxTokens: number) => ({
    model: cfg.openaiModel,
    messages,
    max_completion_tokens: maxTokens,
    stream: false,
  });
  const rejectsMaxTokens = (e: unknown) =>
    e instanceof BackendHttpError &&
    e.status === 400 &&
    /max_tokens|max_completion_tokens/i.test(e.message);

  let attempt: ChatAttempt;
  try {
    attempt = await postChatCompletion(url, headers, legacyBody(8192));
  } catch (e) {
    if (!rejectsMaxTokens(e)) throw e;
    attempt = await postChatCompletion(url, headers, modernBody(8192));
  }

  if (!attempt.content.trim()) {
    console.warn(
      `openai-compat returned an empty response${emptyResponseDetail(attempt)}; retrying with a larger budget`
    );
    try {
      attempt = await postChatCompletion(url, headers, modernBody(16000));
    } catch (e) {
      // A backend that predates `max_completion_tokens` rejects it outright;
      // a wider legacy `max_tokens` still buys the answer room.
      if (!(e instanceof BackendHttpError) || e.status !== 400) throw e;
      attempt = await postChatCompletion(url, headers, legacyBody(16000));
    }
  }

  if (!attempt.content.trim()) {
    throw new Error(
      `Backend returned an empty response${emptyResponseDetail(attempt)}. The model likely spent its whole token budget on reasoning.`
    );
  }

  return {
    content: attempt.content,
    model: attempt.model || cfg.openaiModel,
    backend: "openai-compat",
  };
}

// ---------------- Health check ----------------

export interface BackendTestResult {
  ok: boolean;
  backend: BackendKey;
  model?: string;
  message: string;
  latencyMs?: number;
}

/**
 * Smoke-test the active backend by asking it to reply with the single word
 * "OK". Used by the Settings dialog's "Test connection" button.
 */
export async function testBackend(cfg: BackendConfig): Promise<BackendTestResult> {
  const t0 = Date.now();
  try {
    const result = await chat(
      "You are a connectivity test. Reply with the literal text: OK",
      "Reply with the literal text: OK",
      cfg
    );
    const latencyMs = Date.now() - t0;
    const ok = /ok/i.test(result.content.trim().slice(0, 10));
    return {
      ok,
      backend: cfg.activeBackend,
      model: result.model,
      message: ok
        ? `Connected in ${latencyMs}ms via ${result.backend} (${result.model}).`
        : `Backend responded but the reply was unexpected: "${result.content.slice(0, 60)}".`,
      latencyMs,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      backend: cfg.activeBackend,
      message: `Connection failed: ${message}`,
    };
  }
}
