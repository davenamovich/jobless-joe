import { NextResponse } from "next/server";
import { morningAutopilotStatus, runMorningShow } from "@/lib/morning-autopilot";

export const runtime = "nodejs";

/** GET /api/morning-show/autopilot — schedule, current step and last outcome. */
export async function GET() {
  return NextResponse.json(await morningAutopilotStatus());
}

/**
 * POST /api/morning-show/autopilot — make and post one Morning Show now (in
 * the background; it takes several minutes). 409 if one is already going.
 */
export async function POST() {
  const status = await morningAutopilotStatus();
  if (status.running) {
    return NextResponse.json({ error: "The Morning Show is already being made.", ...status }, { status: 409 });
  }
  void runMorningShow("manual");
  return NextResponse.json({ ...(await morningAutopilotStatus()), running: true, step: "starting" });
}
