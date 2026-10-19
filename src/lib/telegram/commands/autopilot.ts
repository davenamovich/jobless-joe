// /src/lib/telegram/commands/autopilot.ts — /autopilot: Joe makes songs on a timer.
//
//   /autopilot            status
//   /autopilot on [min]   start (default every 60 min); this chat gets the updates
//   /autopilot off        stop
//   /autopilot publish on|off   also film the MP4 and post via Upload-Post
//   /autopilot now        one run right away

import { tg, safeReply } from "../bot";
import type { TelegramMessage } from "../types";
import { escapeHtml } from "../song-flow";
import { loadBackendConfig, saveBackendConfig } from "@/lib/ai-backend";
import { autopilotStatus, runAutopilot } from "@/lib/autopilot";

async function say(chatId: number, text: string) {
  await safeReply(() => tg.sendMessage({ chat_id: chatId, text, parse_mode: "HTML" }), "send autopilot");
}

function statusText(s: Awaited<ReturnType<typeof autopilotStatus>>, upReady: boolean): string {
  const lines = [
    `🤖 <b>Autopilot</b>: ${s.enabled ? `ON — a new song every ${s.intervalMin} min` : "OFF"}`,
    `📤 Auto-publish: ${s.publish ? "ON (MP4 + Upload-Post)" : "off"}${s.publish && !upReady ? " ⚠️ Upload-Post not configured" : ""}`,
  ];
  if (s.running) lines.push(`⏳ Running now: ${escapeHtml(s.step || "starting")}…`);
  if (s.lastRunAt) lines.push(`Last run: ${new Date(s.lastRunAt).toUTCString()}`);
  if (s.lastResult) lines.push(`Result: ${escapeHtml(s.lastResult)}`);
  lines.push("", `<i>/autopilot on [minutes] · off · publish on|off · now</i>`);
  return lines.join("\n");
}

export async function handleAutopilot(args: string[], msg: TelegramMessage) {
  const chatId = msg.chat.id;
  const [sub = "", value = ""] = args.map((a) => a.toLowerCase());
  const cfg = await loadBackendConfig();
  const upReady = !!(cfg.upApiKey.trim() && cfg.upUser.trim());

  if (sub === "on") {
    const minutes = Number(value);
    cfg.autoEnabled = true;
    cfg.autoChatId = String(chatId);
    if (minutes) cfg.autoIntervalMin = Math.min(24 * 60, Math.max(15, Math.round(minutes)));
    await saveBackendConfig(cfg);
  } else if (sub === "off") {
    cfg.autoEnabled = false;
    await saveBackendConfig(cfg);
  } else if (sub === "publish") {
    if (value !== "on" && value !== "off") return say(chatId, `Use <code>/autopilot publish on</code> or <code>off</code>.`);
    cfg.autoPublish = value === "on";
    cfg.autoChatId ||= String(chatId);
    await saveBackendConfig(cfg);
    if (cfg.autoPublish && !upReady) {
      await say(chatId, `⚠️ Add your Upload-Post API key and profile in the app's Backend settings, or posts will fail.`);
    }
  } else if (sub === "now") {
    if (!cfg.autoChatId) {
      cfg.autoChatId = String(chatId);
      await saveBackendConfig(cfg);
    }
    if ((await autopilotStatus()).running) return say(chatId, `⏳ Autopilot is already running.`);
    await say(chatId, `🤖 Autopilot run started — I'll post the result here (a few minutes${cfg.autoPublish ? ", longer with the MP4" : ""}).`);
    // Resolves when the run finishes; it notifies autoChatId itself.
    await runAutopilot("manual");
    return;
  } else if (sub && sub !== "status") {
    return say(chatId, `Unknown option. ${statusText(await autopilotStatus(), upReady)}`);
  }

  await say(chatId, statusText(await autopilotStatus(), upReady));
}
