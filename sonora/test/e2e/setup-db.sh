#!/usr/bin/env bash
# Rebuilds the throwaway database used by the end-to-end tests.
set -euo pipefail
DB=${FAKE_SUPABASE_DB:-sonora_e2e}
PSQL="psql -v ON_ERROR_STOP=1 -q"
export PGOPTIONS="-c client_min_messages=warning"

$PSQL -c "drop database if exists $DB;" -c "create database $DB;" postgres
$PSQL -f supabase/tests/_shim.sql "$DB"
for f in supabase/migrations/*.sql; do $PSQL -f "$f" "$DB"; done
$PSQL -c "create table if not exists auth.stub_passwords (user_id uuid primary key references auth.users(id) on delete cascade, hash text not null);" "$DB"
rm -rf "${FAKE_SUPABASE_STORAGE:-/tmp/sonora-storage}"
echo "e2e database $DB ready"
