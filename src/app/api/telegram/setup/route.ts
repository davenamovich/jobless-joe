import { NextRequest, NextResponse } from "next/server";
import { getTelegramConfig, telegramApi } from "@/lib/telegram/types";
import { BOT_COMMANDS } from "@/lib/telegram/bot";

/**
 * GET /api/telegram/setup
 * Registers the webhook URL and the "/" command menu with the Telegram Bot API.
 * Call this once after deploying (and again any time the domain changes).
 *
 * Query params:
 *   ?url=https://yourdomain.com/api/telegram/webhook (optional override)
 */
export async function GET(req: NextRequest) {
  const config = getTelegramConfig();

  if (!config.botToken) {
    return NextResponse.json(
      { success: false, error: "TELEGRAM_BOT_TOKEN not set in environment" },
      { status: 500 },
    );
  }

  const webhookUrl = req.nextUrl.searchParams.get("url") || config.webhookUrl;

  if (!webhookUrl) {
    return NextResponse.json(
      { success: false, error: "No webhook URL. Set TELEGRAM_WEBHOOK_URL or pass ?url=..." },
      { status: 400 },
    );
  }

  try {
    const params: Record<string, unknown> = {
      url: webhookUrl,
      allowed_updates: ["message", "callback_query"],
    };

    if (config.webhookSecret) {
      params.secret_token = config.webhookSecret;
    }

    await telegramApi("setWebhook", params);
    await telegramApi("setMyCommands", { commands: BOT_COMMANDS });

    // Verify it's set
    const info = await telegramApi("getWebhookInfo", {});

    return NextResponse.json({
      success: true,
      webhook: webhookUrl,
      commands: BOT_COMMANDS.length,
      info,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to set webhook" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/telegram/setup
 * Removes the webhook (switches back to getUpdates polling mode / disables the bot).
 */
export async function DELETE() {
  const config = getTelegramConfig();

  if (!config.botToken) {
    return NextResponse.json({ success: false, error: "TELEGRAM_BOT_TOKEN not set" }, { status: 500 });
  }

  try {
    await telegramApi("deleteWebhook", {});
    return NextResponse.json({ success: true, message: "Webhook removed" });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to remove webhook" },
      { status: 500 },
    );
  }
}
