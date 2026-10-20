import { NextRequest, NextResponse } from "next/server";
import { normalizeChat, normalizeFacts, songBriefFromChat } from "@/lib/joe-chat";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/joe-chat/song { messages, facts } — the topic for "Make it a song":
 * a brief written from the whole conversation, not just the last message.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const messages = normalizeChat(body.messages);
  if (!messages.some((m) => m.role === "user")) {
    return NextResponse.json({ error: "Tell Joe something first." }, { status: 400 });
  }
  const topic = await songBriefFromChat({ messages, facts: normalizeFacts(body.facts) });
  return NextResponse.json({ ok: true, topic });
}
