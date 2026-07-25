# Test Templates

Reusable test templates for common validation scenarios. Copy and adapt for your specific endpoints.

## Available Templates

| Template | Spec Reference | Purpose |
|----------|---------------|---------|
| `auth-header-tests.sh` | `docs/specs/AUTH_PATTERN_SPEC.md` | Bearer token, JWT validation, error codes |
| `env-var-fallback-tests.sh` | `docs/specs/ENV_VAR_STANDARDS.md` | Secret validation, defaults, type coercion |
| `schema-validation-tests.sh` | `docs/specs/DATE_HANDLING_RULES.md` | Request/response schema, date formats |

## Usage

```bash
# Copy template to your test directory
cp tests/templates/auth-header-tests.sh tests/docker/auth/test-my-api-auth.sh

# Edit configuration section at top of file
# - Set API_BASE_URL
# - Set test tokens
# - Adjust endpoints

# Run
./tests/docker/auth/test-my-api-auth.sh
```

## Configuration

Each template has a **CONFIGURATION** section at the top. Adapt these variables:

```bash
# API endpoint
API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"

# Test tokens (use test/mock tokens, never production)
VALID_TOKEN="${TEST_JWT_TOKEN:-...}"

# Required secrets to validate
REQUIRED_SECRETS=("AUTH_JWT_SECRET" "DB_POSTGRES_URL")
```

## Adding New Tests

Templates follow the pattern in `tests/CLAUDE.md`:

1. Source `test-utils.sh`
2. Define `cleanup()` trap
3. Write `test_*()` functions
4. Use `log_step`, `log_success`, `log_error`
5. Track `TEST_TOTAL`, `TEST_PASSED`, `TEST_FAILED`
