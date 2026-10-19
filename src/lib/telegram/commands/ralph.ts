// /src/lib/telegram/commands/ralph.ts — Ralph, Joe's head writer, in Telegram.
//   /ralph <message>     chat with Ralph about Joe's season (per-chat memory)
//   /arc                 show the story arc songs follow
//   /arc new [idea]      admin: write a new arc from this chat's Ralph talk + idea
//   /arc season1         admin: back to the built-in Season 1
// Saving or switching an arc restarts the shared story at episode 1.

import { tg, safeReply } from "../bot";
import type { TelegramMessage } from "../types";
import { getSession, updateSession } from "../sessions";
import { escapeHtml } from "../song-flow";
import {
  clearArc,
  generateArc,
  loadArc,
  ralphReply,
  saveArc,
  RALPH_WINDOW,
  type RalphMessage,
} from "@/lib/ralph";
import { resetStoryBible } from "@/lib/story-bible";

async function say(chatId: number, text: string, label: string) {
  await safeReply(() => tg.sendMessage({ chat_id: chatId, text, parse_mode: "HTML" }), label);
}

/** Chats in TELEGRAM_ADMIN_CHAT_IDS may change the shared story. */
export function isAdminChat(chatId: number): boolean {
  return (process.env.TELEGRAM_ADMIN_CHAT_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .includes(String(chatId));
}

function ralphHistory(msg: TelegramMessage): RalphMessage[] {
  const sess = getSession(msg.chat.id, msg.from?.username || "", msg.from?.first_name || "");
  return Array.isArray(sess.ralphChat) ? (sess.ralphChat as RalphMessage[]) : [];
}

export async function handleRalph(args: string[], msg: TelegramMessage) {
  const text = args.join(" ").trim();
  if (!text) {
    await say(
      msg.chat.id,
      `✍️ <b>Ralph</b>, head writer, here. Pitch me something for Joe's next season:\n<i>/ralph Joe's nemesis should be the recruiter bot</i>`,
      "send ralph prompt",
    );
    return;
  }
  const history = [...ralphHistory(msg), { role: "user" as const, text: text.slice(0, 2000) }];
  try {
    const { arc, custom } = await loadArc();
    const reply = await ralphReply(history, custom ? arc : undefined);
    updateSession(msg.chat.id, {
      ralphChat: [...history, { role: "ralph", text: reply }].slice(-RALPH_WINDOW),
    });
    await say(msg.chat.id, `✍️ <b>Ralph:</b> ${escapeHtml(reply)}`, "send ralph reply");
  } catch (err) {
    console.error("[telegram.ralph] chat failed", err);
    await say(msg.chat.id, `😵 Ralph stepped out. Try again in a moment.`, "send ralph error");
  }
}

function arcText(arc: Awaited<ReturnType<typeof loadArc>>["arc"]): string {
  const acts = arc.acts
    .map((act) => {
      const eps = arc.episodes
        .filter((e) => e.act === act.n)
        .map((e) => `   ${arc.episodes.indexOf(e) + 1}. ${escapeHtml(e.label)}`)
        .join("\n");
      return `<b>Act ${act.n}: ${escapeHtml(act.title)}</b>\n${eps}`;
    })
    .join("\n");
  const cast = arc.characters.length > 1
    ? `\n\n🎭 ${arc.characters.map((c) => escapeHtml(c.catchphrase ? `${c.name} — "${c.catchphrase}"` : c.name)).join(" · ")}`
    : "";
  return `📖 <b>${escapeHtml(arc.title)}</b>\n<i>${escapeHtml(arc.premise)}</i>\n\n${acts}${cast}`;
}

export async function handleArc(args: string[], msg: TelegramMessage) {
  const sub = (args[0] || "").toLowerCase();
  const chatId = msg.chat.id;

  if (sub === "new" || sub === "season1") {
    if (!isAdminChat(chatId)) {
      await say(chatId, `Only the show's producer can change Joe's story arc.`, "send arc refused");
      return;
    }
    if (sub === "season1") {
      await clearArc();
      await resetStoryBible();
      const { arc } = await loadArc();
      await say(chatId, `🎬 Back to Season 1. /next plays episode 1.\n\n${arcText(arc)}`, "send arc season1");
      return;
    }
    const idea = args.slice(1).join(" ").trim();
    const history = ralphHistory(msg);
    const messages = idea ? [...history, { role: "user" as const, text: idea }] : history;
    await say(chatId, `✍️ Ralph is writing the season…`, "send arc writing");
    try {
      const { arc: current, custom } = await loadArc();
      const arc = await generateArc(messages, { current: custom ? current : undefined });
      await saveArc(arc);
      await resetStoryBible();
      await say(chatId, `🎬 New arc saved. /next plays episode 1.\n\n${arcText(arc)}`, "send arc saved");
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      await say(chatId, `😵 ${escapeHtml(m)}`, "send arc error");
    }
    return;
  }

  const { arc } = await loadArc();
  await say(chatId, arcText(arc), "send arc");
}
