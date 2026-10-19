/**
 * Minimal here.now publish client, borrowed from StudioStack's
 * apps/studio/src/lib/herenow/herenow-client.ts.
 *
 * Flow:
 *   1. POST /api/v1/publish                  → presigned PUT URLs + finalize URL
 *   2. PUT each file to its presigned URL
 *   3. POST /api/v1/publish/:slug/finalize   → live URL + claim URL
 *
 * Anonymous publishes expire after 24h; pass HERENOW_API_KEY to publish under
 * an account instead. HERENOW_BASE_URL overrides https://here.now.
 */

const HERENOW_BASE = (process.env.HERENOW_BASE_URL ?? "https://here.now").replace(
  /\/$/,
  ""
);

export interface HereNowFile {
  path: string;
  buffer: Buffer;
  contentType: string;
}

export interface HereNowPublishResult {
  slug: string;
  url: string;
  claimUrl?: string;
  expiresAt?: number;
  ttlSeconds: number;
}

interface PublishInitResponse {
  slug: string;
  siteUrl?: string;
  upload?: {
    versionId: string;
    uploads: Array<{
      path: string;
      url: string;
      method?: string;
      headers?: Record<string, string>;
    }>;
    finalizeUrl?: string;
  };
  claimToken?: string;
  claimUrl?: string;
}

/**
 * Publish a set of files (an index.html plus its audio) to here.now and return
 * the live URL. Throws with a server-safe message on any failure.
 */
export async function publishFiles(
  files: HereNowFile[],
  opts: { apiKey?: string; ttlSeconds?: number } = {}
): Promise<HereNowPublishResult> {
  const { apiKey, ttlSeconds = 24 * 3600 } = opts;

  const manifest = await Promise.all(
    files.map(async (f) => ({
      path: f.path,
      size: f.buffer.length,
      contentType: f.contentType,
      hash: await sha256Hex(f.buffer),
    }))
  );
  const initBody = { files: manifest, ttlSeconds, spaMode: false };

  const initRes = await fetch(`${HERENOW_BASE}/api/v1/publish`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-herenow-client": "jobless-joe/1.0",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(initBody),
  });

  if (!initRes.ok) {
    const detail = await initRes.text().catch(() => "");
    if (initRes.status === 401 || initRes.status === 403) {
      throw new Error(
        "here.now rejected the API key. Remove HERENOW_API_KEY or replace it."
      );
    }
    throw new Error(
      `here.now publish init failed (${initRes.status}): ${detail.slice(0, 300)}`
    );
  }

  const init = (await initRes.json()) as PublishInitResponse;
  const upload = init.upload;
  if (!upload?.versionId || !upload.uploads?.length) {
    throw new Error("here.now returned an invalid upload session.");
  }

  for (const entry of upload.uploads) {
    const file = files.find((f) => f.path === entry.path);
    if (!file) throw new Error(`No local file for upload path ${entry.path}.`);

    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(entry.headers ?? {})) {
      if (k.toLowerCase() === "content-type") continue;
      headers[k] = v;
    }
    headers["Content-Type"] = file.contentType;

    const putRes = await fetch(entry.url, {
      method: entry.method || "PUT",
      headers,
      body: new Uint8Array(file.buffer),
    });
    if (!putRes.ok) {
      const detail = await putRes.text().catch(() => "");
      throw new Error(
        `here.now upload of ${file.path} failed (${putRes.status}): ${detail.slice(0, 300)}`
      );
    }
  }

  const finalizeUrl =
    upload.finalizeUrl ??
    `${HERENOW_BASE}/api/v1/publish/${init.slug}/finalize`;
  const finalizeRes = await fetch(finalizeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-herenow-client": "jobless-joe/1.0",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({ versionId: upload.versionId }),
  });

  if (!finalizeRes.ok) {
    const detail = await finalizeRes.text().catch(() => "");
    throw new Error(
      `here.now finalize failed (${finalizeRes.status}): ${detail.slice(0, 300)}`
    );
  }

  const finalize = (await finalizeRes.json()) as {
    url?: string;
    siteUrl?: string;
    claimUrl?: string;
    claimToken?: string;
    expiresAt?: number | string;
  };

  return {
    slug: init.slug,
    url:
      finalize.url ??
      finalize.siteUrl ??
      init.siteUrl ??
      `https://${init.slug}.here.now`,
    claimUrl: finalize.claimUrl ?? init.claimUrl,
    expiresAt: finalize.expiresAt
      ? Number(finalize.expiresAt)
      : Date.now() + ttlSeconds * 1000,
    ttlSeconds,
  };
}

async function sha256Hex(buffer: Buffer): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new Uint8Array(buffer)
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
