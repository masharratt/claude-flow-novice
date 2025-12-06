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

# Load configuration - resolve relative path from PROJECT_ROOT
RUVECTOR_DB_PATH_CONFIG=$(jq -r '.ruvectorDbPath' "$CONFIG_FILE")
# If path starts with ./, resolve it relative to PROJECT_ROOT
if [[ "$RUVECTOR_DB_PATH_CONFIG" == ./* ]]; then
  RUVECTOR_DB_PATH="$PROJECT_ROOT/${RUVECTOR_DB_PATH_CONFIG#./}"
else
  RUVECTOR_DB_PATH="$RUVECTOR_DB_PATH_CONFIG"
fi

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

# Search RuVector database using search.js
log_info "Searching codebase index..."

# Run from skill directory to use local node_modules/@ruvector/core
# (project root has a stub module that doesn't work)
# Note: search.js expects RUVECTOR_DB_PATH to end with /ruvector.db
RAW_OUTPUT=$(cd "$SCRIPT_DIR" && RUVECTOR_DB_PATH="$RUVECTOR_DB_PATH/ruvector.db" npx tsx search.js "$QUERY_EMBEDDING" "$TOP_K" 2>&1)
SEARCH_EXIT=$?
if [[ $SEARCH_EXIT -ne 0 ]]; then
  log_error "Search failed (exit $SEARCH_EXIT)"
  echo "$RAW_OUTPUT" >&2
  exit 1
fi

# The raw output should be JSON directly (search.js outputs pretty-printed JSON)
# Just use the raw output as search results - jq will validate
SEARCH_RESULTS="$RAW_OUTPUT"
# Validate it's valid JSON
if ! echo "$SEARCH_RESULTS" | jq empty 2>/dev/null; then
  log_error "Invalid JSON in search results"
  echo "$SEARCH_RESULTS" >&2
  SEARCH_RESULTS="[]"
fi

# Parse and display results
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}   Search Results for: \"$QUERY\"${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo ""

# Display results - format matches search.js output: { id: "path", score: 0.xxx }
echo "$SEARCH_RESULTS" | jq -r '.[] |
  "[\(.score | . * 100 | round / 100)]  \(.id)"
'

log_success "Search completed"

# Also output JSON for programmatic use
echo ""
echo -e "${CYAN}[JSON OUTPUT]${NC}"
echo "$SEARCH_RESULTS" | jq -c '.[] | {
  filePath: .id,
  relevance: .score
}'
