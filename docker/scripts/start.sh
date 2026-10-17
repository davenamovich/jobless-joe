#!/usr/bin/env bash
# =============================================================================
# Jobless Joe — The Crooner Song Engine
# One-click install + start script.
# =============================================================================
#
# WHAT THIS SCRIPT DOES
# ---------------------
#   1. Verifies Docker is installed and running
#   2. Creates .env.docker from the template if it doesn't exist
#   3. Detects if a local Ace 1.5 model is present in ./models/
#      → if yes, enables the local-llm profile (Ollama)
#      → if no, runs with Z.ai backend only
#   4. Builds/pulls the Docker images (first run takes a few minutes)
#   5. Starts the containers in detached mode
#   6. Waits for the app to be healthy
#   7. Opens the browser to http://localhost:<APP_PORT>
#
# USAGE
# -----
#   ./docker/scripts/start.sh           # auto-detect Ace 1.5
#   ./docker/scripts/start.sh --local   # force local-llm profile
#   ./docker/scripts/start.sh --zai     # force Z.ai backend only
#   ./docker/scripts/start.sh --no-open # don't open browser
#
# PREREQUISITES
# ------------
#   - Docker 20.10+ with Compose v2 (most modern Docker installs have this)
#   - 4GB+ free RAM (8GB+ recommended if running Ollama + Ace 1.5)
#   - On Linux with NVIDIA GPU: nvidia-container-toolkit (optional but
#     dramatically speeds up local LLM inference)
#
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# Colors + helpers
# -----------------------------------------------------------------------------
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}!${NC} $1"; }
fatal() { echo -e "${RED}✗${NC} $1"; exit 1; }
step()  { echo -e "\n${BLUE}▶${NC} $1"; }

# -----------------------------------------------------------------------------
# Parse CLI flags
# -----------------------------------------------------------------------------
FORCE_PROFILE=""
OPEN_BROWSER=true
PREFER_BUILD=false
while [[ $# -gt 0 ]]; do
    case "$1" in
        --local)   FORCE_PROFILE="local-llm"; shift ;;
        --zai)     FORCE_PROFILE="none"; shift ;;
        --no-open) OPEN_BROWSER=false; shift ;;
        --build)   PREFER_BUILD=true; shift ;;
        --pull)   PREFER_BUILD=false; shift ;;
        --help|-h)
            cat <<EOF
Jobless Joe — Docker one-click start

Usage: $0 [--local|--zai] [--build|--pull] [--no-open]

Flags:
  --local    Force local-llm profile (Ollama + Ace 1.5)
  --zai      Force Z.ai-only mode (no Ollama)
  --build    Build the app image locally instead of pulling from GHCR
             (use this for development or when the published image is unavailable)
  --pull     Pull the prebuilt image from GHCR (default behavior)
  --no-open  Don't open the browser after starting
  --help     Show this help message

Auto-detects Ace 1.5 model in ./models/ if no flag is given.
Default image source: ghcr.io/davenamovich/jobless-joe:latest (override with \$JOE_IMAGE)
EOF
            exit 0
            ;;
        *) fatal "Unknown flag: $1 (use --help for options)" ;;
    esac
done

# -----------------------------------------------------------------------------
# Step 1: Check Docker is installed and running
# -----------------------------------------------------------------------------
step "Checking Docker..."
if ! command -v docker >/dev/null 2>&1; then
    fatal "Docker is not installed.

Install Docker:
  macOS:   https://docs.docker.com/desktop/install/mac-install/
  Windows: https://docs.docker.com/desktop/install/windows-install/
  Linux:   https://docs.docker.com/engine/install/

Then re-run this script."
fi

if ! docker info >/dev/null 2>&1; then
    fatal "Docker daemon is not running.

Start Docker Desktop (macOS/Windows) or run 'sudo systemctl start docker' (Linux),
then re-run this script."
fi

if ! docker compose version >/dev/null 2>&1; then
    fatal "Docker Compose v2 is not available.

Modern Docker Desktop includes Compose v2. On Linux, install the
docker-compose-plugin package: https://docs.docker.com/compose/install/linux/"
fi

info "Docker + Compose v2 detected: $(docker --version | head -1)"

# -----------------------------------------------------------------------------
# Step 2: Set up .env.docker from the template (if not present)
# -----------------------------------------------------------------------------
step "Setting up environment..."
ENV_FILE="$(cd "$(dirname "$0")/../.." && pwd)/.env.docker"
TEMPLATE_FILE="$(cd "$(dirname "$0")/../.." && pwd)/.env.docker.example"

if [[ ! -f "$ENV_FILE" ]]; then
    if [[ -f "$TEMPLATE_FILE" ]]; then
        cp "$TEMPLATE_FILE" "$ENV_FILE"
        info "Created .env.docker from template."
    else
        warn ".env.docker.example not found. Creating an empty .env.docker."
        touch "$ENV_FILE"
    fi
else
    info ".env.docker already exists — leaving it untouched."
fi

# -----------------------------------------------------------------------------
# Step 3: Decide whether to start Ollama + Ace 1.5
# -----------------------------------------------------------------------------
step "Detecting Ace 1.5 model..."

MODELS_DIR="$(cd "$(dirname "$0")/../.." && pwd)/models"
mkdir -p "$MODELS_DIR"

HAS_ACE=false
for ext in gguf bin safetensors; do
    for path in "$MODELS_DIR"/ace-1.5."$ext" "$MODELS_DIR"/ace1.5."$ext" "$MODELS_DIR"/ace."$ext"; do
        if [[ -f "$path" ]]; then
            HAS_ACE=true
            info "Found model: $path ($(du -h "$path" | cut -f1))"
            break 2
        fi
    done
done

# Also accept any .gguf file in ./models/ as a fallback.
if [[ "$HAS_ACE" == false ]]; then
    for f in "$MODELS_DIR"/*.gguf; do
        if [[ -f "$f" ]]; then
            HAS_ACE=true
            warn "No Ace-named model found. Detected: $f"
            warn "Will use this as the local LLM. Update OPENAI_MODEL in .env.docker to match."
            break
        fi
    done
fi

# Determine the profile.
if [[ -n "$FORCE_PROFILE" ]]; then
    if [[ "$FORCE_PROFILE" == "local-llm" ]]; then
        if [[ "$HAS_ACE" == false ]]; then
            warn "--local requested but no model file detected in ./models/."
            warn "Ollama will start, but you'll need to load a model before generation works."
            warn "Drop your model at ./models/ace-1.5.gguf and run:"
            warn "  ./docker/scripts/load-ace-model.sh"
        fi
        PROFILE_FLAG="--profile local-llm"
        info "Profile: local-llm (Ollama + Ace 1.5)"
    else
        PROFILE_FLAG=""
        info "Profile: Z.ai only (no Ollama)"
    fi
else
    if [[ "$HAS_ACE" == true ]]; then
        PROFILE_FLAG="--profile local-llm"
        info "Profile auto-detected: local-llm (Ollama + Ace 1.5)"
    else
        PROFILE_FLAG=""
        info "Profile auto-detected: Z.ai only (no model file in ./models/)"
        info "To use a local model: drop it at ./models/ace-1.5.gguf and re-run with --local"
    fi
fi

# -----------------------------------------------------------------------------
# Step 4: Pull the prebuilt image OR build it locally
# -----------------------------------------------------------------------------
step "Preparing the app image..."

# Load env vars from .env.docker into this shell so docker compose picks them up
# (APP_PORT, AI_BACKEND, OPENAI_*, JOE_IMAGE, etc.).
cd "$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck disable=SC1090
set -a; source "$ENV_FILE" 2>/dev/null || true; set +a

# The image name comes from $JOE_IMAGE env (set in .env.docker) or defaults to
# the GHCR published image. If --build was passed, skip the pull entirely.
DEFAULT_IMAGE="ghcr.io/davenamovich/jobless-joe:latest"
JOE_IMAGE="${JOE_IMAGE:-$DEFAULT_IMAGE}"
export JOE_IMAGE

if [[ "$PREFER_BUILD" == "true" ]]; then
    info "Building the app image locally (--build flag set)..."
    info "This will take ~3-5 minutes on first run."
    docker compose $PROFILE_FLAG build --pull
else
    info "Pulling prebuilt image: $JOE_IMAGE"
    info "(If this fails, run with --build to build locally instead.)"
    if ! docker compose $PROFILE_FLAG pull app 2>&1; then
        warn "Pull failed. Falling back to local build..."
        warn "(Common causes: image not published yet, GHCR auth required, network issue.)"
        docker compose $PROFILE_FLAG build
    fi
fi

# Start in detached mode.
docker compose $PROFILE_FLAG up -d

info "Containers started."

# -----------------------------------------------------------------------------
# Step 5: Wait for the app to be healthy
# -----------------------------------------------------------------------------
step "Waiting for app to be ready..."
APP_PORT="${APP_PORT:-3000}"
MAX_WAIT=120  # seconds
WAITED=0
while [[ $WAITED -lt $MAX_WAIT ]]; do
    # Use docker compose's health status if available.
    HEALTH=$(docker inspect --format='{{.State.Health.Status}}' jobless-joe-app 2>/dev/null || echo "none")
    if [[ "$HEALTH" == "healthy" ]]; then
        info "App is healthy (waited ${WAITED}s)."
        break
    fi
    if [[ "$HEALTH" == "unhealthy" ]]; then
        warn "App marked unhealthy. Check logs: docker compose logs app"
        break
    fi
    sleep 3
    WAITED=$((WAITED + 3))
    echo -ne "  waiting... ${WAITED}s elapsed\r"
done

if [[ $WAITED -ge $MAX_WAIT ]]; then
    warn "App didn't become healthy within ${MAX_WAIT}s. It may still be starting up."
    warn "Check status with: docker compose ps"
fi

# -----------------------------------------------------------------------------
# Step 6: If Ollama is running and we have a model, load it.
# -----------------------------------------------------------------------------
if [[ -n "$PROFILE_FLAG" && "$HAS_ACE" == true ]]; then
    step "Loading Ace 1.5 model into Ollama..."
    # The load script handles model detection + registration.
    if ./docker/scripts/load-ace-model.sh; then
        info "Model loaded."
        # If .env.docker still has AI_BACKEND=zai, suggest flipping it.
        if grep -q "^AI_BACKEND=zai" "$ENV_FILE" 2>/dev/null; then
            warn ".env.docker still has AI_BACKEND=zai."
            warn "To use Ace 1.5, edit .env.docker and set:"
            warn "  AI_BACKEND=openai-compat"
            warn "  OPENAI_MODEL=ace-1.5"
            warn "Then: docker compose restart app"
        fi
    else
        warn "Model load failed. You can retry manually with:"
        warn "  ./docker/scripts/load-ace-model.sh"
    fi
fi

# -----------------------------------------------------------------------------
# Step 7: Print summary + open browser
# -----------------------------------------------------------------------------
step "All done!"
echo ""
echo "Jobless Joe — The Crooner Song Engine is running."
echo ""
echo "  App:        http://localhost:${APP_PORT}"
if [[ -n "$PROFILE_FLAG" ]]; then
    echo "  Ollama:     http://localhost:${OLLAMA_PORT:-11434}"
fi
echo ""
echo "  Container status:"
docker compose $PROFILE_FLAG ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
echo ""
echo "Useful commands:"
echo "  docker compose logs -f app              # tail app logs"
echo "  docker compose logs -f ollama          # tail Ollama logs"
echo "  docker compose down                    # stop everything"
echo "  docker compose down -v                 # stop + wipe database/audio cache"
echo ""

if [[ "$OPEN_BROWSER" == true ]]; then
    URL="http://localhost:${APP_PORT}"
    if command -v open >/dev/null 2>&1; then
        open "$URL" 2>/dev/null || true
    elif command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$URL" 2>/dev/null || true
    elif command -v wslview >/dev/null 2>&1; then
        wslview "$URL" 2>/dev/null || true
    else
        info "Open this URL in your browser: $URL"
    fi
fi
