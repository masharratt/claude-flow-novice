#!/usr/bin/env bash
# tests/52-dual-write-sink-missing.sh - AC-7 + AC-37 (FR-5 D-7 sink missing).
# Integration: PATH scrubbed of decision-log/; assert JSON KEPT, exit 7.
set -uo pipefail
. "$(dirname "$0")/_test_helper.sh"

NAME="AC-7/37: FR-5 D-7 record.sh missing (JSON KEPT, exit 7)"
ROOT_TMP="$(make_test_root)"
trap 'rm -rf "$ROOT_TMP"' EXIT

# Scrub PATH of any decision-log dir AND any stub record.sh.
SCRUBBED_PATH="$(printf '%s' "$PATH" | tr ':' '\n' | grep -v 'decision-log' | paste -sd:)"
SLUG="$(make_test_slug)"

ERR_OUT="$(PATH="$SCRUBBED_PATH" "$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG" --id test-D01 --title "T" --chosen "C" \
  --rationale "r" --alternatives "a" --status proposed --blocking false \
  --actor human --root "$ROOT_TMP" 2>&1 >/dev/null)"
RC=$?
assert_exit "$RC" 7 "AC-7: exit 7 on missing sink"

# OBS-3: stderr shape.
assert_match "^record\.sh missing; JSON persisted at .*; SQLite sync skipped$" \
  "$ERR_OUT" "AC-37/OBS-3: stderr shape"

# D-7: JSON KEPT.
TARGET="$ROOT_TMP/.VERIFY_${SLUG}.decisions.json"
jq -e '.decisions[]|select(.id=="test-D01")' "$TARGET" >/dev/null 2>&1 \
  && ok "AC-7: JSON entry queryable (KEPT)" \
  || fail "AC-7: JSON entry queryable"

# No SQLite row written (sink absent).
DB="${DB_PATH:-${HOME}/.claude/decision-log/decisions.db}"
if [ -f "$DB" ]; then
  PROJ="$(basename "$(git rev-parse --show-toplevel 2>/dev/null || echo "$REPO_ROOT")")"
  ROW="$(sqlite3 "$DB" \
    "SELECT count(*) FROM decisions WHERE project='$PROJ' AND slug='$SLUG' AND decision_id='test-D01';" \
    2>/dev/null)"
  assert_eq "$ROW" "0" "AC-7: no SQLite row for the test id (sink absent)"
fi

print_summary "$NAME"
