#!/usr/bin/env bash
# cfn-tmux-agents spawn-path regression tests (2026-11-05, reported by 52-desk).
#
# BUG prompt-not-submitted (claude-sub, Claude Code 2.1.318, 3 repros
#   11-03/11-04): spawn typed the --prompt into the input box and sent Enter
#   back to back right after the banner. The fresh TUI took the text but
#   dropped the Enter, so the pane sat until a manual send-keys Enter.
#   Fix: wait for the echo, settle, Enter, verify the input line cleared,
#   bounded Enter retries, loud failure (exit 69) when it never clears.
#
# BUG codex-no-banner (desktop, 11-04): the pane resolved the engine binary
#   only inside the pane. When codex vanished from every PATH (11-04 06:27,
#   an interrupted npm reinstall left no bin/codex link) the pane's
#   `exec codex` failed, the shell exited 127, the pane died, and spawn
#   reported "no banner match" with an EMPTY pane dump and rc 1 (the dump's
#   capture-pane pipeline failed under pipefail once the session was gone).
#   --bin to the old nvm path failed the same way (the file was gone).
#   Fix: resolve bin and its #! interpreter in the launching shell before any
#   side effect (exit 66 naming what is missing), exec the absolute path,
#   keep a dying pane's output (remain-on-exit until the banner), print it.
#
# Fake engines are written to a temp dir; no real claude/codex runs.
# Run: .claude/skills/cfn-tmux-agents/tests/test-spawn-path.sh

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXE="$SKILL_DIR/execute.sh"
SOCK="tagents-spawn-$$"
export TMUX_AGENTS_AUTH_TIMEOUT=1
export TMUX_AGENTS_BANNER_TIMEOUT=4
export TMUX_AGENTS_TRUST_TIMEOUT=1
export TMUX_AGENTS_SUBMIT_VERIFY=2
export TMUX_AGENTS_SUBMIT_RETRIES=2

TD=$(mktemp -d)
PASS=0 FAIL=0 TOTAL=0
cleanup() {
  tmux -L "$SOCK" kill-server 2>/dev/null || true
  tmux -L "$SOCK-p" kill-server 2>/dev/null || true
  rm -rf "$TD"
}
trap cleanup EXIT
ok()  { TOTAL=$((TOTAL+1)); PASS=$((PASS+1)); echo "  PASS: $1"; }
bad() { TOTAL=$((TOTAL+1)); FAIL=$((FAIL+1)); echo "  FAIL: $1"; }

echo "== cfn-tmux-agents spawn-path tests (socket: $SOCK) =="

# Fake TUI: raw input, echoes typed chars on a "> " input line. An Enter that
# arrives inside a typing burst (no 0.4s quiet gap after the last char) is
# swallowed, as the fresh Claude Code TUI swallowed it. Modes via $1:
#   drop-first: also swallow the first gap-separated Enter (TUI not ready)
#   never:      swallow every Enter (input never submits)
cat > "$TD/tui" <<'FAKE'
#!/usr/bin/env bash
mode="${1:-}"
stty -icanon -echo -icrnl 2>/dev/null || true
printf 'AGENTS-TEST-BANNER tui\n> '
buf="" recent=0 dropped=0
while :; do
  rc=0; IFS= read -rsn1 -d '' -t 0.4 c || rc=$?
  if [ "$rc" -gt 128 ]; then recent=0; continue; fi
  [ "$rc" -eq 0 ] || exit 0
  if [ "$c" = $'\r' ] || [ "$c" = $'\n' ]; then
    [ "$recent" = 1 ] && continue
    [ "$mode" = never ] && continue
    if [ "$mode" = drop-first ] && [ "$dropped" = 0 ]; then dropped=1; continue; fi
    printf '\nSUBMITTED: %s\n> ' "$buf"; buf=""
  else
    buf+="$c"; printf '%s' "$c"; recent=1
  fi
done
FAKE
chmod +x "$TD/tui"

# --- BUG prompt-not-submitted -------------------------------------------
OUT=$("$EXE" spawn p1 --socket "$SOCK" --bin "$TD/tui" --banner-regex 'AGENTS-TEST-BANNER' \
  --cwd /tmp --prompt "hello submit-check one" 2>&1) || true
sleep 0.5
CAP=$(tmux -L "$SOCK" capture-pane -p -t p1 2>/dev/null || true)
case "$CAP" in *"SUBMITTED: hello submit-check one"*) ok "prompt-not-submitted bug: Enter after a typing burst submits" ;;
  *) bad "prompt-not-submitted bug: prompt typed but never submitted: out=${OUT:0:200} pane=${CAP:0:300}" ;; esac

OUT=$("$EXE" spawn p2 --socket "$SOCK" --bin "$TD/tui" --args "drop-first" --banner-regex 'AGENTS-TEST-BANNER' \
  --cwd /tmp --prompt "retry submit-check two" 2>&1) || true
sleep 0.5
CAP=$(tmux -L "$SOCK" capture-pane -p -t p2 2>/dev/null || true)
case "$CAP" in *"SUBMITTED: retry submit-check two"*) ok "prompt-not-submitted bug: lost Enter is retried until the input clears" ;;
  *) bad "prompt-not-submitted bug: no Enter retry: out=${OUT:0:200} pane=${CAP:0:300}" ;; esac

rc=0; OUT=$("$EXE" spawn p3 --socket "$SOCK" --bin "$TD/tui" --args "never" --banner-regex 'AGENTS-TEST-BANNER' \
  --cwd /tmp --prompt "stuck submit-check three" 2>&1) || rc=$?
[ "$rc" -eq 69 ] && ok "prompt-not-submitted bug: never-clearing input fails loudly (rc=69)" \
  || bad "prompt-not-submitted bug: want rc=69 when input never clears, got rc=$rc: ${OUT:0:300}"
case "$OUT" in *"not submitted"*) ok "failure message says the prompt was not submitted" ;;
  *) bad "failure message lacks 'not submitted': ${OUT:0:300}" ;; esac
tmux -L "$SOCK" has-session -t p3 2>/dev/null && ok "unsubmitted session left alive for inspection" \
  || bad "unsubmitted session was torn down"

# --- BUG codex-no-banner ------------------------------------------------
# Guards (green before and after the fix: tmux 3.4 copies the client's PATH
# into a new session, so the pane PATH already holds the launcher's dirs).
# They pin that bare names and #! interpreters keep resolving once spawn
# switches to launcher-side resolution with an absolute exec path.
mkdir -p "$TD/bin" "$TD/nodebin"
cat > "$TD/bin/fakecodex" <<'FAKE'
#!/usr/bin/env bash
printf 'AGENTS-TEST-BANNER on-path\n'
exec cat
FAKE
cat > "$TD/nodebin/fakenode" <<'FAKE'
#!/bin/bash
exec /bin/bash "$@"
FAKE
cat > "$TD/nodescript" <<'FAKE'
#!/usr/bin/env fakenode
printf 'AGENTS-TEST-BANNER interp-ok\n'
exec cat
FAKE
cat > "$TD/nointerp" <<'FAKE'
#!/usr/bin/env fakenode-missing-xyz
printf 'never\n'
FAKE
cat > "$TD/dies" <<'FAKE'
#!/usr/bin/env bash
printf 'FAKE-ENGINE-FATAL: config unreadable\n'
exit 3
FAKE
chmod +x "$TD/bin/fakecodex" "$TD/nodebin/fakenode" "$TD/nodescript" "$TD/nointerp" "$TD/dies"
env PATH=/usr/bin:/bin tmux -L "$SOCK-p" new-session -d -s keep

LPATH="$TD/bin:$TD/nodebin:$PATH"
OUT=$(PATH="$LPATH" "$EXE" spawn c1 --socket "$SOCK-p" --bin fakecodex \
  --banner-regex 'AGENTS-TEST-BANNER' --cwd /tmp 2>&1) || true
case "$OUT" in *on-path*) ok "guard: bare bin resolved from the launcher PATH" ;;
  *) bad "codex-no-banner bug: bare bin not found in pane PATH: ${OUT:0:300}" ;; esac

OUT=$(PATH="$LPATH" "$EXE" spawn c2 --socket "$SOCK-p" --bin "$TD/nodescript" \
  --banner-regex 'AGENTS-TEST-BANNER' --cwd /tmp 2>&1) || true
case "$OUT" in *interp-ok*) ok "guard: --bin node-style script finds its #! interpreter" ;;
  *) bad "codex-no-banner bug: --bin script's env interpreter missing in pane: ${OUT:0:300}" ;; esac

rc=0; OUT=$("$EXE" spawn c3 --socket "$SOCK-p" --bin "$TD/no/such/engine" \
  --banner-regex 'AGENTS-TEST-BANNER' --cwd /tmp 2>&1) || rc=$?
[ "$rc" -eq 66 ] && ok "missing engine binary refused before launch (rc=66)" \
  || bad "missing engine binary: want rc=66, got rc=$rc: ${OUT:0:300}"
case "$OUT" in *"no/such/engine"*) ok "refusal names the missing binary" ;; *) bad "refusal lacks binary path: ${OUT:0:300}" ;; esac
tmux -L "$SOCK-p" has-session -t c3 2>/dev/null && bad "session created for a missing binary" \
  || ok "no session created for a missing binary"

rc=0; OUT=$(PATH="$LPATH" "$EXE" spawn c4 --socket "$SOCK-p" --bin "$TD/nointerp" \
  --banner-regex 'AGENTS-TEST-BANNER' --cwd /tmp 2>&1) || rc=$?
[ "$rc" -eq 66 ] && ok "missing #! interpreter refused before launch (rc=66)" \
  || bad "missing interpreter: want rc=66, got rc=$rc: ${OUT:0:300}"
case "$OUT" in *fakenode-missing-xyz*) ok "refusal names the missing interpreter" ;; *) bad "refusal lacks interpreter name: ${OUT:0:300}" ;; esac

rc=0; OUT=$("$EXE" spawn c5 --socket "$SOCK-p" --bin "$TD/dies" \
  --banner-regex 'AGENTS-TEST-BANNER' --cwd /tmp 2>&1) || rc=$?
[ "$rc" -eq 68 ] && ok "dead pane before banner exits 68" || bad "dead pane: want rc=68, got rc=$rc: ${OUT:0:300}"
case "$OUT" in *FAKE-ENGINE-FATAL*) ok "dead pane's error output is printed" ;;
  *) bad "dead pane's output lost: ${OUT:0:400}" ;; esac
case "$OUT" in *"status 3"*) ok "dead pane's exit status is reported" ;; *) bad "dead pane status missing: ${OUT:0:400}" ;; esac
tmux -L "$SOCK-p" has-session -t c5 2>/dev/null && bad "dead session left behind" || ok "dead session cleaned up"

echo "== results: $PASS/$TOTAL passed, $FAIL failed =="
[ "$FAIL" -eq 0 ]
