// /src/lib/telegram/commands/help.ts
import { showMainMenu } from "../bot";
import type { TelegramMessage } from "../types";

export async function handleHelp(_args: string[], msg: TelegramMessage) {
  await showMainMenu(msg.chat.id);
}
