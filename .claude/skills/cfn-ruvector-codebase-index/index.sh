#!/bin/bash
set -euo pipefail

# RuVector Codebase Indexer
#
# Indexes source files into RuVector database for semantic search.
# Supports full rebuild and incremental updates.
#
# Usage:
#   index.sh --full                    # Full reindex from scratch
#   index.sh --files file1.ts file2.py # Incremental update for specific files
#   index.sh --auto                    # Auto-detect changed files (git status)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CONFIG_FILE="$SCRIPT_DIR/config.json"
EMBEDDINGS_JS="$SCRIPT_DIR/embeddings.js"
PARSER_JS="$SCRIPT_DIR/parser.js"

# Load environment variables if .env exists
if [[ -f "$PROJECT_ROOT/.env" ]]; then
  set -a  # automatically export all variables
  source "$PROJECT_ROOT/.env"
  set +a
fi

# Load configuration
INCLUDE_DIRS=$(jq -r '.includeDirs[]' "$CONFIG_FILE")
INDEXABLE_EXTENSIONS=$(jq -r '.indexableExtensions[]' "$CONFIG_FILE")
IGNORE_PATTERNS=$(jq -r '.ignorePatterns[]' "$CONFIG_FILE")
MAX_FILE_SIZE=$(jq -r '.maxFileSize' "$CONFIG_FILE")
RUVECTOR_DB_PATH=$(jq -r '.ruvectorDbPath' "$CONFIG_FILE")

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
  echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $*"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $*"
}

# Check prerequisites
check_prerequisites() {
  log_info "Checking prerequisites..."

  if ! command -v jq &> /dev/null; then
    log_error "jq is not installed. Install with: sudo apt install jq"
    exit 1
  fi

  if ! command -v node &> /dev/null; then
    log_error "Node.js is not installed"
    exit 1
  fi

  if [[ -z "${OPENAI_API_KEY:-}" && -z "${ZAI_API_KEY:-}" ]]; then
    log_error "OPENAI_API_KEY or ZAI_API_KEY environment variable is required"
    exit 1
  fi

  log_success "Prerequisites check passed"
}

# Initialize RuVector database if not exists
init_database() {
  log_info "Initializing RuVector database..."

  # Create data directory if it doesn't exist
  mkdir -p "$RUVECTOR_DB_PATH"

  # Initialize database via standalone script (avoids inline eval path resolution issues)
  npx tsx "$SCRIPT_DIR/init-db.js" || {
    log_error "Failed to initialize RuVector database"
    exit 1
  }

  log_success "RuVector database initialized"
}

# Find all indexable files in the project
find_indexable_files() {
  # Send logs to stderr to avoid polluting stdout
  log_info "Finding indexable files..." >&2

  # Build extension filter
  local ext_args=("-type" "f" "(")
  local first=true
  for ext in $INDEXABLE_EXTENSIONS; do
    if [[ "$first" == true ]]; then
      ext_args+=("-name" "*$ext")
      first=false
    else
      ext_args+=("-o" "-name" "*$ext")
    fi
  done
  ext_args+=(")" "-print")

  # Only search in the directories we actually want to index
  for dir in $INCLUDE_DIRS; do
    if [[ "$dir" == "." ]]; then
      # For root directory, only search files at depth 1 (not recursive)
      while IFS= read -r file; do
        [[ -z "$file" ]] && continue

        # Check file size
        local size=$(stat -c%s "$file" 2>/dev/null || stat -f%z "$file" 2>/dev/null || echo "0")
        if [[ $size -le $MAX_FILE_SIZE ]]; then
          echo "$file"
        else
          log_warn "Skipping large file: $file (${size} bytes)" >&2
        fi
      done < <(find "$dir" -maxdepth 1 "${ext_args[@]}" 2>/dev/null)
    elif [[ -d "$dir" ]]; then
      # For other directories, search recursively but exclude build artifacts
      while IFS= read -r file; do
        [[ -z "$file" ]] && continue

        # Check file size
        local size=$(stat -c%s "$file" 2>/dev/null || stat -f%z "$file" 2>/dev/null || echo "0")
        if [[ $size -le $MAX_FILE_SIZE ]]; then
          echo "$file"
        else
          log_warn "Skipping large file: $file (${size} bytes)" >&2
        fi
      done < <(find "$dir" \
        \( -path "*/node_modules" -o -path "*/dist" -o -path "*/build" -o -path "*/coverage" -o -path "*/.trigger/tmp" -o -path "*/docker/trigger-dev/data" \) -prune -o \
        "${ext_args[@]}" 2>/dev/null)
    fi
  done
}

# Index a single file
index_file() {
  local file_path="$1"

  log_info "Indexing: $file_path"

  # Parse file metadata
  local metadata
  metadata=$(node "$PARSER_JS" "$file_path") || {
    log_error "Failed to parse: $file_path"
    return 1
  }

  # Extract embedding text
  local embedding_text
  embedding_text=$(node -e "
    import { createEmbeddingText, parseFile } from '$PARSER_JS';
    const metadata = parseFile('$file_path');
    console.log(createEmbeddingText('$file_path', metadata));
  ") || {
    log_error "Failed to create embedding text: $file_path"
    return 1
  }

  # Generate embedding
  local embedding
  embedding=$(node "$EMBEDDINGS_JS" "$embedding_text") || {
    log_error "Failed to generate embedding: $file_path"
    return 1
  }

  # Check if embedding is null or empty
  if [[ -z "$embedding" || "$embedding" == "null" ]]; then
    log_warn "Skipping file with null embedding: $file_path"
    return 1
  fi

  # Insert into RuVector using indexer.js
  node "$SCRIPT_DIR/indexer.js" "$file_path" "$embedding" "$metadata" || {
    log_error "Failed to insert into RuVector: $file_path"
    return 1
  }

  return 0
}

# Full reindex from scratch using batch processing
full_reindex() {
  log_info "Starting full reindex..."

  # Clear existing index
  log_info "Clearing existing index..."
  rm -rf "$RUVECTOR_DB_PATH/codebase_index.db"

  # Find all files
  local files=()
  while IFS= read -r file; do
    files+=("$file")
  done < <(find_indexable_files)

  local total=${#files[@]}
  log_info "Found $total files to index"

  # Use batch indexer for performance (100x+ faster than per-file spawning)
  log_info "Starting batch indexer..."

  # Pass environment variables explicitly to Node.js subprocess
  if printf '%s\n' "${files[@]}" | \
     OPENAI_API_KEY="$OPENAI_API_KEY" \
     ZAI_API_KEY="${ZAI_API_KEY:-}" \
     OPENAI_BASE_URL="${OPENAI_BASE_URL:-}" \
     npx tsx "$SCRIPT_DIR/batch-indexer.js"; then
    log_success "Full reindex completed successfully"
  else
    log_error "Batch indexing failed with exit code $?"
    exit 1
  fi
}

# Incremental update for specific files
incremental_update() {
  local files=("$@")

  log_info "Starting incremental update for ${#files[@]} files..."

  # Ensure database exists
  init_database

  local success=0
  local failed=0

  for file in "${files[@]}"; do
    if [[ -f "$file" ]]; then
      if index_file "$file"; then
        ((success++))
      else
        ((failed++))
      fi
    else
      log_warn "File not found: $file"
      ((failed++))
    fi
  done

  log_success "Incremental update completed"
  log_info "Indexed: $success files"
  [[ $failed -gt 0 ]] && log_warn "Failed: $failed files"
}

# Auto-detect changed files from git
auto_detect_changes() {
  log_info "Auto-detecting changed files from git..."

  # Get staged files
  local staged_files
  staged_files=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null || true)

  # Get modified files
  local modified_files
  modified_files=$(git diff --name-only --diff-filter=ACMR 2>/dev/null || true)

  # Combine and deduplicate
  local all_files
  all_files=$(echo -e "$staged_files\n$modified_files" | sort -u)

  # Filter for indexable files
  local indexable_files=()
  while IFS= read -r file; do
    if [[ -n "$file" ]]; then
      local ext="${file##*.}"
      if echo "$INDEXABLE_EXTENSIONS" | grep -q "\\.$ext"; then
        indexable_files+=("$file")
      fi
    fi
  done <<< "$all_files"

  if [[ ${#indexable_files[@]} -eq 0 ]]; then
    log_info "No indexable files changed"
    return 0
  fi

  incremental_update "${indexable_files[@]}"
}

# Main entry point
main() {
  check_prerequisites

  case "${1:-}" in
    --full)
      full_reindex
      ;;
    --files)
      shift
      incremental_update "$@"
      ;;
    --auto)
      auto_detect_changes
      ;;
    *)
      log_error "Usage: index.sh --full | --files <file1> <file2> ... | --auto"
      exit 1
      ;;
  esac
}

main "$@"
