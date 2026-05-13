#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Configuration
MIN_DELIVERABLES=3
MIN_AGENT_TYPES=2
MIN_CONTEXT_SCORE=0.8
TIMEOUT_SECONDS=30

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
    exit 1
}

validate_deliverables() {
    local task_data="$1"
    local deliverables
    deliverables=$(echo "$task_data" | jq -r '.deliverables[]? // empty' 2>/dev/null || echo "")

    if [[ -z "$deliverables" ]]; then
        error "No deliverables found in task configuration"
    fi

    local deliverable_count
    deliverable_count=$(echo "$deliverables" | wc -l)

    if [[ $deliverable_count -lt $MIN_DELIVERABLES ]]; then
        error "Insufficient deliverables: $deliverable_count (minimum: $MIN_DELIVERABLES)"
    fi

    # Check for generic/deliverable anti-patterns
    while IFS= read -r deliverable; do
        if [[ "$deliverable" =~ ^(implementation|code|development|fix)$ ]]; then
            error "Generic deliverable detected: '$deliverable'. Be specific about file names and locations."
        fi
    done <<< "$deliverables"

    log "✓ Deliverables validation passed: $deliverable_count specific deliverables"
}

validate_agent_types() {
    local task_data="$1"
    local agent_types
    agent_types=$(echo "$task_data" | jq -r '.agent_types[]? // empty' 2>/dev/null || echo "")

    if [[ -z "$agent_types" ]]; then
        error "No agent types specified in task configuration"
    fi

    local agent_count
    agent_count=$(echo "$agent_types" | wc -l)

    if [[ $agent_count -lt $MIN_AGENT_TYPES ]]; then
        error "Insufficient agent types: $agent_count (minimum: $MIN_AGENT_TYPES for software tasks)"
    fi

    # Check for single-agent anti-patterns
    if [[ $agent_count -eq 1 ]]; then
        warn "Single agent type detected: ${agent_types}. Consider adding reviewer/tester agents."
    fi

    log "✓ Agent types validation passed: $agent_count agent types"
}

validate_context_completeness() {
    local task_data="$1"
    local score=0.0

    # Check for deliverables (0.3 points)
    if echo "$task_data" | jq -e '.deliverables and (.deliverables | length) > 0' >/dev/null 2>&1; then
        score=$(echo "$score + 0.3" | bc -l)
    fi

    # Check for acceptance criteria (0.3 points)
    if echo "$task_data" | jq -e '.acceptance_criteria and (.acceptance_criteria | length) > 0' >/dev/null 2>&1; then
        score=$(echo "$score + 0.3" | bc -l)
    fi

    # Check for in_scope/out_of_scope (0.2 points)
    if echo "$task_data" | jq -e '.in_scope and (.in_scope | length) > 0' >/dev/null 2>&1; then
        score=$(echo "$score + 0.1" | bc -l)
    fi

    if echo "$task_data" | jq -e '.out_of_scope and (.out_of_scope | length) > 0' >/dev/null 2>&1; then
        score=$(echo "$score + 0.1" | bc -l)
    fi

    # Check for directory specification (0.2 points)
    if echo "$task_data" | jq -e '.directory and (.directory | length) > 0' >/dev/null 2>&1; then
        score=$(echo "$score + 0.2" | bc -l)
    fi

    if (( $(echo "$score < $MIN_CONTEXT_SCORE" | bc -l) )); then
        error "Context completeness score: $score (minimum: $MIN_CONTEXT_SCORE)"
    fi

    log "✓ Context completeness validation passed: score $score"
}

validate_task_specificity() {
    local task_data="$1"
    local task_description
    task_description=$(echo "$task_data" | jq -r '.task_description // ""' 2>/dev/null || echo "")

    # Check for generic task descriptions
    local generic_patterns=("CFN Loop implementation" "implement feature" "fix bug" "create code")
    for pattern in "${generic_patterns[@]}"; do
        if [[ "$task_description" =~ $pattern ]]; then
            error "Generic task description detected: '$task_description'. Provide specific implementation details."
        fi
    done

    if [[ ${#task_description} -lt 20 ]]; then
        error "Task description too short: ${#task_description} characters (minimum: 20)"
    fi

    log "✓ Task specificity validation passed"
}

validate_namespace_requirements() {
    local task_data="$1"
    local zone_name
    zone_name=$(echo "$task_data" | jq -r '.zone_name // empty' 2>/dev/null || echo "")

    if [[ -z "$zone_name" ]]; then
        error "Zone name not specified in task configuration"
    fi

    # Validate zone name format
    if [[ ! "$zone_name" =~ ^[a-z0-9-]+$ ]]; then
        error "Invalid zone name format: '$zone_name'. Use lowercase letters, numbers, and hyphens only."
    fi

    log "✓ Namespace requirements validation passed: zone '$zone_name'"
}

main() {
    local config_file="$1"

    if [[ -z "$config_file" ]]; then
        error "Usage: $0 <task-config-file>"
    fi

    if [[ ! -f "$config_file" ]]; then
        error "Configuration file not found: $config_file"
    fi

    log "Starting task planning validation for: $config_file"

    # Read and validate JSON
    local task_data
    if ! task_data=$(jq . "$config_file" 2>/dev/null); then
        error "Invalid JSON in configuration file: $config_file"
    fi

    # Run all validations
    validate_deliverables "$task_data"
    validate_agent_types "$task_data"
    validate_context_completeness "$task_data"
    validate_task_specificity "$task_data"
    validate_namespace_requirements "$task_data"

    log "✅ Task planning validation completed successfully"

    # Output validated task data for next stage
    echo "$task_data" > "/tmp/validated-task-$(basename "$config_file")"
    log "Validated task data saved to: /tmp/validated-task-$(basename "$config_file")"
}

# Execute main function with all arguments
main "$@"