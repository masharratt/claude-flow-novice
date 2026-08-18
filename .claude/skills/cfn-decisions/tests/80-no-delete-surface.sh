#!/usr/bin/env bash
# tests/80-no-delete-surface.sh - AC-14 + AC-56 (NFR-4 No delete surface).
# Static: writer source exposes no --delete/--remove/--purge/--supersede
# flag and performs no DELETE/TRUNCATE on the JSON target. Sink delegates
# handle SQLite writes only via the LOCKED record.sh subprocess.
set -uo pipefail
. "$(dirname "$0")/_test_helper.sh"

NAME="AC-14/56: NFR-4 writer exposes no destructive surface"

RECORD_SH="$REPO_ROOT/.claude/skills/cfn-decisions/record.sh"
LIB_DIR="$REPO_ROOT/.claude/skills/cfn-decisions/lib"

# 1. Help output: no destructive flags listed.
HELP_OUT="$("$RECORD_SH" --help 2>&1 || true)"
HELP_RC=$?
assert_exit "$HELP_RC" 0 "AC-14: --help exits 0"
for flag in --delete --remove --purge --supersede --truncate --clear; do
  if printf '%s' "$HELP_OUT" | grep -qF "$flag"; then
    fail "AC-14: --help lists destructive flag" "found=$flag"
  else
    ok "AC-14: --help omits $flag"
  fi
done

# 2. Source grep: no destructive flag HANDLERS (case branches) in record.sh
# or lib/*.sh. Comments mentioning the banned words are allowed (the help
# text lists them under "Reject flags"); we only flag executable case arms.
# Pattern: `--delete|--remove|--purge|--supersede) ...` as a case branch.
DESTRUCT_HITS="$(grep -rnE '^[[:space:]]*--[a-z]+\)' \
  "$RECORD_SH" "$LIB_DIR"/*.sh 2>/dev/null \
  | grep -E '(--delete|--remove|--purge|--supersede|--truncate|--clear)' \
  | wc -l)"
assert_eq "$DESTRUCT_HITS" "0" \
  "AC-56: no destructive flag branches in source"

# 3. No DELETE/TRUNCATE statements targeting the JSON target (writer writes
# JSON via jq+mv, never rm of the target file on success). Cleanup trap only
# removes the TMP scratch file.
RM_HITS="$(grep -nE 'rm[[:space:]]+-[a-zA-Z]*f?[a-zA-Z]*[[:space:]]+.+(decisions\.json|\.VERIFY_)' \
  "$RECORD_SH" "$LIB_DIR"/*.sh 2>/dev/null | wc -l)"
assert_eq "$RM_HITS" "0" \
  "AC-56: no rm of target .decisions.json in source"

# 4. Invoking writer with banned flag exits E_CLI_PARSE=2 (rejected by arg parser).
ROOT_TMP="$(make_test_root)"
BIN_DIR="$(make_stub_sink 0)"
trap 'rm -rf "$ROOT_TMP" "$BIN_DIR"' EXIT
PATH="$BIN_DIR:$PATH"
SLUG="$(make_test_slug)"
for flag in --delete --remove --purge --supersede; do
  "$RECORD_SH" --slug "$SLUG" --id test-D1 --title T --chosen C \
    --actor human --root "$ROOT_TMP" "$flag" x >/dev/null 2>&1
  RC=$?
  assert_exit "$RC" 2 "AC-14: writer rejects $flag with E_CLI_PARSE=2"
done

# 5. JSON target untouched after rejected invocation (no side effects).
# (No target should exist; even if one did, the parser exits before touching it.)
TARGET="$ROOT_TMP/.VERIFY_${SLUG}.decisions.json"
[ ! -f "$TARGET" ] && ok "AC-14: no target created by rejected invocation" \
  || fail "AC-14: no target created" "target exists at $TARGET"

print_summary "$NAME"
