#!/usr/bin/env bash
# tests/test-skill-usage-tracker.sh — TDD suite for the Skill Usage Tracker.
#
# Covers the PostToolUse hook (.claude/hooks/cfn-track-skill-usage.sh) and the
# report CLI (.claude/cfn-scripts/skill-usage-report.sh). Uses a /tmp SQLite DB
# via the CFN_SKILL_USAGE_DB env override so the live DB is never touched
# (Test Database Safety: tests never write to shared state).
#
# Run: bash tests/test-skill-usage-tracker.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

export CFN_SKILL_USAGE_DB="$TMP/test.sqlite"
export CFN_SKILL_USAGE_ERRLOG="$TMP/errors.log"

HOOK="$ROOT/.claude/hooks/cfn-track-skill-usage.sh"
REPORT="$ROOT/.claude/cfn-scripts/skill-usage-report.sh"

pass=0; fail=0
check(){ if eval "$1"; then echo "PASS: $2"; pass=$((pass+1)); else echo "FAIL: $2"; fail=$((fail+1)); fi; }

echo "== case (a): positive Skill event records one row =="
printf '%s' '{"tool_name":"Skill","tool_input":{"skill":"cfn-decide"},"cwd":"/tmp/foo","session_id":"s1"}' | "$HOOK"
cnt_a=$(sqlite3 "$CFN_SKILL_USAGE_DB" "SELECT COUNT(*) FROM skill_usage")
norm_a=$(sqlite3 "$CFN_SKILL_USAGE_DB" "SELECT skill_norm FROM skill_usage WHERE skill_norm='cfn-decide' LIMIT 1")
check "[ '$cnt_a' = '1' ]" "case (a): one row recorded"
check "[ '$norm_a' = 'cfn-decide' ]" "case (a): skill_norm normalized to cfn-decide"

echo "== case (b): non-Skill tool events are filtered out =="
printf '%s' '{"tool_name":"Bash","tool_input":{"command":"ls"},"cwd":"/tmp","session_id":"s2"}' | "$HOOK"
cnt_b=$(sqlite3 "$CFN_SKILL_USAGE_DB" "SELECT COUNT(*) FROM skill_usage")
check "[ '$cnt_b' = '1' ]" "case (b): Bash event writes no new row"

echo "== case (c): namespaced skill name is stripped to skill_norm =="
printf '%s' '{"tool_name":"Skill","tool_input":{"skill":"cfn-codesearch:cfn-codebase-search"},"cwd":"/tmp/ns","session_id":"s3"}' | "$HOOK"
norm_c=$(sqlite3 "$CFN_SKILL_USAGE_DB" "SELECT skill_norm FROM skill_usage WHERE skill_norm='cfn-codebase-search' LIMIT 1")
check "[ '$norm_c' = 'cfn-codebase-search' ]" "case (c): namespace stripped to cfn-codebase-search"

echo "== case (d): 20 concurrent fires all land (WAL + busy_timeout) =="
for i in $(seq 1 20); do
  ( printf '{"tool_name":"Skill","tool_input":{"skill":"cfn-burst"},"cwd":"/tmp/burst","session_id":"burst-%s"}' "$i" | "$HOOK" >/dev/null 2>&1 ) &
done
wait || true
cnt_d=$(sqlite3 "$CFN_SKILL_USAGE_DB" "SELECT COUNT(*) FROM skill_usage")
check "[ '$cnt_d' = '22' ]" "case (d): total rows == 22 (base 2 from cases a+c + 20 concurrent; case b filtered)"
errlog_empty=0; [ ! -s "$CFN_SKILL_USAGE_ERRLOG" ] && errlog_empty=1
check "[ $errlog_empty -eq 1 ]" "case (d): error log empty under concurrency"

echo "== case (e): report used/unused/top/json modes =="
default_out=$("$REPORT" 2>/dev/null || true)
decide_in=0; case "$default_out" in *"cfn-decide"*) decide_in=1 ;; esac
burst_in=0;  case "$default_out" in *"cfn-burst"*)  burst_in=1 ;; esac
check "[ $decide_in -eq 1 ]" "case (e): default table lists used cfn-decide"
check "[ $burst_in -eq 1 ]"  "case (e): default table lists used cfn-burst"

unused_out=$("$REPORT" --unused 2>/dev/null || true)
decide_absent=0; case "$unused_out" in *"cfn-decide"*) decide_absent=1 ;; esac
burst_absent=0;  case "$unused_out" in *"cfn-burst"*)  burst_absent=1 ;; esac
unused_skill_lines=$(printf '%s\n' "$unused_out" | grep -v '^Total skills:' | grep -c . || true)
check "[ $decide_absent -eq 0 ]" "case (e): --unused omits used cfn-decide"
check "[ $burst_absent -eq 0 ]"  "case (e): --unused omits used cfn-burst"
check "[ '$unused_skill_lines' -ge '1' ]" "case (e): --unused lists real unused skills from inventory"

top_out=$("$REPORT" --top 2 2>/dev/null || true)
burst_top=0; case "$top_out" in *"cfn-burst"*) burst_top=1 ;; esac
check "[ $burst_top -eq 1 ]" "case (e): --top 2 includes cfn-burst (20 uses)"

json_out=$("$REPORT" --json 2>/dev/null || true)
if printf '%s' "$json_out" | python3 -m json.tool >/dev/null 2>&1; then json_ok=1; else json_ok=0; fi
check "[ $json_ok -eq 1 ]" "case (e): --json emits valid JSON"

echo "== case (f): malformed JSON never blocks (exit 0, no row) =="
before_f=$(sqlite3 "$CFN_SKILL_USAGE_DB" "SELECT COUNT(*) FROM skill_usage")
set +e
printf '%s' '{bad' | "$HOOK" >/dev/null 2>&1
rc_f=$?
set -e
after_f=$(sqlite3 "$CFN_SKILL_USAGE_DB" "SELECT COUNT(*) FROM skill_usage")
check "[ $rc_f -eq 0 ]" "case (f): malformed JSON returns exit 0 (never-block)"
check "[ '$before_f' = '$after_f' ]" "case (f): malformed JSON writes no row"

echo "RESULTS: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
