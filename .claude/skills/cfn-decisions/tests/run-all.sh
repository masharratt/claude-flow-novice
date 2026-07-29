#!/usr/bin/env bash
# tests/run-all.sh - cfn-decisions writer test aggregator.
# Runs every test file in TDD red-first ordering (AC-2 cardinality and AC-4
# atomic RED FIRST). Exits non-zero if any file fails. No watch mode, no bail.
set -uo pipefail

TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$TEST_DIR/../../.." && pwd)"
export REPO_ROOT

# TDD ordering: AC-2 (cardinality) + AC-4 (atomic) first so RED state
# surfaces before any other test obscures the regression.
ORDER=(
  # RED-FIRST: distinguishing invariants
  20-upsert-by-key.sh        # AC-2 cardinality
  40-atomic-write.sh         # AC-4 atomic write

  # Happy path: insert
  10-insert-new.sh           # AC-1

  # Validation / refusal
  95-defaults.sh             # AC-16/53/57 (defaults)
  96-actor-enum.sh           # AC-17 (actor enum)
  30-refuse-missing.sh       # AC-3/42 (missing fields)

  # Exit-taxonomy: per-code
  31-exit-2-cli-parse.sh     # AC-20/58
  32-exit-3-jq-build.sh      # AC-21 (static)
  33-exit-4-filesystem.sh    # AC-22/51
  34-exit-5-target-corrupt.sh # AC-23
  35-exit-6-reserved.sh      # AC-24 (static)

  # State machine
  40-sm-transitions.sh       # AC-25..34

  # Dual-write
  50-dual-write-happy.sh     # AC-5
  51-dual-write-sink-nonzero.sh # AC-6/37
  52-dual-write-sink-missing.sh # AC-7/37
  53-sink-hang-timeout.sh    # AC-66 (timeout)

  # Concurrency / atomicity robustness
  41-concurrency-race.sh     # AC-49 EC-6
  42-reader-during-write.sh  # AC-50 EC-7
  43-dst-boundary.sh         # AC-59 EC-20

  # Hostile input / hardening
  60-jq-construction.sh      # AC-8/44 EC-13/14
  61-sql-injection.sh        # AC-45
  62-unicode-roundtrip.sh    # AC-46/ADV-1 EC-21
  63-oversized-10k.sh        # AC-47/ADV-2 EC-4
  64-em-dash-caller.sh       # AC-48 EC-22

  # No-destructive-surface
  80-no-delete-surface.sh    # AC-14/56

  # Observability / info-leak floor
  90-no-leak-floor.sh        # AC-15/39 FR-9
  obs-1-success-line.sh      # AC-35 OBS-1
  obs-6-parity.sh            # AC-40 OBS-6
  obs-7-divergence.sh        # AC-41 OBS-7

  # Renderer contract / manual invocation
  70-renderer-contract.sh    # AC-52
  71-manual-invocation.sh    # AC-54 EC-12

  # Hook wrapper (coordinator->writer bridge; runtime proof for the 3 FR-7 sites)
  72-hook-wrapper.sh         # AC-9/10/11/13/38 (sites 1/2/3 + D-8 + OBS-4)

  # Volume + perf
  81-volume-100.sh           # AC-55/NFR-3 EC-15
  82-volume-1000.sh          # AC-60/NFR-3 EC-23

  # Wiring
  w-1-writer-wired.sh        # AC-61
  w-3-sink-wired.sh          # AC-63
  w-4-renderer-wired.sh      # AC-64
  w-5-timeout-wrapper.sh     # AC-65
)

FAIL_COUNT=0
PASS_COUNT=0
RUN_COUNT=0
FAILED_FILES=()

for t in "${ORDER[@]}"; do
  path="$TEST_DIR/$t"
  if [ ! -f "$path" ]; then
    echo "MISSING: $t"
    FAILED_FILES+=("$t (missing)")
    FAIL_COUNT=$((FAIL_COUNT+1))
    continue
  fi
  RUN_COUNT=$((RUN_COUNT+1))
  echo
  echo "===== RUN: $t ====="
  if bash "$path"; then
    PASS_COUNT=$((PASS_COUNT+1))
    echo "===== PASS: $t ====="
  else
    FAIL_COUNT=$((FAIL_COUNT+1))
    FAILED_FILES+=("$t")
    echo "===== FAIL: $t ====="
  fi
done

echo
echo "============================================================"
echo "TOTAL: $((PASS_COUNT+FAIL_COUNT))  PASS: $PASS_COUNT  FAIL: $FAIL_COUNT"
if [ "$FAIL_COUNT" -gt 0 ]; then
  echo "FAILED FILES:"
  for f in "${FAILED_FILES[@]}"; do
    echo "  - $f"
  done
  exit 1
fi
echo "ALL GREEN"
exit 0
