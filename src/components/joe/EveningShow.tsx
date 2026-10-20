"use client";

// "Ask Joe" — the Evening Show: Joe reads viewer letters about work (real
// advice questions from Reddit, made-up ones starring Karen from HR, or a
// mix) and answers them over the top. The show lands in the Sit-down editor
// with its search-led YouTube copy, ready to voice, film and post.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Mail, Moon, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { LetterSource, ViewerLetter } from "@/lib/evening-show";
import type { MorningShowResult } from "./MorningShow";

const COUNTS = [2, 3, 4, 5, 6];
const SOURCES: { key: LetterSource; label: string }[] = [
  { key: "mix", label: "Mix" },
  { key: "reddit", label: "Reddit" },
  { key: "madeup", label: "Made up" },
];

export function EveningShow({ onScript }: { onScript: (show: MorningShowResult) => void }) {
  const [count, setCount] = useState(4);
  const [source, setSource] = useState<LetterSource>("mix");
  const [letters, setLetters] = useState<ViewerLetter[]>([]);
  const [kept, setKept] = useState<Set<number>>(new Set());
  const [pulling, setPulling] = useState(false);
  const [writing, setWriting] = useState(false);

  const pull = async () => {
    setPulling(true);
    try {
      const res = await fetch(`/api/evening-show?count=${count}&source=${source}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status}).`);
      const list = (json.letters ?? []) as ViewerLetter[];
      setLetters(list);
      setKept(new Set(list.map((_, i) => i)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't open the mailbag.");
    } finally {
      setPulling(false);
    }
  };

  const write = async () => {
    setWriting(true);
    try {
      const res = await fetch("/api/evening-show", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ letters: letters.filter((_, i) => kept.has(i)) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status}).`);
      onScript(json as MorningShowResult);
      toast.success("Ask Joe is written. Check it, then make the preview.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Joe couldn't write the show.");
    } finally {
      setWriting(false);
    }
  };

  const toggle = (i: number) =>
    setKept((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground leading-relaxed">
        Ask Joe: viewer letters about work, answered over the top, with one real tip each. Pull real advice questions
        from Reddit, have Joe&apos;s writers make some up (Karen from HR, Chad the manager…), or mix both.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-border/70 overflow-hidden">
          {SOURCES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSource(s.key)}
              className={`px-2.5 py-1 text-xs ${s.key === source ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <select
          className="h-7 rounded-md border border-border/70 bg-card px-1.5 text-xs"
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          aria-label="Number of letters"
        >
          {COUNTS.map((n) => (
            <option key={n} value={n}>
              {n} letters
            </option>
          ))}
        </select>
        <Button size="sm" variant="outline" className="h-8 ml-auto" onClick={pull} disabled={pulling}>
          {pulling ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : letters.length ? (
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          ) : (
            <Mail className="h-3.5 w-3.5 mr-1.5" />
          )}
          {letters.length ? "New letters" : "Open the mailbag"}
        </Button>
      </div>

      {letters.length > 0 && (
        <>
          <ul className="space-y-1.5">
            {letters.map((l, i) => (
              <li key={`${i}-${l.question.slice(0, 40)}`}>
                <label className="flex items-start gap-2 rounded-md border border-border/60 p-2 text-xs cursor-pointer hover:bg-muted/50">
                  <input type="checkbox" className="mt-0.5" checked={kept.has(i)} onChange={() => toggle(i)} />
                  <span className="min-w-0">
                    <span className="block leading-snug">{l.question}</span>
                    <span className="text-[0.7rem] text-muted-foreground">
                      {l.from ? `${l.from} · ` : ""}
                      {l.source === "made up" ? "made up" : `${l.source} (Joe rewrites it anonymously)`}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <Button size="sm" className="h-9 w-full" onClick={write} disabled={writing || kept.size === 0}>
            {writing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Moon className="h-3.5 w-3.5 mr-1.5" />}
            {writing ? "Joe is reading the mail…" : `Write Ask Joe (${kept.size})`}
          </Button>
        </>
      )}
    </div>
  );
}
