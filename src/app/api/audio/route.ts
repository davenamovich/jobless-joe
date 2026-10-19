import { NextRequest, NextResponse } from "next/server";
import { ensureAudioTrack } from "@/lib/tts-service";
import { VOICES } from "@/lib/voices";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 120; // TTS can be slow on long lyrics

interface Body {
  episodeId?: string;
  voice?: string;
}

/** POST /api/audio — generate (or fetch cached) audio for an episode. */
export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.episodeId) {
    return NextResponse.json({ error: "episodeId is required." }, { status: 400 });
  }
  // No explicit voice: use the configured default so a UI retry re-renders the
  // same track the background job was making (not a second, differently-voiced
  // one).
  let voice = body.voice && VOICES.some((v) => v.key === body.voice)
    ? body.voice!
    : "";
  if (!voice) {
    const cfg = await db.backendConfig.findUnique({ where: { id: "current" } });
    voice = cfg?.defaultVoice || "jam";
  }

  const result = await ensureAudioTrack(body.episodeId, voice);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || "Audio generation failed." },
      { status: 502 }
    );
  }
  return NextResponse.json(result);
}

/** GET /api/audio?episodeId=...&voice=... — fetch an existing audio track. */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const episodeId = url.searchParams.get("episodeId");
  const voice = url.searchParams.get("voice") || "jam";
  if (!episodeId) {
    return NextResponse.json(
      { error: "episodeId query parameter is required." },
      { status: 400 }
    );
  }
  // Lazy import to avoid a circular dep at module-load time.
  const { getAudioTrack } = await import("@/lib/tts-service");
  const track = await getAudioTrack(episodeId, voice);
  if (!track) {
    return NextResponse.json(
      { hasAudio: false, audioUrl: null, durationSec: 0 },
      { status: 200 }
    );
  }
  return NextResponse.json({ hasAudio: true, ...track });
}
