#!/usr/bin/env bash
# Tests for verify-run.sh (W1 / G37).
set -uo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

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

mkvf() { # slug  <json-manifest-body-file-on-stdin>  -> writes planning/<slug>/VERIFY_<slug>.md
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

# ---- S005: cargo output is parsed as cargo, and 0-ran is loud ----
# Origin: MANIFEST_HANDOFF_conversational_interview_engine.md. A check that
# added `--ignored` to a plain `#[test]` made cargo run 0 tests and exit 0.
# The AC went red (correct) but the only thing the author saw was the cargo
# tail -- incremental-compile fs warnings -- with no line saying the check
# proved nothing. These assert the diagnosis is now in-band.
VF=$(mkvf cargozero <<'JSON'
{ "slug":"cargozero","done_rule":"all acs green",
  "acs":[
    {"id":"AC-1","kind":"unit","check":"bash -c 'printf \"test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 645 filtered out; finished in 0.01s\\n\"; exit 0'","pass":"exit 0","maps_to":["FR-1"]}
  ],
  "coverage":{"fr_total":1,"fr_mapped":1} }
JSON
)
bless "$VF"
"$SCRIPT" run --verify "$VF" --out "$WORK/res-cargozero.json" >/dev/null 2>&1
assert_exit $? 1 "S005: cargo 0-ran -> exit 1"
[ "$(jq -r '.results[0].pass' "$WORK/res-cargozero.json")" = "false" ] && ok "S005: cargo 0-ran forced red despite rc=0" || no "S005: cargo 0-ran forced red despite rc=0"
jq -r '.results[0].reason' "$WORK/res-cargozero.json" | grep -q 'zero_tests_ran' \
  && ok "S005: reason names zero_tests_ran, not a bare exit code" || no "S005: reason names zero_tests_ran"
jq -r '.results[0].reason' "$WORK/res-cargozero.json" | grep -q 'filtered_out=645' \
  && ok "S005: reason surfaces filtered_out count (the flag/selector mismatch tell)" || no "S005: reason surfaces filtered_out count"
[ "$(jq -r '.summary.zero_ran' "$WORK/res-cargozero.json")" = "1" ] && ok "S005: summary counts zero_ran separately" || no "S005: summary counts zero_ran separately"

# cargo "ignored" must reach the S002 skipped rule. Before the cargo branch
# existed, Rust output was parsed as pytest, which looks for the word
# "skipped" -- so PTS_SKIP was always 0 and an all-ignored Rust suite read green.
VF=$(mkvf cargoignored <<'JSON'
{ "slug":"cargoignored","done_rule":"all acs green",
  "acs":[
    {"id":"AC-1","kind":"unit","check":"bash -c 'printf \"test result: ok. 5 passed; 0 failed; 3 ignored; 0 measured; 0 filtered out; finished in 0.10s\\n\"; exit 0'","pass":"exit 0","maps_to":["FR-1"]}
  ],
  "coverage":{"fr_total":1,"fr_mapped":1} }
JSON
)
bless "$VF"
"$SCRIPT" run --verify "$VF" --out "$WORK/res-cargoign.json" >/dev/null 2>&1
assert_exit $? 1 "S005: cargo ignored>0 -> exit 1 (S002 rule now fires for Rust)"
jq -r '.results[0].reason' "$WORK/res-cargoign.json" | grep -q 'skipped_present' \
  && ok "S005: reason names skipped_present for cargo 'ignored'" || no "S005: reason names skipped_present"

# A genuinely green cargo run must still go green -- no false-positive red.
VF=$(mkvf cargogreen <<'JSON'
{ "slug":"cargogreen","done_rule":"all acs green",
  "acs":[
    {"id":"AC-1","kind":"unit","check":"bash -c 'printf \"test result: ok. 645 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 3.20s\\n\"; exit 0'","pass":"exit 0","maps_to":["FR-1"]}
  ],
  "coverage":{"fr_total":1,"fr_mapped":1} }
JSON
)
bless "$VF"
"$SCRIPT" run --verify "$VF" --out "$WORK/res-cargogreen.json" >/dev/null 2>&1
assert_exit $? 0 "S005: genuine cargo pass still goes green"
jq -r '.results[0].reason' "$WORK/res-cargogreen.json" | grep -q 'runner=cargo' \
  && ok "S005: green reason records runner=cargo (not the old pytest misparse)" || no "S005: green reason records runner=cargo"

# nextest has no "in <N>s" tail, so it used to fall through to exit-code-only.
VF=$(mkvf nextestzero <<'JSON'
{ "slug":"nextestzero","done_rule":"all acs green",
  "acs":[
    {"id":"AC-1","kind":"unit","check":"bash -c 'printf \"     Summary [   0.001s] 0 tests run: 0 passed, 0 skipped\\n\"; exit 0'","pass":"exit 0","maps_to":["FR-1"]}
  ],
  "coverage":{"fr_total":1,"fr_mapped":1} }
JSON
)
bless "$VF"
"$SCRIPT" run --verify "$VF" --out "$WORK/res-nextestzero.json" >/dev/null 2>&1
assert_exit $? 1 "S005: nextest 0-ran -> exit 1 (was exit-code-only green)"
jq -r '.results[0].reason' "$WORK/res-nextestzero.json" | grep -q 'zero_tests_ran' \
  && ok "S005: nextest 0-ran reason is loud" || no "S005: nextest 0-ran reason is loud"

# Every non-executed row still carries a reason a human can act on.
jq -e '.results[0].reason | test("needs_agent")' "$WORK/res-agent.json" >/dev/null 2>&1 \
  && ok "S005: needs_agent rows carry a reason" || no "S005: needs_agent rows carry a reason"
jq -e '.results[0].reason | test("predicate_unverified")' "$WORK/res-pred.json" >/dev/null 2>&1 \
  && ok "S005: predicate_unverified rows carry a reason" || no "S005: predicate_unverified rows carry a reason"

# ---- S007: playwright checks carrying a real command are executable ----
# Origin: HANDOFF_verify_manifest_runnability.md. Bar A's taxonomy REQUIRES an
# e2e AC's check to start with `playwright:`, and classify() mapped that exact
# prefix to needs_agent -- so a Bar-A-compliant e2e AC could never be
# mechanically green, and authors dodged by mislabeling `kind`. The
# discriminator is now what FOLLOWS the prefix: a shell command runs, prose
# still needs an agent (the `playwright: snapshot select#course` form above).
VF=$(mkvf pwexec <<'JSON'
{ "slug":"pwexec","done_rule":"all acs green",
  "acs":[
    {"id":"AC-1","kind":"e2e","check":"playwright: bash -c 'printf \"Running 3 tests using 2 workers\\n  3 passed (2.3s)\\n\"; exit 0'","pass":"3 passed","maps_to":["FR-1"]}
  ],
  "coverage":{"fr_total":1,"fr_mapped":1} }
JSON
)
bless "$VF"
"$SCRIPT" run --verify "$VF" --out "$WORK/res-pwexec.json" >/dev/null 2>&1
assert_exit $? 0 "S007: playwright: + shell command executes and can go green"
[ "$(jq -r '.results[0].mode' "$WORK/res-pwexec.json")" = "executed" ] && ok "S007: playwright command ran (mode=executed)" || no "S007: playwright command ran"
jq -r '.results[0].reason' "$WORK/res-pwexec.json" | grep -q 'runner=playwright' \
  && ok "S007: playwright summary parsed (not exit-code-only)" || no "S007: playwright summary parsed"

# The prose form must still route to an agent -- this is the whole reason the
# prefix cannot simply be made executable unconditionally.
VF=$(mkvf pwprose <<'JSON'
{ "slug":"pwprose","done_rule":"all acs green",
  "acs":[
    {"id":"AC-1","kind":"e2e","check":"playwright: snapshot select#course, options match query","pass":"0 free-text inputs","maps_to":["FR-1"]}
  ],
  "coverage":{"fr_total":1,"fr_mapped":1} }
JSON
)
bless "$VF"
"$SCRIPT" run --verify "$VF" --out "$WORK/res-pwprose.json" >/dev/null 2>&1
[ "$(jq -r '.results[0].mode' "$WORK/res-pwprose.json")" = "needs_agent" ] && ok "S007: playwright: + prose still needs_agent" || no "S007: playwright: + prose still needs_agent"

# A playwright grep that matches nothing must not read as a pass.
VF=$(mkvf pwzero <<'JSON'
{ "slug":"pwzero","done_rule":"all acs green",
  "acs":[
    {"id":"AC-1","kind":"e2e","check":"playwright: bash -c 'printf \"Running 0 tests using 0 workers\\n\"; exit 0'","pass":"tests pass","maps_to":["FR-1"]}
  ],
  "coverage":{"fr_total":1,"fr_mapped":1} }
JSON
)
bless "$VF"
"$SCRIPT" run --verify "$VF" --out "$WORK/res-pwzero.json" >/dev/null 2>&1
assert_exit $? 1 "S007: playwright 0-tests -> red, not green"
jq -r '.results[0].reason' "$WORK/res-pwzero.json" | grep -q 'zero_tests_ran' \
  && ok "S007: playwright 0-tests reason is loud" || no "S007: playwright 0-tests reason is loud"

# ---- S007: manifest cwd directive ----
# verify-run used to hard-pin every check to the git top-level. In a monorepo
# the runner config (vitest.config / playwright.config / tsconfig aliases)
# lives in a subdirectory and every manifest path is relative to it, so all
# checks resolved to nothing. Playwright specifically CANNOT run from the repo
# root when two @playwright/test versions resolve.
mkdir -p "$WORK/sub/deep"
echo "subprobe" > "$WORK/sub/marker.txt"
echo "deepprobe" > "$WORK/sub/deep/marker.txt"
VF=$(mkvf cwdglobal <<'JSON'
{ "slug":"cwdglobal","cwd":"__SUB__","done_rule":"all acs green",
  "acs":[
    {"id":"AC-1","kind":"static","check":"grep -q subprobe marker.txt","pass":"exit 0","maps_to":["FR-1"]}
  ],
  "coverage":{"fr_total":1,"fr_mapped":1} }
JSON
)
sed -i "s#__SUB__#$WORK/sub#" "$VF"; bless "$VF"
"$SCRIPT" run --verify "$VF" --out "$WORK/res-cwdg.json" >/dev/null 2>&1
assert_exit $? 0 "S007: manifest-global cwd makes a subdir-relative path resolve"

# per-AC cwd overrides the manifest-global one
VF=$(mkvf cwdac <<'JSON'
{ "slug":"cwdac","cwd":"__SUB__","done_rule":"all acs green",
  "acs":[
    {"id":"AC-1","kind":"static","check":"grep -q deepprobe marker.txt","cwd":"__DEEP__","pass":"exit 0","maps_to":["FR-1"]}
  ],
  "coverage":{"fr_total":1,"fr_mapped":1} }
JSON
)
sed -i -e "s#__SUB__#$WORK/sub#" -e "s#__DEEP__#$WORK/sub/deep#" "$VF"; bless "$VF"
"$SCRIPT" run --verify "$VF" --out "$WORK/res-cwdac.json" >/dev/null 2>&1
assert_exit $? 0 "S007: per-AC cwd overrides manifest cwd"

# a cwd that does not exist is a BLOCKED precondition, never a red feature
VF=$(mkvf cwdmissing <<'JSON'
{ "slug":"cwdmissing","cwd":"__MISSING__","done_rule":"all acs green",
  "acs":[
    {"id":"AC-1","kind":"static","check":"grep -q subprobe marker.txt","pass":"exit 0","maps_to":["FR-1"]}
  ],
  "coverage":{"fr_total":1,"fr_mapped":1} }
JSON
)
sed -i "s#__MISSING__#$WORK/nope#" "$VF"; bless "$VF"
"$SCRIPT" run --verify "$VF" --out "$WORK/res-cwdmiss.json" >/dev/null 2>&1
assert_exit $? 1 "S007: missing cwd -> exit 1"
[ "$(jq -r '.results[0].mode' "$WORK/res-cwdmiss.json")" = "blocked" ] && ok "S007: missing cwd -> blocked, not red" || no "S007: missing cwd -> blocked, not red"
[ "$(jq -r '.summary.blocked' "$WORK/res-cwdmiss.json")" = "1" ] && ok "S007: summary counts blocked" || no "S007: summary counts blocked"

# ---- S007: requires{} preconditions ----
# "infra absent" must never masquerade as "feature broken". NSC hand-verified
# 27 needs_agent rows one by one to tell the two apart.

# env pin with a value is EXPORTED into the check (the manifest declares what
# the check needs, and a human can read it and reproduce the run by hand).
VF=$(mkvf envpin <<'JSON'
{ "slug":"envpin","done_rule":"all acs green",
  "acs":[
    {"id":"AC-1","kind":"integration","check":"bash -c '[ \"$RUN_INTEGRATION\" = \"1\" ]'","requires":{"env":["RUN_INTEGRATION=1"]},"pass":"exit 0","maps_to":["FR-1"]}
  ],
  "coverage":{"fr_total":1,"fr_mapped":1} }
JSON
)
bless "$VF"
"$SCRIPT" run --verify "$VF" --out "$WORK/res-envpin.json" >/dev/null 2>&1
assert_exit $? 0 "S007: requires.env NAME=value is exported into the check"

# a BARE env name is an assertion about the runner's own environment (for
# secrets that must never be written into the manifest), not an export.
VF=$(mkvf envassert <<'JSON'
{ "slug":"envassert","done_rule":"all acs green",
  "acs":[
    {"id":"AC-1","kind":"integration","check":"bash -c 'true'","requires":{"env":["CFN_TEST_ABSENT_VAR"]},"pass":"exit 0","maps_to":["FR-1"]}
  ],
  "coverage":{"fr_total":1,"fr_mapped":1} }
JSON
)
bless "$VF"
"$SCRIPT" run --verify "$VF" --out "$WORK/res-envassert.json" >/dev/null 2>&1
assert_exit $? 1 "S007: unset required env -> exit 1"
[ "$(jq -r '.results[0].mode' "$WORK/res-envassert.json")" = "blocked" ] && ok "S007: unset required env -> blocked" || no "S007: unset required env -> blocked"
jq -r '.results[0].reason' "$WORK/res-envassert.json" | grep -q 'CFN_TEST_ABSENT_VAR' \
  && ok "S007: blocked reason names the missing var" || no "S007: blocked reason names the missing var"

# requires.db without CFN_VERIFY_DATABASE_URL is blocked, not needs_agent:
# an unreachable DB is a precondition, and calling it needs_agent forced a
# human to hand-check every row to find the real failures.
VF=$(mkvf reqdb <<'JSON'
{ "slug":"reqdb","done_rule":"all acs green",
  "acs":[
    {"id":"AC-1","kind":"integration","check":"bash -c 'true'","requires":{"db":true},"pass":"exit 0","maps_to":["FR-1"]}
  ],
  "coverage":{"fr_total":1,"fr_mapped":1} }
JSON
)
bless "$VF"
CFN_VERIFY_DATABASE_URL="" "$SCRIPT" run --verify "$VF" --out "$WORK/res-reqdb.json" >/dev/null 2>&1
assert_exit $? 1 "S007: requires.db with no DB URL -> exit 1"
[ "$(jq -r '.results[0].mode' "$WORK/res-reqdb.json")" = "blocked" ] && ok "S007: requires.db unmet -> blocked" || no "S007: requires.db unmet -> blocked"

# requires.http against a dead port is blocked (NSC ran playwright against a
# dead :3800 and read the crash as a feature failure).
VF=$(mkvf reqhttp <<'JSON'
{ "slug":"reqhttp","done_rule":"all acs green",
  "acs":[
    {"id":"AC-1","kind":"e2e","check":"playwright: bash -c 'true'","requires":{"http":"http://127.0.0.1:1/"},"pass":"exit 0","maps_to":["FR-1"]}
  ],
  "coverage":{"fr_total":1,"fr_mapped":1} }
JSON
)
bless "$VF"
"$SCRIPT" run --verify "$VF" --out "$WORK/res-reqhttp.json" >/dev/null 2>&1
assert_exit $? 1 "S007: requires.http dead port -> exit 1"
[ "$(jq -r '.results[0].mode' "$WORK/res-reqhttp.json")" = "blocked" ] && ok "S007: requires.http unreachable -> blocked" || no "S007: requires.http unreachable -> blocked"

# blocked rows are resolvable with captured evidence, same as needs_agent --
# a human who brought the infra up by hand can stamp the row.
printf 'brought portal dev server up on :3800\nnpx playwright test e2e/x.spec.ts -g save_reorder\n16 passed (12.1s)\n' > "$WORK/ev2.txt"
"$SCRIPT" resolve --results "$WORK/res-reqhttp.json" --ac AC-1 --pass true --evidence-file "$WORK/ev2.txt" >/dev/null 2>&1
assert_exit $? 0 "S007: a blocked row is resolvable with evidence"
[ "$(jq -r '.summary.blocked' "$WORK/res-reqhttp.json")" = "0" ] && ok "S007: resolve clears the blocked count" || no "S007: resolve clears the blocked count"

# ---- backfill-evidence (S007) ----
# Bar A requires every AC to carry real runtime `evidence`, but a manifest is
# authored before the code exists, so it is blessed at plan stage with
# `PENDING: <reason>`. This subcommand is how those placeholders become real
# output: the exit-gate run already executed every check, so its recorded
# output is the evidence. Without it, the exit bless would demand a human paste
# one excerpt per AC, which is how a gate gets routed around.
VF=$(mkvf backfill <<'JSON'
{ "slug":"backfill","done_rule":"all acs green",
  "acs":[
    {"id":"AC-1","kind":"unit","check":"bash -c 'echo \"Tests  1 passed (1)\"'","pass":"exit 0","evidence":"PENDING: not implemented yet","maps_to":["FR-1"]},
    {"id":"AC-2","kind":"unit","check":"bash -c 'false'","pass":"exit 0","evidence":"PENDING: not implemented yet","maps_to":["FR-2"]}
  ],
  "coverage":{"fr_total":2,"fr_mapped":2} }
JSON
)
bless "$VF"
"$SCRIPT" run --verify "$VF" --out "$WORK/res-backfill.json" >/dev/null 2>&1
"$SCRIPT" backfill-evidence --results "$WORK/res-backfill.json" --verify "$VF" >/dev/null 2>&1
assert_exit $? 0 "S007 backfill: exit 0"
MF=$(awk '/^```json/{i=1;b="";next} i&&/^```/{i=0;l=b;next} i{b=b $0 "\n"} END{printf "%s",l}' "$VF")
echo "$MF" | jq -e '.acs[0].evidence | test("1 passed")' >/dev/null 2>&1 \
  && ok "S007 backfill: green AC gets its real output" || no "S007 backfill: green AC gets its real output"
[ "$(echo "$MF" | jq -r '.acs[1].evidence')" = "PENDING: not implemented yet" ] \
  && ok "S007 backfill: red AC keeps PENDING (a failing run is not evidence of a passing check)" \
  || no "S007 backfill: red AC keeps PENDING"
echo "$MF" | jq -e '.slug == "backfill" and (.coverage.fr_total == 2)' >/dev/null 2>&1 \
  && ok "S007 backfill: rest of the manifest is preserved" || no "S007 backfill: rest of the manifest is preserved"
grep -q '^# VERIFY backfill' "$VF" && ok "S007 backfill: markdown around the block is preserved" || no "S007 backfill: markdown preserved"
[ "$(cat "$WORK/.VERIFY_backfill.sha256")" != "$(sha256sum "$VF" | awk '{print $1}')" ] \
  && ok "S007 backfill: sidecar is now stale (a re-bless is required, not implied)" \
  || no "S007 backfill: sidecar should be stale after rewrite"
"$SCRIPT" backfill-evidence --results "$WORK/res-backfill.json" >/dev/null 2>&1
assert_exit $? 2 "S007 backfill: missing --verify -> exit 2"

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

# ---- S007: a NAME-FILTERED test run's "skipped" count is the selector doing
# its job, not a disabled guard. `vitest run FILE -t "AC-FR1"` reports the
# file's OTHER tests as skipped; the S002 skipped_present rule read that as
# gaming and failed 7 genuinely-passing checks in the NSC loan-intake epic
# (each "N passed | M skipped", zero failed). The relaxation is narrow: only
# with a recognized name-filter flag for that runner, only when todo==0, and
# only when passed>0 -- so the vacuous-selector hole S002 exists to close
# (a check naming a test that no longer exists) still goes RED. ----
VF=$(mkvf namefilterpass <<'JSON'
{ "slug":"namefilterpass","done_rule":"all acs green",
  "acs":[
    {"id":"AC-1","kind":"unit","check":"bash -c 'npx vitest run gen.test.ts -t \"AC-FR1\"; printf \"\\n Test Files  1 passed (1)\\n      Tests  7 passed | 12 skipped (19)\\n\"; exit 0'","pass":"exit 0","maps_to":["FR-1"]}
  ],
  "coverage":{"fr_total":1,"fr_mapped":1} }
JSON
)
bless "$VF"
"$SCRIPT" run --verify "$VF" --out "$WORK/res-nfpass.json" >/dev/null 2>&1
assert_exit $? 0 "S007: name-filtered run with passed>0, failed==0 -> green"
jq -r '.results[0].reason' "$WORK/res-nfpass.json" | grep -q 'name-filtered' \
  && ok "S007: reason names the name-filtered relaxation" || no "S007: reason names name-filtered"

# A name filter that matched NOTHING is still red: 0 passed proves nothing.
VF=$(mkvf namefiltervacuous <<'JSON'
{ "slug":"namefiltervacuous","done_rule":"all acs green",
  "acs":[
    {"id":"AC-1","kind":"unit","check":"bash -c 'npx vitest run gen.test.ts -t \"AC-TYPO\"; printf \"\\n Test Files  1 passed (1)\\n      Tests  19 skipped (19)\\n\"; exit 0'","pass":"exit 0","maps_to":["FR-1"]}
  ],
  "coverage":{"fr_total":1,"fr_mapped":1} }
JSON
)
bless "$VF"
"$SCRIPT" run --verify "$VF" --out "$WORK/res-nfvac.json" >/dev/null 2>&1
assert_exit $? 1 "S007: name-filtered run matching zero tests -> still red"
jq -r '.results[0].reason' "$WORK/res-nfvac.json" | grep -q 'zero_tests_ran' \
  && ok "S007: vacuous selector reason is zero_tests_ran" || no "S007: vacuous selector reason"

# A name-filtered run with a real FAILURE is still red.
VF=$(mkvf namefilterfail <<'JSON'
{ "slug":"namefilterfail","done_rule":"all acs green",
  "acs":[
    {"id":"AC-1","kind":"unit","check":"bash -c 'npx vitest run gen.test.ts -t \"AC-FR1\"; printf \"\\n Test Files  1 failed (1)\\n      Tests  2 failed | 5 passed | 12 skipped (19)\\n\"; exit 1'","pass":"exit 0","maps_to":["FR-1"]}
  ],
  "coverage":{"fr_total":1,"fr_mapped":1} }
JSON
)
bless "$VF"
"$SCRIPT" run --verify "$VF" --out "$WORK/res-nffail.json" >/dev/null 2>&1
assert_exit $? 1 "S007: name-filtered run with failures -> still red"

# NO name filter + skips present -> unchanged S002 behavior (still red). This is
# the regression guard that the relaxation did not leak into ordinary runs.
VF=$(mkvf nofilterskip <<'JSON'
{ "slug":"nofilterskip","done_rule":"all acs green",
  "acs":[
    {"id":"AC-1","kind":"unit","check":"bash -c 'npx vitest run gen.test.ts; printf \"\\n Test Files  1 passed (1)\\n      Tests  7 passed | 12 skipped (19)\\n\"; exit 0'","pass":"exit 0","maps_to":["FR-1"]}
  ],
  "coverage":{"fr_total":1,"fr_mapped":1} }
JSON
)
bless "$VF"
"$SCRIPT" run --verify "$VF" --out "$WORK/res-nofilt.json" >/dev/null 2>&1
assert_exit $? 1 "S007: skips with NO name filter -> still skipped_present red"
jq -r '.results[0].reason' "$WORK/res-nofilt.json" | grep -q 'skipped_present' \
  && ok "S007: unfiltered skips keep the skipped_present reason" || no "S007: unfiltered skips keep skipped_present"

# A `.todo(` is never selector-induced, so todo>0 stays red even under a filter.
VF=$(mkvf namefiltertodo <<'JSON'
{ "slug":"namefiltertodo","done_rule":"all acs green",
  "acs":[
    {"id":"AC-1","kind":"unit","check":"bash -c 'npx vitest run gen.test.ts -t \"AC-FR1\"; printf \"\\n Test Files  1 passed (1)\\n      Tests  7 passed | 11 skipped | 1 todo (19)\\n\"; exit 0'","pass":"exit 0","maps_to":["FR-1"]}
  ],
  "coverage":{"fr_total":1,"fr_mapped":1} }
JSON
)
bless "$VF"
"$SCRIPT" run --verify "$VF" --out "$WORK/res-nftodo.json" >/dev/null 2>&1
assert_exit $? 1 "S007: todo>0 under a name filter -> still red"

# The -t relaxation must NOT apply to a runner whose name-filter flag differs.
# A bare ` -t ` in a pytest check (pytest's filter is -k) must not relax it.
VF=$(mkvf wrongflagrunner <<'JSON'
{ "slug":"wrongflagrunner","done_rule":"all acs green",
  "acs":[
    {"id":"AC-1","kind":"unit","check":"bash -c 'pytest -t bogus; printf \"\\n= 7 passed, 12 skipped in 0.4s =\\n\"; exit 0'","pass":"exit 0","maps_to":["FR-1"]}
  ],
  "coverage":{"fr_total":1,"fr_mapped":1} }
JSON
)
bless "$VF"
"$SCRIPT" run --verify "$VF" --out "$WORK/res-wrongflag.json" >/dev/null 2>&1
assert_exit $? 1 "S007: -t against pytest (whose filter is -k) does not relax"

# =====================================================================
# S008 tool preflight (origin: MP0 deferral 102)
#
# The bug this exists to prevent: every check runs through `bash -c`, so an
# absent binary prints "command not found" and emits NO stdout. The most common
# static-check shape is
#
#     n=$(<tool> ... | wc -l); test "$n" -eq 0
#
# where `wc -l` reads the empty output as ZERO OFFENDERS and the AC scores
# GREEN. A missing tool was indistinguishable from a clean repo. One manifest
# carried 113 `rg` uses across 49 of its 241 checks, every one a silent false
# pass on any machine without ripgrep.
#
# A missing tool must be mode=error / pass=false / exit_code=127. Never green,
# and never `blocked` -- a human may close a blocked row with hand-captured
# evidence, and "the tool was not installed" is not evidence of anything.
#
# Note on check shapes below: classify() reads the FIRST WORD of the check, so
# every fixture starts with a whitelisted command (`bash`, `grep`, ...). A
# fixture starting with `n=$(...)` classifies as needs_agent and never reaches
# the preflight at all.
# =====================================================================

# A tool guaranteed absent by construction: never on CFN_KNOWN_TOOLS, so only
# detector 1 (requires.tools) or detector 3 (the shell's own diagnostic) can see
# it. No dependence on what this machine happens to have installed.
SYNTH="cfn-absent-tool-zqx"

# Detector 2 infers over the fixed CFN_KNOWN_TOOLS list, so it needs a real name
# off that list that is absent HERE. These five are absent from GitHub's Linux
# and macOS runner images and from a stock WSL2 box. Assert the pick rather than
# skipping: a vacuous pass would hide the very regression these tests pin.
PICKED=""
for t in wrangler vercel flyctl supabase dotnet; do
  type -P -- "$t" >/dev/null 2>&1 || { PICKED="$t"; break; }
done
if [ -n "$PICKED" ]; then ok "S008: found an absent CFN_KNOWN_TOOLS name to test with ($PICKED)"
else no "S008: every candidate tool is installed; detector-2 cases cannot run (widen the candidate list)"; fi

# ---- THE REGRESSION: the wc -l shape must not score green on a missing tool ----
VF=$(mkvf s008wc <<JSON
{ "slug":"s008wc","done_rule":"all acs green",
  "acs":[
    {"id":"AC-1","kind":"static","check":"bash -c 'n=\$($SYNTH --files-with-matches TODO | wc -l); test \"\$n\" -eq 0'","pass":"exit 0","maps_to":["FR-1"],"requires":{"tools":["$SYNTH"]}}
  ],
  "coverage":{"fr_total":1,"fr_mapped":1} }
JSON
)
bless "$VF"
"$SCRIPT" run --verify "$VF" --out "$WORK/res-s008wc.json" >/dev/null 2>&1
assert_exit $? 1 "S008: missing tool in the 'n=\$(tool|wc -l); test \$n -eq 0' shape -> exit 1, not green"
[ "$(jq -r '.results[0].pass' "$WORK/res-s008wc.json")" = "false" ] \
  && ok "S008: pass=false (an absent tool is not zero offenders)" || no "S008: pass=false"
[ "$(jq -r '.results[0].mode' "$WORK/res-s008wc.json")" = "error" ] \
  && ok "S008: mode=error" || no "S008: mode=error (got $(jq -r '.results[0].mode' "$WORK/res-s008wc.json"))"
[ "$(jq -r '.results[0].exit_code' "$WORK/res-s008wc.json")" = "127" ] \
  && ok "S008: exit_code 127 recorded (the shell's own command-not-found code)" || no "S008: exit_code 127"
[ "$(jq -r '.summary.blocked' "$WORK/res-s008wc.json")" = "0" ] \
  && ok "S008: never blocked (a blocked row is closable by hand-written evidence)" || no "S008: never blocked"
[ "$(jq -r '.summary.tool_missing' "$WORK/res-s008wc.json")" = "1" ] \
  && ok "S008: counted in summary.tool_missing" || no "S008: counted in summary.tool_missing"
[ "$(jq -r '.summary.all_green' "$WORK/res-s008wc.json")" = "false" ] \
  && ok "S008: all_green false" || no "S008: all_green false"

# ---- detector 1: requires.tools[] honoured even when the check never names it ----
VF=$(mkvf s008decl <<JSON
{ "slug":"s008decl","done_rule":"all acs green",
  "acs":[
    {"id":"AC-1","kind":"static","check":"bash -c 'true'","pass":"exit 0","maps_to":["FR-1"],"requires":{"tools":["$SYNTH"]}}
  ],
  "coverage":{"fr_total":1,"fr_mapped":1} }
JSON
)
bless "$VF"
"$SCRIPT" run --verify "$VF" --out "$WORK/res-s008decl.json" >/dev/null 2>&1
assert_exit $? 1 "S008 d1: declared-but-absent tool fails a check whose command would pass"
R="$(jq -r '.results[0].reason' "$WORK/res-s008decl.json")"
case "$R" in tool_missing*) ok "S008 d1: reason starts with tool_missing (what summary counts on)" ;;
  *) no "S008 d1: reason starts with tool_missing (got: $R)" ;; esac
echo "$R" | grep -q "$SYNTH"              && ok "S008 d1: reason names the tool" || no "S008 d1: reason names the tool"
echo "$R" | grep -q "install it and re-run" && ok "S008 d1: reason carries a fallback install hint" || no "S008 d1: fallback install hint"

# ---- detector 1: a present tool declared alongside a missing one is not reported ----
VF=$(mkvf s008hint <<JSON
{ "slug":"s008hint","done_rule":"all acs green",
  "acs":[
    {"id":"AC-1","kind":"static","check":"bash -c 'true'","pass":"exit 0","maps_to":["FR-1"],"requires":{"tools":["$SYNTH","grep"]}}
  ],
  "coverage":{"fr_total":1,"fr_mapped":1} }
JSON
)
bless "$VF"
"$SCRIPT" run --verify "$VF" --out "$WORK/res-s008hint.json" >/dev/null 2>&1
R="$(jq -r '.results[0].reason' "$WORK/res-s008hint.json")"
echo "$R" | grep -qE '(^|[^a-z])grep([^a-z]|$)' \
  && no "S008 d1: grep is installed here and must not be listed missing (got: $R)" \
  || ok "S008 d1: only the absent tool of a declared pair is reported"

# ---- detector 2: inference over CFN_KNOWN_TOOLS in shell COMMAND position ----
if [ -n "$PICKED" ]; then
  VF=$(mkvf s008infer <<JSON
{ "slug":"s008infer","done_rule":"all acs green",
  "acs":[
    {"id":"AC-1","kind":"static","check":"bash -c 'true'; $PICKED --version >/dev/null","pass":"exit 0","maps_to":["FR-1"]}
  ],
  "coverage":{"fr_total":1,"fr_mapped":1} }
JSON
)
  bless "$VF"
  "$SCRIPT" run --verify "$VF" --out "$WORK/res-s008infer.json" >/dev/null 2>&1
  assert_exit $? 1 "S008 d2: undeclared tool inferred from command position -> exit 1"
  jq -r '.results[0].reason' "$WORK/res-s008infer.json" | grep -q "$PICKED" \
    && ok "S008 d2: reason names the inferred tool" || no "S008 d2: reason names the inferred tool"

  # Negative: the same name as a STRING ARGUMENT is not a command position.
  # Inferring it would red a check whose real toolchain is present.
  printf 'we do not use %s here\n' "$PICKED" > "$WORK/arg.txt"
  VF=$(mkvf s008notcmd <<JSON
{ "slug":"s008notcmd","done_rule":"all acs green",
  "acs":[
    {"id":"AC-1","kind":"static","check":"grep -q $PICKED $WORK/arg.txt","pass":"exit 0","maps_to":["FR-1"]}
  ],
  "coverage":{"fr_total":1,"fr_mapped":1} }
JSON
)
  bless "$VF"
  "$SCRIPT" run --verify "$VF" --out "$WORK/res-s008notcmd.json" >/dev/null 2>&1
  assert_exit $? 0 "S008 d2: a known-tool name in argument position is not inferred as a command"

  # type -P is a PATH search only: a tool that exists ONLY as an exported shell
  # function is not reproducible from a clone. Reporting it present is how the
  # original bug survived, so absence must still be reported.
  VF=$(mkvf s008fn <<JSON
{ "slug":"s008fn","done_rule":"all acs green",
  "acs":[
    {"id":"AC-1","kind":"static","check":"bash -c 'true'; $PICKED --version >/dev/null","pass":"exit 0","maps_to":["FR-1"]}
  ],
  "coverage":{"fr_total":1,"fr_mapped":1} }
JSON
)
  bless "$VF"
  eval "$PICKED() { return 0; }"; export -f "$PICKED"
  "$SCRIPT" run --verify "$VF" --out "$WORK/res-s008fn.json" >/dev/null 2>&1
  assert_exit $? 1 "S008: an exported shell function does not make a tool present (type -P, not command -v)"
  export -fn "$PICKED" 2>/dev/null; unset -f "$PICKED"
fi

# ---- detector 3: absent tool inside $(...) where the outer command exits 0 ----
# Neither declared nor on CFN_KNOWN_TOOLS, so ONLY the post-run scan of the
# shell's own diagnostic can catch this one.
VF=$(mkvf s008nf <<JSON
{ "slug":"s008nf","done_rule":"all acs green",
  "acs":[
    {"id":"AC-1","kind":"static","check":"bash -c 'n=\$($SYNTH -c TODO); test -z \"\$n\"'","pass":"exit 0","maps_to":["FR-1"]}
  ],
  "coverage":{"fr_total":1,"fr_mapped":1} }
JSON
)
bless "$VF"
"$SCRIPT" run --verify "$VF" --out "$WORK/res-s008nf.json" >/dev/null 2>&1
assert_exit $? 1 "S008 d3: not-found inside \$(...) with a 0-exit outer command -> exit 1"
[ "$(jq -r '.results[0].mode' "$WORK/res-s008nf.json")" = "error" ] \
  && ok "S008 d3: mode=error" || no "S008 d3: mode=error (got $(jq -r '.results[0].mode' "$WORK/res-s008nf.json"))"
jq -r '.results[0].reason' "$WORK/res-s008nf.json" | grep -q "$SYNTH" \
  && ok "S008 d3: reason names the tool the shell reported" || no "S008 d3: reason names the tool"

# Negative: prose that merely ENDS in "not found" is not the shell's diagnostic.
VF=$(mkvf s008prose <<'JSON'
{ "slug":"s008prose","done_rule":"all acs green",
  "acs":[
    {"id":"AC-1","kind":"static","check":"bash -c \"echo 'config key not found'; echo 'the migration was not found'; true\"","pass":"exit 0","maps_to":["FR-1"]}
  ],
  "coverage":{"fr_total":1,"fr_mapped":1} }
JSON
)
bless "$VF"
"$SCRIPT" run --verify "$VF" --out "$WORK/res-s008prose.json" >/dev/null 2>&1
assert_exit $? 0 "S008 d3: prose ending in 'not found' is not read as a missing tool"

# ---- project-local devDependency binaries are deliberately EXCLUDED ----
# tsc/tsx/vitest/jest/eslint/prettier/jscpd resolve from node_modules/.bin via
# the package manager, are never expected on PATH, and listing them on
# CFN_KNOWN_TOOLS reported four already-correct checks as broken. The package
# manager itself IS listed, because that is the thing that has to exist.
if type -P -- tsc >/dev/null 2>&1; then
  ok "S008: tsc is on PATH here, so the exclusion case is not exercised (harmless)"
else
  VF=$(mkvf s008dev <<'JSON'
{ "slug":"s008dev","done_rule":"all acs green",
  "acs":[
    {"id":"AC-1","kind":"static","check":"bash -c 'exit 0'; tsc --noEmit >/dev/null 2>&1 || true","pass":"exit 0","maps_to":["FR-1"]}
  ],
  "coverage":{"fr_total":1,"fr_mapped":1} }
JSON
)
  bless "$VF"
  "$SCRIPT" run --verify "$VF" --out "$WORK/res-s008dev.json" >/dev/null 2>&1
  assert_exit $? 0 "S008: an absent devDependency binary (tsc) is not preflighted as missing"
  [ "$(jq -r '.summary.tool_missing' "$WORK/res-s008dev.json")" = "0" ] \
    && ok "S008: devDependency exclusion keeps tool_missing at 0" || no "S008: devDependency exclusion"
fi

# ---- ordering: requires{} preconditions are adjudicated BEFORE the preflight ----
# An unset env var is infrastructure, not a broken toolchain, and stays
# `blocked` (resolvable by hand) rather than becoming `error` (not resolvable).
VF=$(mkvf s008order <<JSON
{ "slug":"s008order","done_rule":"all acs green",
  "acs":[
    {"id":"AC-1","kind":"static","check":"bash -c 'true'","pass":"exit 0","maps_to":["FR-1"],"requires":{"env":["CFN_S008_NEVER_SET_VAR"],"tools":["$SYNTH"]}}
  ],
  "coverage":{"fr_total":1,"fr_mapped":1} }
JSON
)
bless "$VF"
"$SCRIPT" run --verify "$VF" --out "$WORK/res-s008order.json" >/dev/null 2>&1 || true
R="$(jq -r '.results[0].reason' "$WORK/res-s008order.json")"
case "$R" in precondition_unmet*) ok "S008: an unmet requires{} precondition wins over the tool preflight" ;;
  *) no "S008: precondition should be adjudicated first (got: $R)" ;; esac
[ "$(jq -r '.results[0].mode' "$WORK/res-s008order.json")" = "blocked" ] \
  && ok "S008: that row stays blocked, not error" || no "S008: that row stays blocked"

# ---- a check whose tools all resolve is untouched by the preflight ----
VF=$(mkvf s008ok <<JSON
{ "slug":"s008ok","done_rule":"all acs green",
  "acs":[
    {"id":"AC-1","kind":"static","check":"grep -q verifyprobe $WORK/pv.txt","pass":"exit 0","maps_to":["FR-1"],"requires":{"tools":["grep"]}}
  ],
  "coverage":{"fr_total":1,"fr_mapped":1} }
JSON
)
bless "$VF"
"$SCRIPT" run --verify "$VF" --out "$WORK/res-s008ok.json" >/dev/null 2>&1
assert_exit $? 0 "S008: present tools (declared and inferred) leave the check alone"
[ "$(jq -r '.results[0].mode' "$WORK/res-s008ok.json")" = "executed" ] \
  && ok "S008: mode stays executed when the toolchain resolves" || no "S008: mode stays executed"

# ---- usage ----
"$SCRIPT" >/dev/null 2>&1; assert_exit $? 2 "no subcommand -> exit 2"
"$SCRIPT" run >/dev/null 2>&1; assert_exit $? 2 "run without --verify -> exit 2"

echo "----"
echo "W1 verify-run: $PASS/$RUN passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
