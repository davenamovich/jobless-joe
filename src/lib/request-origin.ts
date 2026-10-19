import type { NextRequest } from "next/server";

/**
 * The origin the browser actually used.
 *
 * The Google OAuth redirect URI has to match what the user registered in the
 * Cloud Console character for character, and behind a tunnel the request URL
 * Next builds can still look like localhost. So prefer the forwarded headers.
 */
export function requestOrigin(req: NextRequest): string {
  const proto =
    req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "http";
  const host = (
    req.headers.get("x-forwarded-host") ??
    req.headers.get("host") ??
    ""
  )
    .split(",")[0]
    .trim();
  return host ? `${proto}://${host}` : new URL(req.url).origin;
}
