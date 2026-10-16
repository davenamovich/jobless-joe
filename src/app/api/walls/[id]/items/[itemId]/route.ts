import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchWallWithItems } from "@/app/api/walls/route";

export const runtime = "nodejs";

interface ActionBody {
  action?: "promote" | "demote" | "setStatus" | "moveTo" | "delete";
  status?: "queued" | "playing" | "played";
  toIndex?: number;
}

/** PATCH /api/walls/[id]/items/[itemId] — reorder or update status. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { id: wallId, itemId } = await params;
  let body: ActionBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const item = await db.wallItem.findUnique({ where: { id: itemId } });
  if (!item || item.wallId !== wallId) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  if (body.action === "delete") {
    await db.wallItem.delete({ where: { id: itemId } });
    await compactOrder(wallId);
    const refreshed = await fetchWallWithItems(wallId);
    return NextResponse.json({ wall: refreshed });
  }

  if (body.action === "setStatus" && body.status) {
    // If we're marking something as "playing", clear other playing items first.
    if (body.status === "playing") {
      await db.wallItem.updateMany({
        where: { wallId, status: "playing" },
        data: { status: "played" },
      });
    }
    await db.wallItem.update({
      where: { id: itemId },
      data: { status: body.status },
    });
    const refreshed = await fetchWallWithItems(wallId);
    return NextResponse.json({ wall: refreshed });
  }

  if (body.action === "promote") {
    const items = await db.wallItem.findMany({
      where: { wallId },
      orderBy: { order: "asc" },
    });
    const idx = items.findIndex((i) => i.id === itemId);
    if (idx > 0) {
      const prev = items[idx - 1];
      await db.$transaction([
        db.wallItem.update({ where: { id: item.id }, data: { order: prev.order } }),
        db.wallItem.update({ where: { id: prev.id }, data: { order: item.order } }),
      ]);
    }
    const refreshed = await fetchWallWithItems(wallId);
    return NextResponse.json({ wall: refreshed });
  }

  if (body.action === "demote") {
    const items = await db.wallItem.findMany({
      where: { wallId },
      orderBy: { order: "asc" },
    });
    const idx = items.findIndex((i) => i.id === itemId);
    if (idx >= 0 && idx < items.length - 1) {
      const next = items[idx + 1];
      await db.$transaction([
        db.wallItem.update({ where: { id: item.id }, data: { order: next.order } }),
        db.wallItem.update({ where: { id: next.id }, data: { order: item.order } }),
      ]);
    }
    const refreshed = await fetchWallWithItems(wallId);
    return NextResponse.json({ wall: refreshed });
  }

  if (body.action === "moveTo" && typeof body.toIndex === "number") {
    const items = await db.wallItem.findMany({
      where: { wallId },
      orderBy: { order: "asc" },
    });
    const idx = items.findIndex((i) => i.id === itemId);
    if (idx === -1) {
      return NextResponse.json({ error: "Item not in wall." }, { status: 404 });
    }
    const target = Math.max(0, Math.min(body.toIndex, items.length - 1));
    if (idx !== target) {
      const reordered = [...items];
      const [moved] = reordered.splice(idx, 1);
      reordered.splice(target, 0, moved);
      await db.$transaction(
        reordered.map((it, i) =>
          db.wallItem.update({ where: { id: it.id }, data: { order: i } })
        )
      );
    }
    const refreshed = await fetchWallWithItems(wallId);
    return NextResponse.json({ wall: refreshed });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

/** DELETE /api/walls/[id]/items/[itemId] — remove an item from the wall. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { id: wallId, itemId } = await params;
  await db.wallItem.deleteMany({ where: { id: itemId, wallId } });
  await compactOrder(wallId);
  const refreshed = await fetchWallWithItems(wallId);
  return NextResponse.json({ wall: refreshed });
}

/** Re-pack order values to 0,1,2,... after a delete. */
async function compactOrder(wallId: string) {
  const items = await db.wallItem.findMany({
    where: { wallId },
    orderBy: { order: "asc" },
  });
  await db.$transaction(
    items.map((it, i) =>
      db.wallItem.update({ where: { id: it.id }, data: { order: i } })
    )
  );
}
