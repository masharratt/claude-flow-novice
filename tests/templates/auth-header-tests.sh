#!/usr/bin/env bash
# tests/templates/auth-header-tests.sh
# Template :: Authentication header validation tests per AUTH_PATTERN_SPEC.md
# Copy and adapt this template for your API endpoints

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# ============================================================================
# CONFIGURATION - ADAPT THESE FOR YOUR SERVICE
# ============================================================================

# API endpoint to test (change this)
API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"
PROTECTED_ENDPOINT="${PROTECTED_ENDPOINT:-/api/protected}"

# Valid test token (use a real test token for your service)
# NEVER use production tokens here
VALID_TOKEN="${TEST_JWT_TOKEN:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXIiLCJleHAiOjk5OTk5OTk5OTksImlhdCI6MTcwNDAwMDAwMH0.test-signature}"

# Expired token for testing (exp in the past)
EXPIRED_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXIiLCJleHAiOjE2MDAwMDAwMDAsImlhdCI6MTcwNDAwMDAwMH0.expired-signature"

# ============================================================================
# CLEANUP
# ============================================================================

cleanup() {
    log_info "Cleaning up test artifacts..."
    # Add any cleanup needed (containers, temp files, etc.)
}
trap cleanup EXIT

# ============================================================================
# TEST CASES - Per AUTH_PATTERN_SPEC.md
# ============================================================================

test_missing_auth_header() {
    log_step "TEST: Missing Authorization header returns 401"

    # WHEN request made without Authorization header
    local response_code
    response_code=$(curl -s -o /dev/null -w "%{http_code}" \
        "${API_BASE_URL}${PROTECTED_ENDPOINT}")

    # THEN should return 401 (not 403)
    if [[ "$response_code" == "401" ]]; then
        log_success "Missing auth header correctly returns 401"
        ((TEST_PASSED++)) || true
    else
        log_error "Expected 401, got $response_code"
        ((TEST_FAILED++)) || true
    fi
    ((TEST_TOTAL++)) || true
}

test_malformed_auth_header_no_bearer() {
    log_step "TEST: Authorization header without 'Bearer' prefix returns 401"

    # WHEN request made with token but no Bearer prefix
    local response_code
    response_code=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "Authorization: ${VALID_TOKEN}" \
        "${API_BASE_URL}${PROTECTED_ENDPOINT}")

    # THEN should return 401
    if [[ "$response_code" == "401" ]]; then
        log_success "Malformed header (no Bearer) correctly returns 401"
        ((TEST_PASSED++)) || true
    else
        log_error "Expected 401, got $response_code"
        ((TEST_FAILED++)) || true
    fi
    ((TEST_TOTAL++)) || true
}

test_malformed_auth_header_lowercase_bearer() {
    log_step "TEST: Authorization header with lowercase 'bearer' (should still work per HTTP spec)"

    # WHEN request made with lowercase 'bearer'
    local response_code
    response_code=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "Authorization: bearer ${VALID_TOKEN}" \
        "${API_BASE_URL}${PROTECTED_ENDPOINT}")

    # THEN should accept (case-insensitive per spec) or return 401 if strict
    # Adjust assertion based on your implementation choice
    if [[ "$response_code" == "200" || "$response_code" == "401" ]]; then
        log_success "Lowercase bearer handled (code: $response_code)"
        ((TEST_PASSED++)) || true
    else
        log_error "Unexpected response: $response_code"
        ((TEST_FAILED++)) || true
    fi
    ((TEST_TOTAL++)) || true
}

test_invalid_token_format() {
    log_step "TEST: Invalid token format returns 401"

    # WHEN request made with malformed token (not a JWT)
    local response_code
    response_code=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "Authorization: Bearer not-a-valid-jwt" \
        "${API_BASE_URL}${PROTECTED_ENDPOINT}")

    # THEN should return 401
    if [[ "$response_code" == "401" ]]; then
        log_success "Invalid token format correctly returns 401"
        ((TEST_PASSED++)) || true
    else
        log_error "Expected 401, got $response_code"
        ((TEST_FAILED++)) || true
    fi
    ((TEST_TOTAL++)) || true
}

test_expired_token() {
    log_step "TEST: Expired token returns 401"

    # WHEN request made with expired token
    local response_code
    response_code=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "Authorization: Bearer ${EXPIRED_TOKEN}" \
        "${API_BASE_URL}${PROTECTED_ENDPOINT}")

    # THEN should return 401
    if [[ "$response_code" == "401" ]]; then
        log_success "Expired token correctly returns 401"
        ((TEST_PASSED++)) || true
    else
        log_error "Expected 401, got $response_code"
        ((TEST_FAILED++)) || true
    fi
    ((TEST_TOTAL++)) || true
}

test_valid_token() {
    log_step "TEST: Valid token returns 200"

    # WHEN request made with valid token
    local response_code
    response_code=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "Authorization: Bearer ${VALID_TOKEN}" \
        "${API_BASE_URL}${PROTECTED_ENDPOINT}")

    # THEN should return 200
    if [[ "$response_code" == "200" ]]; then
        log_success "Valid token correctly returns 200"
        ((TEST_PASSED++)) || true
    else
        log_error "Expected 200, got $response_code"
        ((TEST_FAILED++)) || true
    fi
    ((TEST_TOTAL++)) || true
}

test_error_response_format() {
    log_step "TEST: Error response includes correct JSON format"

    # WHEN request made without auth
    local response
    response=$(curl -s \
        "${API_BASE_URL}${PROTECTED_ENDPOINT}")

    # THEN response should have error and message fields
    if echo "$response" | grep -q '"error"'; then
        if echo "$response" | grep -q '"message"'; then
            log_success "Error response has correct JSON format"
            ((TEST_PASSED++)) || true
        else
            log_error "Error response missing 'message' field"
            ((TEST_FAILED++)) || true
        fi
    else
        log_error "Error response missing 'error' field"
        ((TEST_FAILED++)) || true
    fi
    ((TEST_TOTAL++)) || true
}

test_www_authenticate_header() {
    log_step "TEST: 401 response includes WWW-Authenticate header"

    # WHEN request made without auth
    local headers
    headers=$(curl -s -D - -o /dev/null \
        "${API_BASE_URL}${PROTECTED_ENDPOINT}")

    # THEN should include WWW-Authenticate header
    if echo "$headers" | grep -qi "WWW-Authenticate"; then
        log_success "WWW-Authenticate header present"
        ((TEST_PASSED++)) || true
    else
        log_warn "WWW-Authenticate header missing (recommended by spec)"
        ((TEST_PASSED++)) || true  # Warning, not failure
    fi
    ((TEST_TOTAL++)) || true
}

# ============================================================================
# EXECUTE TESTS
# ============================================================================

annotate "AUTH HEADER TESTS - Per AUTH_PATTERN_SPEC.md"

test_missing_auth_header
test_malformed_auth_header_no_bearer
test_malformed_auth_header_lowercase_bearer
test_invalid_token_format
test_expired_token
test_valid_token
test_error_response_format
test_www_authenticate_header

# ============================================================================
# SUMMARY
# ============================================================================

annotate "TEST SUMMARY"
echo ""
log_info "Total:  $TEST_TOTAL"
log_success "Passed: $TEST_PASSED"
if [[ $TEST_FAILED -gt 0 ]]; then
    log_error "Failed: $TEST_FAILED"
    exit 1
else
    log_success "All auth header tests passed!"
    exit 0
fi
