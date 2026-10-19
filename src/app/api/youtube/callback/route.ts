import { NextRequest } from "next/server";
import { completeAuth } from "@/lib/youtube-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function page(title: string, body: string): Response {
  return new Response(
    `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#160e0d;color:#f6ecda;
    font-family:Georgia,'Times New Roman',serif;padding:32px}
  .card{max-width:520px;background:#201414;border:1px solid rgba(246,236,218,.14);border-radius:16px;
    padding:28px 26px;box-shadow:0 20px 60px rgba(0,0,0,.4)}
  h1{font-size:22px;margin:0 0 10px;letter-spacing:-.01em}
  p{margin:0;color:#c9b79e;font-size:15px;line-height:1.6}
  code{font-family:ui-monospace,SFMono-Regular,monospace;font-size:13px;color:#d3a85f}
</style></head>
<body><div class="card"><h1>${title}</h1><p>${body}</p></div></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

/**
 * GET /api/youtube/callback — Google sends the user here after consent.
 * Stores the refresh token, then shows a page the user can close.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";

  if (error) {
    return page(
      "YouTube sign-in was cancelled",
      `Google returned <code>${error}</code>. Nothing was saved — press Connect again when you're ready.`
    );
  }
  if (!code) {
    return page(
      "YouTube sign-in failed",
      "Google sent no authorisation code. Press Connect again from the Backend settings."
    );
  }

  try {
    const channel = await completeAuth(code, state);
    const who = channel.channelTitle
      ? `Connected to <b>${channel.channelTitle}</b>.`
      : "Connected. The channel name couldn't be read yet.";
    return page(
      "YouTube connected",
      `${who} You can close this tab and go back to the studio.`
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sign-in failed.";
    return page("YouTube sign-in failed", message);
  }
}
