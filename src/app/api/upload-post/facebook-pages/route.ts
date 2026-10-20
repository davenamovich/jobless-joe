import { NextResponse } from "next/server";
import { loadBackendConfig } from "@/lib/ai-backend";
import { listFacebookPages } from "@/lib/upload-post";

export const runtime = "nodejs";

/** GET /api/upload-post/facebook-pages — the Facebook Pages on the saved Upload-Post profile. */
export async function GET() {
  try {
    const cfg = await loadBackendConfig();
    if (!cfg.upApiKey.trim() || !cfg.upUser.trim()) {
      throw new Error("Save your Upload-Post API key and profile first.");
    }
    return NextResponse.json({ ok: true, pages: await listFacebookPages(cfg.upApiKey.trim(), cfg.upUser.trim()) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
