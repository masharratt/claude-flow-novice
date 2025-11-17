#!/usr/bin/env bash
# Skills Database YAML Import Tool
# Imports from YAML with validation and conflict resolution

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DB_PATH="${PROJECT_ROOT}/.claude/skills-database/skills.db"
IMPORT_PY="${SCRIPT_DIR}/import-py-logic.py"

INPUT_FILE=""
IMPORT_MODE="merge"
FORCE_OVERWRITE=0
SKIP_CONFLICTS=0
DRY_RUN=0
VERBOSE=0

log_info() { echo "[INFO] $*" >&2; }
log_error() { echo "[ERROR] $*" >&2; }
log_success() { echo "[SUCCESS] $*" >&2; }
log_verbose() { [[ $VERBOSE -eq 1 ]] && echo "[VERBOSE] $*" >&2 || true; }

show_help() {
  cat << 'HELP'
Usage: ./import-from-yaml.sh --input=<file> [OPTIONS]

Options:
  --input=<file>           Input YAML file (required)
  --mode=<mode>            Import mode: merge|replace|validate-only (default: merge)
  --force                  Auto-overwrite conflicts
  --skip-conflicts         Auto-skip conflicts
  --dry-run                Show what would be imported
  --verbose                Detailed logging
  --help                   Show this help
HELP
  exit 0
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --input=*) INPUT_FILE="${1#*=}" ;;
      --mode=*) IMPORT_MODE="${1#*=}" ;;
      --force) FORCE_OVERWRITE=1 ;;
      --skip-conflicts) SKIP_CONFLICTS=1 ;;
      --dry-run) DRY_RUN=1 ;;
      --verbose) VERBOSE=1 ;;
      --help|-h) show_help ;;
      *) log_error "Unknown option: $1"; exit 1 ;;
    esac
    shift
  done

  if [[ -z "$INPUT_FILE" ]]; then
    log_error "Missing required argument: --input=<file>"
    exit 1
  fi
}

validate_environment() {
  [[ -f "$INPUT_FILE" ]] || { log_error "Input file not found: $INPUT_FILE"; exit 1; }
  [[ -f "$DB_PATH" ]] || { log_error "Database not found: $DB_PATH"; exit 1; }
  [[ -f "$IMPORT_PY" ]] || { log_error "Import Python script not found: $IMPORT_PY"; exit 1; }
  command -v sqlite3 &> /dev/null || { log_error "sqlite3 not found"; exit 1; }
  command -v python3 &> /dev/null || { log_error "python3 not found"; exit 1; }
  sqlite3 "$DB_PATH" "SELECT 1;" &> /dev/null || { log_error "Cannot connect to database"; exit 1; }
}

validate_yaml() {
  log_info "Validating YAML..."
  python3 - "$INPUT_FILE" << 'PYVAL' || { log_error "YAML validation failed"; exit 1; }
import sys
try:
    try:
        import yaml
        with open(sys.argv[1], 'r') as f:
            data = yaml.safe_load(f)
    except ImportError:
        with open(sys.argv[1], 'r') as f:
            if 'skills:' not in f.read():
                sys.exit(1)
        sys.exit(0)
    
    if 'version' not in data or 'skills' not in data:
        sys.exit(1)
    for i, skill in enumerate(data.get('skills', [])):
        for field in ['name', 'category', 'content_path', 'version']:
            if field not in skill:
                print(f"Skill #{i} missing field: {field}", file=sys.stderr)
                sys.exit(1)
    print(f"✓ Valid: {len(data.get('skills', []))} skills", file=sys.stderr)
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)
PYVAL
  log_success "YAML validation passed"
}

perform_import() {
  log_info "Importing from YAML..."
  
  local result
  result=$(python3 "$IMPORT_PY" "$INPUT_FILE" "$DB_PATH" "$IMPORT_MODE" "$DRY_RUN" "$FORCE_OVERWRITE" "$SKIP_CONFLICTS" "$VERBOSE" 2>&1)
  
  echo "$result" >&2
  eval "$(echo "$result" | grep "^STATS_" || echo "STATS_ERRORS=1")"
}

validate_import() {
  log_info "Validating imported data..."
  local fk_violations
  fk_violations=$(sqlite3 "$DB_PATH" "PRAGMA foreign_key_check;" | wc -l)
  
  if [[ $fk_violations -gt 0 ]]; then
    log_error "Foreign key violations detected: $fk_violations"
    return 1
  fi
  
  log_success "Import validation passed"
  return 0
}

main() {
  parse_args "$@"
  log_info "Skills Database YAML Import Tool"
  log_info "Input: $INPUT_FILE | Mode: $IMPORT_MODE"
  
  validate_environment
  validate_yaml
  
  if [[ "$IMPORT_MODE" == "validate-only" ]]; then
    log_success "Validation complete"
    exit 0
  fi
  
  [[ $DRY_RUN -eq 1 ]] && log_info "DRY RUN MODE"
  
  perform_import
  
  if [[ $DRY_RUN -eq 0 ]]; then
    validate_import || { log_error "Import validation failed"; exit 1; }
  fi
  
  log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log_info "Import Summary"
  log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log_info "Skills inserted:  ${STATS_SKILLS_INSERTED:-0}"
  log_info "Skills updated:   ${STATS_SKILLS_UPDATED:-0}"
  log_info "Skills skipped:   ${STATS_SKILLS_SKIPPED:-0}"
  log_info "Mappings added:   ${STATS_MAPPINGS_INSERTED:-0}"
  log_info "Mappings updated: ${STATS_MAPPINGS_UPDATED:-0}"
  log_info "History records:  ${STATS_HISTORY_INSERTED:-0}"
  [[ ${STATS_ERRORS:-0} -gt 0 ]] && log_info "Errors:           ${STATS_ERRORS}"
  log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  
  if [[ ${STATS_ERRORS:-0} -gt 0 ]]; then
    log_error "Import had errors"
    exit 1
  else
    log_success "Import complete!"
    exit 0
  fi
}

main "$@"
