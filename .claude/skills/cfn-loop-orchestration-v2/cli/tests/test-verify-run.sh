#!/usr/bin/env bash
# Tests for verify-run.sh (W1 / G37).
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$DIR/../verify-run.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

RUN=0; PASS=0; FAIL=0
ok() { echo "PASS: $1"; PASS=$((PASS+1)); RUN=$((RUN+1)); }
no() { echo "FAIL: $1"; FAIL=$((FAIL+1)); RUN=$((RUN+1)); }
assert_exit() { if [ "$1" -eq "$2" ]; then ok "$3"; else no "$3 (exit $1 wanted $2)"; fi; }

# probe file for the predicate-unverified case
echo "verifyprobe present" > "$WORK/pv.txt"

mkvf() { # slug  <json-manifest-body-file-on-stdin>  -> writes planning/VERIFY_<slug>.md
  local slug="$1"; local f="$WORK/VERIFY_${slug}.md"
  { echo "# VERIFY $slug"; echo; echo '```json'; cat; echo '```'; } > "$f"
  echo "$f"
}
bless() { sha256sum "$1" | awk '{print $1}' > "$(dirname "$1")/.$(basename "$1" .md).sha256"; }

# ---- green: two executable checks that pass ----
VF=$(mkvf green <<'JSON'
{ "slug":"green","done_rule":"all acs green",
  "acs":[
    {"id":"AC-1","kind":"unit","check":"bash -c 'true'","pass":"exit 0","maps_to":["FR-1"]},
    {"id":"AC-2","kind":"static","check":"grep -q verifyprobe __PV__","pass":"exit 0","maps_to":["FR-2"]}
  ],
  "coverage":{"fr_total":2,"fr_mapped":2} }
JSON
)
sed -i "s#__PV__#$WORK/pv.txt#" "$VF"; bless "$VF"
"$SCRIPT" run --verify "$VF" --out "$WORK/res-green.json" >/dev/null 2>&1
assert_exit $? 0 "green: run exits 0"
[ "$(jq -r '.summary.all_green' "$WORK/res-green.json")" = "true" ] && ok "green: all_green true" || no "green: all_green true"

# ---- red: one check fails ----
VF=$(mkvf red <<'JSON'
{ "slug":"red","done_rule":"all acs green",
  "acs":[
    {"id":"AC-1","kind":"unit","check":"bash -c 'true'","pass":"exit 0","maps_to":["FR-1"]},
    {"id":"AC-2","kind":"unit","check":"bash -c 'false'","pass":"exit 0","maps_to":["FR-2"]}
  ],
  "coverage":{"fr_total":2,"fr_mapped":2} }
JSON
)
bless "$VF"
"$SCRIPT" run --verify "$VF" --out "$WORK/res-red.json" >/dev/null 2>&1
assert_exit $? 1 "red: run exits 1"
[ "$(jq -r '.summary.red' "$WORK/res-red.json")" = "1" ] && ok "red: 1 red counted" || no "red: 1 red counted"

# ---- needs_agent: playwright row is unresolved, then resolve -> green ----
VF=$(mkvf agent <<'JSON'
{ "slug":"agent","done_rule":"all acs green",
  "acs":[
    {"id":"AC-1","kind":"e2e","check":"playwright: snapshot select#course","pass":"options match query","maps_to":["FR-1"]}
  ],
  "coverage":{"fr_total":1,"fr_mapped":1} }
JSON
)
bless "$VF"
"$SCRIPT" run --verify "$VF" --out "$WORK/res-agent.json" >/dev/null 2>&1
assert_exit $? 1 "needs_agent: unresolved -> exit 1"
[ "$(jq -r '.summary.needs_agent' "$WORK/res-agent.json")" = "1" ] && ok "needs_agent counted" || no "needs_agent counted"

# resolve refuses thin evidence
printf 'one line\n' > "$WORK/thin.txt"
"$SCRIPT" resolve --results "$WORK/res-agent.json" --ac AC-1 --pass true --evidence-file "$WORK/thin.txt" >/dev/null 2>&1
assert_exit $? 2 "resolve: thin evidence refused (exit 2)"

# resolve accepts real evidence -> all green
printf 'ran playwright snapshot\nselect#course had 3 options\nmatched query result A,B,C\n' > "$WORK/ev.txt"
"$SCRIPT" resolve --results "$WORK/res-agent.json" --ac AC-1 --pass true --evidence-file "$WORK/ev.txt" >/dev/null 2>&1
assert_exit $? 0 "resolve: real evidence accepted"
"$SCRIPT" summary --results "$WORK/res-agent.json" >/dev/null 2>&1
assert_exit $? 0 "summary: resolved -> all green exit 0"

# ---- predicate_unverified: executable but non-authoritative, exit 0 -> unresolved ----
VF=$(mkvf pred <<'JSON'
{ "slug":"pred","done_rule":"all acs green",
  "acs":[
    {"id":"AC-1","kind":"static","check":"grep verifyprobe __PV__","pass":"line present","maps_to":["FR-1"]}
  ],
  "coverage":{"fr_total":1,"fr_mapped":1} }
JSON
)
sed -i "s#__PV__#$WORK/pv.txt#" "$VF"; bless "$VF"
"$SCRIPT" run --verify "$VF" --out "$WORK/res-pred.json" >/dev/null 2>&1
assert_exit $? 1 "predicate_unverified: unresolved -> exit 1"
[ "$(jq -r '.results[0].predicate_unverified' "$WORK/res-pred.json")" = "true" ] && ok "pred: flagged predicate_unverified" || no "pred: flagged predicate_unverified"

# ---- S002 regression (origin: ROOTCAUSE_mpa_thread_wiring_gap.md, AC-77) ----
# AC-77's wiring guard was `describe.skipIf(!THREAD_REFACTOR_ENABLED)`. With
# the flag defaulting off, every case in the file self-skipped, the runner
# exited 0, and the old is_authoritative()/rc==0 logic marked the AC green --
# shipping a feature 81/81 all-green while completely unreachable from
# src/index.ts. These fixtures fake a runner-kind check (first token "bash",
# which is_authoritative() already treats as exit-code-authoritative) whose
# captured stdout mimics a vitest summary line, so the shared
# lib/parse-test-summary.sh parser recognizes the runner shape without
# actually invoking vitest.

# zero-collected: the check named a test that did not run at all.
VF=$(mkvf zerocollected <<'JSON'
{ "slug":"zerocollected","done_rule":"all acs green",
  "acs":[
    {"id":"AC-1","kind":"unit","check":"bash -c 'printf \" Tests  0 passed (0)\\n\"; exit 0'","pass":"exit 0","maps_to":["FR-1"]}
  ],
  "coverage":{"fr_total":1,"fr_mapped":1} }
JSON
)
bless "$VF"
"$SCRIPT" run --verify "$VF" --out "$WORK/res-zero.json" >/dev/null 2>&1
assert_exit $? 1 "S002: zero-collected -> run exits 1, not all_green"
[ "$(jq -r '.results[0].pass' "$WORK/res-zero.json")" = "false" ] && ok "S002: zero-collected forced red despite rc=0" || no "S002: zero-collected forced red despite rc=0"

# all-skipped: the exact AC-77 shape -- every case skipped, process exits 0.
VF=$(mkvf allskipped <<'JSON'
{ "slug":"allskipped","done_rule":"all acs green",
  "acs":[
    {"id":"AC-1","kind":"unit","check":"bash -c 'printf \" Tests  3 skipped (3)\\n\"; exit 0'","pass":"exit 0","maps_to":["FR-1"]}
  ],
  "coverage":{"fr_total":1,"fr_mapped":1} }
JSON
)
bless "$VF"
"$SCRIPT" run --verify "$VF" --out "$WORK/res-skip.json" >/dev/null 2>&1
assert_exit $? 1 "S002: all-skipped -> run exits 1, not all_green (AC-77 regression)"
[ "$(jq -r '.results[0].pass' "$WORK/res-skip.json")" = "false" ] && ok "S002: all-skipped forced red despite rc=0 (a skipped guard is not a guard)" || no "S002: all-skipped forced red despite rc=0"

# genuinely green: real passes, no skip/todo, rc=0 -> must still go green.
VF=$(mkvf realgreen <<'JSON'
{ "slug":"realgreen","done_rule":"all acs green",
  "acs":[
    {"id":"AC-1","kind":"unit","check":"bash -c 'printf \" Tests  5 passed (5)\\n\"; exit 0'","pass":"exit 0","maps_to":["FR-1"]}
  ],
  "coverage":{"fr_total":1,"fr_mapped":1} }
JSON
)
bless "$VF"
"$SCRIPT" run --verify "$VF" --out "$WORK/res-realgreen.json" >/dev/null 2>&1
assert_exit $? 0 "S002: genuine all-passed summary still goes green"
[ "$(jq -r '.results[0].pass' "$WORK/res-realgreen.json")" = "true" ] && ok "S002: no false-positive red on a real pass" || no "S002: no false-positive red on a real pass"

# unknown runner output: parser does not recognize the shape -> falls back
# to pre-S002 exit-code-only semantics (callers decide for unparsed formats).
VF=$(mkvf unknownfmt <<'JSON'
{ "slug":"unknownfmt","done_rule":"all acs green",
  "acs":[
    {"id":"AC-1","kind":"unit","check":"bash -c 'printf \"some custom runner output\\n\"; exit 0'","pass":"exit 0","maps_to":["FR-1"]}
  ],
  "coverage":{"fr_total":1,"fr_mapped":1} }
JSON
)
bless "$VF"
"$SCRIPT" run --verify "$VF" --out "$WORK/res-unknown.json" >/dev/null 2>&1
assert_exit $? 0 "S002: unrecognized summary format falls back to exit-code (rc=0 -> green)"
[ "$(jq -r '.results[0].pass' "$WORK/res-unknown.json")" = "true" ] && ok "S002: unknown-format fallback uses exit code" || no "S002: unknown-format fallback uses exit code"

# ---- sha256 mismatch -> exit 4 ----
VF=$(mkvf tamper <<'JSON'
{ "slug":"tamper","done_rule":"all acs green",
  "acs":[{"id":"AC-1","kind":"unit","check":"bash -c 'true'","pass":"exit 0","maps_to":["FR-1"]}],
  "coverage":{"fr_total":1,"fr_mapped":1} }
JSON
)
bless "$VF"
echo "<!-- tampered after bless -->" >> "$VF"
"$SCRIPT" run --verify "$VF" --out "$WORK/res-tamper.json" >/dev/null 2>&1
assert_exit $? 4 "sha256 mismatch -> exit 4"

# ---- usage ----
"$SCRIPT" >/dev/null 2>&1; assert_exit $? 2 "no subcommand -> exit 2"
"$SCRIPT" run >/dev/null 2>&1; assert_exit $? 2 "run without --verify -> exit 2"

echo "----"
echo "W1 verify-run: $PASS/$RUN passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
