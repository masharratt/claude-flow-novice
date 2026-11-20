#!/usr/bin/env bash
# cfn-tmux-agents per-lane CARGO_TARGET_DIR tests.
#
# Request (mdtwii-tooling, 2026-11-19): lanes spawned in MDTWII built Rust
# into their scratchpad on the root disk (one lane made a 42 GB target; root
# disk +62 GB in 6 days). A project opts in with a committed
# .claude/cargo-target-root (one absolute folder); spawn then exports
# CARGO_TARGET_DIR=<root>/<lane-name> into the pane. An explicit caller
# CARGO_TARGET_DIR wins. A root under /dev/shm (RAM) is refused (exit 66).
#
# Fake engine prints its CARGO_TARGET_DIR as its banner; no real claude/codex.
# Run: $HOME/.claude/skills/cfn-tmux-agents/tests/test-cargo-target.sh

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$SKILL_DIR/../../cfn-scripts/lib/safe-rm.sh" || exit 1  # cfn_safe_rm_tmp
EXE="$SKILL_DIR/execute.sh"
SOCK="tagents-cargo-$$"
export TMUX_AGENTS_BANNER_TIMEOUT=6
export TMUX_AGENTS_TRUST_TIMEOUT=1
export TMUX_AGENTS_AUTH_TIMEOUT=1

TD=$(mktemp -d) || exit 1
PASS=0 FAIL=0 TOTAL=0
cleanup() {
  tmux -L "$SOCK" kill-server 2>/dev/null || true
  cfn_safe_rm_tmp "$TD"
}
trap cleanup EXIT
ok()  { TOTAL=$((TOTAL+1)); PASS=$((PASS+1)); echo "  PASS: $1"; }
bad() { TOTAL=$((TOTAL+1)); FAIL=$((FAIL+1)); echo "  FAIL: $1"; }

echo "== cfn-tmux-agents cargo-target tests (socket: $SOCK) =="

cat > "$TD/eng" <<'FAKE'
#!/usr/bin/env bash
echo "CT-BANNER target=${CARGO_TARGET_DIR:-unset}"
sleep 30
FAKE
chmod +x "$TD/eng"

mkrepo() { # NAME [ROOT-LINE]: git repo with an optional committed opt-in file
  local r="$TD/$1"
  mkdir -p "$r/.claude"
  git -C "$r" init -q
  if [ "$#" -ge 2 ]; then printf '%s\n' "$2" > "$r/.claude/cargo-target-root"; fi
  printf '%s\n' "$r"
}
spawn() { # NAME CWD [env...]: spawn lane, print pane capture
  local name="$1" cwd="$2"; shift 2
  env -u CARGO_TARGET_DIR "$@" "$EXE" spawn "$name" --socket "$SOCK" --bin "$TD/eng" --banner-regex 'CT-BANNER' --cwd "$cwd" >/dev/null 2>&1 || true
  sleep 0.3
  tmux -L "$SOCK" capture-pane -p -t "$name" 2>/dev/null || true
}

ROOT="$TD/churn"
R1=$(mkrepo r1 "$ROOT")
CAP=$(spawn laneA "$R1" X=1)
case "$CAP" in *"target=$ROOT/laneA"*) ok "opt-in root: pane gets CARGO_TARGET_DIR=<root>/<lane-name>" ;;
  *) bad "opt-in root: expected target=$ROOT/laneA, pane=${CAP:0:200}" ;; esac

R2=$(mkrepo r2)
CAP=$(spawn laneB "$R2" X=1)
# the pane's own shell rc may export a global value, so assert spawn added no <lane> suffix
case "$CAP" in *"target="*"/laneB"*) bad "no opt-in file: spawn set a lane target: pane=${CAP:0:200}" ;; *"CT-BANNER target="*) ok "no opt-in file: spawn adds no lane CARGO_TARGET_DIR (no hardcoded project)" ;;
  *) bad "no opt-in file: pane=${CAP:0:200}" ;; esac

CAP=$(spawn laneC "$R1" TMUX_AGENTS_CARGO_TARGET_DIR=/var/tmp/explicit)
case "$CAP" in *"target=/var/tmp/explicit"*) ok "explicit TMUX_AGENTS_CARGO_TARGET_DIR wins over the project root" ;;
  *) bad "explicit value overridden: pane=${CAP:0:200}" ;; esac
# ambient global export must not switch the opt-in off (master shell exports one)
env CARGO_TARGET_DIR=/ambient/global "$EXE" spawn laneH --socket "$SOCK" --bin "$TD/eng" --banner-regex 'CT-BANNER' --cwd "$R1" >/dev/null 2>&1 || true
CAP=$(tmux -L "$SOCK" capture-pane -p -t laneH 2>/dev/null || true)
case "$CAP" in *"target=$ROOT/laneH"*) ok "ambient CARGO_TARGET_DIR does not defeat the project opt-in" ;;
  *) bad "ambient value beat opt-in: pane=${CAP:0:200}" ;; esac

R3=$(mkrepo r3 "/dev/shm/churn")
rc=0; OUT=$("$EXE" spawn laneD --socket "$SOCK" --bin "$TD/eng" --banner-regex 'CT-BANNER' --cwd "$R3" 2>&1) || rc=$?
[ "$rc" -eq 66 ] && ok "root under /dev/shm refused with exit 66" || bad "/dev/shm root: want rc 66, got $rc: ${OUT:0:200}"
case "$OUT" in *"/dev/shm"*) ok "/dev/shm refusal names the reason" ;; *) bad "/dev/shm refusal silent: ${OUT:0:200}" ;; esac
tmux -L "$SOCK" has-session -t laneD 2>/dev/null && bad "refused spawn still created a session" || ok "refused spawn created no session"

R4=$(mkrepo r4 "relative/dir")
rc=0; "$EXE" spawn laneE --socket "$SOCK" --bin "$TD/eng" --banner-regex 'CT-BANNER' --cwd "$R4" >/dev/null 2>&1 || rc=$?
[ "$rc" -eq 66 ] && ok "relative root refused with exit 66" || bad "relative root: want rc 66, got $rc"

R5=$(mkrepo r5 "/mnt/wsl/churn/../../dev/shm/x")
rc=0; "$EXE" spawn laneF --socket "$SOCK" --bin "$TD/eng" --banner-regex 'CT-BANNER' --cwd "$R5" >/dev/null 2>&1 || rc=$?
[ "$rc" -eq 66 ] && ok "root with .. refused with exit 66 (no /dev/shm bypass)" || bad "dotdot root: want rc 66, got $rc"

R6=$(mkrepo r6 "$ROOT")
OUT=$("$EXE" spawn laneG --socket "$SOCK" --bin "$TD/eng" --cwd "$R6" --dry-run 2>&1 || true)
case "$OUT" in *"CARGO_TARGET_DIR=$ROOT/laneG"*) ok "dry-run shows the CARGO_TARGET_DIR the pane would get" ;;
  *) bad "dry-run omits CARGO_TARGET_DIR: ${OUT:0:300}" ;; esac

echo "== results: $PASS/$TOTAL passed, $FAIL failed =="
[ "$FAIL" -eq 0 ]
