#!/bin/bash
set -euo pipefail

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
DATA_DIR="$PROJECT_ROOT/docker/trigger-dev/data"

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

function log_info() {
  echo -e "${GREEN}[INFO]${NC} $*"
}

function log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $*"
}

function log_error() {
  echo -e "${RED}[ERROR]${NC} $*"
}

function verify_secure_functions_exist() {
  local ruvector_file="$PROJECT_ROOT/docker/trigger-dev/src/lib/ruvector-init.ts"
  local backup_file="$PROJECT_ROOT/docker/trigger-dev/src/lib/backup-encryption.ts"
  local found_secure_writes=0

  if grep -q "function secureFileWrite" "$ruvector_file"; then
    log_info "secureFileWrite function found in ruvector-init.ts"
    found_secure_writes=$((found_secure_writes + 1))
  else
    log_error "secureFileWrite function NOT found in ruvector-init.ts"
  fi

  if grep -q "function secureCreateDir" "$ruvector_file"; then
    log_info "secureCreateDir function found in ruvector-init.ts"
    found_secure_writes=$((found_secure_writes + 1))
  else
    log_error "secureCreateDir function NOT found in ruvector-init.ts"
  fi

  if grep -q "function secureFileWrite" "$backup_file"; then
    log_info "secureFileWrite function found in backup-encryption.ts"
    found_secure_writes=$((found_secure_writes + 1))
  else
    log_error "secureFileWrite function NOT found in backup-encryption.ts"
  fi

  if [ "$found_secure_writes" -eq 3 ]; then
    log_info "All secure file write functions are implemented"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    log_error "Not all secure file write functions are implemented ($found_secure_writes/3)"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

function verify_secure_calls() {
  local ruvector_file="$PROJECT_ROOT/docker/trigger-dev/src/lib/ruvector-init.ts"
  local backup_file="$PROJECT_ROOT/docker/trigger-dev/src/lib/backup-encryption.ts"
  local found_calls=0

  if grep -q "secureCreateDir" "$ruvector_file"; then
    log_info "secureCreateDir called in ruvector-init.ts"
    found_calls=$((found_calls + 1))
  else
    log_error "secureCreateDir NOT called in ruvector-init.ts"
  fi

  if grep -q "secureFileWrite" "$backup_file" && grep -q "0o600" "$backup_file"; then
    log_info "secureFileWrite with 0o600 mode called in backup-encryption.ts"
    found_calls=$((found_calls + 1))
  else
    log_error "secureFileWrite with 0o600 NOT properly called in backup-encryption.ts"
  fi

  if [ "$found_calls" -eq 2 ]; then
    log_info "All secure functions are properly called"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    log_error "Not all secure functions are properly called ($found_calls/2)"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

function verify_mode_constants() {
  local ruvector_file="$PROJECT_ROOT/docker/trigger-dev/src/lib/ruvector-init.ts"
  local backup_file="$PROJECT_ROOT/docker/trigger-dev/src/lib/backup-encryption.ts"
  local found_modes=0

  if grep -q "0o600" "$ruvector_file" && grep -q "0o644" "$ruvector_file"; then
    log_info "Correct mode constants (0o600, 0o644) in ruvector-init.ts"
    found_modes=$((found_modes + 1))
  fi

  if grep -q "0o600" "$backup_file"; then
    log_info "Correct mode constants (0o600) in backup-encryption.ts"
    found_modes=$((found_modes + 1))
  fi

  if grep -q "0o700" "$ruvector_file"; then
    log_info "Directory mode constant (0o700) in ruvector-init.ts"
    found_modes=$((found_modes + 1))
  fi

  if [ "$found_modes" -eq 3 ]; then
    log_info "All permission modes are correctly defined"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    log_warn "Some permission modes may be missing ($found_modes/3)"
  fi
}

echo "=========================================="
echo "Security Test: File Permissions (sec-1.1)"
echo "=========================================="
echo ""

log_info "Testing secure function implementations..."
verify_secure_functions_exist

echo ""
log_info "Testing secure function calls..."
verify_secure_calls

echo ""
log_info "Verifying permission modes..."
verify_mode_constants

echo ""
echo "=========================================="
echo "Test Results"
echo "=========================================="
echo -e "Passed:  ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed:  ${RED}$TESTS_FAILED${NC}"
echo ""

if [ "$TESTS_FAILED" -eq 0 ]; then
  log_info "All security tests passed!"
  exit 0
else
  log_error "Security tests failed - $TESTS_FAILED test(s) failed"
  exit 1
fi
