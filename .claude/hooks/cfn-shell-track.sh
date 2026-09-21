#!/usr/bin/env bash
# PostToolUse (Bash): record every background shell in the session's watchdog
# ledger so the Stop hook can block idle while an unwatched task shell runs.
# Side-effect hook: always exits 0, never blocks the tool call.
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$DIR/cfn-shell-watch-common.sh"

INPUT=$(cat)

SESSION=$(printf '%s' "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)
[ -n "$SESSION" ] && [ "$SESSION" != "null" ] || exit 0

BG=$(printf '%s' "$INPUT" | jq -r '.tool_input.run_in_background // false' 2>/dev/null)
[ "$BG" = "true" ] || exit 0

# PID paths, in order: structured/text pid in the response (older harness
# shapes), then backgroundTaskId resolved via the /proc fd scan (the current
# background response carries only the task id).
RESP=$(printf '%s' "$INPUT" | jq -r '.tool_response | tostring' 2>/dev/null)
PID=""
if [ -n "$RESP" ] && [ "$RESP" != "null" ]; then
  re='[Pp][Ii][Dd]["'"'"':= ]+([0-9]+)'
  if [[ "$RESP" =~ $re ]]; then
    PID="${BASH_REMATCH[1]}"
  fi
fi
CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null | sw_sanitize | sed 's/[[:space:]]*$//' | cut -c1-160)
if [ -z "$PID" ]; then
  TASKID=$(printf '%s' "$INPUT" | jq -r '.tool_response.backgroundTaskId // empty' 2>/dev/null)
  if [ -n "$TASKID" ] && [ "$TASKID" != "null" ]; then
    TP=$(printf '%s' "$INPUT" | jq -r '.transcript_path // empty' 2>/dev/null)
    PID=$(sw_pid_for_task "$TASKID" "$SESSION" "$TP" "$CMD")
  fi
fi
[ -n "$PID" ] || exit 0
sw_alive "$PID" || exit 0

if sw_is_service "$CMD"; then KIND="service"; else KIND="task"; fi

LEDGER=$(sw_ledger "$SESSION")
mkdir -p "$CFN_SHELL_WATCH_DIR"

# Dedup: skip if this pid already has a row (re-run of the same background task).
if [ -f "$LEDGER" ]; then
  while IFS=$'\t' read -r p s k c; do
    [ "$p" = "$PID" ] && exit 0
  done < "$LEDGER"
fi

printf '%s\t%s\t%s\t%s\n' "$PID" "$(date +%s)" "$KIND" "$CMD" >> "$LEDGER"
exit 0
