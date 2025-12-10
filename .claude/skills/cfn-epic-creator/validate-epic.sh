#!/bin/bash
set -euo pipefail

# CFN Epic Creator - Validate Epic JSON
# Validates generated epic JSON structure and content

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
CFN Epic Creator - Validate Epic JSON

USAGE:
    ./validate-epic.sh <json-file> [OPTIONS]

REQUIRED ARGUMENTS:
    <json-file>    Path to the epic JSON file to validate

OPTIONS:
    -v, --verbose    Show detailed validation output
    -s, --strict     Enable strict validation (fails on warnings)
    -h, --help       Show this help message

EXIT CODES:
    0    Validation passed
    1    Validation failed
    2    File not found or invalid JSON
    3    Missing required arguments

HELP_EOF
}

# Validate JSON structure
validate_json_structure() {
    local json_file="$1"
    local strict="${2:-false}"
    local verbose="${3:-false}"
    
    local validation_errors=0
    local validation_warnings=0
    
    if [[ "$verbose" == true ]]; then
        log_info "Validating JSON structure in: $json_file"
    fi
    
    # Check if file exists and is readable
    if [[ ! -f "$json_file" ]]; then
        log_error "File not found: $json_file"
        return 2
    fi
    
    if [[ ! -r "$json_file" ]]; then
        log_error "File not readable: $json_file"
        return 2
    fi
    
    # Check if valid JSON
    if ! jq empty "$json_file" 2>/dev/null; then
        log_error "Invalid JSON format in: $json_file"
        return 2
    fi
    
    # Check top-level structure
    if [[ "$verbose" == true ]]; then
        log_info "Checking top-level structure..."
    fi
    
    if ! jq -e '.epic' "$json_file" >/dev/null; then
        log_error "Missing required 'epic' object at top level"
        validation_errors=$((validation_errors + 1))
    fi
    
    # Validate epic metadata
    if [[ "$verbose" == true ]]; then
        log_info "Validating epic metadata..."
    fi
    
    local required_fields=("id" "title" "description" "status" "personas")
    local optional_fields=("priority" "estimatedDuration" "budget" "owner" "metadata" "implementationRoadmap" "totalCostBreakdown" "riskAssessment")
    
    for field in "${required_fields[@]}"; do
        if ! jq -e ".epic.${field}" "$json_file" >/dev/null; then
            log_error "Missing required epic field: ${field}"
            validation_errors=$((validation_errors + 1))
        elif [[ "$verbose" == true ]]; then
            log_success "Found required field: ${field}"
        fi
    done
    
    # Check optional fields
    for field in "${optional_fields[@]}"; do
        if jq -e ".epic.${field}" "$json_file" >/dev/null; then
            if [[ "$verbose" == true ]]; then
                log_info "Found optional field: ${field}"
            fi
        fi
    done
    
    # Validate epic ID format
    local epic_id
    epic_id=$(jq -r '.epic.id // empty' "$json_file")
    if [[ -n "$epic_id" ]]; then
        if [[ ! "$epic_id" =~ ^EPIC-[0-9]{6}$ ]]; then
            log_warning "Epic ID format should be 'EPIC-XXXXXX' (6 digits): $epic_id"
            validation_warnings=$((validation_warnings + 1))
        elif [[ "$verbose" == true ]]; then
            log_success "Epic ID has correct format: $epic_id"
        fi
    fi
    
    # Validate status
    local epic_status
    epic_status=$(jq -r '.epic.status // empty' "$json_file")
    if [[ -n "$epic_status" ]]; then
        case "$epic_status" in
            "not_started"|"in-progress"|"completed"|"blocked"|"in-review"|"cancelled")
                if [[ "$verbose" == true ]]; then
                    log_success "Epic status is valid: $epic_status"
                fi
                ;;
            *)
                log_warning "Unusual epic status: $epic_status"
                validation_warnings=$((validation_warnings + 1))
                ;;
        esac
    fi
    
    # Validate personas array
    if [[ "$verbose" == true ]]; then
        log_info "Validating personas array..."
    fi
    
    if ! jq -e '.epic.personas | type == "array"' "$json_file" >/dev/null; then
        log_error "epic.personas must be an array"
        validation_errors=$((validation_errors + 1))
    else
        local persona_count
        persona_count=$(jq -r '.epic.personas | length' "$json_file")
        if [[ "$persona_count" -ne 6 ]]; then
            log_error "Expected exactly 6 personas, found: $persona_count"
            validation_errors=$((validation_errors + 1))
        elif [[ "$verbose" == true ]]; then
            log_success "Found correct number of personas: $persona_count"
        fi
        
        # Validate each persona
        local required_persona_names=("product-owner" "architect" "security-specialist" "performance-specialist" "accessibility-advocate" "devops-engineer")
        local found_personas
        found_personas=$(jq -r '.epic.personas[].name' "$json_file")
        
        for persona_name in "${required_persona_names[@]}"; do
            if echo "$found_personas" | grep -q "^${persona_name}$"; then
                if [[ "$verbose" == true ]]; then
                    log_success "Found required persona: $persona_name"
                fi
                
                # Validate persona structure
                validate_persona_structure "$json_file" "$persona_name" "$verbose" || validation_errors=$((validation_errors + 1))
            else
                log_error "Missing required persona: $persona_name"
                validation_errors=$((validation_errors + 1))
            fi
        done
        
        # Check for unexpected personas
        while IFS= read -r found_persona; do
            if [[ ! " ${required_persona_names[*]} " =~ " ${found_persona} " ]]; then
                log_warning "Unexpected persona found: $found_persona"
                validation_warnings=$((validation_warnings + 1))
            fi
        done <<< "$found_personas"
    fi
    
    # Validate recommendations structure
    if [[ "$verbose" == true ]]; then
        log_info "Validating recommendations structure..."
    fi
    
    if ! jq -e '.epic.personas[].recommendations | type == "array"' "$json_file" >/dev/null; then
        log_error "Persona recommendations must be arrays"
        validation_errors=$((validation_errors + 1))
    else
        validate_recommendations "$json_file" "$verbose" || validation_errors=$((validation_errors + 1))
    fi
    
    # Validate metadata if present
    if jq -e '.epic.metadata' "$json_file" >/dev/null; then
        if [[ "$verbose" == true ]]; then
            log_info "Validating epic metadata..."
        fi
        
        validate_metadata "$json_file" "$verbose" || validation_errors=$((validation_errors + 1))
    fi
    
    # Report results
    echo ""
    log_info "=== Validation Results ==="
    
    if [[ $validation_errors -eq 0 ]]; then
        log_success "✅ All required validations passed"
    else
        log_error "❌ Found $validation_errors validation errors"
    fi
    
    if [[ $validation_warnings -gt 0 ]]; then
        log_warning "⚠️  Found $validation_warnings warnings"
        
        if [[ "$strict" == true ]]; then
            log_error "Strict mode enabled: treating warnings as errors"
            validation_errors=$((validation_errors + validation_warnings))
        fi
    fi
    
    echo ""
    log_info "Summary:"
    log_info "  Errors: $validation_errors"
    log_info "  Warnings: $validation_warnings"
    
    if [[ $validation_errors -eq 0 ]]; then
        echo ""
        log_success "JSON validation PASSED"
        return 0
    else
        echo ""
        log_error "JSON validation FAILED"
        return 1
    fi
}

# Validate individual persona structure
validate_persona_structure() {
    local json_file="$1"
    local persona_name="$2"
    local verbose="${3:-false}"
    
    local persona_query=".epic.personas[] | select(.name == \"${persona_name}\")"
    
    # Check required fields
    local required_persona_fields=("name" "reviewOrder" "status" "insights" "recommendations" "costAnalysis")
    
    for field in "${required_persona_fields[@]}"; do
        if ! jq -e "${persona_query} | .${field}" "$json_file" >/dev/null; then
            log_error "Missing required field in ${persona_name}: ${field}"
            return 1
        elif [[ "$verbose" == true ]]; then
            log_success "  ${persona_name}: Found required field: ${field}"
        fi
    done
    
    # Check reviewOrder
    local review_order
    review_order=$(jq -r "${persona_query} | .reviewOrder" "$json_file")
    if [[ ! "$review_order" =~ ^[1-6]$ ]]; then
        log_error "Invalid reviewOrder for ${persona_name}: $review_order (must be 1-6)"
        return 1
    fi
    
    # Check status
    local persona_status
    persona_status=$(jq -r "${persona_query} | .status" "$json_file")
    case "$persona_status" in
        "completed"|"failed"|"in-progress"|"pending")
            if [[ "$verbose" == true ]]; then
                log_success "  ${persona_name}: Status is valid: $persona_status"
            fi
            ;;
        *)
            log_warning "Unusual persona status for ${persona_name}: $persona_status"
            ;;
    esac
    
    # Check insights and recommendations are arrays
    if ! jq -e "${persona_query} | .insights | type == \"array\"" "$json_file" >/dev/null; then
        log_error "${persona_name}.insights must be an array"
        return 1
    fi
    
    if ! jq -e "${persona_query} | .recommendations | type == \"array\"" "$json_file" >/dev/null; then
        log_error "${persona_name}.recommendations must be an array"
        return 1
    fi
    
    return 0
}

# Validate recommendations structure
validate_recommendations() {
    local json_file="$1"
    local verbose="${2:-false}"
    
    local recommendation_count
    recommendation_count=$(jq '[.epic.personas[].recommendations[]] | length' "$json_file")
    
    if [[ "$verbose" == true ]]; then
        log_info "  Total recommendations found: $recommendation_count"
    fi
    
    # Check each recommendation has required fields
    local invalid_recs
    invalid_recs=$(jq -r '
        .epic.personas[] as $persona |
        $persona.recommendations[] | 
        select(has("id") == false or has("title") == false or has("type") == false or has("priority") == false) |
        "\($persona.name): Missing required fields"
    ' "$json_file")
    
    if [[ -n "$invalid_recs" ]]; then
        log_error "Invalid recommendations found:"
        echo "$invalid_recs" | sed 's/^/  /'
        return 1
    fi
    
    # Check recommendation types
    local invalid_types
    invalid_types=$(jq -r '
        .epic.personas[] as $persona |
        $persona.recommendations[] |
        select(.type != "blocking" and .type != "suggested") |
        "\($persona.name): Invalid type \(.type)"
    ' "$json_file")
    
    if [[ -n "$invalid_types" ]]; then
        log_error "Invalid recommendation types found:"
        echo "$invalid_types" | sed 's/^/  /'
        return 1
    fi
    
    # Check recommendation priorities
    local invalid_priorities
    invalid_priorities=$(jq -r '
        .epic.personas[] as $persona |
        $persona.recommendations[] |
        select(.priority != "critical" and .priority != "high" and .priority != "medium" and .priority != "low") |
        "\($persona.name): Invalid priority \(.priority)"
    ' "$json_file")
    
    if [[ -n "$invalid_priorities" ]]; then
        log_warning "Invalid recommendation priorities found:"
        echo "$invalid_priorities" | sed 's/^/  /'
    fi
    
    return 0
}

# Validate metadata structure
validate_metadata() {
    local json_file="$1"
    local verbose="${2:-false}"
    
    # Check for expected metadata fields
    local expected_metadata_fields=("createdAt" "reviewMode" "devopsEnforced")
    
    for field in "${expected_metadata_fields[@]}"; do
        if jq -e ".epic.metadata.${field}" "$json_file" >/dev/null; then
            if [[ "$verbose" == true ]]; then
                log_success "  Found metadata field: $field"
            fi
        fi
    done
    
    # Validate reviewMode
    local review_mode
    review_mode=$(jq -r '.epic.metadata.reviewMode // empty' "$json_file")
    if [[ -n "$review_mode" ]]; then
        case "$review_mode" in
            "mvp"|"standard"|"enterprise")
                if [[ "$verbose" == true ]]; then
                    log_success "  Review mode is valid: $review_mode"
                fi
                ;;
            *)
                log_warning "Invalid reviewMode in metadata: $review_mode"
                ;;
        esac
    fi
    
    # Check createdAt format (ISO 8601)
    local created_at
    created_at=$(jq -r '.epic.metadata.createdAt // empty' "$json_file")
    if [[ -n "$created_at" ]]; then
        if [[ "$created_at" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$ ]]; then
            if [[ "$verbose" == true ]]; then
                log_success "  createdAt has valid ISO 8601 format"
            fi
        else
            log_warning "createdAt does not match ISO 8601 format: $created_at"
        fi
    fi
    
    return 0
}

# Main execution
main() {
    # Parse command line arguments
    local json_file=""
    local verbose=false
    local strict=false
    local show_help=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help=true
                shift
                ;;
            -v|--verbose)
                verbose=true
                shift
                ;;
            -s|--strict)
                strict=true
                shift
                ;;
            -*)
                log_error "Unknown option: $1"
                log_error "Use -h or --help for usage information"
                exit 3
                ;;
            *)
                if [[ -z "$json_file" ]]; then
                    json_file="$1"
                else
                    log_error "Too many arguments"
                    log_error "Use -h or --help for usage information"
                    exit 3
                fi
                shift
                ;;
        esac
    done
    
    # Show help if requested
    if [[ "$show_help" == true ]]; then
        show_help
        exit 0
    fi
    
    # Validate required arguments
    if [[ -z "$json_file" ]]; then
        log_error "Missing required JSON file path"
        log_error "Use -h or --help for usage information"
        exit 3
    fi
    
    # Run validation
    validate_json_structure "$json_file" "$strict" "$verbose"
}

# Execute main function
main "$@"
