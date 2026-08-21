#!/usr/bin/env bash
# Credential-loading gate for the cfn-knowledge-base workflow scripts.
#
# approval-workflow.sh and review-skill.sh both loaded PostgreSQL credentials
# by `source`-ing .env directly. Two bugs, fixed 2026-08-20:
#
#   Bug 1 (anchor): the base was PROJECT_ROOT, derived from BASH_SOURCE up to
#   the shared CFN checkout root. Credentials belong to the project actually
#   being worked on, not the CFN tree every project reaches through the
#   reverse symlinks. The anchor is now CLAUDE_PROJECT_DIR (falling back to
#   $PWD) -- the same decision already taken for CONTENT_BASE_DIR in
#   deploy-approved-skill.sh / propagate-skill-update.sh.
#
#   Bug 2 (method): `source`-ing a .env executes whatever shell is in the
#   file. A wrapped/multi-line value -- an unquoted token an editor line-
#   wrapped -- turns the continuation line into a fresh command bash actually
#   runs. Fixed by extracting only the specific vars each script needs with
#   `grep '^VAR=' .env | cut -d'=' -f2-`, never sourcing.
#
# These checks exercise the real scripts against a scratch CLAUDE_PROJECT_DIR
# and prove the continuation line is never executed, rather than grepping for
# the fixed source lines, so a re-break in any other form still fails.
#
# Usage:
#   tests/security/test-env-handling.sh
set -uo pipefail

cd "$(git rev-parse --show-toplevel)"
ROOT="$PWD"

FAIL=0
pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1" >&2; FAIL=1; }

APPROVAL="$ROOT/.claude/skills/cfn-knowledge-base/lib/workflow/approval-workflow.sh"
REVIEW="$ROOT/.claude/skills/cfn-knowledge-base/lib/workflow/review-skill.sh"
SCRIPTS=("$APPROVAL" "$REVIEW")

for f in "${SCRIPTS[@]}"; do
  if [ ! -f "$f" ]; then
    fail "$f is missing"
  fi
done

# --- Static check: neither script may `source`/`.` a .env file. -----------
for f in "${SCRIPTS[@]}"; do
  [ -f "$f" ] || continue
  if grep -nE '^\s*(source|\.)\s+"?\$\{?[A-Z_]+\}?.*\.env' "$f" >/dev/null 2>&1; then
    fail "$(basename "$f") still sources a .env file"
  else
    pass "$(basename "$f") does not source .env"
  fi
done

# --- Static check: the credential lookup is anchored on CLAUDE_PROJECT_DIR. -
for f in "${SCRIPTS[@]}"; do
  [ -f "$f" ] || continue
  env_file_assign="$(grep -m1 -E '^\s*ENV_FILE=' "$f" || true)"
  if [ -z "$env_file_assign" ]; then
    fail "$(basename "$f"): no ENV_FILE assignment found for the credential lookup"
  elif printf '%s' "$env_file_assign" | grep -q 'CLAUDE_PROJECT_DIR'; then
    pass "$(basename "$f") anchors the credential lookup on CLAUDE_PROJECT_DIR"
  else
    fail "$(basename "$f"): credential lookup is not CLAUDE_PROJECT_DIR-anchored: $env_file_assign"
  fi
done

# --- Real-behavior check: a wrapped/multi-line .env value must not be
# executed as shell, and the script must keep running (not die on parse). --
WORK="$(mktemp -d)"
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

MARKER="$WORK/PWNED_MARKER"

# Synthetic fake credentials only -- no real host, account, or secret.
# CFN_DB_PASSWORD's value is deliberately followed by an unquoted line: the
# real-world shape of the bug is an editor word-wrapping a long token across
# two lines with no surrounding quotes. Under `source`, that second line is
# not part of the assignment -- it is a new top-level command bash executes.
cat > "$WORK/.env" <<ENVEOF
CFN_DB_HOST=scratch-db-host.invalid
CFN_DB_PORT=5432
CFN_DB_NAME=scratch_test_db
CFN_DB_USER=scratch_test_user
CFN_DB_PASSWORD=zzzZZZfakeSyntheticTokenPart1zzzZZZ
touch "$MARKER"
ENVEOF

# Sanity: prove this fixture really would trip the old `source` bug, so the
# absence of the marker below is evidence of the fix and not a fixture bug.
( source "$WORK/.env" >/dev/null 2>&1 )
if [ -f "$MARKER" ]; then
  pass "fixture .env reproduces the source-execution bug when actually sourced (sanity check)"
  rm -f "$MARKER"
else
  fail "fixture .env did not reproduce the source-execution bug under a direct 'source' -- fixture is not testing the real bug"
fi

for f in "${SCRIPTS[@]}"; do
  [ -f "$f" ] || continue
  rm -f "$MARKER"
  name="$(basename "$f")"

  if [ "$f" = "$APPROVAL" ]; then
    out="$(timeout 15 env CLAUDE_PROJECT_DIR="$WORK" bash "$f" get-state --pattern-id "00000000-0000-0000-0000-000000000000" 2>&1)"
  else
    out="$(timeout 15 env CLAUDE_PROJECT_DIR="$WORK" bash "$f" --list-pending 2>&1)"
  fi

  if [ -f "$MARKER" ]; then
    fail "$name: the .env continuation line was executed as a shell command (marker created)"
  else
    pass "$name: multi-line .env value was not executed as a shell command"
  fi

  # A parse-time death from the old bug shows up as the marker command's own
  # name failing to run as a bare statement (e.g. "touch: command not
  # found" would never happen since touch exists -- the tell is bash trying
  # to interpret the raw continuation text as a command name at all).
  if printf '%s' "$out" | grep -q 'PWNED_MARKER"*: command not found'; then
    fail "$name: output shows the .env continuation line was invoked as a command"
  else
    pass "$name: script kept running past the .env load (no parse-time death)"
  fi
done

echo "---"
if [ "$FAIL" -eq 0 ]; then
  echo "env handling: OK"
else
  echo "env handling: FAILED" >&2
fi
exit "$FAIL"
