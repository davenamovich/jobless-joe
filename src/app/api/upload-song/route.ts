import { NextRequest, NextResponse } from "next/server";
import { importSong } from "@/lib/song-import";
import { MAX_TRANSCRIBE_BYTES } from "@/lib/transcribe";

export const runtime = "nodejs";
// Whisper large-v3 on a few minutes of audio, plus the metadata pass.
export const maxDuration = 300;

/**
 * POST /api/upload-song — multipart form: file (audio), title?, language?.
 * Transcribes the song and saves it as an episode; returns { episodeId }.
 */
export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Send the song as multipart/form-data with a `file` field." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No audio file in the upload." }, { status: 400 });
  }
  if (file.size > MAX_TRANSCRIBE_BYTES) {
    return NextResponse.json({ error: "That file is over 25 MB. Send a smaller MP3." }, { status: 413 });
  }

  try {
    const result = await importSong({
      buffer: Buffer.from(await file.arrayBuffer()),
      filename: file.name,
      title: String(form.get("title") ?? ""),
      language: String(form.get("language") ?? "") || undefined,
      source: "web",
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
    return NextResponse.json(result);
  } catch (e) {
    console.error("[upload-song] import failed", e);
    return NextResponse.json({ error: `Couldn't save the song: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }
}
