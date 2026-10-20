/**
 * Film the stickman song video to MP4 locally, for free: headless Chrome
 * over the DevTools protocol, one screenshot per frame on a virtual clock
 * (so a slow machine never drops or rushes a frame), ffmpeg for the encode
 * and the song. The paid P&R request_mp4 path is unchanged.
 *
 *   # a song on disk (keyword storyboard, or --scenes from the app):
 *   npx tsx scripts/render-stickman-video.ts --audio song.mp3 --lyrics lyrics.txt --title "Qualified in 2039" --out joe.mp4
 *   # any page that follows the recorder contract, e.g. the dev server's preview:
 *   npx tsx scripts/render-stickman-video.ts --url "http://localhost:3000/api/stickman-video?episodeId=…" --out joe.mp4
 *
 * Options: --scenes scenes.json (a Scene[] storyboard), --label "Episode 3",
 * --seconds 8 (film only the start, for a quick look), --fps 30, --width 1080, --height 1920, --chrome <path> (or CHROME_PATH),
 * --ffmpeg <path> (or FFMPEG_PATH). Needs Chrome/Edge and ffmpeg installed.
 */

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { audioDurationSec } from "../src/lib/song-artifacts";
import type { Scene } from "../src/lib/stickman-scenes";
import { buildStickmanVideoHtml } from "../src/lib/stickman-video";

type Args = Record<string, string>;

function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    out[key] = next && !next.startsWith("--") ? (i++, next) : "true";
  }
  return out;
}

function findChrome(explicit?: string): string {
  const candidates = [
    explicit,
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter((p): p is string => !!p);
  const hit = candidates.find((p) => fs.existsSync(p));
  if (!hit) throw new Error("No Chrome/Edge found. Pass --chrome <path> or set CHROME_PATH.");
  return hit;
}

// ── A tiny DevTools-protocol client (Node's built-in WebSocket) ─────────────

class Cdp {
  private id = 0;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private constructor(private ws: WebSocket) {
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(String(ev.data)) as { id?: number; result?: unknown; error?: { message: string } };
      if (msg.id === undefined) return;
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result);
    });
  }
  static connect(url: string): Promise<Cdp> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.addEventListener("open", () => resolve(new Cdp(ws)), { once: true });
      ws.addEventListener("error", () => reject(new Error(`Could not connect to ${url}`)), { once: true });
    });
  }
  send<T = Record<string, unknown>>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject }));
  }
  async eval<T>(expression: string): Promise<T> {
    const r = await this.send<{ result: { value: T }; exceptionDetails?: { text: string; exception?: { description?: string } } }>("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
  close(): void {
    this.ws.close();
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(what: string, fn: () => Promise<T | null | undefined | false>, timeoutMs: number): Promise<T> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v) return v;
    if (Date.now() > until) throw new Error(`Timed out waiting for ${what}`);
    await sleep(150);
  }
}

/**
 * Runs in the page before anything else: time only moves when the renderer
 * says so. Timers, requestAnimationFrame, performance.now/Date.now and every
 * CSS animation follow window.__vt.step(ms).
 */
const VIRTUAL_CLOCK = String.raw`(() => {
  let now = 0, nextId = 1, rafs = [];
  const base = Date.now(), timers = new Map(), started = new WeakMap();
  performance.now = () => now;
  Date.now = () => base + now;
  const later = (every) => (fn, ms, ...a) => { const id = nextId++; const d = Math.max(every ? 1 : 0, Number(ms) || 0); timers.set(id, { at: now + d, fn, a, every: every ? d : 0 }); return id; };
  window.setTimeout = later(false);
  window.setInterval = later(true);
  window.clearTimeout = window.clearInterval = (id) => { timers.delete(id); };
  window.requestAnimationFrame = (fn) => { const id = nextId++; rafs.push({ id, fn }); return id; };
  window.cancelAnimationFrame = (id) => { rafs = rafs.filter((r) => r.id !== id); };
  window.__vt = {
    step(ms) {
      const target = now + ms;
      for (;;) {
        let due = null, dueId = 0;
        for (const [id, t] of timers) if (t.at <= target && (!due || t.at < due.at)) { due = t; dueId = id; }
        if (!due) break;
        now = Math.max(now, due.at);
        if (due.every) due.at += due.every; else timers.delete(dueId);
        try { if (typeof due.fn === "function") due.fn(...due.a); } catch (e) { console.error(e); }
      }
      now = target;
      const list = rafs; rafs = [];
      for (const r of list) { try { r.fn(now); } catch (e) { console.error(e); } }
      for (const a of document.getAnimations()) {
        if (!started.has(a)) started.set(a, now);
        a.pause();
        a.currentTime = now - started.get(a);
      }
      return now;
    },
  };
})();`;

async function launchChrome(exe: string, width: number, height: number): Promise<{ proc: ChildProcess; port: number; dir: string }> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "joe-render-chrome-"));
  const proc = spawn(
    exe,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${dir}`,
      `--window-size=${width},${height}`,
      "--hide-scrollbars",
      "--mute-audio",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  const portFile = path.join(dir, "DevToolsActivePort");
  const port = await waitFor("Chrome to start", async () => {
    const txt = await fsp.readFile(portFile, "utf8").catch(() => "");
    const n = Number(txt.split(/\r?\n/)[0]);
    return n > 0 ? n : null;
  }, 20_000);
  return { proc, port, dir };
}

/** Serve the built page and its song from a throwaway local port. */
function serve(files: Record<string, { body: Buffer; type: string }>): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const name = decodeURIComponent((req.url || "/").split("?")[0].replace(/^\/+/, "")) || "index.html";
      const f = files[name];
      if (!f) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { "Content-Type": f.type, "Content-Length": f.body.length, "Accept-Ranges": "none" });
      res.end(f.body);
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      resolve({ url: `http://127.0.0.1:${port}/`, close: () => server.close() });
    });
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const out = path.resolve(args.out || "stickman-video.mp4");
  const fps = Number(args.fps || 30);
  const width = Number(args.width || 1080);
  const height = Number(args.height || 1920);
  const ffmpeg = args.ffmpeg || process.env.FFMPEG_PATH || "ffmpeg";
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "joe-render-"));

  let pageUrl: string;
  let audioPath: string;
  let stopServer = () => {};

  if (args.url) {
    pageUrl = args.url;
    audioPath = ""; // read from the page once it loads
  } else {
    if (!args.audio || !args.lyrics) throw new Error("Pass --url <page>, or --audio <file> --lyrics <file> [--title …].");
    audioPath = path.resolve(args.audio);
    const audio = await fsp.readFile(audioPath);
    const ext = path.extname(audioPath).slice(1).toLowerCase() || "mp3";
    const scenes = args.scenes ? (JSON.parse(await fsp.readFile(args.scenes, "utf8")) as Scene[]) : undefined;
    const html = buildStickmanVideoHtml({
      title: args.title || "Untitled Song",
      episodeLabel: args.label || "Jobless Joe",
      lyrics: await fsp.readFile(args.lyrics, "utf8"),
      audioFile: `song.${ext}`,
      durationSec: audioDurationSec(audio, ext) ?? 60,
      scenes,
    });
    const type = ext === "wav" ? "audio/wav" : ext === "flac" ? "audio/flac" : "audio/mpeg";
    const s = await serve({ "index.html": { body: Buffer.from(html), type: "text/html; charset=utf-8" }, [`song.${ext}`]: { body: audio, type } });
    pageUrl = s.url;
    stopServer = s.close;
  }

  const chrome = await launchChrome(findChrome(args.chrome), width, height);
  let cdp: Cdp | null = null;
  let enc: ChildProcess | null = null;
  try {
    const target = (await (await fetch(`http://127.0.0.1:${chrome.port}/json/new?about:blank`, { method: "PUT" })).json()) as { webSocketDebuggerUrl: string };
    cdp = await Cdp.connect(target.webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    // Lay out at half size and capture at 2× so the vh-based page looks as on a phone.
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: Math.round(width / 2), height: Math.round(height / 2), deviceScaleFactor: 2, mobile: false });
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: VIRTUAL_CLOCK });
    const u = new URL(pageUrl);
    u.searchParams.set("record", "1");
    await cdp.send("Page.navigate", { url: u.toString() });
    await waitFor("the page", () => cdp!.eval<boolean>(`document.readyState === "complete" && typeof window.startShow === "function"`), 30_000);

    if (!audioPath) {
      const src = await cdp.eval<string>(`(document.querySelector("audio") || {}).src || ""`);
      if (!src) throw new Error("The page has no <audio> to put in the MP4.");
      const res = await fetch(src);
      if (!res.ok) throw new Error(`Could not fetch the song (${res.status}) from ${src}`);
      audioPath = path.join(tmp, "song" + (path.extname(new URL(src).pathname) || ".mp3"));
      await fsp.writeFile(audioPath, Buffer.from(await res.arrayBuffer()));
    }

    // Let the page read the real length and Joe's lip-sync curve (real time; fetch isn't on the virtual clock).
    await waitFor("the song's length", () => cdp!.eval<boolean>(`(() => { const a = document.querySelector("audio"); return !!a && a.readyState >= 1; })()`), 30_000).catch(() => {
      console.warn("Audio metadata never loaded; using the page's own estimate of the length.");
    });
    const music = await waitFor("the lip-sync analysis", () => cdp!.eval<string>(`(document.querySelector(".sm-joe") || { getAttribute: () => "" }).getAttribute("data-music") || ""`), 45_000).catch(() => "none");
    if (music !== "ready") console.warn("No loudness curve from the song; Joe will mime instead of lip-syncing.");
    await cdp.eval(`window.__vt.step(0)`);

    const totalMs = await cdp.eval<number>(`window.VESSEL && window.VESSEL.recordDurationMs`);
    if (!(totalMs > 0)) throw new Error("The page has no window.VESSEL.recordDurationMs.");
    const filmMs = args.seconds ? Math.min(totalMs, Number(args.seconds) * 1000) : totalMs;
    const frames = Math.ceil((filmMs / 1000) * fps);
    console.log(`Filming ${(filmMs / 1000).toFixed(1)}s at ${fps}fps (${frames} frames) → ${out}`);

    enc = spawn(
      ffmpeg,
      [
        "-y", "-loglevel", "error",
        "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
        "-i", audioPath,
        "-map", "0:v", "-map", "1:a",
        "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
        "-vf", `scale=${width}:${height}`,
        "-c:a", "aac", "-b:a", "192k", "-af", "apad", "-shortest",
        "-movflags", "+faststart",
        out,
      ],
      { stdio: ["pipe", "inherit", "inherit"] },
    );
    const encDone = new Promise<number>((resolve, reject) => {
      enc!.on("error", reject);
      enc!.on("close", (code) => resolve(code ?? 1));
    });

    await cdp.eval(`window.startShow()`);
    const dt = 1000 / fps;
    const t0 = Date.now();
    for (let f = 0; f < frames; f++) {
      await cdp.eval(`window.__vt.step(${f === 0 ? 0 : dt})`);
      const shot = await cdp.send<{ data: string }>("Page.captureScreenshot", { format: "jpeg", quality: 92, optimizeForSpeed: true });
      const buf = Buffer.from(shot.data, "base64");
      if (!enc.stdin!.write(buf)) await new Promise((r) => enc!.stdin!.once("drain", r));
      if (f % (fps * 5) === 0) {
        const pct = ((f / frames) * 100).toFixed(0);
        const eta = f > 0 ? (((Date.now() - t0) / f) * (frames - f)) / 1000 : 0;
        console.log(`  ${pct}%  frame ${f}/${frames}${f > 0 ? `  ~${eta.toFixed(0)}s left` : ""}`);
      }
    }
    enc.stdin!.end();
    const code = await encDone;
    if (code !== 0) throw new Error(`ffmpeg exited with ${code}`);
    console.log(`Done: ${out}`);
  } finally {
    cdp?.close();
    if (enc && enc.exitCode === null && !enc.stdin?.writableEnded) enc.kill();
    chrome.proc.kill();
    stopServer();
    await sleep(300);
    await fsp.rm(chrome.dir, { recursive: true, force: true }).catch(() => {});
    await fsp.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
