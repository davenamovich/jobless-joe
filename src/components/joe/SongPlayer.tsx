"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Clapperboard,
  Copy,
  Download,
  ExternalLink,
  Film,
  Globe,
  Loader2,
  Pause,
  Play,
} from "lucide-react";
import { toast } from "sonner";
import { StickmanTools } from "./StickmanTools";

interface Props {
  episodeId: string;
  title: string;
  audioUrl: string;
  /** "mp3" | "wav" | "flac" */
  format?: string;
  durationSec?: number;
  /** Show the "open song page" link (hidden on the song page itself). */
  showPageLink?: boolean;
}

interface PublishedPage {
  url: string;
  claimUrl?: string;
  expiresAt?: number;
}

interface VideoJob {
  id: string;
  status: string;
  pageUrl: string;
  posterUrl: string;
  mp4Url: string;
  postCopy: string;
  error: string;
}

function videoStatusLabel(status: string): string {
  switch (status) {
    case "done":
      return "MP4 ready";
    case "ready":
      return "Ready";
    case "mp4_rendering":
      return "Rendering MP4";
    case "failed":
      return "Failed";
    default:
      return "Filming";
  }
}

function fmt(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fileSlug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "jobless-joe-song"
  );
}

export function SongPlayer({
  episodeId,
  title,
  audioUrl,
  format = "mp3",
  durationSec = 0,
  showPageLink = true,
}: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(durationSec || 0);
  const [waveform, setWaveform] = useState<number[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [page, setPage] = useState<PublishedPage | null>(null);

  // Plunder & Riffle video
  const [video, setVideo] = useState<VideoJob | null>(null);
  const [courseUrl, setCourseUrl] = useState("");
  const [makingVideo, setMakingVideo] = useState(false);
  const [renderingMp4, setRenderingMp4] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  // Decode the track once so we can draw a real waveform (borrowed from
  // StudioStack's AudioPlayer).
  useEffect(() => {
    if (!audioUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(audioUrl);
        const arrBuf = await res.arrayBuffer();
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const ctx = new Ctx();
        const audioBuf = await ctx.decodeAudioData(arrBuf);
        const channel = audioBuf.getChannelData(0);
        const samples = 96;
        const blockSize = Math.max(1, Math.floor(channel.length / samples));
        const peaks: number[] = [];
        for (let i = 0; i < samples; i++) {
          let max = 0;
          for (let j = 0; j < blockSize; j++) {
            const v = Math.abs(channel[i * blockSize + j] || 0);
            if (v > max) max = v;
          }
          peaks.push(max);
        }
        const maxPeak = Math.max(...peaks, 0.0001);
        if (!cancelled) {
          setWaveform(peaks.map((p) => Math.max(0.06, p / maxPeak)));
        }
        void ctx.close();
      } catch (err) {
        // Waveform is decorative — playback still works.
        console.warn("Waveform decode failed:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [audioUrl]);

  // Draw waveform + played portion.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0) return;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const w = rect.width;
      const h = rect.height;
      ctx.clearRect(0, 0, w, h);

      if (waveform.length === 0) {
        ctx.strokeStyle = "rgba(255,255,255,0.10)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();
        return;
      }

      const playedX = progress * w;
      const barW = w / waveform.length;
      waveform.forEach((peak, i) => {
        const x = i * barW;
        const barH = Math.max(2, peak * h * 0.82);
        const y = (h - barH) / 2;
        ctx.fillStyle =
          x < playedX
            ? "oklch(0.62 0.16 30)"
            : "rgba(120, 80, 70, 0.28)";
        ctx.fillRect(x + 1, y, Math.max(1.5, barW - 2), barH);
      });

      ctx.fillStyle = "oklch(0.55 0.17 28)";
      ctx.fillRect(Math.max(0, Math.min(w - 1, playedX)), 0, 2, h);
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [waveform, progress]);

  // Keep local state in sync with the <audio> element.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => {
      setCurrent(audio.currentTime);
      setProgress(audio.duration ? audio.currentTime / audio.duration : 0);
    };
    const onMeta = () => setDuration(audio.duration || durationSec || 0);
    const onEnd = () => setPlaying(false);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, [audioUrl, durationSec]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play().catch(() => setPlaying(false));
    else audio.pause();
  };

  const seek = (ratio: number) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    audio.currentTime = Math.max(0, Math.min(1, ratio)) * audio.duration;
    setProgress(Math.max(0, Math.min(1, ratio)));
  };

  // Load any video already made for this episode.
  useEffect(() => {
    let cancelled = false;
    setVideo(null);
    setVideoError(null);
    fetch(`/api/video?episodeId=${encodeURIComponent(episodeId)}`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j) return;
        setVideo((j.video as VideoJob | null) ?? null);
        if (j.courseUrl) setCourseUrl(j.courseUrl);
      })
      .catch(() => {
        // A missing video is not an error — the button will start one.
      });
    return () => {
      cancelled = true;
    };
  }, [episodeId]);

  // Poll a rendering MP4 (P&R job lookup is free).
  useEffect(() => {
    if (!video || video.status !== "mp4_rendering") return;
    let cancelled = false;
    const id = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/video?jobId=${encodeURIComponent(video.id)}`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const j = await res.json();
        if (!cancelled && j.video) setVideo(j.video as VideoJob);
      } catch {
        // Next tick retries.
      }
    }, 6000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [video?.id, video?.status, video]);

  const makeVideo = async () => {
    setMakingVideo(true);
    setVideoError(null);
    try {
      const res = await fetch("/api/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Video generation failed.");
      setVideo(j.video as VideoJob);
      if (j.courseUrl) setCourseUrl(j.courseUrl);
      if (j.video?.status === "done") {
        toast.success("Joe's video and MP4 are ready.");
      } else if (j.video?.status === "mp4_rendering") {
        toast.message("Video page is ready — the MP4 is rendering (1–3 min).");
      } else if (j.video?.error) {
        toast.error(j.video.error);
      } else {
        toast.message("Joe is filming — check back in a minute.");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Video generation failed.";
      setVideoError(msg);
      toast.error(msg);
    } finally {
      setMakingVideo(false);
    }
  };

  const renderMp4 = async () => {
    if (!video) return;
    setRenderingMp4(true);
    setVideoError(null);
    try {
      const res = await fetch("/api/video/mp4", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: video.id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "MP4 render failed.");
      setVideo(j.video as VideoJob);
      if (j.video?.mp4Url) toast.success("MP4 is ready.");
      else if (j.video?.error) toast.error(j.video.error);
      else toast.message("MP4 is rendering — usually 1–3 minutes.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "MP4 render failed.";
      setVideoError(msg);
      toast.error(msg);
    } finally {
      setRenderingMp4(false);
    }
  };

  const downloadFile = `${fileSlug(title)}.${format}`;

  const publish = async () => {
    setPublishing(true);
    try {
      const res = await fetch("/api/song-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Publish failed.");
      setPage({ url: json.url, claimUrl: json.claimUrl, expiresAt: json.expiresAt });
      toast.success("here.now page is live.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Publish failed.");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="space-y-4">
      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pause song" : "Play song"}
          className="h-14 w-14 shrink-0 rounded-full border border-primary/40 bg-primary text-primary-foreground shadow-lg flex items-center justify-center transition-transform hover:scale-[1.03] active:scale-95"
        >
          {playing ? (
            <Pause className="h-5 w-5" />
          ) : (
            <Play className="h-5 w-5 ml-0.5" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <canvas
            ref={canvasRef}
            className="w-full h-14 cursor-pointer touch-none"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              seek((e.clientX - rect.left) / rect.width);
            }}
            role="slider"
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") seek(progress + 0.05);
              if (e.key === "ArrowLeft") seek(progress - 0.05);
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                toggle();
              }
            }}
          />
          <div className="flex justify-between text-[0.7rem] font-mono text-muted-foreground mt-1.5">
            <span>{fmt(current)}</span>
            <span>{duration ? fmt(duration) : fmt(durationSec)}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" className="h-9">
          <a href={audioUrl} download={downloadFile}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            {format === "mp3" ? "Download MP3" : `Download ${format.toUpperCase()}`}
          </a>
        </Button>

        <Button asChild size="sm" variant="outline" className="h-9">
          <a
            href={`/api/song-page?episodeId=${encodeURIComponent(episodeId)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            Preview share page
          </a>
        </Button>

        {showPageLink && (
          <Button asChild size="sm" variant="outline" className="h-9">
            <Link href={`/song/${episodeId}`}>
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Open song page
            </Link>
          </Button>
        )}

        <Button
          size="sm"
          variant="secondary"
          className="h-9"
          onClick={publish}
          disabled={publishing}
        >
          {publishing ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Globe className="h-3.5 w-3.5 mr-1.5" />
          )}
          {publishing ? "Publishing…" : "Generate here.now page"}
        </Button>
      </div>

      {page && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="text-[0.65rem] uppercase tracking-wider">
              Live
            </Badge>
            <a
              href={page.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-primary underline underline-offset-4 truncate"
            >
              {page.url}
            </a>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 ml-auto"
              onClick={() => {
                navigator.clipboard.writeText(page.url);
                toast.success("Link copied.");
              }}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
          {!page.claimUrl && (
            <p className="text-[0.7rem] text-muted-foreground">
              Anonymous here.now pages expire after 24 hours — download the MP3
              to keep the song.
            </p>
          )}
          {page.claimUrl && (
            <a
              href={page.claimUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[0.7rem] text-muted-foreground underline underline-offset-2"
            >
              Claim this page to keep it
            </a>
          )}
        </div>
      )}

      {/* === JOE'S VIDEO (Plunder & Riffle) === */}
      <div className="rounded-xl border border-border/70 bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Clapperboard className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Joe&apos;s video</p>
          {video && (
            <Badge
              variant={
                video.status === "done"
                  ? "default"
                  : video.status === "failed"
                    ? "destructive"
                    : "secondary"
              }
              className="text-[0.65rem] uppercase tracking-wider"
            >
              {videoStatusLabel(video.status)}
            </Badge>
          )}
          <span className="ml-auto text-[0.6rem] uppercase tracking-[0.18em] text-muted-foreground">
            Plunder &amp; Riffle
          </span>
        </div>

        {!video && (
          <>
            <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
              One click turns this song into Joe&apos;s 9:16 video page, meme
              slideshow and hot take — captioned with his punchline and the
              free-course CTA.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                className="h-9"
                onClick={makeVideo}
                disabled={makingVideo}
              >
                {makingVideo ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Clapperboard className="h-3.5 w-3.5 mr-1.5" />
                )}
                {makingVideo ? "Filming…" : "Make Joe's video"}
              </Button>
              <span className="text-[0.65rem] text-muted-foreground">
                Video page + MP4 · one click
              </span>
            </div>
          </>
        )}

        {video && (video.status === "rendering" || makingVideo) && (
          <div className="mt-3 flex items-center gap-3 rounded-lg border border-dashed border-border/70 bg-secondary/20 p-3">
            <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Joe is filming…</p>
              <p className="text-[0.7rem] text-muted-foreground">
                P&amp;R renders the take, then the video page and meme pack.
              </p>
            </div>
            {!makingVideo && (
              <Button size="sm" variant="outline" className="h-8" onClick={makeVideo}>
                Check again
              </Button>
            )}
          </div>
        )}

        {video &&
          video.status !== "rendering" &&
          video.status !== "failed" &&
          !makingVideo && (
            <div className="mt-3 flex flex-col sm:flex-row gap-3">
              {video.posterUrl && (
                <img
                  src={video.posterUrl}
                  alt={`${title} video poster`}
                  className="w-20 shrink-0 rounded-md border border-border/60 object-cover"
                />
              )}
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {video.pageUrl && (
                    <Button asChild size="sm" className="h-8">
                      <a
                        href={video.pageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                        Watch the video
                      </a>
                    </Button>
                  )}
                  {video.mp4Url ? (
                    <Button asChild size="sm" variant="outline" className="h-8">
                      <a href={video.mp4Url} target="_blank" rel="noopener noreferrer">
                        <Download className="h-3.5 w-3.5 mr-1.5" />
                        Download MP4
                      </a>
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      onClick={renderMp4}
                      disabled={renderingMp4 || video.status === "mp4_rendering"}
                    >
                      {renderingMp4 || video.status === "mp4_rendering" ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Film className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      {video.status === "mp4_rendering"
                        ? "Rendering MP4…"
                        : "Render MP4"}
                    </Button>
                  )}
                  {video.postCopy && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8"
                      onClick={() => {
                        navigator.clipboard.writeText(video.postCopy);
                        toast.success("Joe's caption copied.");
                      }}
                    >
                      <Copy className="h-3.5 w-3.5 mr-1.5" />
                      Copy caption
                    </Button>
                  )}
                </div>
                <p className="text-[0.7rem] text-muted-foreground leading-snug line-clamp-3 whitespace-pre-line">
                  {video.postCopy}
                </p>
              </div>
            </div>
          )}

        {video && video.status === "failed" && (
          <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
            <p className="text-sm text-destructive">
              {video.error || videoError || "The video render failed."}
            </p>
            <Button size="sm" variant="outline" className="h-8 mt-2" onClick={makeVideo}>
              Try again
            </Button>
          </div>
        )}

        {videoError && video?.status !== "failed" && (
          <p className="mt-2 text-xs text-destructive">{videoError}</p>
        )}

        {courseUrl && (
          <a
            href={courseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex items-center gap-1.5 rounded-lg bg-primary/5 px-3 py-2 text-[0.72rem] font-medium text-primary hover:bg-primary/10 transition-colors"
          >
            🎓 Free AI course for the unemployed — start here
            <ExternalLink className="h-3 w-3 ml-auto" />
          </a>
        )}
      </div>

      {/* === STICKMAN JOE: memes + video (Telegram's /meme and /video) === */}
      <StickmanTools episodeId={episodeId} title={title} />
    </div>
  );
}
