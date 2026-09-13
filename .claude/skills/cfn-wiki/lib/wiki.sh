#!/usr/bin/env bash
# cfn-wiki dispatcher: wiki <command> [args]
#
# Contracts:
#   no args            -> usage on stderr, exit 2
#   unknown command    -> exit 64 (EX_USAGE)
#   known command with lib/<cmd>.sh present -> source it, call wiki_<cmd> "$@"
#   known command with no impl file yet     -> stub notice on stderr, exit 0
#
# lib/wiki-env.sh is sourced unconditionally: it is the single exporter of
# CBM_CACHE_DIR / WIKI_PORT / CBM_BIN (see SKILL.md, Environment).
set -euo pipefail

WIKI_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=wiki-env.sh
source "$WIKI_LIB_DIR/wiki-env.sh"

# Commands this skill implements. lib/<cmd>.sh ships per phase; a missing file
# stubs until its phase lands.
WIKI_COMMANDS="doctor sync build serve lint stop"

wiki_usage() {
    cat >&2 <<EOF
usage: wiki <command> [args]

commands:
  doctor   verify CBM binary, cache-dir coherence, portal deps (--install fetches CBM)
  sync     re-index + regenerate wiki projections (--check exits 1 on drift)
  build    build self-contained portal HTML into .wiki/portal/
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

    case " $WIKI_COMMANDS " in
        *" $cmd "*)
            local impl="$WIKI_LIB_DIR/$cmd.sh"
            if [ ! -f "$impl" ]; then
                echo "wiki: '$cmd' not implemented yet (stub; lib/$cmd.sh missing)" >&2
                return 0
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
