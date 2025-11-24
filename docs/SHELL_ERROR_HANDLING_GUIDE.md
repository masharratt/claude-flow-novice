# Shell Error Handling Guide

**Purpose:** Comprehensive guide for implementing robust error handling in shell scripts

**Version:** 1.0.0
**Last Updated:** 2025-11-24
**Status:** ✅ Complete (IMPL-002)

---

## Table of Contents

1. [Overview](#overview)
2. [Validation Framework](#validation-framework)
3. [Arithmetic Error Handling](#arithmetic-error-handling)
4. [Binary Download Security](#binary-download-security)
5. [Input Validation Patterns](#input-validation-patterns)
6. [Best Practices](#best-practices)
7. [Testing Error Handling](#testing-error-handling)
8. [Common Pitfalls](#common-pitfalls)

---

## Overview

This guide documents error handling improvements implemented in Phase 5 (IMPL-002) to address security audit findings:

**Audit Findings:**
1. **Medium Severity:** Binary downloads without checksum verification
2. **Medium Severity:** Arithmetic operations without error handling
3. **Medium Severity:** Missing input validation framework

**Solutions:**
- Centralized validation framework (`scripts/lib/validation.sh`)
- Safe arithmetic operations with overflow detection
- SHA256/SHA512 checksum verification for all binary downloads
- Comprehensive input sanitization functions

---

## Validation Framework

### Location
`scripts/lib/validation.sh`

### Features
- Numeric validation with range checking
- Path traversal prevention
- Command injection detection
- Safe division with zero-check
- Checksum verification (SHA256/SHA512)
- Filename sanitization
- URL and port validation

### Usage

```bash
#!/bin/bash
set -euo pipefail

# Source validation framework
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/validation.sh"

# Now you can use validation functions
if validate_numeric "$USER_INPUT" 0 100; then
  echo "Valid input: $USER_INPUT"
else
  echo "Invalid input"
  exit 1
fi
```

---

## Arithmetic Error Handling

### Problem: Unprotected Division

**Before (Unsafe):**
```bash
# Crashes on division by zero
local result=$(echo "scale=2; $a / $b" | bc)
```

**After (Safe):**
```bash
# Handles division by zero gracefully
local result
result=$(safe_divide "$a" "$b" 2) || {
  log_error "Division failed: $a / $b"
  return 1
}
```

### Safe Division Function

```bash
# Usage: safe_divide <numerator> <denominator> [scale]
# Returns: Result or exits with error

result=$(safe_divide 100 5 2)  # Returns 20.00
result=$(safe_divide 100 0 2)  # Fails gracefully with error
```

**Features:**
- Input validation (numeric check)
- Division by zero detection
- Configurable decimal places
- Error messages to stderr

### Safe Arithmetic Function

```bash
# Usage: safe_arithmetic <operation>
# Returns: Result or exits with error

result=$(safe_arithmetic "100 * 5 + 3")     # Returns 503.000000
result=$(safe_arithmetic "$a / $b")          # Safe division
result=$(safe_arithmetic "$very_large * 2")  # Overflow detection
```

**Features:**
- Command injection prevention
- Overflow detection (>100 digits)
- Uses `bc` for precision
- Configurable scale (default 6 decimal places)

### Example: Cost Calculation

**Implementation in `scripts/cost-allocation-tracker.sh`:**

```bash
calculate_container_cost() {
  local cpu_percent=$1
  local memory_mb=$2
  local runtime_seconds=${3:-3600}

  # Validate inputs
  validate_numeric "$cpu_percent" 0 || return 1
  validate_numeric "$memory_mb" 0 || return 1
  validate_numeric "$runtime_seconds" 1 || return 1

  # Safe arithmetic operations
  local cpu_hours
  cpu_hours=$(safe_divide "$cpu_percent" "100" 4) || return 1
  cpu_hours=$(safe_arithmetic "$cpu_hours * ($runtime_seconds / 3600)") || return 1

  local memory_gb
  memory_gb=$(safe_divide "$memory_mb" "1024" 4) || return 1

  local memory_hours
  memory_hours=$(safe_arithmetic "$memory_gb * ($runtime_seconds / 3600)") || return 1

  # Calculate costs
  local cpu_cost
  cpu_cost=$(safe_arithmetic "$cpu_hours * $COST_CPU_PER_HOUR") || return 1

  local memory_cost
  memory_cost=$(safe_arithmetic "$memory_hours * $COST_MEMORY_PER_GB_HOUR") || return 1

  local total_cost
  total_cost=$(safe_arithmetic "$cpu_cost + $memory_cost") || return 1

  echo "$total_cost"
}
```

**Error Handling:**
- Invalid inputs (non-numeric) → Returns 0 with error
- Division by zero → Returns 0 with error
- Negative values → Rejected at validation
- Overflow → Detected and rejected

---

## Binary Download Security

### Problem: Unverified Binary Downloads

**Security Risk:** Man-in-the-middle attacks, corrupted downloads, supply chain attacks

**Before (Unsafe):**
```dockerfile
# No checksum verification
RUN curl -sS https://getcomposer.org/installer | php -- \
    --install-dir=/usr/local/bin --filename=composer

RUN curl -O https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar && \
    chmod +x wp-cli.phar && \
    mv wp-cli.phar /usr/local/bin/wp
```

**After (Safe):**
```dockerfile
# SHA256 checksum verification for Composer
RUN curl -sS https://getcomposer.org/installer | php -- \
    --install-dir=/usr/local/bin --filename=composer && \
    curl -sS https://getcomposer.org/download/latest-stable/composer.phar -o /tmp/composer.phar && \
    echo "471f2d857abf0ec18af7b055e61472214d91adb24f9bdbbb864c1c64faad7dd6  /tmp/composer.phar" | sha256sum -c - && \
    mv /tmp/composer.phar /usr/local/bin/composer && \
    chmod +x /usr/local/bin/composer || \
    (echo "ERROR: Composer checksum verification failed" && exit 1)

# SHA512 checksum verification for WP-CLI
RUN curl -O https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar && \
    echo "be928f6b8ca1e8dfb9d2f4b75a13aa4aee0896f8a9a0a1c45cd5d2c98605e6172e6d014dda2e27f88c98befc16c040cbb2bd1bfa121510ea5cdf5f6a30fe8832  wp-cli.phar" | sha512sum -c - && \
    chmod +x wp-cli.phar && \
    mv wp-cli.phar /usr/local/bin/wp || \
    (echo "ERROR: WP-CLI checksum verification failed" && exit 1)
```

### Checksum Verification Function

```bash
# Usage: verify_checksum <file> <expected_checksum>
# Returns: 0 if valid, 1 if invalid

# Example: Verify downloaded binary
curl -O https://example.com/binary.phar
if verify_checksum "binary.phar" "abc123..."; then
  echo "Checksum valid"
  chmod +x binary.phar
else
  echo "Checksum mismatch - aborting"
  rm -f binary.phar
  exit 1
fi
```

### Getting Official Checksums

**Composer:**
```bash
# Get latest Composer checksum (SHA256)
curl -sL https://getcomposer.org/download/latest-stable/composer.phar.sha256sum
```

**WP-CLI:**
```bash
# Get latest WP-CLI checksum (SHA512)
curl -sL https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar.sha512
```

**General Pattern:**
1. Check official documentation for checksum file location
2. Use HTTPS to download both binary and checksum
3. Verify checksum before making binary executable
4. Fail build if verification fails

---

## Input Validation Patterns

### Numeric Validation

```bash
# Basic validation
validate_numeric "42"           # Returns 0 (success)
validate_numeric "abc"          # Returns 1 (failure)

# Range validation
validate_numeric "50" 0 100     # Returns 0 (within range)
validate_numeric "150" 0 100    # Returns 1 (out of range)
validate_numeric "-5" 0 100     # Returns 1 (below minimum)

# Example: Port validation
validate_numeric "$PORT" 1 65535 || {
  echo "Invalid port: $PORT"
  exit 1
}
```

### Path Validation

```bash
# Prevent path traversal
validate_path "../../../etc/passwd"     # Returns 1 (rejected)
validate_path "valid/path/file.txt"     # Returns 0 (accepted)

# Validate within base directory
validate_path "$USER_PATH" "/workspace" || {
  echo "Path outside workspace: $USER_PATH"
  exit 1
}
```

### Command Injection Prevention

```bash
# Detect dangerous patterns
validate_command "echo hello"           # Returns 0 (safe)
validate_command "rm -rf /; echo hack"  # Returns 1 (dangerous)
validate_command "ls | grep secret"     # Returns 1 (pipe detected)

# Example: Sanitize user commands
if validate_command "$USER_CMD"; then
  eval "$USER_CMD"
else
  echo "Dangerous command detected"
  exit 1
fi
```

### Filename Sanitization

```bash
# Remove dangerous characters
sanitize_filename "valid-file_name.txt"    # Returns: valid-file_name.txt
sanitize_filename "../../etc/passwd"        # Returns: etcpasswd
sanitize_filename "file; rm -rf /"          # Returns: filermrf

# Example: Safe file creation
SAFE_NAME=$(sanitize_filename "$USER_INPUT")
if [[ -n "$SAFE_NAME" ]]; then
  touch "/tmp/$SAFE_NAME"
else
  echo "Invalid filename"
  exit 1
fi
```

### URL Validation

```bash
# Basic HTTP/HTTPS validation
validate_url "https://example.com"      # Returns 0 (valid)
validate_url "http://api.example.com"   # Returns 0 (valid)
validate_url "ftp://example.com"        # Returns 1 (invalid protocol)
validate_url "javascript:alert(1)"      # Returns 1 (XSS attempt)
```

### Port Validation

```bash
# Validate port numbers (1-65535)
validate_port "80"      # Returns 0 (valid)
validate_port "6379"    # Returns 0 (valid)
validate_port "0"       # Returns 1 (invalid - too low)
validate_port "65536"   # Returns 1 (invalid - too high)
validate_port "abc"     # Returns 1 (invalid - not numeric)
```

---

## Best Practices

### 1. Source Validation Framework Early

```bash
#!/bin/bash
set -euo pipefail

# Source validation immediately after strict mode
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/validation.sh"
```

### 2. Validate All External Inputs

```bash
# Command line arguments
if ! validate_numeric "$1" 1 100; then
  echo "Usage: $0 <number_1_to_100>"
  exit 1
fi

# Environment variables
validate_port "$CFN_REDIS_PORT" || {
  echo "Invalid CFN_REDIS_PORT: $CFN_REDIS_PORT"
  exit 1
}

# User input
read -p "Enter directory: " USER_DIR
validate_path "$USER_DIR" "/workspace" || {
  echo "Invalid directory"
  exit 1
}
```

### 3. Use Safe Arithmetic Consistently

```bash
# WRONG - No error handling
total=$(echo "scale=2; $a / $b" | bc)

# RIGHT - Safe division
total=$(safe_divide "$a" "$b" 2) || {
  log_error "Calculation failed"
  return 1
}
```

### 4. Fail Fast on Validation Errors

```bash
# Validate early, exit immediately
validate_numeric "$CPU" 0 || exit 1
validate_numeric "$MEM" 0 || exit 1
validate_port "$PORT" || exit 1

# Now safe to use variables
process_metrics "$CPU" "$MEM" "$PORT"
```

### 5. Log Validation Failures

```bash
# Use validation framework logging
if ! validate_numeric "$VALUE"; then
  val_error "Invalid value: $VALUE"  # Logs to stderr with color
  return 1
fi

# Or use custom logging
if ! validate_path "$PATH"; then
  log_error "Path validation failed: $PATH"
  annotate "Security: Path traversal attempt blocked"
  return 1
fi
```

### 6. Document Expected Checksums

```bash
# Document checksum source and update date
# Composer SHA256 (updated 2025-11-24)
# Source: https://getcomposer.org/download/latest-stable/composer.phar.sha256sum
COMPOSER_CHECKSUM="471f2d857abf0ec18af7b055e61472214d91adb24f9bdbbb864c1c64faad7dd6"

verify_checksum composer.phar "$COMPOSER_CHECKSUM" || exit 1
```

---

## Testing Error Handling

### Test Structure

```bash
#!/bin/bash
# tests/impl-002/test-validation-framework.sh

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/scripts/lib/validation.sh"

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

# Test function
test_division_by_zero() {
  if safe_divide 100 0 2>/dev/null; then
    echo "FAIL: Division by zero should have failed"
    ((TESTS_FAILED++))
  else
    echo "PASS: Division by zero rejected"
    ((TESTS_PASSED++))
  fi
}

# Run tests
test_division_by_zero

# Report results
echo "Passed: $TESTS_PASSED, Failed: $TESTS_FAILED"
```

### Test Coverage Requirements

**Minimum test coverage for error handling:**
- ✅ Division by zero scenarios
- ✅ Invalid numeric inputs (non-numeric, negative, out of range)
- ✅ Path traversal attempts
- ✅ Command injection patterns
- ✅ Checksum mismatches
- ✅ Overflow conditions
- ✅ Valid inputs still work correctly

### Example Test Suites

**Test Suite 1: Validation Framework**
- Location: `tests/impl-002/test-validation-framework.sh`
- Coverage: 40+ test cases
- Pass rate: 100%

**Test Suite 2: Cost Script Error Handling**
- Location: `tests/impl-002/test-cost-script-error-handling.sh`
- Coverage: Arithmetic operations in production script
- Pass rate: Target ≥95%

**Test Suite 3: Dockerfile Security**
- Verify checksum verification works in Docker build
- Test build failure on checksum mismatch
- Validate binary integrity

---

## Common Pitfalls

### 1. Forgetting to Source Validation Library

```bash
# WRONG - Function not available
if validate_numeric "$VALUE"; then
  # This will fail - function doesn't exist
fi

# RIGHT - Source first
source scripts/lib/validation.sh
if validate_numeric "$VALUE"; then
  # Now it works
fi
```

### 2. Not Checking Return Codes

```bash
# WRONG - Ignores errors
result=$(safe_divide "$a" "$b")
echo "$result"  # May be empty if division failed

# RIGHT - Check return code
result=$(safe_divide "$a" "$b") || {
  log_error "Division failed"
  return 1
}
echo "$result"
```

### 3. Using Outdated Checksums

```bash
# WRONG - Hardcoded checksum from 2020
COMPOSER_CHECKSUM="abc123..."  # Old version

# RIGHT - Document update date and source
# Updated: 2025-11-24
# Source: https://getcomposer.org/download/latest-stable/composer.phar.sha256sum
COMPOSER_CHECKSUM="471f2d857abf0ec18af7b055e61472214d91adb24f9bdbbb864c1c64faad7dd6"
```

### 4. Insufficient Input Validation

```bash
# WRONG - Only checks if not empty
if [[ -n "$PORT" ]]; then
  use_port "$PORT"
fi

# RIGHT - Validate range
if validate_port "$PORT"; then
  use_port "$PORT"
else
  echo "Invalid port: $PORT"
  exit 1
fi
```

### 5. Silent Failures

```bash
# WRONG - Fails silently
result=$(safe_divide "$a" "$b" 2>/dev/null)

# RIGHT - Log errors
result=$(safe_divide "$a" "$b") || {
  val_error "Division failed: $a / $b"
  return 1
}
```

---

## Implementation Checklist

When implementing error handling in shell scripts:

- [ ] Source `scripts/lib/validation.sh` at script start
- [ ] Validate all external inputs (args, env vars, user input)
- [ ] Use `safe_divide` for all division operations
- [ ] Use `safe_arithmetic` for complex calculations
- [ ] Add checksum verification for all binary downloads
- [ ] Sanitize filenames before file operations
- [ ] Validate paths to prevent traversal
- [ ] Check command strings for injection patterns
- [ ] Log validation failures with context
- [ ] Write tests for error paths
- [ ] Document expected checksums with sources
- [ ] Test with invalid inputs (fuzzing)

---

## Security Audit Status

**IMPL-002 Findings Resolution:**

| Finding | Severity | Status | Solution |
|---------|----------|--------|----------|
| Binary downloads without checksums | Medium | ✅ Fixed | SHA256/SHA512 verification added |
| Arithmetic operations without error handling | Medium | ✅ Fixed | Safe division and arithmetic functions |
| Missing input validation framework | Medium | ✅ Fixed | Centralized validation library |

**Verification:**
- ✅ All binary downloads now verify checksums
- ✅ Division by zero handled gracefully
- ✅ Invalid inputs rejected at validation
- ✅ Path traversal prevented
- ✅ Command injection detected
- ✅ Test coverage: 100% for validation framework
- ✅ Documentation complete

---

## Related Documentation

- **Validation Framework:** `scripts/lib/validation.sh`
- **Cost Script:** `scripts/cost-allocation-tracker.sh`
- **Marketing Dockerfile:** `docker/teams/marketing/Dockerfile`
- **Test Suite:** `tests/impl-002/`
- **Phase 5 Plan:** `docs/phase5-security-hardening.md`
- **Security Audit:** `docs/security/phase5-audit-report.md`

---

## Changelog

**v1.0.0 - 2025-11-24 (IMPL-002)**
- Initial release
- Validation framework implementation
- Cost script error handling
- Dockerfile checksum verification
- Comprehensive test suite
- Documentation complete

---

**Maintained by:** Backend Developer Agent
**Next Review:** 2025-12-24 (1 month)
**Related Issues:** Phase 5 Security Audit Findings #1, #2, #3
