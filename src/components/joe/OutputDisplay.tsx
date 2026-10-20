"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Clapperboard,
  Copy,
  Film,
  Flame,
  Music,
  Quote,
  Send,
  Sparkles,
  Timer,
  Type,
  Video,
} from "lucide-react";
import { LyricsView } from "./LyricsView";
import { analyzeLyricFit } from "@/lib/lyric-budget";
import type { SongOutput } from "@/lib/joe-prompts";
import type { WallSummary } from "@/lib/walls";
import { toast } from "sonner";

interface Props {
  output: SongOutput;
  /** Duration key ("60s") or label the song was written for — drives the fit check. */
  durationKey?: string;
  /** Set when the editor pass just shortened this lyric to fit its time. */
  tightened?: boolean;
  episodeId?: string;
  walls: WallSummary[];
  activeWallId: string | null;
  onSetActiveWall: (id: string) => void;
  onSendToWall: (episodeId: string, wallId: string) => Promise<void>;
}

export function OutputDisplay({
  output,
  durationKey,
  tightened,
  episodeId,
  walls,
  activeWallId,
  onSetActiveWall,
  onSendToWall,
}: Props) {
  const [sending, setSending] = useState(false);
  const [targetWallId, setTargetWallId] = useState<string>(activeWallId ?? "");

  // Keep local selector in sync if the active wall changes elsewhere.
  // (We deliberately don't re-sync after the user picks a different target
  // here — that's the point of having a separate "send to" selector.)
  const effectiveTarget = targetWallId || activeWallId || walls[0]?.id || "";

  const handleSend = async () => {
    if (!episodeId) {
      toast.error("Episode is still saving. Try again in a moment.");
      return;
    }
    if (!effectiveTarget) {
      toast.error("Pick a wall first.");
      return;
    }
    setSending(true);
    try {
      await onSendToWall(episodeId, effectiveTarget);
      toast.success("Sent to wall.");
    } catch (e) {
      console.error(e);
      toast.error("Couldn't send to wall.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Tabs defaultValue="song" className="w-full">
      <TabsList className="grid w-full grid-cols-3 md:grid-cols-5 h-auto">
        <TabsTrigger value="song" className="py-2">
          <Music className="h-3.5 w-3.5 mr-1.5" /> Song
        </TabsTrigger>
        <TabsTrigger value="hooks" className="py-2">
          <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Hooks
        </TabsTrigger>
        <TabsTrigger value="ad" className="py-2">
          <Type className="h-3.5 w-3.5 mr-1.5" /> Ad Copy
        </TabsTrigger>
        <TabsTrigger value="video" className="py-2">
          <Film className="h-3.5 w-3.5 mr-1.5" /> Video
        </TabsTrigger>
        <TabsTrigger value="next" className="py-2">
          <Flame className="h-3.5 w-3.5 mr-1.5" /> Next
        </TabsTrigger>
      </TabsList>

      {/* ============================ SONG ============================ */}
      <TabsContent value="song" className="mt-4 space-y-4">
        <Card className="spotlight">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-baseline gap-2 justify-between">
              <CardTitle className="font-serif text-2xl md:text-3xl marquee-line">
                {output.episodeTitle}
              </CardTitle>
              <div className="flex flex-wrap gap-2">
                {output.duration && <Badge variant="secondary">{output.duration}</Badge>}
                <Badge variant="outline" className="font-mono text-[0.7rem]">
                  CROONER · BIG-BAND SWING
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* === SEND TO WALL === */}
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 text-primary text-xs uppercase tracking-wider font-semibold">
                <Send className="h-3.5 w-3.5" />
                Send to Wall
              </div>
              <Select
                value={effectiveTarget}
                onValueChange={(v) => {
                  setTargetWallId(v);
                  onSetActiveWall(v);
                }}
              >
                <SelectTrigger className="h-8 w-auto min-w-[160px] text-sm bg-card">
                  <SelectValue placeholder="Pick a wall" />
                </SelectTrigger>
                <SelectContent>
                  {walls.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      <span className="mr-1.5">{w.emoji}</span>
                      {w.name}
                      <span className="ml-2 text-[0.65rem] text-muted-foreground">
                        ({w.itemCount})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="h-8 ml-auto"
                onClick={handleSend}
                disabled={sending || !episodeId || !effectiveTarget}
              >
                <Send className="h-3.5 w-3.5 mr-1.5" />
                {sending ? "Sending…" : "Send to Wall"}
              </Button>
            </div>

            {output.songPremise && (
              <p className="text-sm text-foreground/90 leading-relaxed">
                <span className="font-semibold">The joke: </span>
                {output.songPremise}
              </p>
            )}

            {output.musicalDirection && (
              <div className="rounded-lg border border-border/60 bg-secondary/30 p-3">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1.5">
                  <Clapperboard className="h-3.5 w-3.5" /> Musical Direction
                </p>
                <p className="text-sm text-foreground/90 leading-relaxed">
                  {output.musicalDirection}
                </p>
              </div>
            )}
            <LyricFitNote
              lyrics={output.lyrics}
              durationKey={durationKey ?? output.duration}
              tightened={tightened}
            />
            <LyricsView lyrics={output.lyrics} />

            {output.closingLine && (
              <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4">
                <p className="text-xs uppercase tracking-wider text-primary mb-1 flex items-center gap-1.5">
                  <Quote className="h-3.5 w-3.5" /> Closing Line
                </p>
                <p className="font-serif italic text-lg text-foreground">
                  “{output.closingLine}”
                </p>
              </div>
            )}

            {(output.viralHook || output.socialClip?.lyrics) && (
              <div className="grid gap-3 sm:grid-cols-2">
                {output.viralHook && (
                  <div className="rounded-lg border border-border/60 bg-secondary/30 p-3">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5" /> Viral Hook
                    </p>
                    <p className="font-serif italic text-foreground">“{output.viralHook}”</p>
                  </div>
                )}
                {output.socialClip?.lyrics && (
                  <div className="rounded-lg border border-border/60 bg-secondary/30 p-3">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1.5">
                      <Clapperboard className="h-3.5 w-3.5" /> Social Clip {output.socialClip.section}
                    </p>
                    <p className="text-sm text-foreground/90 whitespace-pre-line leading-relaxed">
                      {output.socialClip.lyrics}
                    </p>
                  </div>
                )}
              </div>
            )}

            {output.performanceNotes && (
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                  Performance Notes
                </p>
                <p className="text-sm text-foreground/80 leading-relaxed">
                  {output.performanceNotes}
                </p>
              </div>
            )}

            <CopyButton
              label="Copy lyrics"
              value={`${output.episodeTitle}\n${"=".repeat(output.episodeTitle.length)}\n\n${output.lyrics}\n\n— Closing line: ${output.closingLine}`}
            />
          </CardContent>
        </Card>
      </TabsContent>

      {/* ============================ HOOKS ============================ */}
      <TabsContent value="hooks" className="mt-4 space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="font-serif text-xl flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              First-Three-Second Hooks
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Three opening lines engineered to stop a social scroll. Pick one,
              test the other two.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {output.hooks.map((h, i) => (
              <div
                key={i}
                className="group flex items-start gap-3 rounded-lg border border-border/60 bg-card p-3 hover:border-primary/40 transition-colors"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
                  {String.fromCharCode(65 + i)}
                </div>
                <p className="font-serif italic text-base text-foreground/90 leading-relaxed flex-1">
                  “{h}”
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => {
                    navigator.clipboard.writeText(h);
                    toast.success("Hook copied");
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </TabsContent>

      {/* ============================ AD COPY ============================ */}
      <TabsContent value="ad" className="mt-4 space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="font-serif text-xl flex items-center gap-2">
              <Type className="h-4 w-4 text-primary" />
              Facebook Ad Copy
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Entertainment first. The bootcamp shows up naturally — never
              before the joke lands.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <SectionLabel>Primary Text · Variation 1</SectionLabel>
              <CopyBlock text={output.adCopy.primaryTexts[0]} />
              <SectionLabel>Primary Text · Variation 2</SectionLabel>
              <CopyBlock text={output.adCopy.primaryTexts[1]} />
              <SectionLabel>Primary Text · Variation 3</SectionLabel>
              <CopyBlock text={output.adCopy.primaryTexts[2]} />
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {output.adCopy.headlines.map((h, i) => (
                <div key={i}>
                  <SectionLabel>Headline {i + 1}</SectionLabel>
                  <div className="rounded-md border border-border/60 bg-secondary/30 px-3 py-2 text-sm font-semibold">
                    {h}
                  </div>
                </div>
              ))}
            </div>

            <div>
              <SectionLabel>Short Description</SectionLabel>
              <p className="text-sm text-foreground/90 leading-relaxed">
                {output.adCopy.description}
              </p>
            </div>

            <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4">
              <SectionLabel>Call To Action</SectionLabel>
              <p className="font-serif italic text-lg text-foreground">
                {output.adCopy.cta}
              </p>
            </div>

            <CopyButton
              label="Copy full ad pack"
              value={JSON.stringify(output.adCopy, null, 2)}
            />
          </CardContent>
        </Card>
      </TabsContent>

      {/* ============================ VIDEO ============================ */}
      <TabsContent value="video" className="mt-4 space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="font-serif text-xl flex items-center gap-2">
              <Film className="h-4 w-4 text-primary" />
              Video Production Brief
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Practical for AI-generated video workflows. Caption-safe
              composition throughout.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <Field label="Aspect Ratio" value={output.videoBrief.aspectRatio} mono />
            <Field label="Visual Opening" value={output.videoBrief.visualOpening} />
            <Field label="Joe Performance Shot" value={output.videoBrief.performanceShot} />

            {output.videoBrief.onScreenCaptions.length > 0 && (
              <div>
                <SectionLabel>On-Screen Captions (funniest lines)</SectionLabel>
                <ul className="space-y-2">
                  {output.videoBrief.onScreenCaptions.map((c, i) => (
                    <li
                      key={i}
                      className="rounded-md border border-border/60 bg-card px-3 py-2 text-sm text-foreground/90"
                    >
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {output.videoBrief.sceneChanges.length > 0 && (
              <div>
                <SectionLabel>Suggested Scene Changes</SectionLabel>
                <ol className="space-y-2 list-decimal list-inside text-sm text-foreground/90">
                  {output.videoBrief.sceneChanges.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ol>
              </div>
            )}

            <Field label="Visual Punchline" value={output.videoBrief.visualPunchline} />
            <Field label="Final Frame" value={output.videoBrief.finalFrame} />

            <CopyButton
              label="Copy video brief"
              value={JSON.stringify(output.videoBrief, null, 2)}
            />
          </CardContent>
        </Card>
      </TabsContent>

      {/* ============================ NEXT EPISODE ============================ */}
      <TabsContent value="next" className="mt-4 space-y-4">
        <Card className="spotlight">
          <CardHeader className="pb-3">
            <CardTitle className="font-serif text-xl flex items-center gap-2">
              <Flame className="h-4 w-4 text-primary" />
              Coming Next from Joe
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4">
              <SectionLabel>Next-Episode Teaser</SectionLabel>
              <p className="font-serif italic text-lg text-foreground">
                {output.nextEpisodeTeaser}
              </p>
            </div>
            <div>
              <SectionLabel>Suggested Next Episode Title</SectionLabel>
              <div className="rounded-md border border-border/60 bg-secondary/30 px-4 py-3 font-serif text-lg">
                {output.nextEpisodeTitle}
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Video className="h-4 w-4" />
              Hit
              <span className="font-medium text-foreground">Continue the Story</span>
              in the control panel to write this next episode right now.
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">
      {children}
    </p>
  );
}

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  if (!value) return null;
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <p
        className={`text-sm text-foreground/90 leading-relaxed ${
          mono ? "font-mono text-xs" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function CopyBlock({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="group flex items-start gap-2 mb-3">
      <p className="text-sm text-foreground/90 leading-relaxed flex-1 rounded-md border border-border/60 bg-card px-3 py-2">
        {text}
      </p>
      <Button
        size="sm"
        variant="ghost"
        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        onClick={() => {
          navigator.clipboard.writeText(text);
          toast.success("Copied");
        }}
      >
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/**
 * How the lyric sits in the song's running time. The audio engine sings inside
 * an exact number of seconds, so a lyric past the ceiling is the one thing that
 * silently ruins an ending — this says so before it gets rendered.
 */
function LyricFitNote({
  lyrics,
  durationKey,
  tightened,
}: {
  lyrics: string;
  durationKey: string;
  tightened?: boolean;
}) {
  const fit = analyzeLyricFit(lyrics, durationKey);
  const good = fit.fits;
  const label = good
    ? `${fit.words} sung words · fits ${fit.seconds}s (target ~${fit.targetWords})`
    : fit.overBy > 0
      ? `${fit.words} sung words · ${fit.seconds}s holds ${fit.maxWords} — the ending may clip`
      : `${fit.words} sung words · no closing [OUTRO] for ${fit.seconds}s`;
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
        good
          ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
          : "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400"
      }`}
    >
      <Timer className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      <span className="leading-snug">
        {label}
        {tightened && (
          <span className="ml-1 italic">
            — Joe tightened it to land on the punchline.
          </span>
        )}
        <span className="block text-muted-foreground">
          Last line sung: “{fit.lastLine}”
        </span>
      </span>
    </div>
  );
}

function CopyButton({ label, value }: { label: string; value: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        navigator.clipboard.writeText(value);
        toast.success("Copied to clipboard");
      }}
    >
      <Copy className="h-3.5 w-3.5 mr-1.5" />
      {label}
    </Button>
  );
}
