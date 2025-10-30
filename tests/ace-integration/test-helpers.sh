#!/usr/bin/env bash
# Test Helpers for ACE Integration Tests

# Assertion Helpers
assert() {
    if [[ "$1" "$2" "$3" ]]; then
        echo "✅ Passed: $*"
    else
        echo "❌ Failed: $*"
        return 1
    fi
}

assert_equals() {
    if [[ "$1" == "$2" ]]; then
        echo "✅ Passed: $1 equals $2"
    else
        echo "❌ Failed: $1 does not equal $2"
        return 1
    fi
}

assert_contains() {
    if [[ "$1" == *"$2"* ]]; then
        echo "✅ Passed: $1 contains $2"
    else
        echo "❌ Failed: $1 does not contain $2"
        return 1
    fi
}

assert_not_empty() {
    if [[ -n "$1" ]]; then
        echo "✅ Passed: $1 is not empty"
    else
        echo "❌ Failed: Value is empty"
        return 1
    fi
}

assert_json_valid() {
    echo "$1" | jq -e . >/dev/null 2>&1
    if [[ $? -eq 0 ]]; then
        echo "✅ Passed: Valid JSON"
    else
        echo "❌ Failed: Invalid JSON"
        return 1
    fi
}

# Mock Implementation of Helpers (to be replaced with actual implementations)
extract_keywords() {
    local description="$1"
    echo "$description" | tr ' ' '\n' | grep -E '^[a-z]{3,}$' | jq -R . | jq -s .
}

classify_domain() {
    local description="$1"
    if [[ "$description" =~ (authentication|user|login|security) ]]; then
        echo "backend"
    elif [[ "$description" =~ (dashboard|responsive|layout|ui) ]]; then
        echo "frontend"
    elif [[ "$description" =~ (machine|learning|model|prediction|data) ]]; then
        echo "data-science"
    elif [[ "$description" =~ (pipeline|ci|integration|devops) ]]; then
        echo "devops"
    else
        echo "general"
    fi
}

execute_context_query() {
    local task="$1"
    local description=$(echo "$task" | jq -r '.description // ""')
    local domain=$(classify_domain "$description")
    local keywords=$(extract_keywords "$description")

    jq -n \
        --arg description "$description" \
        --arg domain "$domain" \
        --argjson keywords "$keywords" \
        '{description: $description, domain: $domain, keywords: $keywords}'
}

store_context_in_redis() {
    local task_id="$1"
    local context="$2"
    local ttl="${3:-3600}"  # Default 1 hour if not specified

    redis-cli \
        SET "ace_context:${task_id}" "$context" \
        EX "$ttl"
}

retrieve_context_from_redis() {
    local task_id="$1"
    redis-cli GET "ace_context:${task_id}"
}