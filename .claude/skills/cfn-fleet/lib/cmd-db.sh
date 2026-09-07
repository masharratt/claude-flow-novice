#!/usr/bin/env bash
# cfn-fleet lib/cmd-db.sh — scratch postgres containers per workstream.
#
# Real-run origin: junk rehearsal-DB class (run e59a7826). `db WSxx`
# provisions one postgres:16-alpine per workstream, labeled for this run dir
# so db-clean can reap exactly what the fleet created.
#
#   fleet db WSxx            provision or echo the existing DATABASE_URL
#   fleet db-clean [--all]   stop+rm this run's labeled containers (--all:
#                            every cfn-fleet-labeled container)
#
# Dispatch note: the router maps lib/cmd-<subcommand>.sh literally, so this
# file serves both "db" and "db-clean". main() accepts the subcommand either
# stripped (router style: main WSxx / main --all) or explicit (db / db-clean),
# so wiring `db-clean` here (router special-case or a one-line cmd-db-clean.sh
# shim sourcing this file) needs no change in this file.

main() {
  case "${1:-}" in
    db)       shift; _fleet_db_main "$@"; return 0 ;;
    db-clean) shift; _fleet_db_clean "$@"; return 0 ;;
  esac
  # Router-stripped form: infer from args (a ws id never starts with --).
  if [ $# -eq 0 ] || [ "${1:-}" = "--all" ]; then
    _fleet_db_clean "$@"
  else
    _fleet_db_main "$@"
  fi
}

_fleet_db_gate() {
  [ "$(fleet_env_get FLEET_DB)" = "docker" ] \
    || fleet_die 66 "db: FLEET_DB is not docker (set FLEET_DB=docker in fleet.env or fleet init --db docker)"
  command -v docker >/dev/null 2>&1 || fleet_die 66 "db: docker not available"
  docker info >/dev/null 2>&1 || fleet_die 66 "db: docker daemon not reachable"
}

_fleet_db_docker_present() {
  command -v docker >/dev/null 2>&1 || fleet_die 66 "db-clean: docker not available"
  docker info >/dev/null 2>&1 || fleet_die 66 "db-clean: docker daemon not reachable"
}

_fleet_db_main() {
  local ws="${1:-}"
  [ -n "$ws" ] || fleet_die 64 "usage: fleet db WSxx"
  roster_exists "$ws" || fleet_die 65 "db: $ws not in roster"
  _fleet_db_gate

  # Idempotent per WS: existing scratch_db wins, no new container.
  local existing
  existing=$(roster_get "$ws" scratch_db)
  if [ -n "$existing" ]; then
    echo "DATABASE_URL=$existing"
    return 0
  fi

  local base slug name
  base=$(basename "$(fleet_run_dir)")
  slug="${base#fleet-}"
  name="${slug}-${ws,,}"

  if docker ps -a --format '{{.Names}}' | grep -qxF "$name"; then
    docker start "$name" >/dev/null
  else
    docker run -d --name "$name" \
      --label "cfn-fleet=$base" \
      -e POSTGRES_USER=fleet -e POSTGRES_PASSWORD=fleet -e POSTGRES_DB=fleet \
      -P postgres:16-alpine >/dev/null
  fi

  local waited=0
  until docker exec "$name" pg_isready -U fleet -d fleet >/dev/null 2>&1; do
    sleep 1
    waited=$((waited + 1))
    if [ "$waited" -ge 30 ]; then
      fleet_die 71 "db: postgres in $name not ready after 30s"
    fi
  done

  local port
  port=$(docker port "$name" 5432/tcp 2>/dev/null | head -n1 | sed 's/.*://')
  [ -n "$port" ] || fleet_die 71 "db: could not read published port for $name"

  local url="postgres://fleet:fleet@127.0.0.1:${port}/fleet"
  roster_set "$ws" scratch_db "$url"
  echo "DATABASE_URL=$url"
}

_fleet_db_clean() {
  local all=0
  if [ "${1:-}" = "--all" ]; then
    all=1
    shift
  fi
  [ $# -eq 0 ] || fleet_die 64 "usage: fleet db-clean [--all]"
  # Cleanup is not gated on FLEET_DB: reaping what a fleet created must work
  # even after fleet.env was switched back to none.
  _fleet_db_docker_present

  local base
  base=$(basename "$(fleet_run_dir)")
  local filter="label=cfn-fleet=$base"
  [ "$all" -eq 1 ] && filter="label=cfn-fleet"

  local ids
  ids=$(docker ps -aq --filter "$filter")
  if [ -z "$ids" ]; then
    echo "db-clean: no matching containers"
    return 0
  fi
  # shellcheck disable=SC2086
  docker stop $ids >/dev/null
  # shellcheck disable=SC2086
  docker rm $ids >/dev/null
  # shellcheck disable=SC2086
  echo "db-clean: removed $(printf '%s\n' $ids | wc -l) container(s)"
}
