#!/usr/bin/env bash
# setup.sh — First-time setup for the Scenario Planning App
#
# Usage:
#   ./setup.sh                        # interactive setup
#   ./setup.sh --reset                # wipe .env and re-run setup
#   ADMIN_USER=admin ADMIN_PASS=secret ./setup.sh   # non-interactive (CI)
#
# What this script does:
#   1. Checks prerequisites (Docker, Docker Compose v2)
#   2. Creates .env from .env.example with auto-generated secrets
#   3. Starts all services with docker compose
#   4. Waits for the backend to become healthy
#   5. Creates the initial facilitator account
#   6. Prints login credentials and useful next steps

set -euo pipefail

# ─── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${GREEN}[setup]${RESET} $*"; }
warn()    { echo -e "${YELLOW}[warn]${RESET}  $*"; }
error()   { echo -e "${RED}[error]${RESET} $*" >&2; }
die()     { error "$*"; exit 1; }
divider() { echo -e "${BOLD}──────────────────────────────────────────${RESET}"; }

# ─── Locate repo root ─────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ─── Parse flags ──────────────────────────────────────────────────────────────
RESET_ENV=false
for arg in "$@"; do
  [[ "$arg" == "--reset" ]] && RESET_ENV=true
done

divider
echo -e "${BOLD}  Scenario Planning App — Setup${RESET}"
divider

# ─── 1. Prerequisite checks ───────────────────────────────────────────────────
info "Checking prerequisites..."

if ! command -v docker &>/dev/null; then
  die "Docker not found. Install it from https://docs.docker.com/get-docker/ and re-run."
fi

# Require Docker Compose v2 (the 'docker compose' subcommand)
if ! docker compose version &>/dev/null; then
  die "Docker Compose v2 not found. Update Docker Desktop or install the compose plugin: https://docs.docker.com/compose/install/"
fi

DOCKER_COMPOSE_VERSION=$(docker compose version --short 2>/dev/null || echo "unknown")
info "Docker:          $(docker --version | head -1)"
info "Docker Compose:  v${DOCKER_COMPOSE_VERSION}"

# Warn if required ports are already occupied
for port in 3000 5000 5432 6379; do
  if lsof -iTCP:"$port" -sTCP:LISTEN -P -n &>/dev/null 2>&1; then
    warn "Port ${port} is already in use. Stop the conflicting process or edit docker-compose.yml to use a different port."
  fi
done

# ─── 2. Environment file ──────────────────────────────────────────────────────
if [[ -f .env ]] && [[ "$RESET_ENV" == "false" ]]; then
  warn ".env already exists — skipping generation."
  warn "To regenerate secrets, run:  ./setup.sh --reset"
else
  [[ "$RESET_ENV" == "true" ]] && warn "Resetting .env (--reset flag)..."
  [[ ! -f .env.example ]] && die ".env.example not found. Are you in the repo root?"

  info "Generating .env with auto-created secrets..."

  # Generate secrets
  if command -v openssl &>/dev/null; then
    JWT_SECRET_VAL=$(openssl rand -hex 64)
    DB_PASS_VAL=$(openssl rand -hex 16)
  else
    # Fallback: Python (available on virtually every system)
    JWT_SECRET_VAL=$(python3 -c "import secrets; print(secrets.token_hex(64))" 2>/dev/null \
      || python -c "import os,binascii; print(binascii.hexlify(os.urandom(64)).decode())" 2>/dev/null \
      || die "openssl and python are both unavailable — cannot generate secrets.")
    DB_PASS_VAL=$(python3 -c "import secrets; print(secrets.token_hex(16))" 2>/dev/null \
      || python -c "import os,binascii; print(binascii.hexlify(os.urandom(16)).decode())")
  fi

  cp .env.example .env

  # Inject generated values (portable sed: works on Linux and macOS)
  sed -i.bak \
    -e "s|changeme_use_a_strong_password|${DB_PASS_VAL}|g" \
    -e "s|changeme_generate_with_openssl_rand_hex_64|${JWT_SECRET_VAL}|" \
    .env && rm -f .env.bak

  info ".env created with generated secrets."
fi

# ─── 3. Start services ────────────────────────────────────────────────────────
info "Building and starting services (this may take a few minutes on first run)..."
docker compose up -d --build

# ─── 4. Wait for backend health ───────────────────────────────────────────────
info "Waiting for backend to become healthy..."
HEALTH_URL="http://localhost:5000/api/health"
MAX_WAIT=120
ELAPSED=0
INTERVAL=5

until curl -sf "$HEALTH_URL" &>/dev/null; do
  if (( ELAPSED >= MAX_WAIT )); then
    error "Backend did not become healthy within ${MAX_WAIT}s."
    echo ""
    echo "Troubleshooting:"
    echo "  docker compose logs backend"
    echo "  docker compose ps"
    exit 1
  fi
  sleep "$INTERVAL"
  ELAPSED=$(( ELAPSED + INTERVAL ))
  info "  Still waiting... (${ELAPSED}s / ${MAX_WAIT}s)"
done

info "Backend is healthy."

# ─── 5. Create initial facilitator account ────────────────────────────────────
# Accept env vars for non-interactive / CI usage
ADMIN_USER="${ADMIN_USER:-}"
ADMIN_PASS="${ADMIN_PASS:-}"

# Interactive prompts only when running in a TTY and vars not pre-set
if [[ -t 0 ]]; then
  if [[ -z "$ADMIN_USER" ]]; then
    echo ""
    read -rp "$(echo -e "${BOLD}Admin username${RESET} [admin]: ")" ADMIN_USER
    ADMIN_USER="${ADMIN_USER:-admin}"
  fi
  if [[ -z "$ADMIN_PASS" ]]; then
    read -rsp "$(echo -e "${BOLD}Admin password${RESET} [leave blank to generate]: ")" ADMIN_PASS
    echo ""
    if [[ -z "$ADMIN_PASS" ]]; then
      ADMIN_PASS=$(openssl rand -base64 12 2>/dev/null \
        || python3 -c "import secrets,string; print(secrets.token_urlsafe(12))" 2>/dev/null \
        || echo "Admin$(openssl rand -hex 4)!")
      GENERATED_PASS=true
    fi
  fi
else
  # Non-interactive: fall back to defaults
  ADMIN_USER="${ADMIN_USER:-admin}"
  if [[ -z "$ADMIN_PASS" ]]; then
    ADMIN_PASS=$(openssl rand -base64 12 2>/dev/null || echo "Admin$(date +%s)!")
    GENERATED_PASS=true
  fi
fi

GENERATED_PASS="${GENERATED_PASS:-false}"

REGISTER_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:5000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"${ADMIN_USER}\",\"password\":\"${ADMIN_PASS}\",\"role\":\"facilitator\"}")

HTTP_CODE=$(echo "$REGISTER_RESPONSE" | tail -1)
BODY=$(echo "$REGISTER_RESPONSE" | head -1)

if [[ "$HTTP_CODE" == "201" ]]; then
  info "Facilitator account '${ADMIN_USER}' created."
elif [[ "$HTTP_CODE" == "409" ]]; then
  warn "User '${ADMIN_USER}' already exists — skipping account creation."
else
  warn "Could not create admin account (HTTP ${HTTP_CODE}): ${BODY}"
  warn "You can create one manually:"
  warn "  curl -X POST http://localhost:5000/api/auth/register \\"
  warn "    -H 'Content-Type: application/json' \\"
  warn "    -d '{\"username\":\"admin\",\"password\":\"yourpass\",\"role\":\"facilitator\"}'"
fi

# ─── 6. Success banner ────────────────────────────────────────────────────────
echo ""
divider
echo -e "${GREEN}${BOLD}  Setup complete!${RESET}"
divider
echo ""
echo -e "  ${BOLD}App URL:${RESET}   http://localhost:3000"
echo -e "  ${BOLD}Username:${RESET}  ${ADMIN_USER}"
if [[ "$GENERATED_PASS" == "true" ]]; then
echo -e "  ${BOLD}Password:${RESET}  ${ADMIN_PASS}  ${YELLOW}(save this — it won't be shown again)${RESET}"
else
echo -e "  ${BOLD}Password:${RESET}  (as entered)"
fi
echo ""
echo -e "  ${BOLD}API health:${RESET}  http://localhost:5000/api/health"
echo ""
echo -e "${BOLD}Common commands:${RESET}"
echo "  make logs    — tail service logs"
echo "  make status  — check service health"
echo "  make down    — stop all services"
echo "  make reset   — wipe data and start fresh"
echo ""
divider
