#!/usr/bin/env bash
# cfn-git-config-lock-sweep — PreToolUse (Bash) hook. Never blocks (exit 0 always).
#
# Why: Claude Code's own Bash sandbox (bwrap) adds
#   --ro-bind /dev/null <main>/.git/config.lock
# for worktree sessions. When the file is absent bwrap creates a 0-byte,
# mode 0444 mount-point file on the host that outlives the command, and then
# `git worktree add`, `git config ...` etc. fail with
# "could not lock config file ... File exists" (seen 2026-11-19 and 11-20).
#
# What: when the command will WRITE git config, find the repo's common dir
# (git rev-parse --git-common-dir from the effective cwd, honouring
# `cd X &&` and `git -C X`) and delete <common>/config.lock ONLY if it is a
# regular non-symlink file, size 0, has no write bit for anyone, and is owned
# by the current user. A writable lock is a real git lock in progress: kept.
# One stderr line when something was removed.
#
# Commands that count as config writes (kept tight on purpose):
#   git worktree add|remove|prune|move|lock|unlock|repair
#   git config  (unless --get* / --list / -l / get / list / --show-origin-only forms)
#   git remote add|set-url|remove|rm|rename|set-head|set-branches
#   git branch --set-upstream* | -u | --unset-upstream | -m|-M|-c|-C
#   git submodule (any subcommand)
# Not covered: git clone (creates a new repo), fetch/pull/push (config-free).
#
# Parsing is a best-effort split on && || ; | and newlines; quotes are not
# honoured. The hook is not guarded by cfn-careful (that guard only sees Bash
# tool calls), so a plain rm -f is fine here.
#
# Env: CFN_GIT_CONFIG_LOCK_SWEEP=off disables.
set -uo pipefail
trap 'exit 0' ERR
[ "${CFN_GIT_CONFIG_LOCK_SWEEP:-on}" = off ] && exit 0
command -v jq >/dev/null 2>&1 || exit 0
RAW=$(timeout 1 cat 2>/dev/null || true)
[ -n "$RAW" ] || exit 0
[ "$(printf '%s' "$RAW" | jq -r '.tool_name // empty' 2>/dev/null)" = Bash ] || exit 0
CMD=$(printf '%s' "$RAW" | jq -r '.tool_input.command // empty' 2>/dev/null)
CWD=$(printf '%s' "$RAW" | jq -r '.cwd // empty' 2>/dev/null)
[ -n "$CMD" ] || exit 0
[ -n "$CWD" ] || CWD=$PWD
case "$CMD" in *git*) ;; *) exit 0 ;; esac

resolve() { # base path -> absolute path ("" when not a dir)
  local base=$1 p=$2
  [ "$p" = "~" ] && p=$HOME
  [ "${p:0:2}" = "~/" ] && p=$HOME/${p:2}
  p=${p#[\"\']}; p=${p%[\"\']}
  case "$p" in /*) ;; *) p="$base/$p" ;; esac
  [ -d "$p" ] && (cd -P "$p" 2>/dev/null && pwd -P)
}

is_config_write() { # args after "git [global opts]"
  local sub=${1:-}; shift || true
  local a
  case "$sub" in
    worktree) case "${1:-}" in add|remove|prune|move|lock|unlock|repair) return 0 ;; esac ;;
    config)
      for a in "$@"; do
        case "$a" in --get|--get-all|--get-regexp|--get-urlmatch|--list|-l|get|list|--show-origin|--show-scope) return 1 ;; esac
      done
      return 0 ;;
    remote) case "${1:-}" in add|set-url|remove|rm|rename|set-head|set-branches) return 0 ;; esac ;;
    branch)
      for a in "$@"; do
        case "$a" in --set-upstream*|-u|--unset-upstream|-m|-M|-c|-C) return 0 ;; esac
      done ;;
    submodule) return 0 ;;
  esac
  return 1
}

swept=""
sweep() { # dir
  local d=$1 common lock
  common=$(git -C "$d" rev-parse --git-common-dir 2>/dev/null) || return 0
  case "$common" in /*) ;; *) common="$d/$common" ;; esac
  lock="$common/config.lock"
  [ -f "$lock" ] && [ ! -L "$lock" ] && [ ! -s "$lock" ] && [ -O "$lock" ] || return 0
  local mode; mode=$(stat -c '%a' "$lock" 2>/dev/null) || return 0
  (( (8#$mode & 8#222) == 0 )) || return 0
  case " $swept " in *" $lock "*) return 0 ;; esac
  if rm -f -- "$lock" 2>/dev/null; then
    swept="$swept $lock"
    echo "cfn-git-config-lock-sweep: removed stale read-only 0-byte $lock (sandbox leftover)" >&2
  fi
}

eff=$(resolve / "$CWD") || exit 0
[ -n "$eff" ] || exit 0
while IFS= read -r seg; do
  # shellcheck disable=SC2206
  tok=($seg)
  i=0; n=${#tok[@]}
  # leading env assignments
  while [ $i -lt $n ] && [[ "${tok[$i]}" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; do i=$((i+1)); done
  [ $i -lt $n ] || continue
  if [ "${tok[$i]}" = cd ]; then
    [ $((i+1)) -lt $n ] && { nd=$(resolve "$eff" "${tok[$((i+1))]}") && [ -n "$nd" ] && eff=$nd; }
    continue
  fi
  [ "${tok[$i]}" = git ] || continue
  i=$((i+1)); dir=$eff
  while [ $i -lt $n ]; do
    case "${tok[$i]}" in
      -C) [ $((i+1)) -lt $n ] || break; nd=$(resolve "$dir" "${tok[$((i+1))]}") || nd=""; dir=${nd:-}; i=$((i+2)); [ -n "$dir" ] || break ;;
      -c|--git-dir|--work-tree|--namespace) i=$((i+2)) ;;
      -*) i=$((i+1)) ;;
      *) break ;;
    esac
  done
  [ -n "$dir" ] && [ $i -lt $n ] || continue
  if is_config_write "${tok[@]:$i}"; then sweep "$dir"; fi
done < <(printf '%s\n' "$CMD" | sed -E 's/&&|\|\||;|\|/\n/g')
exit 0
