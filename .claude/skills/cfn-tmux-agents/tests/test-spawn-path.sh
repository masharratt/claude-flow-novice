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
source "$SKILL_DIR/../../cfn-scripts/lib/safe-rm.sh" || exit 1  # cfn_safe_rm_tmp
source "$SKILL_DIR/tests/lib-sockets.sh" || exit 1
tt_sock_init || exit 1   # private TMUX_TMPDIR: no socket file outlives the run
EXE="$SKILL_DIR/execute.sh"
SOCK="tagents-spawn-$$"
export TMUX_AGENTS_AUTH_TIMEOUT=1
export TMUX_AGENTS_BANNER_TIMEOUT=4
export TMUX_AGENTS_TRUST_TIMEOUT=1
export TMUX_AGENTS_SUBMIT_VERIFY=2
export TMUX_AGENTS_SUBMIT_RETRIES=2

TD=$(mktemp -d) || exit 1
PASS=0 FAIL=0 TOTAL=0
cleanup() {
  tmux -L "$SOCK" kill-server 2>/dev/null || true
  tmux -L "$SOCK-p" kill-server 2>/dev/null || true
  tt_sock_cleanup
  cfn_safe_rm_tmp "$TD"
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

# BUG leading-dash prompt: tmux send-keys -l read "-n leading dash" as flags.
OUT=$("$EXE" spawn pd --socket "$SOCK" --bin "$TD/tui" --banner-regex 'AGENTS-TEST-BANNER' \
  --cwd /tmp --prompt "-n leading dash" 2>&1) || true
sleep 0.5
CAP=$(tmux -L "$SOCK" capture-pane -p -t pd 2>/dev/null || true)
case "$CAP" in *"SUBMITTED: -n leading dash"*) ok "leading-dash bug: first prompt starting with '-' lands as text" ;;
  *) bad "leading-dash bug: prompt '-n leading dash' did not land: out=${OUT:0:200} pane=${CAP:0:300}" ;; esac

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

# --- BUG glm-settings-error-stall (2026-11-18, MDTWII GLM lane) ------------
# zai-fence masked .claude/settings.local.json with a device; Claude Code drew
# its "Settings Error" 3-option menu and waited. The pane still showed the
# fence's "zai-fence: checking" line, so the banner wait kept going for the
# whole fence timeout (900s) and the first prompt was never typed. Spawn must
# fail fast naming the file and never answer the menu; any other unknown
# blocking menu must not hold the wait for the fence timeout either.
cat > "$TD/settings-err" <<'FAKE'
#!/usr/bin/env bash
stty -icanon -echo 2>/dev/null || true
printf 'zai-fence: checking /work/proj for secret files...\n'
printf ' Settings Error\n\n /work/proj/.claude/settings.local.json\n'
printf '  └ Not a regular file (device, FIFO, or socket)\n\n'
printf ' ❯ 1. Exit and fix manually\n   2. Continue without these settings\n   3. Disable this settings file\n\n'
printf ' Enter to confirm · Esc to cancel\n'
while IFS= read -rsn1 -d '' c; do printf '%q\n' "$c" >> "$1"; done
FAKE
cat > "$TD/unknown-menu" <<'FAKE'
#!/usr/bin/env bash
stty -icanon -echo 2>/dev/null || true
printf 'zai-fence: checking /work/proj for secret files...\n'
printf ' Something new needs a choice\n\n ❯ 1. Do the thing\n   2. Do the other thing\n\n Enter to confirm · Esc to cancel\n'
while IFS= read -rsn1 -d '' c; do printf '%q\n' "$c" >> "$1"; done
FAKE
chmod +x "$TD/settings-err" "$TD/unknown-menu"

t0=$SECONDS; rc=0
OUT=$(TMUX_AGENTS_FENCE_TIMEOUT=60 "$EXE" spawn s1 --socket "$SOCK" --bin "$TD/settings-err" --args "$TD/keys-s1" \
  --banner-regex 'AGENTS-TEST-BANNER' --cwd /tmp --prompt "settings check" 2>&1) || rc=$?
el=$((SECONDS - t0))
[ "$rc" -ne 0 ] && [ "$el" -lt 20 ] && ok "settings-error-stall bug: Settings Error fails fast (rc=$rc, ${el}s)" \
  || bad "settings-error-stall bug: want fast non-zero exit, got rc=$rc after ${el}s: ${OUT:0:300}"
case "$OUT" in *"Settings Error"*"/work/proj/.claude/settings.local.json"*) ok "Settings Error message names the file" ;;
  *) bad "Settings Error message lacks the screen name or file: ${OUT:0:400}" ;; esac
[ -s "$TD/keys-s1" ] && bad "Settings Error menu was answered: $(tr '\n' ' ' < "$TD/keys-s1")" \
  || ok "Settings Error menu not auto-answered"
case "$OUT" in *spawned\ s1*) bad "Settings Error reported as spawned" ;; *) ok "Settings Error not reported as spawned" ;; esac

t0=$SECONDS; rc=0
OUT=$(TMUX_AGENTS_FENCE_TIMEOUT=60 "$EXE" spawn s2 --socket "$SOCK" --bin "$TD/unknown-menu" --args "$TD/keys-s2" \
  --banner-regex 'AGENTS-TEST-BANNER' --cwd /tmp 2>&1) || rc=$?
el=$((SECONDS - t0))
[ "$rc" -eq 68 ] && [ "$el" -lt 30 ] && ok "unknown blocking menu does not hold the fence wait (rc=68, ${el}s)" \
  || bad "unknown blocking menu: want rc=68 well under the fence timeout, got rc=$rc after ${el}s: ${OUT:0:300}"
case "$OUT" in *"Something new needs a choice"*) ok "stuck-menu dump shows the screen" ;; *) bad "stuck-menu dump lacks the screen: ${OUT:0:400}" ;; esac
[ -s "$TD/keys-s2" ] && bad "unknown menu was answered: $(tr '\n' ' ' < "$TD/keys-s2")" || ok "unknown menu not auto-answered"

echo "== results: $PASS/$TOTAL passed, $FAIL failed =="
[ "$FAIL" -eq 0 ]
