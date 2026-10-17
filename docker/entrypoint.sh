#!/bin/sh
# =============================================================================
# Jobless Joe — runtime entrypoint
# =============================================================================
# The runtime image is built from Next.js standalone output and does not carry
# the dev toolchain. Prisma therefore needs an explicit schema push before the
# server starts, otherwise a fresh volume has no tables and every DB-backed
# route fails with "table does not exist".
#
# `prisma db push` is idempotent: when the schema already matches it is a no-op.
# =============================================================================
set -e

if [ -n "${DATABASE_URL:-}" ]; then
    echo "[entrypoint] Ensuring database schema (${DATABASE_URL})..."
    node /app/prisma-cli/node_modules/prisma/build/index.js db push \
        --schema=/app/prisma/schema.prisma \
        --skip-generate
    echo "[entrypoint] Database schema ready."
else
    echo "[entrypoint] DATABASE_URL is not set; skipping schema bootstrap."
fi

exec "$@"
