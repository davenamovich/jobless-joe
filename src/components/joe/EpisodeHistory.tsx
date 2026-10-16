"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { Clock, History, Music4 } from "lucide-react";

export interface EpisodeListItem {
  id: string;
  createdAt: string;
  episodeLabel: string;
  customTopic: string | null;
  duration: string;
  intensity: string;
  target: string;
  action: string;
  title: string;
  teaser: string;
  nextTitle: string;
  closingLine: string;
  hooks: string[];
}

interface Props {
  episodes: EpisodeListItem[];
  onSelect?: (id: string) => void;
  selectedId?: string;
}

const INTENSITY_LABELS: Record<string, string> = {
  "dry-wit": "Dry wit",
  deadpan: "Deadpan",
  ridiculous: "Ridiculous",
  "savage-roast": "Savage roast",
  unhinged: "Unhinged",
};

export function EpisodeHistory({ episodes, onSelect, selectedId }: Props) {
  if (episodes.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-10 flex flex-col items-center text-center text-sm text-muted-foreground gap-2">
          <History className="h-6 w-6 opacity-60" />
          No episodes yet. Generate your first Jobless Joe song to start the
          series.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="px-4 py-3 border-b border-border/60 flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          <h3 className="font-serif text-base">Episode Archive</h3>
          <Badge variant="outline" className="ml-auto text-[0.65rem]">
            {episodes.length} saved
          </Badge>
        </div>
        <ScrollArea className="h-[420px]">
          <ul className="divide-y divide-border/50">
            {episodes.map((ep) => (
              <li
                key={ep.id}
                className={`px-4 py-3 cursor-pointer transition-colors ${
                  selectedId === ep.id ? "bg-primary/5" : "hover:bg-secondary/40"
                }`}
                onClick={() => onSelect?.(ep.id)}
              >
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <p className="font-serif text-sm font-semibold leading-tight line-clamp-2">
                    {ep.title}
                  </p>
                  <span className="text-[0.7rem] text-muted-foreground shrink-0 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDistanceToNow(new Date(ep.createdAt), {
                      addSuffix: true,
                    })}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                  <Badge variant="secondary" className="text-[0.65rem] font-normal">
                    {ep.duration}
                  </Badge>
                  <Badge variant="outline" className="text-[0.65rem] font-normal">
                    {INTENSITY_LABELS[ep.intensity] ?? ep.intensity}
                  </Badge>
                  <Badge variant="outline" className="text-[0.65rem] font-normal">
                    {ep.action}
                  </Badge>
                </div>
                {ep.closingLine && (
                  <p className="text-xs text-muted-foreground italic line-clamp-2 flex items-start gap-1.5">
                    <Music4 className="h-3 w-3 mt-0.5 shrink-0" />
                    “{ep.closingLine}”
                  </p>
                )}
              </li>
            ))}
          </ul>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
