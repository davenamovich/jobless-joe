"use client";

import { useMemo } from "react";

/**
 * Renders Jobless Joe lyrics with the inline [INTRO], [VERSE 1], [CHORUS]...
 * section tags styled as little brass chips. Lines outside of any tag are
 * rendered as ordinary lyric lines.
 *
 * The lyrics string arrives from the LLM with bracketed section headers on
 * their own line, e.g.:
 *
 *   [VERSE 1]
 *   He walked into the recruiter's door,
 *   They asked him for his LinkedIn score...
 *
 *   [CHORUS]
 *   Oh, the rejection letter blues...
 */
export function LyricsView({ lyrics }: { lyrics: string }) {
  const blocks = useMemo(() => parseLyrics(lyrics), [lyrics]);

  return (
    <div className="lyrics-block space-y-4 text-[0.95rem] leading-relaxed">
      {blocks.map((block, i) => (
        <section key={i} className="space-y-1">
          {block.tag && (
            <div data-tag className="text-[0.7rem] font-semibold tracking-wider uppercase">
              {block.tag}
            </div>
          )}
          {block.lines.map((line, j) => (
            <p key={j} className="text-foreground/90 pl-2 border-l-2 border-primary/20">
              {line || "\u00A0"}
            </p>
          ))}
        </section>
      ))}
    </div>
  );
}

function parseLyrics(raw: string): { tag: string | null; lines: string[] }[] {
  const lines = raw.split(/\r?\n/);
  const out: { tag: string | null; lines: string[] }[] = [];
  let current: { tag: string | null; lines: string[] } = { tag: null, lines: [] };

  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(/^\[([A-Z][A-Z0-9 ]*?)\]$/i);
    if (match) {
      if (current.lines.length || current.tag) out.push(current);
      current = { tag: match[1].toUpperCase(), lines: [] };
    } else {
      current.lines.push(trimmed);
    }
  }
  if (current.lines.length || current.tag) out.push(current);
  return out;
}
