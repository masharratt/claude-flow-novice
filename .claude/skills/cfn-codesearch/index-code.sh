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
MEMGRAPH_URL="${CODESEARCH_MEMGRAPH_URL:-bolt://localhost:7687}"
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

# Run the indexer
$BINARY $EXTRA_ARGS index --path "$PATH_TO_INDEX" --types "$FILE_TYPES"

echo ""
echo "✅ Indexing complete!"
echo "💡 Query patterns with: sqlite3 ~/.local/share/codesearch/index_v2.db \"SELECT * FROM entities WHERE name LIKE '%keyword%';\""
