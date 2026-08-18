#!/usr/bin/env bash

################################################################################
# DOCS ORGANIZATION SCRIPT
# Purpose: Organize loose .md files in /docs root into appropriate subdirectories
# Rules: BUG_* → bugs/, CFN_* → cfn-system/cfn-loop/, etc.
################################################################################

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ROOT="$(git rev-parse --show-toplevel)"
DOCS_DIR="${PROJECT_ROOT}/docs"
DRY_RUN="${DRY_RUN:-false}"
VERBOSE="${VERBOSE:-true}"

# Counters
TOTAL_FILES=0
MOVED_FILES=0
SKIPPED_FILES=0
ERROR_FILES=0

################################################################################
# HELPER FUNCTIONS
################################################################################

log_info() {
  if [[ "$VERBOSE" == "true" ]]; then
    echo -e "${GREEN}[INFO]${NC} $1"
  fi
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

log_move() {
  if [[ "$VERBOSE" == "true" ]]; then
    echo -e "${GREEN}[MOVE]${NC} $1 → $2"
  fi
}

log_dry_run() {
  echo -e "${YELLOW}[DRY RUN]${NC} Would move: $1 → $2"
}

################################################################################
# CATEGORIZATION LOGIC
################################################################################

# Determine target directory based on filename rules
# Returns: path to target subdirectory or empty string if no match
categorize_file() {
  local filename="$1"
  local basename="${filename##*/}"

  case "$basename" in
    BUG_*.md)
      echo "bugs"
      ;;
    BASH_DEPRECATION_*.md | BASH_PATTERNS_*.md)
      echo "migration"
      ;;
    CFN_ANALYSIS_*.md | CFN_FINDINGS_*.md | CFN_BASH_*.md | CFN_TYPESCRIPT_*.md)
      echo "cfn-system"
      ;;
    CFN_LOOP_*.md)
      echo "cfn-loop"
      ;;
    CFN_MIGRATION_*.md)
      echo "migration"
      ;;
    CLI_MODE_*.md)
      echo "operations"
      ;;
    CODE_REVIEW_*.md)
      echo "reviews"
      ;;
    COORDINATOR_*.md)
      echo "cfn-system"
      ;;
    DOCKER_*.md)
      echo "docker"
      ;;
    TYPESCRIPT_*.md | *_TYPESCRIPT_*.md)
      echo "migration"
      ;;
    SECURITY_*.md)
      echo "security"
      ;;
    TEST_*.md | *_TEST_*.md)
      echo "testing"
      ;;
    AGENT_*.md)
      echo "agent-spawner"
      ;;
    DEPRECATION_*.md)
      echo "migration"
      ;;
    DEVELOPER_*.md)
      echo "guides"
      ;;
    ORCHESTR*.md)
      echo "cfn-loop"
      ;;
    E2E_TEST_*.md | INTEGRATION_TEST_*.md)
      echo "testing"
      ;;
    MEMORY_*.md | REDIS_*.md | LOGGER_*.md | SANITIZE_*.md)
      echo "quality-assurance"
      ;;
    HOOKS_*.md)
      echo "migration"
      ;;
    PR_*.md)
      echo "reviews"
      ;;
    ISSUE_*.md)
      echo "reports"
      ;;
    # Files that should stay in root (meta/tracking)
    ALL_3_MODES_*.md | AGENT_NAME_*.md | DOCUMENTATION_*.md)
      echo "meta"
      ;;
    *)
      # Default: no categorization
      echo ""
      ;;
  esac
}

################################################################################
# MAIN LOGIC
################################################################################

move_file() {
  local source_file="$1"
  local basename="${source_file##*/}"
  local target_dir

  TOTAL_FILES=$((TOTAL_FILES + 1))

  # Categorize the file
  target_dir=$(categorize_file "$source_file")

  # If no category matched, skip
  if [[ -z "$target_dir" ]]; then
    log_warn "No categorization rule for: $basename"
    SKIPPED_FILES=$((SKIPPED_FILES + 1))
    return 0
  fi

  local target_path="${DOCS_DIR}/${target_dir}/${basename}"

  # Check if target directory exists
  if [[ ! -d "${DOCS_DIR}/${target_dir}" ]]; then
    log_error "Target directory does not exist: ${target_dir}/"
    ERROR_FILES=$((ERROR_FILES + 1))
    return 1
  fi

  # Check if file already exists in target
  if [[ -f "$target_path" ]]; then
    log_warn "File already exists in target: ${target_dir}/${basename}"
    SKIPPED_FILES=$((SKIPPED_FILES + 1))
    return 0
  fi

  # Execute move or show dry-run
  if [[ "$DRY_RUN" == "true" ]]; then
    log_dry_run "$basename" "$target_dir/"
  else
    if mv "$source_file" "$target_path"; then
      log_move "$basename" "$target_dir/"
      MOVED_FILES=$((MOVED_FILES + 1))
    else
      log_error "Failed to move: $basename"
      ERROR_FILES=$((ERROR_FILES + 1))
      return 1
    fi
  fi
}

################################################################################
# SCRIPT EXECUTION
################################################################################

main() {
  echo ""
  echo "================================================================================"
  echo "DOCS ORGANIZATION SCRIPT"
  echo "================================================================================"
  echo ""
  echo "Mode: $([ "$DRY_RUN" == "true" ] && echo "DRY RUN (no changes)" || echo "LIVE (moving files)")"
  echo "Source: $DOCS_DIR"
  echo ""

  # Check if docs directory exists
  if [[ ! -d "$DOCS_DIR" ]]; then
    log_error "Docs directory not found: $DOCS_DIR"
    exit 1
  fi

  # Find all .md files in docs root (not in subdirectories)
  local markdown_files=()
  while IFS= read -r -d '' file; do
    markdown_files+=("$file")
  done < <(find "$DOCS_DIR" -maxdepth 1 -type f -name "*.md" -print0 | sort -z)

  if [[ ${#markdown_files[@]} -eq 0 ]]; then
    log_info "No markdown files found in $DOCS_DIR root"
    echo ""
    exit 0
  fi

  log_info "Found ${#markdown_files[@]} markdown files to process"
  echo ""

  # Process each file
  for file in "${markdown_files[@]}"; do
    move_file "$file"
  done

  # Print summary
  echo ""
  echo "================================================================================"
  echo "SUMMARY"
  echo "================================================================================"
  echo "Total files processed: $TOTAL_FILES"
  echo -e "Files moved:         ${GREEN}$MOVED_FILES${NC}"
  echo -e "Files skipped:       ${YELLOW}$SKIPPED_FILES${NC}"
  echo -e "Errors:              ${RED}$ERROR_FILES${NC}"
  echo ""

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "To execute the moves, run:"
    echo "  DRY_RUN=false $0"
    echo ""
  fi

  exit $([[ $ERROR_FILES -eq 0 ]] && echo 0 || echo 1)
}

################################################################################
# USAGE
################################################################################

print_usage() {
  cat << EOF
Usage: $0 [OPTIONS]

OPTIONS:
  --dry-run       Show what would be moved without making changes (default)
  --execute       Perform the actual moves
  --verbose       Show detailed output (default: true)
  --quiet         Suppress non-essential output
  --help          Show this help message

EXAMPLES:
  # Preview changes
  $0 --dry-run

  # Execute moves
  $0 --execute

  # Execute with quiet output
  $0 --execute --quiet

  # Preview with environment variable
  DRY_RUN=true $0

CATEGORIZATION RULES:
  BUG_*.md                  → docs/bugs/
  BASH_DEPRECATION_*.md     → docs/migration/
  CFN_ANALYSIS_*.md         → docs/cfn-system/
  CFN_LOOP_*.md             → docs/cfn-loop/
  CLI_MODE_*.md             → docs/operations/
  CODE_REVIEW_*.md          → docs/reviews/
  COORDINATOR_*.md          → docs/cfn-system/
  DOCKER_*.md               → docs/docker/
  TYPESCRIPT_*.md           → docs/migration/
  SECURITY_*.md             → docs/security/
  TEST_*.md                 → docs/testing/
  AGENT_*.md                → docs/agent-spawner/
  DEPRECATION_*.md          → docs/migration/
  DEVELOPER_*.md            → docs/guides/
  ORCHESTR*.md              → docs/cfn-loop/
  MEMORY_*.md               → docs/quality-assurance/
  REDIS_*.md                → docs/quality-assurance/
  Unmatched files           → Skipped

EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    --execute)
      DRY_RUN="false"
      shift
      ;;
    --verbose)
      VERBOSE="true"
      shift
      ;;
    --quiet)
      VERBOSE="false"
      shift
      ;;
    --help)
      print_usage
      exit 0
      ;;
    *)
      log_error "Unknown option: $1"
      echo ""
      print_usage
      exit 1
      ;;
  esac
done

# Run main function
main
