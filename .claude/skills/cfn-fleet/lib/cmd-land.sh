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

# Host rows: the worker ran on a server and commits only in its worktree (its
# sandbox cannot write the bare repo), so land fetches the lane branch from
# the server fleet clone over ssh and the base from the bare repo. host.sh
# carries the ssh transport.
if ! command -v _fleet_host_run >/dev/null 2>&1; then
    # shellcheck disable=SC1091
    source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/host.sh"
fi

# Scratch refs the fetched worker branch and its base live under; removed on
# every exit path of remote_land so no stale ref outlives a refused land.
_land_scratch_ref() { printf 'refs/fleet-remote/%s/%s\n' "$1" "$2"; }

# _land_msg_args WS: sets _LAND_MSG_SUBJECT and _LAND_MSG_BODY for a --no-ff
# merge commit. Subject: "fleet: land WSxx: <first task line, ~60 chars>".
# Body: the full roster task and the worker name, so `git log` says what the
# lane was for without opening the roster.
_LAND_SUBJECT_TASK_MAX=60
_land_msg_args() {
    local ws="$1" task name first
    task=$(roster_get "$ws" task)
    name=$(roster_get "$ws" name)
    first="${task%%$'\n'*}"
    if [ "${#first}" -gt "$_LAND_SUBJECT_TASK_MAX" ]; then
        first="${first:0:$_LAND_SUBJECT_TASK_MAX}..."
    fi
    _LAND_MSG_SUBJECT="fleet: land $ws${first:+: $first}"
    _LAND_MSG_BODY="Task: ${task:-(none recorded)}"$'\n\n'"Worker: ${name:-$ws}"
}

# remote_land REPO WS NO_FF: merge a host row's fleet/<WS> into REPO's current
# branch. Order matters: the remote worktree is checked clean BEFORE the fetch
# (uncommitted work there would be lost with the worktree), and the claims gate
# runs BEFORE the merge. Reads remote/<WS>.env (written by `fleet spawn --host`).
# The lane comes from <host>:<FLEET_REMOTE_CLONE> (env files from before that
# key fall back to ~/fleet-repos/<project>), the base from the Mac git remote.
# On success the lane tip's full sha goes to the roster's lane_sha.
# Exit codes: 65 no env file / missing worktree / unclaimed files, 66 remote
# worktree dirty, 69 host unreachable, 70 fetch or merge failed.
remote_land() {
  local repo="$1" ws="$2" no_ff="$3"
  local rd envf
  rd=$(fleet_run_dir)
  envf="$rd/remote/$ws.env"
  [ -f "$envf" ] || fleet_die 65 "land: $ws is a host row but $envf is missing (nothing to fetch)"
  local FLEET_HOST="" FLEET_GIT_REMOTE="" FLEET_PROJECT="" FLEET_REMOTE_WT="" FLEET_BRANCH="" FLEET_BASE_REF=""
  local FLEET_REMOTE_CLONE=""
  # shellcheck disable=SC1090
  . "$envf"
  [ -n "$FLEET_HOST" ] && [ -n "$FLEET_REMOTE_WT" ] && [ -n "$FLEET_BRANCH" ] && [ -n "$FLEET_BASE_REF" ] \
    && { [ -n "$FLEET_REMOTE_CLONE" ] || [ -n "$FLEET_PROJECT" ]; } \
    || fleet_die 65 "land: $envf is incomplete (need FLEET_HOST, FLEET_REMOTE_WT, FLEET_BRANCH, FLEET_BASE_REF, and FLEET_REMOTE_CLONE or FLEET_PROJECT)"
  local remote="${FLEET_GIT_REMOTE:-$FLEET_HOST}"
  # scp-style ssh URL: a relative path resolves from the server login home.
  local lane_url="$FLEET_HOST:${FLEET_REMOTE_CLONE:-fleet-repos/$FLEET_PROJECT}"

  local dirty rc=0
  dirty=$(_fleet_host_run "$FLEET_HOST" git -C "$FLEET_REMOTE_WT" status --porcelain --untracked-files=all 2>/dev/null) || rc=$?
  if [ "$rc" -eq "$_FLEET_SSH_FAIL_RC" ] || [ "$rc" -eq "$_FLEET_TIMEOUT_RC" ]; then
    fleet_die 69 "land: cannot reach host $FLEET_HOST (rc $rc); nothing was merged"
  fi
  [ "$rc" -eq 0 ] || fleet_die 65 "land: remote worktree $FLEET_REMOTE_WT on $FLEET_HOST is not usable (rc $rc)"
  # Tracked edits or staged changes refuse. Untracked files inside the row's
  # claims are forgotten work and refuse; untracked files elsewhere (sandbox
  # placeholders and the like) only warn.
  local tracked_dirty="" untr_in="" untr_out="" dl dpath dclaims
  dclaims=$(roster_get "$ws" claims)
  while IFS= read -r dl; do
    [ -n "$dl" ] || continue
    if [ "${dl:0:2}" = "??" ]; then
      dpath="${dl:3}"
      if _fleet_path_claimed "$dpath" "$dclaims"; then
        untr_in="$untr_in${untr_in:+ }$dpath"
      else
        untr_out="$untr_out${untr_out:+ }$dpath"
      fi
    else
      tracked_dirty="$tracked_dirty${tracked_dirty:+ }${dl:3}"
    fi
  done <<< "$dirty"
  [ -z "$tracked_dirty" ] \
    || fleet_die 66 "land: remote worktree $FLEET_REMOTE_WT on $FLEET_HOST has uncommitted changes; commit or clean first: $tracked_dirty"
  [ -z "$untr_in" ] \
    || fleet_die 66 "land: remote worktree $FLEET_REMOTE_WT on $FLEET_HOST has untracked files inside the claims of $ws (work the worker forgot to commit); commit or remove them: $untr_in"
  [ -z "$untr_out" ] \
    || echo "WARN land: $ws has untracked files outside its claims on $FLEET_HOST (left behind, worktree will be force-removed): $untr_out" >&2

  local head_ref base_ref
  head_ref=$(_land_scratch_ref "$ws" head)
  base_ref=$(_land_scratch_ref "$ws" base)
  # "-d" is quoted on purpose: the portability scan reads an unquoted
  # `update-ref ... -d` as GNU `date -d`, and git has no long form for it.
  _land_drop_refs() { git -C "$repo" update-ref "-d" "$head_ref" 2>/dev/null; git -C "$repo" update-ref "-d" "$base_ref" 2>/dev/null; return 0; }
  local errf="${TMPDIR:-/tmp}/fleet-land-fetch.$$" why
  if ! git -C "$repo" fetch -q "$lane_url" "+refs/heads/$FLEET_BRANCH:$head_ref" 2>"$errf"; then
    why=$(cat "$errf" 2>/dev/null); rm -f "$errf"
    _land_drop_refs
    fleet_die 70 "land: git fetch $lane_url $FLEET_BRANCH (the lane, from the server fleet clone) failed: $why"
  fi
  if ! git -C "$repo" fetch -q "$remote" "+refs/heads/$FLEET_BASE_REF:$base_ref" 2>"$errf"; then
    why=$(cat "$errf" 2>/dev/null); rm -f "$errf"
    _land_drop_refs
    fleet_die 70 "land: git fetch $remote $FLEET_BASE_REF (the base) failed: $why"
  fi
  rm -f "$errf"
  local lane_sha
  lane_sha=$(git -C "$repo" rev-parse "$head_ref")

  # Claims gate: the worker's whole diff against its base must sit inside the
  # row's claims, or another lane's files ride this landing.
  local claims f unclaimed=""
  claims=$(roster_get "$ws" claims)
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    _fleet_path_claimed "$f" "$claims" || unclaimed="$unclaimed${unclaimed:+ }$f"
  done < <(git -C "$repo" diff --name-only "$base_ref..$head_ref")
  if [ -n "$unclaimed" ]; then
    _land_drop_refs
    fleet_die 65 "land: $FLEET_BRANCH changes files outside the claims of $ws; claim them or drop them: $unclaimed"
  fi

  local mrc=0
  if [ "$no_ff" -eq 1 ]; then
    _land_msg_args "$ws"
    git -C "$repo" merge --no-ff "$head_ref" -m "$_LAND_MSG_SUBJECT" -m "$_LAND_MSG_BODY" >/dev/null || mrc=$?
  else
    git -C "$repo" merge --ff-only "$head_ref" >/dev/null || mrc=$?
  fi
  _land_drop_refs
  [ "$mrc" -eq 0 ] || fleet_die 70 "land: merge of $FLEET_BRANCH into the current branch failed (rc $mrc); remote state left as is"
  roster_set "$ws" lane_sha "$lane_sha"
}

# remote_cleanup WS: after a successful land, close the server tmux session,
# drop the server worktree, the
# clone's fleet/<WS> + fleet-base/<WS> branches and the bare repo's
# fleet-base/<WS>, then the Mac-side env/applied files. A bare fleet/<WS> only
# exists for lanes spawned before workers stopped pushing; it is dropped
# quietly when present. Best effort: the merge already happened, so a cleanup
# failure only warns.
remote_cleanup() {
  local ws="$1" rd envf
  rd=$(fleet_run_dir)
  envf="$rd/remote/$ws.env"
  local FLEET_HOST="" FLEET_PROJECT="" FLEET_REMOTE_WT="" FLEET_BRANCH="" FLEET_BASE_REF=""
  local FLEET_SOCK="" FLEET_SESSION=""
  # shellcheck disable=SC1090
  . "$envf"
  # The lane is merged, so its server session has nothing left to do. Close it
  # before removing the worktree it runs in. Already gone is fine.
  if [ -n "$FLEET_SOCK" ] && [ -n "$FLEET_SESSION" ]; then
    _fleet_tmux "$FLEET_HOST" -L "$FLEET_SOCK" kill-session -t "$FLEET_SESSION" >/dev/null 2>&1 || true
  fi
  # Server-side paths use $HOME, so the script must expand on the server.
  if ! _fleet_host_run "$FLEET_HOST" bash -c '
      clone="$HOME/fleet-repos/$1"; bare="$HOME/git/$1.git"; wt="$2"; br="$3"; base="$4"; rc=0
      # --force only on the recorded disposable worktree under ~/fleet-repos.
      case "$wt" in "$HOME"/fleet-repos/?*) git -C "$clone" worktree remove --force "$wt" || rc=1 ;; *) rc=1 ;; esac
      git -C "$clone" worktree prune
      git -C "$clone" branch -D "$br" >/dev/null 2>&1
      git -C "$clone" branch -D "$base" >/dev/null 2>&1
      git -C "$bare" branch -D "$base" >/dev/null || rc=1
      git -C "$bare" branch -D "$br" >/dev/null 2>&1
      exit $rc' _ "$FLEET_PROJECT" "$FLEET_REMOTE_WT" "$FLEET_BRANCH" "$FLEET_BASE_REF" >/dev/null 2>&1; then
    echo "warning: land: server cleanup for $ws incomplete on $FLEET_HOST (merge is done); remove $FLEET_REMOTE_WT and the $FLEET_BRANCH/$FLEET_BASE_REF branches by hand" >&2
  fi
  rm -f "$envf" "$rd/remote/$ws.applied"
}

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
  # A spawning row has no commits to land yet and may still fail back to
  # pending; landing it would orphan the launch in progress.
  [ "$(roster_get "$ws" status)" != "spawning" ] \
    || fleet_die 66 "land: $ws is still spawning; wait for the spawn to finish (fleet status), then land"

  local repo
  repo=$(git rev-parse --show-toplevel 2>/dev/null) \
    || fleet_die 64 "land: not inside a git repo (run from the target project)"

  # Repo-relative run-dir path, for the control-plane exclusion in the guard.
  local run_dir=""
  run_dir=$(fleet_run_dir 2>/dev/null || true)
  local run_dir_under_repo=0
  if [ -n "$run_dir" ]; then
    # git reports the physical toplevel; resolve symlinks (macOS /var ->
    # /private/var) so the prefix match below holds.
    run_dir=$(cd "$run_dir" && pwd -P)
    # shellcheck disable=SC2053
    [[ "$run_dir/" == "$repo/"* ]] && run_dir_under_repo=1
  fi

  local host
  host=$(roster_get "$ws" host)
  if [ -n "$host" ]; then
    remote_land "$repo" "$ws" "$no_ff"
  elif [ "$(fleet_env_get FLEET_WORKTREE)" = "on" ]; then
    local wt branch="fleet/$ws"
    wt=$(fleet_worktree_path "$repo" "$ws")
    [ -d "$wt" ] || fleet_die 65 "land: no worktree at $wt (nothing to merge)"
    [ -z "$(git -C "$wt" status --porcelain)" ] \
      || fleet_die 66 "land: worktree $wt has uncommitted changes; commit or clean first"
    if [ "$no_ff" -eq 1 ]; then
      _land_msg_args "$ws"
      git -C "$repo" merge --no-ff "$branch" -m "$_LAND_MSG_SUBJECT" -m "$_LAND_MSG_BODY" >/dev/null
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
  [ -z "$host" ] || remote_cleanup "$ws"

  # Residual-disposition sweep (fleet-nitpicky-fixes process change): landing
  # a lane orphans later residuals by design, so surface handoffs/ files
  # addressed to this workstream for the master to dispatch or record open.
  # Best effort only: an absent or unreadable handoffs dir is skipped silently
  # and can never fail the land.
  if [ -n "$run_dir" ]; then
    local handoffs="$run_dir/handoffs"
    if [ -d "$handoffs" ] && [ -r "$handoffs" ]; then
      local f base lc name_lc
      name_lc=$(roster_get "$ws" name)
      name_lc="${name_lc,,}"
      for f in "$handoffs"/*; do
        [ -f "$f" ] || continue
        base="${f##*/}"
        lc="${base,,}"
        # shellcheck disable=SC2053
        if [[ "$lc" == *"${ws,,}"* ]] \
          || { [ -n "$name_lc" ] && [[ "$lc" == *"$name_lc"* ]]; }; then
          echo "residual: $base (dispatch or record open)"
        fi
      done
    fi
  fi
}
