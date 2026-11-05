#!/usr/bin/env bash
# cfn-selftest: not-a-hook disabled 2026-11-05 by user (MDTWII tracks disk); re-wire under UserPromptSubmit to enable.
# cfn-disk-budget-inject - UserPromptSubmit hook. If the disk budget watchdog
# (cfn-disk-budget.sh) wrote disk-alert.json and it is newer than the last ack, inject one line
# of additionalContext, once per session per alert. `--ack` records the acknowledgement.
# Fails open: any error prints nothing and exits 0. Skipped inside subagents.
set -uo pipefail
STATE_DIR="${CFN_DISK_STATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/cfn}"
ALERT="$STATE_DIR/disk-alert.json"; ACK="$STATE_DIR/disk-alert.ack"

if [ "${1:-}" = "--ack" ]; then
  mkdir -p "$STATE_DIR" 2>/dev/null && touch "$ACK" && echo "disk budget alert acknowledged"
  exit 0
fi

{
  command -v jq >/dev/null 2>&1 || exit 0
  RAW=$(timeout 1 cat 2>/dev/null || true)
  [ -f "$ALERT" ] || exit 0
  [ ! -f "$ACK" ] || [ "$ALERT" -nt "$ACK" ] || exit 0
  [ -z "$(printf '%s' "$RAW" | jq -r '.agent_id // empty' 2>/dev/null)" ] || exit 0
  SID=$(printf '%s' "$RAW" | jq -r '.session_id // empty' 2>/dev/null)
  EVT=$(printf '%s' "$RAW" | jq -r '.hook_event_name // empty' 2>/dev/null)
  : "${EVT:=UserPromptSubmit}"

  TS=$(jq -r '.ts' "$ALERT")
  if [ -n "$SID" ]; then
    GD="${XDG_RUNTIME_DIR:-/tmp}/cfn-guards/$SID"; mkdir -p "$GD" 2>/dev/null
    [ "$(cat "$GD/disk-budget-seen" 2>/dev/null)" = "$TS" ] && exit 0
    printf '%s' "$TS" > "$GD/disk-budget-seen"
  fi

  MSG=$(jq -r '
    (.alerts | sort_by(.free_pct) | .[0]) as $w
    | ([.growers[:5][] | "\(.path) +\((.growth_mb/1024*10|floor)/10)GB"] | join(", ")) as $g
    | "disk budget: \($w.mount) free \($w.free_gb) GB, fell \($w.drop_gb) GB"
      + (if (.alerts|length) > 1 then " (+\(.alerts|length-1) more drive)" else "" end)
      + "; top growers: \(if $g=="" then "none scanned" else $g end); producers need a cap and cleanup."' "$ALERT")
  [ -n "$MSG" ] || exit 0
  jq -n -c --arg e "$EVT" --arg m "$MSG" '{hookSpecificOutput:{hookEventName:$e,additionalContext:$m}}'
} 2>/dev/null
exit 0
