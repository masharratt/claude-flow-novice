#!/usr/bin/env bash
# cfn-fleet lib/cmd-report.sh: worker -> master, through the agent mailbox.
#
#   fleet report <type> "<text>"      type: status | handoff | claim-request | done | blocked
#
# Run by a LOCAL worker (fleet spawn sets FLEET_WS, MAILBOX_SESSION,
# FLEET_MASTER_MAIL, MAILBOX_OUTQ and MAILBOX_COORD_FILE in its pane). Two steps:
#   1. the roster first (the record of truth): heartbeat, notes, status along
#      the allowed transitions, claim requests into handoffs/CLAIM_REQ_<WS>.md;
#   2. then one short mail to the master's role address (<project>-master).
#      With MAILBOX_OUTQ set (a sandboxed worker's Bash cannot reach Redis) the
#      mail is queued and the worker's mailbox hook sends it after this tool call.
# A failed mail is a warning, never a failure: the roster already has the
# report and `fleet watch` falls back to reading the files (MAILBOX-DOWN).
# Bodies are short and name files ("handoffs/HANDOFF_WS01.md"), never paste them.
# Remote workers use templates/remote-worker.sh instead (no fleet CLI there).
#
# Exit codes: 0 ok (mail may have warned) | 64 usage | 65 unknown ws | 71 roster write failed.

# shellcheck source=cmd-sync.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/cmd-sync.sh"

main() {
  local type="${1:-}" text="${2:-}" ws="${FLEET_WS:-}" lock to project kind rc=0 out
  [ $# -eq 2 ] || fleet_die 64 "usage: fleet report <status|handoff|claim-request|done|blocked> \"<text>\""
  case " $_FLEET_MAIL_WORKER_TYPES " in
    *" $type "*) ;;
    *) fleet_die 64 "report: '$type' is not a worker type (use: $_FLEET_MAIL_WORKER_TYPES; assign, answer and stop are the master's, via fleet mail)" ;;
  esac
  _fleet_mail_body_ok "$text" || fleet_die 64 "report: text must be 1 to $_FLEET_MAIL_BODY_MAX bytes; name the file instead of pasting it"
  [ -n "$ws" ] || fleet_die 64 "report: FLEET_WS is not set (fleet spawn sets it in the worker pane)"
  roster_exists "$ws" || fleet_die 65 "unknown workstream: $ws"

  # 1. Roster (record of truth), under the roster lock.
  lock="$(fleet_run_dir)/.roster.lock"
  (
    flock -x 9 || exit 71
    _fleet_mail_apply_locked "$ws" "$type" "$text" "report by $ws" || exit 71
  ) 9>"$lock" || fleet_die 71 "report: roster update failed for $ws"

  # 2. Mail to the master.
  if ! _fleet_mb_enabled; then
    echo "report $ws $type: roster updated (mailbox off for this run)"
    return 0
  fi
  project=$(_fleet_mb_project)
  to="${FLEET_MASTER_MAIL:-}"
  if [ -z "$to" ]; then
    local owner
    owner=$(_fleet_mb_owner) || owner=""
    [ -z "$owner" ] || to="$owner/s/$(fleet_master_mail_name "$project")"
  fi
  if [ -z "$to" ]; then
    echo "WARN report: mail not sent (no mailbox config); the roster has it" >&2
    return 0
  fi
  kind=$(_fleet_mail_kind "$type")
  if [ -n "${MAILBOX_OUTQ:-}" ]; then
    out=$(_fleet_mb queue "$to" --kind "$kind" --fleet "$type" -- "$text" 2>&1) || rc=$?
  else
    out=$(MAILBOX_SESSION="${MAILBOX_SESSION:-$(fleet_mail_name "$project" "$ws")}" \
      _fleet_mb send "$to" --kind "$kind" --fleet "$type" -- "$text" 2>&1) || rc=$?
  fi
  if [ "$rc" -ne 0 ]; then
    echo "WARN report: mail not sent ($(_fleet_mb_down_reason "$rc")); the roster has it" >&2
    return 0
  fi
  if [ -n "${MAILBOX_OUTQ:-}" ]; then
    echo "report $ws $type: roster updated, mail queued for $to"
  else
    echo "report $ws $type: roster updated, mailed $to"
  fi
}
