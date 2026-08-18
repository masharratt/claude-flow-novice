#!/usr/bin/env bash
# Remediation Helper Functions for Docker Pattern Validation
# Append to: tests/docker/architecture-test-helpers.sh

# BUG #4 FIX: Container status tracking with Docker API polling
wait_for_container_completion() {
    local container_name="$1"
    local timeout="${2:-30}"
    local start_time=$(date +%s)
    
    log_info "Waiting for container $container_name to complete (timeout: ${timeout}s)"
    
    while true; do
        local state=$(docker inspect --format='{{.State.Status}}' "$container_name" 2>/dev/null || echo "missing")
        
        if [ "$state" = "exited" ]; then
            local exit_code=$(docker inspect --format='{{.State.ExitCode}}' "$container_name")
            log_success "Container $container_name exited with code $exit_code"
            return "$exit_code"
        elif [ "$state" = "missing" ]; then
            log_error "Container $container_name not found"
            return 255
        fi
        
        local elapsed=$(($(date +%s) - start_time))
        if [ "$elapsed" -gt "$timeout" ]; then
            log_error "Timeout waiting for $container_name (${elapsed}s elapsed)"
            return 124  # Timeout exit code
        fi
        
        sleep 1
    done
}

# BUG #4 FIX: Validate exit codes for multiple containers
validate_container_exit_codes() {
    local expected_exit_code="$1"
    shift
    local containers=("$@")
    
    local failed=0
    for container in "${containers[@]}"; do
        local actual_exit_code=$(docker inspect --format='{{.State.ExitCode}}' "$container" 2>/dev/null || echo "255")
        
        if [ "$actual_exit_code" -ne "$expected_exit_code" ]; then
            log_error "Container $container: expected exit $expected_exit_code, got $actual_exit_code"
            failed=$((failed + 1))
        else
            log_success "Container $container: exit code $actual_exit_code (expected)"
        fi
    done
    
    return "$failed"
}

# BUG #4 FIX: Poll docker ps for container state changes
wait_for_all_containers_exit() {
    local timeout="${1:-60}"
    shift
    local containers=("$@")
    local start_time=$(date +%s)
    
    log_info "Waiting for ${#containers[@]} containers to exit (timeout: ${timeout}s)"
    
    while true; do
        local running_count=0
        local exited_count=0
        
        for container in "${containers[@]}"; do
            local state=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null || echo "missing")
            
            if [ "$state" = "running" ]; then
                running_count=$((running_count + 1))
            elif [ "$state" = "exited" ]; then
                exited_count=$((exited_count + 1))
            fi
        done
        
        log_info "Progress: $exited_count exited, $running_count running"
        
        if [ "$running_count" -eq 0 ]; then
            log_success "All containers exited"
            return 0
        fi
        
        local elapsed=$(($(date +%s) - start_time))
        if [ "$elapsed" -gt "$timeout" ]; then
            log_error "Timeout: $running_count containers still running after ${elapsed}s"
            return 1
        fi
        
        sleep 2
    done
}

# Security: Validate read-only filesystem enforcement
test_read_only_enforcement() {
    local container_name="$1"
    local test_path="${2:-/root/test.txt}"
    
    log_info "Testing read-only filesystem enforcement in $container_name"
    
    # Attempt write to read-only path
    if docker exec "$container_name" sh -c "echo 'test' > $test_path" 2>&1 | grep -q "Read-only file system"; then
        log_success "Read-only filesystem enforced at $test_path"
        return 0
    else
        log_error "Read-only filesystem NOT enforced at $test_path"
        return 1
    fi
}

# Security: Validate tmpfs writable in read-only container
test_tmpfs_writable() {
    local container_name="$1"
    local tmpfs_path="${2:-/tmp/test.txt}"
    
    log_info "Testing tmpfs writable in $container_name"
    
    # Write to tmpfs should succeed
    if docker exec "$container_name" sh -c "echo 'test' > $tmpfs_path && cat $tmpfs_path" | grep -q "test"; then
        log_success "Tmpfs writable at $tmpfs_path"
        return 0
    else
        log_error "Tmpfs NOT writable at $tmpfs_path"
        return 1
    fi
}

# Security: Validate capability dropping
test_capability_dropping() {
    local container_name="$1"
    
    log_info "Validating capability dropping in $container_name"
    
    local cap_drop=$(docker inspect --format='{{.HostConfig.CapDrop}}' "$container_name")
    
    if echo "$cap_drop" | grep -q "ALL"; then
        log_success "Capabilities dropped: $cap_drop"
        return 0
    else
        log_error "Capabilities NOT dropped: $cap_drop"
        return 1
    fi
}

# Security: Validate security-opt no-new-privileges
test_no_new_privileges() {
    local container_name="$1"
    
    log_info "Validating no-new-privileges in $container_name"
    
    local security_opt=$(docker inspect --format='{{.HostConfig.SecurityOpt}}' "$container_name")
    
    if echo "$security_opt" | grep -q "no-new-privileges"; then
        log_success "Security opt: no-new-privileges enabled"
        return 0
    else
        log_error "Security opt: no-new-privileges NOT enabled"
        return 1
    fi
}

# Memory: Validate OOM kill (exit code 137)
test_oom_kill_detection() {
    local container_name="$1"
    
    log_info "Validating OOM kill detection for $container_name"
    
    wait_for_container_completion "$container_name" 30
    local exit_code=$?
    
    if [ "$exit_code" -eq 137 ]; then
        log_success "OOM kill detected (exit code 137)"
        return 0
    else
        log_error "Expected OOM kill (137), got exit code $exit_code"
        return 1
    fi
}

# Volume: Validate read-only mount enforcement
test_readonly_volume_mount() {
    local container_name="$1"
    local mount_path="$2"
    
    log_info "Testing read-only volume mount at $mount_path"
    
    # Attempt write to read-only mount
    if docker exec "$container_name" sh -c "echo 'test' >> $mount_path" 2>&1 | grep -q "Read-only file system"; then
        log_success "Read-only volume mount enforced at $mount_path"
        return 0
    else
        log_error "Read-only volume mount NOT enforced at $mount_path"
        return 1
    fi
}

# Architecture: Validate memory tier allocation
validate_memory_tier() {
    local container_name="$1"
    local expected_memory_gb="$2"
    
    log_info "Validating memory tier allocation for $container_name"
    
    local actual_memory=$(docker inspect --format='{{.HostConfig.Memory}}' "$container_name")
    local expected_bytes=$(echo "$expected_memory_gb * 1024 * 1024 * 1024" | bc)
    
    if [ "$actual_memory" -eq "${expected_bytes%.*}" ]; then
        log_success "Memory tier correct: ${expected_memory_gb}GB"
        return 0
    else
        local actual_gb=$(echo "scale=2; $actual_memory / 1024 / 1024 / 1024" | bc)
        log_error "Memory tier mismatch: expected ${expected_memory_gb}GB, got ${actual_gb}GB"
        return 1
    fi
}

log_info "Docker remediation helper functions loaded"
