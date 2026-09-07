#!/usr/bin/env bash
# cfn-fleet lib/cmd-spawn.sh — launch the worker session(s) for a workstream.
#
# Real-run origin: spare sessions back compaction restarts (run e59a7826).
# Contract: SPEC-cfn-fleet.md section C. lib/common.sh is sourced first (by
# cli/fleet); the command runs with cwd inside the target project repo.
#
#   fleet spawn WSxx [--spares N] [--no-tmux] [--dry-run]
#
# Modes:
#   default    start tmux sessions (name = roster name, brief as first prompt)
#   --no-tmux  echo copy-paste launch commands instead of running tmux
#   --dry-run  echo the plan only; mutates nothing (no worktree, no roster)
# Main-in-place default: session cwd = repo root. FLEET_WORKTREE=on: session
# cwd = a dedicated git worktree on branch fleet/<WSxx>; claims stay in the
# shared roster. Roster is updated (status=started, heartbeat=now) for real
# spawns, including --no-tmux (launch is manual but the spawn is real).

main() {
  local ws="" spares=0 no_tmux=0 dry_run=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --spares)
        [ $# -ge 2 ] || fleet_die 64 "spawn: --spares needs a number"
        spares="$2"; shift 2 ;;
      --no-tmux) no_tmux=1; shift ;;
      --dry-run) dry_run=1; shift ;;
      -*)
        fleet_die 64 "spawn: unknown option $1" ;;
      *)
        [ -z "$ws" ] || fleet_die 64 "spawn: unexpected argument $1"
        ws="$1"; shift ;;
    esac
  done
  [ -n "$ws" ] || fleet_die 64 "usage: fleet spawn WSxx [--spares N] [--no-tmux] [--dry-run]"
  [[ "$spares" =~ ^[0-9]+$ ]] || fleet_die 64 "spawn: --spares expects a number"

  local run_dir
  run_dir=$(fleet_run_dir)
  roster_exists "$ws" || fleet_die 65 "spawn: $ws not in roster (fleet add first)"
  local brief="$run_dir/briefs/$ws.md"
  [ -f "$brief" ] || fleet_die 65 "spawn: missing brief $brief (write briefs/$ws.md first)"

  local name
  name=$(roster_get "$ws" name)
  [ -n "$name" ] || name="${ws,,}"

  local repo
  repo=$(git rev-parse --show-toplevel 2>/dev/null) \
    || fleet_die 64 "spawn: not inside a git repo (run from the target project)"

  local worktree=0
  [ "$(fleet_env_get FLEET_WORKTREE)" = "on" ] && worktree=1

  local wt_path="$repo/.claude/worktrees/${ws,,}" branch="fleet/$ws" session_cwd="$repo"

  if [ "$worktree" -eq 1 ] && [ "$dry_run" -eq 0 ]; then
    if ! git -C "$repo" worktree list --porcelain | grep -qxF "worktree $wt_path"; then
      if git -C "$repo" show-ref --verify --quiet "refs/heads/$branch"; then
        git -C "$repo" worktree add "$wt_path" "$branch" >/dev/null
      else
        git -C "$repo" worktree add "$wt_path" -b "$branch" >/dev/null
      fi
    fi
  fi
  [ "$worktree" -eq 1 ] && session_cwd="$wt_path"

  if [ "$dry_run" -eq 1 ]; then
    echo "PLAN spawn $ws name=$name cwd=$session_cwd brief=$brief"
    if [ "$worktree" -eq 1 ]; then
      echo "PLAN worktree $ws path=$wt_path branch=$branch"
    fi
    local k
    for ((k = 1; k <= spares; k++)); do
      echo "PLAN spare $name-spare$k cwd=$session_cwd"
    done
    return 0
  fi

  local k
  if [ "$no_tmux" -eq 1 ]; then
    echo "tmux new-session -d -s $name -c $session_cwd"
    echo "tmux send-keys -t $name -l \"\$(< $brief)\""
    echo "tmux send-keys -t $name Enter"
    for ((k = 1; k <= spares; k++)); do
      echo "tmux new-session -d -s $name-spare$k -c $session_cwd"
    done
  else
    command -v tmux >/dev/null 2>&1 \
      || fleet_die 66 "spawn: tmux not available (use --no-tmux for copy-paste commands)"
    tmux new-session -d -s "$name" -c "$session_cwd"
    tmux send-keys -t "$name" -l "$(cat "$brief")"
    tmux send-keys -t "$name" Enter
    for ((k = 1; k <= spares; k++)); do
      tmux new-session -d -s "$name-spare$k" -c "$session_cwd"
    done
  fi

  roster_set "$ws" status started
  roster_set "$ws" heartbeat "$(date +%s)"
  echo "spawn $ws: status=started${spares:+, spares=$spares}"
  return 0
}
