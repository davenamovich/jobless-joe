import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAudioRendering } from "@/lib/tts-service";

export const runtime = "nodejs";

/** GET /api/audio/[episodeId] — list all generated audio tracks for an episode. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ episodeId: string }> }
) {
  const { episodeId } = await params;
  const tracks = await db.audioTrack.findMany({
    where: { episodeId },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({
    episodeId,
    // True while a render is running in this server process. When it is false
    // and there is no track, the UI can safely (re)start generation.
    rendering: isAudioRendering(episodeId),
    tracks: tracks.map((t) => ({
      id: t.id,
      voice: t.voice,
      format: t.format,
      speed: t.speed,
      durationSec: t.durationSec,
      chunkCount: t.chunkCount,
      audioUrl: t.filePath,
      createdAt: t.createdAt.toISOString(),
    })),
  });
}
