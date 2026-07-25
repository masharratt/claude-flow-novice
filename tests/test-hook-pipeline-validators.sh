#!/usr/bin/env bash
# Regression tests for the 2026-07-25 hook audit, part 2: missing bash/python
# validators in the post-edit pipeline.
#
# The bug: post-edit-pipeline.js dispatches validators by file extension from
# `validatorsByExtension`, resolving each to `.claude/skills/hook-pipeline/<name>`.
# That directory has never existed. Every dispatch therefore ran
# `bash .claude/skills/hook-pipeline/bash-pipe-safety.sh <file>` -> exit 127,
# which matches none of the pipeline's pass/blocking/warning branches. The run
# logged status SUCCESS with "executed:3 passed:0 warnings:0 errors:0" and
# exited 0. A validator that cannot be FOUND read exactly like a validator that
# found NOTHING -- the same failure shape as every other case in
# tests/test-hook-security.sh.
#
# Python was worse than silent: python3 exits 2 for a missing script, and 2 is
# the pipeline's "non-blocking warning" convention, so absent .py validators
# were reported as validator warnings about the edited file.
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
run_pipeline() { # $1 = target file, rest = env assignments already exported
    ( cd "$SCRATCH" && node "$PIPELINE" "$1" >"$SCRATCH/out.json" 2>"$SCRATCH/out.err" )
    echo $?
}
final_json() { tail -n 1 "$SCRATCH/out.json"; }

# --- T1: an absent validator must be reported on stderr -------------------
head_ "T1  absent validator is announced on stderr (not silently skipped)"

# Samples live in a subdirectory: a file at the scratch ROOT trips the
# pipeline's unrelated root-directory warning (exit 2) and would mask the
# exit code this test is actually about.
mkdir -p "$SCRATCH/src"
printf '#!/bin/bash\necho hi\n' > "$SCRATCH/src/sample.sh"
unset CFN_HOOK_VALIDATOR_DIR
export CFN_HOOK_VALIDATOR_DIR="$SCRATCH/no-such-validator-dir"
RC=$(run_pipeline "$SCRATCH/src/sample.sh")

for v in bash-pipe-safety.sh bash-dependency-checker.sh enforce-lf.sh; do
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

printf 'x = 1\n' > "$SCRATCH/src/sample.py"
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

# --- T5: positive control -- present validators still work ----------------
# The fix must not turn every run red. With real validators on disk the run
# reports zero missing and the normal exit path.
head_ "T5  present validators run normally (no false missing report)"

STUB_DIR="$SCRATCH/validators"
mkdir -p "$STUB_DIR"
for v in bash-pipe-safety.sh bash-dependency-checker.sh enforce-lf.sh; do
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

rm -f "$STUB_DIR/enforce-lf.sh"
RC_PART=$(run_pipeline "$SCRATCH/src/sample.sh")

PART_MISSING=$(final_json | jq -r '.bashValidators.missing // "absent"' 2>/dev/null)
if [ "$PART_MISSING" = "1" ]; then
    ok "bashValidators.missing == 1"
else
    bad "bashValidators.missing == '$PART_MISSING' (expected 1)"
fi

if grep -q "enforce-lf.sh" "$SCRATCH/out.err"; then
    ok "stderr names the absent validator (enforce-lf.sh)"
else
    bad "stderr does not name the absent validator"
fi

if grep -q "bash-pipe-safety.sh" "$SCRATCH/out.err"; then
    bad "stderr wrongly names a validator that IS present (bash-pipe-safety.sh)"
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

# --- summary --------------------------------------------------------------
printf '\n----------------------------------------\n'
printf 'passed: %d   failed: %d\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
