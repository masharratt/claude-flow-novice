#!/bin/bash
# Base entrypoint script for CFN agents
# Teams can extend this by creating their own entrypoint that sources this one

set -euo pipefail

# Environment validation
: "${CFN_TEAM:=base}"
: "${CFN_LOG_LEVEL:=info}"

# Logging helper
log() {
    local level="$1"
    shift
    if [[ "$CFN_LOG_LEVEL" == "debug" ]] || [[ "$level" != "DEBUG" ]]; then
        echo "[$(date -Iseconds)] [$level] [${CFN_TEAM}] $*" >&2
    fi
}

log "INFO" "Starting CFN agent (team: ${CFN_TEAM})"

# Validate workspace mount
if [[ ! -d /workspace ]]; then
    log "ERROR" "Workspace directory /workspace not found"
    exit 1
fi

# Validate Redis connectivity (if CFN_REDIS_HOST is set)
if [[ -n "${CFN_REDIS_HOST:-}" ]]; then
    log "DEBUG" "Testing Redis connectivity: ${CFN_REDIS_HOST}:${CFN_REDIS_PORT:-6379}"
    if timeout 5 redis-cli -h "${CFN_REDIS_HOST}" -p "${CFN_REDIS_PORT:-6379}" ping >/dev/null 2>&1; then
        log "INFO" "Redis connection successful"
    else
        log "WARN" "Redis not accessible at ${CFN_REDIS_HOST}:${CFN_REDIS_PORT:-6379}"
    fi
fi

# Validate CFN CLI installation
if ! npx claude-flow-novice --version >/dev/null 2>&1; then
    log "ERROR" "CFN CLI not installed or not functional"
    exit 1
fi

log "INFO" "Environment validated successfully"

# Execute team-specific initialization if present
if [[ -f /usr/local/bin/team/init.sh ]]; then
    log "DEBUG" "Running team initialization script"
    # shellcheck disable=SC1091
    source /usr/local/bin/team/init.sh
fi

# Execute the command passed to docker run
log "INFO" "Executing command: $*"
exec npx claude-flow-novice agent "$@"
