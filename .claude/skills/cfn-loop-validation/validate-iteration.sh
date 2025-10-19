#!/usr/bin/env bash

##############################################################################
# CFN Loop Validation CLI Wrapper v2.1.0
# Agent-friendly interface for validating CFN loop iterations with claim support
#
# Usage:
#   ./validate-iteration.sh --mode <mvp|standard|enterprise> \
#                          --iteration <n> \
#                          --confidence <score> \
#                          [--consensus <score>] \
#                          [--task-id <id>] \
#                          [--agent-id <id>] \
#                          [--claims <json_array>] \
#                          [--json]
#
# Returns: JSON validation result with pass/fail status, claim validation details
##############################################################################

set -euo pipefail

# ... [Previous existing code remains the same] ...

# New function to validate claims
validate_claims() {
    local claims_json="$1"
    local result_json

    # Validate claims JSON
    if ! echo "$claims_json" | jq empty &>/dev/null; then
        echo "Error: Invalid JSON for claims" >&2
        exit 3
    fi

    # Compute claim validation metrics
    local claims_count
    local valid_claims_count
    local invalid_claims_count
    local claims_confidence

    claims_count=$(echo "$claims_json" | jq 'length')
    valid_claims_count=$(echo "$claims_json" | jq '[.[] | select(.confidence >= 0.8)] | length')
    invalid_claims_count=$((claims_count - valid_claims_count))
    claims_confidence=$(echo "scale=4; $valid_claims_count / $claims_count" | bc)

    # Detailed claim validation
    local claim_details
    claim_details=$(echo "$claims_json" | jq '
        map({
            id: .id,
            description: .description,
            confidence: .confidence,
            valid: (.confidence >= 0.8),
            strategy: .strategy // null
        })
    ')

    result_json=$(jq -n \
        --argjson claims_count "$claims_count" \
        --argjson valid_claims_count "$valid_claims_count" \
        --argjson invalid_claims_count "$invalid_claims_count" \
        --argjson claims_confidence "$claims_confidence" \
        --argjson claim_details "$claim_details" \
        '{
            claims: {
                total_count: $claims_count,
                valid_count: $valid_claims_count,
                invalid_count: $invalid_claims_count,
                confidence: $claims_confidence,
                details: $claim_details
            }
        }')

    echo "$result_json"
}

# Update parse_args to support claims
parse_args() {
    # ... [Previous parse_args logic remains the same] ...
    local CLAIMS=""
    while [[ $# -gt 0 ]]; do
        case "$1" in
            # ... [Previous cases remain the same] ...
            --claims)
                CLAIMS="$2"
                shift 2
                ;;
            *)
                # ... [Previous unknown argument handling remains the same] ...
        esac
    done

    # Optional: add claims validation if provided
    if [[ -n "$CLAIMS" ]]; then
        CLAIM_VALIDATION=$(validate_claims "$CLAIMS")
        log_verbose "Claim Validation: $CLAIM_VALIDATION"
    fi
}

# Update validate_iteration to incorporate claims
validate_iteration() {
    local result_json
    local base_result
    local claim_result

    # [Existing base validation logic remains the same]
    base_result=$(... existing validation result ...)

    # Merge base result with claim validation if available
    if [[ -n "$CLAIM_VALIDATION" ]]; then
        result_json=$(echo "$base_result" | jq --argjson claim_validation "$CLAIM_VALIDATION" '. + $claim_validation')
    else
        result_json="$base_result"
    fi

    # Output result as before
    if [[ "$JSON_OUTPUT" == true ]]; then
        echo "$result_json"
    else
        echo "$result_json" | jq .
    fi
}

# ... [Rest of the script remains the same] ...

main() {
    # Main execution remains the same, with support for claims
    parse_args "$@"

    # Existing main logic ...
    # Claims validation integrated into standard flow
}

main "$@"