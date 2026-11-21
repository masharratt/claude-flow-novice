#!/usr/bin/env bash
# cfn-tmux-agents: every spawned worker gets MAILBOX_SESSION, and the codex
# trust prompt is matched whatever its case.
#
# Request (mdtwii-tooling, 2026-11-21): MDTWII's reply.sh now signs mail only
# with --from, MAILBOX_SESSION or "mailbox.sh whoami" and refuses otherwise (a
# fixed fallback misrouted art-desk replies to the master). Codex lanes, where
# whoami resolves nothing, were refused. Spawn now exports
# MAILBOX_SESSION=<lane name> (override: TMUX_AGENTS_MAILBOX_SESSION).
# Also: Codex 0.171 prints "Trust this folder?"; the old pattern was lowercase.
# Run: $HOME/.claude/skills/cfn-tmux-agents/tests/test-mailbox-session.sh

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$SKILL_DIR/../../cfn-scripts/lib/safe-rm.sh" || exit 1  # cfn_safe_rm_tmp
source "$SKILL_DIR/tests/lib-sockets.sh" || exit 1
tt_sock_init || exit 1
EXE="$SKILL_DIR/execute.sh"
SOCK="tagents-mbx-$$"
export TMUX_AGENTS_BANNER_TIMEOUT=6
export TMUX_AGENTS_TRUST_TIMEOUT=1
export TMUX_AGENTS_AUTH_TIMEOUT=1

TD=$(mktemp -d) || exit 1
PASS=0 FAIL=0 TOTAL=0
cleanup() {
  tmux -L "$SOCK" kill-server 2>/dev/null || true
  tt_sock_cleanup
  cfn_safe_rm_tmp "$TD"
}
trap cleanup EXIT
ok()  { TOTAL=$((TOTAL+1)); PASS=$((PASS+1)); echo "  PASS: $1"; }
bad() { TOTAL=$((TOTAL+1)); FAIL=$((FAIL+1)); echo "  FAIL: $1"; }

echo "== cfn-tmux-agents mailbox-session tests (socket: $SOCK) =="

cat > "$TD/eng" <<'FAKE'
#!/usr/bin/env bash
echo "MB-BANNER mbx=${MAILBOX_SESSION:-unset}"
sleep 30
FAKE
chmod +x "$TD/eng"
mkdir -p "$TD/repo" && git -C "$TD/repo" init -q

spawn() { # NAME [env...]: spawn lane, print pane capture
  local name="$1"; shift
  env -u MAILBOX_SESSION "$@" "$EXE" spawn "$name" --socket "$SOCK" --bin "$TD/eng" --banner-regex 'MB-BANNER' --cwd "$TD/repo" >/dev/null 2>&1 || true
  sleep 0.3
  tmux -L "$SOCK" capture-pane -p -t "$name" 2>/dev/null || true
}

CAP=$(spawn art-desk X=1)
case "$CAP" in *"mbx=art-desk"*) ok "worker gets MAILBOX_SESSION=<lane name>" ;;
  *) bad "lane name not exported: pane=${CAP:0:200}" ;; esac

# The master's own MAILBOX_SESSION must not leak into the worker (misrouting bug).
CAP=$(spawn lane-two MAILBOX_SESSION=mdtwii-master)
case "$CAP" in *"mbx=lane-two"*) ok "master's MAILBOX_SESSION does not leak into the worker" ;;
  *) bad "master name leaked or missing: pane=${CAP:0:200}" ;; esac

CAP=$(spawn lane3 TMUX_AGENTS_MAILBOX_SESSION=reviewer-a)
case "$CAP" in *"mbx=reviewer-a"*) ok "TMUX_AGENTS_MAILBOX_SESSION overrides the lane name" ;;
  *) bad "override ignored: pane=${CAP:0:200}" ;; esac

rc=0; OUT=$(env TMUX_AGENTS_MAILBOX_SESSION='Bad Name' "$EXE" spawn lane4 --socket "$SOCK" --bin "$TD/eng" --banner-regex 'MB-BANNER' --cwd "$TD/repo" 2>&1) || rc=$?
[ "$rc" -eq 66 ] && ok "invalid override refused with exit 66" || bad "bad override: want rc 66, got $rc: ${OUT:0:200}"
tmux -L "$SOCK" has-session -t lane4 2>/dev/null && bad "refused spawn created a session" || ok "refused spawn created no session"

# A lane name that is not a valid mailbox name: spawn works, MAILBOX_SESSION unset, warns.
rc=0; OUT=$(env -u MAILBOX_SESSION "$EXE" spawn Lane_Five --socket "$SOCK" --bin "$TD/eng" --banner-regex 'MB-BANNER' --cwd "$TD/repo" 2>&1) || rc=$?
[ "$rc" -eq 0 ] && ok "non-mailbox lane name: spawn still succeeds" || bad "Lane_Five: rc $rc: ${OUT:0:200}"
case "$OUT" in *MAILBOX_SESSION*) ok "non-mailbox lane name: warns" ;; *) bad "no warning: ${OUT:0:200}" ;; esac
sleep 0.3; CAP=$(tmux -L "$SOCK" capture-pane -p -t Lane_Five 2>/dev/null || true)
case "$CAP" in *"mbx=unset"*) ok "non-mailbox lane name: MAILBOX_SESSION left unset" ;; *) bad "pane=${CAP:0:200}" ;; esac

OUT=$("$EXE" spawn lane6 --socket "$SOCK" --bin "$TD/eng" --cwd "$TD/repo" --dry-run 2>&1 || true)
case "$OUT" in *"MAILBOX_SESSION=lane6"*) ok "dry-run shows MAILBOX_SESSION" ;; *) bad "dry-run omits it: ${OUT:0:300}" ;; esac

# Trust prompt patterns, any case (Codex 0.171: "Trust this folder?").
source "$SKILL_DIR/lib/common.sh"
re=$(_ta_trust_re codex)
for line in "Trust this folder?" "Do you trust this folder?" "Allow Codex to work in this folder" "Work in this folder?"; do
  printf '%s\n' "$line" | grep -Eq -- "$re" && ok "codex trust prompt matched: $line" || bad "codex trust prompt missed: $line"
done
re=$(_ta_trust_re claude)
printf '%s\n' "Yes, I trust this folder" | grep -Eq -- "$re" && ok "claude trust prompt matched" || bad "claude trust prompt missed"
[ -z "$(_ta_trust_re other)" ] && ok "unknown engine: no trust pattern" || bad "unknown engine got a pattern"

echo "== results: $PASS/$TOTAL passed, $FAIL failed =="
[ "$FAIL" -eq 0 ]
