# Publishing the Docker Image

> How to publish Jobless Joe's prebuilt image to GitHub Container Registry (GHCR) so end users get a 5-second first-run instead of a 5-minute build.

---

## Why publish?

| | With prebuilt image | With local build |
|---|---|---|
| First-run time | ~5 seconds | ~3–5 minutes |
| Requires Bun + Node build deps | No | Yes |
| Requires internet during build | No (only during pull) | Yes (npm registry + GHCR) |
| Works on low-RAM machines | Yes | No (Next.js build needs ~1GB) |

If you're distributing Jobless Joe to non-developers, publishing is essential. If you're just using it yourself, the local build (`./joe.sh --build`) works fine.

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
