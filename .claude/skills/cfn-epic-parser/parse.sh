#!/usr/bin/env bash

# cfn-epic-parser/parse.sh
# Parses natural language epic documents from markdown files and converts them to structured JSON
# Supports both MDAP and CFN Loop execution modes

set -euo pipefail

# Default values
INPUT_FILE=""
OUTPUT_FILE=""
MODE="auto"
VALIDATE_ONLY=false
VERBOSE=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    if [[ "$VERBOSE" == "true" ]]; then
        echo -e "${BLUE}[INFO]${NC} $1" >&2
    fi
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" >&2
}

# Help text
show_help() {
    cat << EOF
cfn-epic-parser - Parse epic markdown documents into structured JSON

USAGE:
    parse.sh <input.md> [OPTIONS]

ARGUMENTS:
    input.md        Path to the epic markdown file to parse

OPTIONS:
    -o, --output <file>    Output JSON file path (default: stdout)
    -m, --mode <mode>      Execution mode: mdap, cfn-loop, or auto (default: auto)
    -v, --validate         Validate epic structure without generating output
    -V, --verbose          Enable verbose logging
    -h, --help             Show this help message

EXAMPLES:
    # Parse with auto-detected mode
    parse.sh planning/my-epic.md

    # Force MDAP mode
    parse.sh planning/my-epic.md --mode mdap

    # Force CFN Loop mode with output file
    parse.sh planning/my-epic.md --mode cfn-loop --output epic-config.json

    # Validate only
    parse.sh planning/my-epic.md --validate

MODE DESCRIPTIONS:
    auto        Automatically detect mode based on epic content
    mdap        Generate MDAP-compatible configuration (atomic tasks)
    cfn-loop    Generate CFN Loop configuration (phased execution)

EOF
}

# Parse command-line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -o|--output)
                OUTPUT_FILE="$2"
                shift 2
                ;;
            --output=*)
                OUTPUT_FILE="${1#*=}"
                shift
                ;;
            -m|--mode)
                MODE="$2"
                shift 2
                ;;
            --mode=*)
                MODE="${1#*=}"
                shift
                ;;
            -v|--validate)
                VALIDATE_ONLY=true
                shift
                ;;
            -V|--verbose)
                VERBOSE=true
                shift
                ;;
            -*)
                log_error "Unknown option: $1"
                echo "Use --help for usage information" >&2
                exit 1
                ;;
            *)
                if [[ -z "$INPUT_FILE" ]]; then
                    INPUT_FILE="$1"
                else
                    log_error "Multiple input files specified"
                    exit 1
                fi
                shift
                ;;
        esac
    done

    # Validate required arguments
    if [[ -z "$INPUT_FILE" ]]; then
        log_error "Input file is required"
        echo "Use --help for usage information" >&2
        exit 1
    fi

    # Validate mode
    if [[ ! "$MODE" =~ ^(auto|mdap|cfn-loop)$ ]]; then
        log_error "Invalid mode: $MODE"
        echo "Valid modes: auto, mdap, cfn-loop" >&2
        exit 1
    fi
}

# Validate input file
validate_input() {
    if [[ ! -f "$INPUT_FILE" ]]; then
        log_error "Input file not found: $INPUT_FILE"
        exit 1
    fi

    if [[ ! "$INPUT_FILE" =~ \.md$ ]]; then
        log_warn "Input file does not have .md extension: $INPUT_FILE"
    fi

    # Check if file is readable
    if [[ ! -r "$INPUT_FILE" ]]; then
        log_error "Cannot read input file: $INPUT_FILE"
        exit 1
    fi

    log_info "Input file validated: $INPUT_FILE"
}

# Extract epic metadata from markdown
extract_metadata() {
    local file="$1"
    local content

    content=$(cat "$file")

    # Extract epic ID
    local epic_id
    epic_id=$(echo "$content" | grep -iE "^\s*[*_]*Epic ID[*_]*[:\s]+" | head -1 | sed -E 's/^\s*[*_]*Epic ID[*_]*[:\s]+//' | tr -d '`\r' | xargs)

    # Extract title
    local title
    title=$(echo "$content" | grep -E "^#{1,2}\s+" | head -1 | sed -E 's/^#{1,2}\s+//' | tr -d '\r' | xargs)

    # Extract status
    local status
    status=$(echo "$content" | grep -iE "^\s*[*_]*Status[*_]*[:\s]+" | head -1 | sed -E 's/^\s*[*_]*Status[*_]*[:\s]+//' | sed 's/❌\|✅\|⚠️//g' | tr -d '\r' | xargs)
    [[ -z "$status" ]] && status="not_started"

    # Extract priority
    local priority
    priority=$(echo "$content" | grep -iE "^\s*[*_]*Priority[*_]*[:\s]+" | head -1 | sed -E 's/^\s*[*_]*Priority[*_]*[:\s]+//' | tr -d '\r' | xargs)
    [[ -z "$priority" ]] && priority="medium"

    # Extract duration
    local duration
    duration=$(echo "$content" | grep -iE "^\s*[*_]*Estimated\s+Duration[*_]*[:\s]+" | head -1 | sed -E 's/^\s*[*_]*Estimated\s+Duration[*_]*[:\s]+//' | tr -d '\r' | xargs)

    # Extract owner
    local owner
    owner=$(echo "$content" | grep -iE "^\s*[*_]*Owner[*_]*[:\s]+" | head -1 | sed -E 's/^\s*[*_]*Owner[*_]*[:\s]+//' | tr -d '\r' | xargs)

    # Extract description
    description=$(echo "$content" | sed -n '/## Epic Description/,/^##/p' | sed '1d;$d' | sed '/^$/d' | tr -d '\r\n' | xargs)

    # Generate epic ID if not found
    if [[ -z "$epic_id" ]]; then
        # Derive from filename
        local basename
        basename=$(basename "$file" .md)
        epic_id="epic-${basename,,}"
        epic_id=$(echo "$epic_id" | sed 's/[^a-z0-9-]/-/g' | sed 's/-\+/-/g' | sed 's/^-\|-$//g')
        log_warn "No Epic ID found, generated: $epic_id"
    fi

    # Generate title if not found
    if [[ -z "$title" ]]; then
        title="$epic_id"
        log_warn "No title found, using epic ID"
    fi

    # Output metadata as JSON
    cat << EOF
{
  "epicId": "$epic_id",
  "name": "$title",
  "description": "$description",
  "status": "$status",
  "priority": "$priority",
  "estimatedDuration": "$duration",
  "owner": "$owner"
}
EOF
}

# Extract phases from markdown
extract_phases() {
    local file="$1"
    local content
    local phases="[]"

    content=$(cat "$file")

    # Look for phase sections
    local phase_headers
    phase_headers=$(echo "$content" | grep -nE "^###\s+Phase\s+\d+:" | cut -d: -f1)

    if [[ -n "$phase_headers" ]]; then
        # Process each phase
        local phase_array=()
        while read -r line_num; do
            local phase_content
            phase_content=$(echo "$content" | sed -n "${line_num},/^###/p" | sed '$d')

            # Extract phase details
            local phase_title
            phase_title=$(echo "$phase_content" | head -1 | sed -E 's/^###\s+Phase\s+\d+:\s*//')

            local phase_num
            phase_num=$(echo "$phase_content" | head -1 | sed -E 's/^###\s+Phase\s+([0-9]+):.*/\1/')

            local phase_desc
            phase_desc=$(echo "$phase_content" | grep -A5 -E "^\s*[*_]*Status[*_]*[:\s]+" | grep -vE "^\s*[*_]*" | tr '\n' ' ' | xargs)

            local phase_status
            phase_status=$(echo "$phase_content" | grep -iE "^\s*[*_]*Status[*_]*[:\s]+" | head -1 | sed -E 's/^\s*[*_]*Status[*_]*[:\s]+//' | sed 's/❌\|✅\|⚠️//g' | xargs)
            [[ -z "$phase_status" ]] && phase_status="not_started"

            local phase_duration
            phase_duration=$(echo "$phase_content" | grep -iE "^\s*[*_]*Duration[*_]*[:\s]+" | head -1 | sed -E 's/^\s*[*_]*Duration[*_]*[:\s]+//' | xargs)

            local phase_deps
            phase_deps=$(echo "$phase_content" | grep -iE "^\s*[*_]*Dependencies[*_]*[:\s]+" | head -1 | sed -E 's/^\s*[*_]*Dependencies[*_]*[:\s]+//' | tr ',' '\n' | sed 's/^ *//' | sed 's/ *$//' | grep -v '^$' | tr '\n' ',' | sed 's/,$//' | sed 's/,/, /g')

            # Create phase JSON
            local phase_json
            phase_json=$(cat << EOF
{
  "phaseId": "phase-${phase_num}",
  "name": "$phase_title",
  "description": "$phase_desc",
  "status": "$phase_status",
  "estimatedDuration": "$phase_duration",
  "dependencies": [$(echo "$phase_deps" | sed 's/^/"/' | sed 's/, /", "/' | sed 's/$/"/' | tr '\n' ',' | sed 's/,$//')]
}
EOF
)
            phase_array+=("$phase_json")
        done <<< "$phase_headers"

        # Join phase array
        if [[ ${#phase_array[@]} -gt 0 ]]; then
            phases=$(printf '%s,' "${phase_array[@]}" | sed 's/,$//')
            phases="[$phases]"
        fi
    fi

    echo "$phases"
}

# Extract goals from markdown
extract_goals() {
    local file="$1"
    local content

    content=$(cat "$file")

    # Look for goals section
    local goals_section
    goals_section=$(echo "$content" | sed -n '/## Strategic Goals/,/^##/p' | sed '1d;$d')

    if [[ -n "$goals_section" ]]; then
        # Extract numbered goals
        local goals_array=()
        while IFS= read -r line; do
            if [[ "$line" =~ ^[0-9]+\. ]]; then
                local goal=$(echo "$line" | sed -E 's/^[0-9]+\.\s*//' | tr -d '\r' | xargs)
                goals_array+=("\"$goal\"")
            fi
        done <<< "$goals_section"

        if [[ ${#goals_array[@]} -gt 0 ]]; then
            printf '[%s]' "$(IFS=,; echo "${goals_array[*]}")"
        else
            echo "[]"
        fi
    else
        echo "[]"
    fi
}

# Detect execution mode
detect_mode() {
    local file="$1"
    local content

    content=$(cat "$file")

    # Check for MDAP indicators
    local mdap_indicators=0
    local cfn_loop_indicators=0

    # MDAP indicators
    if echo "$content" | grep -iq "mdap\|atomic.*task\|single.*file"; then
        ((mdap_indicators++))
    fi

    # CFN Loop indicators
    if echo "$content" | grep -iq "cfn.*loop\|phase\|sprint\|iteration"; then
        ((cfn_loop_indicators++))
    fi

    # Count phases
    local phase_count
    phase_count=$(echo "$content" | grep -cE "^###\s+Phase\s+\d+:" || true)
    if [[ $phase_count -gt 1 ]]; then
        ((cfn_loop_indicators += 2))
    fi

    # Decide mode
    if [[ $cfn_loop_indicators -gt $mdap_indicators ]]; then
        echo "cfn-loop"
    else
        echo "mdap"
    fi
}

# Generate MDAP configuration
generate_mdap_config() {
    local metadata="$1"
    local goals="$2"

    cat << EOF
{
  "executionMode": "mdap",
  "metadata": $metadata,
  "goals": $goals,
  "tasks": [],
  "configuration": {
    "maxTaskSize": 50,
    "atomicExecution": true,
    "contextInjection": "pre-loaded"
  }
}
EOF
}

# Generate CFN Loop configuration
generate_cfn_loop_config() {
    local metadata="$1"
    local phases="$2"
    local goals="$3"

    cat << EOF
{
  "executionMode": "cfn-loop",
  "metadata": $metadata,
  "phases": $phases,
  "goals": $goals,
  "configuration": {
    "loopMode": "standard",
    "consensusThreshold": 0.90,
    "gateThreshold": 0.95
  }
}
EOF
}

# Validate epic structure
validate_epic() {
    local metadata="$1"
    local phases="$2"
    local goals="$3"
    local errors=()
    local warnings=()

    # Validate metadata
    local epic_id
    epic_id=$(echo "$metadata" | jq -r '.epicId // empty')
    if [[ -z "$epic_id" ]]; then
        errors+=("Missing epic ID")
    fi

    local name
    name=$(echo "$metadata" | jq -r '.name // empty')
    if [[ -z "$name" ]]; then
        errors+=("Missing epic name")
    fi

    # Validate phases
    local phase_count
    phase_count=$(echo "$phases" | jq 'length')
    if [[ $phase_count -eq 0 ]]; then
        warnings+=("No phases defined")
    fi

    # Validate goals
    local goal_count
    goal_count=$(echo "$goals" | jq 'length')
    if [[ $goal_count -eq 0 ]]; then
        warnings+=("No goals defined")
    fi

    # Report validation results
    if [[ ${#errors[@]} -gt 0 ]]; then
        log_error "Validation failed with ${#errors[@]} error(s):"
        for error in "${errors[@]}"; do
            echo "  - $error" >&2
        done
        return 1
    fi

    if [[ ${#warnings[@]} -gt 0 ]]; then
        log_warn "Validation completed with ${#warnings[@]} warning(s):"
        for warning in "${warnings[@]}"; do
            echo "  - $warning" >&2
        done
    fi

    log_success "Validation passed"
    return 0
}

# Main execution
main() {
    parse_args "$@"
    validate_input

    log_info "Parsing epic: $INPUT_FILE"

    # Extract components
    local metadata
    metadata=$(extract_metadata "$INPUT_FILE")

    local phases
    phases=$(extract_phases "$INPUT_FILE")

    local goals
    goals=$(extract_goals "$INPUT_FILE")

    # Detect mode if auto
    if [[ "$MODE" == "auto" ]]; then
        MODE=$(detect_mode "$INPUT_FILE")
        log_info "Auto-detected mode: $MODE"
    fi

    # Validate if requested
    if [[ "$VALIDATE_ONLY" == "true" ]]; then
        validate_epic "$metadata" "$phases" "$goals"
        exit $?
    fi

    # Generate configuration
    local config
    case "$MODE" in
        mdap)
            config=$(generate_mdap_config "$metadata" "$goals")
            ;;
        cfn-loop)
            config=$(generate_cfn_loop_config "$metadata" "$phases" "$goals")
            ;;
    esac

    # Output configuration
    if [[ -n "$OUTPUT_FILE" ]]; then
        echo "$config" > "$OUTPUT_FILE"
        log_success "Configuration saved to: $OUTPUT_FILE"
    else
        echo "$config"
    fi

    log_success "Epic parsed successfully in $MODE mode"
}

# Check dependencies
if ! command -v jq >/dev/null 2>&1; then
    log_error "jq is required but not installed. Please install jq to continue."
    exit 1
fi

# Run main function
main "$@"