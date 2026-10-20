import { NextRequest, NextResponse } from "next/server";
import {
  clampLetters,
  getViewerLetters,
  writeEveningShow,
  type LetterSource,
  type ViewerLetter,
} from "@/lib/evening-show";

export const runtime = "nodejs";
export const maxDuration = 120;

const SOURCES: LetterSource[] = ["reddit", "madeup", "mix"];

/** GET /api/evening-show?count=4&source=mix — tonight's viewer letters. */
export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  const source = (SOURCES as string[]).includes(params.get("source") ?? "")
    ? (params.get("source") as LetterSource)
    : "mix";
  try {
    return NextResponse.json({ ok: true, letters: await getViewerLetters(clampLetters(params.get("count") ?? 4), source) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

/** POST /api/evening-show { letters } — Joe's show answering them. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { letters?: ViewerLetter[] };
  const letters = (Array.isArray(body.letters) ? body.letters : [])
    .filter((l) => l && typeof l.question === "string" && l.question.trim())
    .slice(0, 6)
    .map((l) => ({
      from: String(l.from ?? "").slice(0, 80),
      question: l.question.trim().slice(0, 500),
      source: String(l.source ?? "made up").slice(0, 40),
    }));
  if (!letters.length) return NextResponse.json({ error: "Pick at least one letter." }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, ...(await writeEveningShow(letters)) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
