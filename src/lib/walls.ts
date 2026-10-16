/**
 * Wall + WallItem types shared between API and UI.
 */

export interface WallSummary {
  id: string;
  name: string;
  brandColor: string;
  emoji: string;
  tagline: string;
  itemCount: number;
  createdAt: string;
}

export interface WallItemSummary {
  id: string;
  wallId: string;
  episodeId: string;
  order: number;
  status: "queued" | "playing" | "played";
  createdAt: string;
  // Joined episode fields, denormalized for the UI:
  episodeTitle: string;
  episodeDuration: string;
  episodeTeaser: string;
  episodeClosingLine: string;
  episodeAction: string;
  episodeIntensity: string;
}

export interface WallWithItems extends WallSummary {
  items: WallItemSummary[];
}

/** Parse a song's duration key ("15s".."120s") into seconds for playback. */
export function durationToSeconds(duration: string | undefined | null): number {
  if (!duration) return 60;
  const m = duration.match(/^(\d+)s?$/);
  if (!m) return 60;
  return parseInt(m[1], 10) || 60;
}

/** Default wall seed for Jobless Joe — created on first run if missing. */
export const DEFAULT_WALL_SEED = {
  name: "Joe's Wall",
  brandColor: "#722F37",
  emoji: "🎙️",
  tagline: "The Crooner's Music Video Wall",
};
