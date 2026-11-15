#!/usr/bin/env bash
# cfn-fleet lib/cmd-mail.sh: master -> worker, through the agent mailbox.
#
#   fleet mail WSxx <type> "<text>"      type: assign | answer | stop
#
# Sends from the master's role address (<project>-master) to the worker's
# (<project>-<ws>) as kind ask, so the mailbox watcher wakes an idle pane. The
# message carries the run's coordinator secret (mailbox.sh reads it from
# <run>/.coord/secret and passes it on stdin, never argv); the worker's hook
# labels it "coordinator" only when it matches the copy in that worker's brief.
# Coordinator mail lets a worker act within its brief only: it is not the
# user's approval and never authorizes a push, deploy or spend.
# Bodies are short and name files ("briefs/WS01.md, section 2").
#
# Host rows: a sandboxed lane on a remote host can never READ mail (Redis is
# blocked there; MDTWII 2026-11-14, lanes idle for hours). So the message also
# goes into the lane's <outbox>/FROM_MASTER.md over ssh and the lane's pane gets
# a short pointer typed in, then a separate Enter (lane-deliver.sh). For a
# host row only FROM_MASTER.md counts: Redis taking the message is not
# delivery, since the lane cannot read it (codex review 2026-11-14, finding 5).
#
# Exit codes: 0 ok (prints the message id and/or "delivered") | 64 usage |
# 65 unknown ws | 66 not delivered: a host row whose FROM_MASTER.md could not
# be written (whatever the mailbox did), or a local row with the mailbox off,
# not configured or unreachable.

# shellcheck source=cmd-sync.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/cmd-sync.sh"

main() {
  local ws="${1:-}" type="${2:-}" text="${3:-}" rc=0 id
  [ $# -eq 3 ] || fleet_die 64 "usage: fleet mail WSxx <assign|answer|stop> \"<text>\""
  case " $_FLEET_MAIL_MASTER_TYPES " in
    *" $type "*) ;;
    *) fleet_die 64 "mail: '$type' is not a master type (use: $_FLEET_MAIL_MASTER_TYPES; workers send theirs with fleet report)" ;;
  esac
  _fleet_mail_body_ok "$text" || fleet_die 64 "mail: text must be 1 to $_FLEET_MAIL_BODY_MAX bytes; name the file instead of pasting it"
  roster_exists "$ws" || fleet_die 65 "unknown workstream: $ws"
  local host drc=0 why=""
  host=$(roster_get "$ws" host)
  if [ -n "$host" ]; then
    _fleet_lane_deliver "$ws" "$type" "$text" || drc=$?
    case "$drc" in
      0) echo "delivered $ws $type to FROM_MASTER.md on $host; lane nudged" ;;
      5) echo "delivered $ws $type to FROM_MASTER.md on $host; WARN the nudge failed (fleet peek $ws)" ;;
      2) why="no remote env for $ws (not spawned on $host yet)" ;;
      *) why="FROM_MASTER.md on $host not written (rc $drc)" ;;
    esac
    # The mailbox copy is best effort for a host lane (its hook may show it
    # once the lane is unsandboxed); it never stands in for the file.
    if _fleet_mb_enabled; then
      id=$(_fleet_mail_send "$ws" "$type" "$text" 2>/dev/null) || rc=$?
      [ "$rc" -ne 0 ] || echo "mailed $ws $type $id"
    fi
    [ -z "$why" ] || fleet_die 66 "mail: NOT delivered to $ws: $why. A host lane cannot read the mailbox, so a mailbox copy does not count; retry when $host answers"
    return 0
  fi
  _fleet_mb_enabled || fleet_die 66 "mail: the mailbox is off for this run (FLEET_MAILBOX=off); use fleet nudge --tmux"
  id=$(_fleet_mail_send "$ws" "$type" "$text" 2>/dev/null) || rc=$?
  [ "$rc" -eq 0 ] || fleet_die 66 "mail: MAILBOX-DOWN ($(_fleet_mb_down_reason "$rc")); nothing sent. Use fleet nudge --tmux, or try again"
  echo "mailed $ws $type $id"
}
