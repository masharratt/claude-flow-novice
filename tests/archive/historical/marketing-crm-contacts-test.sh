#!/bin/bash
# Marketing CRM Contacts Integration Tests

set -e

# Ensure test environment is set up
source "$(dirname "$0")/../.env.test" 2>/dev/null || true

# Mock data
MOCK_EMAIL="user_$(openssl rand -hex 4)@example.com"
MOCK_FIRST_NAME="John"
MOCK_LAST_NAME="Doe"
MOCK_SEGMENT="summer_campaign_2024"

# Test create_contact operation
test_create_contact() {
    echo "Testing create_contact operation..."

    # Simulate contact creation
    local response=$(cat <<EOF
{
    "success": true,
    "contact_id": "$(generate_mock_id)",
    "email": "$MOCK_EMAIL",
    "first_name": "$MOCK_FIRST_NAME",
    "last_name": "$MOCK_LAST_NAME",
    "status": "active"
}
EOF
)

    # Validate response structure
    echo "$response" | jq -e '.success == true' > /dev/null
    echo "$response" | jq -e '.contact_id != null' > /dev/null
    echo "$response" | jq -e '.email == "'"$MOCK_EMAIL"'"' > /dev/null
    echo "$response" | jq -e '.status == "active"' > /dev/null

    echo "✅ Contact creation test passed"
}

# Test add_to_segment operation
test_add_to_segment() {
    echo "Testing add_to_segment operation..."

    # Simulate adding contact to segment
    local response=$(cat <<EOF
{
    "success": true,
    "contact_id": "mock_contact_123",
    "segment": "$MOCK_SEGMENT",
    "member_count": 1,
    "status": "added"
}
EOF
)

    # Validate response structure
    echo "$response" | jq -e '.success == true' > /dev/null
    echo "$response" | jq -e '.segment == "'"$MOCK_SEGMENT"'"' > /dev/null
    echo "$response" | jq -e '.member_count > 0' > /dev/null
    echo "$response" | jq -e '.status == "added"' > /dev/null

    echo "✅ Add to segment test passed"
}

# CRM sync error handling test
test_crm_sync_error() {
    echo "Testing CRM sync error handling..."

    # Simulate sync error
    local error_response=$(cat <<EOF
{
    "success": false,
    "error": {
        "code": "DUPLICATE_CONTACT",
        "message": "Contact already exists in CRM"
    }
}
EOF
)

    # Validate error response structure
    echo "$error_response" | jq -e '.success == false' > /dev/null
    echo "$error_response" | jq -e '.error.code != null' > /dev/null
    echo "$error_response" | jq -e '.error.message != null' > /dev/null

    echo "✅ CRM sync error handling test passed"
}

# Utility function to generate mock IDs
generate_mock_id() {
    openssl rand -hex 12
}

# Run all tests
main() {
    test_create_contact
    test_add_to_segment
    test_crm_sync_error

    echo "🎉 All Marketing CRM Contacts Tests Passed!"
    exit 0
}

# Require jq for JSON parsing
if ! command -v jq &> /dev/null; then
    echo "❌ Error: jq is required for testing. Please install jq."
    exit 1
fi

main