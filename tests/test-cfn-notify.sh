#!/usr/bin/env bash
# tests/test-cfn-notify.sh
# cfn-notify.sh :: plays the attention sound on macOS as well as WSL.
#
# Regression (2026-10-16): the script only knew powershell.exe, so on the Mac
# it exited silently and every "Claude needs you" sound was lost with no error.
# Now macOS plays a system sound through afplay; WSL keeps the Windows path.
#
# afplay and powershell.exe are stubbed on PATH (argv logged). CFN_NOTIFY_SYNC=1
# runs the player in the foreground so the log is complete when the hook exits.
set -euo pipefail
PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"
HOOK="$PROJECT_ROOT/.claude/hooks/cfn-notify.sh"

T=$(mktemp -d "${TMPDIR:-/tmp}/cfn-notify.XXXXXX") || exit 1
T=$(cd -P "$T" && pwd -P) || exit 1
trap 'cfn_safe_rm_tmp "$T"' EXIT

MAC_BIN="$T/mac"; WSL_BIN="$T/wsl"; LOG="$T/play.log"
mkdir -p "$MAC_BIN" "$WSL_BIN"
for b in "$MAC_BIN/afplay" "$WSL_BIN/powershell.exe"; do
  printf '#!/usr/bin/env bash\nprintf "%%s %%s\\n" "$(basename "$0")" "$*" >> "$PLAY_LOG"\n' > "$b"
  chmod +x "$b"
done
# Only the stub dir plus the basics, so a real afplay/powershell never leaks in.
BASE_PATH="/bin:/usr/bin"
[ -x /usr/bin/afplay ] && { mkdir -p "$T/base"; for c in bash env sed cat basename setsid; do p=$(command -v "$c" 2>/dev/null) && ln -sf "$p" "$T/base/$c"; done; BASE_PATH="$T/base"; }

pass=0; fail=0
ok()  { pass=$((pass+1)); }
bad() { fail=$((fail+1)); echo "FAIL ($1): $2"; }

notify() { # bin-dir event [env...]
  local bin=$1 ev=$2; shift 2
  : > "$LOG"; RC=0
  env PATH="$bin:$BASE_PATH" PLAY_LOG="$LOG" CFN_NOTIFY_SYNC=1 "$@" bash "$HOOK" "$ev" >/dev/null 2>&1 || RC=$?
}

# GIVEN macOS, WHEN Claude needs input, THEN afplay plays the default system sound
notify "$MAC_BIN" input
[ "$RC" = 0 ] && ok || bad "mac input exit" "rc=$RC"
grep -q '^afplay /System/Library/Sounds/Glass.aiff' "$LOG" && ok || bad "mac input sound" "$(cat "$LOG")"

# GIVEN macOS and a chosen sound name, THEN that sound plays
notify "$MAC_BIN" input CFN_NOTIFY_INPUT=Ping
grep -q '^afplay /System/Library/Sounds/Ping.aiff' "$LOG" && ok || bad "mac custom sound" "$(cat "$LOG")"

# GIVEN the kill switch, THEN nothing plays
notify "$MAC_BIN" input CFN_NOTIFY=0
[ ! -s "$LOG" ] && ok || bad "kill switch" "$(cat "$LOG")"

# GIVEN WSL, THEN the Windows player is used, not afplay
notify "$WSL_BIN" input
grep -q '^powershell.exe .*Windows Notify Calendar' "$LOG" && ok || bad "wsl input" "$(cat "$LOG")"

# GIVEN neither player, THEN a silent no-op that still exits 0
notify "$T/none" input
[ "$RC" = 0 ] && [ ! -s "$LOG" ] && ok || bad "no player" "rc=$RC $(cat "$LOG")"

echo "passed=$pass failed=$fail"
[ "$fail" = 0 ]
