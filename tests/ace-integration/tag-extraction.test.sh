#!/bin/bash
# Tag Extraction Test Suite

set -euo pipefail

SOURCE_SCRIPT="/mnt/c/Users/masha/Documents/claude-flow-novice/planning/ace-system/extract-tags.sh"

# Test Cases
test_basic_extraction() {
    local input_text="Implement user authentication system with JWT tokens"
    local files_list=".tsx .yml"
    local agent_types="backend-dev,security-specialist"

    local result=$(bash "$SOURCE_SCRIPT" "$input_text" "$files_list" "$agent_types")
    echo "Test Basic Extraction Result: $result"

    # Flexible core tag checks
    local required_tags=("authentication" "jwt" "security" "tokens" ".tsx" "backend" "api")
    local pass=0
    local total_required=${#required_tags[@]}

    # Validate required tags
    for tag in "${required_tags[@]}"; do
        if echo "$result" | jq -e 'any(. == "'"$tag"'")' >/dev/null; then
            ((pass++))
        fi
    done

    # Require at least 6 out of 7 tags
    local threshold=$((total_required * 6 / 7))
    if ((pass >= threshold)); then
        return 0
    else
        echo "Failed tags: Passed $pass out of $total_required"
        return 1
    fi
}

test_complex_extraction() {
    local input_text="Design scalable microservices architecture for cloud-native deployment"
    local files_list=".go .yml .docker"
    local agent_types="devops,backend-dev,architect"

    local result=$(bash "$SOURCE_SCRIPT" "$input_text" "$files_list" "$agent_types")
    echo "Test Complex Extraction Result: $result"

    # Precise core tag checks
    local required_tags=("microservices" "scalable" "architecture" "cloud-native" ".go" "backend" "devops" "deployment" "api")
    local pass=0
    local total_required=${#required_tags[@]}

    # Validate required tags
    for tag in "${required_tags[@]}"; do
        if echo "$result" | jq -e 'any(. == "'"$tag"'")' >/dev/null; then
            ((pass++))
        fi
    done

    # Require at least 7 out of 9 tags
    local threshold=$((total_required * 7 / 9))
    if ((pass >= threshold)); then
        return 0
    else
        echo "Failed tags: Passed $pass out of $total_required"
        return 1
    fi
}

# Run Tests
main() {
    local pass_count=0
    local total_tests=2

    if test_basic_extraction; then
        ((pass_count++))
        echo "✅ Basic Extraction Test Passed"
    else
        echo "❌ Basic Extraction Test Failed"
    fi

    if test_complex_extraction; then
        ((pass_count++))
        echo "✅ Complex Extraction Test Passed"
    else
        echo "❌ Complex Extraction Test Failed"
    fi

    # Calculate pass rate
    local pass_rate=$((pass_count * 100 / total_tests))
    echo "Pass Rate: ${pass_rate}%"

    # Exit with success/failure
    if ((pass_rate >= 95)); then
        exit 0
    else
        exit 1
    fi
}

main