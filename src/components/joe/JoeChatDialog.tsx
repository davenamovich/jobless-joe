"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { MessageCircle, Mic } from "lucide-react";
import type { JoeChatMessage } from "@/lib/joe-chat";

const OPENER: JoeChatMessage = {
  role: "joe",
  text: "Evening, kid. Pull up a stool. How's the job hunt treating you? Give me the worst part. That's the chorus.",
};

interface Saved {
  messages: JoeChatMessage[];
  facts: string[];
  songTopic: string;
}

const STORAGE_KEY = "joe.chat";
const EMPTY: Saved = { messages: [OPENER], facts: [], songTopic: "" };

function load(): Saved {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Saved) : null;
    return parsed && Array.isArray(parsed.messages) && parsed.messages.length ? parsed : EMPTY;
  } catch {
    return EMPTY;
  }
}

function save(state: Saved) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, messages: state.messages.slice(-40) }));
  } catch {
    // Private mode: the chat just won't survive a reload.
  }
}

/**
 * Chat with Joe, the Ralph-style chat from meme-loop-engine in Joe's voice.
 * He remembers the conversation and a few facts about you, and "Make it a
 * song" turns the whole conversation into a brief for a custom-topic song.
 */
export function JoeChatDialog({
  onMakeSong,
  disabled,
}: {
  onMakeSong: (topic: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<Saved>(EMPTY);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [briefing, setBriefing] = useState(false);
  const hasTalked = state.messages.some((m) => m.role === "user");
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [state.messages, busy]);

  const handleOpenChange = (next: boolean) => {
    if (next) setState(load());
    setOpen(next);
  };

  const update = (next: Saved) => {
    setState(next);
    save(next);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    const pending = { ...state, messages: [...state.messages, { role: "user" as const, text }] };
    update(pending);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/joe-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The opener is ours, not the model's; Joe's memory starts with the person.
        body: JSON.stringify({ messages: pending.messages.filter((m) => m.text !== OPENER.text), facts: state.facts }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Joe stepped out. Try again.");
      update({
        messages: [...pending.messages, { role: "joe", text: j.reply }],
        facts: j.facts ?? state.facts,
        songTopic: j.songTopic ?? text,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Joe stepped out.");
    } finally {
      setBusy(false);
    }
  };

  // Joe's head writer turns the whole conversation into the song's brief.
  const makeSong = async () => {
    if (busy || !hasTalked) return;
    setBriefing(true);
    let topic = state.songTopic;
    try {
      const res = await fetch("/api/joe-chat/song", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: state.messages.filter((m) => m.text !== OPENER.text), facts: state.facts }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.topic) topic = j.topic;
    } catch {
      // Keep the last-messages topic.
    } finally {
      setBriefing(false);
    }
    if (!topic) return;
    setOpen(false);
    onMakeSong(topic);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="secondary" className="w-full gap-2">
          <MessageCircle className="h-4 w-4" />
          Chat with Joe
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-serif">Chat with Joe</DialogTitle>
          <DialogDescription>
            Tell Joe about the job hunt. When something lands, make it a song.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-[240px] overflow-y-auto thin-scroll space-y-2 pr-1">
          {state.messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                m.role === "joe" ? "bg-muted" : "ml-auto bg-primary text-primary-foreground"
              }`}
            >
              {m.role === "joe" && <div className="text-[0.65rem] font-semibold uppercase opacity-70">Joe</div>}
              {m.text}
            </div>
          ))}
          {busy && <div className="text-xs text-muted-foreground">Joe is typing…</div>}
          <div ref={endRef} />
        </div>

        <div className="space-y-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Got ghosted again? Tell Joe…"
            className="min-h-[60px] text-sm"
            disabled={busy}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={send} disabled={busy || !input.trim()}>
              Send
            </Button>
            <Button size="sm" variant="default" className="gap-1" onClick={makeSong} disabled={busy || briefing || disabled || !hasTalked}>
              <Mic className="h-3.5 w-3.5" />
              {briefing ? "Writing it up…" : "Make it a song"}
            </Button>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => update(EMPTY)} disabled={busy}>
              New chat
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
