import { NextRequest, NextResponse } from "next/server";
import { processUpdate } from "@/lib/telegram/process";
import { getTelegramConfig, type TelegramUpdate } from "@/lib/telegram/types";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/telegram/webhook
 * Receives Telegram webhook updates and dispatches to the bot handler.
 * Validates the webhook secret header if configured.
 */
export async function POST(req: NextRequest) {
  const config = getTelegramConfig();

  // Validate webhook secret (Telegram sends it as X-Telegram-Bot-Api-Secret-Token)
  if (config.webhookSecret) {
    const secret = req.headers.get("x-telegram-bot-api-secret-token");
    if (secret !== config.webhookSecret) {
      return NextResponse.json({ error: "Invalid secret" }, { status: 403 });
    }
  }

  try {
    const update = (await req.json()) as TelegramUpdate;

    // Process async — Telegram expects a fast 200 response (it will retry /
    // back off if you're slow). We respond immediately and handle the
    // update in the background.
    processUpdate(update).catch((err) => {
      console.error("[telegram] Update handler error:", err);
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[telegram] Webhook error:", error);
    return NextResponse.json({ ok: true }); // Always 200 to Telegram
  }
}
