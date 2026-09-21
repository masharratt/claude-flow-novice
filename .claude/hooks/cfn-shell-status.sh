#!/usr/bin/env bash
# UserPromptSubmit hook: surface shell-watchdog state at the start of every
# user turn. Catches the exact failure the watchdog exists for: a background
# shell finished while the session was idle and its completion notification
# was missed. Reporting a dead-unwatched shell is its acknowledgement; the row
# is dropped. Live services are reported once, then left alone (scope
# decision: only finite task shells get the 15-min check loop).
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$DIR/cfn-shell-watch-common.sh"

INPUT=$(cat)
SESSION=$(printf '%s' "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)
[ -n "$SESSION" ] && [ "$SESSION" != "null" ] || exit 0

LEDGER=$(sw_ledger "$SESSION")
[ -f "$LEDGER" ] || exit 0

NOW=$(date +%s)
ROWS=$(cat "$LEDGER")
KEEP=""
LINES=""
COUNT=0
while IFS=$'\t' read -r pid started kind cmd; do
  [ -n "${pid:-}" ] || continue
  MARKER=$(sw_marker "$SESSION" "$pid")
  MINS=$(( (NOW - started) / 60 ))
  if sw_alive "$pid"; then
    if [ "$kind" = "service" ]; then
      # Reported once = health-checked once; then left alone by design.
      [ "$COUNT" -lt 10 ] && LINES="${LINES}- SERVICE (checked once, left alone): pid $pid, ${MINS}m: $cmd"$'\n'
      COUNT=$((COUNT + 1))
      continue # drop row
    fi
    if [ -f "$MARKER" ]; then
      [ "$COUNT" -lt 10 ] && LINES="${LINES}- RUNNING (check armed): pid $pid, ${MINS}m: $cmd"$'\n'
    else
      [ "$COUNT" -lt 10 ] && LINES="${LINES}- RUNNING unwatched: pid $pid, ${MINS}m: $cmd. Arm the 15-min CronCreate check or collect before going idle."$'\n'
    fi
    KEEP="$KEEP$pid"$'\t'"$started"$'\t'"$kind"$'\t'"$cmd"$'\n'
  else
    if [ ! -f "$MARKER" ]; then
      # Finished without acknowledgement: the missed-completion case.
      [ "$COUNT" -lt 10 ] && LINES="${LINES}- FINISHED (completion may have been missed): pid $pid: $cmd. Read its output now (BashOutput or the task output file)."$'\n'
    fi
    COUNT=$((COUNT + 1))
    rm -f "$MARKER"
    continue # drop row (reported = acknowledged)
  fi
  COUNT=$((COUNT + 1))
done <<< "$ROWS"

printf '%s' "$KEEP" > "$LEDGER"

if [ -n "$LINES" ]; then
  CTXT="CFN shell watchdog status:"$'\n'"$LINES"
  jq -cn --arg c "$CTXT" '{hookSpecificOutput: {hookEventName: "UserPromptSubmit", additionalContext: $c}}'
fi
exit 0
