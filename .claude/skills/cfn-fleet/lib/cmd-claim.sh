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

  # overlap check against every other row's claims. awk (not `IFS=$'\t' read`)
  # so rows with empty claims keep their field positions.
  local conflict="" ows oclaims oc opfx pp
  while IFS=$'\t' read -r ows oclaims; do
    [ "$ows" = "$ws" ] && continue
    for oc in $oclaims; do
      opfx=$(_claim_prefix "$oc")
      for p in "${add[@]}"; do
        pp=$(_claim_prefix "$p")
        if _paths_overlap "$pp" "$opfx"; then
          conflict="claim '$p' for $ws overlaps '$oc' owned by $ows"
          break 3
        fi
      done
    done
  done < <(awk -F'\t' 'NR > 1 && $5 != "" { print $1 "\t" $5 }' "$(fleet_roster_file)")
  [ -z "$conflict" ] || fleet_die 65 "$conflict"

  joined="${own:+$own }${add[*]}"
  roster_set "$ws" claims "$joined"
}

# Normalize a claim path/glob to its comparable scope prefix.
_claim_prefix(){
  local p="$1"
  p="${p#./}"
  p="${p%/}"
  case "$p" in
    *[\*\?\[]*) printf '%s\n' "$(dirname "$p")";;
    *)          printf '%s\n' "$p";;
  esac
}

# 0 when the two prefixes are equal or one is a directory-prefix of the other.
_paths_overlap(){
  local a="$1" b="$2"
  [ "$a" = "$b" ] && return 0
  case "/$b/" in "/$a/"*) return 0 ;; esac
  case "/$a/" in "/$b/"*) return 0 ;; esac
  return 1
}
