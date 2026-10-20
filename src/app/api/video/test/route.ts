import { NextRequest, NextResponse } from "next/server";
import { loadBackendConfig } from "@/lib/ai-backend";
import { testPrConnection } from "@/lib/pr-mcp";

export const runtime = "nodejs";

/**
 * POST /api/video/test { mcpUrl, apiKey } — check the Plunder & Riffle
 * connection typed into Settings, without saving it first. A blank field falls
 * back to the saved value, the same way PATCH /api/backend/config does.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { mcpUrl?: string; apiKey?: string };
  const saved = await loadBackendConfig();
  const mcpUrl = body.mcpUrl?.trim() || saved.prMcpUrl;
  const apiKey = body.apiKey?.trim() || saved.prApiKey;
  if (!apiKey) {
    return NextResponse.json({ result: { ok: false, message: "Add your P&R API key first." } });
  }
  const result = await testPrConnection({ mcpUrl, apiKey });
  return NextResponse.json({ result });
}
