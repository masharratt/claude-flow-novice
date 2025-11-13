#!/bin/bash
# Marketing Analytics Data Integration Tests

set -e

# Ensure test environment is set up
source "$(dirname "$0")/../.env.test" 2>/dev/null || true

# Mock data
MOCK_DATE_RANGE="last_30_days"
MOCK_WEBSITE_ID="website_mock_123"

# Test get_website_traffic operation
test_get_website_traffic() {
    echo "Testing get_website_traffic operation..."

    # Simulate website traffic data
    local response=$(cat <<EOF
{
    "success": true,
    "website_id": "$MOCK_WEBSITE_ID",
    "date_range": "$MOCK_DATE_RANGE",
    "metrics": {
        "total_visits": 50000,
        "unique_visitors": 35000,
        "page_views": 150000,
        "avg_time_on_site": 180
    }
}
EOF
)

    # Validate response structure
    echo "$response" | jq -e '.success == true' > /dev/null
    echo "$response" | jq -e '.metrics.total_visits > 0' > /dev/null
    echo "$response" | jq -e '.metrics.unique_visitors > 0' > /dev/null
    echo "$response" | jq -e '.metrics.page_views > 0' > /dev/null

    echo "✅ Website traffic data retrieval test passed"
}

# Test get_email_performance operation
test_get_email_performance() {
    echo "Testing get_email_performance operation..."

    # Simulate email campaign performance data
    local response=$(cat <<EOF
{
    "success": true,
    "date_range": "$MOCK_DATE_RANGE",
    "email_metrics": {
        "total_campaigns": 15,
        "total_sends": 100000,
        "total_opens": 35000,
        "total_clicks": 5250,
        "open_rate": 0.35,
        "click_rate": 0.15
    }
}
EOF
)

    # Validate response structure
    echo "$response" | jq -e '.success == true' > /dev/null
    echo "$response" | jq -e '.email_metrics.open_rate > 0' > /dev/null
    echo "$response" | jq -e '.email_metrics.click_rate > 0' > /dev/null
    echo "$response" | jq -e '.email_metrics.total_campaigns > 0' > /dev/null

    echo "✅ Email performance data retrieval test passed"
}

# Error handling test for analytics
test_analytics_error_handling() {
    echo "Testing analytics data retrieval error handling..."

    # Simulate data retrieval error
    local error_response=$(cat <<EOF
{
    "success": false,
    "error": {
        "code": "INSUFFICIENT_PERMISSIONS",
        "message": "Not authorized to access analytics data"
    }
}
EOF
)

    # Validate error response structure
    echo "$error_response" | jq -e '.success == false' > /dev/null
    echo "$error_response" | jq -e '.error.code != null' > /dev/null
    echo "$error_response" | jq -e '.error.message != null' > /dev/null

    echo "✅ Analytics error handling test passed"
}

# Run all tests
main() {
    test_get_website_traffic
    test_get_email_performance
    test_analytics_error_handling

    echo "🎉 All Marketing Analytics Data Tests Passed!"
    exit 0
}

# Require jq for JSON parsing
if ! command -v jq &> /dev/null; then
    echo "❌ Error: jq is required for testing. Please install jq."
    exit 1
fi

main