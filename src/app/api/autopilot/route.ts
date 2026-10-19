import { NextResponse } from "next/server";
import { autopilotStatus, runAutopilot } from "@/lib/autopilot";

export const runtime = "nodejs";

/** GET /api/autopilot — scheduler settings, current step and last outcome. */
export async function GET() {
  return NextResponse.json(await autopilotStatus());
}

/**
 * POST /api/autopilot — start one run now (in the background). The run takes
 * minutes; poll GET for progress. 409 if one is already going.
 */
export async function POST() {
  const status = await autopilotStatus();
  if (status.running) {
    return NextResponse.json({ error: "Autopilot is already running.", ...status }, { status: 409 });
  }
  void runAutopilot("manual");
  return NextResponse.json({ ...(await autopilotStatus()), running: true, step: "starting" });
}
