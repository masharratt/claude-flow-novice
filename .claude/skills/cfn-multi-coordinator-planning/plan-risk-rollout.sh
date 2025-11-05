#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Configuration
DEFAULT_PHASE_TIMEOUT=1800  # 30 minutes per phase
DEFAULT_ROLLBACK_TIMEOUT=600  # 10 minutes for rollback
SUCCESS_THRESHOLD=0.85

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

calculate_zone_complexity() {
    local zone_data="$1"
    local complexity_score=0

    # Base complexity from agent count
    local agent_count
    agent_count=$(echo "$zone_data" | jq -r '.agent_types | length // 0')
    complexity_score=$((complexity_score + agent_count * 10))

    # Complexity from deliverable count
    local deliverable_count
    deliverable_count=$(echo "$zone_data" | jq -r '.deliverables | length // 0')
    complexity_score=$((complexity_score + deliverable_count * 5))

    # Complexity from task description length (longer = more complex)
    local task_description
    task_description=$(echo "$zone_data" | jq -r '.task_description // ""')
    local description_length=${#task_description}
    if [[ $description_length -gt 100 ]]; then
        complexity_score=$((complexity_score + 15))
    elif [[ $description_length -gt 50 ]]; then
        complexity_score=$((complexity_score + 10))
    fi

    # Complexity from acceptance criteria
    local acceptance_count
    acceptance_count=$(echo "$zone_data" | jq -r '.acceptance_criteria | length // 0')
    complexity_score=$((complexity_score + acceptance_count * 8))

    # Risk factors
    if echo "$zone_data" | jq -e '.risk_factors' >/dev/null 2>&1; then
        local risk_factors
        risk_factors=$(echo "$zone_data" | jq -r '.risk_factors | length // 0')
        complexity_score=$((complexity_score + risk_factors * 20))
    fi

    echo "$complexity_score"
}

rank_zones_by_complexity() {
    local zone_config="$1"
    local zones_with_complexity="[]"

    local i=0
    while IFS= read -r zone_name; do
        local zone_data
        zone_data=$(echo "$zone_config" | jq -r ".zones[$i]")

        local complexity
        complexity=$(calculate_zone_complexity "$zone_data")

        local zone_entry="{
            \"name\": \"$zone_name\",
            \"complexity_score\": $complexity,
            \"data\": $zone_data
        }"

        zones_with_complexity=$(echo "$zones_with_complexity" | jq ". + [$zone_entry]")
        ((i++))
    done < <(echo "$zone_config" | jq -r '.zones[].name')

    # Sort by complexity score (ascending)
    echo "$zones_with_complexity" | jq 'sort_by(.complexity_score)'
}

create_rollout_phases() {
    local ranked_zones="$1"
    local max_zones_per_phase="${2:-2}"

    local rollout_phases="[]"
    local phase_number=1
    local i=0

    while true; do
        local phase_zones="[]"
        local zones_in_phase=0

        while [[ $zones_in_phase -lt $max_zones_per_phase ]]; do
            local zone_data
            zone_data=$(echo "$ranked_zones" | jq ".[$i] // empty")

            if [[ "$zone_data" == "null" || "$zone_data" == "" ]]; then
                break 2
            fi

            phase_zones=$(echo "$phase_zones" | jq ". + [$zone_data]")
            ((i++))
            ((zones_in_phase++))
        done

        if [[ $zones_in_phase -eq 0 ]]; then
            break
        fi

        local phase_entry="{
            \"phase\": $phase_number,
            \"zones\": $phase_zones,
            \"max_execution_time\": $DEFAULT_PHASE_TIMEOUT,
            \"success_threshold\": $SUCCESS_THRESHOLD,
            \"rollback_timeout\": $DEFAULT_ROLLBACK_TIMEOUT
        }"

        rollout_phases=$(echo "$rollout_phases" | jq ". + [$phase_entry]")
        ((phase_number++))
    done

    echo "$rollout_phases"
}

create_success_criteria() {
    local rollout_phases="$1"

    local success_criteria="[]"

    local phase_count
    phase_count=$(echo "$rollout_phases" | jq 'length')

    for ((i=0; i<phase_count; i++)); do
        local phase_data
        phase_data=$(echo "$rollout_phases" | jq ".[$i]")

        local zone_names
        zone_names=$(echo "$phase_data" | jq -r '.zones[].name')

        local phase_criteria="{
            \"phase\": $((i + 1)),
            \"required_success_zones\": [],
            \"minimum_confidence_threshold\": $SUCCESS_THRESHOLD,
            \"all_zones_must_complete\": true,
            \"validation_checks\": [
                \"redis_namespace_isolation\",
                \"agent_completion_signaling\",
                \"coordinator_lifecycle_management\",
                \"deliverable_verification\"
            ]
        }"

        # Add required zone names
        local zones_array="[]"
        while IFS= read -r zone_name; do
            zones_array=$(echo "$zones_array" | jq ". + [\"$zone_name\"]")
        done <<< "$zone_names"

        phase_criteria=$(echo "$phase_criteria" | jq ".required_success_zones = $zones_array")
        success_criteria=$(echo "$success_criteria" | jq ". + [$phase_criteria]")
    done

    echo "$success_criteria"
}

create_rollback_triggers() {
    local rollout_phases="$1"

    local rollback_triggers="[]"

    local phase_count
    phase_count=$(echo "$rollout_phases" | jq 'length')

    # Global rollback triggers
    local global_triggers="[
        {
            \"trigger\": \"any_zone_critical_failure\",
            \"action\": \"immediate_rollback_all\",
            \"description\": \"Critical system failure in any zone\"
        },
        {
            \"trigger\": \"redis_namespace_corruption\",
            \"action\": \"emergency_stop_and_cleanup\",
            \"description\": \"Redis namespace isolation breach\"
        },
        {
            \"trigger\": \"resource_exhaustion\",
            \"action\": \"scale_back_and_retry\",
            \"description\": \"System resources exhausted\"
        }
    ]"

    # Phase-specific rollback triggers
    local i=0
    for ((i=0; i<phase_count; i++)); do
        local phase_zones
        phase_zones=$(echo "$rollout_phases" | jq -r ".[$i].zones[].name")

        while IFS= read -r zone_name; do
            local trigger="{
                \"trigger\": \"zone_${zone_name}_completion_failure\",
                \"phase\": $((i + 1)),
                \"action\": \"rollback_current_phase\",
                \"description\": \"Zone $zone_name failed to complete in phase $((i + 1))\"
            }"

            rollback_triggers=$(echo "$rollback_triggers" | jq ". + [$trigger]")
        done <<< "$phase_zones"
    done

    # Combine global and specific triggers
    echo "$global_triggers" | jq ". + $rollback_triggers"
}

generate_rollout_plan() {
    local zone_config="$1"
    local max_zones_per_phase="${2:-2}"

    info "Analyzing zone complexity for rollout planning"

    # Rank zones by complexity
    local ranked_zones
    ranked_zones=$(rank_zones_by_complexity "$zone_config")

    # Create rollout phases
    local rollout_phases
    rollout_phases=$(create_rollout_phases "$ranked_zones" "$max_zones_per_phase")

    # Create success criteria
    local success_criteria
    success_criteria=$(create_success_criteria "$rollout_phases")

    # Create rollback triggers
    local rollback_triggers
    rollback_triggers=$(create_rollback_triggers "$rollout_phases")

    # Generate complete rollout plan
    local rollout_plan="{
        \"timestamp\": $(date '+%s'),
        \"total_zones\": $(echo "$zone_config" | jq '.zones | length'),
        \"max_zones_per_phase\": $max_zones_per_phase,
        \"phases\": $rollout_phases,
        \"success_criteria\": $success_criteria,
        \"rollback_triggers\": $rollback_triggers,
        \"execution_strategy\": {
            \"type\": \"graduated_rollout\",
            \"monitoring_level\": \"enhanced\",
            \"auto_rollback_enabled\": true,
            \"manual_approval_required\": false
        }
    }"

    echo "$rollout_plan"
}

display_rollout_summary() {
    local rollout_plan="$1"

    echo
    info "=== Risk-Based Rollout Plan ==="
    echo "Total zones: $(echo "$rollout_plan" | jq -r '.total_zones')"
    echo "Maximum zones per phase: $(echo "$rollout_plan" | jq -r '.max_zones_per_phase')"
    echo

    local phase_count
    phase_count=$(echo "$rollout_plan" | jq '.phases | length')

    echo "Rollout Phases:"
    for ((i=0; i<phase_count; i++)); do
        local phase_data
        phase_data=$(echo "$rollout_plan" | jq ".phases[$i]")
        local phase_number=$((i + 1))
        local zone_count
        zone_count=$(echo "$phase_data" | jq '.zones | length')
        local zone_names
        zone_names=$(echo "$phase_data" | jq -r '.zones[].name' | tr '\n' ', ' | sed 's/,$//')

        echo "  Phase $phase_number: $zone_names ($zone_count zones)"
    done
    echo

    echo "Success Criteria:"
    echo "  - Minimum confidence threshold: $(echo "$rollout_plan" | jq -r '.success_criteria[0].minimum_confidence_threshold')"
    echo "  - All zones must complete: $(echo "$rollout_plan" | jq -r '.success_criteria[0].all_zones_must_complete')"
    echo "  - Validation checks: $(echo "$rollout_plan" | jq -r '.success_criteria[0].validation_checks | length') checks"
    echo

    echo "Rollback Triggers:"
    echo "  - Global triggers: 3"
    echo "  - Phase-specific triggers: $(echo "$rollout_plan" | jq '.rollback_triggers | length - 3')"
    echo
}

main() {
    local config_file="$1"
    local max_zones_per_phase="${2:-2}"

    if [[ -z "$config_file" ]]; then
        error "Usage: $0 <zone-config-file> [max-zones-per-phase]"
    fi

    if [[ ! -f "$config_file" ]]; then
        error "Configuration file not found: $config_file"
    fi

    log "Starting risk-based rollout planning for: $config_file"

    # Read configuration
    local zone_config
    if ! zone_config=$(jq . "$config_file" 2>/dev/null); then
        error "Invalid JSON in configuration file: $config_file"
    fi

    # Generate rollout plan
    local rollout_plan
    rollout_plan=$(generate_rollout_plan "$zone_config" "$max_zones_per_phase")

    # Save rollout plan
    local output_file="/tmp/rollout-plan-$(date '+%s').json"
    echo "$rollout_plan" > "$output_file"

    log "✅ Risk-based rollout planning completed"
    log "Rollout plan saved to: $output_file"

    # Display summary
    display_rollout_summary "$rollout_plan"
}

# Execute main function with all arguments
main "$@"