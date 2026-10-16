import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchWallWithItems } from "@/app/api/walls/route";

export const runtime = "nodejs";

/** GET /api/walls/[id] — fetch a wall with its full queue. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const wall = await fetchWallWithItems(id);
  if (!wall) {
    return NextResponse.json({ error: "Wall not found." }, { status: 404 });
  }
  return NextResponse.json({ wall });
}

/** PATCH /api/walls/[id] — update wall metadata (name, brandColor, emoji, tagline). */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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
  const data: Record<string, string> = {};
  if (body.name !== undefined) data.name = body.name.trim();
  if (body.brandColor !== undefined) data.brandColor = body.brandColor.trim();
  if (body.emoji !== undefined) data.emoji = body.emoji.trim();
  if (body.tagline !== undefined) data.tagline = body.tagline.trim();
  const updated = await db.wall.update({
    where: { id },
    data,
    include: { items: true },
  });
  return NextResponse.json({ ok: true });
}

/** DELETE /api/walls/[id] — delete a wall. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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
