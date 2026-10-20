# Plan: mp3 transcription in Jobless Joe

Two features that share one transcription step:

- **A. Real timing for Joe's own songs.** Joe's songs already come with lyrics, but `beatStarts()` ([stickman.ts:118](../src/lib/stickman.ts)) guesses when each line starts from its word count. The stickman pose changes, lip sync, captions and the TV ([stickman-tv.ts:289](../src/lib/stickman-tv.ts)) are all timed from that guess, so they drift away from the vocals, especially on ACE-Step songs with instrumental intros. Transcribe the rendered audio only to find when each known line is actually sung.
- **B. Drop in any mp3.** Upload an outside song (web UI or Telegram). It gets transcribed into lyrics with timestamps, saved as a normal Episode with an AudioTrack, and from then on works with the song page, stickman video, P&R video, YouTube and Upload-Post like any other song.

**Reference:** meme-loop-engine's `transcribeSongAudioDetailed` (Groq Whisper) works. Port its approach, including format sniffing, trying several keys and specific failure messages. Don't import from it.

---

## Phase 1: Transcription service

**New file:** `src/lib/transcribe.ts`

```ts
export interface TranscriptWord { word: string; start: number; end: number }
export interface TranscriptSegment { start: number; end: number; text: string }
export interface Transcript {
  text: string;
  segments: TranscriptSegment[];
  words: TranscriptWord[];
  durationSec: number;
  language?: string;
}
export type TranscribeFailure = "no-key" | "key-rejected" | "bad-audio" | "too-big" | "no-speech" | "error";

export async function transcribeAudio(
  buf: Buffer,
  opts: { filename?: string; language?: string; prompt?: string },
): Promise<{ transcript: Transcript | null; failure?: TranscribeFailure }>;
export function transcribeFailureMessage(f?: TranscribeFailure): string;
```

**How it works:**
- POST to Groq `/openai/v1/audio/transcriptions` with:
  - `model`: `whisper-large-v3`, not turbo (noticeably more accurate over music); `WHISPER_MODEL` env var can override it
  - `response_format=verbose_json`
  - `temperature=0`
  - `timestamp_granularities[]=word` and `timestamp_granularities[]=segment`
  - `language`, only when it's a valid ISO-639-1 code; map from the Episode's `language` key in `languages.ts`, so `pt-BR` becomes `pt`
  - `prompt`, at most about 800 characters: the title plus, for Joe's songs, the start of the known lyrics with section tags removed. This is the biggest accuracy gain for Feature A.
- **Format:** sniff the magic bytes (ID3/MPEG frame → mp3, RIFF → wav, `ftyp` → m4a, OggS → ogg, fLaC → flac) and name the upload by what it really is. The runtime image has no ffmpeg, so there is no re-encoding. Anything over 25 MB returns `too-big`.
- **Made-up text filter:** a pure function, `dropHallucinatedSegments`. It drops a segment when:
  - `no_speech_prob > 0.6 && avg_logprob < -1`, or
  - `compression_ratio > 2.4`, or
  - the text is one of the usual fillers ("thanks for watching", "subscribe", "[Music]", a lone ♪).
  Words that fall inside a dropped segment are removed too.
- **API key:** a new `groqApiKey` column on `BackendConfig` (same pattern as `upApiKey`), falling back to the `GROQ_API_KEY` env var. Add the field to `SettingsDialog.tsx`, `.env.example` and `docker-compose.yml`.

**Tests:** `src/lib/transcribe.test.ts` (`npx tsx --test`, the same setup as the other tests). Cover the format sniffer, the made-up text filter, prompt building and trimming, and the language mapping. Mock `fetch` to check the form fields sent and how 401 and 400 `invalid_media_file` responses map to failures.

## Phase 2: Line timing (Feature A)

**New file:** `src/lib/lyric-timing.ts`

```ts
/** Start time (seconds) of each beat's lyric line, or null where it couldn't be matched. */
export function alignLinesToWords(lines: string[], words: TranscriptWord[]): (number | null)[];
/** Fill the gaps and turn the result into 0..1 fractions of durationSec; returns null if fewer than 40% of lines matched. */
export function lineStartFractions(lines: string[], words: TranscriptWord[], durationSec: number): number[] | null;
```

- **Matching:** normalize both sides (lowercase, strip punctuation, collapse whitespace). For each line in order, search forward from the previous match for the window of words with the lowest edit distance to that line. A match counts only if it scores ≥ 0.5. Matching moves forward only, so a repeated chorus maps to its next occurrence rather than the first.
- **Gaps:** lines with no match get times interpolated between their matched neighbours. Lines before the first match or after the last are spaced by word count, as `beatStarts` does now.
- **Fallback:** if fewer than 40% of lines match, return `null`, and callers keep using `beatStarts`. A bad transcript must never give worse timing than today.
- **Important:** align against `lyricsToBeats(lyrics).map(b => b.text)`, not the raw lyrics. That function skips section tags and stops at 48 beats, so aligning against the beats keeps the indices in step with the rig and the TV.

**Storage:** add `lineStarts String @default("")` to `AudioTrack`. It holds a JSON array of fractions, one per beat, or `""` if there is no timing. Apply it with `npm run db:push`; the entrypoint bootstraps SQLite the same way.

**When it runs:**
- At the end of `runEnsureAudioTrack` ([tts-service.ts:102](../src/lib/tts-service.ts)), for both engines. It runs in the background after the row is saved, so the song itself is never delayed. Failures are logged and leave `lineStarts` empty.
- Z.ai TTS WAVs are clean speech and short (about 6 MB for 2 minutes), so they are fine to send.
- An Episode created before this change, or one whose run failed, gets timed on demand the first time a stickman video is built for it (Phase 3).

**Tests:** `src/lib/lyric-timing.test.ts`. Cover exact matches, a misheard word, a repeated chorus, a skipped line, an instrumental intro (first match at 20% of the song), and falling back to `null` when nothing matches.

## Phase 3: Use the real timing

- `beatStarts(beats)` gets an optional parameter: `beatStarts(beats, leadIn, leadOut, starts?: number[] | null)`. When `starts` is given and its length equals `beats.length`, it is returned as is. Otherwise the current word-count estimate is used.
- Pass the stored starts through:
  - `buildRigData(beats, starts?)` ([stickman-rig.ts:179](../src/lib/stickman-rig.ts))
  - `stickmanStageHtml`
  - `tvHtml(beats, title, starts?)`
  - `buildStickmanVideoHtml`, through a new `lineStarts?: number[]` field on `StickmanVideoData`
- In `src/app/api/stickman-video/route.ts`, plus the Telegram `/video` path, read `lineStarts` from the AudioTrack. If it is empty and a Groq key is set, align once inline, save the result, then build the page.
- `durationSec` should come from `transcript.durationSec` when the stored value is 0.
- **Also worth doing:** `LyricsView.tsx` / `PhoneDisplay.tsx` could highlight the current line using the same starts, and the YouTube SRT built in `youtube-service.ts` could use real timing. Both are optional and can come after the rest.
- **Tests:** add a case to `stickman-video.test.ts` checking that supplied `lineStarts` appear in the rig JSON, and that a wrong-length array falls back.

## Phase 4: Drop in an mp3 (Feature B)

**New file:** `src/lib/song-import.ts`, used by both the web UI and Telegram.

```ts
export async function importSong(input: {
  buffer: Buffer; filename: string; title?: string; language?: string; source: "web" | "telegram";
}): Promise<{ ok: true; episodeId: string } | { ok: false; error: string }>;
```

**Steps:**
1. Check the size (≤ 25 MB) and sniff the format. Accept mp3, m4a, wav, ogg and flac.
2. Run `transcribeAudio` with a prompt built from the title (if given) or the file name minus its extension. If it fails, return `transcribeFailureMessage(failure)`.
3. **Lyrics:** turn Whisper segments into lines. Split long segments at about 10 words, and start a new block where the gap between segments is more than 2.5 s.
4. **Metadata:** one LLM call through the existing `ai-backend` sends the transcript and gets back JSON for `episodeTitle`, `teaser`, `nextTitle`, `hooks` and the `adCopy` fields, in Joe's voice. Optionally the same call adds `[VERSE]` / `[CHORUS]` tags to the lines, which drive the chorus dance. If the call fails, fall back to the given title or file name plus empty arrays, so the import still succeeds.
5. Write the audio to `public/audio/ep_<id>_upload.<ext>`.
6. **Episode row:** `action: "upload"`, `episodeTheme: "upload"`, `episodeLabel: "Uploaded Song"`, and `output` set to a full `SongOutput` JSON.
7. **AudioTrack row:**
   - `voice: "upload"`, the real format and `durationSec`, `chunkCount: 1`
   - `lineStarts` computed straight from the same transcript (no second Whisper call), since the lyrics are the transcript
   - the existing `findFirst({ where: { episodeId } })` lookups then find it automatically
8. Update the Story Bible? **No.** An uploaded song isn't part of Joe's story.

**Guards** (otherwise an uploaded track gets overwritten):
- `runEnsureAudioTrack` deletes a cached track whose format doesn't match the active engine, and re-renders from the lyrics ([tts-service.ts:117-131](../src/lib/tts-service.ts)). Add a check at the top: if the Episode's `action === "upload"`, return its existing track as is, whatever voice or engine was asked for.
- `/api/generate` remix actions (funnier, sharper, continue…) on an uploaded episode would make a new Joe song from the transcript. That's acceptable, and possibly fun, but it must create a new episode, not change the upload. Confirm this is what currently happens.

**Web UI:**
- New `src/app/api/upload-song/route.ts` (POST, `multipart/form-data`, fields `file`, `title?` and `language?`). It calls `importSong` and returns `{ episodeId }`.
- A drop zone component, `src/components/joe/SongDrop.tsx`, with drag-and-drop plus a file picker (`accept="audio/*"`). It shows progress text and then loads the new episode the same way picking one in `EpisodeHistory` does. Place it in `ControlPanel.tsx` under the topic and script inputs.
- Set the route's body size limit: the Next.js config or the route's `export const maxDuration` / runtime settings, and check the standalone server allows a 25 MB body.

**Telegram:**
- `TelegramMessage` already has `audio`, `voice` and `document` fields, and `getFileUrl()` already exists ([types.ts:158](../src/lib/telegram/types.ts)); neither is used yet.
- In `handleNonCommandMessage`, before the text handling:
  - for an `audio`, `voice`, or `document` message whose file name ends in an audio extension: reply "🎙️ Transcribing…", download the file through `getFileUrl`, call `importSong`, then reuse `song-flow.ts`'s existing "song ready" reply (song page link, video button)
- The Telegram Bot API only lets bots download files up to 20 MB. Reply with a clear message when a file is bigger.
- Update `/help` and `docs/telegram-bot.md`.

**Tests:**
- `song-import.test.ts`: segment-to-line splitting, the metadata fallback when the LLM fails, and the upload guard in `ensureAudioTrack`. Mock `transcribeAudio` and the database calls.
- A Telegram handler test checking that an audio message is routed to the import, and that an oversized file gets the 20 MB message.

## Phase 5 (optional): Vocal isolation for uploads

Uploads are the case where accuracy suffers most (full mix, unknown lyrics). Joe's own songs need it less, because their known lyrics guide the prompt and the matching.

- `src/lib/vocal-stem.ts`: `separateVocals(buf): Promise<Buffer | null>` using a hosted Demucs (Replicate or fal), behind `VOCAL_ISOLATION=off|replicate|fal` (default `off`). Any error returns `null`, and the original mix is transcribed instead.
- The vocal stem is used only for transcription. The page and video always play the original mix.
- Turn it on only after comparing results in the check below.

---

## Checking it works

1. **Feature A:** generate one ACE-Step song and one Z.ai song, open each stickman preview page, and confirm pose and caption changes land on the vocals. Compare against `?timing=estimate` (add a debug query parameter that forces `beatStarts`).
2. **Feature B:** drop 3 mp3s, through the web UI and Telegram: one clean vocal, one rap, one with a heavy mix. Check the transcribed lyrics against the real ones, then make the stickman video and the P&R video from each.
3. Run `npx tsx --test src/lib/*.test.ts`, then `npm run lint` and `npm run build`.

## Order and size

| Phase | Depends on | Size |
|---|---|---|
| 1. Transcription service + Groq key setting | — | ~1.5 h |
| 2. Line timing + `lineStarts` column | 1 | ~2 h |
| 3. Rig, TV and page use real timing | 2 | ~1 h |
| 4. Drop in mp3 (service, web, Telegram) | 1 (and 2 for timing) | ~3–4 h |
| 5. Vocal isolation | 4 | ~2 h, optional |

Phases 2–3 and Phase 4 both start from Phase 1 and touch different files, apart from one line in `tts-service.ts`. They can be built in parallel once Phase 1 is in.

## Open questions

1. Is Groq Whisper (same provider as meme-loop-engine) fine, or would you rather use Z.ai's speech recognition so Joe stays on one provider? Z.ai's doesn't return word timestamps, which Feature A needs.
2. Uploaded songs: should the LLM also add section tags (for the chorus dance), or keep the transcript exactly as transcribed?
3. Should autopilot ever pick uploaded songs, or should they be kept out of the episode rotation?
