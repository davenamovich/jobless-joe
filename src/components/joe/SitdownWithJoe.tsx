"use client";

// "Sit-down with Joe": stick-figure Joe at his talk-show desk delivers a
// monologue, or interviews a guest on the couch, from a script and/or an
// uploaded audio file. Same flow as the stickman song video: a temp
// here.now preview first, "Make MP4" only once it looks right.

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Armchair,
  Download,
  ExternalLink,
  Film,
  Loader2,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { MorningShow, type MorningShowResult } from "./MorningShow";
import { PostToSocials } from "./PostToSocials";

const PLACEHOLDER = `Plain lines are Joe's monologue.

For an interview, label the lines:
JOE: So you applied to 400 jobs?
SARAH: 401. One was a typo.

Fish Audio acts out tags like [excited], [laugh], [pause] or <whisper>…</whisper>.`;

export function SitdownWithJoe({ className }: { className?: string }) {
  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");
  const [audio, setAudio] = useState<File | null>(null);
  const [making, setMaking] = useState(false);
  const [tagging, setTagging] = useState(false);
  const [pageUrl, setPageUrl] = useState("");
  const [mp4Url, setMp4Url] = useState("");
  const [mp4State, setMp4State] = useState<"idle" | "rendering" | "failed">(
    "idle",
  );
  const [mp4Error, setMp4Error] = useState("");
  const [tab, setTab] = useState("script");
  // Search questions + YouTube copy from the Morning Show, sent when posting.
  const [seo, setSeo] = useState<Pick<
    MorningShowResult,
    "questions" | "youtube"
  > | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    },
    [],
  );

  const makePreview = async () => {
    setMaking(true);
    setPageUrl("");
    setMp4Url("");
    setMp4State("idle");
    setMp4Error("");
    try {
      const form = new FormData();
      form.set("title", title);
      form.set("script", script);
      if (audio) form.set("audio", audio);
      const res = await fetch("/api/sitdown", { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(json.error || `Request failed (${res.status}).`);
      setPageUrl(json.url);
      toast.success(
        json.guest ? `Joe sat down with ${json.guest}.` : "Joe's at his desk.",
      );
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Couldn't make the sit-down.",
      );
    } finally {
      setMaking(false);
    }
  };

  // Fish Audio expression tags, added without changing a word.
  const addExpression = async () => {
    setTagging(true);
    try {
      const res = await fetch("/api/sitdown/expression", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status}).`);
      setScript(json.script);
      toast.success("Expression tags added. Fish Audio acts them out; captions hide them.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add expression tags.");
    } finally {
      setTagging(false);
    }
  };

  const poll = (jobId: string) => {
    pollRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/stickman-video/mp4?jobId=${encodeURIComponent(jobId)}`,
        );
        const json = await res.json().catch(() => ({}));
        if (json.mp4Url) {
          setMp4Url(json.mp4Url);
          setMp4State("idle");
          toast.success("MP4 ready.");
          return;
        }
        if (json.status === "failed" || !res.ok) {
          setMp4State("failed");
          setMp4Error(json.error || "The MP4 render failed.");
          return;
        }
        poll(jobId);
      } catch {
        poll(jobId); // a network blip — keep checking
      }
    }, 12_000);
  };

  const makeMp4 = async () => {
    if (!pageUrl) return;
    setMp4State("rendering");
    setMp4Error("");
    try {
      const res = await fetch("/api/stickman-video/mp4", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageUrl }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(json.error || `Request failed (${res.status}).`);
      if (json.mp4Url) {
        setMp4Url(json.mp4Url);
        setMp4State("idle");
        toast.success("MP4 ready.");
      } else if (json.jobId) {
        poll(json.jobId);
      }
    } catch (e) {
      setMp4State("failed");
      setMp4Error(e instanceof Error ? e.message : "MP4 render failed.");
    }
  };

  const ready = !!audio || !!script.trim();
  const shownTitle = title.trim() || "A Sit-Down with Joe";

  return (
    <div
      className={`rounded-xl border border-border/70 bg-card p-4 ${className ?? ""}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Armchair className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold">Sit-down with Joe</p>
        {pageUrl && (
          <Badge
            variant={mp4Url ? "default" : "secondary"}
            className="text-[0.65rem] uppercase tracking-wider"
          >
            {mp4Url
              ? "MP4 ready"
              : mp4State === "rendering"
                ? "Rendering MP4"
                : "Preview"}
          </Badge>
        )}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
        Joe at his talk-show desk: a monologue, or an interview with a guest on
        the couch. Paste a script, upload audio, or both. A script with no audio
        is voiced for you.
      </p>

      <Tabs value={tab} onValueChange={setTab} className="mt-3">
        <TabsList className="w-full">
          <TabsTrigger value="script" className="flex-1 text-xs">
            Write your own
          </TabsTrigger>
          <TabsTrigger value="morning" className="flex-1 text-xs">
            Morning Show
          </TabsTrigger>
        </TabsList>
        <TabsContent value="morning" className="mt-3">
          <MorningShow
            onScript={(show) => {
              setTitle(show.title);
              setScript(show.script);
              setSeo({
                questions: show.questions ?? [],
                youtube: show.youtube,
              });
              setAudio(null);
              if (fileRef.current) fileRef.current.value = "";
              setTab("script");
            }}
          />
        </TabsContent>
        <TabsContent value="script" className="mt-3 space-y-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (e.g. Joe on the 4-day work week)"
            className="h-9"
            maxLength={120}
          />
          <Textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder={PLACEHOLDER}
            className="min-h-[120px] text-sm"
            maxLength={20_000}
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              onClick={addExpression}
              disabled={!script.trim() || tagging || making}
            >
              {tagging ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              )}
              {tagging ? "Directing Joe…" : "Add expression tags"}
            </Button>
            <span className="text-[0.7rem] text-muted-foreground">For Fish Audio voicing</span>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.webm"
            className="hidden"
            onChange={(e) => setAudio(e.target.files?.[0] ?? null)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-9"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              {audio ? "Change audio" : "Upload audio"}
            </Button>
            {audio && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground min-w-0">
                <span className="truncate max-w-[140px]">{audio.name}</span>
                <button
                  type="button"
                  aria-label="Remove audio"
                  className="rounded p-0.5 hover:bg-muted"
                  onClick={() => {
                    setAudio(null);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            <Button
              size="sm"
              className="h-9 ml-auto"
              onClick={makePreview}
              disabled={!ready || making}
            >
              {making ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Armchair className="h-3.5 w-3.5 mr-1.5" />
              )}
              {making
                ? audio
                  ? "Setting up…"
                  : "Voicing script…"
                : pageUrl
                  ? "New preview"
                  : "Make preview"}
            </Button>
          </div>
          {seo && (
            <div className="rounded-md border border-border/60 bg-secondary/20 p-2.5 text-xs space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">Search questions Joe answers</p>
                <button
                  type="button"
                  className="text-[0.7rem] text-muted-foreground underline"
                  onClick={() => setSeo(null)}
                >
                  Don&apos;t use
                </button>
              </div>
              {seo.questions.length > 0 && (
                <ul className="list-disc pl-4 text-muted-foreground">
                  {seo.questions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              )}
              <p className="text-[0.7rem] text-muted-foreground">
                Posting sends YouTube this title, a description listing these
                questions, and {seo.youtube.tags.length} search tags.
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {pageUrl && (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button asChild size="sm" variant="outline" className="h-9">
              <a href={pageUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Open preview
              </a>
            </Button>
            {mp4Url ? (
              <>
                <Button asChild size="sm" variant="secondary" className="h-9">
                  <a href={mp4Url} target="_blank" rel="noopener noreferrer">
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                    Download MP4
                  </a>
                </Button>
                <PostToSocials
                  mp4Url={mp4Url}
                  title={shownTitle}
                  youtube={
                    seo
                      ? {
                          ...seo.youtube,
                          title: title.trim() || seo.youtube.title,
                        }
                      : undefined
                  }
                  className="h-9"
                />
              </>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                className="h-9"
                onClick={makeMp4}
                disabled={mp4State === "rendering"}
              >
                {mp4State === "rendering" ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Film className="h-3.5 w-3.5 mr-1.5" />
                )}
                {mp4State === "rendering"
                  ? "Rendering MP4…"
                  : "Looks good — make MP4"}
              </Button>
            )}
          </div>
          <div className="mt-3 flex justify-center">
            <iframe
              src={pageUrl}
              title={`${shownTitle} — sit-down preview`}
              className="w-full max-w-[260px] aspect-[9/16] rounded-lg border border-border/60 bg-black"
              allow="autoplay"
            />
          </div>
        </>
      )}
      {mp4State === "rendering" && (
        <p className="mt-2 text-[0.7rem] text-muted-foreground">
          Filming on Plunder &amp; Riffle — usually 1–3 minutes (25 credits).
        </p>
      )}
      {mp4Error && <p className="mt-2 text-xs text-destructive">{mp4Error}</p>}
      {pageUrl && !mp4Url && mp4State !== "rendering" && (
        <p className="mt-2 text-[0.7rem] text-muted-foreground">
          The preview is temporary (~24h).
        </p>
      )}
    </div>
  );
}
