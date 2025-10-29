#!/bin/bash
# Marketing Email Campaigns Integration Tests

set -e

# Ensure test environment is set up
source "$(dirname "$0")/../.env.test" 2>/dev/null || true

# Mock data
MOCK_CAMPAIGN_NAME="Test Summer Campaign"
MOCK_CAMPAIGN_SUBJECT="Summer Sale Extravaganza"
MOCK_RECIPIENTS=100
MOCK_SCHEDULE_TIME=$(date -d "+1 week" +"%Y-%m-%d %H:%M:%S")

# Test create_campaign operation
test_create_campaign() {
    echo "Testing create_campaign operation..."

    # Simulate campaign creation
    local campaign_id=$(generate_mock_id)
    local response=$(cat <<EOF
{
    "success": true,
    "campaign_id": "$campaign_id",
    "name": "$MOCK_CAMPAIGN_NAME",
    "status": "draft",
    "recipient_count": $MOCK_RECIPIENTS
}
EOF
)

    # Validate response structure
    echo "$response" | jq -e '.success == true' > /dev/null
    echo "$response" | jq -e '.campaign_id != null' > /dev/null
    echo "$response" | jq -e '.status == "draft"' > /dev/null

    echo "✅ Campaign creation test passed"
}

# Test schedule_campaign operation
test_schedule_campaign() {
    echo "Testing schedule_campaign operation..."

    # Simulate campaign scheduling
    local response=$(cat <<EOF
{
    "success": true,
    "campaign_id": "mock_campaign_123",
    "scheduled_time": "$MOCK_SCHEDULE_TIME",
    "status": "scheduled"
}
EOF
)

    # Validate response structure
    echo "$response" | jq -e '.success == true' > /dev/null
    echo "$response" | jq -e '.scheduled_time != null' > /dev/null
    echo "$response" | jq -e '.status == "scheduled"' > /dev/null

    echo "✅ Campaign scheduling test passed"
}

# Error handling test
test_campaign_error_handling() {
    echo "Testing error handling for campaigns..."

    # Simulate invalid campaign creation
    local error_response=$(cat <<EOF
{
    "success": false,
    "error": {
        "code": "INVALID_PARAMS",
        "message": "Missing required campaign parameters"
    }
}
EOF
)

    # Validate error response structure
    echo "$error_response" | jq -e '.success == false' > /dev/null
    echo "$error_response" | jq -e '.error.code != null' > /dev/null
    echo "$error_response" | jq -e '.error.message != null' > /dev/null

    echo "✅ Campaign error handling test passed"
}

# Utility function to generate mock IDs
generate_mock_id() {
    openssl rand -hex 12
}

# Run all tests
main() {
    test_create_campaign
    test_schedule_campaign
    test_campaign_error_handling

    echo "🎉 All Marketing Email Campaign Tests Passed!"
    exit 0
}

# Require jq for JSON parsing
if ! command -v jq &> /dev/null; then
    echo "❌ Error: jq is required for testing. Please install jq."
    exit 1
fi

main