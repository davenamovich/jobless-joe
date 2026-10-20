"use client";

// "Drop in any song": an MP3 or WAV (not only one Joe rendered) acted out by
// stick-figure Joe on the ink sets, like the song player's Stickman video.
// The preview plays right here from the dropped file; the same page goes to
// here.now as a temp page, and "Make MP4" films that.

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Download, ExternalLink, Film, Loader2, Music, Upload, Video, X } from "lucide-react";
import { toast } from "sonner";
import { MAX_UPLOAD_BYTES, titleFromFileName, uploadAudioFormat, withAudioSrc } from "@/lib/song-upload";
import { PostToSocials } from "./PostToSocials";

const PLACEHOLDER = `Lyrics (optional, recommended):
[VERSE]
I sent my résumé to the moon
[CHORUS]
...
[OUTRO]
The last line of the outro is Joe's punchline.`;

interface UploadResult {
  html: string;
  audioFile: string;
  url: string | null;
  publishError?: string;
  scenes: number;
  source: "llm" | "keywords";
  fromTitle: boolean;
  title: string;
}

export function StickmanFromSong({ className }: { className?: string }) {
  const [audio, setAudio] = useState<File | null>(null);
  const [audioSrc, setAudioSrc] = useState("");
  const [title, setTitle] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [dragging, setDragging] = useState(false);
  const [making, setMaking] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [mp4Url, setMp4Url] = useState("");
  const [mp4State, setMp4State] = useState<"idle" | "rendering" | "failed">("idle");
  const [mp4Error, setMp4Error] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    },
    [],
  );
  // The dropped file plays the local preview; let it go when it changes.
  useEffect(() => {
    if (!audio) return setAudioSrc("");
    const src = URL.createObjectURL(audio);
    setAudioSrc(src);
    return () => URL.revokeObjectURL(src);
  }, [audio]);

  const reset = () => {
    if (pollRef.current) clearTimeout(pollRef.current);
    setResult(null);
    setMp4Url("");
    setMp4State("idle");
    setMp4Error("");
  };

  const pick = (file: File | null | undefined) => {
    if (!file) return;
    if (!uploadAudioFormat(file.name, file.type)) {
      toast.error("Use an MP3 or WAV file.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(`That file is ${(file.size / 1024 / 1024).toFixed(1)}MB. Songs can be up to 24MB.`);
      return;
    }
    reset();
    setAudio(file);
  };

  const clear = () => {
    reset();
    setAudio(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const makePreview = async () => {
    if (!audio) return;
    setMaking(true);
    reset();
    try {
      const form = new FormData();
      form.set("audio", audio);
      form.set("title", title);
      form.set("lyrics", lyrics);
      const res = await fetch("/api/stickman-video/upload", { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status}).`);
      setResult(json as UploadResult);
      if (json.url) toast.success("Joe's acting it out. Preview below.");
      else toast.warning("Preview ready here, but here.now didn't take the page, so it can't be filmed yet.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't make the preview.");
    } finally {
      setMaking(false);
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
    if (!result?.url) return;
    setMp4State("rendering");
    setMp4Error("");
    try {
      const res = await fetch("/api/stickman-video/mp4", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageUrl: result.url }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status}).`);
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

  const shownTitle = result?.title || title.trim() || (audio ? titleFromFileName(audio.name) : "") || "Untitled Song";
  const localHtml = result && audioSrc ? withAudioSrc(result.html, result.audioFile, audioSrc) : "";

  return (
    <div className={`rounded-xl border border-border/70 bg-card p-4 ${className ?? ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Music className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold">Drop in any song</p>
        {result && (
          <Badge variant={mp4Url ? "default" : "secondary"} className="text-[0.65rem] uppercase tracking-wider">
            {mp4Url ? "MP4 ready" : mp4State === "rendering" ? "Rendering MP4" : "Preview"}
          </Badge>
        )}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
        Any MP3 or WAV (up to 24MB / 3 minutes): stick-figure Joe acts out each lyric on ink-drawn sets, in time with
        the track. Without lyrics he acts out the title.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept=".mp3,.wav,audio/mpeg,audio/wav"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0])}
      />
      {audio ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-border/60 bg-secondary/20 px-3 py-2 text-xs">
          <Music className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate flex-1 min-w-0">{audio.name}</span>
          <span className="text-muted-foreground">{(audio.size / 1024 / 1024).toFixed(1)}MB</span>
          <button type="button" aria-label="Remove song" className="rounded p-0.5 hover:bg-muted" onClick={clear}>
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pick(e.dataTransfer.files?.[0]);
          }}
          className={`mt-3 flex w-full flex-col items-center gap-1.5 rounded-lg border border-dashed px-3 py-5 text-xs transition-colors ${
            dragging ? "border-primary bg-primary/5" : "border-border/80 hover:bg-muted/40"
          }`}
        >
          <Upload className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">Drop an MP3 or WAV here</span>
          <span className="text-muted-foreground">or click to choose a file</span>
        </button>
      )}

      <div className="mt-2 space-y-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={audio ? `Title (blank = ${titleFromFileName(audio.name) || "Untitled Song"})` : "Title"}
          className="h-9"
          maxLength={120}
        />
        <Textarea
          value={lyrics}
          onChange={(e) => setLyrics(e.target.value)}
          placeholder={PLACEHOLDER}
          className="min-h-[110px] text-sm"
          maxLength={20_000}
        />
        <div className="flex justify-end">
          <Button size="sm" className="h-9" onClick={makePreview} disabled={!audio || making}>
            {making ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Video className="h-3.5 w-3.5 mr-1.5" />}
            {making ? "Staging scenes…" : result ? "New preview" : "Make stickman preview"}
          </Button>
        </div>
      </div>

      {result && (
        <>
          {result.fromTitle && (
            <p className="mt-2 text-[0.7rem] text-muted-foreground">
              No lyrics, so Joe acts out the title. Paste the lyrics for a scene per line.
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {result.url && (
              <Button asChild size="sm" variant="outline" className="h-9">
                <a href={result.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  Open preview
                </a>
              </Button>
            )}
            {mp4Url ? (
              <>
                <Button asChild size="sm" variant="secondary" className="h-9">
                  <a href={mp4Url} target="_blank" rel="noopener noreferrer">
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                    Download MP4
                  </a>
                </Button>
                <PostToSocials mp4Url={mp4Url} title={shownTitle} className="h-9" />
              </>
            ) : (
              result.url && (
                <Button size="sm" variant="secondary" className="h-9" onClick={makeMp4} disabled={mp4State === "rendering"}>
                  {mp4State === "rendering" ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Film className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  {mp4State === "rendering" ? "Rendering MP4…" : "Looks good — make MP4"}
                </Button>
              )
            )}
          </div>
          {localHtml && (
            <div className="mt-3 flex justify-center">
              <iframe
                srcDoc={localHtml}
                title={`${shownTitle} — stickman preview`}
                className="w-full max-w-[260px] aspect-[9/16] rounded-lg border border-border/60 bg-black"
                allow="autoplay"
              />
            </div>
          )}
          {result.publishError && (
            <p className="mt-2 text-xs text-destructive">here.now: {result.publishError}</p>
          )}
        </>
      )}
      {mp4State === "rendering" && (
        <p className="mt-2 text-[0.7rem] text-muted-foreground">Filming on Plunder &amp; Riffle — usually 1–3 minutes (25 credits).</p>
      )}
      {mp4Error && <p className="mt-2 text-xs text-destructive">{mp4Error}</p>}
      {result?.url && !mp4Url && mp4State !== "rendering" && (
        <p className="mt-2 text-[0.7rem] text-muted-foreground">The here.now page is temporary (~24h).</p>
      )}
    </div>
  );
}
