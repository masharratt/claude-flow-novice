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
# Exit codes: 0 ok (prints the message id) | 64 usage | 65 unknown ws |
# 66 mailbox off, not configured or unreachable (use `fleet nudge --tmux`).

main() {
  local ws="${1:-}" type="${2:-}" text="${3:-}" rc=0 id
  [ $# -eq 3 ] || fleet_die 64 "usage: fleet mail WSxx <assign|answer|stop> \"<text>\""
  case " $_FLEET_MAIL_MASTER_TYPES " in
    *" $type "*) ;;
    *) fleet_die 64 "mail: '$type' is not a master type (use: $_FLEET_MAIL_MASTER_TYPES; workers send theirs with fleet report)" ;;
  esac
  _fleet_mail_body_ok "$text" || fleet_die 64 "mail: text must be 1 to $_FLEET_MAIL_BODY_MAX bytes; name the file instead of pasting it"
  roster_exists "$ws" || fleet_die 65 "unknown workstream: $ws"
  _fleet_mb_enabled || fleet_die 66 "mail: the mailbox is off for this run (FLEET_MAILBOX=off); use fleet nudge --tmux"
  id=$(_fleet_mail_send "$ws" "$type" "$text" 2>/dev/null) || rc=$?
  [ "$rc" -eq 0 ] || fleet_die 66 "mail: MAILBOX-DOWN ($(_fleet_mb_down_reason "$rc")); nothing sent. Use fleet nudge --tmux, or try again"
  echo "mailed $ws $type $id"
}
