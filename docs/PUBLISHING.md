# Publishing the Docker Image

> How to publish Jobless Joe's prebuilt image to GitHub Container Registry (GHCR), with built-in smoke testing, image signing, automated release notes, and a one-command installer.

---

## Why publish?

| | With prebuilt image | With local build |
|---|---|---|
| First-run time | ~5 seconds | ~3–5 minutes |
| Requires Bun + Node build deps | No | Yes |
| Requires internet during build | No (only during pull) | Yes (npm registry + GHCR) |
| Works on low-RAM machines | Yes | No (Next.js build needs ~1GB) |
| End user install command | `curl ... \| bash` | Clone + `./joe.sh --build` |

If you're distributing Jobless Joe to non-developers, publishing is essential. If you're just using it yourself, the local build (`./joe.sh --build`) works fine.

---

## The full pipeline

The `.github/workflows/docker-publish.yml` workflow runs **4 jobs** in sequence on every push to `main`, every tag push (`v*`), and every PR:

```
build-and-push  →  smoke-test  →  sign  →  release
(multi-arch)      (boot + curl)  (cosign) (auto-notes)
```

| Job | What it does | Run on PR? |
|---|---|---|
| `build-and-push` | Builds `linux/amd64` + `linux/arm64`, pushes to GHCR | Builds but doesn't push |
| `smoke-test` | Boots the published image, curls 5 endpoints, fails the workflow if any return non-200 or invalid JSON | Skipped |
| `sign` | Signs the image with cosign (keyless, via Sigstore OIDC). Records signature in rekor transparency log. | Skipped |
| `release` | Creates a GitHub Release with auto-generated changelog. Only runs on tag pushes. | Skipped |

The `release` job **only runs if all three preceding jobs succeeded** — so users never see a release announcement for a broken image.

---

## One-time setup

### Step 1 — Create a GitHub repo

If you haven't already, create a new GitHub repository and push your Jobless Joe code to it:

```bash
git init
git add .
git commit -m "Initial commit: Jobless Joe Crooner Song Engine"
git branch -M main
git remote add origin https://github.com/<your-username>/jobless-joe.git
git push -u origin main
```

### Step 2 — Verify the workflow file exists

The workflow file is at `.github/workflows/docker-publish.yml`. It will run automatically when you push a `v*` tag. No additional GitHub secrets needed — GHCR uses the automatic `GITHUB_TOKEN` and cosign uses GitHub's OIDC provider for keyless signing.

### Step 3 — Trigger the first build

You have two ways to trigger the workflow:

**Option A — Manual (recommended for first run):**
1. Go to your repo on GitHub → **Actions** tab
2. Select **"Publish Docker Image"** in the left sidebar
3. Click **"Run workflow"** → **"Run workflow"** (leave `ref` empty)
4. Wait ~15–20 minutes for the multi-arch build + smoke test + signing to complete
5. The image will be tagged as `:edge`

**Option B — Tag a release:**
```bash
git tag v1.0.0
git push origin v1.0.0
```
This triggers the workflow automatically. The image will be tagged as both `:latest` and `:v1.0.0`, signed, and a GitHub Release will be created with auto-generated notes.

### Step 4 — Make the package public (optional but recommended)

By default, GHCR packages are private. To allow anonymous pulls (so end users don't need to authenticate):

1. Go to your profile page on GitHub → **Packages** tab
2. Click on the `jobless-joe` package
3. **Package settings** → scroll to **Danger Zone** → **Change visibility** → **Public**

Once public, anyone can pull without authentication:

```bash
docker pull ghcr.io/<your-username>/jobless-joe:latest
```

---

## The smoke test

The `smoke-test` job boots the published image and verifies 5 endpoints before declaring the workflow successful:

1. `GET /` — should return HTTP 200 and contain the string `"Jobless Joe"`
2. `GET /api/story-bible` — should return HTTP 200 + valid JSON
3. `GET /api/episodes` — should return HTTP 200 + valid JSON with `episodes` array
4. `GET /api/walls` — should return HTTP 200 + valid JSON with `walls` array
5. `GET /api/backend/config` — should return HTTP 200 + valid JSON

If any check fails, the workflow fails — and the `sign` and `release` jobs won't run. The container's full stderr/stdout is dumped to the Actions step summary on failure, so you can debug from the GitHub UI without re-running locally.

This catches runtime regressions that build success alone can't detect (missing env vars, broken Prisma client, crashed Next.js server, etc.).

---

## Image signing with cosign

Every published image is signed with **cosign keyless signing** via Sigstore's Fulcio CA. The signature is recorded in the [rekor transparency log](https://rekor.sigstore.dev), so it's publicly auditable.

### How it works
- The workflow uses GitHub Actions' OIDC token to authenticate to Fulcio (no long-lived signing keys to manage).
- The signature is stored alongside the image at `ghcr.io/<owner>/jobless-joe:sha256-<digest>.sig`.
- The workflow self-verifies the signature immediately after signing, so a broken signature fails the build.

### Verifying an image as an end user

If you have [cosign](https://docs.sigstore.dev/cosign/installation/) installed, you can verify any image was genuinely published by the official repo:

```bash
cosign verify \
  --certificate-identity-regexp='https://github.com/jobless-joe/jobless-joe/.+' \
  --certificate-oidc-issuer='https://token.actions.githubusercontent.com' \
  ghcr.io/jobless-joe/jobless-joe:latest
```

Replace `jobless-joe/jobless-joe` with your fork's `owner/repo` if you published from a fork.

The `install.sh` script does this automatically when cosign is detected — see below.

---

## Automated release notes

When you push a tag like `v1.0.0`, the `release` job creates a GitHub Release using `softprops/action-gh-release@v2` with `generate_release_notes: true`. This produces the same auto-generated changelog you'd get from clicking "Generate release notes" in the GitHub UI — lists all PRs merged since the previous tag, with author attribution.

The release body includes:
- Install command (`curl ... | bash`)
- Multi-arch + cosign signing info
- Image pull command for the specific version
- cosign verification command
- Auto-generated PR changelog

Tags containing a hyphen (e.g. `v1.0.0-rc.1`, `v1.0.0-beta.2`) are automatically marked as **prerelease**.

---

## The one-command installer (`install.sh`)

End users don't need to clone the repo manually. The `install.sh` script handles everything:

```bash
curl -fsSL https://github.com/<owner>/jobless-joe/raw/main/install.sh | bash
```

### What it does
1. Detects the host OS (macOS, Linux, WSL2, Git Bash)
2. Checks Docker + Compose v2 are installed
   - On Linux/WSL2: offers to install Docker automatically via `get.docker.com`
   - On macOS: detects Homebrew and offers `brew install --cask docker`
3. Optionally verifies the image signature with cosign (if installed)
4. Clones the repo to `~/jobless-joe` (or updates if it already exists)
5. Runs `./joe.sh` to start the app
6. Opens the browser

### Flags

```bash
curl -fsSL .../install.sh | bash -s -- [flags]

  --version <tag>   Install a specific git tag (default: main)
  --no-start        Clone + configure but don't start the containers
  --no-verify       Skip cosign signature verification
  --dir <path>      Install directory (default: ~/jobless-joe)
  --help            Show this help
```

### Examples

```bash
# Default install (main branch, latest image, auto-start)
curl -fsSL https://github.com/jobless-joe/jobless-joe/raw/main/install.sh | bash

# Install a specific version
curl -fsSL .../install.sh | bash -s -- --version v1.2.0

# Install but skip the auto-start (user will run ./joe.sh manually later)
curl -fsSL .../install.sh | bash -s -- --no-start

# Install to a custom directory
curl -fsSL .../install.sh | bash -s -- --dir ~/projects/joe

# Skip cosign verification
curl -fsSL .../install.sh | bash -s -- --no-verify
```

### Embedding in a release page

The release body auto-includes the install command, so end users landing on your GitHub release page can copy-paste it directly.

---

## Image tag strategy

The workflow produces these tags based on trigger:

| Trigger | Tags pushed | Signed? | Released? |
|---|---|---|---|
| Tag push (`v1.0.0`) | `:latest`, `:v1.0.0` | ✓ | ✓ (creates GitHub Release) |
| Push to `main` branch | `:edge` | ✓ | — |
| Pull request | (none — smoke test only) | — | — |
| Manual workflow dispatch | `:edge` | ✓ | — |

Best practices:
- **`:latest`** — what end users get by default. Should always point at the most recent stable tag.
- **`:v1.0.0`** — pinned version, useful for reproducible deployments.
- **`:edge`** — bleeding-edge, built on every push to `main`. Don't use in production.

---

## Multi-arch support

The workflow builds for **both** `linux/amd64` and `linux/arm64`:

| Architecture | What it covers |
|---|---|
| `linux/amd64` | Intel Macs, Windows Docker Desktop, most cloud VMs (AWS EC2, GCP, Azure), Linux x86 |
| `linux/arm64` | Apple Silicon Macs (M1/M2/M3/M4), AWS Graviton instances, Raspberry Pi 4/5 |

Docker automatically pulls the right architecture for the host platform — users don't need to specify anything.

The smoke test runs only on amd64 (cross-platform smoke testing would be slower than the value it adds). The build itself produces a working multi-arch manifest.

---

## Caching

The workflow uses GHCR's build cache (`type=registry,ref=...:buildcache`). Subsequent builds reuse cached layers, cutting build time from ~15 minutes (cold) to ~3 minutes (warm).

---

## Pointing end users at your published image

Once you've published, end users have several options:

### Option 1 — Use the one-command installer (recommended)

```bash
curl -fsSL https://github.com/<owner>/jobless-joe/raw/main/install.sh | bash
```

Handles everything: Docker install, repo clone, image pull, browser open. Best for non-technical users.

### Option 2 — Clone + run

```bash
git clone https://github.com/<owner>/jobless-joe.git
cd jobless-joe
./joe.sh
```

### Option 3 — Use a forked image

If you forked the repo and published under your own username:

```bash
JOE_IMAGE=ghcr.io/<your-username>/jobless-joe:latest ./joe.sh
```

Or set `JOE_IMAGE` permanently in `.env.docker`.

### Option 4 — Pin to a specific version

For reproducible deployments:

```bash
JOE_IMAGE=ghcr.io/<owner>/jobless-joe:v1.0.0 ./joe.sh
```

---

## Overriding the image source

| Want to... | Command |
|---|---|
| Use the prebuilt image (default, fastest) | `./joe.sh` |
| Force a local build (development) | `./joe.sh --build` |
| Use a forked image | `JOE_IMAGE=ghcr.io/<user>/jobless-joe:latest ./joe.sh` |
| Pin to a specific version | `JOE_IMAGE=ghcr.io/<owner>/jobless-joe:v1.0.0 ./joe.sh` |
| Pull the bleeding-edge build | `JOE_IMAGE=ghcr.io/<owner>/jobless-joe:edge ./joe.sh` |

---

## Authenticating to a private GHCR image

If you keep your package private, end users need a Personal Access Token (PAT) with `read:packages` scope:

```bash
# Create a PAT at: https://github.com/settings/tokens (classic, read:packages scope)
echo "<your-pat>" | docker login ghcr.io -u <your-username> --password-stdin
./joe.sh
```

The login persists in `~/.docker/config.json` and applies to all future pulls.

---

## Troubleshooting

### "Image not found" when running `./joe.sh`

Either the image hasn't been published yet, or the visibility is private. Either:
- Run `./joe.sh --build` to build locally instead of pulling, OR
- Publish the image (see above) and ensure visibility is set to Public

### Smoke test fails with "Container did not become healthy within 60s"

The container started but never passed its healthcheck. Check the Actions step summary — the workflow dumps the container's logs on failure.

Common causes:
- Prisma client wasn't generated correctly during the build (check the `build-and-push` step)
- Missing required env var (the smoke test sets `DATABASE_URL` and `AI_BACKEND`, but if you add new required envs, update the smoke test job)
- App crashes on boot due to a code regression

### Cosign signing fails with "no valid identities found"

GitHub Actions OIDC token wasn't issued. Make sure your workflow has:
```yaml
permissions:
  id-token: write
```

This is already set in the workflow, but if you fork + edit, don't remove it.

### Cosign verification fails locally with "no matching signatures"

You might be verifying against the wrong GitHub identity. Make sure the `--certificate-identity-regexp` matches your repo. For a fork at `alice/jobless-joe`:

```bash
cosign verify \
  --certificate-identity-regexp='https://github.com/alice/jobless-joe/.+' \
  --certificate-oidc-issuer='https://token.actions.githubusercontent.com' \
  ghcr.io/alice/jobless-joe:latest
```

### Workflow fails with "denied: installation not allowed to Create organization package"

GHCR has stricter rules for organization-owned packages on first publish. To fix:
1. Go to the org's **Settings** → **Actions** → **General** → **Workflow permissions**
2. Set to **"Read and write permissions"**
3. Re-run the workflow

### Build succeeds but image is empty / crashes immediately

Common cause: the build succeeded but `next build` failed silently inside the multi-stage build. Check the workflow logs for the `Build and push` step.

Quick local repro:
```bash
docker build -t jobless-joe-test .
docker run --rm -p 3000:3000 jobless-joe-test
curl http://localhost:3000/
```

### Multi-arch build fails with "executor failed"

This usually means a platform-specific build is failing (often arm64). To debug:
- Run the workflow with only one platform: edit `.github/workflows/docker-publish.yml` and change `platforms: linux/amd64,linux/arm64` to just `linux/amd64`
- Once amd64 works, re-enable arm64

---

## Repository file structure (reference)

```
.github/
├── workflows/
│   └── docker-publish.yml    # 4-job pipeline: build → smoke-test → sign → release
└── dependabot.yml            # Auto-update base images + actions
docs/
└── PUBLISHING.md            # This file
install.sh                   # curl | bash one-command installer
docker/
├── README.md                # End-user docs
└── scripts/
    ├── start.sh              # Pulls by default; --build for local build
    └── ...
.env.docker.example           # Documents JOE_IMAGE variable
docker-compose.yml            # image: ${JOE_IMAGE:-ghcr.io/jobless-joe/jobless-joe:latest}
```

---

## TL;DR for first-time publishers

```bash
# 1. Push code to GitHub
git push origin main

# 2. Tag a release
git tag v1.0.0
git push origin v1.0.0

# 3. Watch the pipeline run (~15-20 min)
#    https://github.com/<you>/jobless-joe/actions
#    All 4 jobs should turn green:
#      build-and-push  ✓  (~12 min, multi-arch)
#      smoke-test      ✓  (~30 sec)
#      sign            ✓  (~10 sec, cosign)
#      release         ✓  (~5 sec, GitHub Release created)

# 4. Make the package public (optional but recommended)
#    github.com/users/<you>/packages/container/jobless-joe/settings → Change visibility → Public

# 5. Test the one-command installer
curl -fsSL https://github.com/<you>/jobless-joe/raw/main/install.sh | bash

# 6. Tell your users to run:
curl -fsSL https://github.com/<you>/jobless-joe/raw/main/install.sh | bash
# Joe's crooner voice is singing within 30 seconds.
```

---

## What about Docker Hub?

If you prefer Docker Hub over GHCR:

1. Create a Docker Hub account + repository (e.g. `yourname/jobless-joe`)
2. Add two secrets to your GitHub repo: `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN`
3. Edit `.github/workflows/docker-publish.yml`:
   - Replace `REGISTRY: ghcr.io` with `REGISTRY: docker.io`
   - Replace `IMAGE_NAME: ghcr.io/...` with `IMAGE_NAME: docker.io/yourname/jobless-joe`
   - Replace the GHCR login step with:
     ```yaml
     - name: Log in to Docker Hub
       uses: docker/login-action@v3
       with:
         username: ${{ secrets.DOCKERHUB_USERNAME }}
         password: ${{ secrets.DOCKERHUB_TOKEN }}
     ```
4. Update `docker-compose.yml` to use `docker.io/yourname/jobless-joe:latest` as the default image.
5. Update `install.sh` to use `docker.io/yourname/jobless-joe` for the cosign verify step.

The rest of the pipeline (multi-arch, smoke test, cosign, release) works identically.

---

## One-time setup

### Step 1 — Create a GitHub repo

If you haven't already, create a new GitHub repository and push your Jobless Joe code to it:

```bash
git init
git add .
git commit -m "Initial commit: Jobless Joe Crooner Song Engine"
git branch -M main
git remote add origin https://github.com/<your-username>/jobless-joe.git
git push -u origin main
```

### Step 2 — Verify the workflow file exists

The workflow file is at `.github/workflows/docker-publish.yml`. It will run automatically when you push a `v*` tag (e.g. `v1.0.0`). You don't need to configure anything else — GitHub Container Registry uses the automatic `GITHUB_TOKEN` for authentication.

### Step 3 — Trigger the first build

You have two ways to trigger the workflow:

**Option A — Manual (recommended for first run):**
1. Go to your repo on GitHub → **Actions** tab
2. Select **"Publish Docker Image"** in the left sidebar
3. Click **"Run workflow"** → **"Run workflow"** (leave `ref` empty)
4. Wait ~10–15 minutes for the multi-arch build to complete
5. The image will be tagged as `:edge`

**Option B — Tag a release:**
```bash
git tag v1.0.0
git push origin v1.0.0
```
This triggers the workflow automatically. The image will be tagged as both `:latest` and `:v1.0.0`.

### Step 4 — Make the package public (optional but recommended)

By default, GHCR packages are private. To allow anonymous pulls (so end users don't need to authenticate):

1. Go to your profile page on GitHub → **Packages** tab
2. Click on the `jobless-joe` package
3. **Package settings** → scroll to **Danger Zone** → **Change visibility** → **Public**

Once public, anyone can pull without authentication:

```bash
docker pull ghcr.io/<your-username>/jobless-joe:latest
```

---

## Image tag strategy

The workflow produces these tags based on trigger:

| Trigger | Tags pushed |
|---|---|
| Tag push (`v1.0.0`) | `:latest`, `:v1.0.0` |
| Push to `main` branch | `:edge` |
| Pull request | (none — smoke test only, no push) |
| Manual workflow dispatch | `:edge` |

Best practices:
- **`:latest`** — what end users get by default. Should always point at the most recent stable tag.
- **`:v1.0.0`** — pinned version, useful for reproducible deployments.
- **`:edge`** — bleeding-edge, built on every push to `main`. Don't use in production.

---

## Multi-arch support

The workflow builds for **both** `linux/amd64` and `linux/arm64`:

| Architecture | What it covers |
|---|---|
| `linux/amd64` | Intel Macs, Windows Docker Desktop, most cloud VMs (AWS EC2, GCP, Azure), Linux x86 |
| `linux/arm64` | Apple Silicon Macs (M1/M2/M3/M4), AWS Graviton instances, Raspberry Pi 4/5 |

Docker automatically pulls the right architecture for the host platform — users don't need to specify anything.

---

## Caching

The workflow uses GHCR's build cache (`type=registry,ref=...:buildcache`). Subsequent builds reuse cached layers, cutting build time from ~15 minutes (cold) to ~3 minutes (warm).

---

## Pointing end users at your published image

Once you've published, end users have two options:

### Option 1 — Use the default image (if you own `jobless-joe` on GHCR)

If you've claimed the `jobless-joe` namespace, no changes needed — `docker-compose.yml` already points at:

```yaml
image: ${JOE_IMAGE:-ghcr.io/jobless-joe/jobless-joe:latest}
```

End users just run `./joe.sh` and it pulls automatically.

### Option 2 — Use a forked image

If you forked the repo and published under your own username, tell end users to set `JOE_IMAGE` in their `.env.docker`:

```bash
JOE_IMAGE=ghcr.io/<your-username>/jobless-joe:latest
```

Or override at runtime:

```bash
JOE_IMAGE=ghcr.io/your-username/jobless-joe:latest ./joe.sh
```

### Option 3 — Pin to a specific version

For reproducible deployments, pin to a tag:

```bash
JOE_IMAGE=ghcr.io/jobless-joe/jobless-joe:v1.2.3 ./joe.sh
```

---

## Overriding the image source

| Want to... | Command |
|---|---|
| Use the prebuilt image (default, fastest) | `./joe.sh` |
| Force a local build (development) | `./joe.sh --build` |
| Use a forked image | `JOE_IMAGE=ghcr.io/<user>/jobless-joe:latest ./joe.sh` |
| Pin to a specific version | `JOE_IMAGE=ghcr.io/jobless-joe/jobless-joe:v1.0.0 ./joe.sh` |
| Pull the bleeding-edge build | `JOE_IMAGE=ghcr.io/jobless-joe/jobless-joe:edge ./joe.sh` |

---

## Authenticating to a private GHCR image

If you keep your package private, end users need a Personal Access Token (PAT) with `read:packages` scope:

```bash
# Create a PAT at: https://github.com/settings/tokens (classic, read:packages scope)
echo "<your-pat>" | docker login ghcr.io -u <your-username> --password-stdin
./joe.sh
```

The login persists in `~/.docker/config.json` and applies to all future pulls.

---

## Troubleshooting

### "Image not found" when running `./joe.sh`

Either the image hasn't been published yet, or the visibility is private. Either:
- Run `./joe.sh --build` to build locally instead of pulling, OR
- Publish the image (see above) and ensure visibility is set to Public

### Workflow fails with "denied: installation not allowed to Create organization package"

GHCR has stricter rules for organization-owned packages on first publish. To fix:
1. Go to the org's **Settings** → **Actions** → **General** → **Workflow permissions**
2. Set to **"Read and write permissions"**
3. Re-run the workflow

### Workflow fails with "no space left on device"

GitHub Actions runners have a 14GB disk. If your build context is too big (rare — the .dockerignore should prevent it), check:

```bash
# What's in the build context?
docker build --no-cache --progress=plain . 2>&1 | grep "transferring context"
```

### Build succeeds but image is empty / crashes immediately

Common cause: the build succeeded but `next build` failed silently inside the multi-stage build. Check the workflow logs for the `Build and push` step.

Quick local repro:
```bash
docker build -t jobless-joe-test .
docker run --rm -p 3000:3000 jobless-joe-test
curl http://localhost:3000/
```

### Multi-arch build fails with "executor failed"

This usually means a platform-specific build is failing (often arm64). To debug:
- Run the workflow with only one platform: edit `.github/workflows/docker-publish.yml` and change `platforms: linux/amd64,linux/arm64` to just `linux/amd64`
- Once amd64 works, re-enable arm64

---

## Repository file structure (reference)

```
.github/
├── workflows/
│   └── docker-publish.yml    # Multi-arch build + push to GHCR
└── dependabot.yml            # Auto-update base images + actions
docker/
├── README.md                 # End-user docs (also covers prebuilt image)
└── scripts/
    ├── start.sh              # Pulls by default; --build for local build
    └── ...
.env.docker.example           # Documents JOE_IMAGE variable
docker-compose.yml            # image: ${JOE_IMAGE:-ghcr.io/jobless-joe/jobless-joe:latest}
```

---

## TL;DR for first-time publishers

```bash
# 1. Push code to GitHub
git push origin main

# 2. Tag a release
git tag v1.0.0
git push origin v1.0.0

# 3. Wait for the Actions workflow to finish (~15 min)
#    Watch at: https://github.com/<you>/jobless-joe/actions

# 4. Make the package public (optional but recommended)
#    github.com/users/<you>/packages/container/jobless-joe/settings → Change visibility → Public

# 5. Test the prebuilt image locally
docker pull ghcr.io/<you>/jobless-joe:latest
docker run --rm -p 3000:3000 ghcr.io/<you>/jobless-joe:latest

# 6. Tell your users to run:
./joe.sh
# (or, if you used a different image name:)
JOE_IMAGE=ghcr.io/<you>/jobless-joe:latest ./joe.sh
```

That's it. End users now get a 5-second first-run instead of a 5-minute build.

---

## What about Docker Hub?

If you prefer Docker Hub over GHCR:

1. Create a Docker Hub account + repository (e.g. `yourname/jobless-joe`)
2. Add two secrets to your GitHub repo: `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN`
3. Edit `.github/workflows/docker-publish.yml`:
   - Replace `REGISTRY: ghcr.io` with `REGISTRY: docker.io`
   - Replace `IMAGE_NAME: ghcr.io/...` with `IMAGE_NAME: docker.io/yourname/jobless-joe`
   - Replace the GHCR login step with:
     ```yaml
     - name: Log in to Docker Hub
       uses: docker/login-action@v3
       with:
         username: ${{ secrets.DOCKERHUB_USERNAME }}
         password: ${{ secrets.DOCKERHUB_TOKEN }}
     ```
4. Update `docker-compose.yml` to use `docker.io/yourname/jobless-joe:latest` as the default image.

The rest of the workflow (multi-arch, caching, tagging) works identically.
