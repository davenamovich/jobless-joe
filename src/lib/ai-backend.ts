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
}

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
};

/** Read the current backend config from DB, falling back to env vars. */
export async function loadBackendConfig(): Promise<BackendConfig> {
  // Env wins for headless / pre-configured deployments.
  const envBackend = (process.env.AI_BACKEND as BackendKey | undefined) ?? undefined;
  const envUrl = process.env.OPENAI_BASE_URL;
  const envKey = process.env.OPENAI_API_KEY;
  const envModel = process.env.OPENAI_MODEL;
  const envAudioEngine =
    process.env.AUDIO_ENGINE === "acestep" || process.env.AUDIO_ENGINE === "zai"
      ? (process.env.AUDIO_ENGINE as AudioEngine)
      : undefined;

  if (envBackend || envUrl) {
    return {
      activeBackend: envBackend ?? (envUrl ? "openai-compat" : "zai"),
      openaiBaseUrl: envUrl ?? "",
      openaiApiKey: envKey ?? "",
      openaiModel: envModel ?? "",
      audioEngine: envAudioEngine ?? DEFAULT_CONFIG.audioEngine,
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
    };
  }

  // Otherwise read from DB (singleton row "current").
  try {
    const row = await db.backendConfig.findUnique({ where: { id: "current" } });
    if (!row) return DEFAULT_CONFIG;
    return {
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
    };
  } catch {
    return DEFAULT_CONFIG;
  }
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

interface OpenAIChatResponse {
  choices?: Array<{
    message?: { content?: string };
  }>;
  model?: string;
  error?: { message?: string; type?: string; code?: string };
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
  const body = {
    model: cfg.openaiModel,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.85,
    max_tokens: 4096,
    stream: false,
  };

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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000); // 2-min timeout for slow local models

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Backend returned ${res.status} ${res.statusText}${text ? `: ${text.slice(0, 300)}` : ""}`
      );
    }

    const json: OpenAIChatResponse = await res.json();
    if (json.error) {
      throw new Error(
        `Backend error: ${json.error.message || json.error.type || "unknown"}`
      );
    }
    const content = json.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) {
      throw new Error("Backend returned an empty response.");
    }
    return {
      content,
      model: json.model || cfg.openaiModel,
      backend: "openai-compat",
    };
  } finally {
    clearTimeout(timeout);
  }
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
