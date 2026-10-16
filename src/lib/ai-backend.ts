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

export interface BackendConfig {
  activeBackend: BackendKey;
  openaiBaseUrl: string;
  openaiApiKey: string;
  openaiModel: string;
}

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
};

/** Read the current backend config from DB, falling back to env vars. */
export async function loadBackendConfig(): Promise<BackendConfig> {
  // Env wins for headless / pre-configured deployments.
  const envBackend = (process.env.AI_BACKEND as BackendKey | undefined) ?? undefined;
  const envUrl = process.env.OPENAI_BASE_URL;
  const envKey = process.env.OPENAI_API_KEY;
  const envModel = process.env.OPENAI_MODEL;

  if (envBackend || envUrl) {
    return {
      activeBackend: envBackend ?? (envUrl ? "openai-compat" : "zai"),
      openaiBaseUrl: envUrl ?? "",
      openaiApiKey: envKey ?? "",
      openaiModel: envModel ?? "",
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
    },
    update: {
      activeBackend: cfg.activeBackend,
      openaiBaseUrl: cfg.openaiBaseUrl,
      openaiApiKey: cfg.openaiApiKey,
      openaiModel: cfg.openaiModel,
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
