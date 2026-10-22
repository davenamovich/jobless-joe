import { NextRequest, NextResponse } from "next/server";
import { normalizeSettings, normalizeTurns } from "@/lib/ask-joe";
import { planSegment } from "@/lib/ask-joe-server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/evening-show/chat { messages, settings } — the writers' room.
 * The browser keeps the conversation (roles are normalised so a client can only
 * send "user" and "joe" turns). Returns the head writer's reply and, once there
 * is enough to go on, the segment plan to write: { kind, topic, notes, letters }.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { messages?: unknown; settings?: unknown };
  const turns = normalizeTurns(body.messages);
  if (turns.at(-1)?.role !== "user") return NextResponse.json({ error: "Say something to the writers first." }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, ...(await planSegment(turns, normalizeSettings(body.settings))) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
