#!/usr/bin/env bash
# tests/31-exit-2-cli-parse.sh - AC-20 + AC-58 (exit 2 / EC-19 malformed timestamp).
# Unit: pure argv parse, no FS touch, no sink.
set -uo pipefail
. "$(dirname "$0")/_test_helper.sh"

NAME="AC-20/58: exit 2 on CLI parse failures (one sub-case per shape)"
ROOT_TMP="$(make_test_root)"
trap 'rm -rf "$ROOT_TMP"' EXIT

# Helper: run one exit-2 case.
# Args: name expected_message argv...
run_exit2_case() {
  local name="$1" expected="$2"; shift 2
  local out rc
  out="$("$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" "$@" \
    --root "$ROOT_TMP" 2>&1)"
  rc=$?
  assert_exit "$rc" 2 "AC-20 [$name]: exit 2"
  assert_contains "$out" "$expected" "AC-20 [$name]: stderr names constraint"
  # No file written.
  local slug_file
  slug_file="$(find "$ROOT_TMP" -name '.VERIFY_*.decisions.json' 2>/dev/null | head -1)"
  [ -z "$slug_file" ] && ok "AC-20 [$name]: no JSON file written" \
    || fail "AC-20 [$name]: no JSON file written" "$slug_file exists"
}

# Unknown flag.
run_exit2_case "unknown-flag" "unknown arg: --frob" \
  --slug test-dec-aaaaaa --id test-D01 --title "T" --chosen "C" \
  --actor human --frob

# --delete is rejected as unknown arg (FR-8).
run_exit2_case "delete-rejected" "unknown arg: --delete" \
  --slug test-dec-bbbbbb --id test-D01 --title "T" --chosen "C" \
  --actor human --delete

# --supersede rejected as unknown arg (status encoded via --status).
run_exit2_case "supersede-rejected" "unknown arg: --supersede" \
  --slug test-dec-cccccc --id test-D01 --title "T" --chosen "C" \
  --actor human --supersede

# --status invalid enum.
run_exit2_case "bad-status" "status must be proposed|accepted|superseded" \
  --slug test-dec-dddddd --id test-D01 --title "T" --chosen "C" \
  --actor human --status frob

# --iteration non-numeric.
run_exit2_case "bad-iteration" "iteration must be a non-negative integer" \
  --slug test-dec-eeeeee --id test-D01 --title "T" --chosen "C" \
  --actor human --iteration abc

# --blocking not a bool.
run_exit2_case "bad-blocking" "blocking must be true|false" \
  --slug test-dec-ffffff --id test-D01 --title "T" --chosen "C" \
  --actor human --blocking maybe

# --timestamp malformed (EC-19 / AC-58). Shape-invalid: not ISO 8601 UTC.
run_exit2_case "bad-timestamp" \
  "timestamp must be ISO 8601 UTC like 2026-07-28T14:00:00Z" \
  --slug test-dec-111111 --id test-D01 --title "T" --chosen "C" \
  --actor human --timestamp "2026/07/28 14:00:00"

# --actor with no value (missing value: parse shift fails).
# This case: --actor followed by another --flag. The argv loop reads the
# next token as the value, so we test the explicit enum failure instead.
# (covered by "bad-actor" via enum rejection).

# Bad actor enum value.
run_exit2_case "bad-actor-enum" "actor must be human|ai" \
  --slug test-dec-222222 --id test-D01 --title "T" --chosen "C" \
  --actor blob

print_summary "$NAME"
