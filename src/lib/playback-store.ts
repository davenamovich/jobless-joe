"use client";

import { create } from "zustand";
import { durationToSeconds } from "@/lib/walls";

/**
 * Playback state for the Display Phone.
 *
 * Now backed by a REAL audio element — the lyrics are spoken by Z.ai's TTS
 * engine (see /api/audio). The store exposes the audio URL + transport state;
 * the <PhoneDisplay> component owns the actual <audio> HTML element and
 * dispatches timeupdate / ended / play / pause events back into the store.
 *
 * The "playEntireClip" toggle now controls whether we seek to 0 and play the
 * whole TTS audio (ON) or just the first ~12 seconds for a quick preview (OFF).
 */

export interface PlaybackTrack {
  wallItemId: string;
  episodeId: string;
  episodeTitle: string;
  episodeDuration: string; // "60s" etc — used for fallback estimates + UI badges
  brandColor: string;
  emoji: string;
  wallName: string;
  lyrics: string;
  closingLine: string;
  /** TTS voice key (e.g. "jam") used for this track. */
  voice: string;
  /** Public URL of the generated MP3, or null if not yet generated. */
  audioUrl: string | null;
  /** Estimated duration in seconds from the TTS engine (for fallback UI). */
  audioDurationSec: number;
}

interface PlaybackState {
  track: PlaybackTrack | null;
  isPlaying: boolean;
  positionSec: number; // current playback position in seconds
  durationSec: number; // total duration in seconds (from the audio element)
  playEntireClip: boolean;
  volume: number; // 0..100 (applied to audio.volume)
  audioLoading: boolean; // true while waiting for TTS to finish generating
  audioError: string | null;
  activeWallId: string | null;

  loadTrack: (track: PlaybackTrack, wallId: string) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  restart: () => void;
  seek: (sec: number) => void;
  setPlayEntireClip: (v: boolean) => void;
  setVolume: (v: number) => void;
  /** Called from the <audio> element's timeupdate handler. */
  onTimeUpdate: (current: number, duration: number) => void;
  /** Called when the <audio> element's loadedmetadata fires. */
  onLoadedMetadata: (duration: number) => void;
  /** Called when the <audio> element ends naturally. */
  onEnded: () => void;
  /** Called when the audio asset fails to load (404, decode error, etc). */
  onError: (msg: string) => void;
  /** Mark audio as still generating (so the UI shows a loader). */
  setAudioLoading: (v: boolean) => void;
  /** Update just the audioUrl of the current track (after polling). */
  setAudioUrl: (url: string, durationSec: number) => void;
  clear: () => void;
}

export function effectiveDuration(track: PlaybackTrack | null, playEntire: boolean): number {
  if (!track) return 0;
  // Prefer the actual audio's reported duration. Fall back to the song's
  // requested duration (60s, 120s, etc) if we don't have audio yet.
  if (track.audioUrl && track.audioDurationSec > 0) {
    return playEntire ? track.audioDurationSec : Math.min(12, track.audioDurationSec);
  }
  const requested = durationToSeconds(track.episodeDuration);
  return playEntire ? requested : Math.min(12, requested);
}

export const usePlayback = create<PlaybackState>((set, get) => ({
  track: null,
  isPlaying: false,
  positionSec: 0,
  durationSec: 0,
  playEntireClip: true,
  volume: 80,
  audioLoading: false,
  audioError: null,
  activeWallId: null,

  loadTrack: (track, wallId) => {
    set({
      track,
      activeWallId: wallId,
      positionSec: 0,
      durationSec: track.audioDurationSec,
      isPlaying: false, // the <audio> element will start playback after it loads
      audioLoading: !track.audioUrl, // if no URL yet, we're waiting for generation
      audioError: null,
    });
  },

  play: () => {
    const { track } = get();
    if (!track) return;
    if (!track.audioUrl) {
      set({ audioLoading: true, audioError: null });
      return;
    }
    set({ isPlaying: true, audioError: null });
  },
  pause: () => set({ isPlaying: false }),
  toggle: () => {
    const { track, isPlaying } = get();
    if (!track) return;
    set({ isPlaying: !isPlaying });
  },
  restart: () => set({ positionSec: 0, isPlaying: true }),
  seek: (sec) => {
    const { track } = get();
    if (!track) return;
    const dur = get().durationSec || track.audioDurationSec;
    set({ positionSec: Math.max(0, Math.min(sec, dur)) });
  },
  setPlayEntireClip: (v) => set({ playEntireClip: v, positionSec: 0 }),
  setVolume: (v) => set({ volume: Math.max(0, Math.min(100, v)) }),

  onTimeUpdate: (current, duration) => {
    set({ positionSec: current, durationSec: duration });
    // If we're in preview mode and we've hit the cap, pause.
    const { playEntireClip, isPlaying, track } = get();
    if (!playEntireClip && isPlaying && current >= 12 && track) {
      set({ isPlaying: false });
    }
  },
  onLoadedMetadata: (duration) => {
    set({ durationSec: duration });
    if (get().track) {
      const t = get().track!;
      set({
        track: { ...t, audioDurationSec: duration },
      });
    }
    // Auto-start playback once metadata is loaded, if the user hit Play
    // while audio was still generating.
    if (get().audioLoading) {
      set({ audioLoading: false, isPlaying: true });
    }
  },
  onEnded: () => set({ isPlaying: false, positionSec: get().durationSec }),
  onError: (msg) => set({ audioError: msg, audioLoading: false, isPlaying: false }),
  setAudioLoading: (v) => set({ audioLoading: v }),
  setAudioUrl: (url, durationSec) => {
    const t = get().track;
    if (!t) return;
    set({
      track: { ...t, audioUrl: url, audioDurationSec: durationSec },
      audioLoading: false,
      // Auto-start playback once the audio finally arrives.
      isPlaying: true,
    });
  },

  clear: () =>
    set({
      track: null,
      isPlaying: false,
      positionSec: 0,
      durationSec: 0,
      audioLoading: false,
      audioError: null,
      activeWallId: null,
    }),
}));
