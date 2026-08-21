#!/usr/bin/env bash
# Sourced-library safety gate for the shared CFN shell libraries.
#
# These libraries are reached from every project through the ~/.claude/skills and
# ~/.claude/cfn-extras reverse symlinks, and their documented entry point is
# `source`. Two bug classes made that fatal for the caller.
#
#   BUG A (fixed 2026-08-20): readonly constants at the top of a sourced library.
#     A library that declares `readonly RED=...` (or SCRIPT_DIR, SKILL_DIR,
#     LOG_TIMESTAMP) kills any caller that already declared the same name:
#     "RED: readonly variable", nonzero exit, nothing after the `source` runs.
#     Every integration harness that sources these declares the colour names
#     itself, most of them `readonly`, so this fired on essentially every use.
#     Note that plain reassignment is not enough either: assigning to a name the
#     caller froze is equally fatal. The libraries now assign only when unset.
#
#   BUG B (fixed 2026-08-20): wrong name in an indirect expansion.
#     sanitize_var logged `${!var_value}` where it meant `${!var_name}`.
#     var_value holds a numeric string, not a variable name. With the env var
#     unset (the normal case) var_value is empty, `${!}` is a fatal "invalid
#     variable name", and the whole sanitisation run died; with it set the log
#     line silently printed nothing.
#
#   BUG C (fixed alongside): `((changes++))` / `((issues++))` under `set -e`.
#     The arithmetic command returns 1 when the expression evaluates to 0, so
#     the first increment from 0 aborted sanitize_environment. Blocked BUG B's
#     fix from being observable at all.
#
# The checks source the real libraries and drive the real function. They do not
# grep for the fixed text, so a re-break in any other form still fails.
#
# Usage:
#   tests/security/test-sourced-library-safety.sh
set -uo pipefail

cd "$(git rev-parse --show-toplevel)"
ROOT="$PWD"

FAIL=0
pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1" >&2; FAIL=1; }
skip() { echo "SKIP: $1"; }

WORK="$(mktemp -d)"
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

# Libraries whose documented entry point is `source` and that have at least one
# real in-repo sourcer.
LIBS=(
  ".claude/cfn-extras/skills/utility/cfn-environment-sanitization/sanitize-environment.sh"
  ".claude/cfn-extras/skills/utility/cfn-process-instrumentation/instrument-process.sh"
  ".claude/skills/cfn-epic-creator/security-utils.sh"
  ".claude/cfn-extras/skills/deprecated/cfn-docker-runtime/lib/waves/lib/docker-helpers.sh"
  ".claude/skills/cfn-sprint-execution/lib/checkpoint/save-checkpoint.sh"
  ".claude/skills/cfn-sprint-execution/lib/checkpoint/resume-wave.sh"
  ".claude/skills/cfn-sprint-execution/lib/checkpoint/cleanup-orphans.sh"
)

# Source $1 in a fresh bash with the names in $2 (a bash snippet) pre-declared,
# then print a sentinel. Library stdout/stderr are diverted to a log so only the
# sentinel lands on stdout. Prints the sentinel on success; sets $RC.
RC=0
source_with() {
  local lib="$1" predecl="$2" log="$3" out
  out="$(bash -c '
    '"$predecl"'
    source "$1" >/dev/null
    printf "SENTINEL_REACHED\n"
  ' _ "$lib" 2>"$log")"
  RC=$?
  printf '%s' "$out"
}

PREDECL_COLORS="readonly RED=CALLER-RED GREEN=CALLER-GREEN YELLOW=CALLER-YELLOW BLUE=CALLER-BLUE NC=CALLER-NC"

##############################################################################
# 1. Sourcing must survive a caller that already froze the colour names.
##############################################################################
for lib in "${LIBS[@]}"; do
  if [ ! -f "$ROOT/$lib" ]; then
    fail "$lib is missing"
    continue
  fi

  name="$(basename "$lib")"
  export CFN_TELEMETRY_DIR="$WORK/telemetry"

  # Control pass: no pre-declared names. If the library cannot be sourced even
  # cleanly, the failure is unrelated to this gate, so skip instead of passing.
  ctl_log="$WORK/$name.control.log"
  ctl="$(source_with "$ROOT/$lib" "true" "$ctl_log")"
  ctl_rc=$RC
  if [ "$ctl" != "SENTINEL_REACHED" ] || [ "$ctl_rc" -ne 0 ]; then
    skip "$lib cannot be sourced even with no pre-declared names (rc=$ctl_rc): $(tail -3 "$ctl_log" | tr '\n' ' ')"
    continue
  fi

  log="$WORK/$name.readonly.log"
  got="$(source_with "$ROOT/$lib" "$PREDECL_COLORS" "$log")"
  rc=$RC
  if [ "$got" = "SENTINEL_REACHED" ] && [ "$rc" -eq 0 ]; then
    pass "$lib survives a caller with readonly RED/GREEN/YELLOW/BLUE/NC"
  else
    fail "$lib killed its caller (rc=$rc, sentinel='$got'): $(tail -3 "$log" | tr '\n' ' ')"
  fi
done

##############################################################################
# 1b. The checkpoint trio declares an IDENTICAL set of names in all three files,
#     and the documented integration pattern in
#     lib/checkpoint/SKILL.md:153,158 sources two of them into one shell:
#         source save-checkpoint.sh && checkpoint_exists ...
#         source resume-wave.sh
#     With `readonly` that pattern died on the second source with
#     "resume-wave.sh: line 17: REDIS_HOST: readonly variable" (exit 1). The
#     single-library loop above cannot catch this: each file is individually
#     fine, the collision only exists in the combination the docs prescribe.
#
#     Sensitivity, so nobody mistakes a pass for more than it is: this fires
#     only when the FIRST-sourced file freezes the name AND the second assigns
#     to it unguarded. Declaring `readonly` over a name that is merely already
#     set is legal, and a guarded second assignment short-circuits, so
#     re-breaking either file alone still passes. Verified by re-breaking each
#     file singly (both passed) and then both together, which reproduced the
#     original "resume-wave.sh: line 24: REDIS_HOST: readonly variable".
##############################################################################
CHECKPOINT_DIR=".claude/skills/cfn-sprint-execution/lib/checkpoint"
CP_PAIRS="save-checkpoint.sh:resume-wave.sh
save-checkpoint.sh:cleanup-orphans.sh
resume-wave.sh:cleanup-orphans.sh"

while IFS=':' read -r first second; do
  [ -n "$first" ] || continue
  if [ ! -f "$ROOT/$CHECKPOINT_DIR/$first" ] || [ ! -f "$ROOT/$CHECKPOINT_DIR/$second" ]; then
    skip "$first + $second: one of the pair is missing"
    continue
  fi
  log="$WORK/pair-$first-$second.log"
  got="$(cd /tmp && bash -c "
    set -euo pipefail
    source '$ROOT/$CHECKPOINT_DIR/$first'
    source '$ROOT/$CHECKPOINT_DIR/$second'
    echo SENTINEL_REACHED
  " 2>"$log")"
  rc=$?
  if [ "$got" = "SENTINEL_REACHED" ] && [ "$rc" -eq 0 ]; then
    pass "$first and $second can be sourced into one shell (the documented pattern)"
  else
    fail "sourcing $first then $second killed the shell (rc=$rc, sentinel='$got'): $(tail -2 "$log" | tr '\n' ' ')"
  fi
done <<CPEOF
$CP_PAIRS
CPEOF

##############################################################################
# 2. docker-helpers also declares SCRIPT_DIR / SKILL_DIR / LOG_TIMESTAMP, and
#    every one of its three sourcers sets SCRIPT_DIR before sourcing.
##############################################################################
DOCKER_LIB=".claude/cfn-extras/skills/deprecated/cfn-docker-runtime/lib/waves/lib/docker-helpers.sh"
if [ ! -f "$ROOT/$DOCKER_LIB" ]; then
  fail "$DOCKER_LIB is missing"
else
  log="$WORK/docker-helpers.dirs.log"
  got="$(source_with "$ROOT/$DOCKER_LIB" \
    "$PREDECL_COLORS
     readonly SCRIPT_DIR=/caller/dir SKILL_DIR=/caller LOG_TIMESTAMP=caller-stamp" "$log")"
  rc=$RC
  if [ "$got" = "SENTINEL_REACHED" ] && [ "$rc" -eq 0 ]; then
    pass "$DOCKER_LIB survives a caller with readonly SCRIPT_DIR/SKILL_DIR/LOG_TIMESTAMP"
  else
    fail "$DOCKER_LIB killed its caller over SCRIPT_DIR/SKILL_DIR/LOG_TIMESTAMP (rc=$rc, sentinel='$got'): $(tail -3 "$log" | tr '\n' ' ')"
  fi
fi

##############################################################################
# 3. sanitize_var must survive an UNSET env var and must log the value it
#    actually exported. This drives the real function, not a copy of it.
##############################################################################
SAN=".claude/cfn-extras/skills/utility/cfn-environment-sanitization/sanitize-environment.sh"
if [ ! -f "$ROOT/$SAN" ]; then
  fail "$SAN is missing"
else
  # MAX_AGENTS -> enforce_10, CFN_TIMEOUT -> enforce_600, NODE_HEAP_LIMIT -> enforce_2gb
  san_log="$WORK/sanitize.run.log"
  san_out="$(bash -c '
    unset MAX_AGENTS CFN_TIMEOUT NODE_HEAP_LIMIT
    source "$1" >/dev/null
    printf "EXPORTED MAX_AGENTS=%s CFN_TIMEOUT=%s NODE_HEAP_LIMIT=%s\n" \
      "${MAX_AGENTS:-<empty>}" "${CFN_TIMEOUT:-<empty>}" "${NODE_HEAP_LIMIT:-<empty>}"
    # Drive the buggy function directly, with the variable unset again.
    unset MAX_AGENTS CFN_TIMEOUT
    sanitize_var MAX_AGENTS
    sanitize_var CFN_TIMEOUT
    printf "SENTINEL_REACHED\n"
  ' _ "$ROOT/$SAN" 2>"$san_log")"
  san_rc=$?

  if [ "$san_rc" -eq 0 ] && printf '%s' "$san_out" | grep -q SENTINEL_REACHED; then
    pass "sanitize-environment.sh survives sourcing with MAX_AGENTS/CFN_TIMEOUT unset"
  else
    fail "sanitize-environment.sh died with MAX_AGENTS/CFN_TIMEOUT unset (rc=$san_rc): $(tail -3 "$san_log" | tr '\n' ' ')"
  fi

  if printf '%s' "$san_out" | grep -q 'EXPORTED MAX_AGENTS=10 CFN_TIMEOUT=600 NODE_HEAP_LIMIT=2048'; then
    pass "sanitize_var exports the enforced defaults (10 / 600 / 2048)"
  else
    fail "sanitize_var did not export the enforced defaults: $(printf '%s' "$san_out" | grep EXPORTED || echo '<no EXPORTED line>')"
  fi

  # The log line must report the value that was exported, not an empty string.
  for want in "MAX_AGENTS=10" "CFN_TIMEOUT=600" "NODE_HEAP_LIMIT=2048"; do
    if grep -q "$want" "$san_log"; then
      pass "sanitize_var logs the exported value ($want)"
    else
      fail "sanitize_var log line lost the value; expected '$want' in: $(grep -o 'Enforcing[^"]*' "$san_log" | tr '\n' ' ' | head -c 300)"
    fi
  done
fi

echo "---"
if [ "$FAIL" -eq 0 ]; then
  echo "sourced library safety: OK"
else
  echo "sourced library safety: FAILED" >&2
fi
exit "$FAIL"
