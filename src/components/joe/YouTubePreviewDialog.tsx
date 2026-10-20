"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** YouTube's own limits; past ~70 characters a title is cut off in search. */
const TITLE_MAX = 100;
const TITLE_VISIBLE = 70;
const DESCRIPTION_MAX = 5000;

interface PreviewMeta {
  title: string;
  description: string;
  tags: string[];
  privacy: string;
}

/**
 * Shows exactly what "YouTube ↑" will send — title, description and tags from
 * /api/youtube/preview — and lets the title and description be edited first.
 * Nothing is uploaded until Upload is pressed.
 */
export function YouTubePreviewDialog({
  jobId,
  open,
  onOpenChange,
  busy,
  onPublish,
}: {
  jobId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  /** Only the fields that were changed; the server rebuilds the rest. */
  onPublish: (edits: { title?: string; description?: string }) => void;
}) {
  const [meta, setMeta] = useState<PreviewMeta | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const loading = open && !meta && !error;

  // Close clears the last preview, so reopening always shows a fresh build.
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setMeta(null);
      setError(null);
    }
    onOpenChange(next);
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch(`/api/youtube/preview?jobId=${encodeURIComponent(jobId)}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || "Could not build the preview.");
        return j.meta as PreviewMeta;
      })
      .then((m) => {
        if (cancelled) return;
        setMeta(m);
        setTitle(m.title);
        setDescription(m.description);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not build the preview.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, jobId]);

  const titleTooLong = title.length > TITLE_MAX;
  const canPublish =
    !!meta && !busy && !loading && !!title.trim() && !titleTooLong &&
    description.length <= DESCRIPTION_MAX;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif">Before it goes to YouTube</DialogTitle>
          <DialogDescription>
            Check the title and description people will find in search.
            {meta ? ` Uploads as ${meta.privacy || "unlisted"}.` : ""}
          </DialogDescription>
        </DialogHeader>

        {loading && <p className="text-sm text-muted-foreground">Building the preview…</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {meta && !loading && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="yt-title">Title</Label>
                <span
                  className={`text-[0.7rem] ${
                    titleTooLong
                      ? "text-destructive"
                      : title.length > TITLE_VISIBLE
                        ? "text-amber-600"
                        : "text-muted-foreground"
                  }`}
                  title={`Search results show about ${TITLE_VISIBLE} characters`}
                >
                  {title.length}/{TITLE_MAX}
                </span>
              </div>
              <Input id="yt-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="yt-description">Description</Label>
                <span className="text-[0.7rem] text-muted-foreground">
                  First two lines show in search · {description.length}/{DESCRIPTION_MAX}
                </span>
              </div>
              <Textarea
                id="yt-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-[220px] font-mono text-xs"
              />
            </div>

            {meta.tags.length > 0 && (
              <div className="space-y-1.5">
                <Label>Tags</Label>
                <div className="flex flex-wrap gap-1">
                  {meta.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-muted px-2 py-0.5 text-[0.7rem] text-muted-foreground"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onPublish({
                title: title.trim() !== meta?.title ? title.trim() : undefined,
                description:
                  description.trim() !== meta?.description ? description.trim() : undefined,
              })
            }
            disabled={!canPublish}
          >
            {busy ? "Uploading…" : "Upload to YouTube"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
