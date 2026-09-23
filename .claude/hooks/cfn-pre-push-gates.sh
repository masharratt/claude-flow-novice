#!/usr/bin/env bash
# cfn-selftest: not-a-hook git-hook runner invoked by .husky/pre-push, not a Claude Code settings-registered hook
# .claude/hooks/cfn-pre-push-gates.sh
# Local mirror of the CI Linux-side gates, run by .husky/pre-push so a broken
# push fails in ~90s at the terminal instead of after a full CI round-trip.
# Gate list is CI parity with .github/workflows/ci.yml (lint + unit-tests
# jobs, Node 20 leg). Stays CI-only and is NOT mirrored here: macOS
# Portability (needs real BSD userland), TruffleHog full-history scan
# (pre-commit already gates staged content locally), npm publish (secrets).
#
# Skip controls, cheapest honest skip first:
#   CFN_PRE_PUSH_FAST=1    drop unit tests only (~25s: shell gates, typecheck,
#                          build, bundle gate)
#   CFN_PRE_PUSH_SKIP=1    skip the whole hook (same as `git push --no-verify`)
#   CFN_PRE_PUSH_GATES=... override the registry; entries are "name::command",
#                          one per line (gate commands contain spaces, so the
#                          separator cannot be a space). Used by
#                          tests/test-pre-push-hook.sh so the test suite never
#                          runs the real gates.
#
# Every gate runs even after a failure; the summary names all failures at once
# (a fail-fast runner hides gates broken by the same change).

set -uo pipefail

ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || {
    echo "pre-push: not inside a git repo, refusing to run gates" >&2
    exit 1
}
cd "$ROOT" || exit 1

if [ "${CFN_PRE_PUSH_SKIP:-0}" = "1" ]; then
    echo "pre-push: skipped (CFN_PRE_PUSH_SKIP=1)"
    exit 0
fi

# ---------------------------------------------------------------- registry --
gate_names=()
gate_cmds=()

add_gate() {
    gate_names+=("$1")
    gate_cmds+=("$2")
}

add_gate "shell-portability"       "bash tests/test-shell-portability.sh"
add_gate "shell-syntax"            "bash tests/test-shell-syntax.sh"
add_gate "portable-shims"          "bash tests/test-portable-shims.sh"
add_gate "link-global-config"      "bash tests/test-link-global-config.sh"
add_gate "link-runtime-dirs"       "bash tests/test-link-runtime-dirs.sh"
add_gate "portability-skill-refs"  "bash tests/test-portability-skill-refs.sh"
add_gate "root-resolution"         "bash tests/test-root-resolution.sh"
add_gate "project-root-resolution" "bash tests/test-project-root-resolution.sh"
add_gate "sourced-paths-exist"     "bash tests/test-sourced-paths-exist.sh"
add_gate "path-containment"        "bash tests/security/test-path-containment.sh"
add_gate "env-handling"            "bash tests/security/test-env-handling.sh"
add_gate "sourced-library-safety"  "bash tests/security/test-sourced-library-safety.sh"
add_gate "typecheck"               "npm run typecheck"
add_gate "build"                   "npm run build"
add_gate "agent-selection-bundle"  "bash tests/test-agent-selection-bundle.sh"
# Exact CI invocation (ci.yml unit-tests job): NODE_ENV=test, --forceExit,
# maxWorkers=2. npm script already wraps jest in run-with-memory-limit.sh 2G.
if [ "${CFN_PRE_PUSH_FAST:-0}" != "1" ]; then
    add_gate "unit-tests" "NODE_ENV=test npm run test:unit -- --forceExit --maxWorkers=2"
fi

# Test override: replace the whole registry with "name::command" entries.
if [ -n "${CFN_PRE_PUSH_GATES:-}" ]; then
    gate_names=()
    gate_cmds=()
    while IFS= read -r entry; do
        [ -n "$entry" ] || continue
        gate_names+=("${entry%%::*}")
        gate_cmds+=("${entry#*::}")
    done <<< "$CFN_PRE_PUSH_GATES"
fi

# ------------------------------------------------------------------ --list --
if [ "${1:-}" = "--list" ]; then
    for i in "${!gate_names[@]}"; do
        printf '%s\t%s\n' "${gate_names[$i]}" "${gate_cmds[$i]}"
    done
    exit 0
fi

# ------------------------------------------------------------------- run ----
# timeout is GNU coreutils; a macOS clone without it (and without the brew
# shims) still gets a working hook, just without the per-gate ceiling.
TIMEOUT_CMD=$(command -v timeout || true)
GATE_TIMEOUT="${CFN_PRE_PUSH_GATE_TIMEOUT:-600}"

run_gate() {
    if [ -n "$TIMEOUT_CMD" ]; then
        "$TIMEOUT_CMD" "$GATE_TIMEOUT" bash -c "$1"
    else
        bash -c "$1"
    fi
}

passed=0
failed_names=()
for i in "${!gate_names[@]}"; do
    name="${gate_names[$i]}"
    log=$(mktemp "${TMPDIR:-/tmp}/prepush-gate.XXXXXX") || log="/dev/null"
    SECONDS=0
    if run_gate "${gate_cmds[$i]}" >"$log" 2>&1; then
        passed=$((passed + 1))
        printf 'PASS %-26s %ss\n' "$name" "$SECONDS"
    else
        rc=$?
        failed_names+=("$name")
        printf 'FAIL %-26s %ss (rc=%d)\n' "$name" "$SECONDS" "$rc"
        # Show enough of the gate's own output to act on without re-running it.
        tail -25 "$log" | sed 's/^/    /'
    fi
    [ "$log" != "/dev/null" ] && rm -f "$log"
done

total=${#gate_names[@]}
if [ "${#failed_names[@]}" -gt 0 ]; then
    echo ""
    echo "pre-push: BLOCKED -- ${#failed_names[@]} gate(s) failed: ${failed_names[*]}"
    echo "pre-push: $passed/$total gates passed."
    echo "pre-push: rerun a single gate: bash .claude/hooks/cfn-pre-push-gates.sh --list"
    exit 1
fi

echo "pre-push: $passed/$total gates passed."
exit 0
