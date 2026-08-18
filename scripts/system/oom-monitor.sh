#!/usr/bin/env bash

# OOM Monitor Daemon - Advanced Out of Memory Detection and Prevention
# Comprehensive Linux memory watchdog for troubleshooting and leak analytics

set -euo pipefail

# Configuration
OOM_MONITOR_VERSION="1.0.0"
OOM_MONITOR_HOME="/opt/oom-monitor"
OOM_LOG_DIR="/var/log/oom-monitor"
OOM_STATE_DIR="/var/lib/oom-monitor"
OOM_CONFIG_DIR="/etc/oom-monitor"
OOM_TERMINATION_LOG="$OOM_STATE_DIR/terminated-processes.jsonl"
OOM_KERNEL_CURSOR="$OOM_STATE_DIR/kernel-oom.cursor"

# Create necessary directories
mkdir -p "$OOM_LOG_DIR" "$OOM_STATE_DIR" "$OOM_CONFIG_DIR"
touch "$OOM_TERMINATION_LOG"
chmod 640 "$OOM_TERMINATION_LOG"
touch "$OOM_KERNEL_CURSOR"
chmod 640 "$OOM_KERNEL_CURSOR"

# Configuration file
CONFIG_FILE="$OOM_CONFIG_DIR/oom-monitor.conf"

# Logging
LOG_FILE="$OOM_LOG_DIR/oom-monitor.log"
ALERT_LOG="$OOM_LOG_DIR/oom-alerts.log"
DEBUG_LOG="$OOM_LOG_DIR/oom-debug.log"

# Colors for terminal output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

# Global state
MONITOR_PID=""
RUNNING=true

# Default configuration
DEFAULT_CONFIG='{
  "monitoring": {
    "interval_seconds": 2,
    "memory_warning_threshold": 80,
    "memory_critical_threshold": 90,
    "psi_warning_threshold": 10,
    "psi_critical_threshold": 50,
    "enable_cgroup_monitoring": true,
    "enable_psi_monitoring": true,
    "enable_oom_killer_tuning": true
  },
  "alerts": {
    "enable_syslog": true,
    "enable_email": false,
    "email_recipients": [],
    "enable_webhook": false,
    "webhook_url": "",
    "enable_slack": false,
    "slack_webhook": ""
  },
  "prevention": {
    "enable_early_termination": true,
    "enable_memory_recovery": true,
    "enable_process_nice_adjustment": true,
    "swap_threshold": 95,
    "process_termination_threshold": 95,
    "graceful_shutdown_timeout": 30,
    "max_terminations_per_cycle": 2,
    "min_candidate_mem_percent": 10
  },
  "exclusions": {
    "protected_processes": ["systemd", "kernel", "sshd", "networkd"],
    "protected_users": ["root"],
    "protected_cgroups": ["system.slice", "init.scope"]
  }
}'

log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local pid=$$

    echo "[$timestamp] [$level] [PID:$pid] $message" >> "$LOG_FILE"

    # Also output to stderr for errors, stdout for normal messages
    if [[ "$level" == "ERROR" || "$level" == "CRITICAL" ]]; then
        echo "[$timestamp] $level: $message" >&2
    else
        echo "[$timestamp] $level: $message"
    fi
}

log_debug() {
    if [[ "${DEBUG:-0}" == "1" ]]; then
        local message="$*"
        local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
        echo "[$timestamp] DEBUG: $message" >> "$DEBUG_LOG"
    fi
}

send_alert() {
    local severity=$1
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    log "ALERT" "$severity: $message"
    echo "[$timestamp] [$severity] $message" >> "$ALERT_LOG"

    # Send to syslog if enabled
    if command -v logger >/dev/null 2>&1; then
        logger -t "oom-monitor" -p "daemon.$severity" "$message"
    fi

    # Add webhook/email/slack notifications here based on config
    local alert_type=$(jq -r ".alerts" "$CONFIG_FILE" 2>/dev/null || echo '{}')

    # Webhook notification
    if echo "$alert_type" | jq -e '.enable_webhook' >/dev/null 2>&1 && \
       [[ -n $(echo "$alert_type" | jq -r '.webhook_url // empty') ]]; then
        local webhook_url=$(echo "$alert_type" | jq -r '.webhook_url')
        curl -s -X POST "$webhook_url" \
             -H "Content-Type: application/json" \
             -d "{
               \"timestamp\": \"$timestamp\",
               \"severity\": \"$severity\",
               \"message\": \"$message\",
               \"hostname\": \"$(hostname)\"
             }" >/dev/null 2>&1 || true
    fi
}

check_system_requirements() {
    log "INFO" "Checking system requirements..."

    # Check if running as root
    if [[ $EUID -ne 0 ]]; then
        log "ERROR" "This script must be run as root for full functionality"
        exit 1
    fi

    # Check kernel version (need 4.20+ for PSI)
    local kernel_version=$(uname -r | cut -d. -f1,2)
    local major=$(echo "$kernel_version" | cut -d. -f1)
    local minor=$(echo "$kernel_version" | cut -d. -f2)

    if [[ $major -lt 4 ]] || [[ $major -eq 4 && $minor -lt 20 ]]; then
        log "WARN" "Kernel version $kernel_version detected. PSI monitoring requires kernel 4.20+"
    else
        log "INFO" "Kernel version $kernel_version supports PSI monitoring"
    fi

    # Check for required tools
    local required_tools=("jq" "free" "ps" "awk" "sort" "head")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" >/dev/null 2>&1; then
            log "ERROR" "Required tool '$tool' not found"
            exit 1
        fi
    done

    # Check for PSI availability
    if [[ -f "/proc/pressure/memory" ]]; then
        log "INFO" "PSI memory pressure interface available"
    else
        log "WARN" "PSI memory pressure interface not available"
    fi

    # Check for cgroup v2
    if [[ -f "/sys/fs/cgroup/cgroup.controllers" ]]; then
        log "INFO" "cgroup v2 detected"
    elif [[ -d "/sys/fs/cgroup/memory" ]]; then
        log "INFO" "cgroup v1 detected"
    else
        log "WARN" "No cgroup support detected"
    fi
}

initialize_config() {
    if [[ ! -f "$CONFIG_FILE" ]]; then
        log "INFO" "Creating default configuration file"
        echo "$DEFAULT_CONFIG" > "$CONFIG_FILE"
        chmod 640 "$CONFIG_FILE"
    else
        log "INFO" "Configuration file exists"
    fi
}

get_memory_info() {
    local mem_info
    mem_info=$(free -m | grep '^Mem:')

    local total=$(echo "$mem_info" | awk '{print $2}')
    local used=$(echo "$mem_info" | awk '{print $3}')
    local available=$(echo "$mem_info" | awk '{print $7}')
    local usage_percent=$(( used * 100 / total ))

    # Swap info
    local swap_info
    swap_info=$(free -m | grep '^Swap:')
    local swap_total=$(echo "$swap_info" | awk '{print $2}')
    local swap_used=$(echo "$swap_info" | awk '{print $3}')
    local swap_percent=0
    if [[ $swap_total -gt 0 ]]; then
        swap_percent=$(( swap_used * 100 / swap_total ))
    fi

    # Return JSON format
    jq -n \
        --arg total "$total" \
        --arg used "$used" \
        --arg available "$available" \
        --arg usage_percent "$usage_percent" \
        --arg swap_total "$swap_total" \
        --arg swap_used "$swap_used" \
        --arg swap_percent "$swap_percent" \
        '{
          total: ($total | tonumber),
          used: ($used | tonumber),
          available: ($available | tonumber),
          usage_percent: ($usage_percent | tonumber),
          swap_total: ($swap_total | tonumber),
          swap_used: ($swap_used | tonumber),
          swap_percent: ($swap_percent | tonumber)
        }'
}

get_psi_info() {
    if [[ ! -f "/proc/pressure/memory" ]]; then
        echo '{"available": false}'
        return
    fi

    local psi_content
    psi_content=$(cat /proc/pressure/memory)

    local some_avg10=$(echo "$psi_content" | grep 'some' | awk '{print $2}' | cut -d= -f2)
    local some_avg60=$(echo "$psi_content" | grep 'some' | awk '{print $3}' | cut -d= -f2)
    local some_avg300=$(echo "$psi_content" | grep 'some' | awk '{print $4}' | cut -d= -f2)

    local full_avg10=$(echo "$psi_content" | grep 'full' | awk '{print $2}' | cut -d= -f2)
    local full_avg60=$(echo "$psi_content" | grep 'full' | awk '{print $3}' | cut -d= -f2)
    local full_avg300=$(echo "$psi_content" | grep 'full' | awk '{print $4}' | cut -d= -f2)

    jq -n \
        --arg some_avg10 "$some_avg10" \
        --arg some_avg60 "$some_avg60" \
        --arg some_avg300 "$some_avg300" \
        --arg full_avg10 "$full_avg10" \
        --arg full_avg60 "$full_avg60" \
        --arg full_avg300 "$full_avg300" \
        '{
          available: true,
          some: {
            avg10: ($some_avg10 | tonumber),
            avg60: ($some_avg60 | tonumber),
            avg300: ($some_avg300 | tonumber)
          },
          full: {
            avg10: ($full_avg10 | tonumber),
            avg60: ($full_avg60 | tonumber),
            avg300: ($full_avg300 | tonumber)
          }
        }'
}

get_top_memory_processes() {
    local limit=${1:-10}

    # Get top memory consuming processes
    ps aux --sort=-%mem | head -n "$((limit + 1))" | tail -n "$limit" | while IFS= read -r line; do
        local pid=$(echo "$line" | awk '{print $2}')
        local user=$(echo "$line" | awk '{print $1}')
        local cpu=$(echo "$line" | awk '{print $3}')
        local mem=$(echo "$line" | awk '{print $4}')
        local vsz=$(echo "$line" | awk '{print $5}')
        local rss=$(echo "$line" | awk '{print $6}')
        local comm=$(echo "$line" | awk '{print $11}')

        jq -n \
            --arg pid "$pid" \
            --arg user "$user" \
            --arg cpu "$cpu" \
            --arg mem "$mem" \
            --arg vsz "$vsz" \
            --arg rss "$rss" \
            --arg comm "$comm" \
            '{
              pid: ($pid | tonumber),
              user: $user,
              cpu_percent: ($cpu | tonumber),
              mem_percent: ($mem | tonumber),
              vsz: ($vsz | tonumber),
              rss: ($rss | tonumber),
              command: $comm
            }'
    done | jq -s '.'
}

is_process_protected() {
    local pid="$1"
    local config="$2"

    local comm=$(ps -p "$pid" -o comm= 2>/dev/null || echo "")
    local user=$(ps -p "$pid" -o user= 2>/dev/null || echo "")
    local cgroup_paths=$(cat "/proc/$pid/cgroup" 2>/dev/null || echo "")

    if [[ -z "$comm" && -z "$user" ]]; then
        return 1
    fi

    if [[ -n "$comm" ]]; then
        local process_match
        process_match=$(echo "$config" | jq -r --arg name "$comm" '(((.exclusions // {}) | .protected_processes // []) | index($name)) | if . == null then "false" else "true" end' 2>/dev/null || echo "false")
        if [[ "$process_match" == "true" ]]; then
            return 0
        fi
    fi

    if [[ -n "$user" ]]; then
        local user_match
        user_match=$(echo "$config" | jq -r --arg uname "$user" '(((.exclusions // {}) | .protected_users // []) | index($uname)) | if . == null then "false" else "true" end' 2>/dev/null || echo "false")
        if [[ "$user_match" == "true" ]]; then
            return 0
        fi
    fi

    if [[ -n "$cgroup_paths" ]]; then
        while IFS= read -r cg; do
            [[ -z "$cg" ]] && continue
            if grep -Fq "$cg" <<< "$cgroup_paths"; then
                return 0
            fi
        done < <(echo "$config" | jq -r '(((.exclusions // {}) | .protected_cgroups // []) | .[])' 2>/dev/null || true)
    fi

    return 1
}

capture_process_snapshot() {
    local pid="$1"
    local reason="${2:-unknown}"
    local severity="${3:-info}"
    local mem_usage="${4:-0}"
    local top_process_json="${5:-}"

    if ! kill -0 "$pid" 2>/dev/null; then
        return 0
    fi

    local status_file="/proc/$pid/status"
    local ppid=$(awk '/^PPid:/ {print $2}' "$status_file" 2>/dev/null || echo "0")
    local threads=$(awk '/^Threads:/ {print $2}' "$status_file" 2>/dev/null || echo "0")
    local rss_kb=$(awk '/^VmRSS:/ {print $2}' "$status_file" 2>/dev/null || echo "0")
    local vsz_kb=$(awk '/^VmSize:/ {print $2}' "$status_file" 2>/dev/null || echo "0")
    local oom_score=$(cat "/proc/$pid/oom_score" 2>/dev/null || echo "0")
    local oom_score_adj=$(cat "/proc/$pid/oom_score_adj" 2>/dev/null || echo "0")
    local cmdline=$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null | sed 's/ *$//')
    local comm=$(ps -p "$pid" -o comm= 2>/dev/null || echo "")
    local user=$(ps -p "$pid" -o user= 2>/dev/null || echo "")

    if [[ -z "$cmdline" ]]; then
        cmdline="$comm"
    fi

    local open_files=0
    if [[ -d "/proc/$pid/fd" ]]; then
        local fd_count
        fd_count=$( (ls "/proc/$pid/fd" 2>/dev/null | wc -l) || echo "0" )
        open_files=$(echo "$fd_count" | tr -d '[:space:]')
    fi

    local cgroup_json="[]"
    if [[ -f "/proc/$pid/cgroup" ]]; then
        cgroup_json=$(jq -R -s 'split("\n") | map(select(length>0))' "/proc/$pid/cgroup" 2>/dev/null || echo "[]")
    fi

    local top_sample="null"
    if [[ -n "$top_process_json" ]]; then
        top_sample="$top_process_json"
    fi

    jq -n \
        --arg timestamp "$(date -Iseconds)" \
        --arg reason "$reason" \
        --arg severity "$severity" \
        --arg memory_usage "$mem_usage" \
        --arg pid "$pid" \
        --arg ppid "$ppid" \
        --arg user "$user" \
        --arg name "$comm" \
        --arg cmdline "$cmdline" \
        --arg threads "$threads" \
        --arg rss_kb "$rss_kb" \
        --arg vsz_kb "$vsz_kb" \
        --arg open_files "$open_files" \
        --arg oom_score "$oom_score" \
        --arg oom_score_adj "$oom_score_adj" \
        --argjson cgroups "$cgroup_json" \
        --argjson top_process "$top_sample" \
        '{
          timestamp: $timestamp,
          reason: $reason,
          severity: $severity,
          system_memory_percent: ($memory_usage | tonumber? // 0),
          process: {
            pid: ($pid | tonumber),
            ppid: ($ppid | tonumber),
            user: $user,
            name: $name,
            cmdline: $cmdline,
            threads: ($threads | tonumber? // 0),
            rss_kb: ($rss_kb | tonumber? // 0),
            vsz_kb: ($vsz_kb | tonumber? // 0),
            open_files: ($open_files | tonumber? // 0),
            oom_score: ($oom_score | tonumber? // 0),
            oom_score_adj: ($oom_score_adj | tonumber? // 0)
          },
          cgroups: $cgroups,
          top_sample: $top_process
        }'
}

terminate_process() {
    local pid="$1"
    local reason="$2"
    local severity="$3"
    local mem_usage="$4"
    local graceful_timeout="${5:-30}"
    local top_process_json="${6:-}"

    if ! kill -0 "$pid" 2>/dev/null; then
        log "WARN" "Process $pid no longer running before termination sequence"
        return
    fi

    local command=$(ps -p "$pid" -o comm= 2>/dev/null || echo "unknown")
    local snapshot
    snapshot=$(capture_process_snapshot "$pid" "$reason" "$severity" "$mem_usage" "$top_process_json")
    if [[ -n "$snapshot" ]]; then
        echo "$snapshot" >> "$OOM_TERMINATION_LOG"
        log "INFO" "Captured shutdown snapshot for PID $pid ($command)"
    fi

    log "WARN" "Sending SIGTERM to PID $pid ($command) due to $reason"
    kill -15 "$pid" 2>/dev/null || true

    local waited=0
    while kill -0 "$pid" 2>/dev/null && [[ $waited -lt $graceful_timeout ]]; do
        sleep 1
        waited=$((waited + 1))
    done

    if kill -0 "$pid" 2>/dev/null; then
        log "ERROR" "PID $pid ($command) ignored SIGTERM; issuing SIGKILL"
        kill -9 "$pid" 2>/dev/null || true
    fi

    log "INFO" "Process $pid ($command) terminated after ${waited}s grace period"
    log "INFO" "Termination details logged to $OOM_TERMINATION_LOG"
}

terminate_high_memory_processes() {
    local top_processes="$1"
    local config="$2"
    local severity="$3"
    local mem_usage="$4"

    if [[ -z "$top_processes" || "$top_processes" == "null" ]]; then
        log "WARN" "No process data available for termination evaluation"
        return
    fi

    local graceful_timeout
    graceful_timeout=$(echo "$config" | jq -r '.prevention.graceful_shutdown_timeout // 30')
    local termination_limit
    termination_limit=$(echo "$config" | jq -r '.prevention.max_terminations_per_cycle // 2')
    local min_candidate_percent
    min_candidate_percent=$(echo "$config" | jq -r '.prevention.min_candidate_mem_percent // 10')

    local killed=0
    local reason="memory-pressure-${severity}"

    while IFS= read -r process; do
        [[ -z "$process" ]] && continue
        local pid
        pid=$(echo "$process" | jq -r '.pid')
        local mem_percent
        mem_percent=$(echo "$process" | jq -r '.mem_percent // 0')
        local command
        command=$(echo "$process" | jq -r '.command // ""')

        if [[ -z "$pid" || "$pid" == "null" ]]; then
            continue
        fi

        local mem_percent_int=${mem_percent%.*}
        if [[ -z "$mem_percent_int" ]]; then
            mem_percent_int=0
        fi

        if (( mem_percent_int < min_candidate_percent )); then
            continue
        fi

        if is_process_protected "$pid" "$config"; then
            log "INFO" "Skipping protected process $pid ($command)"
            continue
        fi

        terminate_process "$pid" "$reason" "$severity" "$mem_usage" "$graceful_timeout" "$process"
        killed=$((killed + 1))

        if (( killed >= termination_limit )); then
            break
        fi
    done < <(echo "$top_processes" | jq -c 'sort_by(-.mem_percent)[] | select(.pid != null)')

    if (( killed == 0 )); then
        log "WARN" "Memory pressure exceeded threshold but no eligible processes were terminated"
    else
        log "INFO" "$killed high-memory process(es) terminated; review $OOM_TERMINATION_LOG for leak data"
    fi
}

log_kernel_oom_event() {
    local line="$1"
    local source="$2"

    local pid=""
    local process_name=""
    local score=""
    local total_vm=""

    local kill_regex='Kill process ([0-9]+) \(([^)]+)\)'
    local killed_regex='Killed process ([0-9]+) \(([^)]+)\)'
    local score_regex='score ([0-9]+)'
    local total_vm_regex='total-vm:([0-9]+)kB'

    if [[ "$line" =~ $kill_regex ]]; then
        pid="${BASH_REMATCH[1]}"
        process_name="${BASH_REMATCH[2]}"
    elif [[ "$line" =~ $killed_regex ]]; then
        pid="${BASH_REMATCH[1]}"
        process_name="${BASH_REMATCH[2]}"
    fi

    if [[ "$line" =~ $score_regex ]]; then
        score="${BASH_REMATCH[1]}"
    fi

    if [[ "$line" =~ $total_vm_regex ]]; then
        total_vm="${BASH_REMATCH[1]}"
    fi

    local timestamp
    timestamp=$(date -Iseconds)

    jq -n \
        --arg timestamp "$timestamp" \
        --arg reason "kernel-oom-kill" \
        --arg source "$source" \
        --arg raw "$line" \
        --arg pid "$pid" \
        --arg name "$process_name" \
        --arg score "$score" \
        --arg total_vm "$total_vm" \
        '{
          timestamp: $timestamp,
          reason: $reason,
          severity: "critical",
          source: $source,
          raw: $raw,
          process: {
            pid: (if $pid == "" then null else ($pid | tonumber) end),
            name: $name
          },
          kernel: {
            score: (if $score == "" then null else ($score | tonumber) end),
            total_vm_kb: (if $total_vm == "" then null else ($total_vm | tonumber) end)
          }
        }' >> "$OOM_TERMINATION_LOG"

    log "WARN" "Kernel OOM killer terminated PID ${pid:-unknown} (${process_name:-unknown}); logged for analysis"
}

collect_kernel_oom_events() {
    local cursor_file="$OOM_KERNEL_CURSOR"
    local last_line=""

    if [[ -f "$cursor_file" ]]; then
        last_line=$(cat "$cursor_file")
    fi

    local log_source="journalctl"
    local raw_logs
    if command -v journalctl >/dev/null 2>&1; then
        raw_logs=$(journalctl -k -n 500 --no-pager --output=short-iso 2>/dev/null || true)
    else
        log_source="dmesg"
        raw_logs=$(dmesg -T 2>/dev/null || dmesg 2>/dev/null || true)
    fi

    if [[ -z "$raw_logs" ]]; then
        return
    fi

    local oom_lines
    oom_lines=$(echo "$raw_logs" | grep -E 'Out of memory: Kill process|Killed process' || true)
    if [[ -z "$oom_lines" ]]; then
        return
    fi

    local -a lines=()
    while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        lines+=("$line")
    done <<< "$oom_lines"

    if [[ ${#lines[@]} -eq 0 ]]; then
        return
    fi

    local -a new_lines=()
    local record="false"
    if [[ -z "$last_line" ]]; then
        record="true"
    fi

    for line in "${lines[@]}"; do
        if [[ "$record" == "false" ]]; then
            if [[ "$line" == "$last_line" ]]; then
                record="true"
            fi
            continue
        fi
        new_lines+=("$line")
    done

    if [[ "$record" == "false" ]]; then
        new_lines=("${lines[@]}")
    fi

    local last_processed=""
    for line in "${new_lines[@]}"; do
        log_kernel_oom_event "$line" "$log_source"
        last_processed="$line"
    done

    if [[ -n "$last_processed" ]]; then
        echo "$last_processed" > "$cursor_file"
    fi
}

get_cgroup_memory_info() {
    local cgroup_path="/sys/fs/cgroup"
    local cgroups_info="[]"

    # Check if cgroup v2
    if [[ -f "$cgroup_path/cgroup.controllers" ]]; then
        # cgroup v2
        if [[ -f "$cgroup_path/memory.pressure" ]]; then
            local memory_pressure=$(cat "$cgroup_path/memory.pressure" 2>/dev/null || echo "")
            local memory_current=$(cat "$cgroup_path/memory.current" 2>/dev/null || echo "0")
            local memory_high=$(cat "$cgroup_path/memory.high" 2>/dev/null || echo "0")
            local memory_max=$(cat "$cgroup_path/memory.max" 2>/dev/null || echo "0")

            cgroups_info=$(jq -n \
                --arg pressure "$memory_pressure" \
                --arg current "$memory_current" \
                --arg high "$memory_high" \
                --arg max "$memory_max" \
                '{
                    type: "cgroupv2",
                    path: "/sys/fs/cgroup",
                    memory_pressure: $pressure,
                    memory_current: ($current | tonumber),
                    memory_high: ($high | tonumber),
                    memory_max: ($max | tonumber)
                }')
        fi
    else
        # cgroup v1 - look at memory controller
        local memory_cgroup="$cgroup_path/memory"
        if [[ -d "$memory_cgroup" ]]; then
            local usage_in_bytes=$(cat "$memory_cgroup/memory.usage_in_bytes" 2>/dev/null || echo "0")
            local limit_in_bytes=$(cat "$memory_cgroup/memory.limit_in_bytes" 2>/dev/null || echo "0")
            local failcnt=$(cat "$memory_cgroup/memory.failcnt" 2>/dev/null || echo "0")

            cgroups_info=$(jq -n \
                --arg usage "$usage_in_bytes" \
                --arg limit "$limit_in_bytes" \
                --arg failcnt "$failcnt" \
                '{
                    type: "cgroupv1",
                    path: "'$memory_cgroup'",
                    memory_usage: ($usage | tonumber),
                    memory_limit: ($limit | tonumber),
                    fail_count: ($failcnt | tonumber)
                }')
        fi
    fi

    echo "$cgroups_info"
}

check_oom_killer_settings() {
    local oom_settings=""

    # OOM killer settings
    if [[ -f "/proc/sys/vm/panic_on_oom" ]]; then
        local panic_on_oom=$(cat /proc/sys/vm/panic_on_oom)
        local oom_kill_allocating_task=$(cat /proc/sys/vm/oom_kill_allocating_task 2>/dev/null || echo "0")
        local oom_dump_tasks=$(cat /proc/sys/vm/oom_dump_tasks 2>/dev/null || echo "0")

        oom_settings=$(jq -n \
            --arg panic_on_oom "$panic_on_oom" \
            --arg oom_kill_allocating_task "$oom_kill_allocating_task" \
            --arg oom_dump_tasks "$oom_dump_tasks" \
            '{
                panic_on_oom: ($panic_on_oom | tonumber),
                oom_kill_allocating_task: ($oom_kill_allocating_task | tonumber),
                oom_dump_tasks: ($oom_dump_tasks | tonumber)
            }')
    fi

    echo "$oom_settings"
}

analyze_memory_pressure() {
    local memory_info="$1"
    local psi_info="$2"

    local mem_usage=$(echo "$memory_info" | jq -r '.usage_percent')
    local swap_usage=$(echo "$memory_info" | jq -r '.swap_percent')
    local psi_available=$(echo "$psi_info" | jq -r '.available')

    local analysis='{"level": "normal", "recommendations": [], "actions": []}'

    # Check memory usage levels
    if [[ $mem_usage -ge 95 ]]; then
        analysis=$(echo "$analysis" | jq '
            .level = "critical" |
            .recommendations += ["Immediate memory recovery required"] |
            .actions += ["Consider terminating high-memory processes", "Clear system caches"]
        ')
    elif [[ $mem_usage -ge 90 ]]; then
        analysis=$(echo "$analysis" | jq '
            .level = "warning" |
            .recommendations += ["High memory usage detected"] |
            .actions += ["Monitor closely", "Prepare memory recovery actions"]
        ')
    elif [[ $mem_usage -ge 80 ]]; then
        analysis=$(echo "$analysis" | jq '
            .level = "caution" |
            .recommendations += ["Memory usage elevated"] |
            .actions += ["Monitor trends", "Consider memory optimization"]
        ')
    fi

    # Check swap usage
    if [[ $swap_usage -ge 80 ]]; then
        analysis=$(echo "$analysis" | jq '
            .level = "critical" |
            .recommendations += ["High swap usage - system may be thrashing"] |
            .actions += ["Reduce memory pressure", "Add more memory"]
        ')
    fi

    # Check PSI if available
    if [[ "$psi_available" == "true" ]]; then
        local psi_some_10=$(echo "$psi_info" | jq -r '.some.avg10')
        local psi_full_10=$(echo "$psi_info" | jq -r '.full.avg10')

        if (( $(echo "$psi_full_10 > 50" | bc -l) )); then
            analysis=$(echo "$analysis" | jq '
                .level = "critical" |
                .recommendations += ["Critical memory pressure detected"] |
                .actions += ["Immediate intervention required"]
            ')
        elif (( $(echo "$psi_some_10 > 20" | bc -l) )); then
            analysis=$(echo "$analysis" | jq '
                .level = "warning" |
                .recommendations += ["Memory pressure affecting system responsiveness"]
            ')
        fi
    fi

    echo "$analysis"
}

execute_recovery_actions() {
    local analysis="$1"

    local level=$(echo "$analysis" | jq -r '.level')

    log "INFO" "Executing recovery actions for level: $level"

    case "$level" in
        "critical")
            # Critical recovery actions
            log "WARN" "Executing critical memory recovery actions"

            # Clear system caches
            sync
            echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || true
            log "INFO" "Cleared system caches"

            # Get top memory processes and consider termination
            local top_processes=$(get_top_memory_processes 5)
            echo "$top_processes" | jq -r '.[] | select(.mem_percent > 20) | .pid' | while read -r pid; do
                if [[ -n "$pid" && "$pid" != "0" ]]; then
                    local comm=$(ps -p "$pid" -o comm= 2>/dev/null || echo "unknown")
                    log "WARN" "Considering termination of high-memory process $pid ($comm)"
                    # Add logic to check if process is protected before termination
                fi
            done
            ;;

        "warning")
            # Warning level actions
            log "INFO" "Executing warning level memory recovery"

            # Clear page cache only
            sync
            echo 1 > /proc/sys/vm/drop_caches 2>/dev/null || true
            log "INFO" "Cleared page cache"
            ;;

        "caution")
            # Caution level actions - monitoring only
            log "INFO" "Increased monitoring frequency due to caution level"
            ;;
    esac

    # Additional termination evaluation handled in monitor loop to ensure we run even when not critical
}

monitor_system() {
    local config=$(cat "$CONFIG_FILE")
    local interval=$(echo "$config" | jq -r '.monitoring.interval_seconds')

    log "INFO" "Starting system monitoring with ${interval}s interval"

    while $RUNNING; do
        # Collect system metrics
        local memory_info=$(get_memory_info)
        local psi_info=$(get_psi_info)
        local top_processes=$(get_top_memory_processes)
        local cgroup_info=$(get_cgroup_memory_info)
        local oom_settings=$(check_oom_killer_settings)

        # Analyze current state
        local analysis=$(analyze_memory_pressure "$memory_info" "$psi_info")
        local level=$(echo "$analysis" | jq -r '.level')

        # Store current state
        local state_snapshot=$(jq -n \
            --arg timestamp "$(date -Iseconds)" \
            --argjson memory "$memory_info" \
            --argjson psi "$psi_info" \
            --argjson top_processes "$top_processes" \
            --argjson cgroup "$cgroup_info" \
            --argjson oom_settings "$oom_settings" \
            --argjson analysis "$analysis" \
            '{
              timestamp: $timestamp,
              memory: $memory,
              psi: $psi,
              top_processes: $top_processes,
              cgroup: $cgroup,
              oom_settings: $oom_settings,
              analysis: $analysis
            }')

        echo "$state_snapshot" > "$OOM_STATE_DIR/current-state.json"

        # Log current status
        local mem_usage=$(echo "$memory_info" | jq -r '.usage_percent')
        local mem_used=$(echo "$memory_info" | jq -r '.used')
        local mem_total=$(echo "$memory_info" | jq -r '.total')

        log_debug "Memory: ${mem_used}MB/${mem_total}MB (${mem_usage}%) - Level: $level"

        # Check thresholds and send alerts
        local warning_threshold=$(echo "$config" | jq -r '.monitoring.memory_warning_threshold')
        local critical_threshold=$(echo "$config" | jq -r '.monitoring.memory_critical_threshold')

        if [[ $mem_usage -ge $critical_threshold ]]; then
            send_alert "CRITICAL" "Memory usage critical: ${mem_usage}% (${mem_used}MB/${mem_total}MB)"
            execute_recovery_actions "$analysis"
        elif [[ $mem_usage -ge $warning_threshold ]]; then
            send_alert "WARNING" "Memory usage elevated: ${mem_usage}% (${mem_used}MB/${mem_total}MB)"
        fi

        local enable_early=$(echo "$config" | jq -r '.prevention.enable_early_termination')
        local termination_threshold=$(echo "$config" | jq -r '.prevention.process_termination_threshold')
        if [[ "$enable_early" == "true" && $mem_usage -ge $termination_threshold ]]; then
            terminate_high_memory_processes "$top_processes" "$config" "$level" "$mem_usage"
        fi

        collect_kernel_oom_events

        # Sleep for next iteration
        sleep "$interval"
    done
}

cleanup() {
    log "INFO" "Cleaning up and shutting down..."
    RUNNING=false

    if [[ -n "$MONITOR_PID" ]]; then
        kill "$MONITOR_PID" 2>/dev/null || true
    fi

    log "INFO" "OOM Monitor daemon stopped"
    exit 0
}

# Signal handlers
trap cleanup SIGTERM SIGINT

# Main execution
main() {
    log "INFO" "Starting OOM Monitor Daemon v$OOM_MONITOR_VERSION"

    # Check system requirements
    check_system_requirements

    # Initialize configuration
    initialize_config

    # Start monitoring
    monitor_system
}

# Command line interface
case "${1:-start}" in
    "start")
        main
        ;;
    "stop")
        if [[ -f "$OOM_STATE_DIR/oom-monitor.pid" ]]; then
            local pid=$(cat "$OOM_STATE_DIR/oom-monitor.pid")
            kill "$pid" 2>/dev/null || true
            rm -f "$OOM_STATE_DIR/oom-monitor.pid"
            log "INFO" "OOM Monitor daemon stopped"
        else
            log "WARN" "No PID file found - daemon may not be running"
        fi
        ;;
    "status")
        if [[ -f "$OOM_STATE_DIR/oom-monitor.pid" ]]; then
            local pid=$(cat "$OOM_STATE_DIR/oom-monitor.pid")
            if kill -0 "$pid" 2>/dev/null; then
                log "INFO" "OOM Monitor daemon running with PID $pid"
            else
                log "ERROR" "OOM Monitor daemon not running (stale PID file)"
            fi
        else
            log "INFO" "OOM Monitor daemon not running"
        fi
        ;;
    "config")
        if [[ -f "$CONFIG_FILE" ]]; then
            cat "$CONFIG_FILE"
        else
            log "ERROR" "Configuration file not found"
            exit 1
        fi
        ;;
    "test")
        log "INFO" "Running OOM monitor test"
        local memory_info=$(get_memory_info)
        local psi_info=$(get_psi_info)
        local analysis=$(analyze_memory_pressure "$memory_info" "$psi_info")

        echo "=== OOM Monitor Test Results ==="
        echo "Memory Info:"
        echo "$memory_info" | jq '.'
        echo ""
        echo "PSI Info:"
        echo "$psi_info" | jq '.'
        echo ""
        echo "Analysis:"
        echo "$analysis" | jq '.'
        ;;
    *)
        echo "Usage: $0 {start|stop|status|config|test}"
        echo "  start  - Start the OOM monitor daemon"
        echo "  stop   - Stop the OOM monitor daemon"
        echo "  status - Check daemon status"
        echo "  config - Show current configuration"
        echo "  test   - Run system test"
        exit 1
        ;;
esac


