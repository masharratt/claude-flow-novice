#!/bin/bash
# index-code.sh - Index codebase using local-codesearch Rust binary
# This is a wrapper around the Rust binary for convenience

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Default values
PATH_TO_INDEX="."
FILE_TYPES="ts,tsx,js,jsx,py,sh,sql,rs"
HELP=false
QDRANT_URL="${CODESEARCH_QDRANT_URL:-http://localhost:6334}"
MEMGRAPH_URL="${CODESEARCH_MEMGRAPH_URL:-bolt://localhost:7689}"
MEMGRAPH_USER="${CODESEARCH_MEMGRAPH_USER:-}"
MEMGRAPH_PASSWORD="${CODESEARCH_MEMGRAPH_PASSWORD:-}"
SKIP_QDRANT=false
SKIP_MEMGRAPH=false
EXTRA_ARGS=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --path)
            PATH_TO_INDEX="$2"
            shift 2
            ;;
        --types)
            FILE_TYPES="$2"
            shift 2
            ;;
        --qdrant-url)
            QDRANT_URL="$2"
            shift 2
            ;;
        --memgraph-url)
            MEMGRAPH_URL="$2"
            shift 2
            ;;
        --skip-qdrant)
            SKIP_QDRANT=true
            shift
            ;;
        --skip-memgraph)
            SKIP_MEMGRAPH=true
            shift
            ;;
        --help|-h)
            HELP=true
            shift
            ;;
        *)
            if [[ -z "$PATH_TO_INDEX" || "$PATH_TO_INDEX" == "." ]]; then
                PATH_TO_INDEX="$1"
            fi
            shift
            ;;
    esac
done

# Show help
if [[ "$HELP" == true ]]; then
    cat << EOF
Usage: index-code [OPTIONS] [PATH]

Index codebase patterns using local-codesearch Rust binary

Arguments:
  PATH                    Path to directory to index (default: current directory)

Options:
  --path PATH            Path to directory to index
  --types TYPES          Comma-separated file types (default: ts,tsx,js,jsx,py,sh,sql,rs)
  --help, -h             Show this help

Database Location:
  ~/.local/share/codesearch/index_v2.db

Examples:
  index-code --path ~/projects/my-app
  index-code --types rs,py --path /path/to/project

EOF
    exit 0
fi

# Find the binary
if command -v local-codesearch &>/dev/null; then
    BINARY="local-codesearch"
elif [[ -x "$HOME/.local/bin/local-codesearch" ]]; then
    BINARY="$HOME/.local/bin/local-codesearch"
else
    echo "❌ Error: local-codesearch binary not found"
    echo "   Install with: ./scripts/install-codesearch-global.sh"
    exit 1
fi

# Convert to absolute path
PATH_TO_INDEX="$(cd "$PATH_TO_INDEX" 2>/dev/null && pwd)" || {
    echo "❌ Error: Directory not found: $PATH_TO_INDEX"
    exit 1
}

echo "🔍 Indexing code patterns in: $PATH_TO_INDEX"
echo "📄 File types: $FILE_TYPES"
echo "🗄️  Database: ~/.local/share/codesearch/index_v2.db"
echo ""

# Build extra args for Qdrant/Memgraph
if [[ "$SKIP_QDRANT" == true ]]; then
    EXTRA_ARGS="$EXTRA_ARGS --skip-qdrant"
else
    EXTRA_ARGS="$EXTRA_ARGS --qdrant-url $QDRANT_URL"
fi

if [[ "$SKIP_MEMGRAPH" == true ]]; then
    EXTRA_ARGS="$EXTRA_ARGS --skip-memgraph"
else
    EXTRA_ARGS="$EXTRA_ARGS --memgraph-url $MEMGRAPH_URL"
    [[ -n "$MEMGRAPH_USER" ]] && EXTRA_ARGS="$EXTRA_ARGS --memgraph-user $MEMGRAPH_USER"
    [[ -n "$MEMGRAPH_PASSWORD" ]] && EXTRA_ARGS="$EXTRA_ARGS --memgraph-password $MEMGRAPH_PASSWORD"
fi

# Run the indexer under a hard timeout. If a backend (qdrant/memgraph) is
# unreachable the client blocks forever — timeout kills it instead of hanging.
# 30min is generous for a manual whole-project index; override via INDEX_TIMEOUT.
INDEX_TIMEOUT="${INDEX_TIMEOUT:-1800}"
# --project-dir tags entities' project_root. Must equal the indexed path, else
# rows get tagged with the caller's cwd and /codebase-search (which filters by
# project_root) can't find them.
if ! timeout --signal=KILL "$INDEX_TIMEOUT" $BINARY --project-dir "$PATH_TO_INDEX" $EXTRA_ARGS index --path "$PATH_TO_INDEX" --types "$FILE_TYPES"; then
    rc=$?
    if [ "$rc" = "137" ]; then
        echo "❌ Indexing TIMED OUT after ${INDEX_TIMEOUT}s — check backends: docker ps | grep codesearch"
    else
        echo "❌ Indexing failed (rc=$rc)"
    fi
    exit "$rc"
fi

echo ""
echo "✅ Indexing complete!"
echo "💡 Query patterns with: sqlite3 ~/.local/share/codesearch/index_v2.db \"SELECT * FROM entities WHERE name LIKE '%keyword%';\""
