#!/usr/bin/env bash
# Tests for deferrals.sh (S006, origin: ROOTCAUSE_mpa_thread_wiring_gap.md).
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$DIR/../deferrals.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Redirect the script's storage root into the isolated WORK dir so tests never
# touch this repo's real planning/ directory (same isolation model as
# test-verify-run.sh, which passes an explicit --verify file under $WORK).
export CFN_DEFERRALS_DIR="$WORK"

RUN=0; PASS=0; FAIL=0
ok() { echo "PASS: $1"; PASS=$((PASS+1)); RUN=$((RUN+1)); }
no() { echo "FAIL: $1"; FAIL=$((FAIL+1)); RUN=$((RUN+1)); }
assert_exit() { if [ "$1" -eq "$2" ]; then ok "$3"; else no "$3 (exit $1 wanted $2)"; fi; }

deferrals_file() { echo "$WORK/.DEFERRALS_$1.json"; }

mkreport() { # filename  <json-body-on-stdin> -> writes $WORK/<filename>, prints path
  local f="$WORK/$1"
  cat > "$f"
  echo "$f"
}

# ---- record: basic write, two entries ----
REPORT=$(mkreport report-lane-a-1.json <<'JSON'
{"lane":"lane-a","tests_written":3,"scoped_tests_passed":3,"scoped_tests_total":3,
 "files_modified":["src/a.ts"],"phases_complete":["1"],
 "out_of_scope_needs":["src/index.ts: needs the new provider wired in","src/b.ts: shared type extraction"],
 "blocked_on":null,"confidence":0.9}
JSON
)
OUT=$("$SCRIPT" record --slug demo --lane lane-a --json "$REPORT" 2>/tmp/rec1.err)
RC=$?
assert_exit $RC 0 "record: basic write exits 0"
[ -f "$(deferrals_file demo)" ] && ok "record: file created" || no "record: file created"
[ "$(echo "$OUT" | jq -r '.recorded')" = "2" ] && ok "record: recorded=2" || no "record: recorded=2 (got: $OUT)"
[ "$(jq '.deferrals | length' "$(deferrals_file demo)")" = "2" ] && ok "record: 2 deferrals persisted" || no "record: 2 deferrals persisted"
[ "$(jq -r '.deferrals[0].blocking' "$(deferrals_file demo)")" = "true" ] && ok "record: defaults to blocking:true (fail-closed)" || no "record: defaults to blocking:true"
[ "$(jq -r '.deferrals[0].status' "$(deferrals_file demo)")" = "open" ] && ok "record: defaults to status:open" || no "record: defaults to status:open"

# ---- record: idempotent re-record of same lane does not duplicate ----
"$SCRIPT" record --slug demo --lane lane-a --json "$REPORT" >/tmp/rec2.out 2>/tmp/rec2.err
RC=$?
assert_exit $RC 0 "record: re-record exits 0"
[ "$(jq '.deferrals | length' "$(deferrals_file demo)")" = "2" ] && ok "record: re-record does not duplicate (still 2)" || no "record: re-record does not duplicate"

# ---- record: second lane adds to the total, does not touch lane-a ----
REPORT_B=$(mkreport report-lane-b-1.json <<'JSON'
{"lane":"lane-b","tests_written":1,"scoped_tests_passed":1,"scoped_tests_total":1,
 "files_modified":["src/c.ts"],"phases_complete":["1"],
 "out_of_scope_needs":["src/upstream-sdk: vendor bug, not fixable in this repo"],
 "blocked_on":null,"confidence":0.9}
JSON
)
"$SCRIPT" record --slug demo --lane lane-b --json "$REPORT_B" >/tmp/rec3.out 2>/tmp/rec3.err
RC=$?
assert_exit $RC 0 "record: second lane exits 0"
[ "$(jq '.deferrals | length' "$(deferrals_file demo)")" = "3" ] && ok "record: total is now 3 (2 + 1)" || no "record: total is now 3"
[ "$(jq '[.deferrals[] | select(.lane=="lane-a")] | length' "$(deferrals_file demo)")" = "2" ] && ok "record: lane-a entries untouched by lane-b write" || no "record: lane-a entries untouched"

# ---- record: lane clears its own entries by reporting an empty array ----
REPORT_A_CLEAR=$(mkreport report-lane-a-2.json <<'JSON'
{"lane":"lane-a","tests_written":3,"scoped_tests_passed":3,"scoped_tests_total":3,
 "files_modified":["src/a.ts"],"phases_complete":["1","2"],
 "out_of_scope_needs":[],"blocked_on":null,"confidence":0.95}
JSON
)
"$SCRIPT" record --slug demo --lane lane-a --json "$REPORT_A_CLEAR" >/tmp/rec4.out 2>/tmp/rec4.err
RC=$?
assert_exit $RC 0 "record: clearing lane exits 0"
[ "$(jq '[.deferrals[] | select(.lane=="lane-a")] | length' "$(deferrals_file demo)")" = "0" ] && ok "record: lane-a cleared after reporting []" || no "record: lane-a cleared after reporting []"
[ "$(jq '.deferrals | length' "$(deferrals_file demo)")" = "1" ] && ok "record: total drops to 1 (only lane-b remains)" || no "record: total drops to 1"

# ---- record: --json accepts an inline JSON string, not just a file path ----
"$SCRIPT" record --slug demo2 --lane lane-x --json '{"lane":"lane-x","out_of_scope_needs":["src/z.ts: needs wiring"]}' >/tmp/rec5.out 2>/tmp/rec5.err
RC=$?
assert_exit $RC 0 "record: inline JSON string accepted"
[ "$(jq '.deferrals | length' "$(deferrals_file demo2)")" = "1" ] && ok "record: inline JSON string persisted" || no "record: inline JSON string persisted"

# ---- record: malformed JSON is a usage error (exit 2) ----
"$SCRIPT" record --slug demo --lane lane-z --json '{not valid json' >/tmp/rec6.out 2>/tmp/rec6.err
assert_exit $? 2 "record: malformed json -> exit 2"

# ---- record: missing required args -> exit 2 ----
"$SCRIPT" record --lane lane-a --json "$REPORT" >/dev/null 2>&1
assert_exit $? 2 "record: missing --slug -> exit 2"
"$SCRIPT" record --slug demo --json "$REPORT" >/dev/null 2>&1
assert_exit $? 2 "record: missing --lane -> exit 2"
"$SCRIPT" record --slug demo --lane lane-a >/dev/null 2>&1
assert_exit $? 2 "record: missing --json -> exit 2"

# ---- gate: missing file (never recorded) -> exit 0 ----
"$SCRIPT" gate --slug never-recorded >/tmp/gate1.out 2>/tmp/gate1.err
assert_exit $? 0 "gate: missing file -> exit 0"
[ "$(jq -r '.open_blocking' /tmp/gate1.out)" = "0" ] && ok "gate: missing file reports open_blocking=0" || no "gate: missing file reports open_blocking=0"

# ---- gate: open blocking deferrals -> exit 1, offenders printed ----
"$SCRIPT" gate --slug demo >/tmp/gate2.out 2>/tmp/gate2.err
assert_exit $? 1 "gate: open blocking deferrals -> exit 1"
[ "$(jq -r '.open_blocking' /tmp/gate2.out)" = "1" ] && ok "gate: open_blocking=1 (lane-b's entry)" || no "gate: open_blocking=1"
grep -q "lane-b" /tmp/gate2.err && ok "gate: offender's lane printed to stderr" || no "gate: offender's lane printed to stderr"

# ---- S006 regression (origin: ROOTCAUSE_mpa_thread_wiring_gap.md) ----
# The implementer correctly flagged the unfinished cross-lane wiring migration
# in out_of_scope_needs; nothing ever consumed it, and the feature shipped
# 81/81 green while unreachable from src/index.ts. Reproduce that exact
# deferral text and prove the gate now blocks on it.
REPORT_WIRING=$(mkreport report-i10-wiring.json <<'JSON'
{"lane":"I10","out_of_scope_needs":["src/index.ts: cross-lane postCard->postInThread reroute (S23) not landed, thread manager unreachable from prod entrypoint"]}
JSON
)
"$SCRIPT" record --slug mpa --lane I10 --json "$REPORT_WIRING" >/dev/null 2>&1
"$SCRIPT" gate --slug mpa >/tmp/gate3.out 2>/tmp/gate3.err
assert_exit $? 1 "S006: MP-A wiring deferral blocks the gate"
grep -q "postInThread" /tmp/gate3.err && ok "S006: offender text names the exact orphaned wiring step" || no "S006: offender text missing"

# ---- resolve: refuses empty reason ----
DEFID=$(jq -r '.deferrals[0].id' "$(deferrals_file mpa)")
"$SCRIPT" resolve --slug mpa --id "$DEFID" --reason "" >/dev/null 2>&1
assert_exit $? 2 "resolve: empty reason refused"

# ---- resolve: refuses whitespace-only reason ----
"$SCRIPT" resolve --slug mpa --id "$DEFID" --reason "   " >/dev/null 2>&1
assert_exit $? 2 "resolve: whitespace-only reason refused"

# ---- resolve: unknown id -> exit 2 ----
"$SCRIPT" resolve --slug mpa --id 99999 --reason "landed S23 reroute" >/dev/null 2>&1
assert_exit $? 2 "resolve: unknown id -> exit 2"

# ---- resolve: valid id + reason clears the gate ----
"$SCRIPT" resolve --slug mpa --id "$DEFID" --reason "landed S23 reroute, wiring AC now green" >/tmp/res1.out 2>/tmp/res1.err
assert_exit $? 0 "resolve: valid id+reason exits 0"
[ "$(jq -r '.deferrals[0].status' "$(deferrals_file mpa)")" = "resolved" ] && ok "resolve: status flips to resolved" || no "resolve: status flips to resolved"
[ -n "$(jq -r '.deferrals[0].resolved_reason' "$(deferrals_file mpa)")" ] && ok "resolve: reason persisted" || no "resolve: reason persisted"

"$SCRIPT" gate --slug mpa >/tmp/gate4.out 2>/tmp/gate4.err
assert_exit $? 0 "S006: gate clears once the deferral is resolved"
[ "$(jq -r '.open_blocking' /tmp/gate4.out)" = "0" ] && ok "S006: open_blocking=0 after resolve" || no "S006: open_blocking=0 after resolve"

# ---- usage ----
"$SCRIPT" >/dev/null 2>&1; assert_exit $? 2 "no subcommand -> exit 2"
"$SCRIPT" bogus >/dev/null 2>&1; assert_exit $? 2 "unknown subcommand -> exit 2"

echo "----"
echo "S006 deferrals: $PASS/$RUN passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
