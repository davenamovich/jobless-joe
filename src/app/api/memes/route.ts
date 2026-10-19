import { NextRequest, NextResponse } from "next/server";
import { renderMemePng, writeMemes, type MemeSource } from "@/lib/joe-memes";
import { songMemeSource } from "@/lib/meme-source";

export const runtime = "nodejs";
export const maxDuration = 90;

/**
 * POST /api/memes — stickman Joe memes, same as /meme in Telegram.
 * Body: { episodeId?: string, topic?: string, count?: 1-5 }
 *   topic set → memes about that; else the episode (or the latest song).
 * Returns PNGs as data URLs, plus the captions.
 */
export async function POST(req: NextRequest) {
  let body: { episodeId?: string; topic?: string; count?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const count = Math.min(5, Math.max(1, Math.round(Number(body.count) || 3)));
  const topic = String(body.topic ?? "").trim().slice(0, 300);

  const source: MemeSource | null = topic ? { topic } : await songMemeSource(body.episodeId);
  if (!source) {
    return NextResponse.json({ error: "No song yet — make one first, or give a topic." }, { status: 404 });
  }

  try {
    const memes = await writeMemes(source, count);
    const out: Array<{ top: string; bottom: string; image: string }> = [];
    for (const m of memes) {
      const png = await renderMemePng(m);
      out.push({ top: m.top, bottom: m.bottom, image: `data:image/png;base64,${png.toString("base64")}` });
    }
    return NextResponse.json({ ok: true, memes: out });
  } catch (e) {
    console.error("meme generation failed", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
