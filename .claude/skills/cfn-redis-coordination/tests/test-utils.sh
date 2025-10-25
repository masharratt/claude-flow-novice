#!/bin/bash

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Assert that two values are equal
assert_equals() {
    local actual="$1"
    local expected="$2"
    local message="${3:-Assertion failed}"

    if [[ "$actual" == "$expected" ]]; then
        echo -e "${GREEN}PASS${NC}: $message"
    else
        echo -e "${RED}FAIL${NC}: $message"
        echo "  Expected: $expected"
        echo "  Actual:   $actual"
        exit 1
    fi
}

# Assert that a string contains another string
assert_contains() {
    local haystack="$1"
    local needle="$2"
    local message="${3:-Assertion failed}"

    if [[ "$haystack" == *"$needle"* ]]; then
        echo -e "${GREEN}PASS${NC}: $message"
    else
        echo -e "${RED}FAIL${NC}: $message"
        echo "  Expected to contain: $needle"
        echo "  Actual:              $haystack"
        exit 1
    fi
}

# Error handling wrapper
safe_execute() {
    local cmd="$1"
    local error_msg="${2:-Command execution failed}"

    set +e
    $cmd
    local exit_code=$?
    set -e

    if [[ $exit_code -ne 0 ]]; then
        echo -e "${RED}ERROR${NC}: $error_msg (Exit code: $exit_code)"
        exit 1
    fi
}