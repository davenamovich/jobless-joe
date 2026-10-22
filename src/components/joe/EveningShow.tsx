"use client";

// "Ask Joe" — the Evening Show, for Joe's real audience: people over 40 who
// are job hunting, driving for DoorDash or working out AI. Five kinds of
// segment (the mailbag, start using AI, videos for a penny, first access,
// in the news), a writers' room chat that turns "do one on gig work and AI
// scams" into a segment, and Joe's settings (who he's talking to, spice,
// length, news, side projects). The result lands in the Sit-down editor with
// its search-led YouTube copy, ready to voice, film and post.

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Mail, MessageSquare, Moon, Plus, RefreshCw, Send, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { LetterSource, ViewerLetter } from "@/lib/evening-show";
import {
  DEFAULT_SETTINGS,
  FOCUS_AREAS,
  FOCUS_LABELS,
  LENGTH_CHOICES,
  lengthLabel,
  normalizeSettings,
  SEGMENT_KINDS,
  SEGMENT_LABELS,
  SPICE_LEVELS,
  type AskJoeSettings,
  type ChatTurn,
  type SegmentKind,
  type SegmentPlan,
} from "@/lib/ask-joe";
import type { MorningShowResult } from "./MorningShow";

const COUNTS = [2, 3, 4, 5, 6];
const SOURCES: { key: LetterSource; label: string }[] = [
  { key: "mix", label: "Mix" },
  { key: "reddit", label: "Reddit" },
  { key: "madeup", label: "Made up" },
];
const SETTINGS_KEY = "joe.askjoe.settings";
const TOPIC_HINTS: Record<SegmentKind, string> = {
  letters: "",
  "ai-start": "e.g. writing a resume with AI",
  "penny-videos": "e.g. making a video from today's news",
  "early-access": "e.g. the project I'm testing this month",
  news: "e.g. layoffs this week",
};

function useSettings(): [AskJoeSettings, (next: AskJoeSettings) => void] {
  const [settings, setSettings] = useState<AskJoeSettings>(DEFAULT_SETTINGS);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) setSettings(normalizeSettings(JSON.parse(raw)));
    } catch {
      /* keep the defaults */
    }
  }, []);
  const save = (next: AskJoeSettings) => {
    setSettings(next);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
      /* private mode: settings last for this visit */
    }
  };
  return [settings, save];
}

const chip = (on: boolean) =>
  `px-2.5 py-1 text-xs rounded-md border ${on ? "bg-primary text-primary-foreground border-primary" : "border-border/70 hover:bg-muted"}`;
const field = "h-7 w-full rounded-md border border-border/70 bg-card px-2 text-xs";

function SettingsPanel({ settings, onChange }: { settings: AskJoeSettings; onChange: (s: AskJoeSettings) => void }) {
  const set = (patch: Partial<AskJoeSettings>) => onChange({ ...settings, ...patch });
  const setProject = (i: number, patch: Partial<AskJoeSettings["sideProjects"][number]>) =>
    set({ sideProjects: settings.sideProjects.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  return (
    <div className="space-y-3 rounded-md border border-border/60 p-2.5 text-xs">
      <div>
        <div className="mb-1 font-medium">Who Joe is talking to tonight</div>
        <div className="flex flex-wrap gap-1.5">
          {FOCUS_AREAS.map((f) => {
            const on = settings.focus.includes(f);
            return (
              <button
                key={f}
                type="button"
                className={chip(on)}
                onClick={() => set({ focus: on ? settings.focus.filter((x) => x !== f) : [...settings.focus, f] })}
              >
                {FOCUS_LABELS[f]}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2">
        <label className="space-y-1">
          <span className="block text-muted-foreground">Tone</span>
          <select className={field} value={settings.spice} onChange={(e) => set({ spice: e.target.value as AskJoeSettings["spice"] })}>
            {SPICE_LEVELS.map((s) => (
              <option key={s} value={s}>
                {s === "warm" ? "Warm" : s === "wry" ? "Wry" : "Roast (bosses, never viewers)"}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={settings.useNews} onChange={(e) => set({ useNews: e.target.checked })} />
        <span>Tie it to today&apos;s news (jobs, layoffs, AI headlines)</span>
      </label>
      <label className="block space-y-1">
        <span className="block text-muted-foreground">What a video costs (Joe says exactly this, nothing more)</span>
        <input className={field} value={settings.costNote} maxLength={80} onChange={(e) => set({ costNote: e.target.value })} placeholder="about a penny a video" />
      </label>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="font-medium">Side projects (viewers get first access)</span>
          <Button size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={settings.sideProjects.length >= 6} onClick={() => set({ sideProjects: [...settings.sideProjects, { name: "", blurb: "", url: "" }] })}>
            <Plus className="h-3 w-3 mr-1" /> Add
          </Button>
        </div>
        {settings.sideProjects.length === 0 && <p className="text-muted-foreground">None yet. Joe will only tease that he&apos;s tinkering.</p>}
        {settings.sideProjects.map((p, i) => (
          <div key={i} className="grid grid-cols-[1fr_auto] gap-1.5 rounded-md border border-border/50 p-1.5">
            <div className="space-y-1">
              <input className={field} value={p.name} maxLength={60} onChange={(e) => setProject(i, { name: e.target.value })} placeholder="Name" />
              <input className={field} value={p.blurb} maxLength={160} onChange={(e) => setProject(i, { blurb: e.target.value })} placeholder="One line on what it is" />
              <input className={field} value={p.url} maxLength={200} onChange={(e) => setProject(i, { url: e.target.value })} placeholder="Sign-up link (https://…)" />
            </div>
            <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Remove project" onClick={() => set({ sideProjects: settings.sideProjects.filter((_, j) => j !== i) })}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <label className="block space-y-1">
          <span className="block text-muted-foreground">Closing line for first access</span>
          <input className={field} value={settings.accessCta} maxLength={160} onChange={(e) => set({ accessCta: e.target.value })} placeholder="Get on the list and you're first through the door." />
        </label>
      </div>
    </div>
  );
}

export function EveningShow({
  onScript,
  language,
}: {
  onScript: (show: MorningShowResult) => void;
  language: string;
}) {
  const [settings, saveSettings] = useSettings();
  const [showSettings, setShowSettings] = useState(false);
  const [mode, setMode] = useState<SegmentKind | "chat">("chat");

  // Mailbag
  const [count, setCount] = useState(4);
  const [source, setSource] = useState<LetterSource>("mix");
  const [letters, setLetters] = useState<ViewerLetter[]>([]);
  const [kept, setKept] = useState<Set<number>>(new Set());
  const [pulling, setPulling] = useState(false);

  // Other segments
  const [topic, setTopic] = useState("");

  // Writers' room
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [plan, setPlan] = useState<SegmentPlan | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [turns, thinking]);

  const [writing, setWriting] = useState(false);

  const pull = async () => {
    setPulling(true);
    try {
      const res = await fetch(
        `/api/evening-show?count=${count}&source=${source}&language=${encodeURIComponent(language)}&settings=${encodeURIComponent(JSON.stringify(settings))}`,
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status}).`);
      const list = (json.letters ?? []) as ViewerLetter[];
      setLetters(list);
      setKept(new Set(list.map((_, i) => i)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't open the mailbag.");
    } finally {
      setPulling(false);
    }
  };

  const write = async (body: { letters: Pick<ViewerLetter, "from" | "question" | "source">[]; segment?: { kind: SegmentKind; topic?: string; notes?: string } }) => {
    setWriting(true);
    try {
      const res = await fetch("/api/evening-show", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, language, settings }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status}).`);
      onScript(json as MorningShowResult);
      toast.success("Ask Joe is written. Check it, then make the preview.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Joe couldn't write the show.");
    } finally {
      setWriting(false);
    }
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || thinking) return;
    const next: ChatTurn[] = [...turns, { role: "user", content: text }];
    setTurns(next);
    setDraft("");
    setThinking(true);
    try {
      const res = await fetch("/api/evening-show/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, settings }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status}).`);
      setTurns([...next, { role: "joe", content: String(json.reply ?? "") }]);
      setPlan((json.plan as SegmentPlan | null) ?? null);
    } catch (e) {
      setTurns(next.slice(0, -1));
      setDraft(text);
      toast.error(e instanceof Error ? e.message : "The writers' room is quiet.");
    } finally {
      setThinking(false);
    }
  };

  const toggle = (i: number) =>
    setKept((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground leading-relaxed">
        Ask Joe for the folks over 40 job hunting, driving DoorDash and working out AI: a mailbag, an AI first-steps walk-through, how Joe makes videos for
        pennies, first access to his side projects, or this week&apos;s news. Or just tell the writers what you want.
      </p>

      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className={`${chip(mode === "chat")} inline-flex items-center gap-1`} onClick={() => setMode("chat")}>
          <MessageSquare className="h-3 w-3" /> Writers&apos; room
        </button>
        {SEGMENT_KINDS.map((k) => (
          <button key={k} type="button" className={chip(mode === k)} onClick={() => setMode(k)} title={SEGMENT_LABELS[k].blurb}>
            {SEGMENT_LABELS[k].label}
          </button>
        ))}
        <Button size="sm" variant="ghost" className="h-7 ml-auto px-2 text-xs" onClick={() => setShowSettings((v) => !v)} aria-expanded={showSettings}>
          <Settings2 className="h-3.5 w-3.5 mr-1" /> Joe&apos;s settings
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Monologue length">
        <span className="text-xs text-muted-foreground mr-0.5">Length</span>
        {LENGTH_CHOICES.map((sec) => (
          <button
            key={sec}
            type="button"
            className={chip(settings.length === sec)}
            aria-pressed={settings.length === sec}
            onClick={() => saveSettings({ ...settings, length: sec })}
            title={`About ${lengthLabel(sec)} of Joe talking, in total`}
          >
            {lengthLabel(sec)}
          </button>
        ))}
      </div>

      {showSettings && <SettingsPanel settings={settings} onChange={saveSettings} />}

      {mode === "chat" && (
        <div className="space-y-2">
          <div className="max-h-64 overflow-y-auto space-y-1.5 rounded-md border border-border/60 p-2 text-xs">
            {turns.length === 0 && (
              <p className="text-muted-foreground">
                Try: &ldquo;Do a bit for guys who just started DoorDash and want to use AI for taxes&rdquo; or &ldquo;a mailbag about being told you&apos;re overqualified.&rdquo;
              </p>
            )}
            {turns.map((t, i) => (
              <div key={i} className={t.role === "user" ? "text-right" : ""}>
                <span className={`inline-block max-w-[90%] rounded-md px-2 py-1 text-left leading-snug ${t.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  {t.content}
                </span>
              </div>
            ))}
            {thinking && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            <div ref={endRef} />
          </div>
          <div className="flex gap-1.5">
            <input
              className={`${field} h-8`}
              value={draft}
              maxLength={1200}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Tell the writers what tonight's segment is…"
              aria-label="Message to the writers"
            />
            <Button size="sm" className="h-8" onClick={send} disabled={thinking || !draft.trim()} aria-label="Send">
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
          {plan && (
            <div className="space-y-1.5 rounded-md border border-primary/40 p-2 text-xs">
              <div className="font-medium">
                {SEGMENT_LABELS[plan.kind].label}
                {plan.topic ? `: ${plan.topic}` : ""}
              </div>
              {plan.notes && <p className="text-muted-foreground leading-snug">{plan.notes}</p>}
              {plan.letters.length > 0 && (
                <ul className="list-disc pl-4 space-y-0.5">
                  {plan.letters.map((l, i) => (
                    <li key={i} className="leading-snug">
                      {l.question}
                      {l.from ? <span className="text-muted-foreground"> — {l.from}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
              <Button
                size="sm"
                className="h-9 w-full"
                disabled={writing || (plan.kind === "letters" && plan.letters.length === 0)}
                onClick={() => write({ letters: plan.letters.map((l) => ({ ...l, source: "made up" })), segment: { kind: plan.kind, topic: plan.topic, notes: plan.notes } })}
              >
                {writing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Moon className="h-3.5 w-3.5 mr-1.5" />}
                {writing ? "Joe is writing…" : "Write this segment"}
              </Button>
            </div>
          )}
        </div>
      )}

      {mode === "letters" && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-md border border-border/70 overflow-hidden">
              {SOURCES.map((s) => (
                <button key={s.key} type="button" onClick={() => setSource(s.key)} className={`px-2.5 py-1 text-xs ${s.key === source ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                  {s.label}
                </button>
              ))}
            </div>
            <select className="h-7 rounded-md border border-border/70 bg-card px-1.5 text-xs" value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label="Number of letters">
              {COUNTS.map((n) => (
                <option key={n} value={n}>
                  {n} letters
                </option>
              ))}
            </select>
            <Button size="sm" variant="outline" className="h-8 ml-auto" onClick={pull} disabled={pulling}>
              {pulling ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : letters.length ? <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> : <Mail className="h-3.5 w-3.5 mr-1.5" />}
              {letters.length ? "New letters" : "Open the mailbag"}
            </Button>
          </div>
          {letters.length > 0 && (
            <>
              <ul className="space-y-1.5">
                {letters.map((l, i) => (
                  <li key={`${i}-${l.question.slice(0, 40)}`}>
                    <label className="flex items-start gap-2 rounded-md border border-border/60 p-2 text-xs cursor-pointer hover:bg-muted/50">
                      <input type="checkbox" className="mt-0.5" checked={kept.has(i)} onChange={() => toggle(i)} />
                      <span className="min-w-0">
                        <span className="block leading-snug">{l.question}</span>
                        <span className="text-[0.7rem] text-muted-foreground">
                          {l.from ? `${l.from} · ` : ""}
                          {l.source === "made up" ? "made up" : `${l.source} (Joe rewrites it anonymously)`}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <Button size="sm" className="h-9 w-full" onClick={() => write({ letters: letters.filter((_, i) => kept.has(i)) })} disabled={writing || kept.size === 0}>
                {writing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Moon className="h-3.5 w-3.5 mr-1.5" />}
                {writing ? "Joe is reading the mail…" : `Write Ask Joe (${kept.size})`}
              </Button>
            </>
          )}
        </>
      )}

      {mode !== "chat" && mode !== "letters" && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground leading-snug">{SEGMENT_LABELS[mode].blurb}.</p>
          <input className={`${field} h-8`} value={topic} maxLength={140} onChange={(e) => setTopic(e.target.value)} placeholder={`Topic (optional) ${TOPIC_HINTS[mode]}`} aria-label="Topic" />
          <Button size="sm" className="h-9 w-full" disabled={writing} onClick={() => write({ letters: [], segment: { kind: mode, topic: topic.trim() } })}>
            {writing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Moon className="h-3.5 w-3.5 mr-1.5" />}
            {writing ? "Joe is writing…" : `Write: ${SEGMENT_LABELS[mode].label}`}
          </Button>
        </div>
      )}
    </div>
  );
}
