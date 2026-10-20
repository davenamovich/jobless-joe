/**
 * Show history: what Joe already said on the Morning Show and Ask Joe, so the
 * next show uses new material. Each written show is stored; the next prompt
 * gets a "do not reuse" block of its letters or posts, title, opening and
 * sign-off. Storage failures never block a show.
 */

import { db } from "@/lib/db";

export type ShowKind = "morning" | "evening";

export interface PastShow {
  title: string;
  items: string[];
  opener: string;
  signoff: string;
}

/** How many past shows the writer is shown. */
export const HISTORY_SIZE = 8;

/** Spoken lines of a script, tags removed, blank lines dropped. */
function spokenLines(script: string): string[] {
  return script
    .split("\n")
    .map((l) => l.replace(/\[[^\]]*\]|<\/?[a-z]+>/gi, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function digestShow(row: { title: string; items: string; script: string }): PastShow {
  let items: string[] = [];
  try {
    const parsed = JSON.parse(row.items);
    if (Array.isArray(parsed)) items = parsed.map(String).filter(Boolean);
  } catch {
    // Old or broken rows still give their title and lines.
  }
  const lines = spokenLines(row.script);
  return {
    title: row.title,
    items,
    opener: lines.slice(0, 2).join(" ").slice(0, 200),
    signoff: lines.slice(-1).join(" ").slice(0, 200),
  };
}

export async function recordShow(kind: ShowKind, show: { title: string; items: string[]; script: string }): Promise<void> {
  try {
    await db.showRecord.create({
      data: { kind, title: show.title.slice(0, 200), items: JSON.stringify(show.items.slice(0, 12)), script: show.script },
    });
  } catch (e) {
    console.warn("[show-history] couldn't save the show", e);
  }
}

export async function recentShows(kind: ShowKind, n = HISTORY_SIZE): Promise<PastShow[]> {
  try {
    const rows = await db.showRecord.findMany({ where: { kind }, orderBy: { createdAt: "desc" }, take: n });
    return rows.map(digestShow);
  } catch (e) {
    console.warn("[show-history] couldn't read past shows", e);
    return [];
  }
}

/** Normalised text for "same letter / same post" checks. */
export function itemKey(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().slice(0, 120);
}

/** The "do not reuse" prompt block, or "" when there's no history. */
export function freshnessNote(past: PastShow[], what: string): string {
  if (!past.length) return "";
  const list = past
    .map((s, i) => {
      const bits = [
        `"${s.title}"`,
        s.items.length ? `${what}: ${s.items.map((t) => `"${t.slice(0, 120)}"`).join("; ")}` : "",
        s.opener ? `opened: "${s.opener}"` : "",
        s.signoff ? `signed off: "${s.signoff}"` : "",
      ].filter(Boolean);
      return `${i + 1}. ${bits.join(" · ")}`;
    })
    .join("\n");
  return `

ALREADY ON THE SHOW (hard rule: new material only)
Joe's last shows are below. Do NOT reuse their ${what}, jokes, comparisons, advice gimmicks, cold open or sign-off, and don't write a title like theirs. If a ${what.replace(/s$/, "")} is close to one already covered, find a different angle on it or a different problem. Every joke tonight is brand new.
${list}`;
}
