#!/bin/bash
# CFN Integration Script for Local RuVector Accelerator

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BINARY_PATH="$SCRIPT_DIR/target/release/local-ruvector"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Ensure binary exists
if [[ ! -f "$BINARY_PATH" ]]; then
    log_info "Building Local RuVector..."
    cd "$SCRIPT_DIR"
    cargo build --release
    log_success "Build complete"
fi

# CFN integration commands
cfn_init() {
    local project_dir="${1:-.}"
    log_info "Initializing Local RuVector for CFN in: $project_dir"
    "$BINARY_PATH" --project-dir "$project_dir" init
    log_success "CFN Local RuVector initialized"
}

cfn_index() {
    local project_dir="${1:-.}"
    local types="${2:-rs,py,js,ts}"
    log_info "Indexing code for CFN patterns in: $project_dir"
    log_info "File types: $types"
    "$BINARY_PATH" --project-dir "$project_dir" index --path "$project_dir" --types "$types"
}

cfn_query() {
    local project_dir="${1:-.}"
    local query="$2"
    local limit="${3:-10}"
    local format="${4:-simple}"

    if [[ -z "$query" ]]; then
        log_error "Query pattern is required"
        return 1
    fi

    log_info "Querying CFN patterns: $query"
    "$BINARY_PATH" --project-dir "$project_dir" query "$query" --max-results "$limit" --format "$format"
}

cfn_stats() {
    local project_dir="${1:-.}"
    log_info "CFN Local RuVector statistics for: $project_dir"
    "$BINARY_PATH" --project-dir "$project_dir" stats --detailed
}

# Agent coordination helper
cfn_coordinate_generation() {
    local agent_id="$1"
    local file_path="$2"
    local prompt="$3"

    log_info "CFN Coordinate Generation"
    log_info "Agent ID: $agent_id"
    log_info "File: $file_path"

    # Extract file type
    local file_type="${file_path##*.}"

    # Query for similar patterns
    log_info "Searching for similar patterns..."
    "$BINARY_PATH" query "$prompt" --file-type "$file_type" --limit 5 --format json > /tmp/cfn_patterns.json

    # Check if patterns found
    if [[ -s /tmp/cfn_patterns.json ]]; then
        log_success "Found similar patterns:"
        cat /tmp/cfn_patterns.json | jq -r '.[] | "  - \(.id): \(.score)"'

        # In a real implementation, these patterns would be used to enhance the prompt
        # For now, just show what was found
        log_info "Patterns can be used to enhance generation prompt"
    else
        log_warning "No similar patterns found"
    fi

    # Clean up
    rm -f /tmp/cfn_patterns.json
}

# Show usage
show_usage() {
    cat << 'EOF'
CFN Local RuVector Integration

Usage: cfn-local-ruvector <COMMAND> [OPTIONS]

Commands:
  init [DIR]              Initialize Local RuVector in project directory
  index [DIR] [TYPES]     Index code files (default types: rs,py,js,ts)
  query DIR PATTERN [N]    Query for patterns (default limit: 10)
  stats [DIR]              Show detailed statistics
  coordinate AGENT FILE PROMPT  Coordinate generation with pattern lookup

Examples:
  # Initialize in current project
  cfn-local-ruvector init

  # Initialize specific project
  cfn-local-ruvector init /path/to/project

  # Index all code types
  cfn-local-ruvector index

  # Index only Rust files
  cfn-local-ruvector index . rs

  # Query for patterns
  cfn-local-ruvector query . "authentication middleware"

  # Get statistics
  cfn-local-ruvector stats

  # Coordinate generation (used by CFN agents)
  cfn-local-ruvector coordinate agent-123 src/auth.rs "create auth middleware"

Environment Variables:
  RUVECTOR_VERBOSE=1     Enable verbose logging
  RUVECTOR_PROJECT_DIR    Override project directory

EOF
}

# Main command routing
case "${1:-help}" in
    init)
        cfn_init "${2:-.}"
        ;;
    index)
        cfn_index "${2:-.}" "${3:-rs,py,js,ts}"
        ;;
    query)
        cfn_query "${2:-.}" "${3:-}" "${4:-10}" "${5:-simple}"
        ;;
    stats)
        cfn_stats "${2:-.}"
        ;;
    coordinate)
        cfn_coordinate_generation "$2" "$3" "$4"
        ;;
    help|--help|-h)
        show_usage
        ;;
    *)
        log_error "Unknown command: $1"
        show_usage
        exit 1
        ;;
esac