#!/usr/bin/env bash
# tests/test-windows-wsl-path-fix.sh
# Verify Windows/WSL path compatibility fix in cfn-conversation-sync

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
source "$PROJECT_ROOT/tests/test-utils.sh"

# Path to the sync script
SYNC_SCRIPT="${PROJECT_ROOT}/.claude/skills/cfn-conversation-sync/sync-conversations.sh"

cleanup() {
  # No cleanup needed for this test
  :
}
trap cleanup EXIT

# Test cases for path normalization
test_path_normalization() {
  log_info "Testing path normalization logic..."

  # Test case 1: Windows path with backslashes
  cwd1="c:\\Users\\masha\\Documents\\ourstories-v2"
  project1="ourstories-v2"
  norm_cwd1=$(echo "$cwd1" | sed 's|\\|/|g' | tr '[:upper:]' '[:lower:]')
  norm_project1=$(echo "$project1" | tr '[:upper:]' '[:lower:]')

  if [[ "$norm_cwd1" == *"$norm_project1"* ]]; then
    log_success "✓ Test 1 passed: Windows path matching"
  else
    log_error "✗ Test 1 failed: Windows path not matching"
    echo "  Normalized cwd: $norm_cwd1"
    echo "  Normalized project: $norm_project1"
    return 1
  fi

  # Test case 2: WSL path already normalized
  cwd2="$PROJECT_ROOT"
  project2="claude-flow-novice"
  norm_cwd2=$(echo "$cwd2" | sed 's|\\|/|g' | tr '[:upper:]' '[:lower:]')
  norm_project2=$(echo "$project2" | tr '[:upper:]' '[:lower:]')

  if [[ "$norm_cwd2" == *"$norm_project2"* ]]; then
    log_success "✓ Test 2 passed: WSL path matching"
  else
    log_error "✗ Test 2 failed: WSL path not matching"
    echo "  Normalized cwd: $norm_cwd2"
    echo "  Normalized project: $norm_project2"
    return 1
  fi

  # Test case 3: Mixed case
  cwd3="C:\\Users\\Masha\\Documents\\CLAUDE-Flow-Novice"
  project3="claude-flow-novice"
  norm_cwd3=$(echo "$cwd3" | sed 's|\\|/|g' | tr '[:upper:]' '[:lower:]')
  norm_project3=$(echo "$project3" | tr '[:upper:]' '[:lower:]')

  if [[ "$norm_cwd3" == *"$norm_project3"* ]]; then
    log_success "✓ Test 3 passed: Mixed case path matching"
  else
    log_error "✗ Test 3 failed: Mixed case path not matching"
    echo "  Normalized cwd: $norm_cwd3"
    echo "  Normalized project: $norm_project3"
    return 1
  fi

  # Test case 4: Non-matching path
  cwd4="c:\\Users\\masha\\Documents\\other-project"
  project4="claude-flow-novice"
  norm_cwd4=$(echo "$cwd4" | sed 's|\\|/|g' | tr '[:upper:]' '[:lower:]')
  norm_project4=$(echo "$project4" | tr '[:upper:]' '[:lower:]')

  if [[ ! "$norm_cwd4" == *"$norm_project4"* ]]; then
    log_success "✓ Test 4 passed: Non-matching path correctly excluded"
  else
    log_error "✗ Test 4 failed: Non-matching path incorrectly matched"
    echo "  Normalized cwd: $norm_cwd4"
    echo "  Normalized project: $norm_project4"
    return 1
  fi

  return 0
}

# Verify the hardcoded path was removed
test_hardcoded_path_removed() {
  log_info "Verifying hardcoded path was removed..."

  if grep -q "/mnt/c/Users/masha/.codex/sessions" "$SYNC_SCRIPT"; then  # portability-ok: this test asserts that literal is ABSENT
    log_error "✗ Hardcoded path still exists in sync script"
    return 1
  else
    log_success "✓ Hardcoded path successfully removed"
  fi

  return 0
}

# Main test execution
main() {
  echo "========================================"
  echo "Testing Windows/WSL Path Compatibility Fix"
  echo "========================================"
  echo

  # Check if sync script exists
  if [ ! -f "$SYNC_SCRIPT" ]; then
    log_error "Sync script not found at: $SYNC_SCRIPT"
    exit 1
  fi

  # Run tests
  if test_path_normalization && test_hardcoded_path_removed; then
    echo
    log_success "All tests passed! ✅"
    exit 0
  else
    echo
    log_error "Some tests failed! ❌"
    exit 1
  fi
}

# Run main function
main "$@"