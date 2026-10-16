import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchWallWithItems } from "@/app/api/walls/route";

export const runtime = "nodejs";

/** POST /api/walls/[id]/items — add an episode to the wall's queue. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: wallId } = await params;
  let body: { episodeId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.episodeId) {
    return NextResponse.json({ error: "episodeId is required." }, { status: 400 });
  }

  // Verify wall exists
  const wall = await db.wall.findUnique({ where: { id: wallId } });
  if (!wall) {
    return NextResponse.json({ error: "Wall not found." }, { status: 404 });
  }
  // Verify episode exists
  const episode = await db.episode.findUnique({
    where: { id: body.episodeId },
  });
  if (!episode) {
    return NextResponse.json({ error: "Episode not found." }, { status: 404 });
  }

  // Don't add duplicates — if the episode is already on this wall, just
  // move it to the back.
  const existing = await db.wallItem.findFirst({
    where: { wallId, episodeId: body.episodeId },
  });
  if (existing) {
    const maxOrder = await db.wallItem.aggregate({
      where: { wallId },
      _max: { order: true },
    });
    const nextOrder = (maxOrder._max.order ?? -1) + 1;
    await db.wallItem.update({
      where: { id: existing.id },
      data: { order: nextOrder, status: "queued" },
    });
  } else {
    const maxOrder = await db.wallItem.aggregate({
      where: { wallId },
      _max: { order: true },
    });
    const nextOrder = (maxOrder._max.order ?? -1) + 1;
    await db.wallItem.create({
      data: {
        wallId,
        episodeId: body.episodeId,
        order: nextOrder,
        status: "queued",
      },
    });
  }

  const refreshed = await fetchWallWithItems(wallId);
  return NextResponse.json({ wall: refreshed });
}
