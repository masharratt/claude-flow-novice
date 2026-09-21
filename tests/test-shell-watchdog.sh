#!/usr/bin/env bash
# Shell watchdog hooks: cfn-shell-track.sh (PostToolUse Bash),
# cfn-shell-watchdog.sh (Stop), cfn-shell-status.sh (UserPromptSubmit).
# Contract under test (global CLAUDE.md "Shell Watchdog"):
#   - background task shells are recorded and block idle until a check is armed
#   - service shells (dev servers, watchers) never block; reported once, then left alone
#   - a finished shell that was never acknowledged is surfaced, not silently dropped
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOKS="$HERE/.claude/hooks"
WORK="$(mktemp -d /tmp/cfn-shell-watch-test.XXXXXX)"
export CFN_SHELL_WATCH_DIR="$WORK/watch"
export CFN_SHELL_PROC_DIR="$WORK/proc"
export CFN_SHELL_TMP_BASE="$WORK/tmp"
SID="testsess$$"
PASS=0
FAIL=0
SLEEP_PID=""
SVC_PID=""

cleanup() {
  [ -n "$SLEEP_PID" ] && kill "$SLEEP_PID" 2>/dev/null
  [ -n "$SVC_PID" ] && kill "$SVC_PID" 2>/dev/null
  rm -rf "$WORK"
}
trap cleanup EXIT

ok() { PASS=$((PASS + 1)); echo "  ok: $1"; }
fail() { FAIL=$((FAIL + 1)); echo "FAIL: $1"; }

# Pure-bash containment check (no grep -q SIGPIPE trap on big haystacks).
assert_contains() { # label haystack needle
  case "$2" in
    *"$3"*) ok "$1" ;;
    *) fail "$1: needle not found" ;;
  esac
}

assert_not_contains() { # label haystack needle
  case "$2" in
    *"$3"*) fail "$1: needle unexpectedly found" ;;
    *) ok "$1" ;;
  esac
}

ledger() { printf '%s/%s.tsv' "$CFN_SHELL_WATCH_DIR" "$SID"; }

# kind_of PID -> prints "task"|"service"|"" for that ledger row (pure bash)
kind_of() {
  local want="$1" p s k c
  [ -f "$(ledger)" ] || return 0
  while IFS=$'\t' read -r p s k c; do
    if [ "$p" = "$want" ]; then
      printf '%s' "$k"
      return 0
    fi
  done < "$(ledger)"
}

row_exists() {
  local want="$1" p s k c
  [ -f "$(ledger)" ] || return 1
  while IFS=$'\t' read -r p s k c; do
    [ "$p" = "$want" ] && return 0
  done < "$(ledger)"
  return 1
}

track() { printf '%s' "$1" | bash "$HOOKS/cfn-shell-track.sh"; }
watchdog() { printf '{"session_id":"%s"}' "$SID" | bash "$HOOKS/cfn-shell-watchdog.sh"; }
status() { printf '{"session_id":"%s"}' "$SID" | bash "$HOOKS/cfn-shell-status.sh"; }

echo "== shell watchdog hooks =="

# --- 1. track records a background task shell via backgroundTaskId + /proc scan ---
# The harness background response carries only backgroundTaskId; the tracker
# resolves the pid by finding the process whose fd 1 is the task output file.
sleep 300 &
SLEEP_PID=$!
SLUG="slug-$SID"
TASKFILE="$CFN_SHELL_TMP_BASE/claude-$(id -u)/$SLUG/$SID/tasks/bgtask1.output"
mkdir -p "$(dirname "$TASKFILE")" "$CFN_SHELL_PROC_DIR/$SLEEP_PID/fd"
touch "$TASKFILE"
ln -s "$TASKFILE" "$CFN_SHELL_PROC_DIR/$SLEEP_PID/fd/1"
track "{\"session_id\":\"$SID\",\"transcript_path\":\"$WORK/projects/$SLUG/$SID.jsonl\",\"tool_input\":{\"command\":\"cargo build --release\",\"run_in_background\":true},\"tool_response\":{\"stdout\":\"\",\"stderr\":\"\",\"backgroundTaskId\":\"bgtask1\"}}"
row_exists "$SLEEP_PID" && ok "task row recorded (taskid scan)" || fail "task row recorded: ledger missing"
[ "$(kind_of "$SLEEP_PID")" = "task" ] && ok "classified task" || fail "classified task: got '$(kind_of "$SLEEP_PID")'"

# --- 1b. cmdline fallback: no fd holder, resolver matches /proc cmdline ---
sleep 300 &
PID3=$!
TASKFILE2="$CFN_SHELL_TMP_BASE/claude-$(id -u)/$SLUG/$SID/tasks/bgtask2.output"
touch "$TASKFILE2"
mkdir -p "$CFN_SHELL_PROC_DIR/$PID3"
printf 'bash -c pnpm test --run' | tr ' ' '\0' > "$CFN_SHELL_PROC_DIR/$PID3/cmdline"
printf '%s (bash) S 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 99999\n' "$PID3" > "$CFN_SHELL_PROC_DIR/$PID3/stat"
track "{\"session_id\":\"$SID\",\"transcript_path\":\"$WORK/projects/$SLUG/$SID.jsonl\",\"tool_input\":{\"command\":\"pnpm test --run\",\"run_in_background\":true},\"tool_response\":{\"backgroundTaskId\":\"bgtask2\"}}"
row_exists "$PID3" && ok "task row recorded (cmdline fallback)" || fail "cmdline fallback row missing"
kill "$PID3" 2>/dev/null

# --- 1c. structured pid in the response still works ---
sleep 300 &
PID2=$!
track "{\"session_id\":\"$SID\",\"tool_input\":{\"command\":\"pnpm test --run\",\"run_in_background\":true},\"tool_response\":\"{\\\"pid\\\": $PID2}\"}"
row_exists "$PID2" && ok "task row recorded (response pid)" || fail "structured pid row missing"
kill "$PID2" 2>/dev/null

# --- 2. track classifies dev servers as service ---
sleep 300 &
SVC_PID=$!
track "{\"session_id\":\"$SID\",\"tool_input\":{\"command\":\"npm run dev\",\"run_in_background\":true},\"tool_response\":\"{\\\"pid\\\": $SVC_PID}\"}"
row_exists "$SVC_PID" && ok "service row recorded" || fail "service row recorded: ledger missing"
[ "$(kind_of "$SVC_PID")" = "service" ] && ok "classified service" || fail "classified service: got '$(kind_of "$SVC_PID")'"

# --- 3. track ignores foreground commands ---
BEFORE=$(wc -l < "$(ledger)" | tr -d ' ')
track "{\"session_id\":\"$SID\",\"tool_input\":{\"command\":\"cargo build\",\"run_in_background\":false},\"tool_response\":\"done\"}"
AFTER=$(wc -l < "$(ledger)" | tr -d ' ')
[ "$BEFORE" = "$AFTER" ] && ok "foreground ignored" || fail "foreground ignored: row added"

# --- 4. Stop watchdog blocks on live unwatched task ---
OUT=$(watchdog)
assert_contains "watchdog blocks" "$OUT" '"decision":"block"'
assert_contains "block names pid" "$OUT" "$SLEEP_PID"

# --- 5. marker file clears the block ---
mkdir -p "$CFN_SHELL_WATCH_DIR"
touch "$CFN_SHELL_WATCH_DIR/$SID.$SLEEP_PID.watched"
OUT=$(watchdog)
assert_not_contains "marker clears block" "$OUT" '"decision":"block"'
# marker stays: test 6 checks that a DEAD row does not block, and the live
# SLEEP_PID task must not pollute that with its own (correct) block.

# --- 6. dead unwatched task does not block, row survives for status ---
sleep 1 &
DEAD_PID=$!
wait $DEAD_PID
printf '%s\t%s\t%s\t%s\n' "$DEAD_PID" "$(date +%s)" "task" "quick job" >> "$(ledger)"
OUT=$(watchdog)
assert_not_contains "dead task no block" "$OUT" '"decision":"block"'
row_exists "$DEAD_PID" && ok "dead row kept for status" || fail "dead row kept for status"

# --- 7. status surfaces finished-but-unacknowledged, then drops the row ---
OUT=$(status)
assert_contains "status reports finished" "$OUT" "FINISHED"
row_exists "$DEAD_PID" && fail "finished row dropped after report" || ok "finished row dropped after report"

# --- 8. status reports a service once, then leaves it alone ---
# (an earlier status call may already have consumed the service row; re-seed)
if ! row_exists "$SVC_PID"; then
  printf '%s\t%s\t%s\t%s\n' "$SVC_PID" "$(date +%s)" "service" "npm run dev" >> "$(ledger)"
fi
OUT=$(status)
assert_contains "service reported once" "$OUT" "SERVICE"
OUT=$(status)
assert_not_contains "service not re-reported" "$OUT" "SERVICE"
row_exists "$SVC_PID" && fail "service row dropped" || ok "service row dropped"

echo
echo "pass=$PASS fail=$FAIL"
[ "$FAIL" = 0 ]
