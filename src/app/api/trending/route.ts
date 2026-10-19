import { NextRequest, NextResponse } from "next/server";
import { getTrendingIdeas } from "@/lib/trending";

export const runtime = "nodejs";
export const maxDuration = 90;

/**
 * GET /api/trending — song ideas from today's trends (cached an hour).
 * ?refresh=1 pulls fresh trends.
 */
export async function GET(req: NextRequest) {
  const refresh = new URL(req.url).searchParams.has("refresh");
  try {
    return NextResponse.json({ ok: true, ...(await getTrendingIdeas({ refresh })) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
