import { NextRequest, NextResponse } from "next/server";
import {
  ACE_STEP_DEFAULT_MODEL,
  ACE_STEP_DEFAULT_URL,
  COURSE_DEFAULT_URL,
  PR_MCP_DEFAULT_URL,
  loadBackendConfig,
  saveBackendConfig,
  type AudioEngine,
  type BackendConfig,
  type BackendKey,
} from "@/lib/ai-backend";

export const runtime = "nodejs";

const VALID_BACKENDS: BackendKey[] = ["zai", "openai-compat"];
const VALID_AUDIO_ENGINES: AudioEngine[] = ["zai", "acestep"];
const VALID_YT_PRIVACY = ["unlisted", "public", "private"];

/** Accept "host:8001", "http://host:8001/v1", or a full ngrok URL. */
function normalizeAceBase(raw: string): string {
  let url = raw.trim().replace(/\/+$/, "");
  url = url.replace(/\/v1$/i, "");
  if (url && !/^https?:\/\//i.test(url)) url = `http://${url}`;
  return url || ACE_STEP_DEFAULT_URL;
}

/** Trim a URL and drop trailing slashes; a bare host gets https. */
function normalizeUrl(raw: string, fallback = ""): string {
  let url = (raw ?? "").trim().replace(/\/+$/, "");
  if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url || fallback;
}

function sanitize(cfg: Partial<BackendConfig>): BackendConfig {
  const activeBackend: BackendKey = VALID_BACKENDS.includes(
    cfg.activeBackend as BackendKey
  )
    ? (cfg.activeBackend as BackendKey)
    : "zai";
  const audioEngine: AudioEngine = VALID_AUDIO_ENGINES.includes(
    cfg.audioEngine as AudioEngine
  )
    ? (cfg.audioEngine as AudioEngine)
    : "zai";
  return {
    activeBackend,
    openaiBaseUrl: (cfg.openaiBaseUrl ?? "").trim(),
    openaiApiKey: (cfg.openaiApiKey ?? "").trim(),
    openaiModel: (cfg.openaiModel ?? "").trim(),
    audioEngine,
    aceStepBaseUrl: normalizeAceBase(cfg.aceStepBaseUrl ?? ""),
    aceStepModel: (cfg.aceStepModel ?? "").trim() || ACE_STEP_DEFAULT_MODEL,
    prMcpUrl: normalizeUrl(cfg.prMcpUrl ?? "", PR_MCP_DEFAULT_URL),
    prApiKey: (cfg.prApiKey ?? "").trim(),
    prRef: (cfg.prRef ?? "").trim().replace(/^\?ref=/, ""),
    publicBaseUrl: normalizeUrl(cfg.publicBaseUrl ?? ""),
    courseUrl: normalizeUrl(cfg.courseUrl ?? "", COURSE_DEFAULT_URL),
    ytClientId: (cfg.ytClientId ?? "").trim(),
    ytClientSecret: (cfg.ytClientSecret ?? "").trim(),
    ytRefreshToken: (cfg.ytRefreshToken ?? "").trim(),
    ytChannelId: (cfg.ytChannelId ?? "").trim(),
    ytChannelTitle: (cfg.ytChannelTitle ?? "").trim(),
    ytPrivacy: VALID_YT_PRIVACY.includes(cfg.ytPrivacy ?? "")
      ? (cfg.ytPrivacy as string)
      : "unlisted",
  };
}

/** Never hand API keys to the browser — only whether they exist. */
function publicConfig(cfg: BackendConfig) {
  const { openaiApiKey, prApiKey, ytClientSecret, ytRefreshToken, ...rest } = cfg;
  return {
    ...rest,
    hasApiKey: !!openaiApiKey,
    apiKeyMasked: openaiApiKey ? maskKey(openaiApiKey) : "",
    hasPrKey: !!prApiKey,
    prKeyMasked: prApiKey ? maskKey(prApiKey) : "",
    hasYtClient: !!cfg.ytClientId,
    ytSecretMasked: ytClientSecret ? maskKey(ytClientSecret) : "",
    /** A saved refresh token means the consent flow already succeeded. */
    ytConnected: !!ytRefreshToken,
  };
}

/** GET /api/backend/config — current backend configuration. */
export async function GET() {
  const cfg = await loadBackendConfig();
  return NextResponse.json({ config: publicConfig(cfg) });
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
  // Merge onto the saved config so a partial PATCH can't silently reset the
  // fields it didn't send. A blank/absent key always means "keep the saved
  // one" — the browser never receives the real key, so it can't resend it.
  const current = await loadBackendConfig();
  const merged: Partial<BackendConfig> = { ...current, ...body };
  if (!body.openaiApiKey) merged.openaiApiKey = current.openaiApiKey;
  if (!body.prApiKey) merged.prApiKey = current.prApiKey;
  // Same rule for the YouTube client secret: blank = keep the saved one.
  if (!body.ytClientSecret) merged.ytClientSecret = current.ytClientSecret;

  const cfg = sanitize(merged);
  await saveBackendConfig(cfg);
  return NextResponse.json({ ok: true, config: publicConfig(cfg) });
}

function maskKey(k: string): string {
  if (k.length <= 8) return "•".repeat(k.length);
  return `${k.slice(0, 4)}${"•".repeat(Math.min(20, k.length - 8))}${k.slice(-4)}`;
}
