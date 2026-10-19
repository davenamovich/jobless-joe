import { NextRequest, NextResponse } from "next/server";
import {
  loadBackendConfig,
  testBackend,
  type BackendConfig,
  type BackendKey,
} from "@/lib/ai-backend";

export const runtime = "nodejs";

const VALID_BACKENDS: BackendKey[] = ["zai", "openai-compat"];

/**
 * POST /api/backend/test — smoke-test the backend config currently typed into
 * the Settings dialog, without saving it first.
 *
 * The dialog leaves `openaiApiKey` blank when the user hasn't changed it, so we
 * fall back to the saved key the same way PATCH /api/backend/config does.
 */
export async function POST(req: NextRequest) {
  let body: Partial<BackendConfig>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const saved = await loadBackendConfig();

  const cfg: BackendConfig = {
    // Everything not about the text model (video, YouTube, Upload-Post,
    // autopilot) carries through from the saved config.
    ...saved,
    activeBackend: VALID_BACKENDS.includes(body.activeBackend as BackendKey)
      ? (body.activeBackend as BackendKey)
      : saved.activeBackend,
    openaiBaseUrl: (body.openaiBaseUrl ?? saved.openaiBaseUrl).trim(),
    openaiApiKey:
      body.openaiApiKey && body.openaiApiKey.trim()
        ? body.openaiApiKey.trim()
        : saved.openaiApiKey,
    openaiModel: (body.openaiModel ?? saved.openaiModel).trim(),
    audioEngine: saved.audioEngine,
    aceStepBaseUrl: saved.aceStepBaseUrl,
    aceStepModel: saved.aceStepModel,
    // Video/CTA settings don't affect the text-model test; carry them through.
    prMcpUrl: saved.prMcpUrl,
    prApiKey: saved.prApiKey,
    prRef: saved.prRef,
    publicBaseUrl: saved.publicBaseUrl,
    courseUrl: saved.courseUrl,
    // YouTube publishing doesn't affect the text-model test either.
    ytClientId: saved.ytClientId,
    ytClientSecret: saved.ytClientSecret,
    ytRefreshToken: saved.ytRefreshToken,
    ytChannelId: saved.ytChannelId,
    ytChannelTitle: saved.ytChannelTitle,
    ytPrivacy: saved.ytPrivacy,
  };

  const result = await testBackend(cfg);
  return NextResponse.json({ result });
}
