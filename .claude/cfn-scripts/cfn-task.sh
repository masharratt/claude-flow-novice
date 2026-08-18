#!/usr/bin/env bash
# cfn-task — manage the status-line task for the current Claude session.
# Session-keyed: writes .claude/tasks/<CLAUDE_CODE_SESSION_ID>.txt so parallel
# sessions in the SAME cwd never clobber each other. The status line reads it
# (precedence: session > project banner > global).
#
#   cfn-task "text"   set THIS session's task  (needs CLAUDE_CODE_SESSION_ID)
#   cfn-task           print THIS session's task
#   cfn-task -c        clear THIS session's task
#   cfn-task -g "text" project banner (all sessions in this project, fallback)
#   cfn-task -G "text" global banner (~/.claude, all projects, fallback)
#
# Inside a Claude Code Bash tool, CLAUDE_CODE_SESSION_ID is in env, so the
# session-keyed path works. From a raw terminal that env is absent -> use -g/-G.

set -euo pipefail
sid="${CLAUDE_CODE_SESSION_ID:-}"

# nearest ancestor containing .claude/  (so it works from subdirs)
proj="$PWD"
d="$PWD"
while [ "$d" != "/" ]; do
  [ -d "$d/.claude" ] && { proj="$d"; break; }
  d="$(dirname "$d")"
done
tasks_dir="$proj/.claude/tasks"

mode=set
while [ $# -gt 0 ]; do
  case "$1" in
    -c) mode=clear; shift ;;
    -g) mode=project; shift ;;
    -G) mode=global; shift ;;
    -h|--help)
      sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    --) shift; break ;;
    -*) echo "unknown flag: $1" >&2; exit 1 ;;
    *) break ;;
  esac
done
text="$*"

case "$mode" in
  set)
    [ -n "$sid" ] || { echo "no CLAUDE_CODE_SESSION_ID in env (raw terminal?). use -g/-G." >&2; exit 1; }
    mkdir -p "$tasks_dir"
    if [ -z "$text" ]; then
      f="$tasks_dir/$sid.txt"; [ -f "$f" ] && cat "$f" || echo "(no task set)"
    else
      printf '%s\n' "$text" > "$tasks_dir/$sid.txt"
      [ "${#text}" -gt 50 ] && echo "(warn: ${#text} chars — status bar truncates at 50)" >&2
      echo "set [session ${sid:0:8}]: $text"
    fi ;;
  clear)
    [ -n "$sid" ] || { echo "no session id"; exit 1; }
    rm -f "$tasks_dir/$sid.txt"; echo "cleared session task" ;;
  project)
    f="$proj/.claude/current-task.txt"
    if [ -z "$text" ]; then [ -f "$f" ] && cat "$f" || echo "(none)"; exit 0; fi
    printf '%s\n' "$text" > "$f"; echo "project task: $text" ;;
  global)
    f="$HOME/.claude/current-task.txt"
    if [ -z "$text" ]; then [ -f "$f" ] && cat "$f" || echo "(none)"; exit 0; fi
    printf '%s\n' "$text" > "$f"; echo "global task: $text" ;;
esac
