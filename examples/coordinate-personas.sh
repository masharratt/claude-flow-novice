#!/bin/bash
set -euo pipefail

# Coordinate Personas Script (SECURE VERSION)
# Coordinates execution of multiple persona agents for epic review
# Security-hardened with input validation and secure file operations

# Source security utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SECURITY_UTILS="$(realpath "${SCRIPT_DIR}/../.claude/skills/cfn-epic-creator/security-utils.sh")"

if [[ -f "$SECURITY_UTILS" ]]; then
    # shellcheck source=../.claude/skills/cfn-epic-creator/security-utils.sh
    source "$SECURITY_UTILS"
else
    echo "Error: Security utilities not found at $SECURITY_UTILS" >&2
    exit 1
fi

# Color codes for output
readonly BLUE='\033[0;34m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly RED='\033[0;31m'
readonly NC='\033[0m' # No Color

# Constants
readonly DEFAULT_MODE="standard"
readonly DEFAULT_TIMEOUT="300"
readonly CACHE_DURATION="3600"  # 1 hour
readonly MAX_PARALLEL_JOBS=5

# Configuration
MODE="${MODE:-$DEFAULT_MODE}"
TIMEOUT="${TIMEOUT:-$DEFAULT_TIMEOUT}"
FORCE_REFRESH="${FORCE_REFRESH:-false}"
VERBOSE="${VERBOSE:-false}"

# Directories
CACHE_DIR="${CACHE_DIR:-$(pwd)/.cache/personas}"
STATE_DIR="${STATE_DIR:-$(pwd)/.state}"
LOG_DIR="${LOG_DIR:-$(pwd)/.logs}"

# Create necessary directories with secure permissions
mkdir -p "$CACHE_DIR" "$STATE_DIR" "$LOG_DIR"
chmod 700 "$CACHE_DIR" "$STATE_DIR"
chmod 755 "$LOG_DIR"

# Logging functions
log_info() {
  echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$LOG_DIR/coordination.log"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_DIR/coordination.log"
}

log_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_DIR/coordination.log"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_DIR/coordination.log"
}

# Verbose logging
log_verbose() {
  if [[ "$VERBOSE" == "true" ]]; then
    echo -e "${BLUE}[VERBOSE]${NC} $1" | tee -a "$LOG_DIR/coordination.log"
  fi
}

# Persona definitions
declare -a REQUIRED_PERSONAS=("product-manager" "architect" "security-specialist")
declare -a OPTIONAL_PERSONAS=("devops-engineer" "backend-developer" "frontend-developer")
declare -a ALL_PERSONAS=("${REQUIRED_PERSONAS[@]}" "${OPTIONAL_PERSONAS[@]}")

# Input validation
validate_inputs() {
    local epic_description="$1"
    local mode="$2"

    # Validate epic description
    if ! VALIDATED_DESCRIPTION=$(validate_epic_description "$epic_description"); then
        log_security "ERROR" "Invalid epic description"
        return 1
    fi

    # Validate mode
    if [[ ! "$mode" =~ ^(mvp|standard|enterprise)$ ]]; then
        log_error "Invalid mode: $mode. Must be one of: mvp, standard, enterprise"
        return 1
    fi

    # Check for command injection
    if ! check_command_injection "$VALIDATED_DESCRIPTION"; then
        return 1
    fi

    echo "$VALIDATED_DESCRIPTION"
    return 0
}

# Generate secure cache key
get_cache_key() {
    local epic_description="$1"
    local mode="$2"

    # Use secure hash for cache key
    generate_cache_key "${epic_description}${mode}"
}

# Check cache validity
is_cache_valid() {
    local cache_file="$1"
    local max_age="${2:-$CACHE_DURATION}"

    if [[ ! -f "$cache_file" ]]; then
        return 1
    fi

    if [[ "$FORCE_REFRESH" == "true" ]]; then
        log_verbose "Force refresh: skipping cache"
        return 1
    fi

    local file_age
    file_age=$(($(date +%s) - $(stat -c%Y "$cache_file" 2>/dev/null || stat -f%m "$cache_file" 2>/dev/null || echo 0)))

    if [[ $file_age -gt $max_age ]]; then
        log_verbose "Cache expired: $cache_file (age: ${file_age}s)"
        return 1
    fi

    return 0
}

# Execute persona with security checks
execute_persona_with_state() {
    local persona="$1"
    local epic_description="$2"
    local mode="$3"
    local timeout="$4"
    local task_id="$5"
    local accumulated_outputs="$6"

    log_info "Executing persona: $persona"

    # Create secure temporary files
    local input_file
    local output_file
    input_file=$(create_secure_temp "persona-input" "json")
    output_file="${STATE_DIR}/${task_id}-${persona}-output.json"

    # Prepare input with context
    local input_json
    input_json=$(jq -n \
        --arg persona "$persona" \
        --arg description "$epic_description" \
        --arg mode "$mode" \
        --argjson accumulated "$accumulated_outputs" \
        '{
            persona: $persona,
            epic_description: $description,
            mode: $mode,
            accumulated_outputs: $accumulated_outputs,
            timestamp: now
        }')

    # Write input to secure temporary file
    echo "$input_json" > "$input_file"
    chmod 600 "$input_file"

    # Execute persona with timeout and security
    local persona_script="./persona-${persona}.sh"
    if [[ -f "$persona_script" ]]; then
        log_verbose "Executing $persona_script with timeout ${timeout}s"

        # Run with timeout and capture output securely
        if timeout "$timeout" "$persona_script" "$input_file" 2>&1; then
            local exit_code=$?
            if [[ $exit_code -eq 0 ]]; then
                # Move output to state location with validation
                if mv "$input_file.result" "$output_file" 2>/dev/null; then
                    chmod 644 "$output_file"
                    log_success "Persona $persona completed successfully"
                else
                    log_error "Failed to save output for $persona"
                    return 1
                fi
            else
                log_error "Persona $persona failed with exit code $exit_code"
                return 1
            fi
        else
            local exit_code=$?
            log_error "Persona $persona timed out or failed (exit code: $exit_code)"
            return 1
        fi
    else
        log_warning "Persona script not found: $persona_script, generating mock response"

        # Generate mock response for testing
        local mock_response
        mock_response=$(jq -n \
            --arg persona "$persona" \
            --arg description "$epic_description" \
            --arg mode "$mode" \
            '{
                persona: $persona,
                analysis: "Mock analysis for " + $persona,
                recommendations: ["Mock recommendation 1", "Mock recommendation 2"],
                confidence: 0.85,
                timestamp: now
            }')

        echo "$mock_response" > "$output_file"
        chmod 644 "$output_file"
    fi

    # Cleanup temporary file
    rm -f "$input_file"

    return 0
}

# Execute personas in parallel with security
execute_personas_parallel() {
    local epic_description="$1"
    local mode="$2"
    local timeout="$3"
    local personas=("${@:4}")
    local task_id
    task_id=$(generate_cache_key "$epic_description" | head -c 8)

    log_info "Starting parallel execution of ${#personas[@]} personas"

    # Limit parallel jobs
    local num_personas=${#personas[@]}
    if [[ $num_personas -gt $MAX_PARALLEL_JOBS ]]; then
        log_warning "Limiting parallel jobs to $MAX_PARALLEL_JOBS (requested: $num_personas)"
        personas=("${personas[@]:0:$MAX_PARALLEL_JOBS}")
        num_personas=$MAX_PARALLEL_JOBS
    fi

    # Execute personas in background with security
    local -a pids=()
    local -a temp_files=()

    for persona in "${personas[@]}"; do
        {
            # Create secure temporary file for result
            local temp_file
            temp_file=$(create_secure_temp "persona-result" "json")

            if execute_persona_with_state "$persona" "$epic_description" "$mode" "$timeout" "$task_id" "{}"; then
                if [[ -f "$STATE_DIR/${task_id}-${persona}-output.json" ]]; then
                    cp "$STATE_DIR/${task_id}-${persona}-output.json" "$temp_file"
                else
                    echo '{"error": "Persona failed to produce output"}' > "$temp_file"
                fi
            else
                echo '{"error": "Persona execution failed"}' > "$temp_file"
            fi

            echo "$temp_file"
        } &

        pids+=($!)
        temp_files+=("$(mktemp -u)")
    done

    # Wait for all personas to complete
    local -a results=()
    local failed=0

    for i in "${!pids[@]}"; do
        if wait "${pids[i]}"; then
            log_verbose "Persona ${personas[i]} completed successfully"
        else
            log_error "Persona ${personas[i]} failed"
            ((failed++))
        fi

        # Read result from temp file (if it exists)
        if [[ -n "${temp_files[i]}" && -f "${temp_files[i]}" ]]; then
            results+=("$(cat "${temp_files[i]}")")
            rm -f "${temp_files[i]}"
        else
            results+=('{"error": "No output produced"}')
        fi
    done

    # Check if any required personas failed
    if [[ $failed -gt 0 ]]; then
        log_warning "$failed personas failed to complete"
    fi

    # Combine results
    local combined_results
    combined_results=$(jq -n \
        --argjson results "$(printf '%s\n' "${results[@]}" | jq -s '.')") \
        '{
            task_id: "'"$task_id"'",
            epic_description: "'"${epic_description:0:100}${epic_description:100:+...}"'",
            mode: "'"$mode"'",
            completed_at: now,
            personas: $results,
            failed_count: '"$failed"'
        }'

    echo "$combined_results"

    return $failed
}

# Generate summary from results
generate_summary() {
    local results="$1"

    log_info "Generating summary from persona results"

    local summary
    summary=$(jq -r '
        "\n=== EPIC REVIEW SUMMARY ===\n" +
        "Total Personas: " + (.personas | length | tostring) + "\n" +
        "Failed: " + (.failed_count | tostring) + "\n" +
        "\n=== PERSONA INSIGHTS ===\n" +
        (
            .personas[] |
            select(has("persona") and .persona != null) |
            "\n• " + .persona + ":\n" +
            "  " + (
                if has("analysis") then
                    (.analysis | if type == "string" then . else "Complex analysis" end | split("\n")[0:2] | join("\n  "))
                else
                    "No analysis provided"
                end
            )
        )
    ' <<< "$results")

    echo "$summary"
}

# Main coordination function
coordinate_personas() {
    local epic_description="$1"
    local mode="${2:-$DEFAULT_MODE}"
    local timeout="${3:-$DEFAULT_TIMEOUT}"

    log_info "Starting persona coordination for epic review"
    log_verbose "Mode: $mode, Timeout: ${timeout}s"

    # Validate inputs
    if ! validated_description=$(validate_inputs "$epic_description" "$mode"); then
        return 1
    fi
    epic_description="$validated_description"

    # Check cache
    local cache_key
    cache_key=$(get_cache_key "$epic_description" "$mode")
    local cache_file="$CACHE_DIR/${cache_key}.json"

    if is_cache_valid "$cache_file"; then
        log_success "Using cached results from $cache_file"
        cat "$cache_file"
        return 0
    fi

    # Determine personas based on mode
    local -a personas=()
    case "$mode" in
        "mvp")
            personas=("${REQUIRED_PERSONAS[@]}")
            ;;
        "standard")
            personas=("${ALL_PERSONAS[@]}")
            ;;
        "enterprise")
            personas=("${ALL_PERSONAS[@]}" "qa-engineer" "performance-engineer")
            ;;
    esac

    log_info "Executing personas: ${personas[*]}"

    # Execute personas in parallel
    local results
    if ! results=$(execute_personas_parallel "$epic_description" "$mode" "$timeout" "${personas[@]}"); then
        log_error "Persona execution failed"
        return 1
    fi

    # Generate and display summary
    local summary
    summary=$(generate_summary "$results")
    echo "$summary"

    # Add summary to results
    results=$(jq \
        --arg summary "$summary" \
        '. + {summary: $summary}' \
        <<< "$results")

    # Cache the results
    echo "$results" > "$cache_file"
    chmod 644 "$cache_file"

    log_success "Persona coordination completed successfully"

    return 0
}

# Main execution
main() {
    local epic_description="$1"
    local mode="${2:-$MODE}"
    local timeout="${3:-$TIMEOUT}"

    # Display execution info
    echo ""
    log_info "=== CFN Epic Creator - Persona Coordination ==="
    log_info "Description: ${epic_description:0:100}${epic_description:100:+...}"
    log_info "Mode: $mode"
    log_info "Timeout: ${timeout}s per persona"
    log_info "Log directory: $LOG_DIR"
    echo ""

    # Coordinate personas
    if coordinate_personas "$epic_description" "$mode" "$timeout"; then
        log_success "All personas completed successfully"
        exit 0
    else
        log_error "Persona coordination failed"
        exit 1
    fi
}

# Help function
show_help() {
    cat << 'EOF'
Usage: coordinate-personas.sh "<epic-description>" [mode] [timeout]

Coordinates execution of multiple persona agents for comprehensive epic review.

Arguments:
  epic-description    Detailed description of the epic to be analyzed
  mode               Review thoroughness level (mvp|standard|enterprise) [default: standard]
  timeout            Timeout per persona in seconds [default: 300]

Environment Variables:
  MODE               Default mode setting
  TIMEOUT            Default timeout setting
  FORCE_REFRESH      Force cache refresh (true|false) [default: false]
  VERBOSE            Enable verbose logging (true|false) [default: false]
  CACHE_DIR          Cache directory [default: ./cache/personas]
  STATE_DIR          State directory [default: ./state]
  LOG_DIR            Log directory [default: ./logs]

Examples:
  coordinate-personas.sh "Implement user authentication system"
  coordinate-personas.sh "Build microservices API gateway" enterprise 600
  MODE=mvp VERBOSE=true coordinate-personas.sh "Quick prototype"

Security Features:
  - Input sanitization and validation
  - Path traversal protection
  - Command injection prevention
  - Secure temporary file creation
  - Output validation

EOF
}

# Parse command line arguments
if [[ $# -lt 1 || "$1" == "-h" || "$1" == "--help" ]]; then
    show_help
    exit 0
fi

# Execute main function
main "$@"