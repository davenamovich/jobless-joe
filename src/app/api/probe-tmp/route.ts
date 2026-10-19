import { NextRequest, NextResponse } from "next/server";
import { loadBackendConfig } from "@/lib/ai-backend";
import { buildSystemPrompt, buildUserPrompt, EMPTY_STORY_BIBLE } from "@/lib/joe-prompts";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const variant = req.nextUrl.searchParams.get("variant") ?? "as-is";
  const cfg = await loadBackendConfig();
  const system = buildSystemPrompt("smoky-lounge", "en");
  const user = buildUserPrompt({
    episodeKey: "custom",
    episodeLabel: "Custom Episode",
    customTopic: "a robot steals my job",
    duration: "45s",
    intensity: "medium",
    target: "job-seekers",
    croonerStyle: "smoky-lounge",
    language: "en",
    action: "generate",
    storyBible: EMPTY_STORY_BIBLE,
  });

  const base = cfg.openaiBaseUrl.trim().replace(/\/+$/, "");
  const baseBody: Record<string, unknown> = {
    model: cfg.openaiModel,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    stream: false,
  };

  let body: Record<string, unknown>;
  if (variant === "as-is") {
    body = { ...baseBody, temperature: 0.85, max_tokens: 4096 };
  } else if (variant === "mct") {
    body = { ...baseBody, max_completion_tokens: 16000 };
  } else if (variant === "mct-temp") {
    body = { ...baseBody, temperature: 0.85, max_completion_tokens: 16000 };
  } else {
    body = { ...baseBody, max_tokens: 16000 };
  }

  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 280_000);
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.openaiApiKey}`,
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    const choice = json?.choices?.[0];
    const content = choice?.message?.content;
    return NextResponse.json({
      variant,
      status: res.status,
      ms: Date.now() - t0,
      finish_reason: choice?.finish_reason,
      contentType: typeof content,
      contentLen:
        typeof content === "string"
          ? content.length
          : Array.isArray(content)
            ? JSON.stringify(content).length
            : 0,
      reasoningLen:
        (choice?.message?.reasoning_content ?? choice?.message?.reasoning ?? "")
          .length ?? 0,
      messageKeys: Object.keys(choice?.message ?? {}),
      usage: json?.usage ?? null,
      error: json?.error ?? null,
      contentPreview: JSON.stringify(content ?? null).slice(0, 400),
      rawPreview: json ? undefined : text.slice(0, 500),
    });
  } catch (e) {
    return NextResponse.json({
      variant,
      ms: Date.now() - t0,
      thrown: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
    });
  } finally {
    clearTimeout(timer);
  }
}
