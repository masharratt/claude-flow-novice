#!/usr/bin/env bash
# wiki dispatcher glue: `wiki build [repo] [--paged] [--static-out <dir>]`
# -> portal/build-portal.sh.
#
# The real implementation is wiki_build_portal <store> <repo> [out] (single
# self-contained page, the default) and wiki_build_portal_paged <store>
# <repo> [out-dir] (small shell + pages/ + data/) in portal/build-portal.sh;
# this wrapper only resolves the repo (default $PWD) and keeps the
# dispatcher contract (lib/<command>.sh) intact.

BUILD_GLUE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../portal/build-portal.sh
source "$BUILD_GLUE_DIR/../portal/build-portal.sh"

wiki_build() {
    local repo="" paged=0 static_out=""
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --paged) paged=1 ;;
            --static-out)
                if [ "$#" -lt 2 ] || [ -z "$2" ]; then
                    echo "wiki build: --static-out needs a directory value" >&2
                    return 64
                fi
                static_out="$2"
                shift
                ;;
            -*) echo "wiki build: unknown flag: $1" >&2; return 64 ;;
            *)
                if [ -n "$repo" ]; then
                    echo "wiki build: unexpected argument: $1" >&2
                    return 64
                fi
                repo="$1"
                ;;
        esac
        shift
    done
    [ -n "$repo" ] || repo="$PWD"
    if [ -n "$static_out" ] && [ "$paged" -ne 1 ]; then
        echo "wiki build: --static-out only applies to --paged builds" >&2
        return 64
    fi
    if [ ! -f "$repo/.wiki/store.json" ]; then
        echo "wiki build: no store at $repo/.wiki/store.json (run: wiki sync)" >&2
        return 1
    fi
    if [ "$paged" -eq 1 ]; then
        wiki_build_portal_paged "$repo/.wiki/store.json" "$repo" \
            "$repo/.wiki/portal" >/dev/null || return 1
        if [ -n "$static_out" ]; then
            mkdir -p "$static_out"
            cp -R "$repo/.wiki/portal/." "$static_out/" || return 1
            printf 'wiki build: static export at %s\n' "$static_out"
        fi
        return 0
    fi
    wiki_build_portal "$repo/.wiki/store.json" "$repo" \
        "$repo/.wiki/portal/index.html" >/dev/null
}
