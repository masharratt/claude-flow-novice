#!/bin/bash
set -euo pipefail

# Clean Orphaned Entries from RuVector Index
#
# Finds and removes index entries for files that no longer exist.
# This can happen if:
# - Files were deleted without the hook running
# - Files were moved manually without git tracking
# - Index was built before git hooks were installed
#
# Usage:
#   clean-orphaned-entries.sh              # Dry run (show orphans)
#   clean-orphaned-entries.sh --clean      # Actually delete orphans
#   clean-orphaned-entries.sh --interactive # Ask for each file

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

# Get all indexed file paths from RuVector
get_all_indexed_files() {
  node -e "
    import { getCollection, COLLECTIONS } from './docker/trigger-dev/src/lib/ruvector-init.ts';

    (async () => {
      try {
        const collection = getCollection(COLLECTIONS.CODEBASE_INDEX);

        // Get all entries (this is a workaround - RuVector doesn't have listAll)
        // We search with a zero vector and high k to get all entries
        const zeroVector = new Float32Array(1536).fill(0);
        const results = await collection.search({
          vector: zeroVector,
          k: 100000, // High number to get all entries
        });

        // Extract file paths (IDs)
        results.forEach(result => {
          console.log(result.id);
        });
      } catch (error) {
        console.error('Failed to get indexed files:', error.message);
        process.exit(1);
      }
    })();
  " 2>/dev/null || {
    log_error "Failed to query RuVector database"
    return 1
  }
}

# Delete entry by file path (ID)
delete_entry() {
  local file_path="$1"

  node -e "
    import { getCollection, COLLECTIONS } from './docker/trigger-dev/src/lib/ruvector-init.ts';

    (async () => {
      try {
        const collection = getCollection(COLLECTIONS.CODEBASE_INDEX);
        await collection.delete('$file_path');
        console.log('Deleted: $file_path');
      } catch (error) {
        console.error('Failed to delete:', error.message);
        process.exit(1);
      }
    })();
  " 2>/dev/null || {
    log_error "Failed to delete entry: $file_path"
    return 1
  }
}

# Main
main() {
  local mode="${1:---dry-run}"

  log_info "Scanning for orphaned entries..."
  echo ""

  # Get all indexed files
  local indexed_files
  indexed_files=$(get_all_indexed_files)

  if [[ -z "$indexed_files" ]]; then
    log_warn "No indexed files found (database might be empty)"
    exit 0
  fi

  local total_indexed
  total_indexed=$(echo "$indexed_files" | wc -l)

  log_info "Found $total_indexed entries in index"
  echo ""

  # Check which files no longer exist
  local orphaned=()
  while IFS= read -r file_path; do
    [[ -z "$file_path" ]] && continue

    if [[ ! -f "$file_path" ]]; then
      orphaned+=("$file_path")
    fi
  done <<< "$indexed_files"

  local orphan_count=${#orphaned[@]}

  if [[ $orphan_count -eq 0 ]]; then
    log_success "No orphaned entries found! Index is clean."
    exit 0
  fi

  # Display orphaned files
  echo -e "${YELLOW}═══════════════════════════════════════════════════════${NC}"
  echo -e "${YELLOW}   Found $orphan_count Orphaned Entries${NC}"
  echo -e "${YELLOW}═══════════════════════════════════════════════════════${NC}"
  echo ""

  for file in "${orphaned[@]}"; do
    echo -e "${RED}[ORPHANED]${NC} $file"
  done

  echo ""

  # Handle based on mode
  case "$mode" in
    --dry-run)
      log_info "Dry run complete. Use --clean to delete orphaned entries."
      log_info "Or use --interactive for confirmation on each file."
      ;;

    --clean)
      log_warn "Deleting $orphan_count orphaned entries..."
      echo ""

      local deleted=0
      for file in "${orphaned[@]}"; do
        if delete_entry "$file"; then
          ((deleted++))
          echo -ne "\r${GREEN}[PROGRESS]${NC} Deleted $deleted/$orphan_count entries..."
        fi
      done

      echo "" # New line after progress
      log_success "Deleted $deleted orphaned entries"
      ;;

    --interactive)
      log_info "Interactive mode: confirm each deletion"
      echo ""

      local deleted=0
      for file in "${orphaned[@]}"; do
        echo -e "${YELLOW}Orphaned:${NC} $file"
        read -p "Delete this entry? (y/n) " -n 1 -r
        echo

        if [[ $REPLY =~ ^[Yy]$ ]]; then
          if delete_entry "$file"; then
            ((deleted++))
            log_success "Deleted"
          else
            log_error "Failed to delete"
          fi
        else
          log_info "Skipped"
        fi

        echo ""
      done

      log_success "Deleted $deleted out of $orphan_count orphaned entries"
      ;;

    *)
      log_error "Unknown mode: $mode"
      echo "Usage: clean-orphaned-entries.sh [--dry-run|--clean|--interactive]"
      exit 1
      ;;
  esac
}

main "$@"
