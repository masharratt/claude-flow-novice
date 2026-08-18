#!/usr/bin/env bash
set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

# CFN Epic Creator Invoke Script (SECURE VERSION)
# Wrapper script for invoking the epic creator with security validation

# Source security utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SECURITY_UTILS="$(realpath "${SCRIPT_DIR}/security-utils.sh")"

if [[ -f "$SECURITY_UTILS" ]]; then
    # shellcheck source=security-utils.sh
    source "$SECURITY_UTILS"
else
    echo "Error: Security utilities not found at $SECURITY_UTILS" >&2
    exit 1
fi

# Configuration
EPIC_CREATOR_AGENT="$(realpath "${SCRIPT_DIR}/../../agents/cfn-dev-team/utility/epic-creator-v2.sh")"
DEFAULT_MODE="standard"
DEFAULT_TIMEOUT=600

# Default values
MODE="$DEFAULT_MODE"
OUTPUT_FILE=""
ENFORCE_DEVOPS=false
VERBOSE=false
VALIDATE_ONLY=false
SHOW_HELP=false
AGENTS=""
PER_SPRINT=false

# Logging functions
log_info() {
    if [[ "$VERBOSE" == "true" ]]; then
        echo "[INFO] $1" >&2
    fi
}

log_error() {
    echo "[ERROR] $1" >&2
}

log_success() {
    echo "[SUCCESS] $1" >&2
}

# Usage information
show_usage() {
    cat << HELP_EOF
Usage: cfn-epic-creator <epic-description> [OPTIONS]

Creates comprehensive epic definitions with reviews from 10 key personas.

ARGUMENTS:
  <epic-description>    Detailed description of the epic to be analyzed

OPTIONS:
  -m, --mode <mode>         Review thoroughness level (mvp|standard|enterprise)
                             - mvp: Essential personas only (PM, Architect, Security)
                             - standard: All 6 core personas
                             - enterprise: Additional QA and Performance personas
                             [default: $DEFAULT_MODE]

  -o, --output <path>       Output JSON file path
                             If not specified, generates timestamped filename

  -e, --enforce-devops      Include DevOps persona regardless of mode

  -a, --agents <list>       Ordered comma-separated list of agents to use
                             Overrides default persona sequence
                             Example: typescript-specialist,tester,integration-tester,react-frontend-engineer

  --per-sprint              Run validation agents within each sprint/phase
                             Keeps context close to implementation details

  -t, --timeout <seconds>  Timeout for persona execution [default: $DEFAULT_TIMEOUT]

  -v, --verbose             Enable verbose logging

  --validate-only          Validate inputs without executing

  -h, --help               Show this help message

EXAMPLES:
  # Standard epic creation
  cfn-epic-creator "Implement user authentication system"

  # Enterprise mode with custom output
  cfn-epic-creator "Build microservices API gateway" --mode=enterprise -o epic-api-gateway.json

  # MVP mode with DevOps enforcement
  cfn-epic-creator "Quick prototype dashboard" --mode=mvp --enforce-devops

  # Custom agents in specific order
  cfn-epic-creator "Build dashboard" --agents=typescript-specialist,tester,integration-tester,react-frontend-engineer

  # Per-sprint validation (runs agents within each sprint context)
  cfn-epic-creator "Build feature" --agents=typescript-specialist,tester --per-sprint

  # Validate epic description without execution
  cfn-epic-creator "Test epic" --validate-only

AVAILABLE AGENTS:
  typescript-specialist     Cross-file type safety, imports/exports, type contracts
  tester                    Test strategy, coverage requirements, quality gates
  integration-tester        End-to-end workflow validation, component wiring
  react-frontend-engineer   UI components, branding, breaking error prevention
  backend-developer         API design, data structures, service contracts
  rust-developer            Systems programming, memory safety, performance
  security-specialist       Security review, vulnerability assessment
  code-standards-reviewer   Naming conventions, type alignment, API consistency
  strategic-alignment-reviewer Integration gaps, dead code detection
  simplifier                Scope reduction, over-engineering prevention
  product-owner             Business value, user stories, acceptance criteria
  system-architect          System design, scalability, technical constraints
  devops-engineer           Deployment, infrastructure, monitoring

SECURITY FEATURES:
  - Input sanitization and validation
  - Path traversal protection
  - Command injection prevention
  - Secure temporary file creation
  - Output validation

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

# Validate timeout parameter
validate_timeout() {
    local timeout="$1"
    if ! [[ "$timeout" =~ ^[0-9]+$ ]]; then
        log_error "Invalid timeout: $timeout (must be a positive integer)"
        return 1
    fi

    if [[ $timeout -lt 30 || $timeout -gt 3600 ]]; then
        log_error "Timeout must be between 30 and 3600 seconds"
        return 1
    fi

    return 0
}

# Valid agent names for epic validation
VALID_AGENTS=(
    "typescript-specialist"
    "tester"
    "integration-tester"
    "react-frontend-engineer"
    "backend-developer"
    "rust-developer"
    "security-specialist"
    "code-standards-reviewer"
    "strategic-alignment-reviewer"
    "simplifier"
    "product-owner"
    "system-architect"
    "devops-engineer"
)

# Validate agent name
validate_agent_name() {
    local agent="$1"
    for valid in "${VALID_AGENTS[@]}"; do
        if [[ "$agent" == "$valid" ]]; then
            return 0
        fi
    done
    log_error "Invalid agent: $agent"
    log_error "Valid agents: ${VALID_AGENTS[*]}"
    return 1
}

# Validate agents list (comma-separated)
validate_agents() {
    local agents_str="$1"

    if [[ -z "$agents_str" ]]; then
        return 0  # Empty is allowed (uses default)
    fi

    log_info "Validating agents list: $agents_str"

    IFS=',' read -ra agent_array <<< "$agents_str"

    for agent in "${agent_array[@]}"; do
        # Trim whitespace
        agent=$(echo "$agent" | xargs)
        if ! validate_agent_name "$agent"; then
            return 1
        fi
    done

    log_info "Agents list validated: ${#agent_array[@]} agents"
    return 0
}

# Parse command line arguments
parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                SHOW_HELP=true
                shift
                ;;
            -m|--mode)
                if [[ -z "${2:-}" ]]; then
                    log_error "Mode requires a value"
                    return 1
                fi
                MODE="$2"
                shift 2
                ;;
            --mode=*)
                MODE="${1#--mode=}"
                shift
                ;;
            -o|--output)
                if [[ -z "${2:-}" ]]; then
                    log_error "Output path requires a value"
                    return 1
                fi
                OUTPUT_FILE="$2"
                shift 2
                ;;
            --output=*)
                OUTPUT_FILE="${1#--output=}"
                shift
                ;;
            -e|--enforce-devops)
                ENFORCE_DEVOPS=true
                shift
                ;;
            -a|--agents)
                if [[ -z "${2:-}" ]]; then
                    log_error "Agents list requires a value"
                    return 1
                fi
                AGENTS="$2"
                shift 2
                ;;
            --agents=*)
                AGENTS="${1#--agents=}"
                shift
                ;;
            --per-sprint)
                PER_SPRINT=true
                shift
                ;;
            -t|--timeout)
                if [[ -z "${2:-}" ]]; then
                    log_error "Timeout requires a value"
                    return 1
                fi
                TIMEOUT="$2"
                shift 2
                ;;
            --timeout=*)
                TIMEOUT="${1#--timeout=}"
                shift
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
                return 1
                ;;
            *)
                # Epic description (last argument)
                if [[ -z "${EPIC_DESCRIPTION:-}" ]]; then
                    EPIC_DESCRIPTION="$1"
                else
                    log_error "Multiple epic descriptions provided"
                    return 1
                fi
                shift
                ;;
        esac
    done
}

# Validate epic description
validate_epic() {
    local description="$1"

    log_info "Validating epic description..."

    # Use security utility to validate
    if ! validated=$(validate_epic_description "$description"); then
        log_error "Epic description validation failed"
        return 1
    fi

    log_info "Epic description validated successfully (${#validated} characters)"
    return 0
}

# Validate output file path
validate_output_file() {
    local output_file="$1"

    if [[ -z "$output_file" ]]; then
        return 0  # Empty output file is allowed (will generate default)
    fi

    log_info "Validating output file path: $output_file"

    # Use security utility to validate path
    if ! validated=$(validate_path "$output_file"); then
        log_error "Output file path validation failed"
        return 1
    fi

    # Check if directory exists
    local dir
    dir=$(dirname "$validated")
    if [[ ! -d "$dir" ]]; then
        log_info "Creating output directory: $dir"
        mkdir -p "$dir"
        chmod 755 "$dir"
    fi

    OUTPUT_FILE="$validated"
    log_info "Output file path validated"
    return 0
}

# Generate output filename if not provided
generate_output_filename() {
    local base_name="epic-with-personas"
    local timestamp
    timestamp=$(date +"%Y-%m-%d-%H-%M-%S")

    generate_secure_filename "$base_name" "$timestamp" "json"
}

# Execute epic creator with security
execute_epic_creator() {
    local description="$1"
    local mode="$2"
    local output_file="$3"
    local enforce_devops="$4"
    local agents="${5:-}"
    local per_sprint="${6:-false}"

    log_info "Executing epic creator..."

    # Check if epic creator script exists and is executable
    if [[ ! -f "$EPIC_CREATOR_AGENT" ]]; then
        log_error "Epic creator script not found: $EPIC_CREATOR_AGENT"
        return 1
    fi

    if [[ ! -x "$EPIC_CREATOR_AGENT" ]]; then
        log_error "Epic creator script is not executable: $EPIC_CREATOR_AGENT"
        return 1
    fi

    # Prepare command arguments
    local -a agent_cmd=("$EPIC_CREATOR_AGENT")
    agent_cmd+=(--mode="$mode")

    if [[ "$enforce_devops" == "true" ]]; then
        agent_cmd+=(--enforce-devops)
    fi

    if [[ -n "$output_file" ]]; then
        agent_cmd+=(--output="$output_file")
    fi

    if [[ -n "$agents" ]]; then
        agent_cmd+=(--agents="$agents")
    fi

    if [[ "$per_sprint" == "true" ]]; then
        agent_cmd+=(--per-sprint)
    fi

    agent_cmd+=("$description")

    log_info "Command: ${agent_cmd[*]}"

    # Create secure temporary file for output
    local temp_output
    temp_output=$(create_secure_temp "epic-creator" "log")

    # Execute epic creator
    if "${agent_cmd[@]}" > "$temp_output" 2>&1; then
        log_info "Epic creator executed successfully"

        # Display output
        cat "$temp_output"

        # Validate output file if specified
        if [[ -n "$output_file" ]]; then
            if [[ ! -f "$output_file" ]]; then
                log_error "Expected output file not created: $output_file"
                rm -f "$temp_output"
                return 1
            fi

            if ! validate_json_output "$output_file"; then
                log_error "Output file validation failed: $output_file"
                rm -f "$temp_output"
                return 1
            fi

            log_success "Epic generated successfully: $output_file"
            log_info "File size: $(stat -c%s "$output_file" 2>/dev/null || stat -f%z "$output_file" 2>/dev/null || echo "unknown") bytes"
        fi
    else
        log_error "Epic creator failed"
        cat "$temp_output"
        rm -f "$temp_output"
        return 1
    fi

    # Cleanup
    rm -f "$temp_output"

    return 0
}

# Generate summary from output file
generate_summary() {
    local output_file="$1"

    if [[ ! -f "$output_file" ]]; then
        log_error "Cannot generate summary: output file not found"
        return 1
    fi

    log_info "Generating summary..."

    local json_content
    json_content=$(cat "$output_file")

    local summary
    summary=$(jq -r '
        "=== EPIC SUMMARY ===\n" +
        "Epic ID: " + (.epic_id // "N/A") + "\n" +
        "Mode: " + (.mode // "N/A") + "\n" +
        "Created: " + (.created_at // "N/A") + "\n" +
        "Personas: " + (.personas | length | tostring) + "\n" +
        "\nDescription Preview:\n" +
        (.description | if length > 200 then .[0:200] + "..." else . end) + "\n"
    ' <<< "$json_content")

    echo -e "$summary"
}

# Main execution
main() {
    local epic_description="${EPIC_DESCRIPTION:-}"
    local timeout="${TIMEOUT:-$DEFAULT_TIMEOUT}"

    # Show help if requested
    if [[ "$SHOW_HELP" == "true" ]]; then
        show_usage
        exit 0
    fi

    # Check for epic description
    if [[ -z "$epic_description" ]]; then
        log_error "Epic description is required"
        echo ""
        show_usage
        exit 1
    fi

    # Validate inputs
    log_info "Validating inputs..."

    # Validate epic description
    if ! validate_epic "$epic_description"; then
        exit 1
    fi

    # Validate mode
    if ! validate_mode "$MODE"; then
        exit 1
    fi

    # Validate timeout
    if ! validate_timeout "$timeout"; then
        exit 1
    fi

    # Validate output file
    if ! validate_output_file "$OUTPUT_FILE"; then
        exit 1
    fi

    # Validate agents list
    if ! validate_agents "$AGENTS"; then
        exit 1
    fi

    # Generate output filename if not provided
    if [[ -z "$OUTPUT_FILE" ]]; then
        OUTPUT_FILE=$(generate_output_filename)
        log_info "Generated output filename: $OUTPUT_FILE"
    fi

    log_info "Validation complete"
    log_info "Mode: $MODE"
    log_info "Timeout: ${timeout}s"
    log_info "Output: $OUTPUT_FILE"
    log_info "Enforce DevOps: $ENFORCE_DEVOPS"
    if [[ -n "$AGENTS" ]]; then
        log_info "Custom Agents: $AGENTS"
    fi
    log_info "Per-Sprint Validation: $PER_SPRINT"

    # If validate only, exit here
    if [[ "$VALIDATE_ONLY" == "true" ]]; then
        log_success "All validations passed - exiting without execution"
        exit 0
    fi

    # Execute epic creator
    if execute_epic_creator "$epic_description" "$MODE" "$OUTPUT_FILE" "$ENFORCE_DEVOPS" "$AGENTS" "$PER_SPRINT"; then
        # Generate summary if output file exists
        if [[ -f "$OUTPUT_FILE" ]]; then
            echo ""
            generate_summary "$OUTPUT_FILE"
        fi

        log_success "Epic creation completed successfully"
        exit 0
    else
        log_error "Epic creation failed"
        exit 1
    fi
}

# Parse arguments
parse_arguments "$@"

# Execute main function
main "$@"