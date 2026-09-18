#!/usr/bin/env bash
# Statusline session-name lookup.
#
# The status line showed the first 8 chars of the session UUID, and its
# comment claimed that was "the address for cross-session SendMessage". It
# never was: SendMessage resolves session NAMES (or 6-char refs minted fresh
# at listing time, which are stored nowhere on disk). ~/.claude/sessions/
# <pid>.json is the on-disk session registry and does carry the name, so the
# status line looks its own name up there by sessionId and shows that
# instead. CFN_SESSIONS_DIR points the lookup at a fixture dir for tests;
# without a registry hit the line falls back to the old 8-char prefix.
set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=test-utils.sh
source "$REPO_ROOT/tests/test-utils.sh"

STATUSLINE="${CFN_STATUSLINE:-$REPO_ROOT/.claude/statusline-command.sh}"
if [ ! -f "$STATUSLINE" ]; then
  echo "SKIP: statusline script not found at $STATUSLINE"
  exit 0
fi

FIXTURE_SID="7cf99c7a-64e8-48de-871a-0e3b7a1b116f"
FIXTURE_NAME="claude-flow-novice-b4"

FIXTURE_DIR="$(mktemp -d)"
trap 'rm -rf "$FIXTURE_DIR"' EXIT
cat > "$FIXTURE_DIR/123.json" <<EOF
{"pid":123,"sessionId":"$FIXTURE_SID","cwd":"/home/masha/projects/claude-flow-novice","name":"$FIXTURE_NAME","nameSource":"derived"}
EOF
EMPTY_DIR="$(mktemp -d)"

statusline_out() {
  printf '{"session_id":"%s"}\n' "$1" \
    | CFN_SESSIONS_DIR="$2" bash "$STATUSLINE" 2>/dev/null
}

# Case 1: registry record exists -> the session name is on the line.
out="$(statusline_out "$FIXTURE_SID" "$FIXTURE_DIR")"
assert_contains "$out" "$FIXTURE_NAME" "statusline shows registry name when record exists"

# Case 2: no registry match -> falls back to the 8-char UUID prefix.
out="$(statusline_out "$FIXTURE_SID" "$EMPTY_DIR")"
assert_contains "$out" "7cf99c7a" "statusline falls back to 8-char prefix without record"

print_test_summary
