#!/bin/bash

# OOM Killer Optimizer - Advanced OOM Prevention and System Tuning
#OOM 杀手优化器 - 高级 OOM 预防和系统调优

set -euo pipefail

# Configuration
OPTIMIZER_VERSION="1.0.0"
OOM_CONFIG_DIR="/etc/oom-monitor"
OOM_STATE_DIR="/var/lib/oom-monitor"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$level] $message"
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log "ERROR" "This script must be run as root"
        exit 1
    fi
}

backup_sysctl_config() {
    local backup_file="/etc/sysctl.d/99-oom-monitor-backup-$(date +%Y%m%d-%H%M%S).conf"

    log "INFO" "Creating sysctl backup: $backup_file"

    # Current OOM-related sysctl settings
    {
        echo "# OOM Monitor Backup - $(date)"
        echo "# Original settings before optimization"
        sysctl -a 2>/dev/null | grep -E "vm\.|oom_" | while read -r setting; do
            echo "$setting"
        done
    } > "$backup_file"

    chmod 644 "$backup_file"
    log "INFO" "Sysctl backup created successfully"
}

get_system_profile() {
    local total_memory=$(free -m | awk '/^Mem:/{print $2}')
    local cpu_cores=$(nproc)
    local disk_type="unknown"

    # Detect if system uses SSD
    if command -v lsblk >/dev/null 2>&1; then
        local root_disk=$(lsblk -no NAME,ROTA | grep -E 'sd[a-z]|nvme' | head -1)
        if [[ -n "$root_disk" ]]; then
            local is_rotational=$(echo "$root_disk" | awk '{print $2}')
            if [[ "$is_rotational" == "0" ]]; then
                disk_type="ssd"
            else
                disk_type="hdd"
            fi
        fi
    fi

    local profile="desktop"
    if [[ $total_memory -gt 64000 ]]; then
        profile="server"
    elif [[ $total_memory -gt 16000 ]]; then
        profile="workstation"
    elif [[ $total_memory -lt 4096 ]]; then
        profile="embedded"
    fi

    jq -n \
        --arg total_memory "$total_memory" \
        --arg cpu_cores "$cpu_cores" \
        --arg disk_type "$disk_type" \
        --arg profile "$profile" \
        '{
          total_memory_mb: ($total_memory | tonumber),
          cpu_cores: ($cpu_cores | tonumber),
          disk_type: $disk_type,
          profile: $profile
        }'
}

optimize_oom_killer_settings() {
    local profile="$1"
    local sysctl_file="/etc/sysctl.d/99-oom-monitor-optimized.conf"

    log "INFO" "Optimizing OOM killer settings for profile: $profile"

    case "$profile" in
        "server")
            cat > "$sysctl_file" << 'EOF'
# OOM Monitor Optimized Settings - Server Profile
# Aggressive memory management for server workloads

# Reduce swappiness to prioritize RAM
vm.swappiness = 10

# Enable overcommit with careful limits
vm.overcommit_memory = 1
vm.overcommit_ratio = 80

# OOM killer settings
vm.panic_on_oom = 0
vm.oom_kill_allocating_task = 0
vm.oom_dump_tasks = 1

# Memory pressure and reclaim
vm.min_free_kbytes = 65536
vm.watermark_scale_factor = 200
vm.page-cluster = 3

# Dirty page settings for server workloads
vm.dirty_background_ratio = 5
vm.dirty_ratio = 10
vm.dirty_background_bytes = 1048576
vm.dirty_bytes = 4194304

# vfs cache pressure
vm.vfs_cache_pressure = 100
EOF
            ;;

        "workstation")
            cat > "$sysctl_file" << 'EOF'
# OOM Monitor Optimized Settings - Workstation Profile
# Balanced performance for desktop workstations

# Moderate swappiness
vm.swappiness = 30

# Enable overcommit
vm.overcommit_memory = 1
vm.overcommit_ratio = 50

# OOM killer settings
vm.panic_on_oom = 0
vm.oom_kill_allocating_task = 0
vm.oom_dump_tasks = 1

# Memory management
vm.min_free_kbytes = 32768
vm.watermark_scale_factor = 150
vm.page-cluster = 3

# Dirty page settings for desktop workloads
vm.dirty_background_ratio = 10
vm.dirty_ratio = 20

# vfs cache pressure
vm.vfs_cache_pressure = 50
EOF
            ;;

        "desktop")
            cat > "$sysctl_file" << 'EOF'
# OOM Monitor Optimized Settings - Desktop Profile
# Balanced settings for typical desktop systems

# Standard swappiness
vm.swappiness = 60

# Conservative overcommit
vm.overcommit_memory = 1
vm.overcommit_ratio = 50

# OOM killer settings
vm.panic_on_oom = 0
vm.oom_kill_allocating_task = 1
vm.oom_dump_tasks = 1

# Basic memory management
vm.min_free_kbytes = 16384
vm.watermark_scale_factor = 100
vm.page-cluster = 3

# Dirty page settings
vm.dirty_background_ratio = 10
vm.dirty_ratio = 20

# vfs cache pressure
vm.vfs_cache_pressure = 50
EOF
            ;;

        "embedded")
            cat > "$sysctl_file" << 'EOF'
# OOM Monitor Optimized Settings - Embedded Profile
# Conservative settings for memory-constrained systems

# Low swappiness to save flash storage
vm.swappiness = 1

# Strict overcommit control
vm.overcommit_memory = 2
vm.overcommit_ratio = 80

# OOM killer settings
vm.panic_on_oom = 0
vm.oom_kill_allocating_task = 1
vm.oom_dump_tasks = 1

# Aggressive memory reclaim
vm.min_free_kbytes = 8192
vm.watermark_scale_factor = 300
vm.page-cluster = 1

# Very conservative dirty page settings
vm.dirty_background_ratio = 5
vm.dirty_ratio = 10

# High cache pressure to reclaim memory
vm.vfs_cache_pressure = 200
EOF
            ;;
    esac

    # Add profile-specific optimizations based on disk type
    if [[ "$2" == "ssd" ]]; then
        cat >> "$sysctl_file" << 'EOF'

# SSD-specific optimizations
vm.dirty_background_ratio = 5
vm.dirty_ratio = 15
vm.dirty_writeback_centisecs = 500
vm.dirty_expire_centisecs = 3000
EOF
    fi

    chmod 644 "$sysctl_file"
    log "INFO" "OOM killer optimization settings saved to: $sysctl_file"
}

apply_oom_tuning() {
    local sysctl_file="$1"

    log "INFO" "Applying OOM tuning settings..."

    if [[ -f "$sysctl_file" ]]; then
        # Apply the settings immediately
        sysctl -p "$sysctl_file"
        log "INFO" "OOM tuning settings applied successfully"

        # Verify key settings
        log "INFO" "Current key OOM settings:"
        log "INFO" "  swappiness: $(sysctl -n vm.swappiness)"
        log "INFO" "  overcommit_memory: $(sysctl -n vm.overcommit_memory)"
        log "INFO" "  overcommit_ratio: $(sysctl -n vm.overcommit_ratio)"
        log "INFO" "  oom_kill_allocating_task: $(sysctl -n vm.oom_kill_allocating_task)"
    else
        log "ERROR" "Sysctl file not found: $sysctl_file"
        return 1
    fi
}

setup_cgroup_limits() {
    log "INFO" "Setting up cgroup memory limits..."

    # Check cgroup version
    if [[ -f "/sys/fs/cgroup/cgroup.controllers" ]]; then
        setup_cgroup_v2_limits
    elif [[ -d "/sys/fs/cgroup/memory" ]]; then
        setup_cgroup_v1_limits
    else
        log "WARN" "No cgroup support detected"
    fi
}

setup_cgroup_v2_limits() {
    log "INFO" "Setting up cgroup v2 memory limits"

    # Create unified cgroup for system services
    local system_cgroup="/sys/fs/cgroup/system.slice"

    if [[ -d "$system_cgroup" ]]; then
        # Set memory limits for system services
        local total_memory=$(free -m | awk '/^Mem:/{print $2 * 1024 * 1024}')
        local system_limit=$((total_memory * 70 / 100))  # 70% for system

        if [[ -f "$system_cgroup/memory.max" ]]; then
            echo "$system_limit" > "$system_cgroup/memory.max" 2>/dev/null || true
        fi

        if [[ -f "$system_cgroup/memory.high" ]]; then
            local high_limit=$((total_memory * 60 / 100))  # 60% high watermark
            echo "$high_limit" > "$system_cgroup/memory.high" 2>/dev/null || true
        fi
    fi
}

setup_cgroup_v1_limits() {
    log "INFO" "Setting up cgroup v1 memory limits"

    local memory_cgroup="/sys/fs/cgroup/memory"

    if [[ -d "$memory_cgroup" ]]; then
        # Configure memory soft limits
        local total_memory=$(free -m | awk '/^Mem:/{print $2}')
        local soft_limit=$((total_memory * 80 / 100))  # 80% soft limit

        if [[ -f "$memory_cgroup/memory.soft_limit_in_bytes" ]]; then
            echo "${soft_limit}M" > "$memory_cgroup/memory.soft_limit_in_bytes" 2>/dev/null || true
        fi
    fi
}

optimize_process_priorities() {
    log "INFO" "Optimizing process priorities for memory management"

    # Set nice values for memory-critical processes
    local memory_critical_processes=(
        "systemd"
        "kernel"
        "kthreadd"
        "ksoftirqd"
        "migration"
    )

    for process in "${memory_critical_processes[@]}"; do
        local pids=$(pgrep "$process" 2>/dev/null || true)
        for pid in $pids; do
            if [[ -n "$pid" && "$pid" != "0" ]]; then
                renice -n -10 "$pid" >/dev/null 2>&1 || true
                log "DEBUG" "Set high priority for process $process (PID: $pid)"
            fi
        done
    done

    # Lower priority for memory-intensive user processes
    local memory_intensive_processes=(
        "chrome"
        "firefox"
        "node"
        "java"
        "python"
        "docker"
    )

    for process in "${memory_intensive_processes[@]}"; do
        local pids=$(pgrep "$process" 2>/dev/null || true)
        for pid in $pids; do
            if [[ -n "$pid" && "$pid" != "0" ]]; then
                renice -n 5 "$pid" >/dev/null 2>&1 || true
                log "DEBUG" "Set lower priority for process $process (PID: $pid)"
            fi
        done
    done
}

configure_swap_optimization() {
    log "INFO" "Configuring swap optimization"

    # Check if swap is enabled
    local swap_total=$(free -m | awk '/^Swap:/{print $2}')

    if [[ $swap_total -eq 0 ]]; then
        log "WARN" "No swap space detected. Consider adding swap for better OOM handling."
        return
    fi

    # Get swap devices
    local swap_devices=$(swapon --show=NAME --noheadings 2>/dev/null || true)

    if [[ -n "$swap_devices" ]]; then
        # Configure swapiness settings based on available RAM
        local total_memory=$(free -m | awk '/^Mem:/{print $2}')
        local swappiness=10  # Default conservative value

        if [[ $total_memory -gt 16000 ]]; then
            swappiness=5   # Very low for systems with lots of RAM
        elif [[ $total_memory -gt 8000 ]]; then
            swappiness=10  # Low for systems with moderate RAM
        elif [[ $total_memory -gt 4000 ]]; then
            swappiness=20  # Moderate for systems with limited RAM
        else
            swappiness=30  # Higher for very low memory systems
        fi

        sysctl -w "vm.swappiness=$swappiness"
        log "INFO" "Set swappiness to $swappiness"
    fi
}

create_recovery_scripts() {
    local recovery_dir="$OOM_CONFIG_DIR/recovery"
    mkdir -p "$recovery_dir"

    log "INFO" "Creating memory recovery scripts"

    # Emergency memory recovery script
    cat > "$recovery_dir/emergency-recovery.sh" << 'EOF'
#!/bin/bash
# Emergency Memory Recovery Script

echo "=== Emergency Memory Recovery Started ==="
echo "Time: $(date)"

# Show current memory state
echo "Memory before recovery:"
free -h

# Clear system caches (level 3 - most aggressive)
echo "Clearing system caches..."
sync
echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || true

# Terminate high-memory processes (over 1GB RSS)
echo "Identifying high-memory processes (>1GB RSS):"
ps aux --sort=-rss | awk '$6 > 1024*1024 {printf "%-8s %-6s %-6s %s\n", $1, $2, $6/1024, $11}' | head -10

# Kill problematic processes (very conservative - only kill processes with "defunct" status)
echo "Cleaning up defunct processes..."
ps aux | awk '$8 ~ /^Z/ {print $2}' | xargs -r kill -9 2>/dev/null || true

# Clear swap if possible
echo "Attempting to clear swap..."
swapoff -a && swapon -a 2>/dev/null || true

echo "Memory after recovery:"
free -h

echo "=== Emergency Memory Recovery Completed ==="
EOF

    # Manual memory cleanup script
    cat > "$recovery_dir/manual-cleanup.sh" << 'EOF'
#!/bin/bash
# Manual Memory Cleanup Script

echo "=== Manual Memory Cleanup ==="

# Clear page cache only (less aggressive)
echo "Clearing page cache..."
sync
echo 1 > /proc/sys/vm/drop_caches 2>/dev/null || true

# Clear dentries and inodes
echo "Clearing dentries and inodes..."
echo 2 > /proc/sys/vm/drop_caches 2>/dev/null || true

echo "Manual cleanup completed"
EOF

    # Process memory analysis script
    cat > "$recovery_dir/analyze-processes.sh" << 'EOF'
#!/bin/bash
# Process Memory Analysis Script

echo "=== Process Memory Analysis ==="
echo "Time: $(date)"

# Top memory processes
echo "Top 10 Memory Processes:"
ps aux --sort=-%mem | head -11

echo ""
echo "Top 10 RSS Processes:"
ps aux --sort=-rss | head -11

echo ""
echo "Memory usage by user:"
ps aux --no-headers | awk '{user[$1] += $6} END {for (u in user) printf "%-10s %6.1f MB\n", u, user[u]/1024}' | sort -k2 -nr

echo ""
echo "Swap usage by process:"
for file in /proc/*/status; do
    if [[ -f "$file" ]]; then
        local pid=$(echo "$file" | cut -d/ -f3)
        local name=$(grep -E '^Name:' "$file" | cut -f2)
        local swap=$(grep -E '^VmSwap:' "$file" | awk '{print $2}')
        if [[ -n "$swap" && "$swap" != "0" ]]; then
            printf "%-20s %6s KB %s\n" "$name" "$swap" "$pid"
        fi
    fi
done | sort -k3 -nr | head -10
EOF

    # Make scripts executable
    chmod +x "$recovery_dir"/*.sh

    log "INFO" "Recovery scripts created in: $recovery_dir"
}

generate_optimization_report() {
    local profile="$1"
    local report_file="$OOM_STATE_DIR/optimization-report-$(date +%Y%m%d-%H%M%S).json"

    log "INFO" "Generating optimization report..."

    local current_settings=$(sysctl -a 2>/dev/null | grep -E "vm\.|oom_" | jq -R -s 'split("\n") | map(select(length > 0) | split(" = ") | {key: .[0], value: .[1]}) | from_entries')

    local report=$(jq -n \
        --arg timestamp "$(date -Iseconds)" \
        --arg profile "$profile" \
        --argjson current_settings "$current_settings" \
        --argjson system_profile "$(get_system_profile)" \
        '{
          timestamp: $timestamp,
          profile: $profile,
          system_profile: $system_profile,
          current_settings: $current_settings,
          optimization_applied: true
        }')

    echo "$report" > "$report_file"
    log "INFO" "Optimization report saved to: $report_file"

    # Also show summary
    echo ""
    echo "=== Optimization Summary ==="
    echo "Profile: $profile"
    echo "Total Memory: $(jq -r '.system_profile.total_memory_mb' <<< "$report") MB"
    echo "CPU Cores: $(jq -r '.system_profile.cpu_cores' <<< "$report")"
    echo "Disk Type: $(jq -r '.system_profile.disk_type' <<< "$report")"
    echo ""
    echo "Key Settings Applied:"
    echo "  swappiness: $(jq -r '.current_settings."vm.swappiness"' <<< "$report")"
    echo "  overcommit_memory: $(jq -r '.current_settings."vm.overcommit_memory"' <<< "$report")"
    echo "  oom_kill_allocating_task: $(jq -r '.current_settings."vm.oom_kill_allocating_task"' <<< "$report")"
}

# Main execution
main() {
    log "INFO" "Starting OOM Killer Optimizer v$OPTIMIZER_VERSION"

    check_root

    # Get system profile
    local system_profile_json=$(get_system_profile)
    local profile=$(echo "$system_profile_json" | jq -r '.profile')
    local disk_type=$(echo "$system_profile_json" | jq -r '.disk_type')

    log "INFO" "Detected system profile: $profile ($disk_type)"

    # Create backup
    backup_sysctl_config

    # Optimize settings
    optimize_oom_killer_settings "$profile" "$disk_type"

    # Apply tuning
    apply_oom_tuning "/etc/sysctl.d/99-oom-monitor-optimized.conf"

    # Setup cgroup limits
    setup_cgroup_limits

    # Configure swap
    configure_swap_optimization

    # Optimize process priorities
    optimize_process_priorities

    # Create recovery scripts
    create_recovery_scripts

    # Generate report
    generate_optimization_report "$profile"

    log "INFO" "OOM killer optimization completed successfully!"
    log "INFO" "Recovery scripts available in: $OOM_CONFIG_DIR/recovery/"
}

# Command line interface
case "${1:-optimize}" in
    "optimize")
        main
        ;;
    "backup")
        backup_sysctl_config
        ;;
    "restore")
        local latest_backup=$(ls -t /etc/sysctl.d/99-oom-monitor-backup-*.conf 2>/dev/null | head -1)
        if [[ -n "$latest_backup" ]]; then
            log "INFO" "Restoring from backup: $latest_backup"
            sysctl -p "$latest_backup"
        else
            log "ERROR" "No backup found"
            exit 1
        fi
        ;;
    "profile")
        get_system_profile | jq '.'
        ;;
    "test")
        log "INFO" "Running OOM optimization test"
        echo "Current OOM settings:"
        sysctl -a 2>/dev/null | grep -E "vm\.|oom_" | sort
        ;;
    *)
        echo "Usage: $0 {optimize|backup|restore|profile|test}"
        echo "  optimize - Apply OOM killer optimizations"
        echo "  backup   - Backup current sysctl settings"
        echo "  restore  - Restore from backup"
        echo "  profile  - Show system profile"
        echo "  test     - Test current OOM settings"
        exit 1
        ;;
esac