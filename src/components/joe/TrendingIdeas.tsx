"use client";

// "Trending now" — today's trends as one-click song ideas (GET /api/trending).
// Clicking a chip generates a song on that topic straight away.

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Flame, Loader2, RefreshCw } from "lucide-react";

export interface TrendIdea {
  label: string;
  topic: string;
  source: "google" | "hn" | "mixed";
}

interface Props {
  onPick: (idea: TrendIdea) => void;
  disabled?: boolean;
  className?: string;
}

export function TrendingIdeas({ onPick, disabled, className = "" }: Props) {
  const [ideas, setIdeas] = useState<TrendIdea[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/trending${refresh ? "?refresh=1" : ""}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Couldn't load trends.");
      setIdeas(json.ideas ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load trends.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card className={`overflow-hidden border-border/70 shadow-sm ${className}`}>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Trending now</p>
          <button
            type="button"
            onClick={() => load(true)}
            disabled={loading}
            title="Pull fresh trends"
            className="ml-auto rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Today&apos;s trends, as Joe would sing them. One click writes the song.
        </p>

        {loading && !ideas.length && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading the headlines…
          </div>
        )}
        {error && !ideas.length && <p className="text-xs text-destructive">{error}</p>}

        {ideas.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {ideas.map((idea) => (
              <button
                key={idea.label}
                type="button"
                onClick={() => onPick(idea)}
                disabled={disabled}
                title={idea.topic}
                className="rounded-full border border-border/70 bg-secondary/40 px-2.5 py-1 text-[0.72rem] font-medium hover:border-primary hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {idea.source === "hn" ? "💻 " : "🔥 "}
                {idea.label}
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
