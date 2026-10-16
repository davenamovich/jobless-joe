"use client";

import { create } from "zustand";
import { durationToSeconds } from "@/lib/walls";

/**
 * Client-side playback state for the phone display.
 *
 * We don't actually have audio (no real music files), so this simulates a
 * music-video playback experience: a position counter that ticks forward at
 * 1× speed, with play/pause/seek controls.
 *
 * The "playEntireClip" toggle controls the simulated playback duration:
 *  - OFF: preview mode — plays for min(actualDuration, 12s) so the user can
 *    quickly scrub through several episodes.
 *  - ON : plays the full requested duration (15s / 30s / 60s / 90s / 120s)
 *    in real time, as if it were the actual music video.
 */

export interface PlaybackTrack {
  wallItemId: string;
  episodeId: string;
  episodeTitle: string;
  episodeDuration: string; // "60s" etc
  brandColor: string;
  emoji: string;
  wallName: string;
  lyrics: string;
  closingLine: string;
}

interface PlaybackState {
  track: PlaybackTrack | null;
  isPlaying: boolean;
  positionSec: number; // current playback position in seconds
  playEntireClip: boolean;
  volume: number; // 0..100 (visual only)
  // The ID of the wall the current track came from.
  activeWallId: string | null;

  loadTrack: (track: PlaybackTrack, wallId: string) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  restart: () => void;
  seek: (sec: number) => void;
  setPlayEntireClip: (v: boolean) => void;
  setVolume: (v: number) => void;
  tick: () => void; // called by the playback timer hook
  clear: () => void;
}

function previewDuration(actualSec: number): number {
  // Quick preview: never longer than 12s, never shorter than 6s.
  return Math.max(6, Math.min(12, actualSec));
}

export function effectiveDuration(track: PlaybackTrack | null, playEntire: boolean): number {
  if (!track) return 0;
  const actual = durationToSeconds(track.episodeDuration);
  return playEntire ? actual : previewDuration(actual);
}

export const usePlayback = create<PlaybackState>((set, get) => ({
  track: null,
  isPlaying: false,
  positionSec: 0,
  playEntireClip: true, // default ON: full music-video playback
  volume: 80,
  activeWallId: null,

  loadTrack: (track, wallId) => {
    set({
      track,
      activeWallId: wallId,
      positionSec: 0,
      isPlaying: true, // auto-play on load
    });
  },

  play: () => {
    if (get().track) set({ isPlaying: true });
  },
  pause: () => set({ isPlaying: false }),
  toggle: () => {
    if (get().track) set({ isPlaying: !get().isPlaying });
  },
  restart: () => set({ positionSec: 0, isPlaying: true }),
  seek: (sec) => {
    const t = get().track;
    if (!t) return;
    const dur = effectiveDuration(t, get().playEntireClip);
    set({ positionSec: Math.max(0, Math.min(sec, dur)) });
  },
  setPlayEntireClip: (v) => set({ playEntireClip: v, positionSec: 0 }),
  setVolume: (v) => set({ volume: Math.max(0, Math.min(100, v)) }),

  tick: () => {
    const { track, isPlaying, positionSec, playEntireClip } = get();
    if (!track || !isPlaying) return;
    const dur = effectiveDuration(track, playEntireClip);
    const next = positionSec + 1;
    if (next >= dur) {
      // Pause at the end; UI can show a replay button.
      set({ positionSec: dur, isPlaying: false });
    } else {
      set({ positionSec: next });
    }
  },

  clear: () =>
    set({
      track: null,
      isPlaying: false,
      positionSec: 0,
      activeWallId: null,
    }),
}));
