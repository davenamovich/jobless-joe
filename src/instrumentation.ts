// Runs once when the Next.js server boots. Starts the autopilot ticker
// (Node runtime only — it needs the DB and long-running timers).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startAutopilot } = await import("@/lib/autopilot");
  startAutopilot();
}
