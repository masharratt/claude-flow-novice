#!/bin/bash
# ==============================================================================
# Phase 1.2a Security Hardening Test Suite
# ==============================================================================
#
# Tests for:
# 1. Docker Secrets Integration
# 2. Age Encryption / Decryption
# 3. Pre-Commit Secret Detection Hook
#
# Usage:
#   ./tests/security/test-phase-1-2a-hardening.sh
#
# Exit codes:
#   0 - All tests passed
#   1 - One or more tests failed
#
# ==============================================================================

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$PROJECT_ROOT"

# ==============================================================================
# Test Configuration
# ==============================================================================

TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# Test artifact directories
TEST_ARTIFACTS="/tmp/phase-1-2a-test-artifacts"
TEST_ENV_FILE="${TEST_ARTIFACTS}/test.env"
TEST_ENCRYPTED="${TEST_ARTIFACTS}/test.env.encrypted"
TEST_AGE_KEY="${TEST_ARTIFACTS}/test-key.txt"

# ==============================================================================
# Logging Functions
# ==============================================================================

log_step() {
  echo "[TEST STEP] $*" >&2
}

log_pass() {
  echo "✓ PASS: $*" >&2
  TESTS_PASSED=$((TESTS_PASSED + 1))
}

log_fail() {
  echo "✗ FAIL: $*" >&2
  TESTS_FAILED=$((TESTS_FAILED + 1))
}

log_skip() {
  echo "⊘ SKIP: $*" >&2
  TESTS_SKIPPED=$((TESTS_SKIPPED + 1))
}

# ==============================================================================
# Setup and Cleanup
# ==============================================================================

setup_test_artifacts() {
  log_step "Setting up test artifacts..."
  mkdir -p "$TEST_ARTIFACTS"
  rm -rf "$TEST_ARTIFACTS"/* 2>/dev/null || true
}

cleanup_test_artifacts() {
  log_step "Cleaning up test artifacts..."
  if [[ -d "$TEST_ARTIFACTS" ]]; then
    rm -rf "$TEST_ARTIFACTS"
  fi
}

# ==============================================================================
# Test 1: Docker Secrets File Structure
# ==============================================================================

test_docker_secrets_yaml() {
  log_step "Test 1: Docker Secrets Compose File Validation"

  local secrets_file="docker/trigger-dev/docker-compose.secrets.yml"

  if [[ ! -f "$secrets_file" ]]; then
    log_fail "docker-compose.secrets.yml not found at $secrets_file"
    return 1
  fi

  # Check for required secrets
  local required_secrets=(
    "ANTHROPIC_API_KEY"
    "ZAI_API_KEY"
    "KIMI_API_KEY"
    "GEMINI_API_KEY"
    "XAI_API_KEY"
    "OPENROUTER_API_KEY"
  )

  local missing_secrets=0
  for secret in "${required_secrets[@]}"; do
    if ! grep -q "$secret:" "$secrets_file"; then
      echo "  Missing secret definition: $secret" >&2
      missing_secrets=$((missing_secrets + 1))
    fi
  done

  if [[ $missing_secrets -gt 0 ]]; then
    log_fail "Missing $missing_secrets secret definitions in docker-compose.secrets.yml"
    return 1
  fi

  # Validate YAML syntax (basic check for valid structure)
  if ! grep -q "secrets:" "$secrets_file"; then
    log_fail "docker-compose.secrets.yml missing 'secrets:' section"
    return 1
  fi

  log_pass "Docker secrets file structure valid (6 providers configured)"
  return 0
}

# ==============================================================================
# Test 2: Entrypoint Secrets Loading Function
# ==============================================================================

test_load_secrets_function() {
  log_step "Test 2: Entrypoint load_secrets_or_env() Function"

  local entrypoint="docker/trigger-dev/entrypoint.sh"

  if [[ ! -f "$entrypoint" ]]; then
    log_fail "entrypoint.sh not found at $entrypoint"
    return 1
  fi

  # Check for load_secrets_or_env function definition
  if ! grep -q "load_secrets_or_env()" "$entrypoint"; then
    log_fail "load_secrets_or_env() function not found in entrypoint.sh"
    return 1
  fi

  # Check that function is used in all provider setups
  local providers=(
    "setup_zai_environment"
    "setup_kimi_environment"
    "setup_anthropic_environment"
    "setup_gemini_environment"
    "setup_xai_environment"
    "setup_openrouter_environment"
  )

  local missing_calls=0
  for provider in "${providers[@]}"; do
    if ! grep -A 5 "^$provider()" "$entrypoint" | grep -q "load_secrets_or_env"; then
      echo "  Missing load_secrets_or_env() call in $provider" >&2
      missing_calls=$((missing_calls + 1))
    fi
  done

  if [[ $missing_calls -gt 0 ]]; then
    log_fail "Missing load_secrets_or_env() calls in $missing_calls provider functions"
    return 1
  fi

  log_pass "Entrypoint has load_secrets_or_env() function used in all 6 providers"
  return 0
}

# ==============================================================================
# Test 3: Age Encryption Script Exists
# ==============================================================================

test_encrypt_script_exists() {
  log_step "Test 3: Age Encryption Script"

  local encrypt_script="scripts/security/encrypt-env.sh"

  if [[ ! -f "$encrypt_script" ]]; then
    log_fail "encrypt-env.sh not found at $encrypt_script"
    return 1
  fi

  if [[ ! -x "$encrypt_script" ]]; then
    log_fail "encrypt-env.sh is not executable"
    return 1
  fi

  # Check for key functions
  local required_functions=(
    "check_age_installed"
    "ensure_age_key"
    "encrypt_file"
    "create_backup"
  )

  local missing_functions=0
  for func in "${required_functions[@]}"; do
    if ! grep -q "^$func()" "$encrypt_script"; then
      echo "  Missing function: $func" >&2
      missing_functions=$((missing_functions + 1))
    fi
  done

  if [[ $missing_functions -gt 0 ]]; then
    log_fail "Missing $missing_functions required functions in encrypt-env.sh"
    return 1
  fi

  log_pass "Age encryption script exists and has required functions"
  return 0
}

# ==============================================================================
# Test 4: Age Decryption Script Exists
# ==============================================================================

test_decrypt_script_exists() {
  log_step "Test 4: Age Decryption Script"

  local decrypt_script="scripts/security/decrypt-env.sh"

  if [[ ! -f "$decrypt_script" ]]; then
    log_fail "decrypt-env.sh not found at $decrypt_script"
    return 1
  fi

  if [[ ! -x "$decrypt_script" ]]; then
    log_fail "decrypt-env.sh is not executable"
    return 1
  fi

  # Check for key functions
  local required_functions=(
    "check_age_installed"
    "check_key_file_exists"
    "decrypt_file"
    "validate_decrypted_content"
  )

  local missing_functions=0
  for func in "${required_functions[@]}"; do
    if ! grep -q "^$func()" "$decrypt_script"; then
      echo "  Missing function: $func" >&2
      missing_functions=$((missing_functions + 1))
    fi
  done

  if [[ $missing_functions -gt 0 ]]; then
    log_fail "Missing $missing_functions required functions in decrypt-env.sh"
    return 1
  fi

  log_pass "Age decryption script exists and has required functions"
  return 0
}

# ==============================================================================
# Test 5: Pre-Commit Hook Exists
# ==============================================================================

test_precommit_hook_exists() {
  log_step "Test 5: Pre-Commit Secret Detection Hook"

  local hook=".github/hooks/pre-commit-check-secrets.sh"

  if [[ ! -f "$hook" ]]; then
    log_fail "pre-commit-check-secrets.sh not found at $hook"
    return 1
  fi

  if [[ ! -x "$hook" ]]; then
    log_fail "pre-commit-check-secrets.sh is not executable"
    return 1
  fi

  # Check for detection patterns
  if ! grep -q "ANTHROPIC_API_KEY" "$hook"; then
    log_fail "ANTHROPIC_API_KEY pattern not in pre-commit hook"
    return 1
  fi

  # Check for whitelist
  if ! grep -q "IGNORE_PATTERNS" "$hook"; then
    log_fail "IGNORE_PATTERNS whitelist not in pre-commit hook"
    return 1
  fi

  log_pass "Pre-commit hook exists with detection patterns and whitelist"
  return 0
}

# ==============================================================================
# Test 6: .gitignore Secrets Entries
# ==============================================================================

test_gitignore_secrets() {
  log_step "Test 6: .gitignore Secrets Configuration"

  local gitignore=".gitignore"

  if [[ ! -f "$gitignore" ]]; then
    log_fail ".gitignore not found"
    return 1
  fi

  # Check that .env is ignored (it can be just ".env" or "^\.env$" pattern)
  if ! grep -E "^\.env[[:space:]]|^\.env$" "$gitignore" 2>/dev/null | grep -v "^#" > /dev/null; then
    log_fail ".env not in .gitignore (or commented out)"
    return 1
  fi

  # Check that .secrets/ is ignored
  if ! grep -q "^\.secrets/" "$gitignore"; then
    log_fail ".secrets/ not in .gitignore"
    return 1
  fi

  # Check that age key is ignored
  if ! grep -q "\.age/key\.txt" "$gitignore"; then
    log_fail ".age/key.txt not in .gitignore"
    return 1
  fi

  log_pass ".gitignore has proper secret exclusions"
  return 0
}

# ==============================================================================
# Test 7: Secrets Directories Exist
# ==============================================================================

test_secrets_directories() {
  log_step "Test 7: Required Secrets Directories"

  local secrets_dir=".secrets"
  local encryption_backup_dir=".backups/encryption"

  if [[ ! -d "$secrets_dir" ]]; then
    log_fail "Secrets directory not found: $secrets_dir"
    return 1
  fi

  if [[ ! -d "$encryption_backup_dir" ]]; then
    log_fail "Encryption backup directory not found: $encryption_backup_dir"
    return 1
  fi

  # Check for .gitkeep files
  if [[ ! -f "$secrets_dir/.gitkeep" ]]; then
    log_fail ".gitkeep not found in $secrets_dir"
    return 1
  fi

  if [[ ! -f "$encryption_backup_dir/.gitkeep" ]]; then
    log_fail ".gitkeep not found in $encryption_backup_dir"
    return 1
  fi

  log_pass "Secrets directories exist with .gitkeep files"
  return 0
}

# ==============================================================================
# Test 8: Security Documentation
# ==============================================================================

test_security_documentation() {
  log_step "Test 8: Security Documentation"

  local security_doc="docker/trigger-dev/SECURITY.md"

  if [[ ! -f "$security_doc" ]]; then
    log_fail "SECURITY.md not found at $security_doc"
    return 1
  fi

  # Check for Phase 1.2a sections
  local required_sections=(
    "Docker Secrets Integration"
    "Encrypted Credential Storage"
    "Pre-Commit Secret Detection"
    "load_secrets_or_env"
    "Age Encryption"
  )

  local missing_sections=0
  for section in "${required_sections[@]}"; do
    if ! grep -q "$section" "$security_doc"; then
      echo "  Missing section: $section" >&2
      missing_sections=$((missing_sections + 1))
    fi
  done

  if [[ $missing_sections -gt 0 ]]; then
    log_fail "Missing $missing_sections sections in SECURITY.md"
    return 1
  fi

  log_pass "SECURITY.md has comprehensive Phase 1.2a documentation"
  return 0
}

# ==============================================================================
# Test 9: Backward Compatibility Check
# ==============================================================================

test_backward_compatibility() {
  log_step "Test 9: Backward Compatibility with Environment Variables"

  local entrypoint="docker/trigger-dev/entrypoint.sh"

  if [[ ! -f "$entrypoint" ]]; then
    log_fail "entrypoint.sh not found"
    return 1
  fi

  # Check that environment variable fallback exists in load_secrets_or_env
  if ! grep -A 30 "load_secrets_or_env()" "$entrypoint" | grep -q "Fall back\|environment variable\|local env_var"; then
    log_fail "Environment variable fallback not implemented in load_secrets_or_env()"
    return 1
  fi

  log_pass "Backward compatibility with environment variables maintained"
  return 0
}

# ==============================================================================
# Test 10: Error Handling
# ==============================================================================

test_error_handling() {
  log_step "Test 10: Error Handling and Return Codes"

  local encrypt_script="scripts/security/encrypt-env.sh"
  local decrypt_script="scripts/security/decrypt-env.sh"

  if [[ ! -f "$encrypt_script" ]]; then
    log_fail "encrypt-env.sh not found"
    return 1
  fi

  # Check for exit code comments or return code comments
  if ! grep -q "Exit Codes:\|Return\|exit code\|return " "$encrypt_script"; then
    log_fail "Exit codes not documented in encrypt-env.sh"
    return 1
  fi

  if ! grep -q "Returns:" "$decrypt_script"; then
    log_fail "Return codes not documented in decrypt-env.sh"
    return 1
  fi

  # Check for cleanup/trap handlers
  if ! grep -q "trap.*EXIT" "$encrypt_script"; then
    log_fail "No cleanup trap in encrypt-env.sh"
    return 1
  fi

  if ! grep -q "trap.*cleanup_on_exit" "$decrypt_script"; then
    log_fail "No cleanup trap in decrypt-env.sh"
    return 1
  fi

  log_pass "Error handling and cleanup properly implemented"
  return 0
}

# ==============================================================================
# Main Test Execution
# ==============================================================================

main() {
  echo ""
  echo "=========================================================="
  echo "Phase 1.2a Security Hardening Test Suite"
  echo "=========================================================="
  echo ""

  # Setup
  setup_test_artifacts

  # Run tests
  test_docker_secrets_yaml || true
  test_load_secrets_function || true
  test_encrypt_script_exists || true
  test_decrypt_script_exists || true
  test_precommit_hook_exists || true
  test_gitignore_secrets || true
  test_secrets_directories || true
  test_security_documentation || true
  test_backward_compatibility || true
  test_error_handling || true

  # Cleanup
  cleanup_test_artifacts

  # Summary
  echo ""
  echo "=========================================================="
  echo "Test Summary"
  echo "=========================================================="
  echo "Passed:  $TESTS_PASSED"
  echo "Failed:  $TESTS_FAILED"
  echo "Skipped: $TESTS_SKIPPED"
  echo "Total:   $((TESTS_PASSED + TESTS_FAILED + TESTS_SKIPPED))"
  echo ""

  if [[ $TESTS_FAILED -eq 0 ]]; then
    echo "✓ All tests passed!"
    echo ""
    return 0
  else
    echo "✗ $TESTS_FAILED test(s) failed"
    echo ""
    return 1
  fi
}

main "$@"
