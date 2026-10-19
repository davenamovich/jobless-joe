"use client";

// Stickman Joe tools for a finished song — the web twin of Telegram's
// /meme and /video:
//   Memes            three top/bottom caption memes (or about a topic)
//   Stickman video   a temp here.now page first; "Make MP4" only once it looks right

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, ExternalLink, Film, Loader2, Smile, Video } from "lucide-react";
import { toast } from "sonner";
import { PostToSocials } from "./PostToSocials";

interface Meme {
  top: string;
  bottom: string;
  image: string;
}

interface Props {
  episodeId: string;
  title: string;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "joe";
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status}).`);
  return json as T;
}

export function StickmanTools({ episodeId, title }: Props) {
  // Memes
  const [topic, setTopic] = useState("");
  const [memes, setMemes] = useState<Meme[]>([]);
  const [makingMemes, setMakingMemes] = useState(false);

  // Stickman video
  const [pageUrl, setPageUrl] = useState("");
  const [makingPage, setMakingPage] = useState(false);
  const [mp4Url, setMp4Url] = useState("");
  const [mp4State, setMp4State] = useState<"idle" | "rendering" | "failed">("idle");
  const [mp4Error, setMp4Error] = useState("");
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A different song starts clean.
  useEffect(() => {
    setMemes([]);
    setPageUrl("");
    setMp4Url("");
    setMp4State("idle");
    setMp4Error("");
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [episodeId]);

  const makeMemes = async () => {
    setMakingMemes(true);
    try {
      const out = await postJson<{ memes: Meme[] }>("/api/memes", { episodeId, topic: topic.trim() || undefined, count: 3 });
      setMemes(out.memes);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't make memes.");
    } finally {
      setMakingMemes(false);
    }
  };

  const makePreview = async () => {
    setMakingPage(true);
    setMp4Url("");
    setMp4State("idle");
    setMp4Error("");
    try {
      const out = await postJson<{ url: string }>("/api/stickman-video", { episodeId });
      setPageUrl(out.url);
      toast.success("Stickman preview is live.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't publish the preview.");
    } finally {
      setMakingPage(false);
    }
  };

  const poll = (jobId: string) => {
    pollRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/stickman-video/mp4?jobId=${encodeURIComponent(jobId)}`);
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
      const out = await postJson<{ mp4Url?: string; jobId?: string }>("/api/stickman-video/mp4", { pageUrl });
      if (out.mp4Url) {
        setMp4Url(out.mp4Url);
        setMp4State("idle");
        toast.success("MP4 ready.");
      } else if (out.jobId) {
        poll(out.jobId);
      }
    } catch (e) {
      setMp4State("failed");
      setMp4Error(e instanceof Error ? e.message : "MP4 render failed.");
    }
  };

  return (
    <div className="space-y-3">
      {/* === MEMES === */}
      <div className="rounded-xl border border-border/70 bg-card p-4">
        <div className="flex items-center gap-2">
          <Smile className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Stickman memes</p>
          <span className="ml-auto text-[0.6rem] uppercase tracking-[0.18em] text-muted-foreground">same as /meme</span>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
          Three top/bottom memes of this song with stick-figure Joe acting out the punchline. Or type a topic.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !makingMemes) makeMemes();
            }}
            placeholder="Optional topic (blank = this song)"
            className="h-9 flex-1 min-w-[180px]"
            maxLength={300}
          />
          <Button size="sm" className="h-9" onClick={makeMemes} disabled={makingMemes}>
            {makingMemes ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Smile className="h-3.5 w-3.5 mr-1.5" />}
            {makingMemes ? "Drawing…" : memes.length ? "Make more" : "Make memes"}
          </Button>
        </div>
        {memes.length > 0 && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {memes.map((m, i) => (
              <a
                key={i}
                href={m.image}
                download={`${slug(title)}-meme-${i + 1}.png`}
                className="group relative block overflow-hidden rounded-md border border-border/60"
                title="Download"
              >
                <img src={m.image} alt={`${m.top} / ${m.bottom}`} className="w-full h-auto" />
                <span className="absolute bottom-1.5 right-1.5 rounded-full bg-background/90 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Download className="h-3.5 w-3.5" />
                </span>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* === STICKMAN VIDEO === */}
      <div className="rounded-xl border border-border/70 bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Video className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Stickman video</p>
          {pageUrl && (
            <Badge variant={mp4Url ? "default" : "secondary"} className="text-[0.65rem] uppercase tracking-wider">
              {mp4Url ? "MP4 ready" : mp4State === "rendering" ? "Rendering MP4" : "Preview"}
            </Badge>
          )}
          <span className="ml-auto text-[0.6rem] uppercase tracking-[0.18em] text-muted-foreground">same as /video</span>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
          Joe acts out each lyric at his mic, in time with the song. You get a temp preview page first — make the MP4
          only if it looks right.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" className="h-9" onClick={makePreview} disabled={makingPage}>
            {makingPage ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Video className="h-3.5 w-3.5 mr-1.5" />}
            {makingPage ? "Setting up…" : pageUrl ? "New preview" : "Make stickman preview"}
          </Button>
          {pageUrl && (
            <>
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
                  <PostToSocials mp4Url={mp4Url} title={title} episodeId={episodeId} className="h-9" />
                </>
              ) : (
                <Button size="sm" variant="secondary" className="h-9" onClick={makeMp4} disabled={mp4State === "rendering"}>
                  {mp4State === "rendering" ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Film className="h-3.5 w-3.5 mr-1.5" />}
                  {mp4State === "rendering" ? "Rendering MP4…" : "Looks good — make MP4"}
                </Button>
              )}
            </>
          )}
        </div>

        {pageUrl && (
          <div className="mt-3 flex justify-center">
            <iframe
              src={pageUrl}
              title={`${title} — stickman preview`}
              className="w-full max-w-[260px] aspect-[9/16] rounded-lg border border-border/60 bg-black"
              allow="autoplay"
            />
          </div>
        )}
        {mp4State === "rendering" && (
          <p className="mt-2 text-[0.7rem] text-muted-foreground">Filming on Plunder &amp; Riffle — usually 1–3 minutes (25 credits).</p>
        )}
        {mp4Error && <p className="mt-2 text-xs text-destructive">{mp4Error}</p>}
        {pageUrl && !mp4Url && mp4State !== "rendering" && (
          <p className="mt-2 text-[0.7rem] text-muted-foreground">The preview is temporary (~24h).</p>
        )}
      </div>
    </div>
  );
}
