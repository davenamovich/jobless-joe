"use client";

// YouTube SEO for one song: search-friendly title, description and tags.
// Nothing is generated until asked ("Write YouTube SEO"); after that the
// copy is saved on the song and used by every YouTube / Upload-Post upload.

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Check, Copy, Loader2, Pencil, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";

interface Seo {
  title: string;
  hook: string;
  summary: string;
  tags: string[];
  hashtags: string[];
  edited?: boolean;
}

interface Copy {
  seo: Seo | null;
  title?: string;
  description?: string;
  tags?: string[];
}

const TITLE_TARGET = 70;
const HOOK_MAX = 150;

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      title={`Copy ${label}`}
      onClick={() =>
        navigator.clipboard
          ?.writeText(text)
          .then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          })
          .catch(() => toast.error("Copy failed — select it by hand."))
      }
      className="rounded p-1 text-muted-foreground hover:text-foreground"
    >
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export function YouTubeSeoCard({ episodeId }: { episodeId: string }) {
  const [copy, setCopy] = useState<Copy | null>(null);
  const [busy, setBusy] = useState<"" | "loading" | "writing" | "saving">("loading");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: "", hook: "", summary: "", tags: "", hashtags: "" });

  useEffect(() => {
    setBusy("loading");
    setEditing(false);
    fetch(`/api/youtube-seo?episodeId=${encodeURIComponent(episodeId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setCopy(j.error ? { seo: null } : j))
      .catch(() => setCopy({ seo: null }))
      .finally(() => setBusy(""));
  }, [episodeId]);

  const call = async (method: "POST" | "PUT", body: object, state: "writing" | "saving") => {
    setBusy(state);
    try {
      const res = await fetch("/api/youtube-seo", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId, ...body }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Request failed.");
      setCopy(j);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't write the SEO copy.");
      return false;
    } finally {
      setBusy("");
    }
  };

  const write = (regenerate = false) => {
    if (regenerate && copy?.seo?.edited && !window.confirm("Replace your edited title and description?")) return;
    call("POST", { regenerate }, "writing");
  };

  const startEdit = () => {
    const s = copy?.seo;
    if (!s) return;
    setDraft({ title: s.title, hook: s.hook, summary: s.summary, tags: s.tags.join(", "), hashtags: s.hashtags.join(" ") });
    setEditing(true);
  };

  const save = async () => {
    const ok = await call(
      "PUT",
      {
        title: draft.title,
        hook: draft.hook,
        summary: draft.summary,
        tags: draft.tags.split(",").map((t) => t.trim()).filter(Boolean),
        hashtags: draft.hashtags.split(/[\s,]+/).filter(Boolean),
      },
      "saving",
    );
    if (ok) {
      setEditing(false);
      toast.success("SEO copy saved — used on the next upload.");
    }
  };

  const seo = copy?.seo;

  return (
    <div className="rounded-xl border border-border/70 bg-card p-4">
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold">YouTube SEO</p>
        {seo?.edited && <span className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">edited</span>}
        {seo && !editing && (
          <div className="ml-auto flex items-center gap-1">
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={startEdit}>
              <Pencil className="h-3 w-3 mr-1" /> Edit
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => write(true)} disabled={!!busy}>
              {busy === "writing" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
              Rewrite
            </Button>
          </div>
        )}
      </div>

      {busy === "loading" ? (
        <p className="mt-2 text-xs text-muted-foreground">Loading…</p>
      ) : !seo ? (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-muted-foreground leading-relaxed">
            A search-friendly title, description and tags for this song. Used automatically when it&apos;s uploaded to
            YouTube — directly or through Upload-Post.
          </p>
          <Button size="sm" className="h-8" onClick={() => write(false)} disabled={!!busy}>
            {busy === "writing" ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Search className="h-3.5 w-3.5 mr-1.5" />}
            {busy === "writing" ? "Writing…" : "Write YouTube SEO"}
          </Button>
        </div>
      ) : editing ? (
        <div className="mt-3 space-y-3 text-xs">
          <div className="space-y-1">
            <div className="flex justify-between text-muted-foreground">
              <span>Title</span>
              <span className={draft.title.length > TITLE_TARGET ? "text-amber-600" : ""}>
                {draft.title.length}/{TITLE_TARGET}
              </span>
            </div>
            <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} maxLength={100} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-muted-foreground">
              <span>Search snippet (first lines of the description)</span>
              <span className={draft.hook.length > HOOK_MAX ? "text-amber-600" : ""}>
                {draft.hook.length}/{HOOK_MAX}
              </span>
            </div>
            <Textarea value={draft.hook} onChange={(e) => setDraft({ ...draft, hook: e.target.value })} rows={2} className="text-xs" />
          </div>
          <div className="space-y-1">
            <span className="text-muted-foreground">Summary</span>
            <Textarea value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} rows={3} className="text-xs" />
          </div>
          <div className="space-y-1">
            <span className="text-muted-foreground">Tags (comma-separated)</span>
            <Textarea value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} rows={2} className="text-xs" />
          </div>
          <div className="space-y-1">
            <span className="text-muted-foreground">Hashtags (3, shown above the title)</span>
            <Input value={draft.hashtags} onChange={(e) => setDraft({ ...draft, hashtags: e.target.value })} className="h-8 text-xs" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-8" onClick={save} disabled={!!busy}>
              {busy === "saving" && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Save
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-3 text-xs">
          <div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>
                Title · {seo.title.length} chars{seo.title.length > TITLE_TARGET ? " (may be cut off in search)" : ""}
              </span>
              <CopyButton text={seo.title} label="title" />
            </div>
            <p className="mt-0.5 text-sm font-medium leading-snug">{seo.title}</p>
          </div>
          <div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Description</span>
              <CopyButton text={copy?.description ?? ""} label="description" />
            </div>
            <pre className="mt-0.5 max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-border/60 bg-secondary/30 p-2 font-sans text-[0.72rem] leading-relaxed">
              {copy?.description}
            </pre>
          </div>
          <div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Tags · {seo.tags.length}</span>
              <CopyButton text={seo.tags.join(", ")} label="tags" />
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {seo.tags.map((t) => (
                <span key={t} className="rounded-full border border-border/60 px-2 py-0.5 text-[0.68rem]">
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
