#!/usr/bin/env bash
# tests/w-3-sink-wired.sh - AC-63 (WIRING-3: sink delegation contract).
# Writer invokes record.sh with required shared fields (--slug, --id,
# --title, --chosen, --status, --timestamp) and does NOT pass fields the
# sink does not understand (--actor, --iteration, --project, --supersede).
# Verified via stub sink that records argv.
set -uo pipefail
. "$(dirname "$0")/_test_helper.sh"

NAME="AC-63: WIRING-3 sink delegation (shared fields only)"

ROOT_TMP="$(make_test_root)"
BIN_DIR="$(make_stub_sink 0)"
trap 'rm -rf "$ROOT_TMP" "$BIN_DIR"' EXIT
PATH="$BIN_DIR:$PATH"

SLUG="$(make_test_slug)"
"$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG" --id test-DW3 --title "T" --chosen "C" --actor human \
  --iteration 3 --status accepted --blocking true \
  --root "$ROOT_TMP" >/dev/null 2>&1
RC=$?
assert_exit "$RC" 0 "AC-63: writer exits 0"

ARGV_FILE="$BIN_DIR/last-argv"
[ -f "$ARGV_FILE" ] && ok "AC-63: stub sink captured argv" \
  || fail "AC-63: stub sink captured argv" "no last-argv file"

# Required fields MUST be passed. Use `grep --` to terminate options so flags
# starting with -- are treated as patterns (not grep options).
ARGV="$(cat "$ARGV_FILE")"
for needle in --slug --id --title --chosen --status --timestamp; do
  if printf '%s' "$ARGV" | grep -qF -- "$needle"; then
    ok "AC-63: passes $needle"
  else
    fail "AC-63: passes $needle" "absent in argv: $ARGV"
  fi
done

# Fields the sink does NOT understand MUST NOT be passed.
# Writer forwards: slug, id, title, chosen, rationale, alternatives, status,
# timestamp, and bare --blocking (when blocking=true). Writer OMITS: actor,
# iteration, project, supersede (JSON-only or sink-derived).
for forbidden in --actor --iteration --project --supersede; do
  if printf '%s' "$ARGV" | grep -qF -- "$forbidden"; then
    fail "AC-63: omits $forbidden" "present in argv: $ARGV"
  else
    ok "AC-63: omits $forbidden"
  fi
done

# Value propagation: slug and id values match the invocation.
# Argv is a single space-separated line; extract value following each flag.
SLUG_PASSED="$(printf '%s' "$ARGV" | sed -E 's/.*--slug ([^ ]*).*/\1/')"
ID_PASSED="$(printf '%s' "$ARGV" | sed -E 's/.*--id ([^ ]*).*/\1/')"
assert_eq "$SLUG_PASSED" "$SLUG" "AC-63: slug value propagated"
assert_eq "$ID_PASSED" "test-DW3" "AC-63: id value propagated"

print_summary "$NAME"
