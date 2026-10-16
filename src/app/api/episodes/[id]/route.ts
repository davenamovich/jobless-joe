import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { SongOutput } from "@/lib/joe-prompts";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const row = await db.episode.findUnique({ where: { id } });
  if (!row) {
    return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  }
  let output: SongOutput | null = null;
  try {
    output = JSON.parse(row.output) as SongOutput;
  } catch {
    output = null;
  }
  if (!output) {
    return NextResponse.json(
      { error: "Episode output is corrupted." },
      { status: 500 }
    );
  }
  return NextResponse.json({ output, episode: row });
}
