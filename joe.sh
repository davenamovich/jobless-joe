#!/usr/bin/env bash
# Top-level convenience: `./joe.sh` runs the docker start script.
# Symlink-friendly — drop this in your PATH as `joe` if you like.
exec "$(dirname "$0")/docker/scripts/start.sh" "$@"
