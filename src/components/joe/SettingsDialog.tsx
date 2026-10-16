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
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Settings2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

interface BackendConfigResponse {
  activeBackend: "zai" | "openai-compat";
  openaiBaseUrl: string;
  openaiModel: string;
  hasApiKey: boolean;
  apiKeyMasked: string;
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
  const [hasExistingKey, setHasExistingKey] = useState(false);
  const [keyMasked, setKeyMasked] = useState("");

  // Load current config when the dialog opens.
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setTestResult(null);
    fetch("/api/backend/config", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const cfg: BackendConfigResponse = j.config;
        setBackend(cfg.activeBackend);
        setBaseUrl(cfg.openaiBaseUrl);
        setModel(cfg.openaiModel);
        setHasExistingKey(cfg.hasApiKey);
        setKeyMasked(cfg.apiKeyMasked);
        setApiKey("");
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
          // Send the typed key only if the user changed it. If they left it
          // blank and an existing key was already saved, the server keeps it.
          openaiApiKey: apiKey,
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
            Pick which AI powers Jobless Joe. Z.ai is the default. For local
            models like <strong>Ace 1.5</strong> running on your machine or
            behind ngrok, choose OpenAI-compatible and point at the base URL.
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
                      OpenAI-compatible (Ace 1.5, local, ngrok)
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                      Any HTTP endpoint that speaks the OpenAI Chat Completions
                      protocol — LM Studio, Ollama, vLLM, LocalAI, or a custom
                      model like Ace 1.5 tunnelled via ngrok.
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
                    placeholder="ace-1.5  ·  llama-3.1-70b  ·  qwen2.5-72b"
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
              "Test connection"
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
