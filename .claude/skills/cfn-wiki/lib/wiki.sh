#!/usr/bin/env bash
# cfn-wiki dispatcher: wiki <command> [args]
#
# Contracts:
#   no args            -> usage on stderr, exit 2
#   unknown command    -> exit 64 (EX_USAGE)
#   known command with lib/<cmd>.sh present -> source it, call wiki_<cmd> "$@"
#   known command with missing implementation -> error on stderr, exit 69
#
# lib/wiki-env.sh is sourced unconditionally: it is the single exporter of
# CBM_CACHE_DIR / WIKI_PORT / CBM_BIN (see SKILL.md, Environment).
set -euo pipefail

WIKI_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=wiki-env.sh
source "$WIKI_LIB_DIR/wiki-env.sh"

# Commands this skill implements. lib/<cmd>.sh ships per phase; a missing file
# stubs until its phase lands.
WIKI_COMMANDS="doctor sync build serve lint stop import-existing"

wiki_usage() {
    cat >&2 <<EOF
usage: wiki <command> [args]

commands:
  doctor   verify CBM binary, cache-dir coherence, portal deps (--install fetches CBM)
  discover build the bounded discovery index (.wiki/discovery.sqlite) and print counts
  query    bounded, paginated queries: files | symbols | relations | candidates | span | graph
  work     durable documentation queue: plan | next | evidence | checkpoint | submit | review | promote | status | export | import | unblock | release | requeue
  migrate  explicit knowledge migration (only --to 2)
  coverage report inventory, explanation and review coverage with blocked areas
  sync     re-index + regenerate wiki projections (--check exits 1 on drift)
  build    build the portal into .wiki/portal/ (single self-contained page;
           --paged emits a small shell + pages/ + data/ for large repos,
           --static-out <dir> copies the paged distribution out)
  serve    serve the portal locally (port ${WIKI_PORT:-4885}); --stop to halt
  lint     lint generated wiki pages for contract violations
  stop     stop a running portal server
EOF
}

main() {
    if [ "$#" -eq 0 ]; then
        wiki_usage
        return 2
    fi

    local cmd="$1"
    shift

    if [ "$cmd" = stop ]; then
        source "$WIKI_LIB_DIR/serve.sh"
        wiki_serve "$@" --stop
        return $?
    fi
    if [ "$cmd" = import-existing ]; then
        source "$WIKI_LIB_DIR/import-existing.sh"
        wiki_import_existing "${1:-$PWD}"
        return $?
    fi
    if [ "$cmd" = discover ]; then
        # Phase 1 discovery: python-backed, thin wrapper (contracts section 6).
        exec python3 "$WIKI_LIB_DIR/discovery.py" discover "${1:-$PWD}"
    fi
    if [ "$cmd" = query ]; then
        if [ "$#" -lt 2 ]; then
            echo "wiki: query requires <repo> <kind> (files|symbols|relations|candidates|span|graph)" >&2
            wiki_usage
            return 64
        fi
        exec python3 "$WIKI_LIB_DIR/discovery.py" query "$@"
    fi
    if [ "$cmd" = work ]; then
        if [ "$#" -lt 2 ]; then
            echo "wiki: work requires a subcommand (plan|next|evidence|checkpoint|submit|review|promote|status|export|import|unblock|release|requeue) and <repo>" >&2
            wiki_usage
            return 64
        fi
        # Phase 2 durable work queue (contracts section 3); thin wrapper.
        exec python3 "$WIKI_LIB_DIR/work.py" "$@"
    fi
    if [ "$cmd" = migrate ]; then
        # Explicit knowledge migration only; never runs during sync/build.
        exec python3 "$WIKI_LIB_DIR/work.py" migrate "$@"
    fi
    if [ "$cmd" = coverage ]; then
        # Three separate coverage measures with exclusions (minimal Phase 2
        # report; the coverage UI lands in Phase 4).
        exec python3 "$WIKI_LIB_DIR/work.py" coverage "$@"
    fi
    case " $WIKI_COMMANDS " in
        *" $cmd "*)
            local impl="$WIKI_LIB_DIR/$cmd.sh"
            if [ ! -f "$impl" ]; then
                echo "wiki: missing implementation for '$cmd': lib/$cmd.sh" >&2
                return 69
            fi
            # shellcheck disable=SC1090
            source "$impl"
            "wiki_$cmd" "$@"
            ;;
        *)
            echo "wiki: unknown command '$cmd'" >&2
            wiki_usage
            return 64
            ;;
    esac
}

main "$@"
