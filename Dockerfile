# =============================================================================
# Jobless Joe — The Crooner Song Engine
# Multi-stage Dockerfile: deps → build → runtime
# =============================================================================
# Produces a lean production image (~250MB) that runs the Next.js standalone
# server. The image is stateless — the SQLite database and audio files are
# mounted as volumes at runtime (see docker-compose.yml).
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: deps — install all node_modules (including devDependencies needed
# for the build, like prisma, typescript, eslint).
# -----------------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app

# Bun is used by the project scripts; install it for the build stage only.
RUN apk add --no-cache libc6-compat \
    && npm install -g bun

COPY package.json bun.lock* ./
COPY prisma ./prisma

# Install with frozen lockfile (reproducible builds).
RUN bun install --frozen-lockfile

# Generate the Prisma client so the runtime can talk to SQLite.
RUN bun run db:generate

# -----------------------------------------------------------------------------
# Stage 2: build — produce the Next.js standalone output.
# -----------------------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

RUN apk add --no-cache libc6-compat \
    && npm install -g bun

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time env. We use a throwaway DATABASE_URL just to satisfy Prisma
# during generate — the real one is mounted at runtime.
ENV DATABASE_URL="file:/tmp/build.db"
ENV NEXT_TELEMETRY_DISABLED=1

# Build the Next.js standalone output. The package.json build script also
# copies static assets into the standalone dir.
RUN bun run db:generate \
    && bun run build

# -----------------------------------------------------------------------------
# Stage 3: runtime — minimal image with only what's needed to run.
# -----------------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

# Tighten runtime security: run as non-root.
RUN addgroup -g 1001 -S nodejs \
    && adduser -S nextjs -u 1001 -G nodejs

# Install only runtime system deps.
#   - sqlite-libs: needed by @prisma/client (SQLite)
#   - ffmpeg: optional, but useful if you later want to transcode audio
RUN apk add --no-cache sqlite-libs tini

# Copy the Next.js standalone server. The package.json build script already
# copies .next/static + public/ INTO the standalone dir, so we only need
# this one COPY.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# Copy the Prisma client (already generated in stage 1).
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Pre-create the data directories and chown them so the volume mounts
# inherit the right ownership.
RUN mkdir -p /app/db /app/public/audio \
    && chown -R nextjs:nodejs /app/db /app/public

USER nextjs

# Expose the port the standalone server listens on.
EXPOSE 3000

# Use tini as init so signals (Ctrl-C, docker stop) propagate cleanly.
ENTRYPOINT ["/sbin/tini", "--"]

# Health check: hit the home page and check for 200.
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
    CMD wget -qO- http://localhost:3000/ >/dev/null 2>&1 || exit 1

# Run the Next.js standalone server.
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NODE_ENV=production
ENV DATABASE_URL="file:/app/db/custom.db"
CMD ["node", "server.js"]
