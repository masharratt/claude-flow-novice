#!/usr/bin/env bash
# Tests for run-ledger.sh: per-run signal row for Bar B tier + step amendments.
# Origin: "how will i know either happened?" (Bar B sonnet tier letting a WHAT
# gap through; HOW amendments hiding wiring drift). Neither had a signal.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$DIR/../run-ledger.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
export CFN_RUN_LEDGER="$WORK/loop-task-runs.jsonl"

RUN=0; PASS=0; FAIL=0
ok() { echo "PASS: $1"; PASS=$((PASS+1)); RUN=$((RUN+1)); }
no() { echo "FAIL: $1"; FAIL=$((FAIL+1)); RUN=$((RUN+1)); }
assert_exit() { if [ "$1" -eq "$2" ]; then ok "$3"; else no "$3 (exit $1 wanted $2)"; fi; }
assert_eq() { if [ "$1" = "$2" ]; then ok "$3"; else no "$3 (got '$1' wanted '$2')"; fi; }
assert_has() { if echo "$1" | grep -q -- "$2"; then ok "$3"; else no "$3 (missing '$2' in: $1)"; fi; }
assert_not() { if echo "$1" | grep -q -- "$2"; then no "$3 (unexpected '$2')"; else ok "$3"; fi; }

PDIR="$WORK/planning/demo"; mkdir -p "$PDIR"

cat > "$PDIR/MEGAPLAN_demo.md" <<'MD'
# MegaPlan: demo
Tier: beta   Build flags: frontend=no db=no   Generated: 2026-08-18

## Gates
- Bar A verifiable-done: PASS (3 ACs, FR 3/3, EC 1/1 mapped) -> planning/demo/VERIFY_demo.md
- Bar B haiku-executable: PASS (0 findings after 1 rounds, tier=sonnet)
MD

cat > "$PDIR/PLAN_demo.md" <<'MD'
# Plan
## Implementation Steps
| # | File (full path) | Change (exact: function name, typed signature, or config key) | Produces | Consumes | Failing test (from TEST_demo Phase 6) | Verify command (exits 0/1) | Done predicate |
|---|---|---|---|---|---|---|---|
| 1 | src/auth/token.ts | export function parseToken(raw: string): Token | src/auth/token.ts:parseToken | - | tests/token.test.ts | npm test -- token | parseToken exported |
| 2 | src/auth/session.ts | export function loadSession(id: string): Session | src/auth/session.ts:loadSession | src/auth/token.ts:parseToken | tests/session.test.ts | npm test -- session | loadSession exported |
| 3 | src/auth/format.ts | function pad(s: string): string | - | - | tests/format.test.ts | npm test -- format | pad returns padded |
MD

cat > "$WORK/run-plan-demo.json" <<'JSON'
{"slug":"demo","lanes":[{"id":"auth"},{"id":"format"}],
 "amendments":[
  {"step":"3","kind":"how","what":"used String.prototype.padStart instead of manual loop","why":"stdlib","lane":"format","iteration":1},
  {"step":"1","kind":"how","what":"parseToken now takes (raw: string, opts?: ParseOpts) instead of (raw: string)","why":"needed leeway flag","lane":"auth","iteration":1}
 ]}
JSON

cat > "$WORK/report-auth.json" <<'JSON'
{"lane":"auth","tests_written":4,"scoped_tests_passed":4,"scoped_tests_total":4,"files_modified":["src/auth/token.ts","src/auth/session.ts"],
 "out_of_scope_needs":[],"step_amendments":[],"blocked_on":"step 2 underspecified: which symbol loads the session store?","confidence":0.7}
JSON
cat > "$WORK/report-format.json" <<'JSON'
{"lane":"format","tests_written":1,"scoped_tests_passed":1,"scoped_tests_total":1,"files_modified":["src/auth/format.ts"],
 "out_of_scope_needs":["src/index.ts: re-export pad"],"step_amendments":[],"blocked_on":null,"confidence":0.95}
JSON

# ---- usage ----
"$SCRIPT" >/dev/null 2>&1; assert_exit $? 2 "no args exits 2"
"$SCRIPT" record --slug demo >/dev/null 2>&1; assert_exit $? 2 "record without --plan-dir exits 2"

# ---- record: full row ----
OUT=$("$SCRIPT" record --slug demo --plan-dir "$PDIR" --run-plan "$WORK/run-plan-demo.json" \
      --report "$WORK/report-auth.json" --report "$WORK/report-format.json" \
      --iterations 2 --outcome done 2>"$WORK/rec.err")
RC=$?
assert_exit $RC 0 "record exits 0"
[ -f "$CFN_RUN_LEDGER" ] && ok "ledger file created" || no "ledger file created"
ROW=$(tail -n1 "$CFN_RUN_LEDGER")
assert_eq "$(echo "$ROW" | jq -r .slug)" "demo" "row.slug"
assert_eq "$(echo "$ROW" | jq -r .tier)" "beta" "row.tier from MEGAPLAN"
assert_eq "$(echo "$ROW" | jq -r .bar_b_tier)" "sonnet" "row.bar_b_tier from MEGAPLAN Gates line"
assert_eq "$(echo "$ROW" | jq -r .lanes)" "2" "row.lanes"
assert_eq "$(echo "$ROW" | jq -r .iterations)" "2" "row.iterations"
assert_eq "$(echo "$ROW" | jq -r .outcome)" "done" "row.outcome"
assert_eq "$(echo "$ROW" | jq -r .blocked_on_count)" "1" "row.blocked_on_count"
assert_eq "$(echo "$ROW" | jq -r .spec_gap_count)" "1" "row.spec_gap_count (underspecified)"
assert_eq "$(echo "$ROW" | jq -r '.blocked_reasons|length')" "1" "row.blocked_reasons"
assert_eq "$(echo "$ROW" | jq -r .out_of_scope_count)" "1" "row.out_of_scope_count"
assert_eq "$(echo "$ROW" | jq -r .amendment_count)" "2" "row.amendment_count"
assert_eq "$(echo "$ROW" | jq -r .amendments_touching_produces)" "1" "row.amendments_touching_produces (parseToken)"
assert_eq "$(echo "$ROW" | jq -r '.produces_touched[0]')" "parseToken" "row.produces_touched names symbol"
assert_eq "$(echo "$ROW" | jq -r .project)" "$(basename "$(git rev-parse --show-toplevel 2>/dev/null || pwd)")" "row.project"
[ -n "$(echo "$ROW" | jq -r .ts)" ] && ok "row.ts present" || no "row.ts present"

# ---- record: stdout summary + flags ----
assert_has "$OUT" "bar_b_tier=sonnet" "summary line has bar_b_tier"
assert_has "$OUT" "amendments=2" "summary line has amendments"
assert_has "$OUT" "FLAG: bar_b_tier=sonnet" "flag: sonnet + spec-gap block"
assert_has "$OUT" "--bar-b=full" "flag suggests --bar-b=full"
assert_has "$OUT" "FLAG: 1 amendment" "flag: amendment touches Produces"
assert_has "$OUT" "check-produce-consume.sh" "flag suggests produce/consume check"
assert_has "$OUT" "parseToken" "flag names symbol"

# ---- record: clean run, no flags ----
cat > "$WORK/report-clean.json" <<'JSON'
{"lane":"auth","out_of_scope_needs":[],"step_amendments":[],"blocked_on":null,"confidence":0.9}
JSON
echo '{"slug":"demo","amendments":[]}' > "$WORK/run-plan-clean.json"
OUT2=$("$SCRIPT" record --slug demo --plan-dir "$PDIR" --run-plan "$WORK/run-plan-clean.json" \
       --report "$WORK/report-clean.json" --iterations 1 --outcome done 2>/dev/null)
assert_exit $? 0 "clean record exits 0"
assert_not "$OUT2" "FLAG:" "clean run: no flags"
assert_eq "$(wc -l < "$CFN_RUN_LEDGER")" "2" "ledger appends (2 rows)"

# ---- record: blocked but not spec-gap (external) ----
cat > "$WORK/report-ext.json" <<'JSON'
{"lane":"auth","out_of_scope_needs":[],"blocked_on":"redis container refused connection","confidence":0.5}
JSON
OUT3=$("$SCRIPT" record --slug demo --plan-dir "$PDIR" --run-plan "$WORK/run-plan-clean.json" \
       --report "$WORK/report-ext.json" --iterations 1 --outcome not_done 2>/dev/null)
ROW3=$(tail -n1 "$CFN_RUN_LEDGER")
assert_eq "$(echo "$ROW3" | jq -r .blocked_on_count)" "1" "ext block counted"
assert_eq "$(echo "$ROW3" | jq -r .spec_gap_count)" "0" "ext block not spec-gap"
assert_not "$OUT3" "--bar-b=full" "ext block: no tier flag"

# ---- record: --bar-b-tier override + no MEGAPLAN (non-megaplanned task) ----
PDIR2="$WORK/planning/loose"; mkdir -p "$PDIR2"
OUT4=$("$SCRIPT" record --slug loose --plan-dir "$PDIR2" --run-plan "$WORK/run-plan-clean.json" \
       --report "$WORK/report-clean.json" --iterations 1 --outcome done 2>/dev/null)
assert_exit $? 0 "no MEGAPLAN: still records"
ROW4=$(tail -n1 "$CFN_RUN_LEDGER")
assert_eq "$(echo "$ROW4" | jq -r .bar_b_tier)" "unknown" "no MEGAPLAN: bar_b_tier unknown"
assert_eq "$(echo "$ROW4" | jq -r .tier)" "unknown" "no MEGAPLAN: tier unknown"
"$SCRIPT" record --slug loose --plan-dir "$PDIR2" --run-plan "$WORK/run-plan-clean.json" \
   --report "$WORK/report-clean.json" --iterations 1 --outcome done --bar-b-tier full >/dev/null 2>&1
assert_eq "$(tail -n1 "$CFN_RUN_LEDGER" | jq -r .bar_b_tier)" "full" "--bar-b-tier override wins"

# ---- record: missing report file skipped, not fatal ----
"$SCRIPT" record --slug demo --plan-dir "$PDIR" --run-plan "$WORK/run-plan-clean.json" \
   --report "$WORK/does-not-exist.json" --iterations 1 --outcome done >/dev/null 2>&1
assert_exit $? 0 "missing report: exits 0"
assert_eq "$(tail -n1 "$CFN_RUN_LEDGER" | jq -r .lanes)" "0" "missing report: lanes=0"

# ---- record: plan drift blocked_on counts as spec gap ----
cat > "$WORK/report-drift.json" <<'JSON'
{"lane":"auth","blocked_on":"plan drift: step 2 done predicate names loadSession but AC-3 wants loadSessionOrNull","confidence":0.5}
JSON
"$SCRIPT" record --slug demo --plan-dir "$PDIR" --run-plan "$WORK/run-plan-clean.json" \
   --report "$WORK/report-drift.json" --iterations 1 --outcome not_done >/dev/null 2>&1
assert_eq "$(tail -n1 "$CFN_RUN_LEDGER" | jq -r .spec_gap_count)" "1" "plan drift counted as spec gap"

# ---- stats ----
STATS=$("$SCRIPT" stats 2>/dev/null); RC=$?
assert_exit $RC 0 "stats exits 0"
assert_has "$STATS" "sonnet" "stats groups by bar_b_tier: sonnet"
assert_has "$STATS" "full" "stats groups by bar_b_tier: full"
assert_has "$STATS" "unknown" "stats groups by bar_b_tier: unknown"
SONNET_RUNS=$(echo "$STATS" | jq -r '.[] | select(.bar_b_tier=="sonnet") | .runs')
assert_eq "$SONNET_RUNS" "5" "stats: sonnet run count"
SONNET_GAPS=$(echo "$STATS" | jq -r '.[] | select(.bar_b_tier=="sonnet") | .spec_gap_runs')
assert_eq "$SONNET_GAPS" "2" "stats: sonnet spec-gap runs"
STATS_S=$("$SCRIPT" stats --slug demo 2>/dev/null)
assert_eq "$(echo "$STATS_S" | jq -r '[.[].runs]|add')" "5" "stats --slug filters"

# ---- stats: empty ledger ----
CFN_RUN_LEDGER="$WORK/empty.jsonl" "$SCRIPT" stats >/dev/null 2>&1
assert_exit $? 0 "stats on missing ledger exits 0"

echo; echo "run=$RUN pass=$PASS fail=$FAIL"
[ "$FAIL" -eq 0 ]
