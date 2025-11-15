#!/usr/bin/env bash
# Test Utility Functions

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Assert functions
assert_equals() {
    local expected="$1"
    local actual="$2"
    local message="${3:-Assertion failed}"

    if [ "$expected" = "$actual" ]; then
        echo -e "${GREEN}✓ Passed:${NC} $message"
    else
        echo -e "${RED}✗ Failed:${NC} $message"
        echo "  Expected: '$expected'"
        echo "  Actual:   '$actual'"
        return 1
    fi
}

assert_not_empty() {
    local value="$1"
    local message="${2:-Value should not be empty}"

    if [ -n "$value" ]; then
        echo -e "${GREEN}✓ Passed:${NC} $message"
    else
        echo -e "${RED}✗ Failed:${NC} $message"
        return 1
    fi
}

fail() {
    local message="$1"
    echo -e "${RED}✗ Test Failed:${NC} $message"
    return 1
}