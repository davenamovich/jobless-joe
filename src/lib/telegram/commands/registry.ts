// /src/lib/telegram/commands/registry.ts — Command discovery and dispatch.
// Bot commands don't need the leading slash in the registry — the dispatcher strips it.

import type { TelegramMessage } from "../types";

export type CommandHandler = (args: string[], msg: TelegramMessage) => Promise<void>;

const registry = new Map<string, CommandHandler>();

export function register(command: string, handler: CommandHandler): void {
  registry.set(command.toLowerCase(), handler);
}

export async function dispatch(msg: TelegramMessage): Promise<boolean> {
  const text = msg.text || "";
  if (!text.startsWith("/")) return false;

  const parts = text.slice(1).split(/\s+/);
  // In groups Telegram sends "/song@JoeBot" — drop the bot mention.
  const cmd = parts[0].toLowerCase().split("@")[0];
  const args = parts.slice(1);

  const handler = registry.get(cmd);
  if (handler) {
    await handler(args, msg);
    return true;
  }
  return false;
}
