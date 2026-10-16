"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePlayback, effectiveDuration } from "@/lib/playback-store";
import { durationToSeconds } from "@/lib/walls";
import { cn } from "@/lib/utils";

/**
 * Beveled phone display.
 *
 * Shows the currently loaded track as a fake music video — animated brand-colored
 * visualizer background + scrolling lyric captions + progress bar + transport
 * controls. Includes the "Play Entire Clip" toggle.
 *
 * Purely simulated playback: a ticking counter advances the position; when it
 * reaches the end, playback pauses and the UI offers a replay button.
 */
export function PhoneDisplay() {
  const track = usePlayback((s) => s.track);
  const isPlaying = usePlayback((s) => s.isPlaying);
  const positionSec = usePlayback((s) => s.positionSec);
  const playEntire = usePlayback((s) => s.playEntireClip);
  const activeWallId = usePlayback((s) => s.activeWallId);
  const loadTrack = usePlayback((s) => s.loadTrack);
  const toggle = usePlayback((s) => s.toggle);
  const restart = usePlayback((s) => s.restart);
  const seek = usePlayback((s) => s.seek);
  const setPlayEntire = usePlayback((s) => s.setPlayEntireClip);
  const tick = usePlayback((s) => s.tick);

  // Drive playback with a 1-second ticker.
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (isPlaying) {
      tickRef.current = setInterval(() => tick(), 1000);
    } else if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
    };
  }, [isPlaying, tick]);

  // Parse lyrics into a flat list of lines for caption scrolling.
  const lyricsText = track?.lyrics ?? "";
  const lyricLines = useMemo(() => {
    if (!lyricsText) return [];
    const lines: { text: string; tag?: string }[] = [];
    let currentTag: string | undefined;
    for (const raw of lyricsText.split(/\r?\n/)) {
      const trimmed = raw.trim();
      const m = trimmed.match(/^\[([A-Z][A-Z0-9 ]*?)\]$/i);
      if (m) {
        currentTag = m[1].toUpperCase();
        continue;
      }
      if (!trimmed) continue;
      lines.push({ text: trimmed, tag: currentTag });
    }
    return lines;
  }, [lyricsText]);

  // Pick the "current" line based on playback position.
  const currentLineIdx = useMemo(() => {
    if (!track || lyricLines.length === 0) return -1;
    const dur = effectiveDuration(track, playEntire);
    if (dur <= 0) return 0;
    const ratio = positionSec / dur;
    const idx = Math.min(
      lyricLines.length - 1,
      Math.floor(ratio * lyricLines.length)
    );
    return idx;
  }, [track, playEntire, positionSec, lyricLines]);

  const brandColor = track?.brandColor || "#722F37";
  const durSec = track ? effectiveDuration(track, playEntire) : 0;
  const progressPct = durSec > 0 ? Math.min(100, (positionSec / durSec) * 100) : 0;
  const fmtTime = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative mx-auto" style={{ width: 280, height: 580 }}>
        {/* === BEVELED PHONE FRAME === */}
        {/* Outer metal bezel — gives the beveled depth */}
        <div
          className="absolute inset-0 rounded-[3rem]"
          style={{
            background:
              "linear-gradient(145deg, oklch(0.78 0.02 60) 0%, oklch(0.32 0.02 50) 35%, oklch(0.22 0.02 50) 50%, oklch(0.42 0.02 60) 65%, oklch(0.78 0.02 60) 100%)",
            boxShadow:
              "0 24px 48px -12px oklch(0.2 0.04 30 / 0.45), 0 0 0 1.5px oklch(0.18 0.02 40), inset 0 2px 4px oklch(0.95 0.01 80 / 0.6), inset 0 -2px 4px oklch(0.12 0.02 40)",
          }}
        />
        {/* Inner bezel — the dark frame around the screen */}
        <div
          className="absolute inset-[3px] rounded-[2.85rem]"
          style={{
            background:
              "linear-gradient(145deg, oklch(0.16 0.01 40) 0%, oklch(0.08 0.01 40) 50%, oklch(0.16 0.01 40) 100%)",
            boxShadow: "inset 0 0 8px oklch(0 0 0 / 0.6)",
          }}
        />
        {/* Screen */}
        <div
          className="absolute inset-[10px] rounded-[2.4rem] overflow-hidden flex flex-col"
          style={{
            background: oklchBgFromBrand(brandColor),
          }}
        >
          {/* === STATUS BAR === */}
          <div className="relative z-10 flex items-center justify-between px-5 pt-3 pb-1 text-[0.65rem] font-medium text-white/90">
            <span className="font-mono">{fmtTime(positionSec)} / {fmtTime(durSec)}</span>
            <div className="absolute left-1/2 -translate-x-1/2 top-2 h-5 w-20 rounded-full bg-black/85" />
            <div className="flex items-center gap-1">
              <SignalDots />
              <BatteryIcon />
            </div>
          </div>

          {/* === MUSIC VIDEO STAGE === */}
          <div className="relative flex-1 mx-2 mt-1 mb-2 rounded-2xl overflow-hidden">
            <Visualizer isPlaying={isPlaying} brandColor={brandColor} />

            {/* Episode title overlay */}
            <div className="absolute inset-x-0 top-0 p-3 bg-gradient-to-b from-black/55 to-transparent">
              <p className="text-[0.55rem] uppercase tracking-wider text-white/70 font-semibold">
                {track?.emoji || "🎙️"} · {track?.wallName || "Now Playing"}
              </p>
              <p className="text-white font-serif text-sm leading-tight font-semibold mt-0.5 line-clamp-2 drop-shadow">
                {track?.episodeTitle || "Load a track from the wall"}
              </p>
            </div>

            {/* Center play overlay (only when paused and not at end) */}
            {!isPlaying && track && positionSec < durSec && (
              <button
                onClick={toggle}
                className="absolute inset-0 flex items-center justify-center group"
                aria-label="Play"
              >
                <span
                  className="flex items-center justify-center h-14 w-14 rounded-full backdrop-blur-md border-2 border-white/50 transition-transform group-hover:scale-105"
                  style={{ background: "oklch(0 0 0 / 0.35)" }}
                >
                  <PlayIcon className="h-6 w-6 text-white ml-0.5" />
                </span>
              </button>
            )}

            {/* Replay overlay (when at end) */}
            {track && positionSec >= durSec && durSec > 0 && (
              <button
                onClick={restart}
                className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 group"
                aria-label="Replay"
              >
                <span
                  className="flex items-center justify-center h-14 w-14 rounded-full backdrop-blur-md border-2 border-white/50 transition-transform group-hover:scale-105"
                  style={{ background: "oklch(0 0 0 / 0.35)" }}
                >
                  <ReplayIcon className="h-6 w-6 text-white" />
                </span>
                <span className="text-[0.6rem] font-semibold text-white/90 uppercase tracking-wider drop-shadow">
                  Tap to Replay
                </span>
              </button>
            )}

            {/* === LYRIC CAPTIONS === */}
            <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/85 via-black/40 to-transparent">
              {track ? (
                <>
                  {lyricLines[currentLineIdx]?.tag && (
                    <p className="text-[0.55rem] uppercase tracking-wider text-white/60 font-semibold mb-1">
                      {lyricLines[currentLineIdx].tag}
                    </p>
                  )}
                  <p
                    key={currentLineIdx}
                    className="text-white text-[0.78rem] leading-snug font-medium drop-shadow text-center line-clamp-2 animate-[fadein_0.4s_ease-out]"
                  >
                    {lyricLines[currentLineIdx]?.text || "♪"}
                  </p>
                  {lyricLines[currentLineIdx + 1] && (
                    <p className="text-white/45 text-[0.7rem] leading-snug mt-1 text-center line-clamp-1">
                      {lyricLines[currentLineIdx + 1].text}
                    </p>
                  )}
                </>
              ) : (
                <div className="text-center py-2">
                  <p className="text-white/70 text-[0.7rem] font-medium">
                    Pick a track from the wall →
                  </p>
                  <p className="text-white/40 text-[0.6rem] mt-0.5">
                    Generate a song, then send it to a wall.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* === PROGRESS BAR === */}
          <div className="px-3 pb-1">
            <div
              className="relative h-1 rounded-full bg-white/15 cursor-pointer"
              onClick={(e) => {
                if (!track) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const ratio = (e.clientX - rect.left) / rect.width;
                seek(ratio * durSec);
              }}
            >
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${progressPct}%`,
                  background: "linear-gradient(90deg, oklch(0.98 0.02 80), oklch(0.95 0.05 70))",
                }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full bg-white shadow-md transition-[left]"
                style={{ left: `calc(${progressPct}% - 5px)` }}
              />
            </div>
          </div>

          {/* === TRANSPORT CONTROLS === */}
          <div className="flex items-center justify-center gap-4 py-2 px-3">
            <button
              onClick={restart}
              disabled={!track}
              className="text-white/80 hover:text-white disabled:opacity-30 transition-colors"
              aria-label="Restart"
            >
              <PrevIcon className="h-4 w-4" />
            </button>
            <button
              onClick={toggle}
              disabled={!track}
              className="flex items-center justify-center h-11 w-11 rounded-full bg-white text-black shadow-lg disabled:opacity-30 hover:scale-105 transition-transform"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <PauseIcon className="h-5 w-5" />
              ) : (
                <PlayIcon className="h-5 w-5 ml-0.5" />
              )}
            </button>
            <button
              onClick={() => seek(positionSec + 5)}
              disabled={!track}
              className="text-white/80 hover:text-white disabled:opacity-30 transition-colors"
              aria-label="Skip 5 seconds"
            >
              <NextIcon className="h-4 w-4" />
            </button>
          </div>

          {/* === HOME INDICATOR === */}
          <div className="flex justify-center pb-2">
            <div className="h-1 w-24 rounded-full bg-white/40" />
          </div>
        </div>

        {/* Side buttons (volume + power) */}
        <div
          className="absolute -left-[3px] top-32 h-12 w-[3px] rounded-l-sm"
          style={{ background: "linear-gradient(180deg, oklch(0.7 0.02 60), oklch(0.4 0.02 50))" }}
        />
        <div
          className="absolute -left-[3px] top-48 h-16 w-[3px] rounded-l-sm"
          style={{ background: "linear-gradient(180deg, oklch(0.7 0.02 60), oklch(0.4 0.02 50))" }}
        />
        <div
          className="absolute -right-[3px] top-40 h-20 w-[3px] rounded-r-sm"
          style={{ background: "linear-gradient(180deg, oklch(0.7 0.02 60), oklch(0.4 0.02 50))" }}
        />
      </div>

      {/* === PLAY ENTIRE CLIP TOGGLE === */}
      <div
        className="w-full max-w-[280px] rounded-lg border border-border/60 bg-card p-3"
        data-active-wall={activeWallId}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-foreground">
              Play Entire Clip
            </p>
            <p className="text-[0.7rem] text-muted-foreground leading-tight">
              {playEntire
                ? `Full ${track ? durationToSeconds(track.episodeDuration) : 60}s playback — music-video mode`
                : `Preview mode — first ${Math.min(12, durSec)}s only`}
            </p>
          </div>
          <button
            role="switch"
            aria-checked={playEntire}
            onClick={() => setPlayEntire(!playEntire)}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
              playEntire ? "bg-primary" : "bg-muted"
            )}
          >
            <span
              className={cn(
                "inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform",
                playEntire ? "translate-x-5" : "translate-x-0"
              )}
            />
          </button>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Visualizer (animated bars over brand gradient)
// ----------------------------------------------------------------------------

function Visualizer({
  isPlaying,
  brandColor,
}: {
  isPlaying: boolean;
  brandColor: string;
}) {
  // Generate 24 bar heights deterministically.
  const bars = useMemo(
    () =>
      Array.from({ length: 24 }, (_, i) => ({
        base: 0.2 + ((i * 13) % 7) / 10,
        delay: (i % 6) * 0.12,
        duration: 0.7 + ((i * 7) % 5) * 0.08,
      })),
    []
  );

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(160deg, ${brandColor} 0%, ${shade(brandColor, -25)} 60%, ${shade(brandColor, -45)} 100%)`,
        }}
      />
      {/* Spinning spotlight */}
      <div
        className="absolute inset-0 opacity-40 mix-blend-overlay"
        style={{
          background:
            "radial-gradient(circle at 30% 30%, oklch(0.99 0.02 80 / 0.7) 0%, transparent 35%), radial-gradient(circle at 70% 70%, oklch(0.98 0.04 70 / 0.5) 0%, transparent 40%)",
          animation: isPlaying ? "drift 8s ease-in-out infinite alternate" : "none",
        }}
      />
      {/* Equalizer bars */}
      <div className="absolute inset-x-0 bottom-0 h-1/3 flex items-end justify-center gap-[3px] px-4 pb-2 opacity-50">
        {bars.map((b, i) => (
          <div
            key={i}
            className="flex-1 max-w-[6px] rounded-t-sm bg-white/70"
            style={{
              height: isPlaying ? `${b.base * 100}%` : "10%",
              animation: isPlaying
                ? `eq ${b.duration}s ease-in-out ${b.delay}s infinite alternate`
                : "none",
            }}
          />
        ))}
      </div>
      <style jsx global>{`
        @keyframes eq {
          0% { transform: scaleY(0.4); }
          100% { transform: scaleY(1.2); }
        }
        @keyframes drift {
          0% { transform: translate(-4%, -2%) scale(1); }
          100% { transform: translate(4%, 2%) scale(1.05); }
        }
        @keyframes fadein {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Tiny icon components (inline SVG, no extra deps)
// ----------------------------------------------------------------------------

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
function PauseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}
function ReplayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 4v4h4" />
    </svg>
  );
}
function PrevIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M6 5h2v14H6zM20 5L9 12l11 7z" />
    </svg>
  );
}
function NextIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M16 5h2v14h-2zM4 5l11 7L4 19z" />
    </svg>
  );
}
function SignalDots() {
  return (
    <div className="flex items-end gap-[1.5px] h-2.5">
      <span className="block w-[2px] h-1 bg-white/80 rounded-sm" />
      <span className="block w-[2px] h-1.5 bg-white/80 rounded-sm" />
      <span className="block w-[2px] h-2 bg-white/80 rounded-sm" />
      <span className="block w-[2px] h-2.5 bg-white/80 rounded-sm" />
    </div>
  );
}
function BatteryIcon() {
  return (
    <div className="flex items-center gap-0.5">
      <span className="block w-5 h-2.5 border border-white/60 rounded-[2px] relative">
        <span className="absolute inset-0.5 bg-white/80 rounded-[1px]" style={{ width: "70%" }} />
      </span>
      <span className="block w-0.5 h-1 bg-white/60 rounded-sm" />
    </div>
  );
}

// ----------------------------------------------------------------------------
// Color helpers
// ----------------------------------------------------------------------------

function oklchBgFromBrand(brand: string): string {
  // Dark gradient backdrop based on the brand color
  return `linear-gradient(180deg, ${shade(brand, -55)} 0%, ${shade(brand, -70)} 100%)`;
}

function shade(hex: string, percent: number): string {
  // Lightweight hex shader — lighten (+) or darken (-) a hex color by percent.
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const f = (c: number) => {
    const v = Math.round(c + (percent / 100) * 255);
    return Math.max(0, Math.min(255, v));
  };
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(f(r))}${toHex(f(g))}${toHex(f(b))}`;
}
