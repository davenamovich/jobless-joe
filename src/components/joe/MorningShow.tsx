"use client";

// "Morning Show": pull the morning's top posts about work, jobs and AI, keep
// the ones worth a joke, and have Joe answer the search question behind each
// one. The monologue and its search-led YouTube copy land in the Sit-down
// editor, ready to voice, film and post.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Coffee, Loader2, Newspaper, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { MorningPost } from "@/lib/morning-show";

const COUNTS = [3, 5, 7, 10];

export interface MorningShowResult {
  title: string;
  script: string;
  /** The search question each segment answers. */
  questions: string[];
  youtube: { title: string; description: string; tags: string[] };
}

export function MorningShow({
  onScript,
}: {
  onScript: (show: MorningShowResult) => void;
}) {
  const [count, setCount] = useState(5);
  const [posts, setPosts] = useState<MorningPost[]>([]);
  const [kept, setKept] = useState<Set<number>>(new Set());
  const [pulling, setPulling] = useState(false);
  const [writing, setWriting] = useState(false);

  const pull = async (refresh = false) => {
    setPulling(true);
    try {
      const res = await fetch(
        `/api/morning-show?count=${count}${refresh ? "&refresh=1" : ""}`,
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(json.error || `Request failed (${res.status}).`);
      const list = (json.posts ?? []) as MorningPost[];
      setPosts(list);
      setKept(new Set(list.map((_, i) => i)));
      if (!list.length)
        toast.message("Nothing worth a joke this morning. Try again later.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't pull the posts.");
    } finally {
      setPulling(false);
    }
  };

  const write = async () => {
    const chosen = posts.filter((_, i) => kept.has(i));
    setWriting(true);
    try {
      const res = await fetch("/api/morning-show", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ posts: chosen }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(json.error || `Request failed (${res.status}).`);
      onScript(json as MorningShowResult);
      toast.success("Show written. Check it, then make the preview.");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Joe couldn't write the monologue.",
      );
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
        Today&apos;s top posts from job-hunt and AI Reddit and Hacker News.
        Untick any you want to skip. For each one, Joe answers a question people
        are really searching (from Google autocomplete), and the video gets a
        search-friendly YouTube title, description and tags.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Top</span>
        <div className="flex rounded-md border border-border/70 overflow-hidden">
          {COUNTS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setCount(n)}
              className={`px-2.5 py-1 text-xs ${n === count ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              {n}
            </button>
          ))}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8 ml-auto"
          onClick={() => pull(posts.length > 0)}
          disabled={pulling}
        >
          {pulling ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : posts.length ? (
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          ) : (
            <Newspaper className="h-3.5 w-3.5 mr-1.5" />
          )}
          {posts.length ? "Pull again" : "Pull top posts"}
        </Button>
      </div>

      {posts.length > 0 && (
        <>
          <ul className="space-y-1.5">
            {posts.map((p, i) => (
              <li key={`${p.source}-${p.title}`}>
                <label className="flex items-start gap-2 rounded-md border border-border/60 p-2 text-xs cursor-pointer hover:bg-muted/50">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={kept.has(i)}
                    onChange={() => toggle(i)}
                  />
                  <span className="min-w-0">
                    <span className="block leading-snug">{p.title}</span>
                    <span className="text-[0.7rem] text-muted-foreground">
                      {p.url ? (
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline"
                        >
                          {p.source}
                        </a>
                      ) : (
                        p.source
                      )}
                      {p.score ? ` · ${p.score.toLocaleString()} upvotes` : ""}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <Button
            size="sm"
            className="h-9 w-full"
            onClick={write}
            disabled={writing || kept.size === 0}
          >
            {writing ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Coffee className="h-3.5 w-3.5 mr-1.5" />
            )}
            {writing ? "Joe is writing…" : `Write Joe's show (${kept.size})`}
          </Button>
        </>
      )}
    </div>
  );
}
