#!/usr/bin/env bash
# Generate projections from resolved enrichment and authored knowledge.
WIKI_GENERATE_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$WIKI_GENERATE_LIB/merge-enrichment.sh"
wiki_gen_projections() {
    if [ "${WIKI_ENRICH_READY:-0}" != 1 ]; then
        wiki_merge_enrich "$1" "$2/readme" || return 1
    fi
    python3 "$WIKI_GENERATE_LIB/render_markdown.py" "$1" "$2" projections
}
