#!/usr/bin/env bash
# Shared helpers for the shell watchdog hooks (track / watchdog / status).
# Sourced, never executed directly.
#
# Ledger: one TSV per Claude session under $CFN_SHELL_WATCH_DIR, one row per
# tracked background shell:
#   pid <TAB> started_epoch <TAB> kind <TAB> cmd
# kind: "task" (finite job: build, test run, migration) or "service" (dev
# server, watcher, tail -f: reported once, then left alone).
# A pid's armed 15-min check is the marker file <session>.<pid>.watched; the
# model touches it after creating the CronCreate check, which a hook cannot see.

CFN_SHELL_WATCH_DIR="${CFN_SHELL_WATCH_DIR:-/tmp/cfn-shell-watch}"
# /proc scan root and task-output base are injectable for tests.
CFN_SHELL_PROC_DIR="${CFN_SHELL_PROC_DIR:-/proc}"
CFN_SHELL_TMP_BASE="${CFN_SHELL_TMP_BASE:-$HOME/.claude-tmp}"

sw_ledger() { # $1 = session id
  printf '%s/%s.tsv' "$CFN_SHELL_WATCH_DIR" "$1"
}

sw_marker() { # $1 = session id, $2 = pid
  printf '%s/%s.%s.watched' "$CFN_SHELL_WATCH_DIR" "$1" "$2"
}

sw_alive() { # $1 = pid
  case "$1" in
    ''|*[!0-9]*) return 1 ;;
  esac
  [ "$1" -gt 0 ] 2>/dev/null || return 1
  kill -0 "$1" 2>/dev/null
}

# Collapse tabs/newlines so a command never breaks the TSV row shape.
sw_sanitize() { # stdin -> stdout
  tr '\t\n\r' '   '
}

# Resolve the pid of a background task: the harness's tool_response carries a
# backgroundTaskId but no pid. Two scans, in order: a process holding the
# task's output file open (older harness shapes that redirect directly), then
# the newest process whose cmdline contains the task's command (current shape:
# output is streamed through pipes, but the wrapper is `bash -c <command>`).
# Needs /proc (Linux/WSL2); elsewhere the scans find nothing and the shell
# goes unguarded, same as no watchdog.
sw_pid_for_task() { # $1 task id, $2 session id, $3 transcript path, $4 command
  local taskid="$1" session="$2" tp="$3" cmd="$4" uid slug taskfile proc fdlink target
  [ -d "$CFN_SHELL_PROC_DIR" ] || return 1
  uid="$(id -u)"
  slug=""
  case "$tp" in
    */projects/*) slug="${tp#*/projects/}"; slug="${slug%/*}" ;;
  esac
  if [ -n "$slug" ]; then
    taskfile="$CFN_SHELL_TMP_BASE/claude-$uid/$slug/$session/tasks/$taskid.output"
    if [ -e "$taskfile" ]; then
      for proc in "$CFN_SHELL_PROC_DIR"/[0-9]*; do
        [ -d "$proc" ] || continue
        for fdlink in "$proc"/fd/*; do
          target="$(readlink "$fdlink" 2>/dev/null)" || continue
          if [ "$target" = "$taskfile" ]; then
            printf '%s' "${proc##*/}"
            return 0
          fi
        done
      done
    fi
  fi
  sw_newest_pid_by_cmd "$cmd"
}

# Newest /proc process whose cmdline contains the given command text.
# start time is field 22 of stat; after stripping "pid (comm) " it is field 20.
sw_newest_pid_by_cmd() { # $1 command snippet
  local want="$1" best="" beststart=0 cmd st proc
  [ -d "$CFN_SHELL_PROC_DIR" ] || return 1
  [ -n "$want" ] || return 1
  for proc in "$CFN_SHELL_PROC_DIR"/[0-9]*; do
    [ -r "$proc/cmdline" ] || continue
    cmd="$(tr '\0' ' ' < "$proc/cmdline" 2>/dev/null)" || continue
    case "$cmd" in
      *"$want"*)
        st="$(sed 's/.*) //' "$proc/stat" 2>/dev/null | awk '{print $20}')"
        [ -n "$st" ] || continue
        if [ "$st" -gt "$beststart" ]; then
          beststart="$st"
          best="${proc##*/}"
        fi
        ;;
    esac
  done
  [ -n "$best" ] && printf '%s' "$best"
  return 1
}

# Finite jobs are the default; only clear long-lived-process patterns are
# services. A misclassified service loses its idle guard, so this list stays
# deliberately conservative.
sw_is_service() { # $1 = command string
  local c="$1"
  case "$c" in
    *"--watch"*) return 0 ;;
  esac
  if printf '%s' "$c" | grep -Eq '(npm|pnpm|yarn|bun) +(run +)?(dev|start|serve|watch)( |$)'; then return 0; fi
  if printf '%s' "$c" | grep -Eq '^(next|vite|ng|nodemon|ember|webpack) +(dev|serve|watch)'; then return 0; fi
  if printf '%s' "$c" | grep -Eq 'tail +-f '; then return 0; fi
  if printf '%s' "$c" | grep -Eq '(supabase +(start|stop|status|db start)|fly +logs|docker(-| )compose +up|podman compose +up)'; then return 0; fi
  if printf '%s' "$c" | grep -Eq '(uvicorn|gunicorn|flask +run|rails +(s|server)|python +-m +(http\.server|SimpleHTTPServer)|cargo +watch|watchexec)'; then return 0; fi
  return 1
}
