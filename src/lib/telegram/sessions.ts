// /src/lib/telegram/sessions.ts — Persist Telegram sessions to a JSON file.
// Lives next to the SQLite DB in db/, which is the joe-db volume in Docker, so
// per-chat prefs (/length, /mood) survive a container restart. Fine up to a
// few thousand users; swap for a Prisma model if it ever needs more.

import type { TelegramSession } from "./types";
import * as fs from "fs";
import * as path from "path";

const SESSION_FILE =
  process.env.TELEGRAM_SESSION_FILE || path.join(process.cwd(), "db", "telegram-sessions.json");

function readAll(): TelegramSession[] {
  try {
    if (!fs.existsSync(SESSION_FILE)) return [];
    const raw = fs.readFileSync(SESSION_FILE, "utf-8");
    return JSON.parse(raw) as TelegramSession[];
  } catch {
    return [];
  }
}

function writeAll(sessions: TelegramSession[]): void {
  try {
    fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
    fs.writeFileSync(SESSION_FILE, JSON.stringify(sessions, null, 2), "utf-8");
  } catch (err) {
    console.error("[telegram.sessions] write failed", err);
  }
}

/** Get or create a session for the given chat. Call this at the top of every handler. */
export function getSession(chatId: number, handle: string, firstName: string): TelegramSession {
  const all = readAll();
  let session = all.find((s) => s.chatId === chatId);
  if (!session) {
    session = {
      chatId,
      telegramHandle: handle,
      firstName,
      step: "idle",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    all.push(session);
    writeAll(all);
  } else {
    // keep handle/name fresh in case they changed
    session.telegramHandle = handle;
    session.firstName = firstName;
    session.updatedAt = Date.now();
    writeAll(all);
  }
  return session;
}

/** Update a session in-place. */
export function updateSession(
  chatId: number,
  patch: Partial<TelegramSession>,
): TelegramSession | null {
  const all = readAll();
  const idx = all.findIndex((s) => s.chatId === chatId);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], ...patch, updatedAt: Date.now() };
  writeAll(all);
  return all[idx];
}

/** Reset a session back to idle (clears multi-step state). */
export function resetSession(chatId: number): void {
  updateSession(chatId, { step: "idle" });
}
