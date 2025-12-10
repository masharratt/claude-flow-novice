#!/bin/bash
set -euo pipefail

# CFN Epic Creator - Main orchestration script
# Creates comprehensive epic definitions with sequential persona reviews

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EPIC_CREATOR_AGENT="$(realpath "${SCRIPT_DIR}/../../agents/cfn-dev-team/utility/epic-creator-v2.sh")"

# Default values
MODE="standard"
OUTPUT_FILE=""
ENFORCE_DEVOPS=false
VERBOSE=false
VALIDATE_ONLY=false
SHOW_HELP=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

# Show help message
show_help() {
    cat << 'HELP_EOF'
CFN Epic Creator - Creates comprehensive epic definitions with persona reviews

USAGE:
    ./invoke.sh "<epic-description>" [OPTIONS]

REQUIRED ARGUMENTS:
    <epic-description>    Detailed description of the epic to be analyzed

OPTIONS:
    -m, --mode <mode>         Review thoroughness level
                              mvp: Basic reviews only
                              standard: Full comprehensive reviews (default)
                              enterprise: Deep dive with compliance and governance
    
    -e, --enforce-devops      Make DevOps recommendations blocking instead of suggested
    
    -o, --output <path>       Output JSON file path
                              Default: epic-with-personas-YYYY-MM-DD-HH-mm-ss.json
    
    -v, --verbose             Enable verbose logging
    
    --validate-only           Validate generated epic JSON without creating file
    
    -h, --help                Show this help message

EXAMPLES:
    # Basic usage
    ./invoke.sh "Build a customer-facing analytics dashboard"

    # Enterprise mode with DevOps enforcement
    ./invoke.sh "Develop mobile banking app with biometric auth" \
        --mode=enterprise \
        --enforce-devops \
        --output=banking-epic.json

    # Validate generated structure
    ./invoke.sh "Create AR furniture placement app" \
        --validate-only \
        --verbose

EXIT CODES:
    0    Success
    1    General error
    2    Validation error
    3    Missing required arguments
    4    Invalid mode specified
    5    Agent execution failed

HELP_EOF
}

# Validate mode parameter
validate_mode() {
    local mode="$1"
    case "$mode" in
        mvp|standard|enterprise)
            return 0
            ;;
        *)
            log_error "Invalid mode: $mode"
            log_error "Valid modes: mvp, standard, enterprise"
            return 1
            ;;
    esac
}

# Generate default output filename
generate_output_filename() {
    local timestamp
    timestamp=$(date "+%Y-%m-%d-%H-%M-%S")
    echo "epic-with-personas-${timestamp}.json"
}

# Validate JSON structure
validate_json() {
    local json_file="$1"
    
    if [[ ! -f "$json_file" ]]; then
        log_error "JSON file not found: $json_file"
        return 1
    fi
    
    # Check if valid JSON
    if ! jq empty "$json_file" 2>/dev/null; then
        log_error "Invalid JSON format in: $json_file"
        return 1
    fi
    
    # Validate required structure
    local validation_errors=0
    
    # Check top-level epic object
    if ! jq -e '.epic' "$json_file" >/dev/null; then
        log_error "Missing required 'epic' object"
        validation_errors=$((validation_errors + 1))
    fi
    
    # Check required epic fields
    local required_fields=("id" "title" "description" "status" "personas")
    for field in "${required_fields[@]}"; do
        if ! jq -e ".epic.${field}" "$json_file" >/dev/null; then
            log_error "Missing required epic field: ${field}"
            validation_errors=$((validation_errors + 1))
        fi
    done
    
    # Check personas array
    if ! jq -e '.epic.personas | type == "array"' "$json_file" >/dev/null; then
        log_error "epic.personas must be an array"
        validation_errors=$((validation_errors + 1))
    else
        # Check for all 6 required personas
        local persona_count
        persona_count=$(jq -r '.epic.personas | length' "$json_file")
        if [[ "$persona_count" -ne 6 ]]; then
            log_error "Expected 6 personas, found: $persona_count"
            validation_errors=$((validation_errors + 1))
        fi
        
        # Validate each persona structure
        local persona_names=("product-owner" "architect" "security-specialist" "performance-specialist" "accessibility-advocate" "devops-engineer")
        local found_personas
        found_personas=$(jq -r '.epic.personas[].name' "$json_file")
        
        for persona in "${persona_names[@]}"; do
            if ! echo "$found_personas" | grep -q "^${persona}$"; then
                log_error "Missing required persona: $persona"
                validation_errors=$((validation_errors + 1))
            fi
        done
    fi
    
    # Check recommendations structure
    if ! jq -e '.epic.personas[].recommendations | type == "array"' "$json_file" >/dev/null; then
        log_error "Persona recommendations must be arrays"
        validation_errors=$((validation_errors + 1))
    fi
    
    if [[ $validation_errors -gt 0 ]]; then
        log_error "JSON validation failed with $validation_errors errors"
        return 1
    fi
    
    return 0
}

# Generate summary report
generate_summary() {
    local json_file="$1"
    
    echo ""
    log_info "=== Epic Summary Report ==="
    
    local epic_id
    epic_id=$(jq -r '.epic.id' "$json_file")
    local title
    title=$(jq -r '.epic.title' "$json_file")
    local status
    status=$(jq -r '.epic.status' "$json_file")
    local mode
    mode=$(jq -r '.epic.metadata.reviewMode // "standard"' "$json_file")
    
    echo -e "Epic ID: ${BLUE}${epic_id}${NC}"
    echo -e "Title: ${title}"
    echo -e "Status: ${status}"
    echo -e "Review Mode: ${mode}"
    
    # Persona summary
    echo ""
    echo "Persona Reviews:"
    while IFS= read -r persona; do
        local persona_name
        persona_name=$(jq -r '.name' <<< "$persona")
        local persona_status
        persona_status=$(jq -r '.status' "$persona")
        local rec_count
        rec_count=$(jq -r '.recommendations | length' "$persona")
        local blocking_count
        blocking_count=$(jq -r '.recommendations | map(select(.type == "blocking")) | length' "$persona")
        
        local status_icon
        case "$persona_status" in
            "completed")
                status_icon="✅"
                ;;
            "failed")
                status_icon="❌"
                ;;
            *)
                status_icon="⚠️"
                ;;
        esac
        
        echo -e "  ${status_icon} ${persona_name}: ${rec_count} recommendations (${blocking_count} blocking)"
    done < <(jq -c '.epic.personas[]' "$json_file")
    
    # Cost breakdown
    echo ""
    echo "Cost Analysis:"
    if jq -e '.epic.totalCostBreakdown' "$json_file" >/dev/null; then
        while IFS= read -r cost_item; do
            local category
            category=$(jq -r 'keys[0]' <<< "$cost_item")
            local amount
            amount=$(jq -r ".${category}" <<< "$cost_item")
            echo -e "  ${category}: ${YELLOW}${amount}${NC}"
        done < <(jq -c '.epic.totalCostBreakdown | to_entries | map({(.key): .value})[]' "$json_file")
    else
        echo -e "  ${YELLOW}No cost breakdown available${NC}"
    fi
    
    echo ""
}

# Main execution
main() {
    # Parse command line arguments
    local epic_description=""
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                SHOW_HELP=true
                shift
                ;;
            -m|--mode)
                MODE="$2"
                validate_mode "$MODE" || exit 4
                shift 2
                ;;
            -e|--enforce-devops)
                ENFORCE_DEVOPS=true
                shift
                ;;
            -o|--output)
                OUTPUT_FILE="$2"
                shift 2
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            --validate-only)
                VALIDATE_ONLY=true
                shift
                ;;
            -*)
                log_error "Unknown option: $1"
                log_error "Use -h or --help for usage information"
                exit 1
                ;;
            *)
                if [[ -z "$epic_description" ]]; then
                    epic_description="$1"
                else
                    # Append to description with space
                    epic_description="${epic_description} $1"
                fi
                shift
                ;;
        esac
    done
    
    # Show help if requested
    if [[ "$SHOW_HELP" == true ]]; then
        show_help
        exit 0
    fi
    
    # Validate required arguments
    if [[ -z "$epic_description" ]]; then
        log_error "Missing required epic description"
        log_error "Use -h or --help for usage information"
        exit 3
    fi
    
    # Set default output filename if not provided
    if [[ -z "$OUTPUT_FILE" ]]; then
        OUTPUT_FILE="$(generate_output_filename)"
    fi
    
    # Verbose logging
    if [[ "$VERBOSE" == true ]]; then
        log_info "Epic Description: $epic_description"
        log_info "Mode: $MODE"
        log_info "Output File: $OUTPUT_FILE"
        log_info "Enforce DevOps: $ENFORCE_DEVOPS"
    fi
    
    # Check if epic creator agent exists
    if [[ ! -f "$EPIC_CREATOR_AGENT" ]]; then
        log_error "Epic creator agent not found: $EPIC_CREATOR_AGENT"
        exit 5
    fi
    
    # Build agent command
    local agent_cmd=(
        "$EPIC_CREATOR_AGENT"
        "$epic_description"
        --mode="$MODE"
    )
    
    if [[ "$ENFORCE_DEVOPS" == true ]]; then
        agent_cmd+=(--enforce-devops)
    fi
    
    if [[ "$VALIDATE_ONLY" == false ]]; then
        agent_cmd+=(--output="$OUTPUT_FILE")
    fi
    
    # Execute epic creator agent
    log_info "Executing epic creator agent..."
    if [[ "$VERBOSE" == true ]]; then
        log_info "Command: ${agent_cmd[*]}"
    fi
    
    local temp_output
    temp_output=$(mktemp)
    trap "rm -f '$temp_output'" RETURN
    
    if ! "${agent_cmd[@]}" > "$temp_output" 2>&1; then
        log_error "Epic creator agent execution failed"
        if [[ "$VERBOSE" == true ]]; then
            cat "$temp_output"
        fi
        exit 5
    fi
    
    # Extract JSON from output if not validate-only
    if [[ "$VALIDATE_ONLY" == false ]]; then
        # The agent should have written to the output file directly
        if [[ ! -f "$OUTPUT_FILE" ]]; then
            log_error "Expected output file not created: $OUTPUT_FILE"
            exit 5
        fi
        
        # Validate the generated JSON
        log_info "Validating generated JSON structure..."
        if ! validate_json "$OUTPUT_FILE"; then
            log_error "JSON validation failed"
            exit 2
        fi
        
        log_success "Epic generated successfully: $OUTPUT_FILE"
        
        # Generate summary report
        generate_summary "$OUTPUT_FILE"
    else
        # For validate-only, extract JSON from temp output
        local json_content
        json_content=$(jq -c '.' "$temp_output" 2>/dev/null || echo '{"error": "No JSON output"}')
        
        # Write to temporary file for validation
        local temp_json
        temp_json=$(mktemp)
        trap "rm -f '$temp_json' '$temp_output'" RETURN
        
        echo "$json_content" > "$temp_json"
        
        if validate_json "$temp_json"; then
            log_success "JSON structure validation passed"
            generate_summary "$temp_json"
        else
            log_error "JSON structure validation failed"
            exit 2
        fi
    fi
    
    exit 0
}

# Execute main function
main "$@"
