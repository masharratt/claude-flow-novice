# Credential Loading Test Suite

**Phase 1.3b - Refactored Scripts Validation**

## Overview

Comprehensive TDD test suite validating credential loading functionality across 6 refactored shell scripts that now load credentials from root `.env` instead of hardcoded values.

## Refactored Scripts Under Test

All scripts use this standardized credential loading pattern:

```bash
PROJECT_ROOT=$(git rev-parse --show-toplevel)
if [ -f "$PROJECT_ROOT/.env" ]; then
    set -a
    source "$PROJECT_ROOT/.env"
    set +a
else
    echo "ERROR: Root .env not found"
    exit 1
fi
```

### Scripts Validated

1. **`scripts/security/pre-deployment-security-check.sh`** - Pre-deployment security validation
2. **`scripts/security/validate-secrets.sh`** - Secret validation and verification
3. **`scripts/security/rotate-secrets.sh`** - Credential rotation automation
4. **`scripts/trigger-dev-setup.sh`** - Trigger.dev environment setup
5. **`scripts/deployment/validate-environment.sh`** - Deployment environment validation
6. **`docker/trigger-dev/entrypoint.sh`** - Container entrypoint initialization

## Test Coverage

### Test Categories (Per Script)

Each script has **minimum 5 test cases** covering:

1. **Positive Tests**: Successful credential loading from valid `.env`
2. **Negative Tests**: Error handling when `.env` missing or invalid
3. **Edge Cases**: Empty `.env`, permission issues, malformed content
4. **Validation Tests**: Required credential detection and validation
5. **Integration Tests**: Real script existence and pattern verification

### Total Test Coverage

- **Total Test Files**: 6 individual test scripts
- **Test Cases**: 30+ total assertions (5-6 per script)
- **Fixture Files**: 3 mock `.env` files (valid, empty, malformed)
- **Coverage Target**: ≥95% pass rate

## Quick Start

### Run All Tests

```bash
./tests/security/credential-loading/run-all-tests.sh
```

Expected output:
```
==========================================
Credential Loading Test Suite
Phase 1.3b - Refactored Scripts Validation
==========================================

Running credential loading tests...

Running test-pre-deployment-security-check.sh... PASSED
Running test-validate-secrets.sh... PASSED
Running test-rotate-secrets.sh... PASSED
Running test-trigger-dev-setup.sh... PASSED
Running test-validate-environment.sh... PASSED
Running test-entrypoint.sh... PASSED

==========================================
Test Execution Summary
==========================================
Total Tests:  6
Passed:       6
Failed:       0
Pass Rate:    100.0%

✓ All credential loading tests passed!
```

### Run Individual Test

```bash
./tests/security/credential-loading/test-pre-deployment-security-check.sh
```

## Test Structure

### Directory Layout

```
tests/security/credential-loading/
├── README.md                              # This file
├── run-all-tests.sh                       # Test runner (returns pass rate)
│
├── fixtures/                              # Mock test data
│   ├── mock.env                          # Valid credentials (fake data)
│   ├── empty.env                         # Empty file edge case
│   └── malformed.env                     # Syntax error edge case
│
├── test-pre-deployment-security-check.sh  # Tests for pre-deployment script
├── test-validate-secrets.sh               # Tests for secret validation
├── test-rotate-secrets.sh                 # Tests for secret rotation
├── test-trigger-dev-setup.sh              # Tests for Trigger.dev setup
├── test-validate-environment.sh           # Tests for environment validation
└── test-entrypoint.sh                     # Tests for container entrypoint
```

### Test File Template

All test files follow the standard pattern from `tests/CLAUDE.md`:

```bash
#!/bin/bash
set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

cleanup() {
    rm -rf "$TEST_TMPDIR"
}
trap cleanup EXIT

test_loads_credentials_successfully() {
    log_step "GIVEN mock .env with credentials"
    # Setup test environment
    # WHEN script sources .env
    # THEN assert credentials loaded
    assert_success $?
}

test_fails_when_env_missing() {
    log_step "GIVEN no .env file"
    # Remove .env
    # WHEN script attempts to load
    # THEN assert exits with error
    assert_failure $?
}

# Run all tests
test_loads_credentials_successfully
test_fails_when_env_missing
```

## Test Fixtures

### mock.env

Valid `.env` file with fake credentials for testing:

```bash
# Trigger.dev configuration
TRIGGER_SECRET_KEY=tr_dev_mock_secret_key_12345
TRIGGER_API_KEY=tr_dev_mock_api_key_67890
TRIGGER_API_URL=https://api.trigger.dev

# Database credentials
DATABASE_URL=postgresql://testuser:testpass@localhost:5432/testdb
POSTGRES_PASSWORD=mock_postgres_password

# Redis credentials
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=mock_redis_password
```

**SECURITY NOTE**: These are test fixtures only. Never commit real credentials.

### empty.env

Empty file for testing edge cases:
```bash
# Empty .env file for testing edge cases
# No credentials defined
```

### malformed.env

Intentionally malformed `.env` for error handling tests:
```bash
# Valid key
VALID_KEY=valid_value

# Missing equals sign
INVALID_LINE_NO_EQUALS

# Unclosed quote
UNCLOSED_QUOTE="missing closing quote
```

## Test Categories by Script

### 1. pre-deployment-security-check.sh Tests

**Tests (5 cases)**:
- ✓ Loads credentials successfully from valid `.env`
- ✓ Fails gracefully when `.env` missing
- ✓ Fails when `.env` has incorrect permissions
- ✓ Validates required credentials are present
- ✓ Real script exists and uses credential loading pattern

**Coverage**: Credential loading, error handling, validation, integration

### 2. validate-secrets.sh Tests

**Tests (4 cases)**:
- ✓ Validates all required secrets successfully
- ✓ Detects missing secrets and reports specific keys
- ✓ Handles `.env` with only comments (no actual values)
- ✓ Real script uses credential loading pattern

**Coverage**: Multi-secret validation, missing credential detection, edge cases

### 3. rotate-secrets.sh Tests

**Tests (5 cases)**:
- ✓ Rotates secrets successfully with valid `.env`
- ✓ Fails rotation gracefully without `.env`
- ✓ Validates required keys before rotation
- ✓ Handles concurrent `.env` access safely
- ✓ Real script exists and uses pattern

**Coverage**: Secret rotation, concurrency, validation, error handling

### 4. trigger-dev-setup.sh Tests

**Tests (5 cases)**:
- ✓ Setup succeeds with valid Trigger.dev credentials
- ✓ Fails without required Trigger.dev API key
- ✓ Requires `.env` file to proceed
- ✓ Respects custom API URL configuration
- ✓ Real script exists and uses pattern

**Coverage**: Trigger.dev-specific validation, custom configuration, error handling

### 5. validate-environment.sh Tests

**Tests (5 cases)**:
- ✓ Validates production environment successfully
- ✓ Detects invalid `NODE_ENV` values
- ✓ Detects missing `DATABASE_URL`
- ✓ Validates staging environment configuration
- ✓ Real script exists and uses pattern

**Coverage**: Environment validation, deployment readiness, multi-environment support

### 6. entrypoint.sh Tests

**Tests (6 cases)**:
- ✓ Container starts successfully with valid config
- ✓ Startup fails without `TRIGGER_SECRET_KEY`
- ✓ Container requires `.env` file to start
- ✓ Starts with minimal required configuration
- ✓ Preserves all environment variables after sourcing
- ✓ Real script exists and uses pattern

**Coverage**: Container initialization, startup validation, environment preservation

## Success Criteria

### Pass Rate Target: ≥95%

All tests must achieve:
- **6/6 test scripts passing** (100% coverage)
- **30+ assertions validated** across all scripts
- **Clear error messages** for all failure scenarios
- **Integration validation** with real scripts

### Quality Gates

✓ **All positive tests pass**: Valid credential loading works
✓ **All negative tests pass**: Missing `.env` handled gracefully
✓ **All edge cases pass**: Empty, malformed, permission issues handled
✓ **Integration tests pass**: Real scripts verified to use pattern

## Usage Examples

### Running Tests During Development

```bash
# Run all tests after making changes
./tests/security/credential-loading/run-all-tests.sh

# Run specific script test for debugging
./tests/security/credential-loading/test-pre-deployment-security-check.sh

# Run with verbose output
bash -x ./tests/security/credential-loading/test-validate-secrets.sh
```

### CI/CD Integration

Add to your CI pipeline:

```yaml
- name: Test credential loading
  run: |
    ./tests/security/credential-loading/run-all-tests.sh
    if [ $? -ne 0 ]; then
      echo "Credential loading tests failed"
      exit 1
    fi
```

### Pre-Commit Hook

Add to `.git/hooks/pre-commit`:

```bash
#!/bin/bash
./tests/security/credential-loading/run-all-tests.sh
if [ $? -ne 0 ]; then
    echo "Credential loading tests failed. Commit aborted."
    exit 1
fi
```

## Troubleshooting

### Test Failures

**Error**: "Root .env not found"
- **Cause**: Test trying to access real `.env` instead of fixture
- **Fix**: Check `TEST_TMPDIR` setup in test script

**Error**: "Permission denied"
- **Cause**: Test script not executable
- **Fix**: `chmod +x tests/security/credential-loading/test-*.sh`

**Error**: "assert_success: command not found"
- **Cause**: Missing test-utils.sh
- **Fix**: Ensure `source "$PROJECT_ROOT/tests/test-utils.sh"` at top of test

### Mock Environment Issues

**Problem**: Tests pass but real scripts fail
- **Check**: Real `.env` file exists in project root
- **Verify**: Real `.env` contains all required variables
- **Compare**: Real credentials match format in `fixtures/mock.env`

**Problem**: Tests fail with "variable unbound"
- **Cause**: Missing variable in test fixture
- **Fix**: Add required variable to `fixtures/mock.env`

## Maintenance

### Adding New Scripts

When adding new scripts that use credential loading:

1. **Create test file**: `tests/security/credential-loading/test-<script-name>.sh`
2. **Add test cases**: Minimum 5 (positive, negative, edge, validation, integration)
3. **Update runner**: Add script to `run-all-tests.sh`
4. **Update docs**: Add script to this README
5. **Verify**: Run `./run-all-tests.sh` to confirm ≥95% pass rate

### Updating Fixtures

When credential requirements change:

1. **Update `fixtures/mock.env`**: Add new required variables
2. **Update all test scripts**: Add validation for new variables
3. **Run tests**: Verify all scripts still pass
4. **Document**: Update this README with new requirements

## Standards Compliance

### Tests Follow `tests/CLAUDE.md` Standards

✓ **Template structure**: `#!/bin/bash` + `set -euo pipefail`
✓ **Cleanup trap**: `trap cleanup EXIT`
✓ **GIVEN/WHEN/THEN**: Clear test structure
✓ **Assertion helpers**: `assert_success`, `assert_failure`, `assert_contains`
✓ **Test utilities**: `source "$PROJECT_ROOT/tests/test-utils.sh"`

### Security Best Practices

✓ **No real credentials**: All fixtures use fake data
✓ **Explicit markers**: Test files clearly marked as mocks
✓ **Cleanup**: Temporary files removed via trap
✓ **Isolation**: Tests use `$TEST_TMPDIR` for file operations

## Related Documentation

- **Test Standards**: `tests/CLAUDE.md` - Test authoring guidelines
- **Test Utils**: `tests/test-utils.sh` - Shared assertion helpers
- **Security Guide**: `docs/SECURITY.md` - Credential management practices
- **Refactor Context**: Phase 1.3b - Credential loading refactor

## Support

For issues or questions:
1. Check troubleshooting section above
2. Review individual test output for specific errors
3. Verify real scripts match expected pattern
4. Consult `tests/CLAUDE.md` for test authoring standards

## Changelog

**Phase 1.3b** (2025-11-23):
- Initial test suite creation
- 6 test scripts covering all refactored shell scripts
- 3 mock fixtures (valid, empty, malformed)
- Test runner with pass rate reporting
- Comprehensive documentation
