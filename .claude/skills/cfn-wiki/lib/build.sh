#!/usr/bin/env bash
# wiki dispatcher glue: `wiki build [repo]` -> portal/build-portal.sh.
# The real implementation is wiki_build_portal <store> <repo> [out] in
# portal/build-portal.sh; this wrapper only resolves the repo (default $PWD)
# and keeps the dispatcher contract (lib/<command>.sh) intact.

BUILD_GLUE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../portal/build-portal.sh
source "$BUILD_GLUE_DIR/../portal/build-portal.sh"

wiki_build() {
    local repo="$PWD"
    if [ "$#" -gt 0 ] && [ "${1#-}" = "$1" ] && [ -d "$1" ]; then
        repo="$1"
    fi
    if [ ! -f "$repo/.wiki/store.json" ]; then
        echo "wiki build: no store at $repo/.wiki/store.json (run: wiki sync)" >&2
        return 1
    fi
    wiki_build_portal "$repo/.wiki/store.json" "$repo" \
        "$repo/.wiki/portal/index.html" >/dev/null
}
