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

# Strip ANSI color codes for reliable matching
CLEAN=$(mktemp)
trap 'rm -f "$CLEAN"' EXIT
sed -e $'s/\x1b\[[0-9;]*[A-Za-z]//g' "$OUT" > "$CLEAN"

PASS=""
TOTAL=""

extract_count() {
  # extract_count "<line>" "<word>" -> integer count or empty
  echo "$1" | grep -oE "[0-9]+ $2" | tail -1 | grep -oE '^[0-9]+'
}

# --- jest: "Tests:       2 failed, 10 passed, 12 total"
LINE=$(grep -E '^[[:space:]]*Tests:.*[0-9]+ total' "$CLEAN" | tail -1 || true)
if [[ -n "$LINE" ]]; then
  PASS=$(extract_count "$LINE" "passed"); PASS=${PASS:-0}
  TOTAL=$(extract_count "$LINE" "total")
fi

# --- vitest: "Tests  2 failed | 10 passed (12)" or " Tests  12 passed (12)"
if [[ -z "$TOTAL" ]]; then
  LINE=$(grep -E '^[[:space:]]*Tests[[:space:]]+.*[0-9]+ (passed|failed)' "$CLEAN" | tail -1 || true)
  if [[ -n "$LINE" ]]; then
    PASS=$(extract_count "$LINE" "passed"); PASS=${PASS:-0}
    FAIL=$(extract_count "$LINE" "failed"); FAIL=${FAIL:-0}
    SKIP=$(extract_count "$LINE" "skipped"); SKIP=${SKIP:-0}
    TODO=$(extract_count "$LINE" "todo"); TODO=${TODO:-0}
    PAREN=$(echo "$LINE" | grep -oE '\([0-9]+\)' | tail -1 | tr -d '()')
    if [[ -n "$PAREN" ]]; then
      TOTAL="$PAREN"
    else
      TOTAL=$((PASS + FAIL + SKIP + TODO))
    fi
  fi
fi

# --- pytest: "===== 10 passed, 2 failed, 1 error in 1.23s ====="
if [[ -z "$TOTAL" ]]; then
  LINE=$(grep -E '[0-9]+ (passed|failed|error|errors).* in [0-9.]+s' "$CLEAN" | tail -1 || true)
  if [[ -n "$LINE" ]]; then
    PASS=$(extract_count "$LINE" "passed"); PASS=${PASS:-0}
    FAIL=$(extract_count "$LINE" "failed"); FAIL=${FAIL:-0}
    ERR=$(extract_count "$LINE" "errors?"); ERR=${ERR:-0}
    TOTAL=$((PASS + FAIL + ERR))
  fi
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
