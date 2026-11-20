#!/usr/bin/env bash
# cfn-tmux-agents per-lane tmux server tests.
#
# Request (tmux-lanes, 2026-11-19): every lane lived on ONE shared tmux
# server (socket tmux-agents), so one kill-server or one server crash lost
# every lane (happened twice on 2026-11-19). New spawns now get their own
# server: lane NAME -> `tmux -L tmux-agents-NAME`. Every other command finds a
# lane on its per-lane socket first, then falls back to the legacy shared
# socket `tmux-agents`, so lanes spawned before the change keep working. An
# explicit --socket or TMUX_AGENTS_SOCKET still forces one socket for all.
#
# Isolation: TMUX_TMPDIR points at a per-run temp dir, so even the real socket
# NAMES (tmux-agents, tmux-agents-<lane>) resolve to sockets inside it and the
# user's live tmux-agents server and lanes are never touched.
# Run: $HOME/.claude/skills/cfn-tmux-agents/tests/test-lane-sockets.sh

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../../../cfn-scripts/lib/safe-rm.sh
source "$SKILL_DIR/../../cfn-scripts/lib/safe-rm.sh" || exit 1  # cfn_safe_rm_tmp
EXE="$SKILL_DIR/execute.sh"
FAKE="$SKILL_DIR/tests/fake-engine.sh"
export TMUX_AGENTS_BANNER_TIMEOUT=6
export TMUX_AGENTS_TRUST_TIMEOUT=1
export TMUX_AGENTS_AUTH_TIMEOUT=1
unset TMUX_AGENTS_SOCKET

TD=$(mktemp -d) || exit 1
export TMUX_TMPDIR="$TD/tmux"
mkdir -p "$TMUX_TMPDIR" "$TD/out"
export TMUX_AGENTS_OUTBOX_ROOT="$TD/out"
SD="$TMUX_TMPDIR/tmux-$(id -u)"
# Safety: never run against the real socket directory.
case "$SD" in
  "/tmp/tmux-$(id -u)"|"${TMPDIR:-/tmp}/tmux-$(id -u)") echo "refusing: socket dir is the real one ($SD)" >&2; exit 2 ;;
esac

PASS=0 FAIL=0 TOTAL=0
cleanup() {
  local s
  for s in "$SD"/*; do
    [ -S "$s" ] || continue
    tmux -S "$s" kill-server 2>/dev/null || true
  done
  cfn_safe_rm_tmp "$TD"
}
trap cleanup EXIT
ok()  { TOTAL=$((TOTAL+1)); PASS=$((PASS+1)); echo "  PASS: $1"; }
bad() { TOTAL=$((TOTAL+1)); FAIL=$((FAIL+1)); echo "  FAIL: $1"; }
has() { tmux -L "$1" has-session -t "=$2" 2>/dev/null; }
spawn() { "$EXE" spawn "$@" --bin "$FAKE" --banner-regex 'AGENTS-TEST-BANNER' --cwd /tmp; }

echo "== cfn-tmux-agents per-lane socket tests (socket dir: $SD) =="

# 1. a new spawn gets its own server: tmux -L tmux-agents-<name>
OUT=$(spawn L1 2>&1) && ok "spawn L1 (no socket override) exits 0" || bad "spawn L1 failed: $OUT"
has tmux-agents-L1 L1 && ok "L1 lives on socket tmux-agents-L1" || bad "L1 not on tmux-agents-L1"
has tmux-agents L1 && bad "L1 also on the legacy shared socket" || ok "L1 not on the legacy shared socket"
[ -S "$SD/tmux-agents-L1" ] && ok "socket file is $SD/tmux-agents-L1" || bad "no socket file tmux-agents-L1"

# 2. a second lane is a second server: killing one server spares the other
spawn L2 >/dev/null 2>&1 || bad "spawn L2 failed"
has tmux-agents-L2 L2 && ok "L2 lives on socket tmux-agents-L2" || bad "L2 not on tmux-agents-L2"
tmux -L tmux-agents-L1 kill-server 2>/dev/null || true
has tmux-agents-L2 L2 && ok "L2 survives the death of L1's server (the 2026-11-19 failure)" \
  || bad "L2 died with L1's server"
rc=0; "$EXE" status L1 >/dev/null 2>&1 || rc=$?
[ "$rc" -ne 0 ] && ok "status of L1 after its server died is nonzero" || bad "status L1 still alive"

# 3. per-lane-first: send / capture / status find the lane on its own socket
"$EXE" send L2 "lane-two-ping" >/dev/null 2>&1 && ok "send L2 finds the per-lane socket" || bad "send L2 failed"
sleep 0.5
OUT=$("$EXE" capture L2 2>&1 || true)
case "$OUT" in *lane-two-ping*) ok "capture L2 reads the per-lane pane" ;; *) bad "capture L2 missing text: ${OUT:0:200}" ;; esac
OUT=$("$EXE" status L2 2>&1 || true)
case "$OUT" in *"alive (socket tmux-agents-L2)"*) ok "status L2 names its per-lane socket" ;; *) bad "status L2: ${OUT:0:200}" ;; esac

# 4. legacy fallback: a lane spawned before the change sits on tmux-agents
tmux -L tmux-agents new-session -d -s old1 "$FAKE"
sleep 0.5
"$EXE" send old1 "legacy-ping" >/dev/null 2>&1 && ok "send old1 falls back to the legacy socket" || bad "send old1 failed"
sleep 0.5
OUT=$("$EXE" capture old1 2>&1 || true)
case "$OUT" in *legacy-ping*) ok "capture old1 reads the legacy pane" ;; *) bad "capture old1: ${OUT:0:200}" ;; esac
OUT=$("$EXE" status old1 2>&1 || true)
case "$OUT" in *"alive (socket tmux-agents)"*) ok "status old1 names the legacy socket" ;; *) bad "status old1: ${OUT:0:200}" ;; esac

# 5. list and status (no name) cover every per-lane socket plus legacy
OUT=$("$EXE" list 2>&1 || true)
case "$OUT" in *L2*) ok "list shows per-lane L2" ;; *) bad "list lacks L2: $OUT" ;; esac
case "$OUT" in *old1*) ok "list shows legacy old1" ;; *) bad "list lacks old1: $OUT" ;; esac
case "$OUT" in *L1*) bad "list shows dead L1 (stale socket file read as a lane)" ;; *) ok "list skips the stale L1 socket" ;; esac
OUT=$("$EXE" status 2>&1 || true)
case "$OUT" in *"L2: alive"*"old1: alive"*|*"old1: alive"*"L2: alive"*) ok "status (all) reports both servers" ;; *) bad "status all: ${OUT:0:300}" ;; esac

# 6. spawn refuses a name already alive on the legacy socket (would shadow it)
rc=0; OUT=$(spawn old1 2>&1) || rc=$?
[ "$rc" -eq 66 ] && ok "spawn of a name alive on legacy refused (rc=66)" || bad "spawn old1 rc=$rc: $OUT"
has tmux-agents-old1 old1 && bad "refused spawn still made a per-lane server" || ok "refused spawn made no per-lane server"

# 7. unknown lane: clear error naming both sockets
rc=0; OUT=$("$EXE" capture nosuch 2>&1) || rc=$?
[ "$rc" -eq 65 ] && ok "capture unknown lane exits 65" || bad "capture nosuch rc=$rc"
case "$OUT" in *tmux-agents-nosuch*) ok "error names the per-lane socket it tried" ;; *) bad "error: $OUT" ;; esac

# 8. kill of the last session on a per-lane server leaves no stray server/socket
"$EXE" kill L2 >/dev/null 2>&1 && ok "kill L2 exits 0" || bad "kill L2 failed"
tmux -L tmux-agents-L2 ls >/dev/null 2>&1 && bad "per-lane server L2 still running" || ok "no server left on tmux-agents-L2"
[ -e "$SD/tmux-agents-L2" ] && bad "stray socket file tmux-agents-L2 left" || ok "socket file tmux-agents-L2 removed"
has tmux-agents old1 && ok "kill L2 left the legacy lane alone" || bad "kill L2 killed old1"

# 9. kill of a legacy lane goes to the legacy socket
"$EXE" kill old1 >/dev/null 2>&1 && ok "kill old1 (legacy) exits 0" || bad "kill old1 failed"
has tmux-agents old1 && bad "old1 still alive" || ok "old1 gone from the legacy socket"

# 10. TMUX_AGENTS_SOCKET forces one socket for everything
OUT=$(TMUX_AGENTS_SOCKET=forced-env spawn F1 2>&1) && ok "spawn F1 with TMUX_AGENTS_SOCKET exits 0" || bad "spawn F1: $OUT"
has forced-env F1 && ok "F1 on the forced socket" || bad "F1 not on forced-env"
has tmux-agents-F1 F1 && bad "F1 on a per-lane socket despite the override" || ok "F1 not on a per-lane socket"
OUT=$(TMUX_AGENTS_SOCKET=forced-env "$EXE" list 2>&1 || true)
case "$OUT" in F1) ok "list under the override shows only that socket" ;; *) bad "forced list: $OUT" ;; esac

# 11. --socket forces too
spawn F2 --socket forced-flag >/dev/null 2>&1 || bad "spawn F2 --socket failed"
has forced-flag F2 && ok "--socket places F2 on forced-flag" || bad "F2 not on forced-flag"
has tmux-agents-F2 F2 && bad "F2 on a per-lane socket despite --socket" || ok "F2 not on a per-lane socket"

# 12. dry-run prints the per-lane socket
OUT=$("$EXE" spawn D1 --bin "$FAKE" --cwd /tmp --dry-run 2>&1 || true)
case "$OUT" in *"tmux -L tmux-agents-D1 new-session"*) ok "dry-run shows tmux -L tmux-agents-D1" ;; *) bad "dry-run: ${OUT:0:300}" ;; esac

# 13. kill --all (no override) tears down every per-lane server and legacy
spawn A1 >/dev/null 2>&1 || bad "spawn A1 failed"
spawn A2 >/dev/null 2>&1 || bad "spawn A2 failed"
tmux -L tmux-agents new-session -d -s old2 "$FAKE"
"$EXE" kill --all >/dev/null 2>&1 && ok "kill --all exits 0" || bad "kill --all failed"
left=""
for s in tmux-agents-A1 tmux-agents-A2 tmux-agents; do
  tmux -L "$s" ls >/dev/null 2>&1 && left+=" $s"
done
[ -z "$left" ] && ok "kill --all left no lane servers" || bad "kill --all left:$left"
has forced-env F1 && ok "kill --all spared the forced-socket session" || bad "kill --all killed forced-env"
rc=0; "$EXE" list >/dev/null 2>&1 || rc=$?
[ "$rc" -eq 65 ] && ok "list with nothing running exits 65" || bad "empty list rc=$rc"

echo ""
echo "Results: $PASS passed, $FAIL failed, $TOTAL total"
[ "$FAIL" -eq 0 ]
