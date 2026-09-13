#!/usr/bin/env bash
# cfn-wiki environment — the SINGLE source of CBM_CACHE_DIR, WIKI_PORT, CBM_BIN.
#
# Every consumer (wiki.sh, cbm-index.sh, later sync/serve/doctor libs) sources
# this file and calls wiki_env_load; nothing else may export these vars. Split
# exports produce silent CBM CONNECTION_CLOSED failures — the exact failure
# mode `wiki doctor` exists to catch (plan: fuzzy-whistling-eich, Notes).
#
# wiki_env_load [repo] resolves, in order:
#   CBM_BIN:  $CBM_BIN env > <repo>/.wiki/config.json cbm_binary key
#             > $HOME/.local/share/cfn-wiki/codebase-memory-mcp > PATH lookup
#             > empty string (degraded; callers print the DEGRADED notice)
#   CBM_CACHE_DIR: pre-existing value honored; else $HOME/.cache/codebase-memory-mcp
#   WIKI_PORT: pre-existing value honored; else 4885 (documented in
#             ~/.claude/references/project-ports.md as the wiki portal port)
#
# Idempotent: WIKI_ENV_LOADED guards accidental double-sourcing.

WIKI_ENV_LOADED=1

wiki_env_load() {
    # $1 = optional repo path whose .wiki/config.json may pin cbm_binary
    local repo="${1:-$PWD}"
    local config="$repo/.wiki/config.json"

    # CBM cache dir: single source of truth. A pre-existing value wins because
    # an outer caller (doctor, CI) may deliberately point every consumer at
    # one shared cache; all consumers here must see the identical value.
    if [ -z "${CBM_CACHE_DIR:-}" ]; then
        export CBM_CACHE_DIR="${HOME:?wiki_env_load: HOME unset}/.cache/codebase-memory-mcp"
    fi

    export WIKI_PORT="${WIKI_PORT:-4885}"

    if [ -n "${CBM_BIN:-}" ]; then
        # 1. caller-provided binary wins outright
        :
    elif [ -f "$config" ]; then
        # 2. repo-level pin: .wiki/config.json {"cbm_binary": "..."}
        local configured=""
        configured="$(sed -n 's/.*"cbm_binary"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$config" 2>/dev/null | head -1)"
        if [ -n "$configured" ]; then
            export CBM_BIN="$configured"
        fi
    fi

    if [ -z "${CBM_BIN:-}" ] && [ -x "${HOME:-/nonexistent}/.local/share/cfn-wiki/codebase-memory-mcp" ]; then
        # 3. pinned local install (wiki doctor --install target)
        export CBM_BIN="$HOME/.local/share/cfn-wiki/codebase-memory-mcp"
    fi

    if [ -z "${CBM_BIN:-}" ] && command -v codebase-memory-mcp >/dev/null 2>&1; then
        # 4. PATH lookup (CBM derives project names from repo paths)
        export CBM_BIN="$(command -v codebase-memory-mcp)"
    fi

    if [ -z "${CBM_BIN:-}" ]; then
        # Degraded: nothing resolved. Empty, not unset — callers branch on it
        # and emit the visible DEGRADED notice instead of failing silently.
        export CBM_BIN=""
    fi
}
