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
import { PenLine } from "lucide-react";
import type { StoryBible } from "@/lib/joe-prompts";
import type { StoryArc } from "@/lib/season";

interface Message {
  role: "user" | "ralph";
  text: string;
}

const OPENER: Message = {
  role: "ralph",
  text: "Ralph here, head writer. Before we map Joe's season: who's watching? Laid-off office folks, new grads getting ghosted, people over 50 told they're \"overqualified\"? And what do they get wrong about the job hunt that Joe can sing them out of?",
};

const STORAGE_KEY = "joe.writersRoom.messages";

function loadMessages(): Message[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Message[]) : null;
    return Array.isArray(parsed) && parsed.length ? parsed : [OPENER];
  } catch {
    return [OPENER];
  }
}

function saveMessages(messages: Message[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40)));
  } catch {
    // Private mode: the chat just won't survive a reload.
  }
}

async function post<T>(body: unknown): Promise<T> {
  const res = await fetch("/api/story-arc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || "Ralph stepped out. Try again.");
  return j as T;
}

function ArcPreview({ arc }: { arc: StoryArc }) {
  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
      <div className="font-serif text-base">{arc.title}</div>
      {arc.premise && <p className="text-muted-foreground">{arc.premise}</p>}
      {arc.characters.length > 1 && (
        <p className="text-xs">
          <span className="font-semibold">Cast:</span>{" "}
          {arc.characters
            .map((c) => `${c.name} (${c.role}${c.catchphrase ? `, “${c.catchphrase}”` : ""})`)
            .join(" · ")}
        </p>
      )}
      <ol className="space-y-1.5">
        {arc.acts.map((act) => (
          <li key={act.n}>
            <div className="text-xs font-semibold uppercase tracking-wide">
              Act {act.n}: {act.title}
            </div>
            <ul className="ml-3 list-disc text-xs text-muted-foreground">
              {arc.episodes
                .filter((e) => e.act === act.n)
                .map((e) => (
                  <li key={e.key}>
                    <span className="text-foreground">{e.label}</span>: {e.arc}
                  </li>
                ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * The writers' room: chat with Ralph about Joe's season, generate a story arc
 * from the conversation, preview it, and make it the arc "Continue the story"
 * follows. Saving or going back to Season 1 restarts the story at episode 1.
 */
export function WritersRoomDialog({
  onStoryChanged,
}: {
  onStoryChanged: (storyBible: StoryBible) => void;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([OPENER]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<"" | "chat" | "generate" | "save">("");
  const [current, setCurrent] = useState<{ arc: StoryArc; custom: boolean } | null>(null);
  const [draft, setDraft] = useState<StoryArc | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/story-arc", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j.arc) setCurrent({ arc: j.arc, custom: Boolean(j.custom) });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, draft]);

  const handleOpenChange = (next: boolean) => {
    if (next) setMessages(loadMessages());
    setOpen(next);
  };

  const update = (next: Message[]) => {
    setMessages(next);
    saveMessages(next);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    const next = [...messages, { role: "user" as const, text }];
    update(next);
    setInput("");
    setBusy("chat");
    try {
      const { reply } = await post<{ reply: string }>({ action: "chat", messages: next });
      update([...next, { role: "ralph", text: reply }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ralph stepped out.");
    } finally {
      setBusy("");
    }
  };

  const generate = async () => {
    setBusy("generate");
    try {
      const { arc } = await post<{ arc: StoryArc }>({ action: "generate", messages });
      setDraft(arc);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ralph couldn't write the arc.");
    } finally {
      setBusy("");
    }
  };

  const save = async () => {
    if (!draft) return;
    setBusy("save");
    try {
      const j = await post<{ arc: StoryArc; storyBible: StoryBible }>({ action: "save", arc: draft });
      setCurrent({ arc: j.arc, custom: true });
      setDraft(null);
      onStoryChanged(j.storyBible);
      toast.success(`“${j.arc.title}” is the new arc. Continue the story plays episode 1.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the arc.");
    } finally {
      setBusy("");
    }
  };

  const backToSeasonOne = async () => {
    setBusy("save");
    try {
      const res = await fetch("/api/story-arc", { method: "DELETE" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Couldn't switch back.");
      setCurrent({ arc: j.arc, custom: false });
      onStoryChanged(j.storyBible);
      toast.success("Back to Season 1, from episode 1.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't switch back.");
    } finally {
      setBusy("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
          <PenLine className="h-3.5 w-3.5" />
          Writers&apos; room
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-serif">Writers&apos; room with Ralph</DialogTitle>
          <DialogDescription>
            Plan Joe&apos;s season with Ralph, then generate the story arc every song follows.
            {current &&
              ` Now playing: ${current.arc.title}${current.custom ? "" : " (built in)"}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-[240px] overflow-y-auto thin-scroll space-y-2 pr-1">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                m.role === "ralph" ? "bg-muted" : "ml-auto bg-primary text-primary-foreground"
              }`}
            >
              {m.role === "ralph" && <div className="text-[0.65rem] font-semibold uppercase opacity-70">Ralph</div>}
              {m.text}
            </div>
          ))}
          {busy === "chat" && <div className="text-xs text-muted-foreground">Ralph is typing…</div>}
          {draft && <ArcPreview arc={draft} />}
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
            placeholder="Pitch an idea, answer Ralph, or ask for a twist…"
            className="min-h-[60px] text-sm"
            disabled={!!busy}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={send} disabled={!!busy || !input.trim()}>
              Send
            </Button>
            <Button size="sm" variant="secondary" onClick={generate} disabled={!!busy}>
              {busy === "generate" ? "Writing the season…" : "Generate arc"}
            </Button>
            {draft && (
              <Button size="sm" variant="default" onClick={save} disabled={!!busy}>
                {busy === "save" ? "Saving…" : "Use this arc (restarts the story)"}
              </Button>
            )}
            <span className="ml-auto flex gap-1">
              {current?.custom && (
                <Button size="sm" variant="ghost" onClick={backToSeasonOne} disabled={!!busy}>
                  Back to Season 1
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  update([OPENER]);
                  setDraft(null);
                }}
                disabled={!!busy}
              >
                New chat
              </Button>
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
