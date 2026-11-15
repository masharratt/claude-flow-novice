#!/usr/bin/env bash
# fleet claim WSxx <path...>
# Append repo-relative paths/globs to a row's claims. Refuses (exit 65) when a
# new path overlaps any OTHER active row's claims: same path, one being a
# prefix directory of the other, or a glob whose directory scope overlaps.
# Globs are compared by their containing directory ('docs/*.md' scopes to
# 'docs'). Rows in a released status (FLEET_RELEASED_STATUSES) never block.
#
# Paths must be canonical (_fleet_path_canonical): `a//b`, `a/./b`, `a/../b`,
# `.` and absolute paths are refused (65); one leading "./" and one trailing
# "/" are trimmed first.
#
# A host row has two claim stores: the roster (land's claims gate) and the
# lane's claims.txt on the host (its commit reads that, every commit). One
# grant path (lane-deliver.sh) checks and writes the roster under the roster
# lock (no ssh there), records the GRANTED notice as pending, then after the
# lock unions the roster claims into claims.txt, appends the notice to the
# lane's FROM_MASTER.md and nudges its pane. A failed delivery stays pending:
# `fleet sync` retries it, and so does rerunning `fleet claim` (also on paths
# the row already holds).
# Exit codes: 0 ok | 64 usage | 65 unknown ws, bad path or overlap | 66
# roster granted, host delivery pending | 71 roster write failed.

# shellcheck source=cmd-sync.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/cmd-sync.sh"

main(){
  local ws="${1:-}"
  [ -n "$ws" ] && [ $# -ge 2 ] || fleet_die 64 "usage: fleet claim WSxx <path...>"
  shift
  roster_exists "$ws" || fleet_die 65 "unknown workstream: $ws"

  # normalize + dedupe; ADD is what the roster lacks, REQ is every requested path
  local own host
  own=$(roster_get "$ws" claims)
  host=$(roster_get "$ws" host)
  local -a add=() req=()
  local have=" $own " seen=" " p
  local orig
  for orig in "$@"; do
    p="${orig#./}"
    p="${p%/}"
    _fleet_path_canonical "$p" \
      || fleet_die 65 "claim: '$orig' is not a canonical repo path (no leading /, no empty, . or .. segment); nothing claimed"
    case "$seen" in *" $p "*) continue ;; esac
    seen="$seen$p "
    req+=("$p")
    case "$have" in *" $p "*) continue ;; esac
    have="$have$p "
    add+=("$p")
  done
  if [ "${#add[@]}" -eq 0 ] && { [ -z "$host" ] || [ "${#req[@]}" -eq 0 ]; }; then
    echo "no new claims for $ws"
    return 0
  fi

  # Read, overlap check and write share one roster lock: two concurrent claims
  # on the same path could otherwise both pass the check before either wrote.
  locked_claim "$ws" "$own" "${req[@]}"
}

# locked_claim WS OWN PATH...: exit 65 on overlap, else grant PATHs through
# the shared grant path. OWN is kept for callers; the grant re-reads the row
# under the lock so a concurrent claim on the same row is kept.
locked_claim(){
  local ws="$1" f lock out rc=0
  shift 2
  f=$(fleet_roster_file)
  lock="$(dirname "$f")/.roster.lock"
  out=$(
    (
      flock -x 9 || exit 71
      _fleet_claim_grant_locked "$ws" "fleet claim" "$@"
    ) 9>"$lock"
  ) || rc=$?
  case "$rc" in
    0)  [ -z "$out" ] || printf '%s\n' "$out" ;;
    65) fleet_die 65 "$out" ;;
    *)  fleet_die 71 "roster rewrite failed for $ws.claims" ;;
  esac
  # Phase 2, lock released: deliver to the host lane (bounded ssh).
  rc=0
  _fleet_lane_settle "$ws" "$*" || rc=$?
  [ "$rc" -eq 0 ] || exit 66
  return 0
}
