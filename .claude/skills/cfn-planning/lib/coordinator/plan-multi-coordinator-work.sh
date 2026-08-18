#!/usr/bin/env bash

set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

info() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] INFO: $1${NC}"
}

display_usage() {
    echo "Multi-Coordinator Planning Tool"
    echo
    echo "Usage: $0 <zone-config-file> [options]"
    echo
    echo "Options:"
    echo "  --max-zones-per-phase N    Maximum zones per rollout phase (default: 2)"
    echo "  --skip-validation          Skip task validation (not recommended)"
    echo "  --dry-run                  Generate plan without execution"
    echo "  --output-dir DIR           Output directory for plans (default: /tmp)"
    echo "  --help                     Display this help message"
    echo
    echo "Example:"
    echo "  $0 zone-config.json --max-zones-per-phase 3"
    echo
}

validate_prerequisites() {
    # Check for required tools
    local required_tools=("jq" "redis-cli" "bc")

    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" >/dev/null 2>&1; then
            error "Required tool not found: $tool"
        fi
    done

    # Check Redis connectivity
    if ! redis-cli ping >/dev/null 2>&1; then
        error "Redis connection failed - required for namespace planning"
    fi

    log "✓ Prerequisites validation passed"
}

execute_planning_phase() {
    local phase_name="$1"
    local config_file="$2"
    local output_dir="$3"
    shift 3
    local additional_args=("$@")

    log "Executing planning phase: $phase_name"

    case "$phase_name" in
        "validation")
            if [[ "${additional_args[*]}" != *"--skip-validation"* ]]; then
                "$SCRIPT_DIR/validate-task-planning.sh" "$config_file"
            fi
            ;;
        "resources")
            "$SCRIPT_DIR/plan-coordinator-resources.sh" "$config_file"
            ;;
        "dependencies")
            "$SCRIPT_DIR/map-dependencies-conflicts.sh" "$config_file"
            ;;
        "rollout")
            "$SCRIPT_DIR/plan-risk-rollout.sh" "$config_file" "${additional_args[@]}"
            ;;
        *)
            error "Unknown planning phase: $phase_name"
            ;;
    esac
}

generate_execution_summary() {
    local validation_file="$1"
    local resource_file="$2"
    local dependency_file="$3"
    local rollout_file="$4"
    local summary_file="$5"

    local summary="{
        \"timestamp\": $(date '+%s'),
        \"planning_status\": \"completed\",
        \"phases_executed\": [
            \"task_validation\",
            \"resource_allocation\",
            \"dependency_analysis\",
            \"rollout_planning\"
        ],
        \"output_files\": {
            \"validation\": \"$validation_file\",
            \"resources\": \"$resource_file\",
            \"dependencies\": \"$dependency_file\",
            \"rollout\": \"$rollout_file\"
        },
        \"ready_for_execution\": true,
        \"next_steps\": [
            \"Review generated plans\",
            \"Execute rollout in phases\",
            \"Monitor coordinator health\",
            \"Apply rollback triggers if needed\"
        ]
    }"

    echo "$summary" > "$summary_file"
}

display_final_summary() {
    local summary_file="$1"
    local summary_data
    summary_data=$(jq . "$summary_file")

    echo
    info "=== Multi-Coordinator Planning Summary ==="
    echo "Planning completed at: $(date -d @$(echo "$summary_data" | jq -r '.timestamp') '+%Y-%m-%d %H:%M:%S')"
    echo "Status: $(echo "$summary_data" | jq -r '.planning_status')"
    echo "Ready for execution: $(echo "$summary_data" | jq -r '.ready_for_execution')"
    echo

    echo "Generated Plans:"
    echo "$summary_data" | jq -r '.output_files | to_entries[] | "  - \(.key): \(.value)"'
    echo

    echo "Next Steps:"
    echo "$summary_data" | jq -r '.next_steps[] | "  - \(.)"'
    echo

    echo "Execution Command:"
    local rollout_file
    rollout_file=$(echo "$summary_data" | jq -r '.output_files.rollout')
    echo "  ./execute-coordinator-rollout.sh $rollout_file"
    echo
}

main() {
    # Parse command line arguments
    local config_file=""
    local max_zones_per_phase=2
    local skip_validation=false
    local dry_run=false
    local output_dir="/tmp"

    while [[ $# -gt 0 ]]; do
        case $1 in
            --max-zones-per-phase)
                max_zones_per_phase="$2"
                shift 2
                ;;
            --skip-validation)
                skip_validation=true
                shift
                ;;
            --dry-run)
                dry_run=true
                shift
                ;;
            --output-dir)
                output_dir="$2"
                shift 2
                ;;
            --help)
                display_usage
                exit 0
                ;;
            -*)
                error "Unknown option: $1"
                ;;
            *)
                if [[ -z "$config_file" ]]; then
                    config_file="$1"
                else
                    error "Multiple configuration files specified"
                fi
                shift
                ;;
        esac
    done

    # Validate arguments
    if [[ -z "$config_file" ]]; then
        error "Configuration file required"
    fi

    if [[ ! -f "$config_file" ]]; then
        error "Configuration file not found: $config_file"
    fi

    # Create output directory
    mkdir -p "$output_dir"

    log "Starting multi-coordinator planning for: $config_file"

    # Validate prerequisites
    validate_prerequisites

    # Prepare additional arguments
    local additional_args=()
    if [[ "$skip_validation" == true ]]; then
        additional_args+=("--skip-validation")
    fi

    # Execute planning phases
    local timestamp
    timestamp=$(date '+%s')

    local validation_output="/tmp/validated-task-$(basename "$config_file")"
    local resource_output="/tmp/coordinator-resource-plan-$timestamp.json"
    local dependency_output="/tmp/dependency-conflict-analysis-$timestamp.json"
    local rollout_output="/tmp/rollout-plan-$timestamp.json"

    # Phase 1: Task Validation
    execute_planning_phase "validation" "$config_file" "$output_dir" "${additional_args[@]}"

    # Phase 2: Resource Allocation
    execute_planning_phase "resources" "$config_file" "$output_dir"

    # Phase 3: Dependency Analysis
    execute_planning_phase "dependencies" "$config_file" "$output_dir"

    # Phase 4: Rollout Planning
    execute_planning_phase "rollout" "$config_file" "$output_dir" "--max-zones-per-phase" "$max_zones_per_phase"

    # Move files to output directory if specified
    if [[ "$output_dir" != "/tmp" ]]; then
        mv "$resource_output" "$output_dir/"
        mv "$dependency_output" "$output_dir/"
        mv "$rollout_output" "$output_dir/"
        resource_output="$output_dir/$(basename "$resource_output")"
        dependency_output="$output_dir/$(basename "$dependency_output")"
        rollout_output="$output_dir/$(basename "$rollout_output")"
    fi

    # Generate execution summary
    local summary_file="$output_dir/multi-coordinator-planning-summary-$timestamp.json"
    generate_execution_summary "$validation_output" "$resource_output" "$dependency_output" "$rollout_output" "$summary_file"

    log "✅ Multi-coordinator planning completed successfully"

    if [[ "$dry_run" == false ]]; then
        display_final_summary "$summary_file"
    fi
}

# Execute main function with all arguments
main "$@"