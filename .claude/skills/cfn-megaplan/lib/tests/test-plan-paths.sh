#!/usr/bin/env bash
# test-plan-paths.sh - contract tests for the per-plan directory resolver.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PP="$SCRIPT_DIR/../plan-paths.sh"

PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  PASS: $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  FAIL: $1"; echo "        expected: $2"; echo "        actual:   $3"; }
eq()   { [ "$2" = "$3" ] && ok "$1" || bad "$1" "$2" "$3"; }

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
cd "$TMP"

echo "== plan-paths.sh =="

# dir / ensure: writers always get the nested path
eq "dir returns nested path"        "planning/my_plan"  "$("$PP" dir my_plan)"
out=$("$PP" ensure my_plan)
eq "ensure returns nested path"     "planning/my_plan"  "$out"
[ -d planning/my_plan ] && ok "ensure created the directory" || bad "ensure created the directory" "dir exists" "missing"

# resolve: nested wins
mkdir -p planning/my_plan
echo x > planning/my_plan/VERIFY_my_plan.md
eq "resolve finds nested" "planning/my_plan/VERIFY_my_plan.md" "$("$PP" resolve my_plan VERIFY_my_plan.md)"

# resolve: legacy flat fallback
echo x > planning/PLAN_legacy.md
eq "resolve falls back to flat (legacy)" "planning/PLAN_legacy.md" "$("$PP" resolve legacy PLAN_legacy.md)"

# resolve: nested beats flat when both exist
mkdir -p planning/dupe
echo nested > planning/dupe/SPEC_dupe.md
echo flat   > planning/SPEC_dupe.md
eq "nested wins over flat" "planning/dupe/SPEC_dupe.md" "$("$PP" resolve dupe SPEC_dupe.md)"

# resolve: missing -> exit 1, still prints the canonical path
out=$("$PP" resolve ghost SPEC_ghost.md); rc=$?
eq "missing resolve exits 1" "1" "$rc"
eq "missing resolve prints canonical path" "planning/ghost/SPEC_ghost.md" "$out"

# resolve: hidden sidecars resolve like any other basename
: > planning/my_plan/.VERIFY_my_plan.sha256
eq "resolve finds hidden sidecar" "planning/my_plan/.VERIFY_my_plan.sha256" \
   "$("$PP" resolve my_plan .VERIFY_my_plan.sha256)"

# write: creates the parent dir and returns the nested path
eq "write returns nested path" "planning/fresh/PLAN_fresh.md" "$("$PP" write fresh PLAN_fresh.md)"
[ -d planning/fresh ] && ok "write created the directory" || bad "write created the directory" "dir exists" "missing"

# newest: searches nested dirs AND the flat legacy root
: > planning/my_plan/PLAN_my_plan.md
sleep 1
: > planning/PLAN_legacy.md
eq "newest sees the flat legacy plan"  "planning/PLAN_legacy.md" "$("$PP" newest 'PLAN_*.md')"
sleep 1
: > planning/my_plan/PLAN_my_plan.md
eq "newest sees the nested plan"       "planning/my_plan/PLAN_my_plan.md" "$("$PP" newest 'PLAN_*.md')"

# slug-of: both layouts
eq "slug-of nested path" "my_plan" "$("$PP" slug-of planning/my_plan/VERIFY_my_plan.md)"
eq "slug-of flat path"   "legacy"  "$("$PP" slug-of planning/PLAN_legacy.md)"
eq "slug-of hidden flat sidecar" "legacy" "$("$PP" slug-of planning/.VERIFY_legacy.sha256)"

# CFN_PLANNING_ROOT override
eq "honors CFN_PLANNING_ROOT" "docs/plans/x" "$(CFN_PLANNING_ROOT=docs/plans "$PP" dir x)"

# usage errors exit 2
"$PP" bogus >/dev/null 2>&1; eq "unknown subcommand exits 2" "2" "$?"
"$PP" resolve onlyslug >/dev/null 2>&1; eq "resolve missing arg exits 2" "2" "$?"

# --- sourcing contract (cfn-workbench sources this; it must not flip shell options) ---
before=$(set +o | md5sum)
# shellcheck disable=SC1090
source "$PP"
after=$(set +o | md5sum)
eq "sourcing does not change shell options" "$before" "$after"
[ "$(type -t plan_resolve)" = "function" ] && ok "sourcing defines plan_resolve" \
  || bad "sourcing defines plan_resolve" "function" "$(type -t plan_resolve)"
eq "sourced plan_resolve resolves nested" "planning/my_plan/VERIFY_my_plan.md" \
   "$(plan_resolve my_plan VERIFY_my_plan.md)"

# CFN_PLANNING_ROOT is read per call, so one sourced copy can serve several roots
mkdir -p other/planning/rooted
: > other/planning/rooted/SPEC_rooted.md
eq "sourced call honors a re-pointed root" "other/planning/rooted/SPEC_rooted.md" \
   "$(CFN_PLANNING_ROOT=other/planning plan_resolve rooted SPEC_rooted.md)"
eq "root re-point does not leak to the next call" "planning/my_plan/VERIFY_my_plan.md" \
   "$(plan_resolve my_plan VERIFY_my_plan.md)"

echo
echo "passed: $PASS  failed: $FAIL"
[ "$FAIL" -eq 0 ]
