#!/bin/bash
set -euo pipefail

# RuVector Codebase Semantic Search
#
# Searches indexed codebase using natural language queries.
# Returns ranked results with file paths, metadata, and relevance scores.
#
# Usage:
#   search.sh "authentication logic"
#   search.sh "React components for user profile" --top 10

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CONFIG_FILE="$SCRIPT_DIR/config.json"
EMBEDDINGS_JS="$SCRIPT_DIR/embeddings.js"

# Load configuration
RUVECTOR_DB_PATH=$(jq -r '.ruvectorDbPath' "$CONFIG_FILE")

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log_info() {
  echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $*"
}

# Parse arguments
QUERY=""
TOP_K=5

while [[ $# -gt 0 ]]; do
  case "$1" in
    --top)
      TOP_K="$2"
      shift 2
      ;;
    *)
      QUERY="$QUERY $1"
      shift
      ;;
  esac
done

QUERY=$(echo "$QUERY" | xargs) # Trim whitespace

if [[ -z "$QUERY" ]]; then
  log_error "Usage: search.sh <query> [--top N]"
  echo "Example: search.sh \"authentication logic\" --top 10"
  exit 1
fi

log_info "Searching for: \"$QUERY\""
log_info "Top results: $TOP_K"

# Check prerequisites
if ! command -v node &> /dev/null; then
  log_error "Node.js is not installed"
  exit 1
fi

if [[ -z "${OPENAI_API_KEY:-}" && -z "${ZAI_API_KEY:-}" ]]; then
  log_error "OPENAI_API_KEY or ZAI_API_KEY environment variable is required"
  exit 1
fi

# Generate query embedding
log_info "Generating query embedding..."
QUERY_EMBEDDING=$(node "$EMBEDDINGS_JS" "$QUERY") || {
  log_error "Failed to generate query embedding"
  exit 1
}

# Search RuVector database
log_info "Searching codebase index..."

SEARCH_RESULTS=$(node -e "
  import { getCollection, COLLECTIONS } from '$PROJECT_ROOT/docker/trigger-dev/src/lib/ruvector-init.ts';

  (async () => {
    try {
      const collection = getCollection(COLLECTIONS.CODEBASE_INDEX);

      const queryEmbedding = $QUERY_EMBEDDING;

      const results = await collection.search({
        vector: new Float32Array(queryEmbedding),
        k: $TOP_K,
      });

      console.log(JSON.stringify(results, null, 2));
    } catch (error) {
      console.error('Search failed:', error.message);
      process.exit(1);
    }
  })();
") || {
  log_error "Search failed"
  exit 1
}

# Parse and display results
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}   Search Results for: \"$QUERY\"${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo ""

echo "$SEARCH_RESULTS" | jq -r '.[] |
  "[\(.distance | tonumber | . * 100 | round / 100)]  \(.metadata.metadata.filePath)\n" +
  "    Purpose: \(.metadata.metadata.purpose // "N/A")\n" +
  "    Exports: \(.metadata.metadata.exports | join(", ") // "N/A")\n" +
  "    Lines: \(.metadata.metadata.lines), Complexity: \(.metadata.metadata.complexity)\n"
'

log_success "Search completed"

# Also output JSON for programmatic use
echo ""
echo -e "${CYAN}[JSON OUTPUT]${NC}"
echo "$SEARCH_RESULTS" | jq -c '.[] | {
  filePath: .metadata.metadata.filePath,
  relevance: .distance,
  purpose: .metadata.metadata.purpose,
  exports: .metadata.metadata.exports,
  lines: .metadata.metadata.lines,
  complexity: .metadata.metadata.complexity
}'
