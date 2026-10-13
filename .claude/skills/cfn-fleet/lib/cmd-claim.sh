#!/usr/bin/env bash
# fleet claim WSxx <path...>
# Append repo-relative paths/globs to a row's claims. Refuses (exit 65) when a
# new path overlaps any OTHER row's claims: same path, one being a prefix
# directory of the other, or a glob whose directory scope overlaps. Globs are
# compared by their containing directory (e.g. 'docs/*.md' scopes to 'docs').
main(){
  local ws="${1:-}"
  [ -n "$ws" ] && [ $# -ge 2 ] || fleet_die 64 "usage: fleet claim WSxx <path...>"
  shift
  roster_exists "$ws" || fleet_die 65 "unknown workstream: $ws"

  # normalize + dedupe against the row's own claims
  local own
  own=$(roster_get "$ws" claims)
  local -a add=()
  local have=" $own " p joined
  for p in "$@"; do
    p="${p#./}"
    p="${p%/}"
    [ -n "$p" ] || continue
    case "$have" in *" $p "*) continue ;; esac
    have="$have$p "
    add+=("$p")
  done
  [ "${#add[@]}" -gt 0 ] || { echo "no new claims for $ws"; return 0; }

  # Read, overlap check and write share one roster lock: two concurrent claims
  # on the same path could otherwise both pass the check before either wrote.
  locked_claim "$ws" "$own" "${add[@]}"
}

# locked_claim WS OWN ADD...: exit 65 on overlap, else append ADD to the row.
# OWN is re-read under the lock so a concurrent claim on the same row is kept.
locked_claim(){
  local ws="$1" own="$2" f lock conflict joined
  shift 2
  f=$(fleet_roster_file)
  lock="$(dirname "$f")/.roster.lock"
  conflict=$(
    (
      flock -x 9 || exit 71
      if msg=$(_roster_claims_conflict "$ws" "$@"); then
        printf '%s' "$msg"
        exit 65
      fi
      own=$(roster_get "$ws" claims)
      joined="${own:+$own }$*"
      _roster_set_locked "$ws" claims "$joined" || exit 71
    ) 9>"$lock"
  ) && return 0
  case $? in
    65) fleet_die 65 "$conflict";;
    *)  fleet_die 71 "roster rewrite failed for $ws.claims";;
  esac
}
