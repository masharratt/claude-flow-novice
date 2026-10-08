#!/usr/bin/env bash
# loop-brake.sh: stop a cfn-loop-task run that is not making progress.
#
# MAX_ITERATIONS (5/10/15 by mode) was the only stop, so a run whose rounds
# fail identically burned every remaining round before anyone heard about it.
# After each failed gate, the coordinator records a fingerprint of WHICH tests
# failed. When the same fingerprint repeats CFN_LOOP_BRAKE_REPEATS times in a
# row (default 2, i.e. three identical rounds), the brake engages and the run
# escalates to the user instead of iterating again.
#
# Usage:
#   record --run-id <id> --iteration <n> --test-output <file> [--pass <n> --total <n>]
#     Fingerprints the failing-test lines in <file> (vitest/jest FAIL and ●,
#     pytest FAILED, go --- FAIL, cargo ... FAILED, ✗/×/✘/✖ markers), ignoring
#     ANSI colour and timings. With no such lines, falls back to the pass/total
#     counts when given, else fingerprint "none", which never brakes.
#     Re-recording an iteration replaces its row (a flaky re-run never
#     double-counts). Prints one JSON line:
#       {"run_id","iteration","fingerprint","streak","repeats_allowed","brake","failing":[...]}
#
# Env: CFN_LOOP_BRAKE_DIR      state dir (default /tmp/cfn-loop-brake; one TSV per run)
#      CFN_LOOP_BRAKE_REPEATS  identical repeats allowed before braking (default 2)
#
# Exit: 0 = keep iterating; 1 = brake engaged (escalate); 2 = usage or input error
set -euo pipefail

STATE_DIR="${CFN_LOOP_BRAKE_DIR:-/tmp/cfn-loop-brake}"
REPEATS="${CFN_LOOP_BRAKE_REPEATS:-2}"

die2() { echo "loop-brake: $1" >&2; exit 2; }
command -v jq >/dev/null 2>&1 || die2 "jq not found on PATH"

usage() {
  sed -n '2,/^set -euo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//' >&2
  exit 2
}

# Failing-test lines, normalised so run-to-run noise (colour, timings) does not
# change the fingerprint. One line per failure, sorted and de-duplicated.
failing_lines() { # $1 = test output file
  sed $'s/\x1b\\[[0-9;]*[A-Za-z]//g' "$1" \
    | grep -E '^[[:space:]]*(FAIL[[:space:]]+[^[:space:]]|●[[:space:]]|(✗|×|✘|✖)[[:space:]])|^FAILED[[:space:]]|^[[:space:]]*--- FAIL:|^test .* \.\.\. FAILED$' \
    | grep -vE '●[[:space:]]+Console' \
    | sed -E 's/[[(][0-9.]+ ?(ms|s)[])]//g; s/[[:space:]]+[0-9.]+ ?ms$//; s/^[[:space:]]+//; s/[[:space:]]+$//' \
    | sort -u || true
}

cmd_record() {
  local run="" iter="" out="" pass="" total=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --run-id) run="${2:-}"; shift 2 ;;
      --iteration) iter="${2:-}"; shift 2 ;;
      --test-output) out="${2:-}"; shift 2 ;;
      --pass) pass="${2:-}"; shift 2 ;;
      --total) total="${2:-}"; shift 2 ;;
      *) die2 "unknown argument: $1" ;;
    esac
  done
  [ -n "$run" ] || die2 "--run-id required"
  [[ "$run" =~ ^[A-Za-z0-9._-]+$ ]] && [[ "$run" != *..* ]] || die2 "--run-id must be [A-Za-z0-9._-]: $run"
  [[ "$iter" =~ ^[0-9]+$ ]] || die2 "--iteration must be a whole number: $iter"
  [[ "$REPEATS" =~ ^[0-9]+$ ]] && [ "$REPEATS" -ge 1 ] || die2 "CFN_LOOP_BRAKE_REPEATS must be >= 1: $REPEATS"
  [ -n "$out" ] || die2 "--test-output required"
  [ -f "$out" ] || die2 "test output not found: $out"

  local lines fp
  lines="$(failing_lines "$out")"
  if [ -n "$lines" ]; then
    fp="$(printf '%s\n' "$lines" | cksum | awk '{print $1}')"
  elif [[ "$pass" =~ ^[0-9]+$ ]] && [[ "$total" =~ ^[0-9]+$ ]]; then
    fp="counts-$pass-$total"
  else
    fp="none"
  fi

  mkdir -p "$STATE_DIR"
  local ledger="$STATE_DIR/$run.tsv" tmp
  tmp="$(mktemp "$STATE_DIR/.$run.XXXXXX")"
  # Keep every other iteration's row, then this one; order by iteration.
  if [ -f "$ledger" ]; then
    awk -F'\t' -v it="$iter" '$1 != it' "$ledger" > "$tmp"
  fi
  printf '%s\t%s\n' "$iter" "$fp" >> "$tmp"
  sort -t$'\t' -k1,1n "$tmp" > "$tmp.sorted" && mv "$tmp.sorted" "$ledger"
  rm -f "$tmp"

  # Streak: this iteration plus the unbroken run of identical fingerprints
  # immediately before it.
  local streak
  streak="$(awk -F'\t' -v it="$iter" '$1 <= it { fps[++n] = $2 }
    END { s = 0; for (i = n; i >= 1 && fps[i] == fps[n]; i--) s++; print s }' "$ledger")"

  local brake=false rc=0
  if [ "$fp" != "none" ] && [ "$streak" -gt "$REPEATS" ]; then
    brake=true; rc=1
  fi

  printf '%s\n' "$lines" | head -20 | jq -R -s -c \
    --arg run "$run" --argjson it "$iter" --arg fp "$fp" \
    --argjson streak "$streak" --argjson rep "$REPEATS" --argjson brake "$brake" \
    '{run_id: $run, iteration: $it, fingerprint: $fp, streak: $streak,
      repeats_allowed: $rep, brake: $brake,
      failing: (split("\n") | map(select(length > 0)))}'

  if [ "$brake" = true ]; then
    echo "loop-brake: same failures for $streak rounds in a row (run $run, round $iter). Stop and escalate." >&2
  fi
  return "$rc"
}

case "${1:-}" in
  record) shift; cmd_record "$@" ;;
  ''|-h|--help) usage ;;
  *) die2 "unknown command: $1 (expected: record)" ;;
esac
