#!/usr/bin/env bash
# cfn-wiki CBM indexing: run codebase-memory-mcp against a repo, then copy its
# sqlite cache into <repo>/.wiki/cache/cbm.db.
#
# The snapshot copy is load-bearing: CBM's journal mode is `delete`, so the
# portal and every wiki reader consume only the snapshot — never the live
# database (plan: fuzzy-whistling-eich, Notes).
#
# Contract: wiki_cbm_index <repo> [mode]
#   repo  target repo path (.wiki/ paths are relative to it)
#   mode  CBM index_repository mode: full | moderate | fast (default fast)
#
# Project naming (verified against CBM 0.10.8): CBM's own derivation is a slug
# of the FULL repo path, so the project name is pinned via index_repository's
# `name` param to the repo basename — the plan contract — keeping the cache db
# predictably at $CBM_CACHE_DIR/<basename>.db.
#
# Degraded mode: when wiki_env_load resolves no CBM binary, print the visible
# notice to stderr and exit 0 — git-only extraction takes over downstream
# (extract-features handles the no-snapshot path in Phase 2).

# shellcheck disable=SC1091
[ -n "${WIKI_ENV_LOADED:-}" ] || source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/wiki-env.sh"

wiki_cbm_index() {
    local repo="${1:?wiki_cbm_index: repo path required}"
    local mode="${2:-fast}"

    wiki_env_load "$repo"

    if [ -z "${CBM_BIN:-}" ]; then
        echo "DEGRADED: CBM not installed; git-only extraction" >&2
        return 0
    fi

    # Pin project name to the repo basename (see header: CBM's derived name is
    # a full-path slug, which would break the cache-db path contract).
    local project
    project="$(basename "$repo")"

    if ! "$CBM_BIN" cli --progress index_repository --repo-path "$repo" --mode "$mode" --name "$project"; then
        echo "wiki: CBM index failed for $repo (binary: $CBM_BIN)" >&2
        return 1
    fi

    # Verify via list_projects (JSON via the global --json flag) before
    # trusting the snapshot copy.
    local src="$CBM_CACHE_DIR/$project.db"
    if [ ! -f "$src" ]; then
        local listed=""
        listed="$("$CBM_BIN" cli --json list_projects 2>/dev/null || true)"
        if printf '%s' "$listed" | grep -q "\"$project\""; then
            echo "wiki: project '$project' listed by CBM but db missing at $src" >&2
        else
            echo "wiki: CBM project '$project' not found in list_projects or cache ($src)" >&2
        fi
        return 1
    fi

    mkdir -p "$repo/.wiki/cache"
    cp "$src" "$repo/.wiki/cache/cbm.db"
    echo "wiki: indexed $repo (mode=$mode) -> .wiki/cache/cbm.db"
}
