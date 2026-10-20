"use client";

// "Drop in a song" — any MP3/M4A/WAV becomes an episode (POST /api/upload-song):
// Whisper writes the lyrics, and the song page, stickman video and posting
// all work on it like one of Joe's own.

import { useRef, useState, type DragEvent } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { FileAudio, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

const MAX_BYTES = 25 * 1024 * 1024;
const ACCEPT = "audio/*,.mp3,.m4a,.wav,.ogg,.flac";

interface Props {
  /** Called with the new episode once the song is transcribed and saved. */
  onImported: (episodeId: string) => void;
  disabled?: boolean;
  className?: string;
}

export function SongDrop({ onImported, disabled, className = "" }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const upload = async (file: File | undefined) => {
    if (!file || busy) return;
    if (file.size > MAX_BYTES) {
      toast.error("That file is over 25 MB. Send a smaller MP3.");
      return;
    }
    setBusy(file.name);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload-song", { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.episodeId) throw new Error(json.error || `Upload failed (${res.status}).`);
      toast.success(`"${json.title}" transcribed — ${json.lines} lines.`);
      onImported(json.episodeId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (!disabled) void upload(e.dataTransfer.files?.[0]);
  };

  return (
    <Card className={`overflow-hidden border-border/70 shadow-sm ${className}`}>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <FileAudio className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Drop in a song</p>
        </div>
        <button
          type="button"
          disabled={disabled || !!busy}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          className={`flex w-full flex-col items-center gap-1.5 rounded-md border border-dashed px-3 py-5 text-center text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
            over ? "border-primary bg-primary/10" : "border-border/70 bg-secondary/30 hover:border-primary/60"
          }`}
        >
          {busy ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="font-medium">Transcribing {busy}…</span>
              <span className="text-muted-foreground">Usually under a minute.</span>
            </>
          ) : (
            <>
              <Upload className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium">Drag an MP3 here, or click to pick one</span>
              <span className="text-muted-foreground">MP3, M4A, WAV, OGG or FLAC · up to 25 MB</span>
            </>
          )}
        </button>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => void upload(e.target.files?.[0])}
        />
      </CardContent>
    </Card>
  );
}
