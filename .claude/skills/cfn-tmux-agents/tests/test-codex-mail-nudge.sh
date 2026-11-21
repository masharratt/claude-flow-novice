#!/usr/bin/env bash
# cfn-tmux-agents: codex lanes launch through the mailbox's codex-mail.sh, so
# mailbox-watch.sh can wake them when mail arrives.
#
# Request (mdtwii-master, 2026-11-21): codex lanes got MAILBOX_SESSION=<lane>
# but were never registered with the mailbox (no pane in the directory, no
# client-<name>=codex file, no idle/busy state), so the systemd watcher never
# nudged them; lanes sat idle 1-2 h with answers in their inbox. Spawn now
# runs codex as `codex-mail.sh --name <mailbox name> -- <codex args>`.
# No real Redis: a private HOME has no mailbox config, so codex-mail.sh's
# heartbeat fails and it starts codex anyway (its documented fallback). The
# real vendor codex-mail.sh runs; CODEX_BIN points it at a fake codex.
# Run: $HOME/.claude/skills/cfn-tmux-agents/tests/test-codex-mail-nudge.sh

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$SKILL_DIR/../../cfn-scripts/lib/safe-rm.sh" || exit 1  # cfn_safe_rm_tmp
source "$SKILL_DIR/tests/lib-sockets.sh" || exit 1
tt_sock_init || exit 1
EXE="$SKILL_DIR/execute.sh"
SOCK="tagents-cxmail-$$"
MAILBOX_DIR="$(cd "$SKILL_DIR/../cfn-mailbox" && pwd -P)"

TD=$(mktemp -d) || exit 1
REAL_HOME="$HOME"
# Private HOME: no mailbox config (no Redis), and the mailbox cache files land
# here. Borrowed read-only: the engine registry and the cfn-mailbox skill.
export HOME="$TD/home"
mkdir -p "$HOME/.claude/skills" "$TD/bin" "$TD/repo"
ln -s "$REAL_HOME/.claude/cfn-config" "$HOME/.claude/cfn-config"
ln -s "$MAILBOX_DIR" "$HOME/.claude/skills/cfn-mailbox"
unset OPENAI_API_KEY MAILBOX_SESSION MAILBOX_CONFIG TMUX_AGENTS_MAILBOX_SESSION TMUX_AGENTS_CODEX_MAIL
export TMUX_AGENTS_BANNER_TIMEOUT=8 TMUX_AGENTS_TRUST_TIMEOUT=1 TMUX_AGENTS_AUTH_TIMEOUT=1
CACHE="$HOME/.cache/cfn-mailbox"

PASS=0 FAIL=0 TOTAL=0
cleanup() {
  tmux -L "$SOCK" kill-server 2>/dev/null || true
  tt_sock_cleanup
  export HOME="$REAL_HOME"   # cfn_safe_rm_tmp refuses an ancestor of $HOME
  cfn_safe_rm_tmp "$TD"
}
trap cleanup EXIT
ok()  { TOTAL=$((TOTAL+1)); PASS=$((PASS+1)); echo "  PASS: $1"; }
bad() { TOTAL=$((TOTAL+1)); FAIL=$((FAIL+1)); echo "  FAIL: $1"; }
wait_for() { local end=$((SECONDS + $1)); shift; while [ "$SECONDS" -lt "$end" ]; do "$@" && return 0; sleep 0.2; done; "$@"; }

echo "== cfn-tmux-agents codex mail launch tests (socket: $SOCK) =="

# Fake codex: records its argv (one per line) and mail env, shows a banner, waits.
cat > "$TD/bin/codex" <<'FAKE'
#!/usr/bin/env bash
d="$(cd "$(dirname "$0")" && pwd)"; tag="${MAILBOX_SESSION:-none}"
printf '%s\n' "$@" > "$d/args-$tag"
printf 'MAILBOX_SESSION=%s\nMAILBOX_CLIENT=%s\n' "${MAILBOX_SESSION:-unset}" "${MAILBOX_CLIENT:-unset}" > "$d/env-$tag"
echo "FAKE-CODEX-BANNER ready"
exec sleep 300
FAKE
chmod +x "$TD/bin/codex"
printf 'codex=true\n' > "$TD/repo/CLAUDE.md"
git -C "$TD/repo" init -q

spawn() { # NAME [env...]: spawn a codex-engine lane with the fake codex
  local name="$1"; shift
  env "$@" "$EXE" spawn "$name" --socket "$SOCK" --engine codex --bin "$TD/bin/codex" \
    --banner-regex FAKE-CODEX-BANNER --cwd "$TD/repo" 2>&1 || true
}
args_of() { cat "$TD/bin/args-$1" 2>/dev/null || true; }
count_arg() { args_of "$1" | grep -cxF -- "$2" || true; }

L=cxm-$$
OUT=$(spawn "$L")
wait_for 5 test -s "$TD/bin/args-$L" || true
A=$(args_of "$L")
case "$A" in *"notify=[\"bash\",\"$MAILBOX_DIR/codex-mail.sh\",\"--notify\",\"$L\"]"*)
  ok "codex runs under codex-mail.sh (notify hook names the lane)" ;;
  *) bad "no codex-mail notify hook in codex args: ${A:0:400} spawn: ${OUT:0:300}" ;; esac
case "$A" in *"sandbox_workspace_write.network_access=true"*) ok "codex-mail.sh flags reach codex" ;;
  *) bad "codex-mail -c flags missing: ${A:0:300}" ;; esac
[ "$(count_arg "$L" never)" = 1 ] && [ "$(count_arg "$L" --ask-for-approval)" = 1 ] \
  && ok "approval still forced to never exactly once" || bad "approval args: ${A:0:300}"
[ "$(count_arg "$L" workspace-write)" = 1 ] && ok "one sandbox flag (no clash)" || bad "sandbox args: ${A:0:300}"
grep -qx "MAILBOX_SESSION=$L" "$TD/bin/env-$L" 2>/dev/null && grep -qx "MAILBOX_CLIENT=codex" "$TD/bin/env-$L" \
  && ok "codex sees MAILBOX_SESSION=<lane> and MAILBOX_CLIENT=codex" || bad "env: $(cat "$TD/bin/env-$L" 2>/dev/null)"
[ "$(cat "$CACHE/client-$L" 2>/dev/null)" = codex ] && ok "client-<lane> marks the session as codex (watcher picks codex text)" \
  || bad "no client-$L file"
case "$(cat "$CACHE/state-$L" 2>/dev/null)" in idle*) ok "idle state written for the watcher" ;;
  *) bad "state-$L: $(cat "$CACHE/state-$L" 2>/dev/null)" ;; esac
case "$OUT" in *"spawned $L"*) ok "spawn still reports the banner" ;; *) bad "spawn: ${OUT:0:300}" ;; esac

# The notify hook codex-mail.sh hands codex marks the lane idle after a turn.
{ printf 'busy %s\n' "$(date +%s)" > "$CACHE/state-$L"; } 2>/dev/null || true
bash "$MAILBOX_DIR/codex-mail.sh" --notify "$L" '{"type":"agent-turn-complete"}' || true
case "$(cat "$CACHE/state-$L" 2>/dev/null)" in idle*) ok "turn-complete notify marks the lane idle" ;; *) bad "notify did not mark idle" ;; esac

"$EXE" kill "$L" --socket "$SOCK" >/dev/null 2>&1 || true
cm_gone() { ! pgrep -f "codex-mail.sh --name $L" >/dev/null 2>&1; }
wait_for 6 cm_gone && ok "codex-mail.sh exits with the lane (no orphan)" || bad "codex-mail.sh for $L still running"
wait_for 4 test ! -e "$CACHE/client-$L" && ok "client file removed when the lane is killed" \
  || bad "client-$L left behind after kill (watcher would keep a dead pane)"
case "$(cat "$CACHE/state-$L" 2>/dev/null)" in gone*) ok "state says gone after kill" ;;
  *) bad "state-$L after kill: $(cat "$CACHE/state-$L" 2>/dev/null)" ;; esac

# Override name rides through to codex-mail.sh.
L2=cxo-$$
spawn "$L2" TMUX_AGENTS_MAILBOX_SESSION="rv-$$" >/dev/null
wait_for 5 test -s "$TD/bin/args-rv-$$" || true
[ "$(cat "$CACHE/client-rv-$$" 2>/dev/null)" = codex ] && ok "TMUX_AGENTS_MAILBOX_SESSION names the codex-mail session" \
  || bad "override not used by codex-mail.sh"
tmux -L "$SOCK" kill-session -t "$L2" 2>/dev/null || true

# Opt-out and fallbacks: plain codex, no codex-mail.sh.
spawn cxoff-$$ TMUX_AGENTS_CODEX_MAIL=0 >/dev/null
wait_for 5 test -s "$TD/bin/args-cxoff-$$" || true
A=$(args_of cxoff-$$)
[ -n "$A" ] && [[ "$A" != *notify=* ]] && ok "TMUX_AGENTS_CODEX_MAIL=0 runs codex directly" || bad "opt-out: ${A:0:300}"
[ ! -e "$CACHE/client-cxoff-$$" ] && ok "opt-out lane not registered as codex" || bad "opt-out lane registered"

spawn Cx_Bad >/dev/null
wait_for 5 test -s "$TD/bin/args-none" || true
A=$(args_of none)
[ -n "$A" ] && [[ "$A" != *notify=* ]] && ok "lane without a valid mailbox name runs codex directly" || bad "bad name: ${A:0:300}"

mkdir -p "$TD/nohome/.claude" && ln -s "$REAL_HOME/.claude/cfn-config" "$TD/nohome/.claude/cfn-config"
OUT=$(env HOME="$TD/nohome" "$EXE" spawn cxmiss-$$ --socket "$SOCK" --engine codex --bin "$TD/bin/codex" --cwd "$TD/repo" --dry-run 2>&1 || true)
case "$OUT" in *"codex runs without mail wake-ups"*) ok "missing codex-mail.sh warns and falls back" ;; *) bad "missing launcher: ${OUT:0:300}" ;; esac

OUT=$("$EXE" spawn cxdry-$$ --socket "$SOCK" --engine codex --bin "$TD/bin/codex" --cwd "$TD/repo" --dry-run 2>&1 || true)
case "$OUT" in *"codex-mail.sh --name cxdry-$$ --"*) ok "dry-run pane command shows codex-mail.sh" ;; *) bad "dry-run: ${OUT:0:400}" ;; esac

OUT=$("$EXE" spawn clx-$$ --socket "$SOCK" --bin "$TD/bin/codex2" --cwd "$TD/repo" --dry-run 2>&1 || true)
[[ "$OUT" != *codex-mail* ]] && ok "non-codex lane is not wrapped" || bad "non-codex wrapped: ${OUT:0:300}"

echo "== results: $PASS/$TOTAL passed, $FAIL failed =="
[ "$FAIL" -eq 0 ]
