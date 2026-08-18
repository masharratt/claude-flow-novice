#!/usr/bin/env bash
# index-all-projects.sh - Index all git/node/cargo projects sequentially
# Sequential to avoid WSL2 memory pressure

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILE_TYPES="${1:-rs,ts,tsx,js,jsx,py,sh,json,yaml,sql}"
QDRANT_URL="${CODESEARCH_QDRANT_URL:-http://localhost:6334}"
MEMGRAPH_URL="${CODESEARCH_MEMGRAPH_URL:-bolt://localhost:7689}"
SKIP_QDRANT="${SKIP_QDRANT:-false}"
SKIP_MEMGRAPH="${SKIP_MEMGRAPH:-false}"

# Find the binary
if command -v local-codesearch &>/dev/null; then
    BINARY="local-codesearch"
elif [[ -x "$HOME/.local/bin/local-codesearch" ]]; then
    BINARY="$HOME/.local/bin/local-codesearch"
else
    echo "Error: local-codesearch binary not found"
    exit 1
fi

# Connectivity checks
echo "Checking backend connectivity..."
if curl -sf --max-time 2 "${QDRANT_URL%:6334}:6333/collections" >/dev/null 2>&1; then
    echo "  Qdrant: reachable at $QDRANT_URL"
else
    echo "  Qdrant: NOT reachable at $QDRANT_URL"
    if [[ "$SKIP_QDRANT" != true ]]; then
        echo "  Set SKIP_QDRANT=true to skip, or fix Qdrant. Aborting."
        exit 1
    fi
fi

if nc -z "${MEMGRAPH_URL#bolt://}" 2>/dev/null || nc -z localhost 7689 2>/dev/null; then
    echo "  Memgraph: reachable at $MEMGRAPH_URL"
else
    echo "  Memgraph: NOT reachable at $MEMGRAPH_URL"
    if [[ "$SKIP_MEMGRAPH" != true ]]; then
        echo "  Set SKIP_MEMGRAPH=true to skip, or fix Memgraph. Aborting."
        exit 1
    fi
fi
echo ""

# Build extra args — always pass URLs explicitly
EXTRA_ARGS=""
if [[ "$SKIP_QDRANT" == true ]]; then
    EXTRA_ARGS="$EXTRA_ARGS --skip-qdrant"
else
    EXTRA_ARGS="$EXTRA_ARGS --qdrant-url $QDRANT_URL"
fi
if [[ "$SKIP_MEMGRAPH" == true ]]; then
    EXTRA_ARGS="$EXTRA_ARGS --skip-memgraph"
else
    EXTRA_ARGS="$EXTRA_ARGS --memgraph-url $MEMGRAPH_URL"
fi

indexed=0
skipped=0

for dir in ~/projects/*/; do
    # Only index directories that look like code projects
    if [[ -d "$dir/.git" || -f "$dir/package.json" || -f "$dir/Cargo.toml" ]]; then
        echo "Indexing: $dir"
        # Hard timeout per project: a hung backend blocks the client forever,
        # which would otherwise stall the whole sweep. Override via INDEX_TIMEOUT.
        if timeout --signal=KILL "${INDEX_TIMEOUT:-1800}" $BINARY --project-dir "$dir" $EXTRA_ARGS index --path . --types "$FILE_TYPES"; then
            ((indexed++))
        else
            rc=$?
            if [ "$rc" = "137" ]; then
                echo "  Warning: indexing TIMED OUT for $dir after ${INDEX_TIMEOUT:-1800}s (backend unreachable?)"
            else
                echo "  Warning: indexing failed for $dir (rc=$rc)"
            fi
        fi
    else
        ((skipped++))
    fi
done

echo ""
echo "Done: indexed $indexed projects, skipped $skipped non-project directories"
