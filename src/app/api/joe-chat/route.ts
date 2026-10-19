import { NextRequest, NextResponse } from "next/server";
import { joeChatReply, normalizeChat, normalizeFacts, songTopicFromChat } from "@/lib/joe-chat";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/joe-chat { messages, facts } — Joe's reply to the last message.
 * The browser keeps the conversation; roles are normalized so a client can
 * only send "user" and "joe" turns. Returns the updated memory and the topic
 * a "Make it a song" button should sing about.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const messages = normalizeChat(body.messages);
  if (messages.at(-1)?.role !== "user") {
    return NextResponse.json({ error: "Say something to Joe first." }, { status: 400 });
  }
  const { reply, memory } = await joeChatReply({ messages, facts: normalizeFacts(body.facts) });
  return NextResponse.json({ ok: true, reply, ...memory, songTopic: songTopicFromChat(memory) });
}
