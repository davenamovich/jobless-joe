import { NextRequest, NextResponse } from "next/server";
import {
  clearArc,
  generateArc,
  loadArc,
  normalizeStoredArc,
  ralphReply,
  saveArc,
  type RalphMessage,
} from "@/lib/ralph";
import { resetStoryBible } from "@/lib/story-bible";
import type { StoryArc } from "@/lib/season";

export const runtime = "nodejs";
// Writing a whole season is one long model call.
export const maxDuration = 120;

/** GET /api/story-arc — the arc the songwriter follows, and whether it's custom. */
export async function GET() {
  return NextResponse.json({ ok: true, ...(await loadArc()) });
}

function cleanMessages(raw: unknown): RalphMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((m) => m as Partial<RalphMessage>)
    .filter((m) => (m.role === "user" || m.role === "ralph") && typeof m.text === "string")
    .map((m) => ({ role: m.role!, text: m.text!.slice(0, 2000) }));
}

/**
 * POST /api/story-arc — the writers' room.
 *   { action: "chat", messages }            → { reply }   Ralph's next line
 *   { action: "generate", messages, acts? } → { arc }     a draft season (not saved)
 *   { action: "save", arc }                 → { arc, storyBible }  make it the
 *     active arc and start the story over at its episode 1
 */
export async function POST(req: NextRequest) {
  let body: { action?: string; messages?: unknown; acts?: number; arc?: StoryArc };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  try {
    const messages = cleanMessages(body.messages);
    if (body.action === "chat") {
      const { arc, custom } = await loadArc();
      return NextResponse.json({ ok: true, reply: await ralphReply(messages, custom ? arc : undefined) });
    }
    if (body.action === "generate") {
      const { arc, custom } = await loadArc();
      return NextResponse.json({
        ok: true,
        arc: await generateArc(messages, { actCount: body.acts, current: custom ? arc : undefined }),
      });
    }
    if (body.action === "save") {
      if (!body.arc) return NextResponse.json({ error: "arc is required." }, { status: 400 });
      const arc = normalizeStoredArc(body.arc);
      await saveArc(arc);
      return NextResponse.json({ ok: true, arc, storyBible: await resetStoryBible() });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ralph stepped out. Try again." },
      { status: 502 }
    );
  }
}

/** DELETE /api/story-arc — back to the built-in Season 1, from its episode 1. */
export async function DELETE() {
  await clearArc();
  return NextResponse.json({ ok: true, ...(await loadArc()), storyBible: await resetStoryBible() });
}
