#!/bin/bash
set -euo pipefail

# Store success criteria in Redis for CFN Loop agents
# Usage: store-success-criteria.sh --task-id TASK_ID --criteria JSON_STRING

TASK_ID=""
CRITERIA_JSON=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --task-id)
            TASK_ID="$2"
            shift 2
            ;;
        --criteria)
            CRITERIA_JSON="$2"
            shift 2
            ;;
        *)
            echo "❌ Unknown option: $1" >&2
            echo "Usage: store-success-criteria.sh --task-id TASK_ID --criteria JSON_STRING" >&2
            exit 1
            ;;
    esac
done

# Validate inputs
if [[ -z "$TASK_ID" ]]; then
    echo "❌ --task-id required" >&2
    exit 1
fi

# SECURITY FIX: Validate TASK_ID format (prevent Redis key injection)
if ! [[ "$TASK_ID" =~ ^[a-zA-Z0-9_-]+$ ]]; then
    echo "❌ Invalid TASK_ID format: $TASK_ID (must be alphanumeric, dash, underscore only)" >&2
    exit 1
fi

if [[ -z "$CRITERIA_JSON" ]]; then
    echo "❌ --criteria required" >&2
    exit 1
fi

# Validate JSON syntax
if ! echo "$CRITERIA_JSON" | jq empty 2>/dev/null; then
    echo "❌ Invalid JSON in success criteria" >&2
    exit 1
fi

# Validate schema - require test_suites field
if ! echo "$CRITERIA_JSON" | jq -e '.test_suites' >/dev/null 2>&1; then
    echo "❌ Missing required field: test_suites" >&2
    exit 1
fi

# Validate test_suites is an array
if ! echo "$CRITERIA_JSON" | jq -e '.test_suites | type == "array"' >/dev/null 2>&1; then
    echo "❌ test_suites must be an array" >&2
    exit 1
fi

# Store in Redis using orchestrator's expected format
# Orchestrator reads from: cfn_loop:task:${TASK_ID}:context HGET success-criteria
REDIS_KEY="cfn_loop:task:${TASK_ID}:context"

# Store as HASH field (not STRING key) to match orchestrator expectations
if ! redis-cli HSET "$REDIS_KEY" "success-criteria" "$CRITERIA_JSON" > /dev/null 2>&1; then
    echo "❌ Failed to store success criteria in Redis" >&2
    exit 1
fi

# SECURITY FIX: Set expiration (24 hours) - MUST succeed to prevent key leaks
redis-cli EXPIRE "$REDIS_KEY" 86400 > /dev/null 2>&1 || {
    echo "❌ Failed to set TTL on success criteria (key will leak)" >&2
    exit 1
}

# Extract metadata for logging
TEST_SUITE_COUNT=$(echo "$CRITERIA_JSON" | jq -r '.test_suites | length')
GATE_MODE=$(echo "$CRITERIA_JSON" | jq -r '.gate_mode // "test-driven"')

echo "✅ Success criteria stored in Redis: $REDIS_KEY"
echo "   Test suites: $TEST_SUITE_COUNT"
echo "   Gate mode: $GATE_MODE"
echo "   TTL: 24 hours"
