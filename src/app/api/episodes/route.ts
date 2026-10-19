import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { SongOutput } from "@/lib/joe-prompts";

export const runtime = "nodejs";

export async function GET() {
  const rows = await db.episode.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  const episodes = rows.map((r) => {
    let output: SongOutput | null = null;
    try {
      output = JSON.parse(r.output) as SongOutput;
    } catch {
      output = null;
    }
    return {
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      episodeTheme: r.episodeTheme,
      episodeLabel: r.episodeLabel,
      customTopic: r.customTopic,
      // The script itself stays in the detail route — the list only needs to
      // show that one exists.
      hasScript: Boolean(r.customScript && r.customScript.trim()),
      duration: r.duration,
      intensity: r.intensity,
      target: r.target,
      croonerStyle: r.croonerStyle,
      language: r.language,
      backend: r.backend,
      backendModel: r.backendModel,
      action: r.action,
      title: r.title,
      teaser: r.teaser,
      nextTitle: r.nextTitle,
      closingLine: output?.closingLine ?? "",
      hooks: output?.hooks ?? [],
      lyrics: output?.lyrics ?? "",
    };
  });

  return NextResponse.json({ episodes });
}
