#!/bin/bash

# Test Utilities for Bash Testing

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Assert functions
assert_equals() {
    local actual="$1"
    local expected="$2"
    local message="${3:-Assertion failed}"

    if [[ "$actual" != "$expected" ]]; then
        echo -e "${RED}❌ $message${NC}"
        echo "  Expected: $expected"
        echo "  Actual:   $actual"
        exit 1
    fi
    echo -e "${GREEN}✅ $message passed${NC}"
}

assert_not_empty() {
    local value="$1"
    local message="${2:-Value should not be empty}"

    if [[ -z "$value" ]]; then
        echo -e "${RED}❌ $message${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ $message passed${NC}"
}

assert_json_equals() {
    local json1="$1"
    local json2="$2"
    local message="${3:-JSON comparison failed}"

    # Requires jq for deep JSON comparison
    if ! echo "$json1" | jq -n "inputs == $json2"; then
        echo -e "${RED}❌ $message${NC}"
        echo "  JSON 1: $json1"
        echo "  JSON 2: $json2"
        exit 1
    fi
    echo -e "${GREEN}✅ $message passed${NC}"
}