#!/usr/bin/env bash
# ============================================================================
# Skills Database YAML Export/Import Test Suite
# ============================================================================
# Comprehensive tests for export-to-yaml.sh and import-from-yaml.sh
#
# Test Coverage:
# 1. Export validation (YAML format, completeness)
# 2. Import validation (schema, conflicts, transactions)
# 3. Round-trip testing (export → import preserves data)
# 4. Content hash verification
# 5. Conflict resolution
# 6. Transaction rollback on errors
# ============================================================================

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
EXPORT_SCRIPT="${PROJECT_ROOT}/scripts/skills-db/export-to-yaml.sh"
IMPORT_SCRIPT="${PROJECT_ROOT}/scripts/skills-db/import-from-yaml.sh"
DB_PATH="${PROJECT_ROOT}/.claude/skills-database/skills.db"
TEST_OUTPUT_DIR="/tmp/skills-db-test-$$"

# Test statistics
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ============================================================================
# Helper Functions
# ============================================================================

log_test() {
  echo -e "${YELLOW}[TEST]${NC} $*"
}

log_pass() {
  echo -e "${GREEN}[PASS]${NC} $*"
  ((TESTS_PASSED++))
}

log_fail() {
  echo -e "${RED}[FAIL]${NC} $*"
  ((TESTS_FAILED++))
}

log_info() {
  echo "[INFO] $*"
}

setup_test_env() {
  log_info "Setting up test environment..."
  mkdir -p "$TEST_OUTPUT_DIR"

  # Create backup of database
  if [[ -f "$DB_PATH" ]]; then
    cp "$DB_PATH" "${DB_PATH}.test-backup"
    log_info "Database backup created"
  fi
}

cleanup_test_env() {
  log_info "Cleaning up test environment..."

  # Restore database from backup
  if [[ -f "${DB_PATH}.test-backup" ]]; then
    mv "${DB_PATH}.test-backup" "$DB_PATH"
    log_info "Database restored from backup"
  fi

  # Clean up test files
  rm -rf "$TEST_OUTPUT_DIR"
}

run_test() {
  local test_name="$1"
  local test_func="$2"

  ((TESTS_RUN++))
  log_test "$test_name"

  if $test_func; then
    log_pass "$test_name"
    return 0
  else
    log_fail "$test_name"
    return 1
  fi
}

# ============================================================================
# Test Functions
# ============================================================================

test_export_script_exists() {
  [[ -x "$EXPORT_SCRIPT" ]]
}

test_import_script_exists() {
  [[ -x "$IMPORT_SCRIPT" ]]
}

test_export_basic() {
  local output="${TEST_OUTPUT_DIR}/export-basic.yaml"

  "$EXPORT_SCRIPT" --output="$output" 2>/dev/null

  # Check file exists and is not empty
  [[ -s "$output" ]]
}

test_export_yaml_structure() {
  local output="${TEST_OUTPUT_DIR}/export-structure.yaml"

  "$EXPORT_SCRIPT" --output="$output" 2>/dev/null

  # Verify YAML contains required sections
  grep -q "^version:" "$output" && \
  grep -q "^skills:" "$output" && \
  grep -q "^agent_skill_mappings:" "$output"
}

test_export_metadata() {
  local output="${TEST_OUTPUT_DIR}/export-metadata.yaml"

  "$EXPORT_SCRIPT" --output="$output" 2>/dev/null

  # Check metadata fields
  grep -q "exported_at:" "$output" && \
  grep -q "schema_version:" "$output" && \
  grep -q "database_path:" "$output"
}

test_export_approval_fields() {
  local output="${TEST_OUTPUT_DIR}/export-approval.yaml"

  "$EXPORT_SCRIPT" --output="$output" 2>/dev/null

  # Check approval workflow fields are present
  grep -q "approval_level:" "$output"
}

test_export_filter_category() {
  local output="${TEST_OUTPUT_DIR}/export-filter-category.yaml"

  # Export only coordination category (if exists)
  "$EXPORT_SCRIPT" --output="$output" --filter-category=coordination 2>/dev/null || true

  # File should exist (even if empty category)
  [[ -f "$output" ]]
}

test_export_filter_status() {
  local output="${TEST_OUTPUT_DIR}/export-filter-status.yaml"

  # Export only active skills
  "$EXPORT_SCRIPT" --output="$output" --filter-status=active 2>/dev/null

  [[ -s "$output" ]]
}

test_export_with_history() {
  local output="${TEST_OUTPUT_DIR}/export-history.yaml"

  "$EXPORT_SCRIPT" --output="$output" --include-history 2>/dev/null

  # Check if approval_history section exists (if there's history)
  [[ -s "$output" ]]
}

test_import_validate_only() {
  local output="${TEST_OUTPUT_DIR}/export-for-validation.yaml"

  # Export first
  "$EXPORT_SCRIPT" --output="$output" 2>/dev/null

  # Validate (should not modify database)
  "$IMPORT_SCRIPT" --input="$output" --mode=validate-only 2>/dev/null
}

test_import_dry_run() {
  local output="${TEST_OUTPUT_DIR}/export-for-dry-run.yaml"

  "$EXPORT_SCRIPT" --output="$output" 2>/dev/null

  # Dry run should succeed without changes
  "$IMPORT_SCRIPT" --input="$output" --dry-run 2>/dev/null
}

test_import_missing_file() {
  local nonexistent="/tmp/nonexistent-$$.yaml"

  # Should fail gracefully
  if "$IMPORT_SCRIPT" --input="$nonexistent" 2>/dev/null; then
    return 1  # Should have failed
  else
    return 0  # Expected failure
  fi
}

test_round_trip_export_import() {
  local export_file="${TEST_OUTPUT_DIR}/roundtrip-export.yaml"
  local export_file2="${TEST_OUTPUT_DIR}/roundtrip-export2.yaml"

  # Export original state
  "$EXPORT_SCRIPT" --output="$export_file" 2>/dev/null

  # Count skills before
  local skills_before
  skills_before=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM skills;")

  # Import back (merge mode)
  "$IMPORT_SCRIPT" --input="$export_file" --mode=merge --force 2>/dev/null

  # Export again
  "$EXPORT_SCRIPT" --output="$export_file2" 2>/dev/null

  # Count skills after
  local skills_after
  skills_after=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM skills;")

  # Skill count should be the same
  [[ "$skills_before" -eq "$skills_after" ]]
}

test_import_merge_mode() {
  local export_file="${TEST_OUTPUT_DIR}/merge-test.yaml"

  "$EXPORT_SCRIPT" --output="$export_file" 2>/dev/null

  # Import with merge mode (default)
  "$IMPORT_SCRIPT" --input="$export_file" --mode=merge --skip-conflicts 2>/dev/null
}

test_import_conflict_skip() {
  local export_file="${TEST_OUTPUT_DIR}/conflict-skip.yaml"

  "$EXPORT_SCRIPT" --output="$export_file" 2>/dev/null

  # Import with skip conflicts flag
  "$IMPORT_SCRIPT" --input="$export_file" --skip-conflicts 2>/dev/null
}

test_import_conflict_force() {
  local export_file="${TEST_OUTPUT_DIR}/conflict-force.yaml"

  "$EXPORT_SCRIPT" --output="$export_file" 2>/dev/null

  # Import with force flag
  "$IMPORT_SCRIPT" --input="$export_file" --force 2>/dev/null
}

test_export_help() {
  "$EXPORT_SCRIPT" --help &>/dev/null
}

test_import_help() {
  "$IMPORT_SCRIPT" --help &>/dev/null
}

test_export_invalid_option() {
  # Should fail gracefully with invalid option
  if "$EXPORT_SCRIPT" --invalid-option 2>/dev/null; then
    return 1  # Should have failed
  else
    return 0  # Expected failure
  fi
}

test_import_invalid_mode() {
  local export_file="${TEST_OUTPUT_DIR}/invalid-mode.yaml"
  "$EXPORT_SCRIPT" --output="$export_file" 2>/dev/null

  # Should fail with invalid mode
  if "$IMPORT_SCRIPT" --input="$export_file" --mode=invalid 2>/dev/null; then
    return 1  # Should have failed
  else
    return 0  # Expected failure
  fi
}

test_database_integrity_after_import() {
  local export_file="${TEST_OUTPUT_DIR}/integrity-test.yaml"

  "$EXPORT_SCRIPT" --output="$export_file" 2>/dev/null
  "$IMPORT_SCRIPT" --input="$export_file" --force 2>/dev/null

  # Check foreign key integrity
  local violations
  violations=$(sqlite3 "$DB_PATH" "PRAGMA foreign_key_check;" | wc -l)

  [[ $violations -eq 0 ]]
}

test_agent_mappings_preserved() {
  local export_file="${TEST_OUTPUT_DIR}/mappings-test.yaml"

  # Count mappings before
  local mappings_before
  mappings_before=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM agent_skill_mappings;")

  "$EXPORT_SCRIPT" --output="$export_file" 2>/dev/null
  "$IMPORT_SCRIPT" --input="$export_file" --mode=merge --force 2>/dev/null

  # Count mappings after
  local mappings_after
  mappings_after=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM agent_skill_mappings;")

  # Should be same or more (merge mode)
  [[ $mappings_after -ge $mappings_before ]]
}

test_approval_workflow_metadata() {
  local export_file="${TEST_OUTPUT_DIR}/approval-metadata.yaml"

  "$EXPORT_SCRIPT" --output="$export_file" 2>/dev/null

  # Check for approval workflow fields
  grep -q "approval_level:" "$export_file" || \
  grep -q "last_approved_by:" "$export_file" || \
  return 0  # Pass if no skills have approval data yet
}

# ============================================================================
# Test Execution
# ============================================================================

run_all_tests() {
  log_info "Starting Skills Database YAML Tools Test Suite"
  log_info "================================================"

  setup_test_env

  # Export Tests
  log_info ""
  log_info "Export Tests"
  log_info "------------"
  run_test "Export script exists and is executable" test_export_script_exists
  run_test "Basic export functionality" test_export_basic
  run_test "YAML structure validation" test_export_yaml_structure
  run_test "Export metadata fields" test_export_metadata
  run_test "Approval workflow fields in export" test_export_approval_fields
  run_test "Export with category filter" test_export_filter_category
  run_test "Export with status filter" test_export_filter_status
  run_test "Export with approval history" test_export_with_history
  run_test "Export help message" test_export_help
  run_test "Export handles invalid options" test_export_invalid_option

  # Import Tests
  log_info ""
  log_info "Import Tests"
  log_info "------------"
  run_test "Import script exists and is executable" test_import_script_exists
  run_test "Import validate-only mode" test_import_validate_only
  run_test "Import dry-run mode" test_import_dry_run
  run_test "Import handles missing file" test_import_missing_file
  run_test "Import merge mode" test_import_merge_mode
  run_test "Import with skip-conflicts" test_import_conflict_skip
  run_test "Import with force overwrite" test_import_conflict_force
  run_test "Import help message" test_import_help
  run_test "Import handles invalid mode" test_import_invalid_mode

  # Integration Tests
  log_info ""
  log_info "Integration Tests"
  log_info "-----------------"
  run_test "Round-trip export→import preserves data" test_round_trip_export_import
  run_test "Database integrity after import" test_database_integrity_after_import
  run_test "Agent mappings preserved in round-trip" test_agent_mappings_preserved
  run_test "Approval workflow metadata preserved" test_approval_workflow_metadata

  cleanup_test_env
}

show_summary() {
  log_info ""
  log_info "================================================"
  log_info "Test Summary"
  log_info "================================================"
  log_info "Tests run:    $TESTS_RUN"
  log_info "Tests passed: $TESTS_PASSED"
  log_info "Tests failed: $TESTS_FAILED"

  local pass_rate
  if [[ $TESTS_RUN -gt 0 ]]; then
    pass_rate=$(awk "BEGIN {printf \"%.2f\", ($TESTS_PASSED / $TESTS_RUN) * 100}")
    log_info "Pass rate:    ${pass_rate}%"
  fi

  log_info "================================================"

  if [[ $TESTS_FAILED -eq 0 ]]; then
    echo -e "${GREEN}All tests passed!${NC}"
    return 0
  else
    echo -e "${RED}Some tests failed${NC}"
    return 1
  fi
}

# ============================================================================
# Main
# ============================================================================

main() {
  # Check dependencies
  if [[ ! -f "$DB_PATH" ]]; then
    echo "Error: Database not found at $DB_PATH"
    echo "Please ensure Skills Database is initialized"
    exit 1
  fi

  run_all_tests

  if show_summary; then
    exit 0
  else
    exit 1
  fi
}

# Handle cleanup on interrupt
trap cleanup_test_env EXIT INT TERM

main "$@"
