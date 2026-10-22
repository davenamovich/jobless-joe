"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clapperboard, Copy, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { SongOutput } from "@/lib/joe-prompts";
import {
  RETENTION_BEATS,
  videoScriptCaptions,
  videoScriptText,
  type RetentionKey,
  type VideoScriptBeat,
} from "@/lib/retention-format";

/** The reference format's colours: red hooks, yellow lock-in, purple body… */
const BEAT_STYLES: Record<string, { box: string; label: string }> = {
  red: { box: "border-l-red-500 bg-red-500/5", label: "text-red-600 dark:text-red-400" },
  yellow: { box: "border-l-yellow-400 bg-yellow-400/5", label: "text-yellow-600 dark:text-yellow-300" },
  purple: { box: "border-l-purple-500 bg-purple-500/5", label: "text-purple-600 dark:text-purple-400" },
  cyan: { box: "border-l-cyan-400 bg-cyan-400/5", label: "text-cyan-600 dark:text-cyan-300" },
  white: { box: "border-l-foreground/60 bg-foreground/[0.03]", label: "text-foreground" },
  green: { box: "border-l-emerald-500 bg-emerald-500/5", label: "text-emerald-600 dark:text-emerald-400" },
};

function copy(text: string, what: string) {
  navigator.clipboard.writeText(text);
  toast.success(`${what} copied`);
}

/**
 * The episode's short-form video script in the retention format, one coloured
 * beat per row. Each beat can be regenerated on its own.
 */
export function RetentionScript({
  output,
  episodeId,
}: {
  output: SongOutput;
  episodeId?: string;
}) {
  const [script, setScript] = useState<VideoScriptBeat[]>(output.videoScript ?? []);
  const [busy, setBusy] = useState<RetentionKey | null>(null);

  const regenerate = async (section: RetentionKey) => {
    if (!episodeId) {
      toast.error("Episode is still saving. Try again in a moment.");
      return;
    }
    setBusy(section);
    try {
      const res = await fetch("/api/generate/section", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId, section }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Rewrite failed");
      setScript(data.videoScript);
      toast.success("Beat rewritten");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rewrite failed");
    } finally {
      setBusy(null);
    }
  };

  const ctaText = [
    script.find((b) => b.section === "cta")?.voiceover,
    output.socialCaption,
    output.firstComment && `First comment: ${output.firstComment}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="font-serif text-xl flex items-center gap-2">
          <Clapperboard className="h-4 w-4 text-primary" />
          Short-Form Script
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Hook, lock-in, body, rehooks, payoff, CTA — for Reels, TikTok and
          Shorts. Rewrite any beat on its own.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {script.length === 0 && (
          <p className="text-sm text-muted-foreground">
            This episode was written before the short-form script existed.
            Generate a new song to get one.
          </p>
        )}
        {RETENTION_BEATS.map((meta) => {
          const beat = script.find((b) => b.section === meta.key);
          if (!beat) return null;
          const style = BEAT_STYLES[meta.color];
          return (
            <div
              key={meta.key}
              className={`rounded-md border border-border/60 border-l-4 p-3 ${style.box}`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className={`text-xs uppercase tracking-wider font-semibold ${style.label}`}
                >
                  {meta.label}
                </span>
                {beat.timing && (
                  <span className="font-mono text-[0.7rem] text-muted-foreground">{beat.timing}</span>
                )}
                <div className="ml-auto flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    title="Copy this beat"
                    onClick={() => copy(videoScriptText([beat]), meta.label)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    title={`Rewrite the ${meta.label.toLowerCase()}`}
                    disabled={busy !== null}
                    onClick={() => regenerate(meta.key)}
                  >
                    {busy === meta.key ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>
              <div className="space-y-1 text-sm text-foreground/90">
                {beat.voiceover && <p className="font-serif italic whitespace-pre-line">“{beat.voiceover}”</p>}
                {beat.caption && (
                  <p>
                    <span className="text-xs text-muted-foreground">Caption: </span>
                    <span className="font-semibold">{beat.caption}</span>
                  </p>
                )}
                {beat.visual && (
                  <p className="text-foreground/80">
                    <span className="text-xs text-muted-foreground">Visual: </span>
                    {beat.visual}
                  </p>
                )}
                {beat.sound && (
                  <p className="text-foreground/80">
                    <span className="text-xs text-muted-foreground">Sound: </span>
                    {beat.sound}
                  </p>
                )}
              </div>
            </div>
          );
        })}

        {(output.socialCaption || output.firstComment) && (
          <div className="rounded-md border border-border/60 bg-secondary/30 p-3 space-y-2 text-sm">
            {output.socialCaption && (
              <p>
                <span className="text-xs uppercase tracking-wider text-muted-foreground block">Post caption</span>
                {output.socialCaption}
              </p>
            )}
            {output.firstComment && (
              <p>
                <span className="text-xs uppercase tracking-wider text-muted-foreground block">First comment</span>
                {output.firstComment}
              </p>
            )}
          </div>
        )}

        {script.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => copy(videoScriptText(script), "Script")}>
              <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy script
            </Button>
            <Button variant="outline" size="sm" onClick={() => copy(videoScriptCaptions(script), "Captions")}>
              <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy captions
            </Button>
            {ctaText && (
              <Button variant="outline" size="sm" onClick={() => copy(ctaText, "CTA")}>
                <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy CTA
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
