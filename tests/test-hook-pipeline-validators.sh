#!/usr/bin/env bash
# Regression tests for the 2026-07-25 hook audit, part 2: the post-edit
# pipeline's extension-dispatched validators.
#
# History (corrected 2026-07-25 -- an earlier version of this comment claimed
# .claude/skills/hook-pipeline/ "has never existed", which is wrong):
#   * The directory DID exist. Ten validators were added there on 2025-11-04 in
#     ec9c69585 and 938d96e60, and it was already present before e427cd571
#     (2025-10-24).
#   * It was deleted on 2025-11-05 in 304584e0b, as collateral in a bulk skill
#     cleanup. `validatorsByExtension` in post-edit-pipeline.js was never
#     updated, so from that commit on every dispatch resolved to a file that no
#     longer existed.
#
# The bug that leaves: `bash .claude/skills/hook-pipeline/bash-pipe-safety.sh
# <file>` exits 127, which matches none of the pipeline's pass/blocking/warning
# branches. The run logged status SUCCESS with "executed:3 passed:0 warnings:0
# errors:0" and exited 0. A validator that cannot be FOUND read exactly like a
# validator that found NOTHING -- the same failure shape as every other case in
# tests/test-hook-security.sh. Python was worse than silent: python3 exits 2 for
# a missing script and 2 is the pipeline's "non-blocking warning" convention, so
# absent .py validators were reported as validator warnings about the file.
#
# Resolution (2026-07-25): all ten dangling entries were dropped rather than
# restored; shellcheck now covers the shell ones. `validatorsByExtension` ships
# EMPTY, so these tests inject validators through the CFN_HOOK_VALIDATORS test
# seam -- the detection machinery must stay tested even with nothing dispatched
# by default.
#
# Run: bash tests/test-hook-pipeline-validators.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$REPO_ROOT/.claude/hooks/cfn-post-edit.config.json"
SCRATCH=$(mktemp -d /tmp/hook-pipeline-test-XXXXXX)
trap 'rm -rf "$SCRATCH"' EXIT

PASS=0
FAIL=0

ok()    { printf '  \033[32mPASS\033[0m %s\n' "$1"; PASS=$((PASS + 1)); }
bad()   { printf '  \033[31mFAIL\033[0m %s\n' "$1"; FAIL=$((FAIL + 1)); }
head_() { printf '\n%s\n' "$1"; }

# --- locate the pipeline the way the hook does ----------------------------
# cfn-invoke-post-edit.sh reads .pipeline from the config and resolves it
# against the repo root. Testing any other copy tests code that never runs.
head_ "T0  live pipeline resolves from cfn-post-edit.config.json"

if [ ! -f "$CONFIG" ]; then
    bad "config not found at $CONFIG"
    printf '\npassed: %d   failed: %d\n' "$PASS" "$FAIL"
    exit 1
fi

PIPELINE_REL=$(jq -r '.pipeline // empty' "$CONFIG" 2>/dev/null)
PIPELINE="$REPO_ROOT/$PIPELINE_REL"
case "$PIPELINE_REL" in /*) PIPELINE="$PIPELINE_REL" ;; esac

if [ -n "$PIPELINE_REL" ] && [ -f "$PIPELINE" ]; then
    ok "pipeline present: $PIPELINE_REL"
else
    bad "pipeline referenced by config does not exist: '$PIPELINE_REL'"
    printf '\npassed: %d   failed: %d\n' "$PASS" "$FAIL"
    exit 1
fi

# Run every invocation from $SCRATCH so the pipeline's .artifacts/logs/ writes
# land in the scratch dir, never in the repo.
run_pipeline() { # $1 = target file, env assignments already exported
    ( cd "$SCRATCH" && node "$PIPELINE" "$1" >"$SCRATCH/out.json" 2>"$SCRATCH/out.err" )
    echo $?
}
final_json() { tail -n 1 "$SCRATCH/out.json"; }

# Samples live in a subdirectory: a file at the scratch ROOT trips the
# pipeline's unrelated root-directory warning (exit 2) and would mask the exit
# codes these tests are actually about.
mkdir -p "$SCRATCH/src"
printf '#!/bin/bash\nVAR=1\necho "$VAR"\n' > "$SCRATCH/src/sample.sh"
printf 'x = 1\n' > "$SCRATCH/src/sample.py"

# shellcheck is exercised separately (T9-T12). Keep it out of the way for the
# missing-validator tests so it cannot colour their exit codes.
export CFN_HOOK_SHELLCHECK_BIN="$SCRATCH/no-such-shellcheck"

# --- T1: an absent validator must be reported on stderr -------------------
head_ "T1  absent validator is announced on stderr (not silently skipped)"

# Deliberately-injected fakes. The real ten are gone on purpose (304584e0b, not
# restored), so the detection path is tested with names that are guaranteed
# absent instead of relying on the deleted ones staying deleted.
export CFN_HOOK_VALIDATORS='{".sh":["fake-missing-a.sh","fake-missing-b.sh","fake-missing-c.sh"],".py":["fake-missing-a.py","fake-missing-b.py","fake-missing-c.py","fake-missing-d.py"]}'
export CFN_HOOK_VALIDATOR_DIR="$SCRATCH/no-such-validator-dir"
RC=$(run_pipeline "$SCRATCH/src/sample.sh")

for v in fake-missing-a.sh fake-missing-b.sh fake-missing-c.sh; do
    if grep -qi "missing validator" "$SCRATCH/out.err" && grep -q "$v" "$SCRATCH/out.err"; then
        ok "stderr names missing validator: $v"
    else
        bad "stderr is silent about missing validator: $v"
    fi
done

# --- T2: the run must not report the validators as executed-and-clean -----
# This is the exact lie: executed:3 passed:0 warnings:0 errors:0, status
# SUCCESS. The summary must carry a missing count instead.
head_ "T2  summary reports missing validators, not a clean run"

MISSING=$(final_json | jq -r '.bashValidators.missing // "absent"' 2>/dev/null)
if [ "$MISSING" = "3" ]; then
    ok "bashValidators.missing == 3"
else
    bad "bashValidators.missing == '$MISSING' (expected 3)"
fi

STATUS=$(final_json | jq -r '.status // empty' 2>/dev/null)
if [ "$STATUS" = "SUCCESS" ] || [ "$STATUS" = "IMPROVEMENTS_SUGGESTED" ]; then
    bad "final status '$STATUS' claims a healthy run while 3 validators are missing"
else
    ok "final status is '$STATUS' (does not claim a healthy run)"
fi

# --- T3: exit code must be non-zero ---------------------------------------
head_ "T3  missing validators produce a failing exit code"

if [ "$RC" -eq 9 ]; then
    ok "exit 9 (BASH_VALIDATOR_ERROR, the code cfn-post-edit.config.json defines)"
else
    bad "exit $RC -- missing validators do not fail the run (expected 9)"
fi

# --- T4: python validators must not be mislabelled as warnings ------------
# python3 exits 2 for a missing script and 2 is the pipeline's warning code,
# so an absent .py validator used to surface as a warning ABOUT THE EDITED
# FILE rather than as a missing tool.
head_ "T4  absent python validators are reported missing, not as file warnings"

RC_PY=$(run_pipeline "$SCRATCH/src/sample.py")
PY_MISSING=$(final_json | jq -r '.bashValidators.missing // "absent"' 2>/dev/null)
PY_WARN=$(final_json | jq -r '.bashValidators.warnings // "absent"' 2>/dev/null)

if [ "$PY_MISSING" = "4" ]; then
    ok "bashValidators.missing == 4 for .py"
else
    bad "bashValidators.missing == '$PY_MISSING' (expected 4)"
fi

if [ "$PY_WARN" = "0" ]; then
    ok "missing python validators are not counted as file warnings"
else
    bad "missing python validators counted as $PY_WARN warning(s) about the file"
fi

if [ "$RC_PY" -eq 9 ]; then
    ok "exit 9 for missing python validators"
else
    bad "exit $RC_PY for missing python validators (expected 9)"
fi

# --- T5: positive control -- present validators still work ----------------
# The fix must not turn every run red. With real validators on disk the run
# reports zero missing and the normal exit path.
head_ "T5  present validators run normally (no false missing report)"

STUB_DIR="$SCRATCH/validators"
mkdir -p "$STUB_DIR"
for v in fake-missing-a.sh fake-missing-b.sh fake-missing-c.sh; do
    printf '#!/bin/bash\nexit 0\n' > "$STUB_DIR/$v"
    chmod +x "$STUB_DIR/$v"
done

export CFN_HOOK_VALIDATOR_DIR="$STUB_DIR"
RC_OK=$(run_pipeline "$SCRATCH/src/sample.sh")

OK_MISSING=$(final_json | jq -r '.bashValidators.missing // "absent"' 2>/dev/null)
OK_PASSED=$(final_json | jq -r '.bashValidators.passed // "absent"' 2>/dev/null)

if [ "$OK_MISSING" = "0" ]; then
    ok "bashValidators.missing == 0 when validators exist"
else
    bad "bashValidators.missing == '$OK_MISSING' with all validators present"
fi

if [ "$OK_PASSED" = "3" ]; then
    ok "all 3 present validators executed and passed"
else
    bad "passed == '$OK_PASSED' (expected 3)"
fi

if grep -qi "missing validator" "$SCRATCH/out.err"; then
    bad "stderr still warns about missing validators when none are missing"
else
    ok "no missing-validator warning when all validators are present"
fi

if [ "$RC_OK" -eq 9 ]; then
    bad "exit 9 even though every validator is present"
else
    ok "exit $RC_OK (not the missing-validator failure code)"
fi

# --- T6: partial presence names only the absent one -----------------------
head_ "T6  partially populated validator dir names only what is absent"

rm -f "$STUB_DIR/fake-missing-c.sh"
RC_PART=$(run_pipeline "$SCRATCH/src/sample.sh")

PART_MISSING=$(final_json | jq -r '.bashValidators.missing // "absent"' 2>/dev/null)
if [ "$PART_MISSING" = "1" ]; then
    ok "bashValidators.missing == 1"
else
    bad "bashValidators.missing == '$PART_MISSING' (expected 1)"
fi

if grep -q "fake-missing-c.sh" "$SCRATCH/out.err"; then
    ok "stderr names the absent validator (fake-missing-c.sh)"
else
    bad "stderr does not name the absent validator"
fi

if grep -q "fake-missing-a.sh" "$SCRATCH/out.err"; then
    bad "stderr wrongly names a validator that IS present (fake-missing-a.sh)"
else
    ok "stderr does not name validators that are present"
fi

# --- T7: validator path is repo-anchored, not cwd-relative ----------------
# The original resolved '.claude/skills/hook-pipeline/<name>' against
# process.cwd(), so the lookup only ever had a chance of working when the
# pipeline was invoked from the CFN repo root. Every one of the runs above
# executed from $SCRATCH; if the path were still cwd-relative the default
# (unset CFN_HOOK_VALIDATOR_DIR) lookup below could never resolve.
head_ "T7  default validator dir is anchored to the CFN repo, not the cwd"

if grep -q "CFN_HOOK_VALIDATOR_DIR" "$PIPELINE" && \
   grep -qE "resolve\(\s*CFN_REPO_ROOT.*hook-pipeline" "$PIPELINE"; then
    ok "validator dir resolves against CFN_REPO_ROOT with an env override"
else
    bad "validator dir is not anchored to CFN_REPO_ROOT (cwd-relative lookup)"
fi

# --- T8: the shipped dispatch table has no dangling references ------------
# The ten validators deleted in 304584e0b stayed listed in
# validatorsByExtension for months. With no injection and no override, a plain
# .sh edit must dispatch nothing and report nothing missing.
head_ "T8  default dispatch table references no validator that is absent"

unset CFN_HOOK_VALIDATORS
unset CFN_HOOK_VALIDATOR_DIR
RC_DEFAULT=$(run_pipeline "$SCRATCH/src/sample.sh")

if grep -qi "missing validator" "$SCRATCH/out.err"; then
    bad "default run reports missing validators: $(grep -i 'missing validator' "$SCRATCH/out.err" | head -1)"
else
    ok "default run reports no missing validators"
fi

if [ "$RC_DEFAULT" -eq 9 ]; then
    bad "default .sh edit exits 9 (dangling entries in validatorsByExtension)"
else
    ok "default .sh edit exits $RC_DEFAULT (not the missing-validator code)"
fi

for dead in bash-pipe-safety.sh bash-dependency-checker.sh enforce-lf.sh \
            python-subprocess-safety.py python-async-safety.py \
            python-import-checker.py js-promise-safety.sh \
            rust-command-safety.sh rust-future-safety.sh \
            rust-dependency-checker.sh; do
    # Named in the removal comment, never dispatched: the name may appear in
    # the file, but not inside a validatorsByExtension array literal.
    if grep -qE "^\s*'$dead'," "$PIPELINE"; then
        bad "deleted validator still dispatched: $dead"
    else
        ok "deleted validator not dispatched: $dead"
    fi
done

# --- shellcheck integration -----------------------------------------------
# shellcheck is a system binary (apt install shellcheck), deliberately not an
# npm dependency. Where it is not installed these tests drive the integration
# through a stand-in that mimics its gcc output format and exit codes, so the
# three outcomes (absent / clean / findings) are covered on any machine.
head_ "T9  shellcheck integration: harness setup"

if command -v shellcheck >/dev/null 2>&1; then
    SHELLCHECK_UNDER_TEST="$(command -v shellcheck)"
    ok "using the real shellcheck: $SHELLCHECK_UNDER_TEST"
else
    SHELLCHECK_UNDER_TEST="$SCRATCH/shellcheck-standin"
    cat > "$SHELLCHECK_UNDER_TEST" <<'STANDIN'
#!/bin/bash
# Minimal shellcheck stand-in: gcc-format output, exit 1 on findings, 0 clean.
target="${!#}"
if grep -nE 'echo \$[A-Za-z_]' "$target" >/dev/null 2>&1; then
    grep -nE 'echo \$[A-Za-z_]' "$target" | while IFS=: read -r ln _; do
        printf '%s:%s:1: note: Double quote to prevent globbing and word splitting. [SC2086]\n' "$target" "$ln"
    done
    exit 1
fi
exit 0
STANDIN
    chmod +x "$SHELLCHECK_UNDER_TEST"
    ok "shellcheck absent on this host; driving the integration with a stand-in"
fi

# --- T10: shellcheck absent is SKIPPED, not passed and not failed ---------
head_ "T10 shellcheck absent is handled gracefully (skipped, not a silent pass)"

export CFN_HOOK_SHELLCHECK_BIN="$SCRATCH/definitely-not-installed-shellcheck"
RC_NOSC=$(run_pipeline "$SCRATCH/src/sample.sh")

if grep -qi "shellcheck skipped" "$SCRATCH/out.err"; then
    ok "stderr carries a one-line SHELLCHECK SKIPPED note"
else
    bad "absent shellcheck is silent on stderr"
fi

NOSC_SKIPPED=$(final_json | jq -r '.shellcheck.skipped // "absent"' 2>/dev/null)
NOSC_PASSED=$(final_json | jq -r '.shellcheck.passed // "null"' 2>/dev/null)

if [ "$NOSC_SKIPPED" = "true" ]; then
    ok "shellcheck.skipped == true"
else
    bad "shellcheck.skipped == '$NOSC_SKIPPED' (expected true)"
fi

if [ "$NOSC_PASSED" = "null" ]; then
    ok "shellcheck.passed is null (not claimed as a pass)"
else
    bad "shellcheck.passed == '$NOSC_PASSED' -- absent linter reported as a pass"
fi

if [ "$RC_NOSC" -eq 0 ]; then
    ok "exit 0 (missing shellcheck is not a failure)"
else
    bad "exit $RC_NOSC -- missing shellcheck should not fail the run"
fi

# --- T11: a clean shell file passes ---------------------------------------
head_ "T11 clean shell file passes shellcheck"

export CFN_HOOK_SHELLCHECK_BIN="$SHELLCHECK_UNDER_TEST"
RC_CLEAN=$(run_pipeline "$SCRATCH/src/sample.sh")

CLEAN_PASSED=$(final_json | jq -r '.shellcheck.passed // "absent"' 2>/dev/null)
CLEAN_COUNT=$(final_json | jq -r '.shellcheck.findingCount // "absent"' 2>/dev/null)

if [ "$CLEAN_PASSED" = "true" ]; then
    ok "shellcheck.passed == true on a clean file"
else
    bad "shellcheck.passed == '$CLEAN_PASSED' on a clean file"
fi

if [ "$CLEAN_COUNT" = "0" ]; then
    ok "shellcheck.findingCount == 0"
else
    bad "shellcheck.findingCount == '$CLEAN_COUNT' (expected 0)"
fi

if [ "$RC_CLEAN" -eq 10 ]; then
    bad "clean file produced the warning exit code 10"
else
    ok "exit $RC_CLEAN (no warning raised for a clean file)"
fi

# --- T12: a violating shell file warns and does NOT block -----------------
head_ "T12 shellcheck finding is a non-blocking warning"

printf '#!/bin/bash\nVAR=1\necho $VAR\n' > "$SCRATCH/src/dirty.sh"
RC_DIRTY=$(run_pipeline "$SCRATCH/src/dirty.sh")

DIRTY_COUNT=$(final_json | jq -r '.shellcheck.findingCount // 0' 2>/dev/null)
DIRTY_STATUS=$(final_json | jq -r '.status // empty' 2>/dev/null)
DIRTY_RECS=$(final_json | jq -r '[.topRecommendations[]? | select(.type == "shellcheck")] | length' 2>/dev/null)

if [ "$DIRTY_COUNT" -gt 0 ] 2>/dev/null; then
    ok "shellcheck.findingCount == $DIRTY_COUNT on a violating file"
else
    bad "shellcheck reported no findings on a file with an unquoted \$VAR"
fi

if [ "$DIRTY_RECS" -gt 0 ] 2>/dev/null; then
    ok "finding surfaced as a recommendation"
else
    bad "finding produced no recommendation"
fi

if [ "$DIRTY_STATUS" = "BASH_VALIDATOR_WARNING" ] && [ "$RC_DIRTY" -eq 10 ]; then
    ok "status BASH_VALIDATOR_WARNING / exit 10 (the pipeline's warning bucket)"
else
    bad "status '$DIRTY_STATUS' exit $RC_DIRTY (expected BASH_VALIDATOR_WARNING / 10)"
fi

if jq -e '.feedback.nonBlocking | index("BASH_VALIDATOR_WARNING")' "$CONFIG" >/dev/null 2>&1; then
    ok "config lists BASH_VALIDATOR_WARNING as non-blocking"
else
    bad "BASH_VALIDATOR_WARNING is not in feedback.nonBlocking -- findings would block"
fi

# The real gate: the hook entry point must still exit 0 for a shellcheck
# finding, i.e. the edit is not blocked.
INVOKE_RC=0
( cd "$SCRATCH" && CFN_HOOK_SHELLCHECK_BIN="$SHELLCHECK_UNDER_TEST" \
    bash "$REPO_ROOT/.claude/hooks/cfn-invoke-post-edit.sh" "$SCRATCH/src/dirty.sh" \
    --agent-id hook-validator-test >"$SCRATCH/invoke.out" 2>&1 ) || INVOKE_RC=$?

if [ "$INVOKE_RC" -eq 0 ]; then
    ok "cfn-invoke-post-edit.sh exits 0 -- shellcheck findings do not block the edit"
else
    bad "cfn-invoke-post-edit.sh exited $INVOKE_RC on a shellcheck finding (blocked)"
fi

# --- summary --------------------------------------------------------------
printf '\n----------------------------------------\n'
printf 'passed: %d   failed: %d\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
