#!/usr/bin/env bash
# Runs the browser tests end to end: database, Supabase stand-in, app, Playwright.
#
# Requirements: a local PostgreSQL reachable as $PGUSER/$PGPASSWORD, and the
# Chromium that Playwright installs (or PLAYWRIGHT_BROWSERS_PATH set).
set -euo pipefail
cd "$(dirname "$0")/../.."

export PGHOST=${PGHOST:-127.0.0.1}
export PGPORT=${PGPORT:-5432}
export PGUSER=${PGUSER:-postgres}
export PGPASSWORD=${PGPASSWORD:-postgres}
export FAKE_SUPABASE_DB=${FAKE_SUPABASE_DB:-sonora_e2e}
export FAKE_SUPABASE_PORT=${FAKE_SUPABASE_PORT:-54321}
export FAKE_SUPABASE_STORAGE=${FAKE_SUPABASE_STORAGE:-/tmp/sonora-storage}
PORT=${E2E_PORT:-3100}

cleanup() {
  [ -n "${FAKE_PID:-}" ] && kill "$FAKE_PID" 2>/dev/null || true
  [ -n "${APP_PID:-}" ] && kill "$APP_PID" 2>/dev/null || true
}
trap cleanup EXIT

echo "→ preparing the test database"
bash test/e2e/setup-db.sh
node test/e2e/make-fixture.mjs

echo "→ starting the Supabase stand-in"
node test/fake-supabase/server.mjs & FAKE_PID=$!

echo "→ building the app"
cat > .env.e2e.local <<EOF
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:${FAKE_SUPABASE_PORT}
NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-key-for-tests
SUPABASE_SERVICE_ROLE_KEY=service-key-for-tests
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:${PORT}
LISTENER_SALT=test-salt
EOF
cp .env.e2e.local .env.local
npm run build

echo "→ starting the app on :${PORT}"
npx next start -p "$PORT" & APP_PID=$!
until curl -sf "http://127.0.0.1:${PORT}/" > /dev/null; do sleep 0.5; done

echo "→ running the browser tests"
E2E_BASE_URL="http://127.0.0.1:${PORT}" npx playwright test "$@"
