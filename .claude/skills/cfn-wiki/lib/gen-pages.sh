#!/usr/bin/env bash
# Generate capability and directory pages from the shared resolved model.
# features_dir controls their output root. Curated text is retained on source
# changes; the original fingerprint keeps review-needed visible.
# shellcheck disable=SC1091
[ -n "${WIKI_MERGE_ENRICH_LOADED:-}" ] \
    || source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/merge-enrichment.sh"

wiki_config_features_dir() { # <repo> -> features_dir value
    local repo="$1" cfg="$repo/.wiki/config.json" configured=""
    if [ -f "$cfg" ]; then
        configured="$(sed -n 's/.*"features_dir"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$cfg" 2>/dev/null | head -1)"
    fi
    printf '%s' "${configured:-readme/wiki}"
}

wiki_gen_pages() {
    local lib pages_root
    lib="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    pages_root="$2/$(wiki_config_features_dir "$2")"
    if [ "${WIKI_ENRICH_READY:-0}" != 1 ]; then
        local -a pages=()
        if [ -d "$pages_root" ]; then
            mapfile -t pages < <(find "$pages_root" -name wiki.md -type f | sort)
        fi
        wiki_merge_enrich "$1" "$2/readme" "${pages[@]}" || return 1
    fi
    python3 "$lib/render_markdown.py" "$1" "$2" pages
}
