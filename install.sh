#!/usr/bin/env bash
# =============================================================================
# Jobless Joe — One-command installer (curl | bash friendly)
# =============================================================================
#
# USAGE
# -----
#   curl -fsSL https://github.com/<owner>/jobless-joe/raw/main/install.sh | bash
#
# Or, to install a specific version:
#   curl -fsSL .../install.sh | bash -s -- --version v1.2.0
#
# Or, to install but skip the auto-start:
#   curl -fsSL .../install.sh | bash -s -- --no-start
#
# WHAT IT DOES
# ------------
#   1. Detects the host OS (macOS / Linux / WSL2 on Windows)
#   2. Checks for Docker + Docker Compose v2
#      → If missing, prints OS-specific install instructions
#        and tries to install automatically (Linux only — requires sudo)
#   3. Optionally verifies the published image signature with cosign
#      (if cosign is installed)
#   4. Clones the Jobless Joe repo to ~/jobless-joe (or updates if exists)
#   5. Runs ./joe.sh to start the app
#   6. Opens the browser
#
# FLAGS
# -----
#   --version <tag>   Install a specific git tag (default: main)
#   --no-start        Clone + configure but don't start the containers
#   --no-verify      Skip cosign signature verification (default: try to verify)
#   --dir <path>     Install directory (default: ~/jobless-joe)
#   --help           Show this help
#
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# Colors
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
# Defaults + flag parsing
# -----------------------------------------------------------------------------
REPO_URL_DEFAULT="https://github.com/jobless-joe/jobless-joe.git"
INSTALL_DIR_DEFAULT="$HOME/jobless-joe"
VERSION="main"
START_AFTER_INSTALL=true
VERIFY_SIGNATURE=true

while [[ $# -gt 0 ]]; do
    case "$1" in
        --version)    VERSION="$2"; shift 2 ;;
        --no-start)   START_AFTER_INSTALL=false; shift ;;
        --no-verify)  VERIFY_SIGNATURE=false; shift ;;
        --dir)        INSTALL_DIR_DEFAULT="$2"; shift 2 ;;
        --help|-h)
            sed -n '2,/^# =\+/p' "$0" | sed 's/^# \?//' | head -50
            exit 0
            ;;
        *) fatal "Unknown flag: $1 (use --help for options)" ;;
    esac
done

INSTALL_DIR="$INSTALL_DIR_DEFAULT"
REPO_URL="${REPO_URL:-$REPO_URL_DEFAULT}"

# Allow overriding via env vars
REPO_URL="${JOBLESS_JOE_REPO:-$REPO_URL}"

# -----------------------------------------------------------------------------
# Banner
# -----------------------------------------------------------------------------
echo ""
echo "🎙️  Jobless Joe — The Crooner Song Engine"
echo "   One-command installer"
echo ""

# -----------------------------------------------------------------------------
# Step 1: Detect OS
# -----------------------------------------------------------------------------
step "Detecting OS..."

OS_TYPE=""
OS_ARCH="$(uname -m)"
case "$(uname -s)" in
    Darwin)
        OS_TYPE="macos"
        info "macOS detected (arch: $OS_ARCH)"
        ;;
    Linux)
        if grep -qi microsoft /proc/version 2>/dev/null; then
            OS_TYPE="wsl"
            info "WSL2 (Windows Subsystem for Linux) detected (arch: $OS_ARCH)"
        else
            OS_TYPE="linux"
            # Try to detect the distro for tailored install instructions.
            if [[ -f /etc/os-release ]]; then
                # shellcheck disable=SC1091
                . /etc/os-release
                info "Linux detected: ${PRETTY_NAME:-unknown} (arch: $OS_ARCH)"
            else
                info "Linux detected (arch: $OS_ARCH)"
            fi
        fi
        ;;
    MINGW*|MSYS*|CYGWIN*)
        OS_TYPE="windows-git-bash"
        warn "Git Bash / MSYS detected. Native Windows Docker Desktop is recommended."
        ;;
    *)
        fatal "Unsupported OS: $(uname -s).

This installer supports macOS, Linux, and WSL2.
On native Windows, use Docker Desktop + WSL2 backend, then run this script from WSL."
        ;;
esac

# -----------------------------------------------------------------------------
# Step 2: Check Docker + Compose v2
# -----------------------------------------------------------------------------
step "Checking Docker..."

if ! command -v docker >/dev/null 2>&1; then
    warn "Docker is not installed."
    case "$OS_TYPE" in
        macos)
            echo ""
            echo "Install Docker Desktop for macOS:"
            echo "  1. Download: https://docs.docker.com/desktop/install/mac-install/"
            echo "     (Apple Silicon: click 'Mac with Apple chip' — Intel Mac: 'Mac with Intel chip')"
            echo "  2. Open Docker Desktop and complete the setup wizard"
            echo "  3. Re-run this installer:"
            echo "     curl -fsSL https://github.com/jobless-joe/jobless-joe/raw/main/install.sh | bash"
            echo ""
            # Brew install as a shortcut for users who have Homebrew.
            if command -v brew >/dev/null 2>&1; then
                read -r -p "Install via Homebrew now? [y/N] " response
                if [[ "$response" =~ ^[Yy]$ ]]; then
                    brew install --cask docker
                    info "Docker Desktop installed via Homebrew. Open it once to complete setup, then re-run this script."
                fi
            fi
            exit 1
            ;;
        linux|wsl)
            echo ""
            echo "Installing Docker Engine..."
            # Try the official convenience script. Requires sudo.
            if command -v curl >/dev/null 2>&1; then
                read -r -p "Install Docker via get.docker.com? [y/N] " response
                if [[ "$response" =~ ^[Yy]$ ]]; then
                    curl -fsSL https://get.docker.com | sudo sh
                    sudo systemctl enable --now docker
                    sudo usermod -aG docker "$USER"
                    info "Docker installed. You may need to log out + back in for the docker group to take effect."
                    warn "After logging back in, re-run this installer."
                    exit 0
                fi
            fi
            echo "Or install manually: https://docs.docker.com/engine/install/"
            exit 1
            ;;
        windows-git-bash)
            echo "Install Docker Desktop for Windows: https://docs.docker.com/desktop/install/windows-install/"
            echo "Then re-run this installer from WSL2 (recommended) or Git Bash."
            exit 1
            ;;
    esac
fi

if ! docker info >/dev/null 2>&1; then
    case "$OS_TYPE" in
        macos) fatal "Docker daemon is not running. Open Docker Desktop and wait for the whale icon to stop animating, then re-run this installer." ;;
        *)     fatal "Docker daemon is not running. Start it with: sudo systemctl start docker  (Linux) or open Docker Desktop (WSL2)" ;;
    esac
fi

if ! docker compose version >/dev/null 2>&1; then
    fatal "Docker Compose v2 is not available.

Modern Docker Desktop includes Compose v2. On Linux, install:
  sudo apt-get install docker-compose-plugin
  (or equivalent for your distro: https://docs.docker.com/compose/install/linux/)"
fi

info "Docker + Compose v2 detected: $(docker --version | head -1)"
info "Architecture: $OS_ARCH"

# -----------------------------------------------------------------------------
# Step 3: Optional cosign verification
# -----------------------------------------------------------------------------
if [[ "$VERIFY_SIGNATURE" == true ]]; then
    step "Checking for cosign (optional image signature verification)..."

    if ! command -v cosign >/dev/null 2>&1; then
        warn "cosign is not installed. Skipping image signature verification.
        (This is optional — the image will still work, you just won't be able to
        cryptographically verify it was published by the official source.)

        To install cosign: https://docs.sigstore.dev/cosign/installation/
        Then re-run this installer with no extra flags."
    else
        info "cosign detected. Will verify the image signature before running."
        VERIFY_SIGNATURE=true
    fi
fi

# -----------------------------------------------------------------------------
# Step 4: Clone or update the repo
# -----------------------------------------------------------------------------
step "Cloning Jobless Joe to $INSTALL_DIR..."

if [[ -d "$INSTALL_DIR/.git" ]]; then
    info "Repo already exists at $INSTALL_DIR. Updating..."
    git -C "$INSTALL_DIR" fetch --all --tags
    git -C "$INSTALL_DIR" checkout "$VERSION"
    git -C "$INSTALL_DIR" pull origin "$VERSION" 2>/dev/null || \
        git -C "$INSTALL_DIR" pull 2>/dev/null || \
        warn "Couldn't pull latest. Continuing with checked-out version."
else
    if ! command -v git >/dev/null 2>&1; then
        fatal "git is not installed. Install it first:
  macOS:  xcode-select --install
  Linux:  sudo apt-get install git  (or your distro's package manager)"
    fi
    git clone --branch "$VERSION" "$REPO_URL" "$INSTALL_DIR"
fi

info "Repo ready at $INSTALL_DIR (version: $VERSION)"

cd "$INSTALL_DIR"

# -----------------------------------------------------------------------------
# Step 5: Verify the image signature (if cosign is available)
# -----------------------------------------------------------------------------
if [[ "$VERIFY_SIGNATURE" == true ]] && command -v cosign >/dev/null 2>&1; then
    step "Verifying published image signature..."

    # Try to determine the GitHub repo from the remote URL so we can verify
    # against the correct identity. Falls back to a sensible default.
    REMOTE_URL=$(git config --get remote.origin.url 2>/dev/null || echo "")
    REPO_PATH=$(echo "$REMOTE_URL" | sed -E 's#(git@github.com:|https://github.com/|http://github.com/)(.+)#\2#' | sed 's/\.git$//')

    if [[ -z "$REPO_PATH" ]]; then
        REPO_PATH="jobless-joe/jobless-joe"
        warn "Couldn't determine GitHub repo path. Verifying against: $REPO_PATH"
    fi

    IMAGE="ghcr.io/${REPO_PATH}/jobless-joe:latest"
    info "Verifying: $IMAGE"

    if cosign verify \
        --certificate-identity-regexp="https://github.com/${REPO_PATH}/.+" \
        --certificate-oidc-issuer="https://token.actions.githubusercontent.com" \
        "$IMAGE" 2>&1; then
        info "Image signature verified ✓
        (Signature is recorded in rekor.sigstore.dev transparency log)"
    else
        warn "Image signature verification failed.
        Possible causes:
          - Image is not yet published for this version (try: ./joe.sh --build)
          - Image was published by a different GitHub repo
          - cosign version mismatch

        Continuing anyway — the image will still work.
        To force verification to succeed, install with --no-verify to skip this check,
        or run ./joe.sh --build to build locally."
    fi
fi

# -----------------------------------------------------------------------------
# Step 6: Start the app
# -----------------------------------------------------------------------------
if [[ "$START_AFTER_INSTALL" == true ]]; then
    step "Starting Jobless Joe..."
    echo ""
    # Hand off to the repo's own start.sh — it knows how to detect Ace 1.5,
    # build vs pull, wait for health, etc.
    if [[ -f "./joe.sh" ]]; then
        # Pass --no-open if the user piped us through bash (TTY detection)
        if [[ ! -t 1 ]]; then
            # shellcheck disable=SC1091
            ./joe.sh --no-open
        else
            # shellcheck disable=SC1091
            ./joe.sh
        fi
    else
        warn "joe.sh not found at $INSTALL_DIR/joe.sh"
        warn "Try starting manually: cd $INSTALL_DIR && ./docker/scripts/start.sh"
    fi
else
    info "Skipping start (--no-start flag)."
    echo ""
    echo "To start Jobless Joe later:"
    echo "  cd $INSTALL_DIR"
    echo "  ./joe.sh"
fi

echo ""
info "Install complete."
echo ""
echo "  Location: $INSTALL_DIR"
echo "  Repo:     $REPO_URL"
echo "  Version:  $VERSION"
echo ""
echo "Useful commands (run from $INSTALL_DIR):"
echo "  ./joe.sh                       # start (pulls prebuilt image)"
echo "  ./joe.sh --build               # build locally instead of pulling"
echo "  ./joe.sh --local                # also start Ollama for Ace 1.5"
echo "  ./docker/scripts/stop.sh        # stop containers"
echo "  ./docker/scripts/stop.sh --volumes  # wipe all data"
echo ""
