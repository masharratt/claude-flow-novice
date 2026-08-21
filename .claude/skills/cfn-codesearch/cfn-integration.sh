#!/usr/bin/env bash
# CFN Integration Script for Local CodeSearch Accelerator
# Works for both source repo and npm-installed packages

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

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

# Find binary - check multiple locations
find_binary() {
    # 1. Check if in PATH
    if command -v local-codesearch &> /dev/null; then
        echo "$(command -v local-codesearch)"
        return 0
    fi

    # 2. Check ~/.local/bin
    if [[ -x "$HOME/.local/bin/local-codesearch" ]]; then
        echo "$HOME/.local/bin/local-codesearch"
        return 0
    fi

    # 3. Check local target directory (source repo)
    if [[ -x "$SCRIPT_DIR/target/release/local-codesearch" ]]; then
        echo "$SCRIPT_DIR/target/release/local-codesearch"
        return 0
    fi

    return 1
}

# Ensure binary exists
BINARY_PATH=""
if ! BINARY_PATH=$(find_binary); then
    # Try to build if Rust is available
    if command -v cargo &> /dev/null && [[ -f "$SCRIPT_DIR/Cargo.toml" ]]; then
        log_info "Building Local CodeSearch..."
        cd "$SCRIPT_DIR"
        cargo build --release
        BINARY_PATH="$SCRIPT_DIR/target/release/local-codesearch"

        # Install to ~/.local/bin for future use
        if [[ -n "$HOME" ]]; then
            mkdir -p "$HOME/.local/bin"
            cp "$BINARY_PATH" "$HOME/.local/bin/local-codesearch"
            chmod +x "$HOME/.local/bin/local-codesearch"
            log_success "Installed local-codesearch to ~/.local/bin/"
        fi
        log_success "Build complete"
    else
        log_error "local-codesearch binary not found and cannot build (Rust not available)"
        log_info "Install Rust: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
        log_info "Then run: npm run codesearch:local:build"
        exit 1
    fi
fi

# CFN integration commands
cfn_init() {
    local project_dir="${1:-.}"
    log_info "Initializing Local CodeSearch for CFN in: $project_dir"
    "$BINARY_PATH" --project-dir "$project_dir" init
    log_success "CFN Local CodeSearch initialized"
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
    log_info "CFN Local CodeSearch statistics for: $project_dir"
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
CFN Local CodeSearch Integration

Usage: cfn-local-codesearch <COMMAND> [OPTIONS]

Commands:
  init [DIR]              Initialize Local CodeSearch in project directory
  index [DIR] [TYPES]     Index code files (default types: rs,py,js,ts)
  query DIR PATTERN [N]    Query for patterns (default limit: 10)
  stats [DIR]              Show detailed statistics
  coordinate AGENT FILE PROMPT  Coordinate generation with pattern lookup

Examples:
  # Initialize in current project
  cfn-local-codesearch init

  # Initialize specific project
  cfn-local-codesearch init /path/to/project

  # Index all code types
  cfn-local-codesearch index

  # Index only Rust files
  cfn-local-codesearch index . rs

  # Query for patterns
  cfn-local-codesearch query . "authentication middleware"

  # Get statistics
  cfn-local-codesearch stats

  # Coordinate generation (used by CFN agents)
  cfn-local-codesearch coordinate agent-123 src/auth.rs "create auth middleware"

Environment Variables:
  CODESEARCH_VERBOSE=1     Enable verbose logging
  CODESEARCH_PROJECT_DIR    Override project directory

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