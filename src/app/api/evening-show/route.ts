import { NextRequest, NextResponse } from "next/server";
import { normalizeSettings, SEGMENT_KINDS, type SegmentKind } from "@/lib/ask-joe";
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

/** Ask Joe's settings from the browser (JSON in a query param), or null for the plain mailbag. */
function settingsParam(raw: string | null) {
  if (!raw) return undefined;
  try {
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

/** GET /api/evening-show?count=4&source=mix&language=es&settings={…} — tonight's viewer letters. */
export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  const source = (SOURCES as string[]).includes(params.get("source") ?? "")
    ? (params.get("source") as LetterSource)
    : "mix";
  try {
    return NextResponse.json({ ok: true, letters: await getViewerLetters(clampLetters(params.get("count") ?? 4), source, params.get("language") ?? undefined, settingsParam(params.get("settings"))) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

/**
 * POST /api/evening-show { letters, language, settings?, segment? } — Joe's show.
 * `segment` ({ kind, topic?, notes? }) picks a segment other than the mailbag
 * (start using AI, videos for a penny, first access, in the news), which needs
 * no letters.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { letters?: ViewerLetter[]; language?: unknown; settings?: unknown; segment?: { kind?: unknown; topic?: unknown; notes?: unknown } };
  const kind = (SEGMENT_KINDS as readonly string[]).includes(String(body.segment?.kind)) ? (body.segment!.kind as SegmentKind) : "letters";
  const segment = { kind, topic: String(body.segment?.topic ?? "").slice(0, 140), notes: String(body.segment?.notes ?? "").slice(0, 500) };
  const settings = body.settings ? normalizeSettings(body.settings) : undefined;
  const letters = (Array.isArray(body.letters) ? body.letters : [])
    .filter((l) => l && typeof l.question === "string" && l.question.trim())
    .slice(0, 6)
    .map((l) => ({
      from: String(l.from ?? "").slice(0, 80),
      question: l.question.trim().slice(0, 500),
      source: String(l.source ?? "made up").slice(0, 40),
    }));
  if (!letters.length && kind === "letters") return NextResponse.json({ error: "Pick at least one letter." }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, ...(await writeEveningShow(letters, typeof body.language === "string" ? body.language : undefined, { settings, segment })) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
