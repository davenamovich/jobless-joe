# Telegram bot

Send the bot a topic and it writes, records and publishes a Jobless Joe song,
then replies with the here.now song page link (player, MP3 download, lyrics).

```
you:  Joe gets replaced by a self-checkout machine
bot:  ✍️ Joe is writing a 60s song about…        (edited in place as it goes)
      🎙️ Lyrics done. Joe is in the booth…
      🎶 The Unexpected Item in the Bagging Area
         https://xxxx.here.now
         Temporary page — gone in ~24h. Download the MP3 to keep it.
```

## Commands

**Make a song**

| Command | What it does |
| --- | --- |
| *any text* | Song about that topic or context |
| *pasted lyrics (4+ lines)* | Joe sings your lyrics (sent as the song's script) |
| `/song <topic>` | Same as sending the topic |
| `/lyrics <lyrics>` | Same as pasting lyrics, for shorter ones |
| `/episode [n]` | List the 16 story episodes, or sing number *n* |
| `/next` | Continue the story from the last song |
| `/funnier` `/sharper` `/attitude` `/ending` | Remix the last song |
| `/ad` | Turn the last song into a 30-second ad |

**Settings for this chat** (no argument = show the options)

| Command | Default |
| --- | --- |
| `/length 15s…120s` | `60s` |
| `/mood <n>` | `ridiculous` |
| `/style <n>` | `smoky-lounge` |
| `/language <n>` | `en` |
| `/settings` | Show all four |

**Posting and autopilot**

| Command | What it does |
| --- | --- |
| 📤 *Post to socials* button | Under a finished `/video` MP4: posts it via Upload-Post to every platform enabled in settings (once per MP4) |
| `/trending [refresh]` | Today's Google Trends + Hacker News stories as song ideas, one 🎙️ button each (cached 1h) |
| `/autopilot` | Show autopilot status |
| `/autopilot on [minutes]` | New story-episode song every *n* minutes (default 60, min 15); this chat gets the results |
| `/autopilot publish on\|off` | Also film each song to MP4 (25 P&R credits) and post it via Upload-Post |
| `/autopilot now` | One run right away |
| `/autopilot off` | Stop |

Upload-Post and autopilot are also in the web app's Backend settings. Headless
deployments can use `UPLOAD_POST_API_KEY`, `UPLOAD_POST_USER`,
`UPLOAD_POST_PLATFORMS` (comma-separated), `AUTOPILOT=1`,
`AUTOPILOT_INTERVAL_MIN`, `AUTOPILOT_PUBLISH=1` and `AUTOPILOT_CHAT_ID`. The
scheduler starts from `src/instrumentation.ts` and keeps its last run time in
the DB, so a restart doesn't fire an extra song. Runs alternate between a
trending idea nobody has sung yet and the next story episode.

Every new song is shown the last 12 songs' titles, openers, chorus hooks and
punchlines as off-limits, plus a random comic angle (setting × device) —
see `src/lib/freshness.ts`.

Pickers take the list number or the key (`/style 2`, `/style big-band-vegas`).
"Last song" means the app's most recent song, including ones made in the web UI.

Per-chat settings are stored in `db/telegram-sessions.json` (the `joe-db`
volume in Docker). Override with `TELEGRAM_SESSION_FILE`.

`/api/telegram/setup` also registers these with Telegram (`setMyCommands`), so
they show up in the bot's `/` menu. Re-run it after adding a command; the list
lives in `BOT_COMMANDS` in `src/lib/telegram/bot.ts`.

## How it works

`POST /api/telegram/webhook` answers Telegram immediately, then in the
background (`src/lib/telegram/song-flow.ts`):

1. `POST /api/generate` (custom topic) — lyrics, Story Bible update, starts the render
2. `ensureAudioTrack()` — joins that same render and waits for it
3. `POST /api/song-page` — publishes page + audio to here.now

Internal calls go to `http://127.0.0.1:$PORT`; set `APP_INTERNAL_URL` if the
app can't reach itself there. One song at a time per chat.

## Setup

1. Create a bot with [@BotFather](https://t.me/BotFather) (`/newbot`) and copy the token.
2. Set env vars (`.env` for `bun dev`, or the shell / `.env` next to `docker-compose.yml`):

   ```
   TELEGRAM_BOT_TOKEN=123456:ABC...
   TELEGRAM_WEBHOOK_URL=https://<public-host>/api/telegram/webhook
   TELEGRAM_WEBHOOK_SECRET=<openssl rand -hex 24>
   TELEGRAM_ALLOWED_CHAT_IDS=        # optional, comma-separated; empty = public
   HERENOW_API_KEY=                  # optional; without it pages expire after 24h
   ```

   Telegram only delivers to public HTTPS, so locally put the app behind a
   tunnel (ngrok, cloudflared) and use that URL.

3. Restart the app, then register the webhook once:

   ```
   curl https://<public-host>/api/telegram/setup
   ```

   The response should have `"success": true` and `info.url` matching your
   webhook URL. `curl -X DELETE` the same route to unregister.

4. Message the bot `/start`. Server logs are prefixed `[telegram]` / `[bot]`.
