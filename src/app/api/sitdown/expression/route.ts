import { NextRequest, NextResponse } from "next/server";
import { addExpressionTags } from "@/lib/expression-tags";

export const runtime = "nodejs";
export const maxDuration = 90;

/** POST /api/sitdown/expression { script, language } — the script with Fish expression tags. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { script?: unknown; language?: unknown };
  const script = String(body.script ?? "").slice(0, 20_000);
  if (!script.trim()) return NextResponse.json({ error: "Write a script first." }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, script: await addExpressionTags(script, typeof body.language === "string" ? body.language : undefined) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
