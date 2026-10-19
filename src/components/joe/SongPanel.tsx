"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Disc3, Loader2, RotateCcw } from "lucide-react";
import { SongPlayer } from "./SongPlayer";

interface Props {
  episodeId: string;
  title: string;
  /** Hide the "open song page" link when already on that page. */
  showPageLink?: boolean;
}

interface ReadyTrack {
  audioUrl: string;
  format?: string;
  durationSec?: number;
}

/** How many times the UI will restart a lost render before giving up. */
const MAX_RESTARTS = 3;
/** Matches the ACE-Step client timeout in tts-service. */
const GIVE_UP_SEC = 20 * 60;

/**
 * "Your Song" — the single, obvious place the finished track lives.
 *
 * The song renders in the background after /api/generate returns, so we poll
 * /api/audio/[episodeId] until the track appears. The poll also reports
 * whether a render is running in the server process: when no track exists and
 * nothing is rendering (the job was lost to a dev-server reload or a crash),
 * we restart it here rather than spinning forever.
 */
export function SongPanel({ episodeId, title, showPageLink = true }: Props) {
  const [track, setTrack] = useState<ReadyTrack | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Reset all render state when the episode changes (or a retry is requested).
  useEffect(() => {
    setTrack(null);
    setError(null);
    setNotice(null);
    setElapsed(0);
  }, [episodeId, attempt]);

  const retry = useCallback(() => {
    setError(null);
    setNotice(null);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let restarts = 0;
    let posting = false;
    const started = Date.now();

    const poll = async () => {
      let rendering = false;
      try {
        // List every track for the episode rather than assuming a voice key,
        // so a non-default voice still shows up here.
        const res = await fetch(`/api/audio/${encodeURIComponent(episodeId)}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const j = (await res.json()) as {
            rendering?: boolean;
            tracks?: ReadyTrack[];
          };
          if (cancelled) return;
          const list = Array.isArray(j.tracks) ? j.tracks : [];
          const found = list[list.length - 1];
          if (found?.audioUrl) {
            setTrack(found);
            setError(null);
            setNotice(null);
            return;
          }
          rendering = Boolean(j.rendering);
        }
      } catch (e) {
        console.error("Song poll failed:", e);
      }
      if (cancelled) return;

      const secs = Math.floor((Date.now() - started) / 1000);
      setElapsed(secs);

      // A render is running server-side — just keep waiting.
      if (rendering || posting) return;

      if (secs > GIVE_UP_SEC) {
        setError(
          "The render never finished. Check that the ACE-Step server is still running, then try again."
        );
        return;
      }

      // No track and nothing rendering: the background job was dropped.
      if (restarts >= MAX_RESTARTS) {
        setError(
          "The render kept failing. Check the ACE-Step server, then try again."
        );
        return;
      }
      restarts += 1;
      posting = true;
      if (restarts > 1) {
        setNotice(`Restarting the render (attempt ${restarts} of ${MAX_RESTARTS})…`);
      }
      try {
        const res = await fetch("/api/audio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ episodeId }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => null)) as
            | { error?: string }
            | null;
          if (!cancelled) setError(j?.error || "The render failed.");
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Could not reach the audio service."
          );
        }
      } finally {
        posting = false;
      }
    };

    poll();
    const interval = setInterval(poll, 2500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [episodeId, attempt]);

  return (
    <Card className="spotlight border-primary/40">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <CardTitle className="font-serif text-xl flex items-center gap-2">
            <Disc3 className="h-5 w-5 text-primary" />
            Your Song
          </CardTitle>
          {track ? (
            <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-[0.65rem] uppercase tracking-wider">
              Ready to play
            </Badge>
          ) : error ? (
            <Badge variant="destructive" className="text-[0.65rem] uppercase tracking-wider">
              Render failed
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[0.65rem] uppercase tracking-wider">
              Rendering
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {track
            ? `“${title}” — play it here, download the track, or publish a here.now page.`
            : error
              ? `“${title}” isn’t finished yet.`
              : `ACE-Step is turning “${title}” into music. It'll appear here automatically.`}
        </p>
      </CardHeader>

      <CardContent>
        {track ? (
          <SongPlayer
            episodeId={episodeId}
            title={title}
            audioUrl={track.audioUrl}
            format={track.format}
            durationSec={track.durationSec}
            showPageLink={showPageLink}
          />
        ) : error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
            <p className="text-sm text-destructive">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 gap-2"
              onClick={retry}
            >
              <RotateCcw className="h-4 w-4" />
              Try rendering again
            </Button>
            <p className="mt-3 text-xs text-muted-foreground">
              Your lyrics and ad copy are safe — only the music needs another pass.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border/70 bg-secondary/20 p-5">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium">
                  Rendering{elapsed > 0 ? ` · ${elapsed}s` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {notice ??
                    "Music generation takes longer than lyrics — a minute or two is normal. This page updates on its own."}
                </p>
              </div>
            </div>
            <div className="mt-4 flex items-end gap-1 h-10" aria-hidden="true">
              {Array.from({ length: 28 }).map((_, i) => (
                <span
                  key={i}
                  className="flex-1 rounded-sm bg-primary/30 animate-pulse"
                  style={{
                    height: `${20 + ((i * 37) % 80)}%`,
                    animationDelay: `${(i % 7) * 0.12}s`,
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
