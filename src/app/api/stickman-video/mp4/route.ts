import { NextRequest, NextResponse } from "next/server";
import { loadBackendConfig } from "@/lib/ai-backend";
import { getJobStatus, requestMp4, type PrConfig } from "@/lib/pr-mcp";
import { isHereNowPage } from "@/lib/stickman-video";

export const runtime = "nodejs";
// request_mp4 holds the call open up to ~100s before handing back a jobId.
export const maxDuration = 120;

async function client(): Promise<PrConfig> {
  const cfg = await loadBackendConfig();
  if (!cfg.prApiKey.trim()) {
    throw new Error("Add your Plunder & Riffle API key in Backend settings to make MP4s.");
  }
  return { mcpUrl: cfg.prMcpUrl, apiKey: cfg.prApiKey };
}

/**
 * POST /api/stickman-video/mp4 — film an approved stickman preview page to
 * MP4 via Plunder & Riffle (25 credits). Body: { pageUrl }.
 * Returns { mp4Url } when it finished inside the wait, else { jobId } to poll.
 */
export async function POST(req: NextRequest) {
  let body: { pageUrl?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const pageUrl = String(body.pageUrl ?? "").trim();
  // Only our own here.now previews — never spend credits filming any URL.
  if (!isHereNowPage(pageUrl)) {
    return NextResponse.json({ error: "pageUrl must be a here.now stickman preview." }, { status: 400 });
  }
  try {
    const { pack } = await requestMp4(await client(), pageUrl);
    if (pack.mp4Url) return NextResponse.json({ ok: true, mp4Url: pack.mp4Url });
    if (pack.jobId) return NextResponse.json({ ok: true, jobId: pack.jobId });
    return NextResponse.json({ error: "P&R didn't start the render." }, { status: 502 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

/** GET /api/stickman-video/mp4?jobId=... — poll a render (free). */
export async function GET(req: NextRequest) {
  const jobId = new URL(req.url).searchParams.get("jobId")?.trim();
  if (!jobId) return NextResponse.json({ error: "jobId is required." }, { status: 400 });
  try {
    const { pack, status } = await getJobStatus(await client(), "mp4", jobId);
    if (pack.mp4Url) return NextResponse.json({ ok: true, status: "done", mp4Url: pack.mp4Url });
    if (/fail/i.test(status)) return NextResponse.json({ ok: false, status: "failed", error: "The MP4 render failed (credits are refunded)." });
    return NextResponse.json({ ok: true, status: status || "rendering" });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
