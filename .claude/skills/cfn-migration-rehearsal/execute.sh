#!/usr/bin/env bash
# cfn-migration-rehearsal - rehearse a migration up+down round-trip against an
# EXPLICIT scratch database only. It applies up, captures schema, applies down,
# re-captures, and diffs to prove the round-trip is clean.
#
# SAFETY CONTRACT (hard):
#   - Refuses to run without CFN_SCRATCH_DATABASE_URL.
#   - Refuses if the scratch URL equals DATABASE_URL or SUPABASE_DIRECT_CONNECTION.
#   - Refuses if the scratch URL looks like a production pooler.
#   - Never writes DELETE/TRUNCATE. It only runs the migration files you pass.
#   - On any condition where it cannot run safely, it exits non-zero with a
#     clear message instead of guessing.
set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$PROJECT_ROOT"

die() { echo "cfn-migration-rehearsal: REFUSING: $*" >&2; exit 2; }

# --- arg parsing --------------------------------------------------------------
UP=""
DOWN=""
while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --up)   UP="${2:-}"; shift 2 ;;
    --down) DOWN="${2:-}"; shift 2 ;;
    *)      if [[ -z "$UP" ]]; then UP="$1"; elif [[ -z "$DOWN" ]]; then DOWN="$1"; fi; shift ;;
  esac
done

# --- SAFETY GUARDS (run before anything touches a database) -------------------
SCRATCH="${CFN_SCRATCH_DATABASE_URL:-}"
[[ -n "$SCRATCH" ]] || die "CFN_SCRATCH_DATABASE_URL is not set. This skill never runs against DATABASE_URL/prod. Provide a disposable scratch database URL."

# Read prod URLs from .env WITHOUT sourcing it (multi-line tokens break bash).
ENV_DB=""
ENV_DIRECT=""
if [[ -f .env ]]; then
  ENV_DB=$(grep '^DATABASE_URL=' .env 2>/dev/null | head -1 | cut -d'=' -f2- || true)
  ENV_DIRECT=$(grep '^SUPABASE_DIRECT_CONNECTION=' .env 2>/dev/null | head -1 | cut -d'=' -f2- || true)
fi

[[ -n "$ENV_DB" && "$SCRATCH" == "$ENV_DB" ]] && die "scratch URL equals DATABASE_URL from .env. That is production. Use a separate scratch database."
[[ -n "$ENV_DIRECT" && "$SCRATCH" == "$ENV_DIRECT" ]] && die "scratch URL equals SUPABASE_DIRECT_CONNECTION from .env. Use a separate scratch database."
[[ -n "${DATABASE_URL:-}" && "$SCRATCH" == "${DATABASE_URL:-}" ]] && die "scratch URL equals the DATABASE_URL in the environment. Use a separate scratch database."

# Refuse anything that looks like a production pooler endpoint.
case "$SCRATCH" in
  *pooler.supabase.com*|*pooler.supabase.co*|*.pooler.*)
    die "scratch URL points at a Supabase pooler (production endpoint). Point at a disposable scratch database, not the pooler." ;;
esac

# --- required tooling ---------------------------------------------------------
if ! command -v psql >/dev/null 2>&1 || ! command -v pg_dump >/dev/null 2>&1; then
  echo "cfn-migration-rehearsal: cannot run: psql and pg_dump are required but not installed." >&2
  echo "Install the postgresql client, then re-run." >&2
  exit 3
fi

# --- migration files ----------------------------------------------------------
[[ -n "$UP" && -f "$UP" ]]     || die "up migration file not found: '${UP:-<none>}'. Pass --up <file>."
[[ -n "$DOWN" && -f "$DOWN" ]] || die "down migration file not found: '${DOWN:-<none>}'. Pass --down <file>. A migration with no down is not rehearsable."

# Refuse to run a migration file containing an unscoped destructive statement.
if grep -iEn '(delete[[:space:]]+from[[:space:]]+[a-z0-9_."]+[[:space:]]*;)|truncate[[:space:]]' "$UP" "$DOWN" >/dev/null 2>&1; then
  echo "cfn-migration-rehearsal: WARNING: a migration file contains DELETE-without-WHERE or TRUNCATE." >&2
  echo "Lines:" >&2
  grep -iEn '(delete[[:space:]]+from[[:space:]]+[a-z0-9_."]+[[:space:]]*;)|truncate[[:space:]]' "$UP" "$DOWN" >&2 || true
  die "destructive unscoped SQL in a migration. Scope it with a WHERE clause or confirm intent before rehearsing."
fi

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

PSQL=(psql "$SCRATCH" -v ON_ERROR_STOP=1 -q)
# normalized schema snapshot: structure only, comments/blank lines stripped
snapshot() {
  local dump
  dump=$(pg_dump "$SCRATCH" --schema-only --no-owner --no-privileges 2>/dev/null) || return 1
  printf '%s\n' "$dump" | grep -vE '^(--|SET |SELECT pg_catalog|$)' | sort || true
}

echo "cfn-migration-rehearsal: scratch DB verified safe. Rehearsing round-trip."
echo "  up:   $UP"
echo "  down: $DOWN"

# --- baseline -----------------------------------------------------------------
if ! snapshot > "$WORK/s0.sql"; then
  echo "cfn-migration-rehearsal: cannot run: could not read baseline schema from the scratch DB (connection failed or DB unreachable)." >&2
  exit 3
fi

# --- apply up -----------------------------------------------------------------
echo "  applying up..."
if ! "${PSQL[@]}" -f "$UP" >"$WORK/up.log" 2>&1; then
  echo "FAIL: up migration errored:" >&2; cat "$WORK/up.log" >&2
  exit 4
fi
snapshot > "$WORK/s1.sql"
if diff -q "$WORK/s0.sql" "$WORK/s1.sql" >/dev/null 2>&1; then
  echo "  note: up migration produced no schema change."
fi

# --- apply down ---------------------------------------------------------------
echo "  applying down..."
if ! "${PSQL[@]}" -f "$DOWN" >"$WORK/down.log" 2>&1; then
  echo "FAIL: down migration errored. Up applied but down did not roll back:" >&2; cat "$WORK/down.log" >&2
  exit 5
fi
snapshot > "$WORK/s2.sql"

# --- round-trip verdict -------------------------------------------------------
echo
if diff -q "$WORK/s0.sql" "$WORK/s2.sql" >/dev/null 2>&1; then
  echo "ROUND-TRIP CLEAN: schema after down matches the baseline. up+down are inverses."
  exit 0
else
  echo "ROUND-TRIP DIRTY: schema after down does NOT match baseline. Drift below (baseline < vs > after-down):"
  diff "$WORK/s0.sql" "$WORK/s2.sql" || true
  echo
  echo "The down migration does not fully reverse the up migration. Fix the down before merging."
  exit 6
fi
