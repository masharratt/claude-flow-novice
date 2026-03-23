#!/usr/bin/env bash
set -euo pipefail

# generate-skill-update.sh - Generate skill update proposals from edge cases
# Creates test cases, proposes logic modifications, updates documentation

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_PATH="${DB_PATH:-${SCRIPT_DIR}/../../../../data/workflow-codification.db}"
PROPOSALS_DIR="${PROPOSALS_DIR:-${SCRIPT_DIR}/proposals}"

# Initialize proposals directory
init_proposals_dir() {
    mkdir -p "$PROPOSALS_DIR"
}

# Parse semantic version
parse_version() {
    local version="$1"
    local part="$2"  # major, minor, patch

    local major minor patch
    IFS='.' read -r major minor patch <<< "$version"

    case "$part" in
        major) echo "$major" ;;
        minor) echo "$minor" ;;
        patch) echo "$patch" ;;
        *) echo "0" ;;
    esac
}

# Increment semantic version
increment_version() {
    local version="$1"
    local increment_type="${2:-patch}"  # major, minor, patch

    local major minor patch
    major=$(parse_version "$version" "major")
    minor=$(parse_version "$version" "minor")
    patch=$(parse_version "$version" "patch")

    case "$increment_type" in
        major)
            echo "$((major + 1)).0.0"
            ;;
        minor)
            echo "${major}.$((minor + 1)).0"
            ;;
        patch)
            echo "${major}.${minor}.$((patch + 1))"
            ;;
        *)
            echo "$version"
            ;;
    esac
}

# Get edge case details
get_edge_case() {
    local edge_case_hash="$1"

    sqlite3 -json "$DB_PATH" <<EOF
SELECT * FROM edge_cases WHERE edge_case_hash = '$edge_case_hash';
EOF
}

# Generate test case
generate_test_case() {
    local skill_name="$1"
    local edge_case_hash="$2"
    local input_params="$3"
    local expected_output="$4"
    local actual_output="$5"
    local error_message="$6"

    cat <<TESTCASE
# Test Case: Edge Case $edge_case_hash

## Description
Regression test for edge case identified in production execution.

## Input Parameters
\`\`\`
$input_params
\`\`\`

## Expected Output
\`\`\`
$expected_output
\`\`\`

## Actual Output (Failure)
\`\`\`
$actual_output
\`\`\`

## Error Message
\`\`\`
$error_message
\`\`\`

## Test Implementation

\`\`\`bash
#!/usr/bin/env bash
set -euo pipefail

# Test: $skill_name - Edge Case $edge_case_hash

SCRIPT_DIR="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
SKILL_PATH="\${SCRIPT_DIR}/../${skill_name}.sh"

# Execute skill with edge case parameters
output=\$("\$SKILL_PATH" $input_params 2>&1) || exit_code=\$?

# Verify expected behavior
if [[ \$exit_code -eq 0 ]]; then
    if [[ "\$output" == "$expected_output" ]]; then
        echo "PASS: Edge case handled correctly"
        exit 0
    else
        echo "FAIL: Output mismatch"
        echo "Expected: $expected_output"
        echo "Actual: \$output"
        exit 1
    fi
else
    echo "FAIL: Unexpected exit code \$exit_code"
    exit 1
fi
\`\`\`

## Validation Criteria
- Exit code: 0 (success)
- Output matches expected value
- No error messages
- Execution time < 1000ms
TESTCASE
}

# Analyze edge case pattern
analyze_edge_case_pattern() {
    local skill_name="$1"
    local exit_code="$2"
    local input_params="$3"
    local error_message="$4"

    local pattern_analysis=""

    # Pattern detection logic
    if [[ "$error_message" =~ "timeout" ]]; then
        pattern_analysis="Timeout issue detected. Consider increasing timeout threshold or implementing retry logic."
    elif [[ "$error_message" =~ "connection" ]]; then
        pattern_analysis="Connection failure detected. Implement connection retry with exponential backoff."
    elif [[ "$error_message" =~ "not found" ]]; then
        pattern_analysis="Resource not found. Add existence check before operation."
    elif [[ "$error_message" =~ "permission" ]]; then
        pattern_analysis="Permission error. Validate permissions before execution or provide clear error message."
    elif [[ "$exit_code" -eq 127 ]]; then
        pattern_analysis="Command not found. Add dependency validation at script initialization."
    elif [[ "$exit_code" -eq 1 ]]; then
        pattern_analysis="General failure. Review error handling and add specific error messages."
    else
        pattern_analysis="Unknown pattern. Manual review required."
    fi

    echo "$pattern_analysis"
}

# Generate logic modification proposal
generate_logic_proposal() {
    local skill_name="$1"
    local pattern_analysis="$2"
    local input_params="$3"
    local error_message="$4"

    cat <<PROPOSAL
# Logic Modification Proposal

## Analysis
$pattern_analysis

## Proposed Changes

### 1. Input Validation Enhancement
\`\`\`bash
# Add parameter validation
validate_input() {
    local params=\$1

    # Extract and validate parameters
    # Example: Check for required fields, type validation, range checks

    if [[ ! \$params =~ valid_pattern ]]; then
        echo "Error: Invalid input parameters" >&2
        return 1
    fi

    return 0
}
\`\`\`

### 2. Error Handling Improvement
\`\`\`bash
# Enhanced error handling
execute_with_retry() {
    local max_retries=3
    local retry_delay=2
    local attempt=1

    while [[ \$attempt -le \$max_retries ]]; do
        if command_that_might_fail; then
            return 0
        else
            echo "Attempt \$attempt failed, retrying in \${retry_delay}s..." >&2
            sleep \$retry_delay
            ((attempt++))
        fi
    done

    echo "Error: Maximum retries exceeded" >&2
    return 1
}
\`\`\`

### 3. Edge Case Handling
\`\`\`bash
# Specific handling for edge case
handle_edge_case() {
    local input=\$1

    # Check for edge case condition
    if [[ condition_that_triggered_edge_case ]]; then
        # Apply specific handling logic
        echo "Edge case detected, applying special handling" >&2

        # Execute alternative logic path
        alternative_execution_path

        return \$?
    fi

    # Normal execution path
    return 0
}
\`\`\`

## Implementation Priority
1. High: Input validation (prevents invalid state)
2. Medium: Error handling (improves resilience)
3. Low: Edge case handling (addresses specific scenario)

## Backward Compatibility
- All changes maintain existing API contract
- New parameters are optional with sensible defaults
- Error messages provide clear migration guidance
PROPOSAL
}

# Generate documentation update
generate_documentation_update() {
    local skill_name="$1"
    local old_version="$2"
    local new_version="$3"
    local edge_case_hash="$4"

    cat <<DOCS
# Documentation Update: $skill_name v$new_version

## Changelog

### Version $new_version ($(date +%Y-%m-%d))

**Fixed:**
- Resolved edge case $edge_case_hash
- Enhanced input validation
- Improved error handling and messaging

**Changed:**
- Updated parameter validation logic
- Added retry mechanism for transient failures

**Added:**
- New edge case handling for specific input patterns
- Comprehensive test coverage for edge cases

## Migration Guide

### Upgrading from v$old_version to v$new_version

No breaking changes. This is a backward-compatible patch release.

**Recommended Actions:**
1. Update skill reference to v$new_version
2. Review new error messages in integration code
3. Validate that existing parameters still work as expected

**New Features:**
- Enhanced error messages provide more context
- Automatic retry for transient failures (configurable)
- Stricter input validation (prevents invalid states)

## Updated Examples

\`\`\`bash
# Example: Basic usage (unchanged)
$skill_name.sh --param1 value1 --param2 value2

# Example: New retry behavior (automatic)
# Transient failures now retry up to 3 times with exponential backoff

# Example: Enhanced error messages
# Old: "Error: Operation failed"
# New: "Error: Connection timeout after 30s (attempt 3/3)"
\`\`\`

## Testing Recommendations

1. Regression testing: Verify existing workflows still function
2. Edge case testing: Test with previously failing inputs
3. Performance testing: Validate retry logic doesn't impact latency
DOCS
}

# Generate complete proposal
generate_proposal() {
    local skill_name="$1"
    local edge_case_hash="$2"
    local occurrence_count="$3"

    # Get edge case details
    local edge_case_json
    edge_case_json=$(get_edge_case "$edge_case_hash")

    # Parse JSON (simplified - in production use jq)
    local skill_version exit_code input_params expected_output actual_output error_message
    skill_version=$(echo "$edge_case_json" | grep -o '"skill_version":"[^"]*"' | cut -d'"' -f4)
    exit_code=$(echo "$edge_case_json" | grep -o '"exit_code":[0-9]*' | cut -d':' -f2)
    input_params=$(echo "$edge_case_json" | grep -o '"input_params":"[^"]*"' | cut -d'"' -f4)
    expected_output=$(echo "$edge_case_json" | grep -o '"expected_output":"[^"]*"' | cut -d'"' -f4)
    actual_output=$(echo "$edge_case_json" | grep -o '"actual_output":"[^"]*"' | cut -d'"' -f4)
    error_message=$(echo "$edge_case_json" | grep -o '"error_message":"[^"]*"' | cut -d'"' -f4)

    # Increment version
    local new_version
    new_version=$(increment_version "$skill_version" "patch")

    # Analyze pattern
    local pattern_analysis
    pattern_analysis=$(analyze_edge_case_pattern "$skill_name" "$exit_code" "$input_params" "$error_message")

    # Create proposal directory
    local proposal_dir="${PROPOSALS_DIR}/${skill_name}_${edge_case_hash:0:8}_v${new_version}"
    mkdir -p "$proposal_dir"

    # Generate proposal components
    generate_test_case "$skill_name" "$edge_case_hash" "$input_params" "$expected_output" \
        "$actual_output" "$error_message" > "${proposal_dir}/test_case.md"

    generate_logic_proposal "$skill_name" "$pattern_analysis" "$input_params" \
        "$error_message" > "${proposal_dir}/logic_proposal.md"

    generate_documentation_update "$skill_name" "$skill_version" "$new_version" \
        "$edge_case_hash" > "${proposal_dir}/documentation_update.md"

    # Create summary
    cat > "${proposal_dir}/PROPOSAL_SUMMARY.md" <<SUMMARY
# Skill Update Proposal: $skill_name v$new_version

## Overview
Edge case $edge_case_hash occurred $occurrence_count times, triggering automatic proposal generation.

**Current Version:** $skill_version
**Proposed Version:** $new_version
**Generated:** $(date +"%Y-%m-%d %H:%M:%S")

## Edge Case Details
- **Exit Code:** $exit_code
- **Input Parameters:** $input_params
- **Error Message:** $error_message
- **Occurrence Count:** $occurrence_count

## Pattern Analysis
$pattern_analysis

## Proposal Components

1. **Test Case** (\`test_case.md\`)
   - Regression test for edge case
   - Executable test script
   - Validation criteria

2. **Logic Proposal** (\`logic_proposal.md\`)
   - Input validation enhancements
   - Error handling improvements
   - Edge case handling logic

3. **Documentation Update** (\`documentation_update.md\`)
   - Changelog entry
   - Migration guide
   - Updated examples

## Next Steps

1. **Review** proposal components
2. **Implement** proposed changes in skill script
3. **Test** using provided test case
4. **Update** skill documentation
5. **Deploy** new version
6. **Mark** edge case as resolved

## Approval Checklist

- [ ] Test case passes with proposed changes
- [ ] Backward compatibility maintained
- [ ] Documentation updated
- [ ] Version incremented correctly
- [ ] Edge case marked as resolved in database

## Commands

\`\`\`bash
# Mark edge case as resolved
track-edge-case.sh --action update-status \\
  --edge-case-hash "$edge_case_hash" \\
  --status "proposal_generated"

# After implementation
track-edge-case.sh --action update-status \\
  --edge-case-hash "$edge_case_hash" \\
  --status "resolved"
\`\`\`
SUMMARY

    echo "Generated skill update proposal: $proposal_dir"
    echo "Review PROPOSAL_SUMMARY.md for details"

    # Update edge case status
    sqlite3 "$DB_PATH" <<EOF
UPDATE edge_cases
SET status = 'proposal_generated'
WHERE edge_case_hash = '$edge_case_hash';
EOF
}

# Main execution
main() {
    # Initialize
    init_proposals_dir

    # Parse arguments
    local skill_name=""
    local edge_case_hash=""
    local occurrence_count=""

    while [[ $# -gt 0 ]]; do
        case $1 in
            --skill-name)
                skill_name="$2"
                shift 2
                ;;
            --edge-case-hash)
                edge_case_hash="$2"
                shift 2
                ;;
            --occurrence-count)
                occurrence_count="$2"
                shift 2
                ;;
            --help)
                cat <<HELP
Usage: generate-skill-update.sh [OPTIONS]

Options:
  --skill-name STRING         Skill name (required)
  --edge-case-hash STRING     Edge case hash (required)
  --occurrence-count INTEGER  Edge case occurrence count (required)

Environment Variables:
  DB_PATH                     Path to SQLite database (default: ./workflow-codification.db)
  PROPOSALS_DIR               Path to proposals directory (default: ./proposals)

Description:
  Generates comprehensive skill update proposal based on recurring edge case:
  - Test case (regression test)
  - Logic modification proposal
  - Documentation updates
  - Version increment (semantic versioning)

Output:
  Creates proposal directory: proposals/{skill_name}_{hash}_v{version}/
  - PROPOSAL_SUMMARY.md
  - test_case.md
  - logic_proposal.md
  - documentation_update.md

Example:
  generate-skill-update.sh \\
    --skill-name "cfn-coordination" \\
    --edge-case-hash "abc123..." \\
    --occurrence-count 5
HELP
                exit 0
                ;;
            *)
                echo "Unknown argument: $1" >&2
                exit 1
                ;;
        esac
    done

    # Validate arguments
    if [[ -z "$skill_name" || -z "$edge_case_hash" || -z "$occurrence_count" ]]; then
        echo "Error: --skill-name, --edge-case-hash, and --occurrence-count are required" >&2
        exit 1
    fi

    # Generate proposal
    generate_proposal "$skill_name" "$edge_case_hash" "$occurrence_count"
}

# Execute main if not sourced
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
