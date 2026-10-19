/**
 * Plunder & Riffle MCP client.
 *
 * P&R exposes a "meme engine" over MCP (JSON-RPC 2.0 over HTTP). The tools we
 * use:
 *   - create_video_pack  → 9:16 video page + meme slideshow + iMessage + take
 *   - get_job_status     → poll an async MP4 render
 *   - request_mp4        → render the approved page to an MP4
 *   - get_account        → credits / auth check
 *
 * Transport notes:
 *   - One POST carries one JSON-RPC message.
 *   - The server may answer as JSON or as an SSE stream (`data: {...}`), so
 *     both are parsed here.
 *   - Tools that take minutes (video pack, MP4) hold the call open up to 100s
 *     and then hand back a jobId, which we resume instead of resending work.
 */

export const PR_TOOL_TIMEOUT_MS = 130_000;
const PR_PROTOCOL_VERSION = "2024-11-05";

export interface PrConfig {
  mcpUrl: string;
  apiKey: string;
}

export interface ToolCallResult {
  /** Parsed JSON payload from the tool (content text or structuredContent). */
  data: unknown;
  /** Raw text the tool returned, for error messages and debugging. */
  text: string;
  isError: boolean;
}

interface JsonRpcResponse {
  jsonrpc?: string;
  id?: number | string | null;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
}

export class PrError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "PrError";
  }
}

function headers(apiKey: string, sessionId?: string): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "ngrok-skip-browser-warning": "true",
  };
  if (apiKey.trim()) h.Authorization = `Bearer ${apiKey.trim()}`;
  if (sessionId) h["Mcp-Session-Id"] = sessionId;
  return h;
}

/** Parse an SSE body and return the first JSON-RPC message it carries. */
function parseSse(body: string): JsonRpcResponse[] {
  const messages: JsonRpcResponse[] = [];
  for (const block of body.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim())
      .join("");
    if (!data) continue;
    try {
      messages.push(JSON.parse(data) as JsonRpcResponse);
    } catch {
      // Non-JSON SSE event — ignore.
    }
  }
  return messages;
}

/** One JSON-RPC round trip. Returns the response plus any session id. */
async function rpc(
  cfg: PrConfig,
  body: Record<string, unknown>,
  sessionId?: string
): Promise<{ json: JsonRpcResponse; sessionId?: string }> {
  const url = cfg.mcpUrl.trim();
  if (!/^https?:\/\//i.test(url)) {
    throw new PrError("P&R MCP endpoint must be an http(s) URL.");
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: headers(cfg.apiKey, sessionId),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(PR_TOOL_TIMEOUT_MS),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new PrError(`Could not reach P&R (${msg}).`);
  }

  const text = await res.text();
  const nextSession = res.headers.get("mcp-session-id") ?? sessionId;
  const contentType = res.headers.get("content-type") ?? "";

  let messages: JsonRpcResponse[] = [];
  if (contentType.includes("text/event-stream")) {
    messages = parseSse(text);
  } else {
    try {
      messages = [JSON.parse(text) as JsonRpcResponse];
    } catch {
      messages = [];
    }
  }

  if (!res.ok && messages.length === 0) {
    throw new PrError(
      `P&R returned ${res.status}: ${text.slice(0, 200) || res.statusText}`,
      res.status
    );
  }

  const json =
    messages.find((m) => m.id === body.id) ?? messages[0] ?? {};
  return { json, sessionId: nextSession };
}

/** MCP handshake. Cheap, and needed before tools/call on strict servers. */
async function initialize(cfg: PrConfig): Promise<string | undefined> {
  const { json, sessionId } = await rpc(cfg, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: PR_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "jobless-joe", version: "1.0.0" },
    },
  });
  if (json.error) {
    throw new PrError(
      `P&R handshake failed: ${json.error.message ?? "unknown error"}`
    );
  }
  return sessionId;
}

/** Call one MCP tool and return its parsed payload. */
export async function callTool(
  cfg: PrConfig,
  name: string,
  args: Record<string, unknown>
): Promise<ToolCallResult> {
  const sessionId = await initialize(cfg);
  const { json } = await rpc(
    cfg,
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name, arguments: args },
    },
    sessionId
  );

  if (json.error) {
    throw new PrError(
      `P&R ${name} failed: ${json.error.message ?? "unknown error"}`,
      undefined
    );
  }

  const result = (json.result ?? {}) as {
    content?: Array<{ type?: string; text?: string }>;
    structuredContent?: unknown;
    isError?: boolean;
  };
  const text = (result.content ?? [])
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text as string)
    .join("\n");

  let data: unknown = result.structuredContent;
  if (data === undefined && text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { text };
    }
  }

  return { data, text, isError: Boolean(result.isError) };
}

// ---------------------------------------------------------------------------
// Result parsing
// ---------------------------------------------------------------------------

export interface PackResult {
  /** The 9:16 /video page. */
  pageUrl: string;
  /**
   * The rendered video. request_mp4 hands back a here.now player page here;
   * requestMp4/getJobStatus resolve that to the direct .mp4 file.
   */
  mp4Url: string;
  /** Job to resume while the take is still rendering. */
  jobId: string;
  /** 9:16 poster / asset to show on the phone. */
  posterUrl: string;
  /** Every asset URL the pack returned. */
  assets: string[];
  /** Provider-written caption, if any. */
  postCopy: string;
  /** Tracked link (already carries ?ref=). */
  referralUrl: string;
}

/** Walk an unknown JSON value and collect every https URL it contains. */
function collectUrls(value: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 8 || value == null) return out;
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value.trim())) out.push(value.trim());
    return out;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectUrls(v, out, depth + 1);
    return out;
  }
  if (typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectUrls(v, out, depth + 1);
    }
  }
  return out;
}

/** Find the first key in an object tree whose name matches `re`. */
function findValue(
  value: unknown,
  re: RegExp,
  depth = 0
): unknown {
  if (depth > 8 || value == null || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    for (const v of value) {
      const found = findValue(v, re, depth + 1);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (re.test(k) && (typeof v === "string" || typeof v === "number")) return v;
  }
  for (const v of Object.values(value as Record<string, unknown>)) {
    const found = findValue(v, re, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** Pick the 9:16 "story" asset out of an adAssets array, if there is one. */
function pickStoryAsset(value: unknown, depth = 0): string {
  if (depth > 8 || value == null || typeof value !== "object") return "";
  if (Array.isArray(value)) {
    for (const item of value) {
      if (
        item &&
        typeof item === "object" &&
        /story/i.test(String((item as Record<string, unknown>).format ?? "")) &&
        typeof (item as Record<string, unknown>).url === "string"
      ) {
        return asUrl((item as Record<string, unknown>).url);
      }
    }
    for (const item of value) {
      const found = pickStoryAsset(item, depth + 1);
      if (found) return found;
    }
    return "";
  }
  for (const v of Object.values(value as Record<string, unknown>)) {
    const found = pickStoryAsset(v, depth + 1);
    if (found) return found;
  }
  return "";
}

/**
 * Normalise whatever shape a pack returns into the fields we rely on.
 *
 * Real P&R packs look like:
 *   { stage, source: { jobId, pageUrl }, video: { pageUrl, adAssets: [...],
 *     media_url, post_copy: {...} }, memes: {...}, imessage: {...}, ... }
 * Older/simpler responses flatten `pageUrl` to the top level, so both are
 * handled.
 */
export function parsePack(data: unknown): PackResult {
  const unique = Array.from(new Set(collectUrls(data)));
  const png = (u: string) => /\.(png|jpe?g|webp)(\?|$)/i.test(u);

  // The video piece wins; then any page-shaped URL.
  const videoPiece = (data as { video?: unknown } | null)?.video;
  const pageUrl =
    asUrl(findValue(videoPiece, /^(pageUrl|page_url|url)$/i)) ||
    asUrl(findValue(data, /^(pageUrl|page_url|videoUrl|video_url)$/i)) ||
    unique.find((u) => /\/m\/|\/video\b|\/v\//i.test(u)) ||
    "";

  const mp4Url =
    unique.find((u) => /\.mp4(\?|$)/i.test(u)) ||
    asUrl(findValue(data, /^(mp4Url|mp4_url)$/i)) ||
    "";

  const jobId = String(
    findValue(data, /^(jobId|job_id|source_job_id)$/i) || ""
  );

  const posterUrl =
    pickStoryAsset(videoPiece) ||
    pickStoryAsset(data) ||
    asUrl(findValue(data, /^(media_url|poster|thumbnail)/i)) ||
    unique.find(png) ||
    "";

  const rawCopy = findValue(data, /^(post_?copy|caption|text)$/i);
  const postCopy =
    typeof rawCopy === "string"
      ? rawCopy
      : typeof rawCopy === "object" && rawCopy
        ? String(
            (rawCopy as { caption?: unknown; hook?: unknown }).caption ??
              (rawCopy as { hook?: unknown }).hook ??
              ""
          )
        : "";

  const referralUrl =
    asUrl(findValue(data, /referral(url)?/i)) ||
    unique.find((u) => /[?&]ref=/.test(u)) ||
    "";

  return {
    pageUrl,
    mp4Url,
    jobId,
    posterUrl,
    assets: unique.filter(png),
    postCopy,
    referralUrl,
  };
}

function asUrl(v: unknown): string {
  return typeof v === "string" && /^https?:\/\//i.test(v) ? v : "";
}

/** Start (or resume) the /video pack for a public audio URL. */
export async function createVideoPack(
  cfg: PrConfig,
  args: {
    audioUrl?: string;
    sourceJobId?: string;
    title: string;
    ref?: string;
    waitSeconds?: number;
  }
): Promise<{ pack: PackResult; text: string }> {
  const params: Record<string, unknown> = {
    title: args.title,
    wait_seconds: args.waitSeconds ?? 90,
    includeAssets: true,
    formats: ["story", "feed", "square"],
  };
  if (args.audioUrl) params.audio_url = args.audioUrl;
  if (args.sourceJobId) params.source_job_id = args.sourceJobId;
  if (args.ref) params.ref = args.ref;

  const { data, text, isError } = await callTool(
    cfg,
    "create_video_pack",
    params
  );
  if (isError) {
    throw new PrError(text.slice(0, 400) || "create_video_pack failed.");
  }
  return { pack: await withMp4File(parsePack(data)), text };
}

const isMp4File = (u: string) => /\.mp4(\?|$)/i.test(u);

/**
 * P&R hosts finished MP4s as a here.now player page (`<meta og:video
 * content="ralph.mp4">`), not as the file itself. Downloads and the YouTube
 * upload need the bytes, so follow the page to its video file.
 */
export async function resolveMp4File(url: string): Promise<string> {
  if (!url || isMp4File(url)) return url;
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new PrError(`MP4 page returned ${res.status}.`);
  if (/^video\//i.test(res.headers.get("content-type") ?? "")) return url;
  const html = await res.text();
  const src =
    /<meta[^>]+property=["']og:video(?::url)?["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1] ||
    /<(?:video|source)[^>]+src=["']([^"']+\.mp4[^"']*)["']/i.exec(html)?.[1];
  if (!src) throw new PrError("P&R's MP4 page has no video file in it.");
  return new URL(src, url).toString();
}

async function withMp4File(pack: PackResult): Promise<PackResult> {
  if (!pack.mp4Url || isMp4File(pack.mp4Url)) return pack;
  return { ...pack, mp4Url: await resolveMp4File(pack.mp4Url) };
}

/** Poll an async P&R job. Returns the same normalised shape. */
export async function getJobStatus(
  cfg: PrConfig,
  kind: "mp4" | "one_minute" | "localize" | "audioscript",
  jobId: string
): Promise<{ pack: PackResult; status: string; text: string }> {
  const { data, text, isError } = await callTool(cfg, "get_job_status", {
    kind,
    jobId,
  });
  if (isError) throw new PrError(text.slice(0, 400) || "Job lookup failed.");
  const status = String(findValue(data, /^status$/i) ?? "");
  const pack = parsePack(data);
  return { pack: kind === "mp4" ? await withMp4File(pack) : pack, status, text };
}

/** Render an approved pack page to MP4 (25 credits, 1–3 minutes). */
export async function requestMp4(
  cfg: PrConfig,
  pageUrl: string
): Promise<{ pack: PackResult; text: string }> {
  const { data, text, isError } = await callTool(cfg, "request_mp4", {
    pageUrl,
    wait_seconds: 90,
  });
  if (isError) throw new PrError(text.slice(0, 400) || "MP4 render failed.");
  return { pack: await withMp4File(parsePack(data)), text };
}

/** Auth/credit check used by the settings dialog. */
export async function testPrConnection(
  cfg: PrConfig
): Promise<{ ok: boolean; message: string }> {
  try {
    const { data, text, isError } = await callTool(cfg, "get_account", {});
    if (isError) {
      return { ok: false, message: text.slice(0, 300) || "P&R rejected the key." };
    }
    const credits = findValue(data, /credits?/i);
    const email = findValue(data, /e-?mail/i);
    const bits = [
      credits !== undefined ? `${credits} credits` : "",
      typeof email === "string" ? email : "",
    ].filter(Boolean);
    return {
      ok: true,
      message: bits.length
        ? `Connected to Plunder & Riffle — ${bits.join(" · ")}.`
        : "Connected to Plunder & Riffle.",
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Connection failed.",
    };
  }
}
