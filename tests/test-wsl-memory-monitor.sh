#!/usr/bin/env bash
# tests/test-wsl-memory-monitor.sh
# Request (mdtwii-tooling): the WSL memory monitor killed the tmux server holding every
# agent lane (KILL-GROUP, tmux parent at 15%). Prove 'tmux' and 'tmux: server' are never
# selected for kill, and that a node test runner over the limit still is (control).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/.claude/cfn-scripts/wsl-memory-monitor.sh"

PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "PASS: $1"; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL: $1"; }

# shellcheck disable=SC1090
source "$SCRIPT"
LOG=$(mktemp) || exit 1
trap 'rm -f "$LOG"' EXIT

expect_protected() {
    local label=$1 cmd=$2
    if is_protected_proc "$cmd"; then ok "protected: $label"; else bad "protected: $label (selected for kill, protected=no)"; fi
}
expect_unprotected() {
    local label=$1 cmd=$2
    if is_protected_proc "$cmd"; then bad "unprotected: $label (wrongly protected)"; else ok "unprotected: $label"; fi
}
expect_reason() {
    local label=$1 want=$2 mem=$3 cmd=$4 full=$5 got
    got=$(proc_kill_reason "$mem" "$cmd" "$full")
    if [ "$got" = "$want" ]; then ok "$label"; else bad "$label: want='$want' got='$got'"; fi
}

# ps-style command strings (first token as ps aux prints it)
expect_protected "tmux server argv rewrite 'tmux: server'" "tmux: server"
expect_protected "tmux client with args" "tmux new-session -d -s lane1"
expect_protected "tmux full path" "/usr/bin/tmux attach"
expect_protected "tmux: client form" "tmux: client"
expect_protected "bash (existing)" "/bin/bash -lc foo"
expect_unprotected "node vitest" "node /repo/node_modules/.bin/vitest run"
expect_unprotected "tmuxinator lookalike" "tmuxinator start x"

# Selection: tmux at 99% must never produce a kill reason, any threshold.
expect_reason "tmux: server at 99% not killed" "" 99.0 "tmux: server" "tmux: server "
expect_reason "tmux at 99% not killed" "" 99.0 "tmux new -s a" "tmux new -s a "
# Control: node test runner over the 10% limit is selected.
expect_reason "control: node vitest at 12% killed" "test-runner-over-10%" 12.0 \
    "node /r/node_modules/.bin/vitest" "node /r/node_modules/.bin/vitest run "
expect_reason "control: generic proc at 20% killed" "generic-over-15%" 20.0 "someapp --x" "someapp --x "
expect_reason "control: generic proc at 5% spared" "" 5.0 "someapp --x" "someapp --x "

echo "passed=$PASS failed=$FAIL"
[ "$FAIL" -eq 0 ]
