import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  DEFAULT_WALL_SEED,
  type WallSummary,
  type WallWithItems,
  type WallItemSummary,
} from "@/lib/walls";
import type { SongOutput } from "@/lib/joe-prompts";

export const runtime = "nodejs";

async function ensureDefaultWall() {
  const anyWall = await db.wall.findFirst();
  if (anyWall) return anyWall;
  return db.wall.create({ data: DEFAULT_WALL_SEED });
}

function toSummary(w: {
  id: string;
  name: string;
  brandColor: string;
  emoji: string;
  tagline: string;
  createdAt: Date;
  items: unknown[];
}): WallSummary {
  return {
    id: w.id,
    name: w.name,
    brandColor: w.brandColor,
    emoji: w.emoji,
    tagline: w.tagline,
    itemCount: w.items?.length ?? 0,
    createdAt: w.createdAt.toISOString(),
  };
}

/** GET /api/walls  — list all walls. Auto-seeds the default Joe wall if empty. */
export async function GET() {
  await ensureDefaultWall();
  const walls = await db.wall.findMany({
    orderBy: { createdAt: "asc" },
    include: { items: true },
  });
  return NextResponse.json({
    walls: walls.map(toSummary),
  });
}

/** POST /api/walls  — create a new branded wall. */
export async function POST(req: NextRequest) {
  let body: {
    name?: string;
    brandColor?: string;
    emoji?: string;
    tagline?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Wall name is required." }, { status: 400 });
  }
  const wall = await db.wall.create({
    data: {
      name: body.name.trim(),
      brandColor: body.brandColor?.trim() || "#722F37",
      emoji: body.emoji?.trim() || "🎙️",
      tagline: body.tagline?.trim() || "",
    },
    include: { items: true },
  });
  return NextResponse.json({ wall: toSummary(wall) });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id." }, { status: 400 });
  }
  // Never delete the last wall — always keep at least one.
  const count = await db.wall.count();
  if (count <= 1) {
    return NextResponse.json(
      { error: "Cannot delete the last wall." },
      { status: 400 }
    );
  }
  await db.wall.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

/** Helper used by other routes — fetch a wall with its items + joined episode data. */
export async function fetchWallWithItems(
  wallId: string
): Promise<WallWithItems | null> {
  const wall = await db.wall.findUnique({
    where: { id: wallId },
    include: { items: { orderBy: { order: "asc" } } },
  });
  if (!wall) return null;

  // Hydrate episode fields manually since Prisma doesn't have a relation here.
  const episodeIds = wall.items.map((i) => i.episodeId);
  const episodes = await db.episode.findMany({ where: { id: { in: episodeIds } } });
  const epById = new Map(episodes.map((e) => [e.id, e]));

  const items: WallItemSummary[] = [];
  for (const it of wall.items) {
    const ep = epById.get(it.episodeId);
    let closingLine = "";
    let teaser = it.episodeId; // fallback
    let title = it.episodeId;
    let duration = "";
    let intensity = "";
    let action = "";
    if (ep) {
      title = ep.title;
      duration = ep.duration;
      intensity = ep.intensity;
      action = ep.action;
      teaser = ep.teaser;
      try {
        const out: SongOutput = JSON.parse(ep.output);
        closingLine = out.closingLine ?? "";
      } catch {
        closingLine = "";
      }
    }
    items.push({
      id: it.id,
      wallId: it.wallId,
      episodeId: it.episodeId,
      order: it.order,
      status: it.status as WallItemSummary["status"],
      createdAt: it.createdAt.toISOString(),
      episodeTitle: title,
      episodeDuration: duration,
      episodeTeaser: teaser,
      episodeClosingLine: closingLine,
      episodeAction: action,
      episodeIntensity: intensity,
    });
  }
  return {
    ...toSummary({ ...wall, items }),
    items,
  };
}
