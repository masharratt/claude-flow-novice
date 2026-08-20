#!/usr/bin/env bash
# Tests for check-phase-width.sh (phase/lane width cap: steps + distinct files per step-number major).
# Regression source: 2026-08-19 loop-task incident — a 48-step single-phase lane ("C-core")
# ran serially 2+ hours on one agent; file-cluster analysis showed a legal 4-lane split (~3x).
# The mechanical "one lane per phase" rule needs plans whose phases are already lane-sized.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECK="$SCRIPT_DIR/../check-phase-width.sh"
FIX="$SCRIPT_DIR/fixtures-pw"

PASS=0; FAIL=0
run() { # label args... -- expected_exit expect_substr(optional)
  local label="$1"; shift
  local args=()
  while [ "$1" != "--" ]; do args+=("$1"); shift; done
  shift
  local exp_exit="$1" substr="${2:-}"
  local out ec
  out="$("$CHECK" "${args[@]}" 2>&1)"; ec=$?
  local ok=1
  [ "$ec" = "$exp_exit" ] || ok=0
  if [ -n "$substr" ]; then echo "$out" | grep -qF "$substr" || ok=0; fi
  if [ "$ok" = 1 ]; then PASS=$((PASS+1)); printf 'ok   %s\n' "$label"
  else FAIL=$((FAIL+1)); printf 'FAIL %s (exit=%s want=%s)\n     out=%s\n' "$label" "$ec" "$exp_exit" "$out"; fi
}

# ---- clean plan ----
run "all majors under caps: exit 0, empty findings" "$FIX/plan-width-ok.md" -- 0 "[]"

# ---- usage / missing file ----
"$CHECK" >/dev/null 2>&1; ec=$?
if [ "$ec" = 2 ]; then PASS=$((PASS+1)); echo "ok   no-arg exits 2"
else FAIL=$((FAIL+1)); echo "FAIL no-arg exits 2 (got $ec)"; fi
run "missing file: exit 2" "$FIX/does-not-exist.md" -- 2

# ---- no step table: vacuous pass, exit 0 ----
run "no step rows: exit 0" "$FIX/plan-width-notable.md" -- 0 "[]"

# ---- step-count cap (default 15) ----
run "16 steps in one major: exit 1" "$FIX/plan-width-wide-steps.md" -- 1 '"field":"steps"'
run "steps finding names the phase" "$FIX/plan-width-wide-steps.md" -- 1 '"ac_id":"phase-2"'
run "steps finding says split by file cluster" "$FIX/plan-width-wide-steps.md" -- 1 "cluster"

# ---- suffix rows (2.7a) count into their major ----
run "15 numbered + one suffix row = 16: exit 1" "$FIX/plan-width-suffix.md" -- 1 '"field":"steps"'

# ---- distinct-file cap (default 8) ----
run "9 distinct files in one major: exit 1" "$FIX/plan-width-wide-files.md" -- 1 '"field":"files"'
out="$("$CHECK" "$FIX/plan-width-wide-files.md" 2>/dev/null)"
if ! echo "$out" | grep -qF '"field":"steps"'; then PASS=$((PASS+1)); echo "ok   wide-files emits files finding only"
else FAIL=$((FAIL+1)); echo "FAIL wide-files emits files finding only (out=$out)"; fi

# ---- comma-separated File cells: distinct union, shared file counted once ----
run "multifile cells: 9 distinct files across 2 steps: exit 1" "$FIX/plan-width-multifile.md" -- 1 '"field":"files"'
out="$("$CHECK" "$FIX/plan-width-multifile.md" 2>/dev/null)"
if echo "$out" | grep -qF "9 distinct files"; then PASS=$((PASS+1)); echo "ok   multifile: dedups shared file (5+5 files, 1 shared = 9)"
else FAIL=$((FAIL+1)); echo "FAIL multifile: dedups shared file (out=$out)"; fi

# ---- threshold overrides ----
run "--max-steps 1 flips clean plan to error" "$FIX/plan-width-ok.md" --max-steps 1 -- 1 '"field":"steps"'
run "--max-files 1 flips clean plan to error" "$FIX/plan-width-ok.md" --max-files 1 -- 1 '"field":"files"'
run "--max-steps 99 --max-files 99 passes wide fixtures" "$FIX/plan-width-wide-steps.md" --max-steps 99 --max-files 99 -- 0 "[]"

echo "---"
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = 0 ]
