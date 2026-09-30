#!/usr/bin/env bash
# Stop hook: block going idle while a tracked background TASK shell is still
# running and no 15-min progress check is armed for it. This is the hard guard
# for the CLAUDE.md Shell Watchdog rule: background completion notifications
# get missed (busy session) or never fire (hangs), so the model must arm a
# CronCreate check, acknowledge it via the marker file, or finish the shell
# before the session may go idle.
#
# Rows: task-unwatched-alive -> block. task-watched-alive -> keep, no block.
# dead+watched -> prune. dead+unwatched -> keep (UserPromptSubmit status hook
# reports it as a missed completion, then drops it). service -> never blocks.
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$DIR/cfn-shell-watch-common.sh"

INPUT=$(cat)
SESSION=$(printf '%s' "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)
[ -n "$SESSION" ] && [ "$SESSION" != "null" ] || exit 0

# Stop-hook loop valve (Claude Code contract): stop_hook_active=true means this
# stop attempt is already a continuation after a previous block. Block once per
# stop event, then release. Otherwise a model that misses the acknowledgment
# is re-blocked every turn-end until the harness cap force-ends the session
# (seen 2026-09-30: 9 straight blocks in fireside-family). The status hook
# (UserPromptSubmit) still surfaces any shell left unresolved at the next prompt.
ACTIVE=$(printf '%s' "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null)
[ "$ACTIVE" = "true" ] && exit 0

LEDGER=$(sw_ledger "$SESSION")
[ -f "$LEDGER" ] || exit 0

ROWS=$(cat "$LEDGER")
KEEP=""
OFFENDERS=""
while IFS=$'\t' read -r pid started kind cmd; do
  [ -n "${pid:-}" ] || continue
  MARKER=$(sw_marker "$SESSION" "$pid")
  if sw_alive "$pid"; then
    KEEP="$KEEP$pid"$'\t'"$started"$'\t'"$kind"$'\t'"$cmd"$'\n'
    if [ "$kind" = "task" ] && [ ! -f "$MARKER" ]; then
      OFFENDERS="${OFFENDERS}pid $pid (${cmd}): running, no check armed; "
    fi
  else
    # Dead and never acknowledged: keep for the status hook to surface.
    if [ ! -f "$MARKER" ]; then
      KEEP="$KEEP$pid"$'\t'"$started"$'\t'"$kind"$'\t'"$cmd"$'\n'
    fi
    rm -f "$MARKER"
  fi
done <<< "$ROWS"

printf '%s' "$KEEP" > "$LEDGER"

if [ -n "$OFFENDERS" ]; then
  REASON="CFN shell watchdog: background task shell(s) still running without a progress check: $OFFENDERS Per the Shell Watchdog rule, either (1) arm a 15-minute progress check for each via CronCreate, then acknowledge with: mkdir -p $CFN_SHELL_WATCH_DIR && touch $CFN_SHELL_WATCH_DIR/$SESSION.<pid>.watched (one marker per pid above), or (2) stop the shell. Only the marker file or the process exiting clears this block; reading its output does not register. Do not go idle with an unwatched task shell."
  jq -cn --arg r "$REASON" '{decision: "block", reason: $r}'
fi
exit 0
