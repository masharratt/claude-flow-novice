#!/usr/bin/env bash
# Regression: cfn-hook-selftest.sh false "registered nowhere" FAIL (2026-11-05).
# The script runs under `set -o pipefail` and tested membership with
# `echo "$BIG_VAR" | grep -q pattern`. grep -q exits on first match, echo gets
# SIGPIPE (141), pipefail turns the match into a failure, and a registered hook
# is reported as unregistered at random (a different hook each run). Blocked a
# commit after 7 new hook registrations grew the haystack.
set -uo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SELFTEST="$REPO_ROOT/.claude/hooks/cfn-hook-selftest.sh"
pass=0 fail=0
ok()  { echo "PASS: $1"; pass=$((pass+1)); }
bad() { echo "FAIL: $1"; fail=$((fail+1)); }

# 1. Static: no `echo "$VAR" | grep -q` membership tests remain.
# Code lines only: comments may describe the banned pattern. Line numbers from the first grep.
hits=$(grep -nE 'echo[[:space:]]+"\$[A-Za-z_]+"[[:space:]]*\|[[:space:]]*grep[[:space:]]+-[a-zA-Z]*q' "$SELFTEST" \
       | grep -vE '^[0-9]+:[[:space:]]*#' || true)
if [ -z "$hits" ]; then ok "no echo|grep -q pipelines under pipefail"
else bad "echo|grep -q pipelines remain: unexpected=[$(echo "$hits" | cut -d: -f1 | tr '\n' ' ')]"; fi

# 2. Demonstrate the trap is real on this host (guards against a vacuous test 1).
# Multi-line on purpose: grep must see a newline to match early and exit.
big=$(seq 1 200000 | sed 's/^/hook-line-/')
trap_hits=0
for _ in $(seq 1 20); do echo "$big" | grep -q hook-line-1 || trap_hits=$((trap_hits+1)); done
if [ "$trap_hits" -gt 0 ]; then ok "control: echo|grep -q under pipefail false-fails ($trap_hits/20)"
else echo "NOTE: control did not trip on this host (0/20); static check still applies"; fi

# 3. Live: the self-test is stable across repeated runs.
flaky=0
for _ in $(seq 1 40); do bash "$SELFTEST" --strict --quiet >/dev/null 2>&1 || flaky=$((flaky+1)); done
[ "$flaky" -eq 0 ] && ok "selftest stable over 40 runs" || bad "selftest failed $flaky/40 runs"

echo "---- $pass passed, $fail failed"
[ "$fail" -eq 0 ]
