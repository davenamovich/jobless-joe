"use client";

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
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Clapperboard,
  Compass,
  Drama,
  Film,
  Music,
  Sparkles,
  Target,
  Timer,
  Wand2,
} from "lucide-react";
import {
  ACTIONS,
  DURATIONS,
  EPISODES,
  INTENSITIES,
  TARGETS,
  type ActionKey,
  type DurationKey,
  type IntensityKey,
} from "@/lib/joe-prompts";
import { CROONER_STYLES } from "@/lib/crooner-styles";

interface Props {
  episodeKey: string;
  setEpisodeKey: (v: string) => void;
  customTopic: string;
  setCustomTopic: (v: string) => void;
  duration: DurationKey;
  setDuration: (v: DurationKey) => void;
  intensity: IntensityKey;
  setIntensity: (v: IntensityKey) => void;
  target: string;
  setTarget: (v: string) => void;
  croonerStyle: string;
  setCroonerStyle: (v: string) => void;
  onAction: (action: ActionKey) => void;
  isLoading: boolean;
  hasEpisode: boolean;
}

export function ControlPanel(props: Props) {
  const {
    episodeKey,
    setEpisodeKey,
    customTopic,
    setCustomTopic,
    duration,
    setDuration,
    intensity,
    setIntensity,
    target,
    setTarget,
    croonerStyle,
    setCroonerStyle,
    onAction,
    isLoading,
    hasEpisode,
  } = props;

  const isCustom = episodeKey === "custom";
  const activeStyle = CROONER_STYLES.find((s) => s.key === croonerStyle);

  return (
    <Card className="overflow-hidden border-border/70 shadow-sm">
      <CardContent className="space-y-5 p-5">
        {/* EPISODE */}
        <div className="space-y-2">
          <SectionLabel icon={<Clapperboard className="h-3.5 w-3.5" />}>
            Choose the story episode
          </SectionLabel>
          <Select value={episodeKey} onValueChange={setEpisodeKey}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Pick an episode" />
            </SelectTrigger>
            <SelectContent>
              <ScrollArea className="h-[260px]">
                {EPISODES.map((e) => (
                  <SelectItem key={e.key} value={e.key}>
                    <span className="font-medium">{e.label}</span>
                  </SelectItem>
                ))}
                <SelectItem value="custom">
                  <span className="italic text-primary">✍️ Custom topic…</span>
                </SelectItem>
              </ScrollArea>
            </SelectContent>
          </Select>

          {isCustom && (
            <div className="space-y-1.5 pt-1">
              <Label htmlFor="custom-topic" className="text-xs text-muted-foreground">
                Type your custom topic
              </Label>
              <Input
                id="custom-topic"
                value={customTopic}
                onChange={(e) => setCustomTopic(e.target.value)}
                placeholder="e.g. Joe tries to convince his barber that AI won't replace him"
                className="bg-card"
              />
            </div>
          )}
        </div>

        <Separator />

        {/* DURATION */}
        <div className="space-y-2">
          <SectionLabel icon={<Timer className="h-3.5 w-3.5" />}>
            Song duration
          </SectionLabel>
          <Select
            value={duration}
            onValueChange={(v) => setDuration(v as DurationKey)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DURATIONS.map((d) => (
                <SelectItem key={d.key} value={d.key}>
                  <div className="flex flex-col">
                    <span>{d.label}</span>
                    <span className="text-[0.7rem] text-muted-foreground">
                      {d.words}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator />

        {/* INTENSITY */}
        <div className="space-y-2">
          <SectionLabel icon={<Drama className="h-3.5 w-3.5" />}>
            Comedy intensity
          </SectionLabel>
          <Select
            value={intensity}
            onValueChange={(v) => setIntensity(v as IntensityKey)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INTENSITIES.map((i) => (
                <SelectItem key={i.key} value={i.key}>
                  <div className="flex flex-col">
                    <span>{i.label}</span>
                    <span className="text-[0.7rem] text-muted-foreground">
                      {i.hint}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator />

        {/* TARGET */}
        <div className="space-y-2">
          <SectionLabel icon={<Target className="h-3.5 w-3.5" />}>
            Choose the target
          </SectionLabel>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TARGETS.map((t) => (
                <SelectItem key={t.key} value={t.key}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator />

        {/* CROONER STYLE */}
        <div className="space-y-2">
          <SectionLabel icon={<Music className="h-3.5 w-3.5" />}>
            Crooner style
          </SectionLabel>
          <Select value={croonerStyle} onValueChange={setCroonerStyle}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Pick a crooner style" />
            </SelectTrigger>
            <SelectContent>
              <ScrollArea className="h-[280px]">
                {CROONER_STYLES.map((s) => (
                  <SelectItem key={s.key} value={s.key}>
                    <div className="flex flex-col py-0.5">
                      <span className="flex items-center gap-1.5">
                        <span className="text-base">{s.emoji}</span>
                        <span className="font-medium">{s.label}</span>
                        <span className="ml-auto text-[0.65rem] text-muted-foreground">
                          {s.bpm} BPM
                        </span>
                      </span>
                      <span className="text-[0.7rem] text-muted-foreground leading-tight">
                        {s.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </ScrollArea>
            </SelectContent>
          </Select>
          {activeStyle && (
            <p className="text-[0.7rem] text-muted-foreground italic leading-relaxed">
              {activeStyle.emoji} {activeStyle.label} — Joe's character stays the
              same, the musical backdrop shifts.
            </p>
          )}
        </div>

        <Separator />

        {/* ACTIONS */}
        <div className="space-y-3">
          <SectionLabel icon={<Wand2 className="h-3.5 w-3.5" />}>
            Generate
          </SectionLabel>

          <Button
            size="lg"
            className="w-full h-auto py-3 text-base font-serif"
            disabled={isLoading || (isCustom && !customTopic.trim())}
            onClick={() => onAction("generate")}
          >
            <Music className="h-4 w-4 mr-2" />
            Generate Song
          </Button>

          <p className="text-xs text-muted-foreground px-1">
            Refine the current song — these rewrite your last episode:
          </p>

          <div className="grid grid-cols-2 gap-2">
            <ActionButton
              action="funnier"
              disabled={isLoading || !hasEpisode}
              onClick={onAction}
            />
            <ActionButton
              action="sharper"
              disabled={isLoading || !hasEpisode}
              onClick={onAction}
            />
            <ActionButton
              action="attitude"
              disabled={isLoading || !hasEpisode}
              onClick={onAction}
            />
            <ActionButton
              action="bigger-ending"
              disabled={isLoading || !hasEpisode}
              onClick={onAction}
            />
            <ActionButton
              action="thirty-ad"
              disabled={isLoading || !hasEpisode}
              onClick={onAction}
            />
            <ActionButton
              action="alt-hooks"
              disabled={isLoading || !hasEpisode}
              onClick={onAction}
            />
          </div>

          <Button
            variant="outline"
            className="w-full"
            disabled={isLoading || !hasEpisode}
            onClick={() => onAction("continue")}
          >
            <Compass className="h-4 w-4 mr-2" />
            Continue the Story →
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SectionLabel({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <p className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
      {icon}
      {children}
    </p>
  );
}

function ActionButton({
  action,
  disabled,
  onClick,
}: {
  action: ActionKey;
  disabled: boolean;
  onClick: (a: ActionKey) => void;
}) {
  const def = ACTIONS.find((a) => a.key === action);
  if (!def) return null;
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="secondary"
            size="sm"
            className="justify-start text-xs h-auto py-2 px-3"
            disabled={disabled}
            onClick={() => onClick(action)}
          >
            <span className="mr-1.5">{def.emoji}</span>
            {def.shortLabel}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[240px] text-xs">
          {def.instruction}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function CurrentSelectionChips({
  episodeLabel,
  duration,
  intensityLabel,
  targetLabel,
  croonerStyleLabel,
  croonerStyleEmoji,
}: {
  episodeLabel: string;
  duration: string;
  intensityLabel: string;
  targetLabel: string;
  croonerStyleLabel?: string;
  croonerStyleEmoji?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <Badge variant="secondary" className="font-normal">
        <Film className="h-3 w-3 mr-1" />
        {episodeLabel}
      </Badge>
      <Badge variant="secondary" className="font-normal">
        <Timer className="h-3 w-3 mr-1" />
        {duration}
      </Badge>
      <Badge variant="secondary" className="font-normal">
        <Sparkles className="h-3 w-3 mr-1" />
        {intensityLabel}
      </Badge>
      <Badge variant="secondary" className="font-normal">
        <Target className="h-3 w-3 mr-1" />
        {targetLabel}
      </Badge>
      {croonerStyleLabel && (
        <Badge
          variant="outline"
          className="font-normal border-primary/40 text-primary"
        >
          <span className="mr-1">{croonerStyleEmoji || "🎵"}</span>
          {croonerStyleLabel}
        </Badge>
      )}
    </div>
  );
}
