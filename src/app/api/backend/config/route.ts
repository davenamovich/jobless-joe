import { NextRequest, NextResponse } from "next/server";
import {
  ACE_STEP_DEFAULT_MODEL,
  ACE_STEP_DEFAULT_URL,
  COURSE_DEFAULT_URL,
  PR_MCP_DEFAULT_URL,
  AUTO_DEFAULT_INTERVAL_MIN,
  MORNING_DEFAULT_COUNT,
  MORNING_DEFAULT_HOUR,
  UP_DEFAULT_PLATFORMS,
  loadBackendConfig,
  saveBackendConfig,
  type AudioEngine,
  type BackendConfig,
  type BackendKey,
} from "@/lib/ai-backend";
import { parsePlatforms } from "@/lib/upload-post";

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

/** An IANA zone the runtime knows, else "" (server time). */
function validTimeZone(tz: string): string {
  if (!tz) return "";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "";
  }
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
    upApiKey: (cfg.upApiKey ?? "").trim(),
    upUser: (cfg.upUser ?? "").trim(),
    upPlatforms: parsePlatforms(cfg.upPlatforms ?? "").join(",") || UP_DEFAULT_PLATFORMS,
    autoEnabled: !!cfg.autoEnabled,
    // Never faster than every 15 minutes — each run is a full song render.
    autoIntervalMin: Math.min(24 * 60, Math.max(15, Math.round(Number(cfg.autoIntervalMin) || AUTO_DEFAULT_INTERVAL_MIN))),
    autoPublish: !!cfg.autoPublish,
    autoChatId: String(cfg.autoChatId ?? "").trim(),
    fishApiKey: (cfg.fishApiKey ?? "").trim(),
    fishJoeVoiceId: (cfg.fishJoeVoiceId ?? "").trim(),
    fishGuestVoiceId: (cfg.fishGuestVoiceId ?? "").trim(),
    morningEnabled: !!cfg.morningEnabled,
    morningHour: Math.min(23, Math.max(0, Math.round(Number(cfg.morningHour ?? MORNING_DEFAULT_HOUR)) || 0)),
    morningCount: Math.min(10, Math.max(3, Math.round(Number(cfg.morningCount) || MORNING_DEFAULT_COUNT))),
    morningTimeZone: validTimeZone(String(cfg.morningTimeZone ?? "").trim()),
  };
}

/** Never hand API keys to the browser — only whether they exist. */
function publicConfig(cfg: BackendConfig) {
  const { openaiApiKey, prApiKey, ytClientSecret, ytRefreshToken, upApiKey, fishApiKey, ...rest } = cfg;
  return {
    ...rest,
    hasFishKey: !!fishApiKey,
    fishKeyMasked: fishApiKey ? maskKey(fishApiKey) : "",
    hasUpKey: !!upApiKey,
    upKeyMasked: upApiKey ? maskKey(upApiKey) : "",
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
  if (!body.upApiKey) merged.upApiKey = current.upApiKey;
  if (!body.fishApiKey) merged.fishApiKey = current.fishApiKey;

  const cfg = sanitize(merged);
  try {
    await saveBackendConfig(cfg);
  } catch (e) {
    console.error("[backend.config] save failed", e);
    const msg = e instanceof Error ? e.message : String(e);
    // A dev server started before `prisma generate` still holds the old
    // client, which rejects columns added since — say so instead of "500".
    const stale = /Unknown argument|Unknown field|does not exist/i.test(msg);
    return NextResponse.json(
      {
        error: stale
          ? "The database client is out of date — restart the server (after `npx prisma generate` and `npx prisma db push`)."
          : `Couldn't save settings: ${msg.split("\n").filter(Boolean).pop()?.slice(0, 300)}`,
      },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, config: publicConfig(cfg) });
}

function maskKey(k: string): string {
  if (k.length <= 8) return "•".repeat(k.length);
  return `${k.slice(0, 4)}${"•".repeat(Math.min(20, k.length - 8))}${k.slice(-4)}`;
}
