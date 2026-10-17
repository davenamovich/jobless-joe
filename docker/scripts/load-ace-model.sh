#!/usr/bin/env bash
# =============================================================================
# Jobless Joe — Load Ace 1.5 model into the bundled Ollama container.
# =============================================================================
#
# This script:
#   1. Looks for a model file in ./models/ (ace-1.5.gguf preferred)
#   2. Runs `ollama create ace-1.5 -f docker/ollama/Modelfile.ace`
#      inside the Ollama container
#   3. Verifies the model is registered by calling /api/tags
#   4. Prints next-step instructions
#
# PREREQUISITES
# -------------
#   - Docker + docker compose installed
#   - `docker compose --profile local-llm up -d` already running
#   - Your model file at ./models/ace-1.5.gguf (or see MODEL_FILE below)
#
# =============================================================================

set -euo pipefail

# Colors for output — works on macOS + most Linux terminals.
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

info()  { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}!${NC} $1"; }
fatal() { echo -e "${RED}✗${NC} $1"; exit 1; }

# Locate the model file. Override with MODEL_FILE env if you have a
# differently-named file.
MODEL_FILE="${MODEL_FILE:-}"
if [[ -z "$MODEL_FILE" ]]; then
    # Look for common Ace 1.5 model file extensions in ./models/
    for ext in gguf bin safetensors; do
        for path in ./models/ace-1.5."$ext" ./models/ace1.5."$ext" ./models/ace."$ext"; do
            if [[ -f "$path" ]]; then
                MODEL_FILE="$path"
                break 2
            fi
        done
    done
fi

# Allow an arbitrary single file in ./models/ if Ace-named files aren't found.
if [[ -z "$MODEL_FILE" ]]; then
    # Pick the first .gguf file in ./models/ as a fallback.
    for f in ./models/*.gguf; do
        if [[ -f "$f" ]]; then
            MODEL_FILE="$f"
            warn "No ace-1.5.gguf found. Falling back to: $MODEL_FILE"
            break
        fi
    done
fi

if [[ -z "$MODEL_FILE" ]]; then
    fatal "No model file found in ./models/.
Put your Ace 1.5 model at ./models/ace-1.5.gguf and re-run this script.

If your model has a different extension, set MODEL_FILE explicitly:
  MODEL_FILE=./models/your-file.bin ./docker/scripts/load-ace-model.sh"
fi

if [[ ! -f "$MODEL_FILE" ]]; then
    fatal "Model file not found: $MODEL_FILE"
fi

info "Found model file: $MODEL_FILE ($(du -h "$MODEL_FILE" | cut -f1) bytes)"

# Verify the Ollama container is running.
OLLAMA_CONTAINER="jobless-joe-ollama"
if ! docker ps --format '{{.Names}}' | grep -q "^${OLLAMA_CONTAINER}$"; then
    fatal "Ollama container '$OLLAMA_CONTAINER' is not running.

Start it with:
  docker compose --profile local-llm up -d"
fi

info "Ollama container is running. Registering model..."

# Inside the container, the model file is mounted at /models/ (read-only).
# Compute the in-container path of the model file.
CONTAINER_MODEL_PATH="/models/$(basename "$MODEL_FILE")"

# Patch the Modelfile to point at the actual model file, then run ollama create.
# We pipe the patched Modelfile via stdin to keep the original template clean.
PATCHED_MODFILE=$(docker exec "$OLLAMA_CONTAINER" cat /dev/null 2>/dev/null || true)
PATCHED_MODFILE=$(sed "s|^FROM .*|FROM ${CONTAINER_MODEL_PATH}|" docker/ollama/Modelfile.ace)

# Copy the patched Modelfile into the container temporarily and run ollama create.
docker exec -i "$OLLAMA_CONTAINER" sh -c "cat > /tmp/Modelfile.ace" <<EOF
$PATCHED_MODFILE
EOF

info "Creating Ollama model 'ace-1.5' from $CONTAINER_MODEL_PATH..."
# Run `ollama create ace-1.5 -f /tmp/Modelfile.ace` inside the container.
# This may take a few minutes depending on model size.
if docker exec "$OLLAMA_CONTAINER" ollama create ace-1.5 -f /tmp/Modelfile.ace; then
    info "Model registered successfully."
else
    fatal "ollama create failed. See the error above.

Common causes:
  - Model file format not supported by this Ollama version. Try updating:
      docker compose pull ollama
  - Corrupted model file. Re-download it.
  - Insufficient disk space in the ollama-models volume.
"
fi

# Verify by listing models.
info "Verifying model is registered:"
docker exec "$OLLAMA_CONTAINER" ollama list | grep -E "^NAME|ace-1.5" || warn "ace-1.5 not found in ollama list output"

# Smoke-test the OpenAI-compatible endpoint.
info "Smoke-testing the OpenAI-compat endpoint..."
if docker exec "$OLLAMA_CONTAINER" \
    wget -qO- --post-data='{"model":"ace-1.5","messages":[{"role":"user","content":"Reply with: OK"}],"stream":false}' \
    --header='Content-Type: application/json' \
    http://localhost:11434/v1/chat/completions 2>/dev/null | grep -q '"choices"'; then
    info "OpenAI-compat endpoint is responding."
else
    warn "OpenAI-compat endpoint test returned no 'choices' field.
Check the Ollama logs with: docker compose logs ollama"
fi

echo ""
info "All set! Next steps:"
echo ""
echo "  1. Make sure your .env.docker has:"
echo "       AI_BACKEND=openai-compat"
echo "       OPENAI_MODEL=ace-1.5"
echo ""
echo "  2. Restart the app container to pick up the change:"
echo "       docker compose restart app"
echo ""
echo "  3. Open http://localhost:\${APP_PORT:-3000}"
echo "     The header badge should show 'OpenAI-compat · ace-1.5'"
echo ""
