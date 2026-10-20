"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  AlertCircle,
  CheckCircle2,
  Clapperboard,
  Loader2,
  Mic,
  Send,
  Settings2,
  Timer,
  Youtube,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

interface BackendConfigResponse {
  activeBackend: "zai" | "openai-compat";
  openaiBaseUrl: string;
  openaiModel: string;
  audioEngine: "zai" | "acestep";
  aceStepBaseUrl: string;
  aceStepModel: string;
  hasApiKey: boolean;
  apiKeyMasked: string;
  prMcpUrl: string;
  prRef: string;
  publicBaseUrl: string;
  courseUrl: string;
  hasPrKey: boolean;
  prKeyMasked: string;
  ytClientId: string;
  ytPrivacy: "unlisted" | "public" | "private";
  hasYtClient: boolean;
  ytSecretMasked: string;
  ytConnected: boolean;
  upUser: string;
  upPlatforms: string;
  hasUpKey: boolean;
  upKeyMasked: string;
  hasFishKey: boolean;
  fishKeyMasked: string;
  fishJoeVoiceId: string;
  fishGuestVoiceId: string;
  autoEnabled: boolean;
  autoIntervalMin: number;
  autoPublish: boolean;
}

interface AutopilotStatus {
  running: boolean;
  step: string;
  lastRunAt: string | null;
  lastResult: string;
}

const UP_PLATFORM_OPTIONS = ["tiktok", "instagram", "youtube", "facebook", "x", "threads", "linkedin", "bluesky"];

interface YouTubeStatusResponse {
  configured: boolean;
  connected: boolean;
  channelTitle: string;
  privacy: string;
  redirectUri: string;
}

interface TestResponse {
  ok: boolean;
  backend: string;
  model?: string;
  message: string;
  latencyMs?: number;
}

interface Props {
  /** Called after a config save so the parent can refresh its header badge. */
  onConfigChanged?: () => void;
}

export function SettingsDialog({ onConfigChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResponse | null>(null);

  const [backend, setBackend] = useState<"zai" | "openai-compat">("zai");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [audioEngine, setAudioEngine] = useState<"zai" | "acestep">("zai");
  const [aceBaseUrl, setAceBaseUrl] = useState("");
  const [aceModel, setAceModel] = useState("");
  const [hasExistingKey, setHasExistingKey] = useState(false);
  const [keyMasked, setKeyMasked] = useState("");

  // Plunder & Riffle video engine
  const [prUrl, setPrUrl] = useState("");
  const [prKey, setPrKey] = useState("");
  const [prRef, setPrRef] = useState("");
  const [publicBase, setPublicBase] = useState("");
  const [courseUrl, setCourseUrl] = useState("");
  const [hasExistingPrKey, setHasExistingPrKey] = useState(false);
  const [prKeyMasked, setPrKeyMasked] = useState("");
  const [testingPr, setTestingPr] = useState(false);
  const [prTest, setPrTest] = useState<{ ok: boolean; message: string } | null>(null);

  // YouTube publishing (Google OAuth + YouTube Data API)
  const [ytClientId, setYtClientId] = useState("");
  const [ytClientSecret, setYtClientSecret] = useState("");
  const [ytPrivacy, setYtPrivacy] = useState<"unlisted" | "public" | "private">(
    "unlisted"
  );
  const [hasExistingYtClient, setHasExistingYtClient] = useState(false);
  const [ytSecretMasked, setYtSecretMasked] = useState("");
  const [ytConnected, setYtConnected] = useState(false);
  const [ytStatus, setYtStatus] = useState<YouTubeStatusResponse | null>(null);
  const [ytBusy, setYtBusy] = useState(false);

  // Upload-Post
  const [upKey, setUpKey] = useState("");
  const [upUser, setUpUser] = useState("");
  const [upPlatforms, setUpPlatforms] = useState<string[]>([]);
  const [hasExistingUpKey, setHasExistingUpKey] = useState(false);
  const [upKeyMasked, setUpKeyMasked] = useState("");

  // Fish Audio (sit-down voices)
  const [fishKey, setFishKey] = useState("");
  const [hasExistingFishKey, setHasExistingFishKey] = useState(false);
  const [fishKeyMasked, setFishKeyMasked] = useState("");
  const [fishJoeVoice, setFishJoeVoice] = useState("");
  const [fishGuestVoice, setFishGuestVoice] = useState("");

  // Autopilot
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoInterval, setAutoInterval] = useState(60);
  const [autoPublish, setAutoPublish] = useState(false);
  const [autoStatus, setAutoStatus] = useState<AutopilotStatus | null>(null);
  const [autoBusy, setAutoBusy] = useState(false);

  // Load current config when the dialog opens.
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setTestResult(null);
    fetch("/api/autopilot", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setAutoStatus(j.error ? null : j))
      .catch(() => setAutoStatus(null));
    fetch("/api/youtube/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setYtStatus(j.error ? null : j))
      .catch(() => setYtStatus(null));
    fetch("/api/backend/config", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const cfg: BackendConfigResponse = j.config;
        setBackend(cfg.activeBackend);
        setBaseUrl(cfg.openaiBaseUrl);
        setModel(cfg.openaiModel);
        setAudioEngine(cfg.audioEngine ?? "zai");
        setAceBaseUrl(cfg.aceStepBaseUrl ?? "http://localhost:8001");
        setAceModel(cfg.aceStepModel ?? "acestep/acestep-v15-turbo");
        setHasExistingKey(cfg.hasApiKey);
        setKeyMasked(cfg.apiKeyMasked);
        setApiKey("");
        setPrUrl(cfg.prMcpUrl ?? "");
        setPrRef(cfg.prRef ?? "");
        setPublicBase(cfg.publicBaseUrl ?? "");
        setCourseUrl(cfg.courseUrl ?? "");
        setHasExistingPrKey(cfg.hasPrKey);
        setPrKeyMasked(cfg.prKeyMasked);
        setPrKey("");
        setPrTest(null);
        setYtClientId(cfg.ytClientId ?? "");
        setYtPrivacy(cfg.ytPrivacy ?? "unlisted");
        setHasExistingYtClient(cfg.hasYtClient);
        setYtSecretMasked(cfg.ytSecretMasked);
        setYtConnected(cfg.ytConnected);
        setYtClientSecret("");
        setUpUser(cfg.upUser ?? "");
        setUpPlatforms((cfg.upPlatforms ?? "").split(",").filter(Boolean));
        setHasExistingUpKey(cfg.hasUpKey);
        setUpKeyMasked(cfg.upKeyMasked ?? "");
        setUpKey("");
        setHasExistingFishKey(!!cfg.hasFishKey);
        setFishKeyMasked(cfg.fishKeyMasked ?? "");
        setFishJoeVoice(cfg.fishJoeVoiceId ?? "");
        setFishGuestVoice(cfg.fishGuestVoiceId ?? "");
        setFishKey("");
        setAutoEnabled(!!cfg.autoEnabled);
        setAutoInterval(cfg.autoIntervalMin || 60);
        setAutoPublish(!!cfg.autoPublish);
      })
      .catch(() => toast.error("Couldn't load backend config."))
      .finally(() => setLoading(false));
  }, [open]);

  const handleSave = async () => {
    setSaving(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/backend/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activeBackend: backend,
          openaiBaseUrl: baseUrl,
          openaiModel: model,
          audioEngine,
          aceStepBaseUrl: aceBaseUrl,
          aceStepModel: aceModel,
          // Send the typed key only if the user changed it. If they left it
          // blank and an existing key was already saved, the server keeps it.
          openaiApiKey: apiKey,
          prMcpUrl: prUrl,
          prApiKey: prKey,
          prRef,
          publicBaseUrl: publicBase,
          courseUrl,
          ytClientId,
          ytClientSecret,
          ytPrivacy,
          upApiKey: upKey,
          upUser,
          upPlatforms: upPlatforms.join(","),
          fishApiKey: fishKey,
          fishJoeVoiceId: fishJoeVoice,
          fishGuestVoiceId: fishGuestVoice,
          autoEnabled,
          autoIntervalMin: autoInterval,
          autoPublish,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Save failed");
      }
      const j = await res.json();
      // Sync local state with what the server stored.
      setHasExistingKey(j.config.hasApiKey);
      setKeyMasked(j.config.apiKeyMasked);
      setApiKey("");
      setHasExistingPrKey(j.config.hasPrKey);
      setPrKeyMasked(j.config.prKeyMasked);
      setPrKey("");
      setHasExistingYtClient(j.config.hasYtClient);
      setYtSecretMasked(j.config.ytSecretMasked);
      setYtConnected(j.config.ytConnected);
      setYtClientSecret("");
      setHasExistingUpKey(j.config.hasUpKey);
      setUpKeyMasked(j.config.upKeyMasked);
      setUpKey("");
      setHasExistingFishKey(j.config.hasFishKey);
      setFishKeyMasked(j.config.fishKeyMasked);
      setFishKey("");
      setAutoInterval(j.config.autoIntervalMin);
      toast.success("Backend settings saved.");
      onConfigChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/backend/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activeBackend: backend,
          openaiBaseUrl: baseUrl,
          openaiModel: model,
          openaiApiKey: apiKey,
        }),
      });
      const j = await res.json();
      setTestResult(j.result);
      if (j.result?.ok) toast.success(j.result.message);
      else toast.error(j.result?.message || "Test failed.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed.");
    } finally {
      setTesting(false);
    }
  };

  const handleTestPr = async () => {
    setTestingPr(true);
    setPrTest(null);
    try {
      const res = await fetch("/api/video/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mcpUrl: prUrl, apiKey: prKey }),
      });
      const j = await res.json().catch(() => ({}));
      const result = j.result ?? { ok: false, message: j.error || "Test failed." };
      setPrTest(result);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Test failed.";
      setPrTest({ ok: false, message });
      toast.error(message);
    } finally {
      setTestingPr(false);
    }
  };

  /**
   * Save the OAuth client, then open Google's consent screen. The auth route
   * reads the client id from the saved config, so saving first is required.
   */
  const handleConnectYouTube = async () => {
    if (!ytClientId.trim()) {
      toast.error("Paste your Google OAuth client id first.");
      return;
    }
    setYtBusy(true);
    try {
      const saveRes = await fetch("/api/backend/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ytClientId, ytClientSecret, ytPrivacy }),
      });
      const saved = await saveRes.json().catch(() => ({}));
      if (!saveRes.ok) throw new Error(saved.error || "Could not save the OAuth client.");
      setHasExistingYtClient(!!saved.config?.hasYtClient);
      setYtSecretMasked(saved.config?.ytSecretMasked ?? "");
      setYtClientSecret("");

      const res = await fetch("/api/youtube/auth", { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.url) throw new Error(j.error || "Could not start the sign-in.");
      window.open(j.url, "_blank", "noopener,noreferrer");
      toast.message(
        "Finish granting access in the Google tab, then reopen these settings."
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start the sign-in.");
    } finally {
      setYtBusy(false);
    }
  };

  /** Kick off one autopilot run now (uses the saved settings). */
  const handleRunAutopilot = async () => {
    setAutoBusy(true);
    try {
      const res = await fetch("/api/autopilot", { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Couldn't start autopilot.");
      setAutoStatus(j);
      toast.success("Autopilot run started — this takes a few minutes.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start autopilot.");
    } finally {
      setAutoBusy(false);
    }
  };

  const handleDisconnectYouTube = async () => {
    setYtBusy(true);
    try {
      const res = await fetch("/api/youtube/disconnect", { method: "POST" });
      if (!res.ok) throw new Error("Could not disconnect YouTube.");
      setYtConnected(false);
      setYtStatus((s) => (s ? { ...s, connected: false, channelTitle: "" } : s));
      toast.success("YouTube disconnected. The saved token was deleted.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not disconnect YouTube.");
    } finally {
      setYtBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs">
          <Settings2 className="h-3.5 w-3.5" />
          Backend
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-serif">
            <Zap className="h-4 w-4 text-primary" />
            AI Backend Settings
          </DialogTitle>
          <DialogDescription>
            Pick which AI writes Joe's songs, then choose the engine that
            performs them. The text model can be Z.ai, OpenAI, or any
            chat-completions endpoint; audio comes from Z.ai speech or
            ACE-Step music.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {/* Backend selector */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Active backend
              </Label>
              <RadioGroup
                value={backend}
                onValueChange={(v) => setBackend(v as "zai" | "openai-compat")}
                className="space-y-2"
              >
                <label
                  htmlFor="bk-zai"
                  className="flex items-start gap-3 rounded-md border border-border/60 p-3 cursor-pointer hover:bg-secondary/30 has-[:checked]:border-primary/60 has-[:checked]:bg-primary/5"
                >
                  <RadioGroupItem value="zai" id="bk-zai" className="mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold">Z.ai (default)</p>
                    <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                      Built-in. No setup required. Smoothest path to Joe's
                      crooner voice. Uses the GLM model family.
                    </p>
                  </div>
                </label>
                <label
                  htmlFor="bk-openai"
                  className="flex items-start gap-3 rounded-md border border-border/60 p-3 cursor-pointer hover:bg-secondary/30 has-[:checked]:border-primary/60 has-[:checked]:bg-primary/5"
                >
                  <RadioGroupItem
                    value="openai-compat"
                    id="bk-openai"
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-semibold">
                      OpenAI-compatible (OpenAI, local, ngrok)
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                      Any HTTP endpoint that speaks the OpenAI Chat Completions
                      protocol — OpenAI, LM Studio, Ollama, vLLM, LocalAI, or a
                      text model tunnelled via ngrok.
                    </p>
                  </div>
                </label>
              </RadioGroup>
            </div>

            {/* OpenAI-compatible fields */}
            {backend === "openai-compat" && (
              <div className="space-y-4 rounded-md border border-border/60 bg-secondary/20 p-4">
                <div className="space-y-1.5">
                  <Label htmlFor="be-base" className="text-xs">
                    Base URL
                  </Label>
                  <Input
                    id="be-base"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="http://localhost:1234/v1  ·  https://abc123.ngrok.app/v1"
                    className="bg-card font-mono text-xs"
                  />
                  <p className="text-[0.7rem] text-muted-foreground">
                    Include the <code>/v1</code> suffix. ngrok URL example:{" "}
                    <code>https://&lt;your-tunnel&gt;.ngrok.app/v1</code>
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="be-model" className="text-xs">
                    Model name
                  </Label>
                  <Input
                    id="be-model"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="gpt-4o-mini  ·  llama-3.1-70b  ·  qwen2.5-72b"
                    className="bg-card font-mono text-xs"
                  />
                  <p className="text-[0.7rem] text-muted-foreground">
                    Must match a model your backend exposes. Try{" "}
                    <code>GET /v1/models</code> on your endpoint to list
                    available models.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="be-key" className="text-xs">
                    API key{" "}
                    {hasExistingKey && (
                      <span className="text-muted-foreground ml-1">
                        (saved: {keyMasked})
                      </span>
                    )}
                  </Label>
                  <Input
                    id="be-key"
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={
                      hasExistingKey ? "•••• leave blank to keep current" : "(optional for local models)"
                    }
                    className="bg-card font-mono text-xs"
                  />
                  <p className="text-[0.7rem] text-muted-foreground">
                    Optional. Most local LLM servers (LM Studio, Ollama) accept
                    any string or none. Required for cloud-hosted custom
                    endpoints.
                  </p>
                </div>
              </div>
            )}

            {/* Audio engine */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Audio engine
              </Label>
              <RadioGroup
                value={audioEngine}
                onValueChange={(v) => setAudioEngine(v as "zai" | "acestep")}
                className="space-y-2"
              >
                <label
                  htmlFor="ae-zai"
                  className="flex items-start gap-3 rounded-md border border-border/60 p-3 cursor-pointer hover:bg-secondary/30 has-[:checked]:border-primary/60 has-[:checked]:bg-primary/5"
                >
                  <RadioGroupItem value="zai" id="ae-zai" className="mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold">Z.ai TTS (spoken)</p>
                    <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                      Reads the finished lyrics aloud in Joe's crooner voice.
                      Fast, but it's speech, not music.
                    </p>
                  </div>
                </label>
                <label
                  htmlFor="ae-acestep"
                  className="flex items-start gap-3 rounded-md border border-border/60 p-3 cursor-pointer hover:bg-secondary/30 has-[:checked]:border-primary/60 has-[:checked]:bg-primary/5"
                >
                  <RadioGroupItem
                    value="acestep"
                    id="ae-acestep"
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-semibold">
                      ACE-Step (music + vocals)
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                      Sends Joe's lyrics and musical direction to ACE-Step, which
                      renders an actual song. Slow on CPU; minutes per track.
                    </p>
                  </div>
                </label>
              </RadioGroup>

              {audioEngine === "acestep" && (
                <div className="space-y-4 rounded-md border border-border/60 bg-secondary/20 p-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="ace-url" className="text-xs">
                      ACE-Step base URL
                    </Label>
                    <Input
                      id="ace-url"
                      value={aceBaseUrl}
                      onChange={(e) => setAceBaseUrl(e.target.value)}
                      placeholder="http://localhost:8001  ·  https://abc123.ngrok.app"
                      className="bg-card font-mono text-xs"
                    />
                    <p className="text-[0.7rem] text-muted-foreground">
                      No <code>/v1</code> needed — it's added automatically. Works
                      with a local server or an ngrok tunnel.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ace-model" className="text-xs">
                      ACE-Step model
                    </Label>
                    <Input
                      id="ace-model"
                      value={aceModel}
                      onChange={(e) => setAceModel(e.target.value)}
                      placeholder="acestep/acestep-v15-turbo"
                      className="bg-card font-mono text-xs"
                    />
                    <p className="text-[0.7rem] text-muted-foreground">
                      An id from <code>GET /v1/models</code>. If the server reports
                      the model isn't initialized, it's loaded automatically on the
                      first track.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* Plunder & Riffle video engine */}
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <Clapperboard className="h-4 w-4 text-primary mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">
                    Plunder &amp; Riffle video engine
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    One click turns a finished song into Joe&apos;s 9:16 video
                    page, meme slideshow and hot take over MCP. Needs an agent
                    API key from Plunder &amp; Riffle.
                  </p>
                </div>
              </div>

              <div className="space-y-4 rounded-md border border-border/60 bg-secondary/20 p-4">
                <div className="space-y-1.5">
                  <Label htmlFor="pr-url" className="text-xs">
                    MCP endpoint
                  </Label>
                  <Input
                    id="pr-url"
                    value={prUrl}
                    onChange={(e) => setPrUrl(e.target.value)}
                    placeholder="https://bot.plunderandriffle.com/api/mcp"
                    className="bg-card font-mono text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="pr-key" className="text-xs">
                    P&amp;R API key{" "}
                    {hasExistingPrKey && (
                      <span className="text-muted-foreground ml-1">
                        (saved: {prKeyMasked})
                      </span>
                    )}
                  </Label>
                  <Input
                    id="pr-key"
                    type="password"
                    value={prKey}
                    onChange={(e) => setPrKey(e.target.value)}
                    placeholder={
                      hasExistingPrKey
                        ? "•••• leave blank to keep current"
                        : "Agent API key (Authorization: Bearer …)"
                    }
                    className="bg-card font-mono text-xs"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="pr-ref" className="text-xs">
                      Referral code
                    </Label>
                    <Input
                      id="pr-ref"
                      value={prRef}
                      onChange={(e) => setPrRef(e.target.value)}
                      placeholder="e.g. joblessjoe"
                      className="bg-card font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pr-course" className="text-xs">
                      Free course link
                    </Label>
                    <Input
                      id="pr-course"
                      value={courseUrl}
                      onChange={(e) => setCourseUrl(e.target.value)}
                      placeholder="https://www.plunderandriffle.com/joblessjoe"
                      className="bg-card font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="pr-public" className="text-xs">
                    Public audio base URL (optional)
                  </Label>
                  <Input
                    id="pr-public"
                    value={publicBase}
                    onChange={(e) => setPublicBase(e.target.value)}
                    placeholder="https://your-app.example.com"
                    className="bg-card font-mono text-xs"
                  />
                  <p className="text-[0.7rem] text-muted-foreground">
                    P&amp;R fetches the song from a public https URL. Leave blank
                    on localhost and each video publishes the MP3 to here.now
                    first.
                  </p>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestPr}
                  disabled={testingPr || !prUrl}
                  className="w-full gap-1.5"
                >
                  {testingPr ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Clapperboard className="h-3.5 w-3.5" />
                  )}
                  {testingPr ? "Checking…" : "Test P&R connection"}
                </Button>

                {prTest && (
                  <div
                    className={`flex items-start gap-2 rounded-md p-3 text-sm ${
                      prTest.ok
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : "bg-destructive/10 text-destructive"
                    }`}
                  >
                    {prTest.ok ? (
                      <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    )}
                    <span className="leading-snug">{prTest.message}</span>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* YouTube publishing */}
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <Youtube className="h-4 w-4 text-primary mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">YouTube publishing</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    P&amp;R has no YouTube tool, so a finished video uploads
                    straight to your own channel through the YouTube Data API —
                    with the description, tags and an SRT caption track built from
                    the pack page. Requires a Google Cloud OAuth client of type{" "}
                    <em>Web application</em>.
                  </p>
                </div>
              </div>

              <div className="space-y-4 rounded-md border border-border/60 bg-secondary/20 p-4">
                <div className="space-y-1.5">
                  <Label htmlFor="yt-id" className="text-xs">
                    OAuth client ID
                  </Label>
                  <Input
                    id="yt-id"
                    value={ytClientId}
                    onChange={(e) => setYtClientId(e.target.value)}
                    placeholder="1234567890-abcdefg.apps.googleusercontent.com"
                    className="bg-card font-mono text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="yt-secret" className="text-xs">
                    OAuth client secret{" "}
                    {hasExistingYtClient && (
                      <span className="text-muted-foreground ml-1">
                        (saved: {ytSecretMasked})
                      </span>
                    )}
                  </Label>
                  <Input
                    id="yt-secret"
                    type="password"
                    value={ytClientSecret}
                    onChange={(e) => setYtClientSecret(e.target.value)}
                    placeholder={
                      hasExistingYtClient
                        ? "•••• leave blank to keep current"
                        : "GOCSPX-…"
                    }
                    className="bg-card font-mono text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Authorised redirect URI (add this in Google Cloud)
                  </Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 truncate rounded border border-border/60 bg-card px-2 py-1.5 text-[0.7rem]">
                      {ytStatus?.redirectUri ?? "—"}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 shrink-0 text-xs"
                      onClick={() => {
                        const uri = ytStatus?.redirectUri;
                        if (!uri) return;
                        navigator.clipboard
                          ?.writeText(uri)
                          .then(() => toast.success("Redirect URI copied."))
                          .catch(() => toast.error("Copy failed — select it by hand."));
                      }}
                      disabled={!ytStatus?.redirectUri}
                    >
                      Copy
                    </Button>
                  </div>
                  <p className="text-[0.7rem] text-muted-foreground">
                    Google only redirects to a URI registered on the client. Add
                    it under <em>Credentials → OAuth client → Authorised redirect
                    URIs</em>, then press Connect.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Default visibility on upload
                  </Label>
                  <RadioGroup
                    value={ytPrivacy}
                    onValueChange={(v) =>
                      setYtPrivacy(v as "unlisted" | "public" | "private")
                    }
                    className="flex flex-wrap gap-3"
                  >
                    {(["unlisted", "private", "public"] as const).map((p) => (
                      <label
                        key={p}
                        htmlFor={`yt-priv-${p}`}
                        className="flex items-center gap-2 text-xs capitalize"
                      >
                        <RadioGroupItem value={p} id={`yt-priv-${p}`} />
                        {p}
                      </label>
                    ))}
                  </RadioGroup>
                  <p className="text-[0.7rem] text-muted-foreground">
                    Unlisted is the safe default: the video gets a link you can
                    review before making it public.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleConnectYouTube}
                    disabled={ytBusy || !ytClientId.trim()}
                    className="gap-1.5"
                  >
                    {ytBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Youtube className="h-3.5 w-3.5" />
                    )}
                    {ytConnected ? "Reconnect" : "Connect YouTube"}
                  </Button>
                  {ytConnected && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleDisconnectYouTube}
                      disabled={ytBusy}
                      className="text-xs"
                    >
                      Disconnect
                    </Button>
                  )}
                  <span
                    className={`ml-auto text-[0.7rem] ${
                      ytConnected ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                    }`}
                  >
                    {ytConnected
                      ? `Connected${ytStatus?.channelTitle ? ` — ${ytStatus.channelTitle}` : ""}`
                      : ytStatus?.configured
                        ? "Not connected"
                        : "No client configured"}
                  </span>
                </div>
              </div>
            </div>

            <Separator />

            {/* Upload-Post publishing */}
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <Send className="h-4 w-4 text-primary mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">Upload-Post (socials)</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Posts a finished stickman MP4 to every account connected on
                    your Upload-Post profile — TikTok, Instagram, YouTube Shorts and
                    more — in one call. Get the key at app.upload-post.com → API Keys.
                  </p>
                </div>
              </div>
              <div className="space-y-4 rounded-md border border-border/60 bg-secondary/20 p-4">
                <div className="space-y-1.5">
                  <Label htmlFor="up-key" className="text-xs">
                    API key{" "}
                    {hasExistingUpKey && (
                      <span className="text-muted-foreground ml-1">(saved: {upKeyMasked})</span>
                    )}
                  </Label>
                  <Input
                    id="up-key"
                    type="password"
                    value={upKey}
                    onChange={(e) => setUpKey(e.target.value)}
                    placeholder={hasExistingUpKey ? "•••• leave blank to keep current" : "eyJhbGciOi…"}
                    className="bg-card font-mono text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="up-user" className="text-xs">
                    Profile (user)
                  </Label>
                  <Input
                    id="up-user"
                    value={upUser}
                    onChange={(e) => setUpUser(e.target.value)}
                    placeholder="joblessjoe"
                    className="bg-card font-mono text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Platforms</Label>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {UP_PLATFORM_OPTIONS.map((p) => (
                      <label key={p} className="flex items-center gap-1.5 text-xs">
                        <Checkbox
                          checked={upPlatforms.includes(p)}
                          onCheckedChange={(on) =>
                            setUpPlatforms((cur) => (on ? [...cur, p] : cur.filter((x) => x !== p)))
                          }
                        />
                        {p}
                      </label>
                    ))}
                  </div>
                  <p className="text-[0.7rem] text-muted-foreground">
                    Platforms not connected on the profile are skipped, not failed.
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Fish Audio voices for Sit-down with Joe */}
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <Mic className="h-4 w-4 text-primary mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">Fish Audio (sit-down voices)</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Voices a Sit-down with Joe script when you don&apos;t upload audio. Get the key at
                    fish.audio → API Keys. Voice IDs are the model IDs from a voice&apos;s page on
                    fish.audio (the part after /m/); leave one blank for Fish&apos;s default voice.
                  </p>
                </div>
              </div>
              <div className="space-y-4 rounded-md border border-border/60 bg-secondary/20 p-4">
                <div className="space-y-1.5">
                  <Label htmlFor="fish-key" className="text-xs">
                    API key{" "}
                    {hasExistingFishKey && (
                      <span className="text-muted-foreground ml-1">(saved: {fishKeyMasked})</span>
                    )}
                  </Label>
                  <Input
                    id="fish-key"
                    type="password"
                    value={fishKey}
                    onChange={(e) => setFishKey(e.target.value)}
                    placeholder={hasExistingFishKey ? "•••• leave blank to keep current" : "Fish Audio API key"}
                    className="bg-card font-mono text-xs"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="fish-joe" className="text-xs">
                      Joe&apos;s voice ID
                    </Label>
                    <Input
                      id="fish-joe"
                      value={fishJoeVoice}
                      onChange={(e) => setFishJoeVoice(e.target.value)}
                      placeholder="e.g. 7f92f8afb8ec43bf81429cc1c9199cb1"
                      className="bg-card font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="fish-guest" className="text-xs">
                      Guest&apos;s voice ID
                    </Label>
                    <Input
                      id="fish-guest"
                      value={fishGuestVoice}
                      onChange={(e) => setFishGuestVoice(e.target.value)}
                      placeholder="optional"
                      className="bg-card font-mono text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Autopilot */}
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <Timer className="h-4 w-4 text-primary mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">Autopilot</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Joe writes and sings a new story episode on a timer. With
                    auto-publish on, each one is also filmed to MP4 (25 P&amp;R
                    credits) and posted through Upload-Post.
                  </p>
                </div>
              </div>
              <div className="space-y-4 rounded-md border border-border/60 bg-secondary/20 p-4">
                <label className="flex items-center justify-between gap-3 text-xs">
                  <span>Make a new song automatically</span>
                  <Switch checked={autoEnabled} onCheckedChange={setAutoEnabled} />
                </label>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <Label htmlFor="auto-int" className="text-xs">
                    Every (minutes)
                  </Label>
                  <Input
                    id="auto-int"
                    type="number"
                    min={15}
                    max={1440}
                    value={autoInterval}
                    onChange={(e) => setAutoInterval(Number(e.target.value) || 60)}
                    className="h-8 w-24 bg-card text-xs"
                  />
                </div>
                <label className="flex items-center justify-between gap-3 text-xs">
                  <span>Film MP4 + post to socials</span>
                  <Switch checked={autoPublish} onCheckedChange={setAutoPublish} />
                </label>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handleRunAutopilot} disabled={autoBusy} className="gap-1.5">
                    {autoBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                    Run once now
                  </Button>
                  <span className="ml-auto text-[0.7rem] text-muted-foreground text-right">
                    {autoStatus?.running
                      ? `Running: ${autoStatus.step || "starting"}…`
                      : autoStatus?.lastRunAt
                        ? `Last run ${new Date(autoStatus.lastRunAt).toLocaleString()}${autoStatus.lastResult ? ` — ${autoStatus.lastResult}` : ""}`
                        : "Never run"}
                  </span>
                </div>
                {autoEnabled && autoPublish && (
                  <p className="text-[0.7rem] text-muted-foreground">
                    ≈ {Math.round((24 * 60) / Math.max(15, autoInterval)) * 25} P&amp;R credits a day at this pace.
                  </p>
                )}
              </div>
            </div>

            <Separator />

            {/* Test result */}
            {testResult && (
              <div
                className={`flex items-start gap-2 rounded-md p-3 text-sm ${
                  testResult.ok
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : "bg-destructive/10 text-destructive"
                }`}
              >
                {testResult.ok ? (
                  <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                )}
                <span className="leading-snug">{testResult.message}</span>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTest}
            disabled={loading || testing || (backend === "openai-compat" && (!baseUrl || !model))}
          >
            {testing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Testing…
              </>
            ) : (
              "Test text model"
            )}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={loading || saving}>
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Saving…
              </>
            ) : (
              "Save settings"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
