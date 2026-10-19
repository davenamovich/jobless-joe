import { NextResponse } from "next/server";
import { disconnectYouTube } from "@/lib/youtube-service";

export const runtime = "nodejs";

/** POST /api/youtube/disconnect — forget the saved refresh token. */
export async function POST() {
  try {
    await disconnectYouTube();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not disconnect YouTube." },
      { status: 500 }
    );
  }
}
