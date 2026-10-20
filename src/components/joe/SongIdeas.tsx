"use client";

// "Song ideas" — Old Joe concepts that are already funny on paper.
// Clicking a chip writes the song straight away, like a trending idea.

import { Card, CardContent } from "@/components/ui/card";
import { Mic } from "lucide-react";
import { SONG_IDEAS, type SongIdea } from "@/lib/song-ideas";

interface Props {
  onPick: (idea: SongIdea) => void;
  disabled?: boolean;
  className?: string;
}

export function SongIdeas({ onPick, disabled, className = "" }: Props) {
  return (
    <Card className={`overflow-hidden border-border/70 shadow-sm ${className}`}>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <Mic className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Song ideas</p>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Old Joe&apos;s greatest hits, waiting to be written. One click writes the song.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {SONG_IDEAS.map((idea) => (
            <button
              key={idea.label}
              type="button"
              onClick={() => onPick(idea)}
              disabled={disabled}
              title={idea.topic}
              className="rounded-full border border-border/70 bg-secondary/40 px-2.5 py-1 text-[0.72rem] font-medium hover:border-primary hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              🎤 {idea.label}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
