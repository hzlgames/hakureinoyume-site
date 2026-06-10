#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_NAME="${SERVICE_NAME:-hakureinoyume-site.service}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/}"
HEALTH_RETRIES="${HEALTH_RETRIES:-20}"
HEALTH_DELAY_SECONDS="${HEALTH_DELAY_SECONDS:-1}"

cd "$ROOT_DIR"

log() {
  printf '[deploy] %s\n' "$*"
}

run_systemctl() {
  if [[ "$(id -u)" -eq 0 ]]; then
    systemctl "$@"
  else
    sudo systemctl "$@"
  fi
}

log "Installing dependencies with npm ci"
npm ci

if [[ "${SKIP_LINT:-0}" != "1" ]]; then
  log "Running lint"
  npm run lint
fi

if [[ "${SKIP_MIGRATE:-0}" != "1" ]]; then
  log "Applying Prisma migrations"
  npx prisma migrate deploy
fi

log "Building Next.js app"
npm run build

if [[ "${SKIP_RESTART:-0}" != "1" ]]; then
  log "Restarting ${SERVICE_NAME}"
  run_systemctl restart "$SERVICE_NAME"
fi

if [[ "${SKIP_HEALTHCHECK:-0}" != "1" ]]; then
  log "Checking ${HEALTH_URL}"
  for attempt in $(seq 1 "$HEALTH_RETRIES"); do
    if curl -fsS --max-time 5 "$HEALTH_URL" >/dev/null; then
      log "Health check passed"
      exit 0
    fi

    log "Health check attempt ${attempt}/${HEALTH_RETRIES} failed"
    sleep "$HEALTH_DELAY_SECONDS"
  done

  log "Health check failed; showing recent service logs"
  run_systemctl status "$SERVICE_NAME" --no-pager || true
  journalctl -u "$SERVICE_NAME" -n 80 --no-pager || true
  exit 1
fi

log "Deploy completed"
