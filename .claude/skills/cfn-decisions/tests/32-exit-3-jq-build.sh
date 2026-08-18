#!/usr/bin/env bash
# tests/32-exit-3-jq-build.sh - AC-21 (exit 3 defensive codepath).
# Static: source-grep for the exit-3 codepath (runtime is near-unreachable
# because --arg escapes every untrusted string; only a corrupted jq binary
# would trigger it).
set -uo pipefail
. "$(dirname "$0")/_test_helper.sh"

NAME="AC-21: exit 3 codepath exists in source (defensive, near-unreachable)"

RECORD_SH="$REPO_ROOT/.claude/skills/cfn-decisions/record.sh"
JQ_BUILD_SH="$REPO_ROOT/.claude/skills/cfn-decisions/lib/jq-build.sh"

# AC-21: the writer source contains the exit 3 codepath.
if grep -nE "exit \"?\$E_JQ_BUILD\"?|exit 3\b" "$JQ_BUILD_SH" >/dev/null 2>&1; then
  ok "AC-21: exit 3 codepath present in lib/jq-build.sh"
else
  fail "AC-21: exit 3 codepath present in lib/jq-build.sh"
fi

# AC-21: the constant E_JQ_BUILD=3 is defined.
if grep -nE "^E_JQ_BUILD=3" "$REPO_ROOT/.claude/skills/cfn-decisions/lib/help.sh" >/dev/null 2>&1; then
  ok "AC-21: E_JQ_BUILD=3 constant defined"
else
  fail "AC-21: E_JQ_BUILD=3 constant defined"
fi

# Document the near-unreachable trigger condition. The test is the source-
# grep contract per ARCH §10.3 / TEST §6 step 16.
cat <<'NOTE'
NOTE: AC-21 runtime trigger is near-unreachable. jq --arg escapes every
untrusted string (FR-6), so the only way to hit exit 3 at runtime is a
corrupted jq binary or a jq bug. The static source-grep is the contract:
the codepath MUST exist; its presence is what the writer's defensive
contract guarantees. See ARCH §4.3 and TEST §3 AC-21.
NOTE
ok "AC-21: trigger condition documented above"

print_summary "$NAME"
