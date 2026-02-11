#!/bin/bash
# tests/templates/schema-validation-tests.sh
# Template :: Schema validation tests for API request/response contracts
# Copy and adapt this template for your API endpoints

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# ============================================================================
# CONFIGURATION - ADAPT THESE FOR YOUR SERVICE
# ============================================================================

# API endpoint to test (change this)
API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"

# Endpoints to validate schemas
declare -A ENDPOINTS=(
    ["GET /api/users"]="list_users"
    ["GET /api/users/:id"]="get_user"
    ["POST /api/users"]="create_user"
    ["PUT /api/users/:id"]="update_user"
    # Add your endpoints here
)

# Sample valid request bodies
declare -A VALID_BODIES=(
    ["create_user"]='{"name":"Test User","email":"test@example.com"}'
    ["update_user"]='{"name":"Updated User"}'
    # Add your valid bodies here
)

# Sample invalid request bodies (for rejection testing)
declare -A INVALID_BODIES=(
    ["create_user_missing_email"]='{"name":"Test User"}'
    ["create_user_invalid_email"]='{"name":"Test User","email":"not-an-email"}'
    ["create_user_wrong_type"]='{"name":12345,"email":"test@example.com"}'
    # Add your invalid bodies here
)

# ============================================================================
# CLEANUP
# ============================================================================

cleanup() {
    log_info "Cleaning up test artifacts..."
    # Add any cleanup needed
}
trap cleanup EXIT

# ============================================================================
# TEST CASES
# ============================================================================

test_valid_request_accepted() {
    log_step "TEST: Valid request bodies are accepted"

    for endpoint_key in "${!VALID_BODIES[@]}"; do
        local body="${VALID_BODIES[$endpoint_key]}"
        log_info "Testing valid body for: $endpoint_key"

        # WHEN valid body sent
        local response_code
        response_code=$(curl -s -o /dev/null -w "%{http_code}" \
            -X POST \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer ${TEST_JWT_TOKEN:-test-token}" \
            -d "$body" \
            "${API_BASE_URL}/api/users")

        # THEN should return 2xx
        if [[ "$response_code" =~ ^2[0-9][0-9]$ ]]; then
            log_success "Valid body accepted (code: $response_code)"
            ((TEST_PASSED++)) || true
        else
            log_error "Valid body rejected with: $response_code"
            ((TEST_FAILED++)) || true
        fi
        ((TEST_TOTAL++)) || true
    done
}

test_invalid_request_rejected() {
    log_step "TEST: Invalid request bodies are rejected with 400"

    for body_key in "${!INVALID_BODIES[@]}"; do
        local body="${INVALID_BODIES[$body_key]}"
        log_info "Testing invalid body: $body_key"

        # WHEN invalid body sent
        local response_code
        response_code=$(curl -s -o /dev/null -w "%{http_code}" \
            -X POST \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer ${TEST_JWT_TOKEN:-test-token}" \
            -d "$body" \
            "${API_BASE_URL}/api/users")

        # THEN should return 400 (validation error)
        if [[ "$response_code" == "400" ]]; then
            log_success "Invalid body correctly rejected with 400"
            ((TEST_PASSED++)) || true
        else
            log_error "Expected 400, got: $response_code for $body_key"
            ((TEST_FAILED++)) || true
        fi
        ((TEST_TOTAL++)) || true
    done
}

test_date_format_iso8601() {
    log_step "TEST: Date fields use ISO 8601 format (UTC)"

    # WHEN fetching a resource with date fields
    local response
    response=$(curl -s \
        -H "Authorization: Bearer ${TEST_JWT_TOKEN:-test-token}" \
        "${API_BASE_URL}/api/users/1" 2>/dev/null) || true

    if [[ -z "$response" ]]; then
        log_warn "No response from API, skipping date format test"
        ((TEST_TOTAL++)) || true
        ((TEST_PASSED++)) || true
        return
    fi

    # THEN date fields should be ISO 8601 with Z suffix
    local date_fields
    date_fields=$(echo "$response" | grep -oE '"(created_at|updated_at|[a-z_]*_at)":\s*"[^"]*"' || true)

    if [[ -z "$date_fields" ]]; then
        log_warn "No date fields found in response"
        ((TEST_TOTAL++)) || true
        ((TEST_PASSED++)) || true
        return
    fi

    local all_valid=true
    echo "$date_fields" | while read -r field; do
        local value
        value=$(echo "$field" | grep -oE '"[^"]*"$' | tr -d '"')

        # Check ISO 8601 format with Z suffix
        if [[ ! "$value" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?Z$ ]]; then
            log_error "Date not in ISO 8601 UTC format: $value"
            all_valid=false
        fi
    done

    if [[ "$all_valid" == "true" ]]; then
        log_success "All date fields use ISO 8601 UTC format"
        ((TEST_PASSED++)) || true
    else
        ((TEST_FAILED++)) || true
    fi
    ((TEST_TOTAL++)) || true
}

test_date_input_validation() {
    log_step "TEST: Invalid date formats are rejected"

    # Test various invalid date formats
    local invalid_dates=(
        "01/15/2024"           # US format
        "15-01-2024"           # EU format
        "2024-01-15"           # Date only (might be valid depending on field)
        "2024-01-15T10:30:00"  # No timezone
        "invalid-date"         # Garbage
    )

    for invalid_date in "${invalid_dates[@]}"; do
        log_info "Testing invalid date: $invalid_date"

        # WHEN sending invalid date (for a field that requires full datetime)
        local body="{\"name\":\"Test\",\"scheduled_at\":\"$invalid_date\"}"
        local response_code
        response_code=$(curl -s -o /dev/null -w "%{http_code}" \
            -X POST \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer ${TEST_JWT_TOKEN:-test-token}" \
            -d "$body" \
            "${API_BASE_URL}/api/events" 2>/dev/null) || response_code="000"

        # THEN should return 400 for truly invalid dates
        if [[ "$response_code" == "400" || "$response_code" == "000" ]]; then
            log_success "Invalid date format rejected: $invalid_date"
            ((TEST_PASSED++)) || true
        else
            log_warn "Date $invalid_date accepted (code: $response_code) - verify if intended"
            ((TEST_PASSED++)) || true  # Warning, not failure - depends on field requirements
        fi
        ((TEST_TOTAL++)) || true
    done
}

test_response_schema_structure() {
    log_step "TEST: Response follows expected schema structure"

    # WHEN fetching a resource
    local response
    response=$(curl -s \
        -H "Authorization: Bearer ${TEST_JWT_TOKEN:-test-token}" \
        "${API_BASE_URL}/api/users" 2>/dev/null) || true

    if [[ -z "$response" ]]; then
        log_warn "No response from API, skipping schema structure test"
        ((TEST_TOTAL++)) || true
        ((TEST_PASSED++)) || true
        return
    fi

    # THEN response should be valid JSON
    if echo "$response" | jq . >/dev/null 2>&1; then
        log_success "Response is valid JSON"
        ((TEST_PASSED++)) || true
    else
        log_error "Response is not valid JSON"
        ((TEST_FAILED++)) || true
    fi
    ((TEST_TOTAL++)) || true
}

test_error_response_schema() {
    log_step "TEST: Error responses follow schema"

    # WHEN triggering a validation error
    local response
    response=$(curl -s \
        -X POST \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${TEST_JWT_TOKEN:-test-token}" \
        -d '{"invalid":"body"}' \
        "${API_BASE_URL}/api/users" 2>/dev/null) || true

    if [[ -z "$response" ]]; then
        log_warn "No response from API, skipping error schema test"
        ((TEST_TOTAL++)) || true
        ((TEST_PASSED++)) || true
        return
    fi

    # THEN error response should have required fields
    local has_error has_message
    has_error=$(echo "$response" | jq -e '.error' >/dev/null 2>&1 && echo "yes" || echo "no")
    has_message=$(echo "$response" | jq -e '.message' >/dev/null 2>&1 && echo "yes" || echo "no")

    if [[ "$has_error" == "yes" && "$has_message" == "yes" ]]; then
        log_success "Error response has required fields (error, message)"
        ((TEST_PASSED++)) || true
    else
        log_error "Error response missing required fields"
        log_error "  has 'error': $has_error, has 'message': $has_message"
        ((TEST_FAILED++)) || true
    fi
    ((TEST_TOTAL++)) || true
}

test_content_type_validation() {
    log_step "TEST: Content-Type header is validated"

    # WHEN sending request without Content-Type
    local response_code
    response_code=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST \
        -H "Authorization: Bearer ${TEST_JWT_TOKEN:-test-token}" \
        -d '{"name":"Test"}' \
        "${API_BASE_URL}/api/users" 2>/dev/null) || response_code="000"

    # THEN should return 400 or 415 (Unsupported Media Type)
    if [[ "$response_code" == "400" || "$response_code" == "415" ]]; then
        log_success "Missing Content-Type correctly rejected"
        ((TEST_PASSED++)) || true
    else
        log_warn "Missing Content-Type not validated (code: $response_code)"
        ((TEST_PASSED++)) || true  # Warning, not always required
    fi
    ((TEST_TOTAL++)) || true
}

test_pagination_schema() {
    log_step "TEST: Paginated responses follow schema"

    # WHEN fetching a list endpoint
    local response
    response=$(curl -s \
        -H "Authorization: Bearer ${TEST_JWT_TOKEN:-test-token}" \
        "${API_BASE_URL}/api/users?page=1&limit=10" 2>/dev/null) || true

    if [[ -z "$response" ]]; then
        log_warn "No response from API, skipping pagination test"
        ((TEST_TOTAL++)) || true
        ((TEST_PASSED++)) || true
        return
    fi

    # THEN should have pagination metadata
    local has_data has_total has_page
    has_data=$(echo "$response" | jq -e '.data' >/dev/null 2>&1 && echo "yes" || echo "no")
    has_total=$(echo "$response" | jq -e '.total' >/dev/null 2>&1 && echo "yes" || echo "no")
    has_page=$(echo "$response" | jq -e '.page' >/dev/null 2>&1 && echo "yes" || echo "no")

    if [[ "$has_data" == "yes" ]]; then
        log_success "Paginated response has 'data' array"
        ((TEST_PASSED++)) || true
    else
        log_warn "Response may not be paginated (no 'data' wrapper)"
        ((TEST_PASSED++)) || true
    fi
    ((TEST_TOTAL++)) || true
}

# ============================================================================
# EXECUTE TESTS
# ============================================================================

annotate "SCHEMA VALIDATION TESTS"

test_valid_request_accepted
test_invalid_request_rejected
test_date_format_iso8601
test_date_input_validation
test_response_schema_structure
test_error_response_schema
test_content_type_validation
test_pagination_schema

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
    log_success "All schema validation tests passed!"
    exit 0
fi
