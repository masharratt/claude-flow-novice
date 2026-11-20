#!/usr/bin/env bash
# Regression: BUG dead-pane-status-unknown (2026-11-20). tmux 3.4 can leave a
# dead pane's process unreaped, so spawn printed "engine exited with status
# unknown". _ta_zombie_exit_status must recover the code from /proc/PID/stat.
set -euo pipefail
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../lib/common.sh
source "$SKILL_DIR/lib/common.sh"
PASS=0 FAIL=0
ok()  { PASS=$((PASS+1)); echo "  PASS: $1"; }
bad() { FAIL=$((FAIL+1)); echo "  FAIL: $1"; }
[ -d /proc/self ] || { echo "SKIP: no /proc"; exit 0; }

# zombie PARENT_CMD: start a parent that never reaps its child; print the child pid
zombie() {
  local out; out=$(mktemp)
  bash -c "$1 & echo \$! > '$out'; exec sleep 5" >/dev/null 2>&1 &  # own stdout: $(zombie) must not wait for it
  local parent=$! i=0 pid=""
  while [ $i -lt 50 ]; do pid=$(cat "$out" 2>/dev/null || true)
    [ -n "$pid" ] && [ "$(sed -e 's/^.*) //' /proc/"$pid"/stat 2>/dev/null | awk '{print $1}')" = Z ] && break
    sleep 0.1; i=$((i+1)); done
  rm -f "$out"; : "$parent"; echo "$pid"
}

Z=$(zombie "sh -c 'exit 3'")
got=$(_ta_zombie_exit_status "$Z" || echo none)
[ "$got" = 3 ] && ok "unreaped child exit 3 recovered" || bad "want 3, got $got (pid $Z)"
pkill -P "$$" sleep 2>/dev/null || true

Z=$(zombie "sh -c 'kill -TERM \$\$'")
got=$(_ta_zombie_exit_status "$Z" || echo none)
[ "$got" = 143 ] && ok "child killed by TERM reports 143" || bad "want 143, got $got"
pkill -P "$$" sleep 2>/dev/null || true

_ta_zombie_exit_status "$$" >/dev/null 2>&1 && bad "live process treated as zombie" || ok "live process: rc 1"
_ta_zombie_exit_status "abc" >/dev/null 2>&1 && bad "non-numeric pid accepted" || ok "non-numeric pid: rc 1"

echo "== results: $PASS passed, $FAIL failed =="
[ "$FAIL" -eq 0 ]
