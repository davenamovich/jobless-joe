import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";

/**
 * GET /audio/[file] — songs rendered after the server started.
 *
 * Next.js only serves files that were in public/ when it booted, so a song
 * written to public/audio afterwards 404s until a restart. This route serves
 * those files straight from disk (with Range, so the player can seek).
 */
const AUDIO_DIR = path.join(process.cwd(), "public", "audio");

const TYPES: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const name = path.basename(decodeURIComponent(file));
  const type = TYPES[path.extname(name).toLowerCase()];
  if (!type) return new Response("Not found", { status: 404 });

  let buf: Buffer;
  try {
    buf = await fs.readFile(path.join(AUDIO_DIR, name));
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const headers: Record<string, string> = {
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-cache",
  };

  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    const size = buf.length;
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    return new Response(new Uint8Array(buf.subarray(start, end + 1)), {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  return new Response(new Uint8Array(buf), { headers: { ...headers, "Content-Length": String(buf.length) } });
}
