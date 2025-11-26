#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../cfn-redis-coordination/redis-utils.sh"

# Configuration
DEFAULT_MEMORY_PER_COORDINATOR=2048  # MB
DEFAULT_CPU_PER_COORDINATOR=2
DEFAULT_REDIS_DB_START=1
DEFAULT_REDIS_DB_END=15
CLEANUP_OVERHEAD=0.15  # 15%
MONITORING_OVERHEAD=0.05  # 5%

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

get_system_resources() {
    local memory_kb cpu_cores
    memory_kb=$(grep MemTotal /proc/meminfo | awk '{print $2}')
    cpu_cores=$(nproc)

    local memory_mb=$((memory_kb / 1024))

    echo "{\"memory_mb\": $memory_mb, \"cpu_cores\": $cpu_cores}"
}

calculate_max_coordinators() {
    local system_resources="$1"
    local memory_mb cpu_cores

    memory_mb=$(echo "$system_resources" | jq -r '.memory_mb')
    cpu_cores=$(echo "$system_resources" | jq -r '.cpu_cores')

    # Calculate with overhead
    local effective_memory=$((memory_mb - (memory_mb * CLEANUP_OVERHEAD + memory_mb * MONITORING_OVERHEAD)))
    local effective_cpu=$((cpu_cores - (cpu_cores * CLEANUP_OVERHEAD + cpu_cores * MONITORING_OVERHEAD)))

    local max_by_memory=$((effective_memory / DEFAULT_MEMORY_PER_COORDINATOR))
    local max_by_cpu=$((effective_cpu / DEFAULT_CPU_PER_COORDINATOR))

    # Return the smaller of the two limits
    if [[ $max_by_memory -lt $max_by_cpu ]]; then
        echo $max_by_memory
    else
        echo $max_by_cpu
    fi
}

reserve_redis_namespace() {
    local zone_name="$1"
    local task_id="$2"
    local redis_db="$3"

    local namespace_pattern="swarm:zone-${zone_name}:${task_id}"

    # Test Redis connectivity
    if ! redis-cli ping >/dev/null 2>&1; then
        error "Redis connection failed"
    fi

    # Reserve namespace with SETNX and TTL
    local reservation_key="${namespace_pattern}:reservation"
    local reservation_result
    reservation_result=$(redis-cli setnx "$reservation_key" "$(date '+%s')" 2>/dev/null || echo "0")

    if [[ "$reservation_result" != "1" ]]; then
        error "Namespace already reserved: $namespace_pattern"
    fi

    # Set TTL for reservation (1 hour)
    redis-cli expire "$reservation_key" 3600 >/dev/null

    log "✓ Redis namespace reserved: $namespace_pattern (DB: $redis_db)"
    echo "$namespace_pattern"
}

allocate_redis_databases() {
    local zone_count="$1"
    local start_db="$2"
    local end_db="$3"

    local available_dbs=$((end_db - start_db + 1))

    if [[ $zone_count -gt $available_dbs ]]; then
        error "Too many zones: $zone_count (available DBs: $available_dbs)"
    fi

    local db_allocation=()
    for ((i=0; i<zone_count; i++)); do
        db_allocation+=($((start_db + i)))
    done

    printf '%s\n' "${db_allocation[@]}"
}

generate_task_id() {
    local zone_name="$1"
    local timestamp
    timestamp=$(date '+%s')

    echo "zone-${zone_name}-${timestamp}"
}

plan_zone_resources() {
    local zone_name="$1"
    local redis_db="$2"
    local task_data="$3"

    local task_id
    task_id=$(generate_task_id "$zone_name")

    # Reserve Redis namespace
    local namespace_pattern
    namespace_pattern=$(reserve_redis_namespace "$zone_name" "$task_id" "$redis_db")

    # Generate resource plan
    local resource_plan="{
        \"zone_name\": \"$zone_name\",
        \"task_id\": \"$task_id\",
        \"namespace_pattern\": \"$namespace_pattern\",
        \"redis_db\": $redis_db,
        \"memory_mb\": $DEFAULT_MEMORY_PER_COORDINATOR,
        \"cpu_cores\": $DEFAULT_CPU_PER_COORDINATOR,
        \"working_directory\": \"/tmp/zone-${zone_name}-${task_id}\",
        \"monitoring_port\": $((8080 + redis_db)),
        \"timestamp\": $(date '+%s')
    }"

    log "✓ Resource plan generated for zone: $zone_name"
    echo "$resource_plan"
}

validate_resource_availability() {
    local zone_count="$1"
    local system_resources="$2"

    local max_coordinators
    max_coordinators=$(calculate_max_coordinators "$system_resources")

    if [[ $zone_count -gt $max_coordinators ]]; then
        error "Insufficient resources for $zone_count coordinators (maximum: $max_coordinators)"
    fi

    log "✓ Resource availability validated: $zone_count zones (capacity: $max_coordinators)"
}

main() {
    local config_file="$1"

    if [[ -z "$config_file" ]]; then
        error "Usage: $0 <zone-config-file>"
    fi

    if [[ ! -f "$config_file" ]]; then
        error "Configuration file not found: $config_file"
    fi

    log "Starting coordinator resource planning for: $config_file"

    # Read configuration
    local zone_config
    if ! zone_config=$(jq . "$config_file" 2>/dev/null); then
        error "Invalid JSON in configuration file: $config_file"
    fi

    local zone_count
    zone_count=$(echo "$zone_config" | jq '.zones | length')

    if [[ $zone_count -eq 0 ]]; then
        error "No zones found in configuration"
    fi

    info "Planning resources for $zone_count zones"

    # Get system resources
    local system_resources
    system_resources=$(get_system_resources)

    # Validate resource availability
    validate_resource_availability "$zone_count" "$system_resources"

    # Allocate Redis databases
    local redis_dbs
    mapfile -t redis_dbs < <(allocate_redis_databases "$zone_count" "$DEFAULT_REDIS_DB_START" "$DEFAULT_REDIS_DB_END")

    # Generate resource plan for each zone
    local resource_plans="[]"
    local i=0

    while IFS= read -r zone_name; do
        local zone_data
        zone_data=$(echo "$zone_config" | jq -r ".zones[$i]")

        local resource_plan
        resource_plan=$(plan_zone_resources "$zone_name" "${redis_dbs[$i]}" "$zone_data")

        resource_plans=$(echo "$resource_plans" | jq ". + [$resource_plan]")

        ((i++))
    done < <(echo "$zone_config" | jq -r '.zones[].name')

    # Generate complete resource allocation plan
    local allocation_plan="{
        \"timestamp\": $(date '+%s'),
        \"zone_count\": $zone_count,
        \"system_resources\": $system_resources,
        \"max_coordinators\": $(calculate_max_coordinators "$system_resources"),
        \"resource_plans\": $resource_plans,
        \"redis_allocation\": {
            \"databases_used\": $(printf '%s,' "${redis_dbs[@]}" | sed 's/,$//'),
            \"total_allocated\": $zone_count
        }
    }"

    # Save allocation plan
    local output_file="/tmp/coordinator-resource-plan-$(date '+%s').json"
    echo "$allocation_plan" > "$output_file"

    log "✅ Coordinator resource planning completed"
    log "Resource allocation plan saved to: $output_file"

    # Display summary
    echo
    info "=== Resource Allocation Summary ==="
    echo "Zones to execute: $zone_count"
    echo "System memory: $(echo "$system_resources" | jq -r '.memory_mb') MB"
    echo "System CPUs: $(echo "$system_resources" | jq -r '.cpu_cores')"
    echo "Memory per coordinator: ${DEFAULT_MEMORY_PER_COORDINATOR} MB"
    echo "CPUs per coordinator: ${DEFAULT_CPU_PER_COORDINATOR}"
    echo "Redis databases allocated: ${redis_dbs[*]}"
    echo
}

# Execute main function with all arguments
main "$@"