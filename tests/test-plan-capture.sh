#!/usr/bin/env bash
# Tests for .claude/hooks/cfn-plan-capture.sh
# Contract: PostToolUse hook on EnterPlanMode / ExitPlanMode makes native plan mode
# emit cfn-loop-task-friendly artifacts (planning/PLAN_<slug>.md + follow-on manifest order).
set -uo pipefail

HOOK="$(cd "$(dirname "$0")/.." && pwd)/.claude/hooks/cfn-plan-capture.sh"
PASS=0; FAIL=0

ok()   { PASS=$((PASS+1)); echo "PASS: $1"; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL: $1"; echo "      $2"; }
check() { # name, haystack, needle
  case "$2" in *"$3"*) ok "$1";; *) bad "$1" "missing: $3";; esac
}

WORK="$(mktemp -d /tmp/plan-capture-test-XXXXXX)"
trap 'rm -rf "$WORK"' EXIT

run_hook() { # cwd, json
  printf '%s' "$2" | (cd "$1" && bash "$HOOK")
}

# --- T1: ExitPlanMode writes planning/PLAN_<slug>.md derived from the H1 -------
mkdir -p "$WORK/t1"
IN=$(jq -nc '{tool_name:"ExitPlanMode",tool_input:{plan:"# Implementation Plan: Rate Limit Middleware\n\nstep one\n"}}')
OUT=$(run_hook "$WORK/t1" "$IN")
if [ -f "$WORK/t1/planning/PLAN_rate_limit_middleware.md" ]; then
  ok "T1 writes planning/PLAN_<slug>.md from H1"
else
  bad "T1 writes planning/PLAN_<slug>.md from H1" "found: $(ls "$WORK/t1/planning" 2>&1)"
fi
check "T1 preserves plan body" "$(cat "$WORK/t1/planning/PLAN_rate_limit_middleware.md" 2>/dev/null)" "step one"

# --- T2: emits PostToolUse additionalContext naming the whole manifest chain ---
check "T2 emits PostToolUse hookEventName" "$OUT" '"hookEventName": "PostToolUse"'
check "T2 orders produce/consume check"    "$OUT" "check-produce-consume.sh"
check "T2 orders VERIFY manifest"          "$OUT" "planning/VERIFY_rate_limit_middleware.md"
check "T2 orders static bar check"         "$OUT" "check-verifiable-static.sh"
check "T2 orders sha256 sidecar"           "$OUT" ".VERIFY_rate_limit_middleware.sha256"
check "T2 chains into loop-task"           "$OUT" "/cfn-loop-task"
if printf '%s' "$OUT" | jq -e . >/dev/null 2>&1; then
  ok "T2 output is valid JSON"
else
  bad "T2 output is valid JSON" "$OUT"
fi

# --- T3: never clobbers an existing PLAN file --------------------------------
mkdir -p "$WORK/t3/planning"
printf 'ORIGINAL CONFORMING PLAN\n' > "$WORK/t3/planning/PLAN_rate_limit_middleware.md"
OUT3=$(run_hook "$WORK/t3" "$IN")
if grep -q 'ORIGINAL CONFORMING PLAN' "$WORK/t3/planning/PLAN_rate_limit_middleware.md"; then
  ok "T3 existing PLAN not overwritten"
else
  bad "T3 existing PLAN not overwritten" "file was clobbered"
fi
if [ -f "$WORK/t3/planning/.raw_PLAN_rate_limit_middleware.md" ]; then
  ok "T3 new plan parked as .raw_PLAN_*"
else
  bad "T3 new plan parked as .raw_PLAN_*" "found: $(ls -a "$WORK/t3/planning")"
fi
check "T3 asks for reconcile" "$OUT3" "reconcile"

# --- T4: EnterPlanMode injects the plan-shaping contract, writes nothing ------
mkdir -p "$WORK/t4"
OUT4=$(run_hook "$WORK/t4" "$(jq -nc '{tool_name:"EnterPlanMode",tool_input:{}}')")
check "T4 demands Produces column" "$OUT4" "Produces"
check "T4 demands Consumes column" "$OUT4" "Consumes"
check "T4 demands H1 title"        "$OUT4" "# Implementation Plan:"
if [ ! -d "$WORK/t4/planning" ]; then
  ok "T4 writes no files"
else
  bad "T4 writes no files" "created $(ls "$WORK/t4/planning")"
fi

# --- T5: slug sanitation (punctuation, case, spaces collapse) ----------------
mkdir -p "$WORK/t5"
run_hook "$WORK/t5" "$(jq -nc '{tool_name:"ExitPlanMode",tool_input:{plan:"# Implementation Plan: Fix OAuth2 / PKCE!! flow\n\nbody\n"}}')" >/dev/null
if [ -f "$WORK/t5/planning/PLAN_fix_oauth2_pkce_flow.md" ]; then
  ok "T5 slug sanitised"
else
  bad "T5 slug sanitised" "found: $(ls "$WORK/t5/planning" 2>&1)"
fi

# --- T6: unrelated tool is a no-op -------------------------------------------
mkdir -p "$WORK/t6"
OUT6=$(run_hook "$WORK/t6" "$(jq -nc '{tool_name:"Edit",tool_input:{file_path:"x"}}')")
if [ -z "$OUT6" ] && [ ! -d "$WORK/t6/planning" ]; then
  ok "T6 non-plan tool is no-op"
else
  bad "T6 non-plan tool is no-op" "out=$OUT6"
fi

# --- T7: empty plan degrades silently, never blocks ---------------------------
mkdir -p "$WORK/t7"
OUT7=$(run_hook "$WORK/t7" "$(jq -nc '{tool_name:"ExitPlanMode",tool_input:{plan:""}}')")
RC7=$?
if [ "$RC7" -eq 0 ]; then ok "T7 empty plan exits 0"; else bad "T7 empty plan exits 0" "rc=$RC7"; fi

# --- T8: chain auto-triggers plan review ------------------------------------
check "T8 orders cfn-plan-review" "$OUT" "cfn-plan-review"
check "T8 plan review precedes VERIFY" \
  "$(printf '%s' "$OUT" | grep -o 'cfn-plan-review.*VERIFY_rate_limit_middleware.md' | head -1)" "cfn-plan-review"

# --- T9: bar paths are absolute so the chain works from any project ----------
check "T9 bars path resolves under \$HOME" "$OUT" "$HOME/.claude/skills/cfn-megaplan/bars/check-produce-consume.sh"
if printf '%s' "$OUT" | grep -q '"[^"]*\s\.claude/skills/cfn-megaplan'; then
  bad "T9 no bare relative bars path" "relative .claude/skills path leaked into context"
else
  ok "T9 no bare relative bars path"
fi

echo
echo "passed: $PASS  failed: $FAIL"
[ "$FAIL" -eq 0 ]
