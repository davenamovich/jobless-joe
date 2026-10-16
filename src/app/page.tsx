"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BookOpen,
  Disc3,
  History as HistoryIcon,
  Smartphone,
  Sparkles,
  Star,
} from "lucide-react";
import {
  ControlPanel,
  CurrentSelectionChips,
} from "@/components/joe/ControlPanel";
import { EpisodeHistory, type EpisodeListItem } from "@/components/joe/EpisodeHistory";
import { MicLoader } from "@/components/joe/MicLoader";
import { OutputDisplay } from "@/components/joe/OutputDisplay";
import { PhoneDisplay } from "@/components/joe/PhoneDisplay";
import { StoryBibleCard } from "@/components/joe/StoryBibleCard";
import { WallManager } from "@/components/joe/WallManager";
import {
  EPISODES,
  INTENSITIES,
  type ActionKey,
  type DurationKey,
  type IntensityKey,
  type SongOutput,
  type StoryBible,
} from "@/lib/joe-prompts";
import type {
  WallSummary,
  WallWithItems,
} from "@/lib/walls";
import { toast } from "sonner";

interface ApiResponse {
  ok?: boolean;
  error?: string;
  output?: SongOutput;
  storyBible?: StoryBible;
  raw?: string;
}

export default function Home() {
  // === Form state ===
  const [episodeKey, setEpisodeKey] = useState<string>("joe-discovers-ai");
  const [customTopic, setCustomTopic] = useState<string>("");
  const [duration, setDuration] = useState<DurationKey>("60s");
  const [intensity, setIntensity] = useState<IntensityKey>("ridiculous");
  const [target, setTarget] = useState<string>("ai-curious");

  // === Output state ===
  const [output, setOutput] = useState<SongOutput | null>(null);
  const [storyBible, setStoryBible] = useState<StoryBible | null>(null);
  const [episodes, setEpisodes] = useState<EpisodeListItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingLabel, setLoadingLabel] = useState<string>("Joe is warming up…");
  const [activeError, setActiveError] = useState<string | null>(null);
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | undefined>();

  // === Wall state ===
  const [walls, setWalls] = useState<WallSummary[]>([]);
  const [activeWallId, setActiveWallId] = useState<string | null>(null);
  const [activeWall, setActiveWall] = useState<WallWithItems | null>(null);

  const refreshWalls = useCallback(async () => {
    try {
      const res = await fetch("/api/walls", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      const list: WallSummary[] = json.walls ?? [];
      setWalls(list);
      // Pick the first wall as active if none selected.
      setActiveWallId((prev) => prev ?? list[0]?.id ?? null);
    } catch (e) {
      console.error("Wall list failed", e);
    }
  }, []);

  const refreshActiveWall = useCallback(async () => {
    if (!activeWallId) {
      setActiveWall(null);
      return;
    }
    try {
      const res = await fetch(`/api/walls/${activeWallId}`, { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      setActiveWall(json.wall ?? null);
    } catch (e) {
      console.error("Wall fetch failed", e);
    }
  }, [activeWallId]);

  useEffect(() => {
    refreshWalls();
  }, [refreshWalls]);

  useEffect(() => {
    refreshActiveWall();
  }, [refreshActiveWall]);

  // === Wall mutations ===
  const handleCreateWall = useCallback(
    async (data: { name: string; brandColor: string; emoji: string; tagline: string }) => {
      const res = await fetch("/api/walls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        toast.error("Couldn't create wall.");
        return;
      }
      const json = await res.json();
      await refreshWalls();
      if (json.wall?.id) setActiveWallId(json.wall.id);
    },
    [refreshWalls]
  );

  const handleDeleteWall = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/walls?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error || "Couldn't delete wall.");
        return;
      }
      toast.success("Wall deleted.");
      if (activeWallId === id) setActiveWallId(null);
      await refreshWalls();
    },
    [refreshWalls, activeWallId]
  );

  const handleSendToWall = useCallback(
    async (episodeId: string, wallId: string) => {
      const res = await fetch(`/api/walls/${wallId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId }),
      });
      if (!res.ok) {
        toast.error("Couldn't send to wall.");
        return;
      }
      const json = await res.json();
      if (json.wall) {
        setActiveWall(json.wall);
        setWalls((prev) =>
          prev.map((w) =>
            w.id === json.wall.id ? { ...w, itemCount: json.wall.items.length } : w
          )
        );
      }
    },
    []
  );

  const handlePromote = useCallback(
    async (itemId: string) => {
      if (!activeWallId) return;
      const res = await fetch(`/api/walls/${activeWallId}/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "promote" }),
      });
      if (res.ok) {
        const j = await res.json();
        if (j.wall) setActiveWall(j.wall);
      }
    },
    [activeWallId]
  );

  const handleDemote = useCallback(
    async (itemId: string) => {
      if (!activeWallId) return;
      const res = await fetch(`/api/walls/${activeWallId}/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "demote" }),
      });
      if (res.ok) {
        const j = await res.json();
        if (j.wall) setActiveWall(j.wall);
      }
    },
    [activeWallId]
  );

  const handleRemoveItem = useCallback(
    async (itemId: string) => {
      if (!activeWallId) return;
      const res = await fetch(`/api/walls/${activeWallId}/items/${itemId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        const j = await res.json();
        if (j.wall) {
          setActiveWall(j.wall);
          setWalls((prev) =>
            prev.map((w) =>
              w.id === j.wall.id ? { ...w, itemCount: j.wall.items.length } : w
            )
          );
        }
      }
    },
    [activeWallId]
  );

  const handleSetPlaying = useCallback(
    async (itemId: string) => {
      if (!activeWallId) return;
      const res = await fetch(`/api/walls/${activeWallId}/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setStatus", status: "playing" }),
      });
      if (res.ok) {
        const j = await res.json();
        if (j.wall) setActiveWall(j.wall);
      }
    },
    [activeWallId]
  );

  // === Initial load: fetch story bible + episode list ===
  const refreshAll = useCallback(async () => {
    try {
      const [sbRes, epRes] = await Promise.all([
        fetch("/api/story-bible", { cache: "no-store" }),
        fetch("/api/episodes", { cache: "no-store" }),
      ]);
      if (sbRes.ok) {
        const sbJson = await sbRes.json();
        setStoryBible(sbJson.storyBible ?? null);
      }
      if (epRes.ok) {
        const epJson = await epRes.json();
        setEpisodes(epJson.episodes ?? []);
        // Auto-load the most recent episode into the display
        if (epJson.episodes?.length > 0 && !output) {
          const recent = epJson.episodes[0];
          const full = await fetch(`/api/episodes/${recent.id}`);
          if (full.ok) {
            const fullJson = await full.json();
            if (fullJson.output) {
              setOutput(fullJson.output);
              setSelectedEpisodeId(recent.id);
            }
          }
        }
      }
    } catch (e) {
      console.error("Initial load failed", e);
    }
  }, [output]);

  useEffect(() => {
    refreshAll();
  }, []);

  // === Generate / refine ===
  const handleAction = useCallback(
    async (action: ActionKey) => {
      const isCustom = episodeKey === "custom";
      if (isCustom && !customTopic.trim()) {
        toast.error("Type a custom topic before generating.");
        return;
      }
      const episodeLabel =
        isCustom ? "Custom Topic" : (labelForEpisode(episodeKey) ?? "Episode");

      setIsLoading(true);
      setActiveError(null);
      setLoadingLabel(labelForAction(action));

      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            episodeKey,
            episodeLabel,
            customTopic: isCustom ? customTopic.trim() : undefined,
            duration,
            intensity,
            target,
            action,
          }),
        });
        const json: ApiResponse = await res.json();
        if (!res.ok || !json.ok || !json.output) {
          const msg = json.error || "Joe forgot the words. Please try again.";
          setActiveError(msg);
          toast.error(msg);
          setIsLoading(false);
          return;
        }
        setOutput(json.output);
        if (json.storyBible) setStoryBible(json.storyBible);
        toast.success(episodeSuccessToast(action));
        // Refresh episode list in the background
        fetch("/api/episodes", { cache: "no-store" })
          .then((r) => r.json())
          .then((j) => {
            setEpisodes(j.episodes ?? []);
            setSelectedEpisodeId(j.episodes?.[0]?.id);
          })
          .catch(() => {});
      } catch (e) {
        console.error("Generate failed", e);
        const msg = "Network error. The crooner's phone is ringing. Try again.";
        setActiveError(msg);
        toast.error(msg);
      } finally {
        setIsLoading(false);
      }
    },
    [episodeKey, customTopic, duration, intensity, target]
  );

  // === Pick a historical episode to view ===
  const handleSelectEpisode = useCallback(async (id: string) => {
    setSelectedEpisodeId(id);
    try {
      const res = await fetch(`/api/episodes/${id}`);
      if (!res.ok) return;
      const json = await res.json();
      if (json.output) setOutput(json.output);
    } catch (e) {
      console.error("Load episode failed", e);
    }
  }, []);

  return (
    <div className="min-h-screen flex flex-col lounge-bg">
      <Header storyBible={storyBible} />

      <main className="flex-1 w-full max-w-[1500px] mx-auto px-4 md:px-6 py-6 md:py-8">
        {/* Selection chips */}
        <div className="mb-5">
          <CurrentSelectionChips
            episodeLabel={
              episodeKey === "custom"
                ? "Custom Topic"
                : labelForEpisode(episodeKey) ?? "Episode"
            }
            duration={duration}
            intensityLabel={
              INTENSITIES.find((i) => i.key === intensity)?.label ?? intensity
            }
            targetLabel={target}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)_360px] gap-6">
          {/* Left column: Controls */}
          <aside className="lg:sticky lg:top-20 self-start">
            <ControlPanel
              episodeKey={episodeKey}
              setEpisodeKey={setEpisodeKey}
              customTopic={customTopic}
              setCustomTopic={setCustomTopic}
              duration={duration}
              setDuration={setDuration}
              intensity={intensity}
              setIntensity={setIntensity}
              target={target}
              setTarget={setTarget}
              onAction={handleAction}
              isLoading={isLoading}
              hasEpisode={!!output}
            />
          </aside>

          {/* Middle column: Output + Story Bible + Episode Archive */}
          <section className="space-y-4 min-w-0">
            {activeError && (
              <Card className="border-destructive/40 bg-destructive/5">
                <CardContent className="py-3 text-sm text-destructive flex items-start gap-2">
                  <span className="font-semibold">Joe dropped a line:</span>
                  <span className="flex-1">{activeError}</span>
                </CardContent>
              </Card>
            )}

            {isLoading && <LoadingCard label={loadingLabel} />}

            {!isLoading && !output && !activeError && <EmptyState />}

            {!isLoading && output && (
              <OutputDisplay
                output={output}
                episodeId={selectedEpisodeId}
                walls={walls}
                activeWallId={activeWallId}
                onSetActiveWall={setActiveWallId}
                onSendToWall={handleSendToWall}
              />
            )}

            {/* Lower row: Story Bible + Episode Archive */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <BookOpen className="h-4 w-4 text-primary" />
                  <h2 className="font-serif text-lg">Story Bible</h2>
                  {storyBible && (
                    <span className="text-xs text-muted-foreground ml-auto">
                      Episode {storyBible.episodeCount}
                    </span>
                  )}
                </div>
                <StoryBibleCard storyBible={storyBible} />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <HistoryIcon className="h-4 w-4 text-primary" />
                  <h2 className="font-serif text-lg">Episode Archive</h2>
                </div>
                <EpisodeHistory
                  episodes={episodes}
                  onSelect={handleSelectEpisode}
                  selectedId={selectedEpisodeId}
                />
              </div>
            </div>
          </section>

          {/* Right column: Phone + Wall Manager */}
          <aside className="space-y-4 lg:sticky lg:top-20 self-start max-h-[calc(100vh-6rem)] overflow-y-auto thin-scroll pb-4">
            <div>
              <div className="flex items-center gap-2 mb-2 px-1">
                <Smartphone className="h-4 w-4 text-primary" />
                <h2 className="font-serif text-lg">Display Phone</h2>
                <span className="text-xs text-muted-foreground ml-auto">
                  Music Video Mode
                </span>
              </div>
              <PhoneDisplay />
            </div>
            <WallManager
              walls={walls}
              activeWallId={activeWallId}
              onSelectWall={setActiveWallId}
              onCreateWall={handleCreateWall}
              onDeleteWall={handleDeleteWall}
              wall={activeWall}
              onPromote={handlePromote}
              onDemote={handleDemote}
              onRemoveItem={handleRemoveItem}
              onSetPlaying={handleSetPlaying}
            />
          </aside>
        </div>
      </main>

      <Footer />
    </div>
  );
}

// ----------------------------------------------------------------------------
// Sub-components
// ----------------------------------------------------------------------------

function Header({ storyBible }: { storyBible: StoryBible | null }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/65">
      <div className="max-w-[1500px] mx-auto px-4 md:px-6 py-3 flex items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-primary/30">
            <Disc3 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-serif text-lg md:text-xl font-bold leading-tight marquee-line">
              Jobless Joe
            </h1>
            <p className="text-[0.7rem] md:text-xs text-muted-foreground leading-tight">
              The Crooner Song Engine · Bootcamp Companion
            </p>
          </div>
        </div>
        <div className="ml-auto hidden sm:flex items-center gap-2">
          {storyBible && (
            <span className="text-xs text-muted-foreground">
              Episode{" "}
              <span className="font-semibold text-foreground">
                {storyBible.episodeCount}
              </span>{" "}
              · {storyBible.characters.length} characters
            </span>
          )}
          <a
            href="https://www.plunderandriffle.com/joblessjoe"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline"
          >
            Official Joe page ↗
          </a>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-auto border-t border-border/60 bg-background/80 backdrop-blur">
      <div className="max-w-[1500px] mx-auto px-4 md:px-6 py-4 text-xs text-muted-foreground flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
        <p>
          Built for{" "}
          <a
            href="https://www.plunderandriffle.com/joblessjoe"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Jobless Joe's Bootcamp
          </a>
          . Comedy first. Curiosity second. The bootcamp shows up naturally.
        </p>
        <p className="opacity-70">
          Every song is another chapter. The crooner never quite retires.
        </p>
      </div>
    </footer>
  );
}

function EmptyState() {
  return (
    <Card className="border-dashed border-2 border-border/70 bg-card/50">
      <CardContent className="py-12 md:py-16 flex flex-col items-center text-center gap-3">
        <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          <Sparkles className="h-7 w-7" />
        </div>
        <h2 className="font-serif text-2xl md:text-3xl marquee-line">
          The Crooner Is Waiting in the Wings
        </h2>
        <p className="text-sm md:text-base text-muted-foreground max-w-md leading-relaxed">
          Pick an episode, a duration, and how ridiculous you want Joe to be —
          then press{" "}
          <span className="font-semibold text-foreground">Generate Song</span>.
          You'll get lyrics, three scroll-stopping hooks, Facebook ad copy,
          and a complete video production brief.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 mt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Star className="h-3 w-3" /> 16 episodes
          </span>
          <span className="opacity-50">·</span>
          <span>5 comedy intensities</span>
          <span className="opacity-50">·</span>
          <span>9 target audiences</span>
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingCard({ label }: { label: string }) {
  return (
    <Card className="spotlight">
      <CardContent className="py-2">
        <MicLoader label={label} />
        <div className="space-y-3">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-32 w-full" />
        </div>
      </CardContent>
    </Card>
  );
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function labelForEpisode(key: string): string | undefined {
  return EPISODES.find((e) => e.key === key)?.label;
}

function labelForAction(action: ActionKey): string {
  switch (action) {
    case "generate":
      return "Joe is choosing his opening line…";
    case "funnier":
      return "Joe is finding one more joke…";
    case "sharper":
      return "Joe is sharpening his punchlines…";
    case "attitude":
      return "Joe is loosening his tie and turning up the swagger…";
    case "bigger-ending":
      return "Joe is building a bigger finale…";
    case "thirty-ad":
      return "Joe is compressing to 30 seconds…";
    case "continue":
      return "Joe is writing the next chapter…";
    case "alt-hooks":
      return "Joe is trying three different openers…";
    default:
      return "Joe is warming up…";
  }
}

function episodeSuccessToast(action: ActionKey): string {
  switch (action) {
    case "generate":
      return "New episode composed.";
    case "funnier":
      return "Joe found the funny.";
    case "sharper":
      return "Punchlines sharpened.";
    case "attitude":
      return "Joe's swagger dialed up.";
    case "bigger-ending":
      return "Bigger ending landed.";
    case "thirty-ad":
      return "Compressed to a 30s ad.";
    case "continue":
      return "Next chapter written.";
    case "alt-hooks":
      return "Three new hooks ready.";
    default:
      return "Done.";
  }
}
