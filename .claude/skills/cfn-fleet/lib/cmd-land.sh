#!/usr/bin/env bash
# cfn-fleet lib/cmd-land.sh — merge/record a workstream as landed.
#
# Real-run origin guard class: unclaimed dirty files swept into another
# session's landing (FormField incident, run e59a7826). Main mode refuses
# them with 66 (same logic as the commit guard). Worktree mode merges
# fleet/<WSxx> into the current branch (ff-only default, --no-ff flag),
# removes the worktree, and records landed_sha.
#
#   fleet land WSxx [--no-ff]

# Claim matcher + unclaimed-dirty scan live in lib/common.sh (shared with
# cmd-commit.sh so both guards behave identically).

if ! command -v fleet_die >/dev/null 2>&1; then
    # Standalone/test sourcing: pull in the shared roster helpers.
    # shellcheck disable=SC1091
    source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"
fi

main() {
  local ws="" no_ff=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --no-ff) no_ff=1; shift ;;
      -*)
        fleet_die 64 "land: unknown option $1" ;;
      *)
        [ -z "$ws" ] || fleet_die 64 "land: unexpected argument $1"
        ws="$1"; shift ;;
    esac
  done
  [ -n "$ws" ] || fleet_die 64 "usage: fleet land WSxx [--no-ff]"
  roster_exists "$ws" || fleet_die 65 "land: $ws not in roster"

  local repo
  repo=$(git rev-parse --show-toplevel 2>/dev/null) \
    || fleet_die 64 "land: not inside a git repo (run from the target project)"

  # Repo-relative run-dir path, for the control-plane exclusion in the guard.
  local run_dir=""
  run_dir=$(fleet_run_dir 2>/dev/null || true)
  local run_dir_under_repo=0
  if [ -n "$run_dir" ]; then
    # shellcheck disable=SC2053
    [[ "$run_dir/" == "$repo/"* ]] && run_dir_under_repo=1
  fi

  if [ "$(fleet_env_get FLEET_WORKTREE)" = "on" ]; then
    local wt="$repo/.claude/worktrees/${ws,,}" branch="fleet/$ws"
    [ -d "$wt" ] || fleet_die 65 "land: no worktree at $wt (nothing to merge)"
    [ -z "$(git -C "$wt" status --porcelain)" ] \
      || fleet_die 66 "land: worktree $wt has uncommitted changes; commit or clean first"
    if [ "$no_ff" -eq 1 ]; then
      git -C "$repo" merge --no-ff "$branch" -m "fleet: land $ws" >/dev/null
    else
      git -C "$repo" merge --ff-only "$branch" >/dev/null
    fi
    git -C "$repo" worktree remove "$wt" >/dev/null
  else
    local claims
    claims=$(roster_get "$ws" claims)
    local run_dir_rel=""
    [[ "$run_dir_under_repo" == 1 ]] && run_dir_rel="${run_dir#"$repo"/}"
    local unclaimed
    unclaimed=$(_fleet_unclaimed_dirty "$claims" "$run_dir_rel")
    if [ -n "$unclaimed" ]; then
      fleet_die 66 "land: unclaimed dirty files present; claim them or clean first: $unclaimed"
    fi
  fi

  local sha
  sha=$(git -C "$repo" rev-parse --short HEAD)
  roster_set "$ws" landed_sha "$sha"
  roster_set "$ws" status landed
  echo "landed $ws $sha"
}
