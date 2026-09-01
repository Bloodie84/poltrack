#!/usr/bin/env bash
# Applies the shim + migrations + RLS assertions to a throwaway database.
# Usage: supabase/tests/run.sh            (needs a local postgres superuser)
set -euo pipefail
DB=${DB:-sonora_test}
PSQL=${PSQL:-psql}

$PSQL -v ON_ERROR_STOP=1 -q -c "drop database if exists $DB;" -c "create database $DB;" postgres
PGOPTIONS="-c client_min_messages=warning" $PSQL -v ON_ERROR_STOP=1 -q -f supabase/tests/_shim.sql "$DB"
for f in supabase/migrations/*.sql; do
  PGOPTIONS="-c client_min_messages=warning" $PSQL -v ON_ERROR_STOP=1 -q -f "$f" "$DB"
done
$PSQL -v ON_ERROR_STOP=1 -q -f supabase/tests/rls_test.sql "$DB"
