#!/usr/bin/env bash
# tests/test-claude-tmux.sh
# claude-tmux.sh (start Claude Code inside tmux so the mailbox watcher can wake it) and
# install-claude-tmux.sh (point the dsp/dspr/dspc aliases at it, add a tmux config).
# Offline: a fake tmux and a fake claude on PATH record their argv; HOME is a temp dir.
set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
LAUNCH="$PROJECT_ROOT/.claude/cfn-scripts/claude-tmux.sh"
INSTALL="$PROJECT_ROOT/.claude/cfn-scripts/install-claude-tmux.sh"

# shellcheck source=../.claude/cfn-scripts/lib/safe-rm.sh
source "$PROJECT_ROOT/.claude/cfn-scripts/lib/safe-rm.sh"

TEST_TMP=$(mktemp -d "${TMPDIR:-/tmp}/claude-tmux.XXXXXX") || exit 1
TEST_TMP=$(cd -P "$TEST_TMP" && pwd -P) || exit 1
trap 'cfn_safe_rm_tmp "$TEST_TMP"' EXIT

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ok   $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  FAIL $1"; [ -n "${2:-}" ] && echo "       $2"; }
check_eq() { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1" "expected [$3] got [$2]"; fi; }
check_has() { case "$2" in *"$3"*) pass "$1" ;; *) fail "$1" "missing [$3] in [$2]" ;; esac; }
check_lacks() { case "$2" in *"$3"*) fail "$1" "unexpected [$3] in [$2]" ;; *) pass "$1" ;; esac; }

BIN="$TEST_TMP/bin"; mkdir -p "$BIN"
LOG="$TEST_TMP/calls"
# fake tmux: has-session succeeds for names listed in $TEST_TMP/existing; everything else is logged.
cat > "$BIN/tmux" <<EOF
#!/usr/bin/env bash
if [ "\$1" = has-session ]; then grep -qx -- "\$3" "$TEST_TMP/existing" 2>/dev/null; exit; fi
printf 'tmux' >> "$LOG"; for a in "\$@"; do printf ' [%s]' "\$a" >> "$LOG"; done; echo >> "$LOG"
EOF
cat > "$BIN/claude" <<EOF
#!/usr/bin/env bash
printf 'claude' >> "$LOG"; for a in "\$@"; do printf ' [%s]' "\$a" >> "$LOG"; done; echo >> "$LOG"
EOF
chmod +x "$BIN/tmux" "$BIN/claude"

PROJ="$TEST_TMP/My Proj.v2"; mkdir -p "$PROJ"
launch() { : > "$LOG"; set +e; OUT=$(cd "$PROJ" && env -u TMUX PATH="$BIN:$PATH" HOME="$TEST_TMP/home" "$@" 2>&1); RC=$?; set -e; }

echo "== launcher"
: > "$TEST_TMP/existing"
launch bash "$LAUNCH" --permission-mode auto --resume
check_eq "outside tmux: exit 0" "$RC" "0"
check_has "starts a tmux session named after the folder" "$(cat "$LOG")" "tmux [new-session] [-s] [my-proj-v2]"
check_has "in the current folder" "$(cat "$LOG")" "[-c] [$PROJ]"
check_has "passes PATH into the session" "$(cat "$LOG")" "[-e] [PATH=$BIN:"
check_has "runs claude with every argument, unsplit" "$(cat "$LOG")" "[claude] [--permission-mode] [auto] [--resume]"

printf 'my-proj-v2\nmy-proj-v2-2\n' > "$TEST_TMP/existing"
launch bash "$LAUNCH"
check_has "name taken: next free suffix" "$(cat "$LOG")" "[-s] [my-proj-v2-3]"

: > "$LOG"; set +e
OUT=$(cd "$PROJ" && TMUX=/tmp/sock,1,0 PATH="$BIN:$PATH" bash "$LAUNCH" -p "two words" 2>&1); RC=$?; set -e
check_eq "inside tmux: runs claude directly" "$(cat "$LOG")" "claude [-p] [two words]"

: > "$LOG"; set +e
OUT=$(cd "$PROJ" && env -u TMUX PATH="$BIN:$PATH" CFN_CLAUDE_TMUX=off bash "$LAUNCH" --resume 2>&1); RC=$?; set -e
check_eq "CFN_CLAUDE_TMUX=off: runs claude directly" "$(cat "$LOG")" "claude [--resume]"

echo "== installer"
H="$TEST_TMP/home"; mkdir -p "$H"
cat > "$H/.zshrc" <<'EOF'
export FOO=1
alias dsp='claude --permission-mode auto'
alias dspr='claude --permission-mode auto --resume'
alias dspc='claude --permission-mode auto --continue'
alias ll='ls -l'
EOF
before=$(cat "$H/.zshrc")
inst() { set +e; OUT=$(HOME="$H" bash "$INSTALL" "$@" 2>&1); RC=$?; set -e; }

inst --dry-run
check_eq "dry run: exit 0" "$RC" "0"
check_eq "dry run: .zshrc unchanged" "$(cat "$H/.zshrc")" "$before"
check_has "dry run: shows the new dsp line" "$OUT" "claude-tmux.sh --permission-mode auto'"

inst
check_eq "install: exit 0" "$RC" "0"
z=$(cat "$H/.zshrc")
check_has "dsp goes through the launcher" "$z" "alias dsp='\$HOME/.claude/cfn-scripts/claude-tmux.sh --permission-mode auto'"
check_has "dspr keeps --resume" "$z" "alias dspr='\$HOME/.claude/cfn-scripts/claude-tmux.sh --permission-mode auto --resume'"
check_has "dspc keeps --continue" "$z" "alias dspc='\$HOME/.claude/cfn-scripts/claude-tmux.sh --permission-mode auto --continue'"
check_has "other lines kept" "$z" "alias ll='ls -l'"
check_has "other lines kept (export)" "$z" "export FOO=1"
check_eq "exactly one dsp alias" "$(grep -c "^alias dsp=" "$H/.zshrc")" "1"
bk=$(ls "$H"/.zshrc.bak-* 2>/dev/null | head -1 || true)
[ -n "$bk" ] && pass "backup written" || fail "backup written"
check_eq "backup holds the original" "$(cat "$bk")" "$before"
check_has "tmux config written" "$(cat "$H/.tmux.conf" 2>/dev/null)" "set -g mouse on"
check_has "tmux config: extended keys (Shift+Enter in Claude)" "$(cat "$H/.tmux.conf")" "extended-keys"

inst
check_eq "re-run: exit 0" "$RC" "0"
check_eq "re-run: no change" "$(cat "$H/.zshrc")" "$z"
check_has "re-run: says already done" "$OUT" "already"

echo "# mine" > "$H/.tmux.conf"
inst
check_eq "existing tmux config is never overwritten" "$(cat "$H/.tmux.conf")" "# mine"

H2="$TEST_TMP/home2"; mkdir -p "$H2"; echo "export A=1" > "$H2/.zshrc"
set +e; OUT=$(HOME="$H2" bash "$INSTALL" 2>&1); RC=$?; set -e
check_eq "no dsp aliases: adds them" "$(grep -c "claude-tmux.sh" "$H2/.zshrc")" "3"

inst --undo
check_eq "undo: restores the latest backup" "$(cat "$H/.zshrc")" "$before"

echo
echo "claude-tmux: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
