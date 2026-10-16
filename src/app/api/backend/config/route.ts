import { NextRequest, NextResponse } from "next/server";
import {
  loadBackendConfig,
  saveBackendConfig,
  type BackendConfig,
  type BackendKey,
} from "@/lib/ai-backend";

export const runtime = "nodejs";

const VALID_BACKENDS: BackendKey[] = ["zai", "openai-compat"];

function sanitize(cfg: Partial<BackendConfig>): BackendConfig {
  const activeBackend: BackendKey = VALID_BACKENDS.includes(
    cfg.activeBackend as BackendKey
  )
    ? (cfg.activeBackend as BackendKey)
    : "zai";
  return {
    activeBackend,
    openaiBaseUrl: (cfg.openaiBaseUrl ?? "").trim(),
    openaiApiKey: (cfg.openaiApiKey ?? "").trim(),
    openaiModel: (cfg.openaiModel ?? "").trim(),
  };
}

/** GET /api/backend/config — current backend configuration. */
export async function GET() {
  const cfg = await loadBackendConfig();
  // Mask the API key for security: show only whether it's set.
  return NextResponse.json({
    config: {
      ...cfg,
      hasApiKey: !!cfg.openaiApiKey,
      apiKeyMasked: cfg.openaiApiKey ? maskKey(cfg.openaiApiKey) : "",
    },
  });
}

/** PATCH /api/backend/config — update backend configuration. */
export async function PATCH(req: NextRequest) {
  let body: Partial<BackendConfig> & { openaiApiKey?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // If the user sent an empty apiKey, that means "keep current" rather than
  // "delete". The masked GET response doesn't include the real key, so the
  // frontend can't re-send what it doesn't know. We treat empty string as
  // "don't change".
  if (body.openaiApiKey === "") {
    const current = await loadBackendConfig();
    body.openaiApiKey = current.openaiApiKey;
  }

  const cfg = sanitize(body);
  await saveBackendConfig(cfg);
  return NextResponse.json({
    ok: true,
    config: {
      ...cfg,
      hasApiKey: !!cfg.openaiApiKey,
      apiKeyMasked: cfg.openaiApiKey ? maskKey(cfg.openaiApiKey) : "",
    },
  });
}

function maskKey(k: string): string {
  if (k.length <= 8) return "•".repeat(k.length);
  return `${k.slice(0, 4)}${"•".repeat(Math.min(20, k.length - 8))}${k.slice(-4)}`;
}
