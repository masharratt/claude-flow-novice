#!/usr/bin/env bash
# gate-check.sh - mechanical test-pass-rate gate for CFN Loop
#
# Usage: gate-check.sh --out <test-output-file> --threshold <decimal>
#
# Detects vitest, jest, and pytest summary lines, computes pass/total,
# prints: {"pass":N,"total":M,"rate":R,"passed":true|false}
#
# Exit codes:
#   0 - rate >= threshold AND total > 0 (gate PASSED)
#   1 - rate < threshold (gate FAILED)
#   2 - no test counts detected; prints {"error":"no tests detected"}
#       (0/0 must NOT pass)
#   3 - total < baseline (test count shrank vs prior iteration; only with --baseline)
#
# Thresholds come from .claude/skills/cfn-loop-orchestration-v2/THRESHOLDS.md
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/parse-test-summary.sh
source "$SCRIPT_DIR/lib/parse-test-summary.sh"

OUT=""
THRESHOLD=""
BASELINE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --out)
      OUT="${2:-}"; shift 2 ;;
    --threshold)
      THRESHOLD="${2:-}"; shift 2 ;;
    --baseline)
      BASELINE="${2:-}"; shift 2 ;;
    *)
      echo "{\"error\":\"unknown argument: $1\"}"
      exit 2 ;;
  esac
done

if [[ -n "$BASELINE" ]] && ! echo "$BASELINE" | grep -qE '^[0-9]+$'; then
  echo "{\"error\":\"baseline must be a non-negative integer, got: $BASELINE\"}"
  exit 2
fi

if [[ -z "$OUT" || -z "$THRESHOLD" ]]; then
  echo '{"error":"usage: gate-check.sh --out <file> --threshold <decimal>"}'
  exit 2
fi

if [[ ! -f "$OUT" ]]; then
  echo "{\"error\":\"output file not found: $OUT\"}"
  exit 2
fi

if ! echo "$THRESHOLD" | grep -qE '^(0(\.[0-9]+)?|1(\.0+)?)$'; then
  echo "{\"error\":\"threshold must be a decimal in [0.0, 1.0], got: $THRESHOLD\"}"
  exit 2
fi

# Detection delegates to the shared lib/parse-test-summary.sh parser (S002+S003
# DRY refactor, origin: ROOTCAUSE_mpa_thread_wiring_gap.md). ANSI-stripping and
# per-runner (jest/vitest/pytest) summary-line parsing now live in one place;
# verify-run.sh sources the same lib so both callers agree on what "skipped"
# means. PTS_COLLECTED is the corrected denominator: for pytest it now INCLUDES
# skipped (S003: the old inline logic here computed TOTAL = PASS+FAIL+ERR,
# dropping SKIPPED, so skipping a failing test RAISED the reported pass rate).
PASS=""
TOTAL=""
if parse_test_summary "$OUT"; then
  PASS="$PTS_PASS"
  TOTAL="$PTS_COLLECTED"
fi

if [[ -z "$TOTAL" ]]; then
  echo '{"error":"no tests detected"}'
  exit 2
fi

if [[ "$TOTAL" -eq 0 ]]; then
  # 0/0 must NOT pass
  echo '{"error":"no tests detected"}'
  exit 2
fi

RATE=$(awk -v p="$PASS" -v t="$TOTAL" 'BEGIN { printf "%.4f", p / t }')
PASSED=$(awk -v r="$RATE" -v th="$THRESHOLD" 'BEGIN { print (r >= th) ? "true" : "false" }')

if [[ -z "$BASELINE" ]]; then
  # Legacy output — byte-identical to pre-baseline behavior.
  echo "{\"pass\":$PASS,\"total\":$TOTAL,\"rate\":$RATE,\"passed\":$PASSED}"
  if [[ "$PASSED" == "true" ]]; then
    exit 0
  fi
  exit 1
fi

# --baseline supplied: report shrinkage and gate on it.
SHRUNK=$(awk -v t="$TOTAL" -v b="$BASELINE" 'BEGIN { print (t < b) ? "true" : "false" }')
echo "{\"pass\":$PASS,\"total\":$TOTAL,\"rate\":$RATE,\"passed\":$PASSED,\"baseline\":$BASELINE,\"shrunk\":$SHRUNK}"

# A shrinking suite (tests removed to game the gate) fails first, regardless of rate.
if [[ "$SHRUNK" == "true" ]]; then
  exit 3
fi
if [[ "$PASSED" == "true" ]]; then
  exit 0
fi
exit 1
