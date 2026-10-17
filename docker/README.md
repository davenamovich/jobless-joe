# Jobless Joe — Docker One-Click Install

> Run Jobless Joe's Crooner Song Engine locally with a single command. Optionally bundle Ace 1.5 (or any OpenAI-compatible LLM) via Ollama.

---

## Three install paths

### One-command installer (recommended for end users)

```bash
curl -fsSL https://github.com/<owner>/jobless-joe/raw/main/install.sh | bash
```

Handles everything: detects OS, installs Docker if missing (Linux/WSL2 only), verifies image signature with cosign (if installed), clones the repo, starts the app, opens the browser. See [`docs/PUBLISHING.md`](../docs/PUBLISHING.md) for full flag reference.

### Quick start (with Docker already installed)

> **Default behavior**: `./joe.sh` pulls the prebuilt multi-arch image from GitHub Container Registry (5-second first-run). To build locally instead, use `./joe.sh --build` (~5 minutes). See [docs/PUBLISHING.md](../docs/PUBLISHING.md) for how to publish your own image.

### Option A — Just Z.ai (zero config, no local model) — simplest

```bash
./joe.sh
```

That's it. The script will:
1. Check Docker is installed and running
2. Create `.env.docker` from the template
3. **Pull** the prebuilt Next.js image from `ghcr.io/jobless-joe/jobless-joe:latest` (or build locally with `--build`)
4. Start the container
5. Wait for the app to be healthy
6. Open http://localhost:3000 in your browser

The app uses Z.ai's GLM model by default — no API key needed in this environment.

### Option B — Bundle Ace 1.5 locally

1. Drop your Ace 1.5 model file at `./models/ace-1.5.gguf` (or `.bin`, `.safetensors`).

2. Run the start script:
   ```bash
   ./joe.sh --local
   ```
   This starts both the Next.js app and an Ollama container.

3. Edit `.env.docker` to flip the backend:
   ```bash
   AI_BACKEND=openai-compat
   OPENAI_BASE_URL=http://ollama:11434/v1
   OPENAI_API_KEY=ollama
   OPENAI_MODEL=ace-1.5
   ```

4. Restart the app container to pick up the new config:
   ```bash
   docker compose restart app
   ```

5. Verify the header badge in the app now reads `OpenAI-compat · ace-1.5`.

---

## What's in the box

| Service    | Image                | Port | Purpose                                                       |
|------------|----------------------|------|---------------------------------------------------------------|
| `app`      | Built from `Dockerfile` | 3000 | Next.js crooner song engine + TTS audio + wall manager        |
| `ollama`   | `ollama/ollama:latest` | 11434 | Local LLM server (only starts with `--profile local-llm`)    |

### Persistent volumes

- `joe-db` — the SQLite database (episodes, story bible, walls, audio tracks)
- `joe-audio` — generated TTS WAV files (`/public/audio/`)
- `ollama-models` — loaded model registry (only when Ollama runs)

Use `docker compose down` to stop. Add `-v` to wipe all data:
```bash
docker compose --profile local-llm down -v   # nuclear option
```

---

## CLI flags

```bash
./joe.sh [flags]

  --local      Force the local-llm profile (start Ollama even without a model file)
  --zai        Force Z.ai-only mode (don't start Ollama)
  --build      Build the app image locally instead of pulling from GHCR
               (use this for development or when the published image is unavailable)
  --pull       Pull the prebuilt image from GHCR (default behavior)
  --no-open    Don't open the browser after starting
  --help       Show this help
```

Without flags, the script auto-detects: if `./models/ace-1.5.gguf` exists, it starts Ollama; otherwise it runs Z.ai-only. The image is pulled by default — pass `--build` to compile locally.

### Overriding the image source

```bash
# Use a forked image
JOE_IMAGE=ghcr.io/<your-username>/jobless-joe:latest ./joe.sh

# Pin to a specific version
JOE_IMAGE=ghcr.io/jobless-joe/jobless-joe:v1.0.0 ./joe.sh

# Use the bleeding-edge build
JOE_IMAGE=ghcr.io/jobless-joe/jobless-joe:edge ./joe.sh
```

Or set `JOE_IMAGE` permanently in `.env.docker`.

---

## All scripts

| Script                                | What it does                                                        |
|---------------------------------------|---------------------------------------------------------------------|
| `./joe.sh`                            | Top-level alias for `docker/scripts/start.sh`                       |
| `./docker/scripts/start.sh`           | One-click install + start (see above)                               |
| `./docker/scripts/stop.sh`            | Stop all containers. Add `--volumes` to wipe data.                  |
| `./docker/scripts/update.sh`          | Pull latest images + rebuild the app.                              |
| `./docker/scripts/load-ace-model.sh`  | Register `./models/ace-1.5.gguf` with Ollama. Run once after first start. |

---

## Configuration

All runtime config lives in **`.env.docker`** (gitignored). Copy from `.env.docker.example` or let `start.sh` create it for you.

| Variable           | Default                          | Description                                            |
|--------------------|----------------------------------|--------------------------------------------------------|
| `APP_PORT`         | `3000`                           | Host port for the Next.js app                           |
| `JOE_IMAGE`        | `ghcr.io/jobless-joe/jobless-joe:latest` | Docker image to pull. Override to use a fork or pin to a version. |
| `AI_BACKEND`       | `zai`                            | `zai` or `openai-compat`                               |
| `OPENAI_BASE_URL`  | `http://ollama:11434/v1`         | OpenAI-compat endpoint URL (only used if backend=openai-compat) |
| `OPENAI_API_KEY`   | `ollama`                         | API key (any string for local servers)                 |
| `OPENAI_MODEL`     | `ace-1.5`                        | Model name your backend exposes                        |
| `OLLAMA_PORT`      | `11434`                          | Host port for Ollama (only with `--profile local-llm`) |

You can also override these at runtime via the in-app **Backend** dialog (Settings → Backend). The dialog persists changes to the database, which takes precedence over env vars.

---

## Using a different local model

The bundled Ollama supports any GGUF model. To swap Ace 1.5 for, say, Llama 3.1:

1. Drop the model at `./models/llama-3.1-70b.gguf`
2. Edit `docker/ollama/Modelfile.ace` — change the `FROM` line to point at your file, or copy it to `Modelfile.llama` and edit there.
3. Run a one-shot `ollama create`:
   ```bash
   docker exec jobless-joe-ollama ollama create llama-3.1 -f /models/Modelfile.llama
   ```
4. Edit `.env.docker`:
   ```bash
   OPENAI_MODEL=llama-3.1
   ```
5. `docker compose restart app`

---

## Pointing at an external endpoint (LM Studio, ngrok, vLLM)

If you already have an LLM server running outside Docker:

1. Start the app Z.ai-only:
   ```bash
   ./joe.sh --zai
   ```

2. In the app, click **Backend** in the header, select **OpenAI-compatible**, and enter:
   - Base URL: `http://localhost:1234/v1` (LM Studio on the host) or `https://abc123.ngrok.app/v1` (ngrok)
   - Model name: whatever your server exposes
   - API key: any string for local servers

3. Click **Test connection** — should show `Connected in Xms via openai-compat (model-name)`.

4. **Save settings** — header badge updates immediately.

> **Note on `localhost` from inside Docker**: if your external LLM is on the host's localhost, use `http://host.docker.internal:1234/v1` (macOS/Windows) or `--add-host=host.docker.internal:host-gateway` (Linux). The compose file already handles this on Linux via the default bridge network.

---

## GPU acceleration (Linux + NVIDIA)

Ollama runs on CPU by default. To use an NVIDIA GPU:

1. Install [nvidia-container-toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html) on the host.

2. Uncomment the `deploy.resources` block in `docker-compose.yml`:
   ```yaml
   ollama:
     deploy:
       resources:
         reservations:
           devices:
             - driver: nvidia
               count: all
               capabilities: [gpu]
   ```

3. Restart:
   ```bash
   ./docker/scripts/stop.sh
   ./joe.sh --local
   ```

4. Verify the GPU is detected:
   ```bash
   docker exec jobless-joe-ollama ollama ps
   # Should show "GPU" in the Processor column
   ```

---

## Troubleshooting

### "Docker daemon is not running"
Start Docker Desktop (macOS/Windows) or `sudo systemctl start docker` (Linux).

### "Cannot delete the last wall"
This is by design — the app always keeps at least one wall. To wipe everything and start fresh:
```bash
./docker/scripts/stop.sh --volumes
./joe.sh
```

### Audio generation is slow / times out
TTS generation runs in the background after song creation. For very long songs (120s) it can take 30-60s. The phone UI shows a "Joe is warming up…" spinner while it waits. If you hit a hard 2-minute timeout, your Z.ai quota may be exhausted.

### `ollama create` fails with "model file format not supported"
Make sure your `.gguf` file is intact. Re-download if necessary. Also try updating Ollama:
```bash
docker compose pull ollama
docker compose --profile local-llm up -d ollama
```

### App can't reach Ollama
If the app container shows "Connection failed" when testing the OpenAI-compat backend:
1. Verify Ollama is running: `docker compose --profile local-llm ps`
2. From inside the app container, ping Ollama:
   ```bash
   docker exec jobless-joe-app wget -qO- http://ollama:11434/api/tags
   ```
   Should return JSON listing registered models.
3. If that fails, check the network: `docker network inspect jobless-joe_joe-net`

### Port 3000 (or 11434) is already in use
Edit `.env.docker` and change `APP_PORT` (or `OLLAMA_PORT`) to a free port.

### Want to wipe everything and start over
```bash
./docker/scripts/stop.sh --volumes
rm -f .env.docker
./joe.sh
```

---

## File layout

```
.
├── Dockerfile                  # Multi-stage build (deps → build → runtime)
├── .dockerignore               # Keeps the build context lean
├── docker-compose.yml          # App + Ollama services, volumes, profiles
├── .env.docker.example         # Template — copy to .env.docker
├── joe.sh                      # Top-level alias for start.sh
├── docker/
│   ├── README.md               # This file
│   ├── ollama/
│   │   └── Modelfile.ace       # Ollama Modelfile template for Ace 1.5
│   └── scripts/
│       ├── start.sh            # One-click install + start
│       ├── stop.sh             # Stop containers (--volumes to wipe)
│       ├── update.sh           # Pull latest images + rebuild
│       └── load-ace-model.sh   # Register Ace 1.5 with Ollama
├── models/                     # Drop your .gguf model file here
└── ...                         # The Next.js app source
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ Host machine                                                    │
│                                                                 │
│  ┌──────────────────────────────┐    ┌───────────────────────┐  │
│  │ Browser                       │    │ ./models/             │  │
│  │ http://localhost:3000         │    │   ace-1.5.gguf        │  │
│  └────────────┬─────────────────┘    └───────────┬───────────┘  │
│               │                                  │ (read-only)   │
│               │                                  ▼               │
│  ┌────────────▼─────────────────┐    ┌───────────────────────┐  │
│  │ app container                │    │ ollama container       │  │
│  │ (Next.js standalone server)  │    │ (OpenAI-compat API)   │  │
│  │                              │◄──►│ http://ollama:11434   │  │
│  │  /api/generate  → LLM        │    │ /v1/chat/completions  │  │
│  │  /api/audio     → TTS (Z.ai) │    └───────────┬───────────┘  │
│  │  /api/walls     → SQLite     │                │              │
│  │  /api/episodes  → SQLite     │                ▼              │
│  │  /public/audio/ → WAV files  │    ┌───────────────────────┐  │
│  └────────────┬─────────────────┘    │ ollama-models volume  │  │
│               │                      │ (loaded model cache)  │  │
│               ▼                      └───────────────────────┘  │
│  ┌────────────────────────────┐                                 │
│  │ joe-db volume              │                                 │
│  │ (SQLite: episodes, walls, │                                 │
│  │  story bible, audio tracks)│                                 │
│  └────────────────────────────┘                                 │
│                                                                 │
│  ┌────────────────────────────┐                                 │
│  │ joe-audio volume           │                                 │
│  │ (Generated TTS WAV files)  │                                 │
│  └────────────────────────────┘                                 │
└─────────────────────────────────────────────────────────────────┘
```

The Next.js app talks to Ollama over the internal `joe-net` Docker network (service name `ollama`, port `11434`). When `AI_BACKEND=zai`, Ollama isn't started and the app calls Z.ai directly. All persistent state lives in named volumes that survive container restarts.

---

## License + credits

Built for Jobless Joe's Bootcamp. Comedy first. Curiosity second. The bootcamp shows up naturally.
