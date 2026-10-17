"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronUp,
  ListVideo,
  Plus,
  Play,
  Pause,
  Trash2,
  Tv,
  X,
} from "lucide-react";
import type { WallWithItems, WallSummary, WallItemSummary } from "@/lib/walls";
import { usePlayback } from "@/lib/playback-store";
import { cn } from "@/lib/utils";

interface Props {
  walls: WallSummary[];
  activeWallId: string | null;
  onSelectWall: (id: string) => void;
  onCreateWall: (data: {
    name: string;
    brandColor: string;
    emoji: string;
    tagline: string;
  }) => Promise<void>;
  onDeleteWall: (id: string) => Promise<void>;
  wall: WallWithItems | null;
  onPromote: (itemId: string) => Promise<void>;
  onDemote: (itemId: string) => Promise<void>;
  onRemoveItem: (itemId: string) => Promise<void>;
  onSetPlaying: (itemId: string) => Promise<void>;
}

const PRESET_COLORS = [
  { hex: "#722F37", name: "Burgundy" },
  { hex: "#1F4E3D", name: "Emerald" },
  { hex: "#1E3A5F", name: "Midnight" },
  { hex: "#7C4A1E", name: "Copper" },
  { hex: "#4A2E5C", name: "Plum" },
  { hex: "#2A2A2A", name: "Onyx" },
];

const PRESET_EMOJIS = ["🎙️", "📺", "🤖", "🦅", "🎸", "💼", "🛠️", "🍔", "👑", "🎤"];

export function WallManager(props: Props) {
  const {
    walls,
    activeWallId,
    onSelectWall,
    onCreateWall,
    onDeleteWall,
    wall,
    onPromote,
    onDemote,
    onRemoveItem,
    onSetPlaying,
  } = props;

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0].hex);
  const [newEmoji, setNewEmoji] = useState(PRESET_EMOJIS[0]);
  const [newTagline, setNewTagline] = useState("");

  const loadTrack = usePlayback((s) => s.loadTrack);
  const playingTrack = usePlayback((s) => s.track);
  const isPlaying = usePlayback((s) => s.isPlaying);
  const toggle = usePlayback((s) => s.toggle);

  const handleCreate = async () => {
    if (!newName.trim()) {
      toast.error("Wall name is required.");
      return;
    }
    await onCreateWall({
      name: newName.trim(),
      brandColor: newColor,
      emoji: newEmoji,
      tagline: newTagline.trim(),
    });
    setNewName("");
    setNewTagline("");
    setShowCreate(false);
    toast.success("Wall created.");
  };

  const handlePlayItem = async (item: WallItemSummary) => {
    if (!wall) return;
    // Mark the wall item as playing on the server.
    await onSetPlaying(item.id);
    // Load the track into the playback store. We need full episode output
    // for lyrics + closing line — the wall item carries a teaser but the
    // lyrics are loaded on demand.
    try {
      const [epRes, audioRes] = await Promise.all([
        fetch(`/api/episodes/${item.episodeId}`),
        fetch(
          `/api/audio?episodeId=${encodeURIComponent(
            item.episodeId
          )}&voice=jam`,
          { cache: "no-store" }
        ),
      ]);
      if (!epRes.ok) throw new Error("Failed to load episode");
      const json = await epRes.json();
      const out = json.output;

      // Audio may or may not be ready yet. If not, the playback store will
      // poll for it (see PhoneDisplay's polling effect).
      let audioUrl: string | null = null;
      let audioDurationSec = 0;
      if (audioRes.ok) {
        const audioJson = await audioRes.json();
        if (audioJson.hasAudio && audioJson.audioUrl) {
          audioUrl = audioJson.audioUrl;
          audioDurationSec = audioJson.durationSec || 0;
        }
      }

      loadTrack(
        {
          wallItemId: item.id,
          episodeId: item.episodeId,
          episodeTitle: out.episodeTitle ?? item.episodeTitle,
          episodeDuration: out.duration ?? item.episodeDuration,
          brandColor: wall.brandColor,
          emoji: wall.emoji,
          wallName: wall.name,
          lyrics: out.lyrics ?? "",
          closingLine: out.closingLine ?? "",
          voice: "jam",
          audioUrl,
          audioDurationSec,
        },
        wall.id
      );
      toast.success(
        audioUrl
          ? `Now playing: ${out.episodeTitle ?? item.episodeTitle}`
          : `Loading audio for: ${out.episodeTitle ?? item.episodeTitle}`
      );
    } catch (e) {
      console.error(e);
      toast.error("Couldn't load that track.");
    }
  };

  const playingItemId =
    playingTrack && playingTrack.wallItemId ? playingTrack.wallItemId : null;

  return (
    <Card className="overflow-hidden border-border/70">
      <CardContent className="p-0">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border/60 flex items-center gap-2">
          <ListVideo className="h-4 w-4 text-primary" />
          <h3 className="font-serif text-base">Wall Manager</h3>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7 text-xs"
            onClick={() => setShowCreate((v) => !v)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            New Wall
          </Button>
        </div>

        {/* Wall selector */}
        <div className="px-4 py-3 border-b border-border/60 space-y-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Active wall
          </Label>
          <Select
            value={activeWallId ?? ""}
            onValueChange={(v) => onSelectWall(v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Pick a wall" />
            </SelectTrigger>
            <SelectContent>
              {walls.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  <span className="mr-2">{w.emoji}</span>
                  <span className="font-medium">{w.name}</span>
                  <Badge variant="outline" className="ml-auto text-[0.65rem]">
                    {w.itemCount}
                  </Badge>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Wall preview strip */}
          {wall && (
            <div
              className="flex items-center gap-2 rounded-md p-2.5 mt-1"
              style={{
                background: `linear-gradient(135deg, ${wall.brandColor}22, ${wall.brandColor}08)`,
                borderLeft: `3px solid ${wall.brandColor}`,
              }}
            >
              <div
                className="h-9 w-9 rounded-full flex items-center justify-center text-lg shrink-0"
                style={{ background: wall.brandColor }}
              >
                {wall.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-serif text-sm font-semibold leading-tight truncate">
                  {wall.name}
                </p>
                {wall.tagline && (
                  <p className="text-[0.7rem] text-muted-foreground truncate">
                    {wall.tagline}
                  </p>
                )}
              </div>
              <Badge variant="secondary" className="text-[0.65rem] shrink-0">
                {wall.items.length} queued
              </Badge>
              {walls.length > 1 && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => onDeleteWall(wall.id)}
                  aria-label="Delete wall"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Create wall panel */}
        {showCreate && (
          <div className="px-4 py-3 border-b border-border/60 bg-secondary/30 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider">
                Create a Branded Wall
              </p>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={() => setShowCreate(false)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wall-name" className="text-xs">
                Wall name
              </Label>
              <Input
                id="wall-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Acme Bot's Wall"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wall-tagline" className="text-xs">
                Tagline (optional)
              </Label>
              <Input
                id="wall-tagline"
                value={newTagline}
                onChange={(e) => setNewTagline(e.target.value)}
                placeholder="e.g. Acme's daily AI shorts"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Brand color</Label>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c.hex}
                    onClick={() => setNewColor(c.hex)}
                    title={c.name}
                    className={cn(
                      "h-7 w-7 rounded-full border-2 transition-transform hover:scale-110",
                      newColor === c.hex
                        ? "border-foreground scale-110"
                        : "border-transparent"
                    )}
                    style={{ background: c.hex }}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Avatar emoji</Label>
              <div className="flex flex-wrap gap-1">
                {PRESET_EMOJIS.map((em) => (
                  <button
                    key={em}
                    onClick={() => setNewEmoji(em)}
                    className={cn(
                      "h-8 w-8 rounded-md text-base flex items-center justify-center border transition-colors",
                      newEmoji === em
                        ? "border-primary bg-primary/10"
                        : "border-border/60 hover:bg-secondary"
                    )}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>
            <Button onClick={handleCreate} className="w-full" size="sm">
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Create Wall
            </Button>
          </div>
        )}

        {/* Queue */}
        <div className="px-4 py-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
            <Tv className="h-3.5 w-3.5" />
            Queue
          </p>
          {!wall || wall.items.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/60 py-8 px-4 text-center">
              <p className="text-sm text-muted-foreground">
                No episodes in this wall yet.
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Generate a song, then hit{" "}
                <span className="font-semibold">Send to Wall</span>.
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[320px] -mx-1 px-1">
              <ul className="space-y-1.5">
                {wall.items.map((item, i) => {
                  const isCurrent = item.id === playingItemId;
                  return (
                    <li
                      key={item.id}
                      className={cn(
                        "group rounded-md border bg-card transition-colors",
                        isCurrent
                          ? "border-primary/60 bg-primary/5"
                          : "border-border/60 hover:border-primary/30"
                      )}
                    >
                      <div className="flex items-start gap-2 p-2">
                        <div className="flex flex-col items-center pt-1">
                          <span
                            className={cn(
                              "text-[0.7rem] font-mono w-5 text-center",
                              isCurrent ? "text-primary font-bold" : "text-muted-foreground"
                            )}
                          >
                            {i + 1}
                          </span>
                        </div>
                        <button
                          onClick={() => handlePlayItem(item)}
                          className="flex-1 text-left min-w-0"
                        >
                          <p className="text-sm font-medium leading-tight line-clamp-1">
                            {item.episodeTitle}
                          </p>
                          {item.episodeClosingLine && (
                            <p className="text-[0.7rem] text-muted-foreground italic line-clamp-1 mt-0.5">
                              “{item.episodeClosingLine}”
                            </p>
                          )}
                          <div className="flex flex-wrap gap-1 mt-1">
                            <Badge variant="secondary" className="text-[0.6rem] font-normal">
                              {item.episodeDuration}
                            </Badge>
                            {isCurrent && (
                              <Badge
                                variant="outline"
                                className="text-[0.6rem] font-normal border-primary/40 text-primary"
                              >
                                {isPlaying ? "Playing" : "Paused"}
                              </Badge>
                            )}
                          </div>
                        </button>
                        <div className="flex flex-col gap-0.5 shrink-0">
                          <button
                            onClick={() => onPromote(item.id)}
                            disabled={i === 0}
                            className="text-muted-foreground hover:text-foreground disabled:opacity-20 p-0.5"
                            aria-label="Move up"
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => onDemote(item.id)}
                            disabled={i === wall.items.length - 1}
                            className="text-muted-foreground hover:text-foreground disabled:opacity-20 p-0.5"
                            aria-label="Move down"
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      {isCurrent && (
                        <div className="px-2 pb-2 flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="default"
                            className="h-7 flex-1 text-xs"
                            onClick={toggle}
                          >
                            {isPlaying ? (
                              <>
                                <Pause className="h-3 w-3 mr-1" /> Pause
                              </>
                            ) : (
                              <>
                                <Play className="h-3 w-3 mr-1" /> Play
                              </>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-destructive hover:text-destructive"
                            onClick={() => onRemoveItem(item.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
