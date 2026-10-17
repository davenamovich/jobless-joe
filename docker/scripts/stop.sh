#!/usr/bin/env bash
# Jobless Joe — stop all containers.
# Usage: ./docker/scripts/stop.sh
#   --volumes   also wipe the database + audio cache + Ollama models

set -euo pipefail
cd "$(cd "$(dirname "$0")/../.." && pwd)"

VOLUMES_FLAG=""
if [[ "${1:-}" == "--volumes" || "${1:-}" == "-v" ]]; then
    VOLUMES_FLAG="-v"
fi

# Try with the local-llm profile so Ollama also stops if it's running.
if docker compose --profile local-llm ps --format '{{.Name}}' 2>/dev/null | grep -q .; then
    docker compose --profile local-llm down $VOLUMES_FLAG
else
    docker compose down $VOLUMES_FLAG
fi

if [[ -n "$VOLUMES_FLAG" ]]; then
    echo "✓ Stopped containers + wiped volumes (database, audio cache, Ollama models)."
else
    echo "✓ Stopped containers. Volumes preserved — run with --volumes to wipe data."
fi
