#!/bin/bash
set -euo pipefail

# Handle File Moves in RuVector Index
#
# Detects file moves/renames from git and updates the index accordingly:
# 1. Deletes old entry (with old path as ID)
# 2. Indexes new entry (with new path as ID)
#
# This prevents orphaned entries when files are moved.
#
# Usage:
#   handle-file-moves.sh                    # Auto-detect from last commit
#   handle-file-moves.sh --from-diff        # Detect from staged changes

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INDEX_SCRIPT="$SCRIPT_DIR/index.sh"

# Colors
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

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

# Delete entry from RuVector by file path (ID)
delete_entry() {
  local file_path="$1"

  log_info "Deleting old entry: $file_path"

  PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

  node -e "
    import { getCollection, COLLECTIONS } from '$PROJECT_ROOT/docker/trigger-dev/src/lib/ruvector-init.ts';

    (async () => {
      try {
        const collection = getCollection(COLLECTIONS.CODEBASE_INDEX);

        // RuVector delete by ID
        await collection.delete('$file_path');

        console.log('Deleted: $file_path');
      } catch (error) {
        // Entry might not exist, that's OK
        console.log('Entry not found (already deleted or never indexed): $file_path');
      }
    })();
  " || {
    log_warn "Could not delete entry for: $file_path"
  }
}

# Get file moves from last commit
get_moves_from_commit() {
  # Git diff-tree with --find-renames detects moves
  # Format: R<percentage> <old-path> <new-path>
  git diff-tree --no-commit-id --name-status --find-renames=90 -r HEAD 2>/dev/null | grep "^R" || true
}

# Get file moves from staged changes
get_moves_from_staged() {
  git diff --cached --name-status --find-renames=90 2>/dev/null | grep "^R" || true
}

# Process file moves
process_moves() {
  local moves="$1"
  local move_count=0
  local success_count=0

  while IFS=$'\t' read -r status old_path new_path; do
    [[ -z "$old_path" || -z "$new_path" ]] && continue

    # Extract just the file paths (remove R100, R095 prefix)
    status_code="${status#R}"

    log_info "Detected move: $old_path -> $new_path (${status_code}% similar)"

    ((move_count++))

    # Delete old entry
    delete_entry "$old_path"

    # Index new entry (if file exists)
    if [[ -f "$new_path" ]]; then
      log_info "Re-indexing at new location: $new_path"

      if "$INDEX_SCRIPT" --files "$new_path" 2>&1 | grep -q "Indexed: 1 files"; then
        ((success_count++))
        log_success "Updated index: $old_path -> $new_path"
      else
        log_error "Failed to index new location: $new_path"
      fi
    else
      log_warn "New file not found (deleted?): $new_path"
    fi

  done <<< "$moves"

  echo ""
  if [[ $move_count -gt 0 ]]; then
    log_success "Processed $move_count file move(s), $success_count successful"
  else
    log_info "No file moves detected"
  fi
}

# Main
main() {
  local mode="${1:---from-commit}"

  log_info "Detecting file moves..."

  local moves
  if [[ "$mode" == "--from-staged" ]]; then
    moves=$(get_moves_from_staged)
  else
    moves=$(get_moves_from_commit)
  fi

  if [[ -z "$moves" ]]; then
    log_info "No file moves detected"
    exit 0
  fi

  process_moves "$moves"
}

main "$@"
