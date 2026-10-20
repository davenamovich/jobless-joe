import { NextRequest, NextResponse } from "next/server";
import {
  clampCount,
  getMorningPosts,
  writeMorningMonologue,
  type MorningPost,
} from "@/lib/morning-show";

export const runtime = "nodejs";
export const maxDuration = 90;

/** GET /api/morning-show?count=5&refresh=1 — the morning's top posts. */
export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  try {
    return NextResponse.json({
      ok: true,
      ...(await getMorningPosts(clampCount(params.get("count") ?? 5), {
        refresh: params.has("refresh"),
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}

/**
 * POST /api/morning-show { posts, language } — Joe's search-led monologue about these
 * posts (the ones the user kept). Returns { title, script, questions,
 * youtube } for Sit-down with Joe; `youtube` is the upload copy.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    posts?: MorningPost[];
    language?: unknown;
  };
  const posts = (Array.isArray(body.posts) ? body.posts : [])
    .filter((p) => p && typeof p.title === "string" && p.title.trim())
    .slice(0, 10)
    .map((p) => ({
      title: p.title.trim().slice(0, 300),
      source: String(p.source ?? "").slice(0, 40),
      score: Number(p.score) || 0,
    }));
  if (!posts.length)
    return NextResponse.json(
      { error: "Pick at least one post." },
      { status: 400 },
    );
  try {
    return NextResponse.json({
      ok: true,
      ...(await writeMorningMonologue(
        posts,
        typeof body.language === "string" ? body.language : undefined,
      )),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
