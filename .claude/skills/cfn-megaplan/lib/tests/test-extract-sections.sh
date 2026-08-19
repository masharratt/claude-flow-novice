#!/usr/bin/env bash
# Tests for extract-sections.sh (part-scoped section/table-row extraction, program mode).
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXTRACT="$SCRIPT_DIR/../extract-sections.sh"
FIX="$SCRIPT_DIR/fixtures-extract"
SPEC="$FIX/SPEC_prog.md"

PASS=0; FAIL=0

run() { # label part expected_exit expect_substr(optional, prefix "!" for absence)
  local label="$1" part="$2" exp_exit="$3" substr="${4:-}"
  local out ec ok
  out="$("$EXTRACT" "$SPEC" "$part" 2>/dev/null)"; ec=$?
  ok=1
  [ "$ec" = "$exp_exit" ] || ok=0
  if [ -n "$substr" ]; then
    if [[ "$substr" == !* ]]; then
      echo "$out" | grep -qF -- "${substr#!}" && ok=0
    else
      echo "$out" | grep -qF -- "$substr" || ok=0
    fi
  fi
  if [ "$ok" = 1 ]; then PASS=$((PASS+1)); printf 'ok   %s\n' "$label"
  else FAIL=$((FAIL+1)); printf 'FAIL %s (exit=%s want=%s)\n     out=%s\n' "$label" "$ec" "$exp_exit" "$out"; fi
}

run_diff() { # label part expected_file
  local label="$1" part="$2" expfile="$3"
  local tmp
  tmp="$(mktemp)"
  "$EXTRACT" "$SPEC" "$part" > "$tmp" 2>/dev/null
  if diff -q "$expfile" "$tmp" >/dev/null 2>&1; then
    PASS=$((PASS+1)); printf 'ok   %s\n' "$label"
  else
    FAIL=$((FAIL+1)); printf 'FAIL %s (diff below)\n' "$label"
    diff "$expfile" "$tmp" | sed 's/^/     /'
  fi
  rm -f "$tmp"
}

# (a) section tagged [part: B1] kept for B1, dropped for B0
run "a: B1-tagged API section kept for B1"    B1 0 "## API Contract [part: B1]"
run "a: B1-tagged API section dropped for B0" B0 0 "!## API Contract [part: B1]"

# (b) untagged section kept for every part
run "b: untagged Rollout Plan kept for B0" B0 0 "## Rollout Plan"
run "b: untagged Rollout Plan kept for B1" B1 0 "## Rollout Plan"
run "b: untagged Rollout Plan kept for B2" B2 0 "## Rollout Plan"

# (c) [part: shared] kept for every part
run "c: shared Utilities kept for B0" B0 0 "## Shared Utilities [part: shared]"
run "c: shared Utilities kept for B1" B1 0 "## Shared Utilities [part: shared]"
run "c: shared Utilities kept for B2" B2 0 "## Shared Utilities [part: shared]"

# (d) multi-tag [part: B0, B2] kept for B0 and B2, dropped for B1
run "d: multi-tag Data Model kept for B0"    B0 0 "## Data Model [part: B0, B2]"
run "d: multi-tag Data Model kept for B2"    B2 0 "## Data Model [part: B0, B2]"
run "d: multi-tag Data Model dropped for B1" B1 0 "!## Data Model [part: B0, B2]"

# (e) table row tagging: matching row kept, non-matching dropped, header/separator/untagged rows always kept in a kept table
run "e: B0 table row (owner_id) kept for B0"    B0 0 "fk to users [part: B0]"
run "e: B0 table row (region) dropped for B0"   B0 0 "!geo partition [part: B2]"
run "e: B2 table row (owner_id) dropped for B2" B2 0 "!fk to users [part: B0]"
run "e: table header kept for B0"               B0 0 "| Field | Type | Notes |"
run "e: table separator kept for B2"            B2 0 "|---|---|---|"
run "e: untagged table row kept for B1"         B1 0 "| 1 | infra | provisioning, no tag |"

# (f) unknown part id (appears nowhere in the file) exits 2
"$EXTRACT" "$SPEC" ZZZ >/dev/null 2>&1
ec=$?
if [ "$ec" = 2 ]; then PASS=$((PASS+1)); echo "ok   f: unknown part id exits 2"
else FAIL=$((FAIL+1)); echo "FAIL f: unknown part id exits 2 (got $ec)"; fi

# shared alone never makes an id known: requesting "shared" itself is unknown
"$EXTRACT" "$SPEC" shared >/dev/null 2>&1
ec=$?
if [ "$ec" = 2 ]; then PASS=$((PASS+1)); echo "ok   f: 'shared' alone is not a known part id, exits 2"
else FAIL=$((FAIL+1)); echo "FAIL f: 'shared' alone should exit 2 (got $ec)"; fi

# (g) --list-parts prints the distinct part ids, one per line, sorted (byte-exact)
run_diff "g: --list-parts sorted distinct ids" --list-parts "$FIX/expected-list-parts.txt"

# (h) nested heading scope: ## section ends at next ## or #; ### children follow the parent's tag
run "h: Migration Notes (child of B0/B2) kept for B0"    B0 0 "### Migration Notes"
run "h: Migration Notes (child of B0/B2) kept for B2"    B2 0 "### Migration Notes"
run "h: Migration Notes (child of B0/B2) dropped for B1" B1 0 "!### Migration Notes"
run "h: Error Codes (child of B1) kept for B1"           B1 0 "### Error Codes"
run "h: Error Codes (child of B1) dropped for B0"        B0 0 "!### Error Codes"
run "h: Error Codes (child of B1) dropped for B2"        B2 0 "!### Error Codes"

# byte-exact full extraction diffs (>= 2 cases, using 3 for coverage of a/b/c/d/e/h together)
run_diff "full extract B0 matches fixture" B0 "$FIX/expected-B0.md"
run_diff "full extract B1 matches fixture" B1 "$FIX/expected-B1.md"
run_diff "full extract B2 matches fixture" B2 "$FIX/expected-B2.md"

# usage / missing file
"$EXTRACT" >/dev/null 2>&1; [ $? = 2 ] && { PASS=$((PASS+1)); echo "ok   no-arg exits 2"; } || { FAIL=$((FAIL+1)); echo "FAIL no-arg exits 2"; }
"$EXTRACT" "$SPEC" >/dev/null 2>&1; [ $? = 2 ] && { PASS=$((PASS+1)); echo "ok   missing part-id arg exits 2"; } || { FAIL=$((FAIL+1)); echo "FAIL missing part-id arg exits 2"; }
"$EXTRACT" /nonexistent/nope.md B0 >/dev/null 2>&1; [ $? = 2 ] && { PASS=$((PASS+1)); echo "ok   missing-file exits 2"; } || { FAIL=$((FAIL+1)); echo "FAIL missing-file exits 2"; }

echo "---"
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = 0 ]
