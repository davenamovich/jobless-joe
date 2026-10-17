#!/usr/bin/env bash
# Jobless Joe — pull the latest images + rebuild the app.
# Usage: ./docker/scripts/update.sh

set -euo pipefail
cd "$(cd "$(dirname "$0")/../.." && pwd)"

echo "▶ Pulling latest base images..."
docker compose --profile local-llm pull 2>/dev/null || docker compose pull

echo "▶ Rebuilding app image..."
docker compose --profile local-llm build --pull app 2>/dev/null || docker compose build --pull app

echo "▶ Restarting containers..."
docker compose --profile local-llm up -d 2>/dev/null || docker compose up -d

echo "✓ Update complete."
docker compose ps --format "table {{.Name}}\t{{.Status}}"
