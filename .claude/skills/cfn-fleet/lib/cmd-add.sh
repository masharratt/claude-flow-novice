#!/usr/bin/env bash
# fleet add WSxx "task text" [--name s] [--claims p1,p2] [--engine e]
# Register a workstream row: status=pending, heartbeat=0, remaining fields
# empty. Claims are comma-split and stored space-joined. Engine is validated
# against the registry (engines.sh); default is FLEET_DEFAULT_ENGINE from
# fleet.env, else claude-sub, and it is written to the roster's engine column
# (appended last). Duplicate or malformed WS id exits 65, unknown engine 65.
main(){
  local ws="" task="" name="" claims="" engine=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --name) [ $# -ge 2 ] || fleet_die 64 "--name needs a value"
              name="$2"; shift 2;;
      --name=*) name="${1#--name=}"; shift;;
      --claims) [ $# -ge 2 ] || fleet_die 64 "--claims needs a value"
                claims="$2"; shift 2;;
      --claims=*) claims="${1#--claims=}"; shift;;
      --engine) [ $# -ge 2 ] || fleet_die 64 "--engine needs a value"
                engine="$2"; shift 2;;
      --engine=*) engine="${1#--engine=}"; shift;;
      -h|--help) echo 'usage: fleet add WSxx "task text" [--name s] [--claims p1,p2] [--engine e]'; return 0;;
      *) if [ -z "$ws" ]; then ws="$1"
         elif [ -z "$task" ]; then task="$1"
         else fleet_die 64 "unexpected argument: $1"
         fi; shift;;
    esac
  done

  [ -n "$ws" ] && [ -n "$task" ] \
    || fleet_die 64 'usage: fleet add WSxx "task text" [--name s] [--claims p1,p2] [--engine e]'
  [[ "$ws" =~ ^WS[0-9]{2,}$ ]] || fleet_die 65 "bad WS id: '$ws' (expected WSxx, 2+ digits)"

  # keep the TSV parseable
  task="${task//$'\t'/ }"; task="${task//$'\n'/ }"
  name="${name//$'\t'/ }"; name="${name//$'\n'/ }"

  [ -n "$name" ] || name="$(printf '%s' "$ws" | tr '[:upper:]' '[:lower:]')"

  # Engine: explicit flag > FLEET_DEFAULT_ENGINE > claude-sub; validated
  # against the registry before any roster write (exit 65 on unknown).
  # Exact-line match in bash, not `list | grep -q`: grep -q exits on the first
  # match and SIGPIPEs the producer, which `set -o pipefail` turns into a
  # spurious validation failure.
  if [ -z "$engine" ]; then
    engine=$(fleet_engine_default)
  fi
  local known
  known=$'\n'"$(fleet_engine_list)"$'\n'
  if [[ "$known" != *$'\n'"$engine"$'\n'* ]]; then
    fleet_die 65 "unknown engine: $engine (known: $(fleet_engine_list 2>/dev/null | tr '\n' ' '))"
  fi

  # comma-split claims, trim edges only, drop empties, join with single spaces
  local c joined=""
  while IFS= read -r c || [ -n "$c" ]; do
    c="${c#"${c%%[![:space:]]*}"}"   # ltrim
    c="${c%"${c##*[![:space:]]}"}"   # rtrim
    [ -n "$c" ] || continue
    joined+="${joined:+ }$c"
  done < <(printf '%s' "$claims" | tr ',' '\n')

  local f lock
  f=$(fleet_roster_file)
  [ -f "$f" ] || fleet_die 64 "no roster at $f (fleet init first)"
  roster_exists "$ws" && fleet_die 65 "workstream already exists: $ws"
  lock="$(dirname "$f")/.roster.lock"
  (
    flock -x 9 || exit 71
    # migrate-on-first-write: an old-header roster gains the canonical header
    # (engine appended) and padded rows before the first append lands
    _roster_migrate_locked "$f" || exit 71
    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
      "$ws" "$name" "$task" "pending" "$joined" "" "" "" "0" "" "$engine" >> "$f" || exit 71
  ) 9>"$lock" || fleet_die 71 "roster append failed for $ws"
}
