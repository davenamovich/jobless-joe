"use client";

// Morning Show autopublish: once a day at the picked hour, Joe pulls the top
// posts, writes and voices the show, films the MP4 and posts it — no clicks.

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2, Play, Timer } from "lucide-react";
import { toast } from "sonner";

interface Status {
  enabled: boolean;
  hour: number;
  count: number;
  timeZone: string;
  running: boolean;
  step: string;
  lastRunAt: string | null;
  lastResult: string;
}

const COUNTS = [3, 5, 7, 10];

function hourLabel(h: number): string {
  const suffix = h < 12 ? "am" : "pm";
  return `${h % 12 || 12}${suffix}`;
}

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
}

export function MorningAutopublish() {
  const [status, setStatus] = useState<Status | null>(null);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(
    () =>
      fetch("/api/morning-show/autopilot", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((json: Status | null) => {
          if (json) setStatus(json);
        })
        .catch(() => {
          /* keep the last status */
        }),
    [],
  );

  // Load once, then poll while a run is going.
  useEffect(() => {
    refresh();
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [refresh]);
  useEffect(() => {
    if (!status?.running) return;
    pollRef.current = setTimeout(() => void refresh(), 10_000);
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [status, refresh]);

  const save = async (patch: Partial<Pick<Status, "enabled" | "hour" | "count">>) => {
    if (!status) return;
    const next = { ...status, ...patch };
    setStatus(next);
    setSaving(true);
    try {
      const res = await fetch("/api/backend/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          morningEnabled: next.enabled,
          morningHour: next.hour,
          morningCount: next.count,
          // The hour means this browser's local time.
          morningTimeZone: browserTimeZone(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Save failed (${res.status}).`);
      if (patch.enabled !== undefined) {
        toast.success(
          patch.enabled
            ? `Joe will post a Morning Show every day at ${hourLabel(next.hour)}.`
            : "Morning Show autopublish is off.",
        );
      }
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save.");
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    setStarting(true);
    try {
      const res = await fetch("/api/morning-show/autopilot", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status}).`);
      setStatus(json);
      toast.success("Making today's Morning Show. This takes several minutes.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start the show.");
    } finally {
      setStarting(false);
    }
  };

  if (!status) return null;

  return (
    <div className="mt-3 rounded-md border border-border/60 bg-secondary/20 p-2.5 space-y-2 text-xs">
      <div className="flex items-center gap-2">
        <Timer className="h-3.5 w-3.5 text-primary" />
        <p className="font-semibold">Autopublish every morning</p>
        <Switch
          className="ml-auto"
          checked={status.enabled}
          disabled={saving}
          onCheckedChange={(on) => void save({ enabled: on })}
          aria-label="Autopublish the Morning Show every day"
        />
      </div>
      <p className="text-[0.7rem] text-muted-foreground leading-relaxed">
        Joe pulls the top posts, writes and voices the show, films the MP4 (25 P&amp;R credits) and posts it
        through Upload-Post with the search-friendly YouTube copy.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5">
          <span className="text-muted-foreground">At</span>
          <select
            className="h-7 rounded-md border border-border/70 bg-card px-1.5"
            value={status.hour}
            disabled={saving}
            onChange={(e) => void save({ hour: Number(e.target.value) })}
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Top</span>
          <select
            className="h-7 rounded-md border border-border/70 bg-card px-1.5"
            value={status.count}
            disabled={saving}
            onChange={(e) => void save({ count: Number(e.target.value) })}
          >
            {COUNTS.map((n) => (
              <option key={n} value={n}>
                {n} posts
              </option>
            ))}
          </select>
        </label>
        <Button
          size="sm"
          variant="outline"
          className="h-7 ml-auto text-xs"
          onClick={runNow}
          disabled={starting || status.running}
        >
          {starting || status.running ? (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          ) : (
            <Play className="h-3 w-3 mr-1" />
          )}
          {status.running ? status.step || "Running…" : "Post one now"}
        </Button>
      </div>
      {status.lastResult && <p className="text-[0.7rem] text-muted-foreground">Last show: {status.lastResult}</p>}
    </div>
  );
}
