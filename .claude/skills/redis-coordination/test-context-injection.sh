#!/bin/bash

# Context Injection Test Utility
# Validates end-to-end context propagation through CFN Loop layers

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default configuration
TASK_ID=""
TEST_MODE=false
VERBOSE=false
EPIC_CONTEXT=""
PHASE_CONTEXT=""
SUCCESS_CRITERIA=""

# Logging functions
log_info() {
    if [[ "$VERBOSE" == true ]]; then
        echo -e "${BLUE}[INFO]${NC} $1"
    fi
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Usage information
usage() {
    cat << EOF
Context Injection Test Utility

USAGE:
    $0 [OPTIONS]

OPTIONS:
    -t, --task-id <ID>        Task ID for Redis operations
    -e, --epic-context <JSON> Epic context JSON
    -p, --phase-context <JSON> Phase context JSON  
    -s, --success-criteria <JSON> Success criteria JSON
    --test-mode               Run in test mode with sample data
    -v, --verbose             Enable verbose logging
    -h, --help                Show this help message

EXAMPLES:
    # Test mode (validates infrastructure)
    $0 --test-mode

    # Production mode with custom contexts
    $0 -t "my-task-123" \\
        -e '{"epicGoal":"Build feature","inScope":["API"]}' \\
        -p '{"phaseId":"phase-1","deliverables":["api.js"]}' \\
        -s '{"acceptanceCriteria":["Tests pass"],"gateThreshold":0.8}'

EOF
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -t|--task-id)
                TASK_ID="$2"
                shift 2
                ;;
            -e|--epic-context)
                EPIC_CONTEXT="$2"
                shift 2
                ;;
            -p|--phase-context)
                PHASE_CONTEXT="$2"
                shift 2
                ;;
            -s|--success-criteria)
                SUCCESS_CRITERIA="$2"
                shift 2
                ;;
            --test-mode)
                TEST_MODE=true
                shift
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
    done
}

# Validate Redis connectivity
validate_redis() {
    log_info "Validating Redis connectivity..."
    if ! redis-cli ping > /dev/null 2>&1; then
        log_error "Redis is not available"
        return 1
    fi
    log_success "Redis connectivity validated"
}

# Validate JSON format
validate_json() {
    local json_string="$1"
    local context_type="$2"
    
    log_info "Validating $context_type JSON format..."
    if ! echo "$json_string" | jq . > /dev/null 2>&1; then
        log_error "Invalid JSON in $context_type: $json_string"
        return 1
    fi
    log_success "$context_type JSON format validated"
}

# Store context in Redis
store_context() {
    local context="$1"
    local context_type="$2"
    local redis_key="test:${TASK_ID}:${context_type}"
    
    log_info "Storing $context_type in Redis..."
    if ! redis-cli set "$redis_key" "$context" > /dev/null 2>&1; then
        log_error "Failed to store $context_type in Redis"
        return 1
    fi
    log_success "$context_type stored in Redis: $redis_key"
}

# Retrieve context from Redis
retrieve_context() {
    local context_type="$1"
    local redis_key="test:${TASK_ID}:${context_type}"
    
    log_info "Retrieving $context_type from Redis..."
    local retrieved=$(redis-cli get "$redis_key" 2>/dev/null || echo "")
    
    if [[ -z "$retrieved" ]]; then
        log_error "Failed to retrieve $context_type from Redis"
        return 1
    fi
    
    log_success "$context_type retrieved from Redis"
    echo "$retrieved"
}

# Test context propagation
test_propagation() {
    log_info "Testing context propagation..."
    
    local epic_retrieved=$(retrieve_context "epic-context")
    local phase_retrieved=$(retrieve_context "phase-context")
    local success_retrieved=$(retrieve_context "success-criteria")
    
    # Validate content matches
    if [[ "$epic_retrieved" != "$EPIC_CONTEXT" ]]; then
        log_error "Epic context mismatch"
        return 1
    fi
    
    if [[ "$phase_retrieved" != "$PHASE_CONTEXT" ]]; then
        log_error "Phase context mismatch"
        return 1
    fi
    
    if [[ "$success_retrieved" != "$SUCCESS_CRITERIA" ]]; then
        log_error "Success criteria mismatch"
        return 1
    fi
    
    log_success "All context propagation tests passed"
}

# Simulate agent context injection
simulate_agent_injection() {
    log_info "Simulating agent context injection..."
    
    # Create combined context for agent
    local combined_context=$(jq -n \
        --argjson epic "$EPIC_CONTEXT" \
        --argjson phase "$PHASE_CONTEXT" \
        --argjson success "$SUCCESS_CRITERIA" \
        '{
            epic: $epic,
            phase: $phase,
            success: $success
        }')
    
    # Create temporary agent script
    cat > /tmp/test-agent-context.sh << EOF
#!/bin/bash
CONTEXT="\$1"

echo "Agent received context:"
echo "\$CONTEXT" | jq .

# Validate agent can access all context layers
EPIC_GOAL=\$(echo "\$CONTEXT" | jq -r '.epic.epicGoal')
PHASE_ID=\$(echo "\$CONTEXT" | jq -r '.phase.phaseId')
GATE_THRESHOLD=\$(echo "\$CONTEXT" | jq -r '.success.gateThreshold')

echo "Epic Goal: \$EPIC_GOAL"
echo "Phase ID: \$PHASE_ID" 
echo "Gate Threshold: \$GATE_THRESHOLD"

# Create deliverables based on context
DELIVERABLES=\$(echo "\$CONTEXT" | jq -r '.phase.deliverables[]')
for deliverable in \$DELIVERABLES; do
    touch "/tmp/\$deliverable"
    echo "Created deliverable: \$deliverable"
done
EOF
    
    chmod +x /tmp/test-agent-context.sh
    
    # Execute agent script with context
    if /tmp/test-agent-context.sh "$combined_context"; then
        log_success "Agent context injection simulation successful"
    else
        log_error "Agent context injection simulation failed"
        return 1
    fi
    
    # Cleanup
    rm -f /tmp/test-agent-context.sh
}

# Cleanup test data
cleanup() {
    log_info "Cleaning up test data..."
    
    local test_keys=$(redis-cli keys "test:${TASK_ID}:*" 2>/dev/null || true)
    if [[ -n "$test_keys" ]]; then
        echo "$test_keys" | xargs redis-cli del > /dev/null
        log_success "Test keys cleaned up from Redis"
    fi
    
    # Cleanup temporary files
    rm -f /tmp/test-agent-context.sh
    local deliverables=$(echo "$PHASE_CONTEXT" | jq -r '.deliverables[]' 2>/dev/null || true)
    for deliverable in $deliverables; do
        rm -f "/tmp/$deliverable"
    done
}

# Test mode with sample data
run_test_mode() {
    log_info "Running in test mode..."
    
    # Generate test task ID
    TASK_ID="context-injection-test-$(date +%s)"
    
    # Sample context data
    EPIC_CONTEXT='{
        "epicGoal": "Test context injection validation",
        "inScope": ["Redis operations", "Agent spawning", "Context propagation"],
        "outOfScope": ["Performance optimization", "New context types"]
    }'
    
    PHASE_CONTEXT='{
        "phaseId": "test-phase",
        "deliverables": ["test-deliverable-1.txt", "test-deliverable-2.txt"],
        "directory": "/tmp/test-context",
        "acceptanceCriteria": ["All contexts propagated", "Deliverables created"]
    }'
    
    SUCCESS_CRITERIA='{
        "acceptanceCriteria": [
            "Epic context retrieved correctly",
            "Phase context injected successfully",
            "Success criteria visible to validators"
        ],
        "gateThreshold": 0.8,
        "maxIterations": 3
    }'
    
    log_success "Test mode data initialized"
}

# Main execution
main() {
    # Parse arguments
    parse_args "$@"
    
    # Validate required parameters
    if [[ "$TEST_MODE" == false ]]; then
        if [[ -z "$TASK_ID" || -z "$EPIC_CONTEXT" || -z "$PHASE_CONTEXT" || -z "$SUCCESS_CRITERIA" ]]; then
            log_error "Missing required parameters. Use --help for usage information."
            exit 1
        fi
    else
        run_test_mode
    fi
    
    log_info "Starting context injection validation"
    log_info "Task ID: $TASK_ID"
    echo "========================================"
    
    # Validation pipeline
    validate_redis || exit 1
    validate_json "$EPIC_CONTEXT" "epic-context" || exit 1
    validate_json "$PHASE_CONTEXT" "phase-context" || exit 1
    validate_json "$SUCCESS_CRITERIA" "success-criteria" || exit 1
    
    # Store contexts
    store_context "$EPIC_CONTEXT" "epic-context" || exit 1
    store_context "$PHASE_CONTEXT" "phase-context" || exit 1
    store_context "$SUCCESS_CRITERIA" "success-criteria" || exit 1
    
    # Test propagation
    test_propagation || exit 1
    
    # Simulate agent injection
    simulate_agent_injection || exit 1
    
    # Cleanup
    cleanup
    
    echo "========================================"
    log_success "Context injection validation completed successfully!"
    log_success "All tests passed - context propagation working correctly"
    
    if [[ "$TEST_MODE" == true ]]; then
        echo ""
        log_info "Test mode validated infrastructure readiness"
        log_info "Ready for production context injection testing"
    fi
}

# Handle cleanup on script exit
trap cleanup EXIT

# Run main function
main "$@"