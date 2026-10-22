import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { SongOutput } from "@/lib/joe-prompts";
import { chat, loadBackendConfig } from "@/lib/ai-backend";
import { getLanguage } from "@/lib/languages";
import {
  buildBeatRegenPrompt,
  isRetentionKey,
  sanitizeVideoScript,
} from "@/lib/retention-format";

export const runtime = "nodejs";
export const maxDuration = 60;

const REGEN_SYSTEM = `You are the short-form video editor for Jobless Joe, a vintage crooner who sings comedy songs about the job market and learning AI. You rewrite one beat of a video script at a time and reply with JSON only.`;

/**
 * Regenerate ONE beat of an episode's video script (the hook, a rehook, the
 * CTA…) without rewriting the song or the other beats. The episode is
 * updated in place and the new script returned.
 */
export async function POST(req: NextRequest) {
  let body: { episodeId?: string; section?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { episodeId, section } = body;
  if (!episodeId || !isRetentionKey(section)) {
    return NextResponse.json({ error: "episodeId and a valid section are required." }, { status: 400 });
  }

  const row = await db.episode.findUnique({ where: { id: episodeId } });
  if (!row) return NextResponse.json({ error: "Episode not found." }, { status: 404 });
  let output: SongOutput;
  try {
    output = JSON.parse(row.output) as SongOutput;
  } catch {
    return NextResponse.json({ error: "Episode output is corrupted." }, { status: 500 });
  }
  const script = output.videoScript ?? [];

  let raw: string;
  try {
    const result = await chat(
      REGEN_SYSTEM,
      buildBeatRegenPrompt({
        title: output.episodeTitle,
        premise: output.songPremise,
        lyrics: output.lyrics,
        script,
        section,
        note: typeof body.note === "string" ? body.note.slice(0, 500) : undefined,
        language: getLanguage(row.language ?? undefined).label,
      }),
      await loadBackendConfig()
    );
    raw = result.content;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Couldn't rewrite that beat: ${msg}` }, { status: 502 });
  }

  const m = /\{[\s\S]*\}/.exec(raw);
  let parsed: unknown = null;
  try {
    parsed = m ? JSON.parse(m[0]) : null;
  } catch {
    parsed = null;
  }
  const beat = sanitizeVideoScript([{ ...(parsed as object), section }])?.[0];
  if (!beat) {
    return NextResponse.json({ error: "The rewrite came back unusable. Try again." }, { status: 502 });
  }

  const others = script.filter((b) => b.section !== section);
  const videoScript = sanitizeVideoScript([...others, beat]) ?? [beat];
  await db.episode.update({
    where: { id: episodeId },
    data: { output: JSON.stringify({ ...output, videoScript }) },
  });
  return NextResponse.json({ ok: true, beat, videoScript });
}
