"use client";

// "Post to socials" for any finished MP4 — sends it through Upload-Post
// (POST /api/upload-post) and polls until each platform reports back.
//   variant="button"  full button + a status chip per platform
//   variant="pill"    tiny overlay pill, sized to sit beside "YouTube ↑"
// The button variant can also schedule the post for a later date and time.

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CalendarClock, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

interface PostResult {
  platform: string;
  success?: boolean;
  status?: string;
  message?: string;
  url?: string;
  skipped?: boolean;
}

function postState(r: PostResult): { icon: string; label: string } {
  if (r.skipped) return { icon: "⏭️", label: "not connected" };
  if (r.success === false || r.status === "failed") return { icon: "❌", label: r.message || "failed" };
  if (r.success || r.status === "completed") return { icon: "✅", label: "posted" };
  if (r.status === "scheduled") return { icon: "🗓️", label: "scheduled" };
  return { icon: "⏳", label: r.status || "queued" };
}

interface Props {
  mp4Url: string;
  title: string;
  /** Lets the server send this song's YouTube SEO title/description/tags. */
  episodeId?: string;
  /** YouTube copy for a video without an episode (e.g. the Morning Show). */
  youtube?: { title: string; description: string; tags: string[] };
  variant?: "button" | "pill";
  className?: string;
}

export function PostToSocials({ mp4Url, title, episodeId, youtube, variant = "button", className = "" }: Props) {
  const [posting, setPosting] = useState(false);
  const [results, setResults] = useState<PostResult[]>([]);
  const [status, setStatus] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const [when, setWhen] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A different video starts clean.
  useEffect(() => {
    setResults([]);
    setStatus("");
    setScheduledFor("");
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [mp4Url]);

  const poll = (requestId: string, tries = 0) => {
    pollRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/upload-post?requestId=${encodeURIComponent(requestId)}`);
        const json = await res.json().catch(() => ({}));
        if (json.results?.length) setResults(json.results);
        if (json.status) setStatus(json.status);
        if (json.status === "completed" || json.status === "failed" || tries >= 30) return;
      } catch {
        /* a network blip — keep checking */
      }
      poll(requestId, tries + 1);
    }, 10_000);
  };

  const post = async () => {
    if (!mp4Url || posting) return;
    const schedule =
      variant === "button" && scheduling
        ? { date: when, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }
        : undefined;
    if (schedule && !when) {
      toast.error("Pick a date and time to schedule the post.");
      return;
    }
    setPosting(true);
    setResults([]);
    setScheduledFor("");
    try {
      const res = await fetch("/api/upload-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mp4Url, title, episodeId, youtube, schedule }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || `Request failed (${res.status}).`);
      setStatus(out.status);
      setResults(out.results?.length ? out.results : (out.platforms ?? []).map((platform: string) => ({ platform })));
      if (out.status === "scheduled") {
        setScheduledFor(out.scheduledFor ?? when);
        toast.success(`Scheduled for ${out.scheduledFor ?? when} on ${(out.platforms ?? []).join(", ")}.`);
        return;
      }
      toast.success(`Posting to ${(out.platforms ?? []).join(", ")}.`);
      if (out.status !== "completed") poll(out.requestId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't post to socials.");
    } finally {
      setPosting(false);
    }
  };

  const posted = results.length > 0;

  if (variant === "pill") {
    const summary = results.map((r) => `${postState(r).icon} ${r.platform}`).join("  ");
    return (
      <button
        onClick={post}
        disabled={posting}
        title={posted ? `${summary}\n(click to post again)` : "Post to socials via Upload-Post"}
        className={`rounded-full bg-black/70 px-2 py-0.5 text-[0.5rem] font-semibold uppercase tracking-wider text-white/90 backdrop-blur-sm hover:bg-black/85 disabled:opacity-60 ${className}`}
      >
        {posting ? "Posting…" : posted ? (status === "completed" ? "Socials ✓" : "Socials ⏳") : "Socials ↑"}
      </button>
    );
  }

  return (
    <>
      <Button size="sm" className={`h-8 ${className}`} onClick={post} disabled={posting}>
        {posting ? (
          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
        ) : scheduling ? (
          <CalendarClock className="h-3.5 w-3.5 mr-1.5" />
        ) : (
          <Send className="h-3.5 w-3.5 mr-1.5" />
        )}
        {posting ? "Posting…" : scheduling ? "Schedule post" : posted ? "Post again" : "Post to socials"}
      </Button>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <input type="checkbox" checked={scheduling} onChange={(e) => setScheduling(e.target.checked)} />
        Schedule
      </label>
      {scheduling && (
        <input
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className="h-8 rounded-md border border-input bg-card px-2 text-xs"
        />
      )}
      {posted && (
        <div className="basis-full flex flex-wrap items-center gap-1.5 text-[0.7rem]">
          <span className="text-muted-foreground">
            Upload-Post{scheduledFor ? ` · scheduled for ${scheduledFor}` : status ? ` · ${status}` : ""}:
          </span>
          {results.map((r) => {
            const s = postState(r);
            const chip = (
              <span title={s.label} className="rounded-full border border-border/60 px-2 py-0.5">
                {s.icon} {r.platform}
              </span>
            );
            return r.url ? (
              <a key={r.platform} href={r.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                {chip}
              </a>
            ) : (
              <span key={r.platform}>{chip}</span>
            );
          })}
        </div>
      )}
    </>
  );
}
