#!/bin/bash
##
## CFN Docker Logging - Quick Fix Script
## Enables verbose Docker logging with container stdout/stderr capture
##
## Usage:
##   ./enable-logging.sh [TASK_ID] [OPTIONS]
##
## Options:
##   --log-dir DIR          Custom log directory (default: logs/docker-mode/{task-id})
##   --verbose              Enable verbose output
##   --capture-interval SEC Capture interval in seconds (default: 1)
##   --help                 Show this help message
##

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*"
}

# Display usage
usage() {
    grep "^##" "$0" | sed 's/^## \?//'
    exit 0
}

# Parse arguments
TASK_ID=""
LOG_DIR=""
VERBOSE=false
CAPTURE_INTERVAL=1

while [[ $# -gt 0 ]]; do
    case $1 in
        --log-dir)
            LOG_DIR="$2"
            shift 2
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --capture-interval)
            CAPTURE_INTERVAL="$2"
            shift 2
            ;;
        --help)
            usage
            ;;
        *)
            if [[ -z "$TASK_ID" ]]; then
                TASK_ID="$1"
            else
                log_error "Unknown argument: $1"
                usage
            fi
            shift
            ;;
    esac
done

# Validate task ID
if [[ -z "$TASK_ID" ]]; then
    log_error "Task ID is required"
    usage
fi

# Set default log directory
if [[ -z "$LOG_DIR" ]]; then
    LOG_DIR="$PROJECT_ROOT/logs/docker-mode/$TASK_ID"
fi

# Create log directory structure
mkdir -p "$LOG_DIR"
mkdir -p "$LOG_DIR/containers"
mkdir -p "$LOG_DIR/coordination"
mkdir -p "$LOG_DIR/metrics"

log "Docker Logging Enabled"
log "Task ID: $TASK_ID"
log "Log Directory: $LOG_DIR"

# Create logging configuration file
CONFIG_FILE="$LOG_DIR/logging-config.json"
cat > "$CONFIG_FILE" <<EOF
{
  "task_id": "$TASK_ID",
  "log_dir": "$LOG_DIR",
  "enabled": true,
  "capture_interval": $CAPTURE_INTERVAL,
  "verbose": $VERBOSE,
  "started_at": "$(date -Iseconds)",
  "features": {
    "container_logs": true,
    "exit_codes": true,
    "redis_events": true,
    "timestamps": true
  }
}
EOF

log_success "Logging configuration created: $CONFIG_FILE"

# Create helper scripts

# 1. Container log capture script
cat > "$LOG_DIR/capture-container-logs.sh" <<'CAPTURE_EOF'
#!/bin/bash
set -euo pipefail

CONTAINER_ID="$1"
AGENT_ID="$2"
LOG_DIR="$3"

# Create container log files
STDOUT_LOG="$LOG_DIR/containers/${AGENT_ID}.stdout.log"
STDERR_LOG="$LOG_DIR/containers/${AGENT_ID}.stderr.log"
EXIT_LOG="$LOG_DIR/containers/${AGENT_ID}.exit.json"

# Capture logs in background (with timestamps)
docker logs -f --timestamps "$CONTAINER_ID" > "$STDOUT_LOG" 2> "$STDERR_LOG" &
LOG_PID=$!

# Wait for container to exit
EXIT_CODE=$(docker wait "$CONTAINER_ID" 2>/dev/null || echo "999")

# Stop log capture
kill $LOG_PID 2>/dev/null || true
sleep 1  # Allow final flush

# Capture container metadata
METADATA=$(docker inspect "$CONTAINER_ID" 2>/dev/null || echo '{}')

# Log exit event
cat > "$EXIT_LOG" <<EOF
{
  "timestamp": "$(date -Iseconds)",
  "container_id": "$CONTAINER_ID",
  "agent_id": "$AGENT_ID",
  "exit_code": $EXIT_CODE,
  "status": "$(echo "$METADATA" | jq -r '.[] | .State.Status // "unknown"')",
  "started_at": "$(echo "$METADATA" | jq -r '.[] | .State.StartedAt // "unknown"')",
  "finished_at": "$(echo "$METADATA" | jq -r '.[] | .State.FinishedAt // "unknown"')",
  "oom_killed": $(echo "$METADATA" | jq -r '.[] | .State.OOMKilled // false')
}
EOF

echo "$EXIT_CODE"
CAPTURE_EOF

chmod +x "$LOG_DIR/capture-container-logs.sh"
log_success "Created container log capture script"

# 2. Redis event logger
cat > "$LOG_DIR/log-redis-event.sh" <<'REDIS_EOF'
#!/bin/bash
set -euo pipefail

EVENT_TYPE="$1"
PAYLOAD="$2"
LOG_DIR="$3"

REDIS_LOG="$LOG_DIR/coordination/redis-events.log"

# Append event to log
cat >> "$REDIS_LOG" <<EOF
{"timestamp":"$(date -Iseconds)","event":"$EVENT_TYPE","payload":$PAYLOAD}
EOF

echo >> "$REDIS_LOG"  # Newline for readability
REDIS_EOF

chmod +x "$LOG_DIR/log-redis-event.sh"
log_success "Created Redis event logger"

# 3. Lifecycle event logger
cat > "$LOG_DIR/log-lifecycle-event.sh" <<'LIFECYCLE_EOF'
#!/bin/bash
set -euo pipefail

EVENT_TYPE="$1"
shift
PAYLOAD="$@"
LOG_DIR="$(dirname "$0")"

LIFECYCLE_LOG="$LOG_DIR/coordination/lifecycle-events.log"

# Append event to log
cat >> "$LIFECYCLE_LOG" <<EOF
{"timestamp":"$(date -Iseconds)","event":"$EVENT_TYPE","data":$PAYLOAD}
EOF

echo >> "$LIFECYCLE_LOG"  # Newline
LIFECYCLE_EOF

chmod +x "$LOG_DIR/log-lifecycle-event.sh"
log_success "Created lifecycle event logger"

# 4. Query interface script
cat > "$LOG_DIR/query-logs.sh" <<'QUERY_EOF'
#!/bin/bash
set -euo pipefail

LOG_DIR="$(dirname "$0")"
QUERY_TYPE="${1:-all}"
FILTER="${2:-}"

case "$QUERY_TYPE" in
    containers)
        cat "$LOG_DIR/containers"/*.stdout.log 2>/dev/null | grep -E "$FILTER" || echo "(no logs)"
        ;;
    errors)
        cat "$LOG_DIR/containers"/*.stderr.log 2>/dev/null | grep -E "$FILTER" || echo "(no errors)"
        ;;
    exits)
        cat "$LOG_DIR/containers"/*.exit.json 2>/dev/null | jq -s '.' || echo "[]"
        ;;
    redis)
        cat "$LOG_DIR/coordination/redis-events.log" 2>/dev/null | grep -E "$FILTER" || echo "(no events)"
        ;;
    lifecycle)
        cat "$LOG_DIR/coordination/lifecycle-events.log" 2>/dev/null | grep -E "$FILTER" || echo "(no events)"
        ;;
    failed)
        # Show only failed containers (non-zero exit codes)
        cat "$LOG_DIR/containers"/*.exit.json 2>/dev/null | jq -s '.[] | select(.exit_code != 0)' || echo "[]"
        ;;
    all)
        echo "=== Container Logs ==="
        cat "$LOG_DIR/containers"/*.stdout.log 2>/dev/null | head -50 || echo "(no logs)"
        echo ""
        echo "=== Exit Codes ==="
        cat "$LOG_DIR/containers"/*.exit.json 2>/dev/null | jq -s '.[] | {agent_id, exit_code, status}' || echo "[]"
        echo ""
        echo "=== Redis Events ==="
        cat "$LOG_DIR/coordination/redis-events.log" 2>/dev/null | head -20 || echo "(no events)"
        ;;
    *)
        echo "Usage: $0 [containers|errors|exits|redis|lifecycle|failed|all] [filter]"
        exit 1
        ;;
esac
QUERY_EOF

chmod +x "$LOG_DIR/query-logs.sh"
log_success "Created query interface script"

# 5. Export audit trail script
cat > "$LOG_DIR/export-audit-trail.sh" <<'EXPORT_EOF'
#!/bin/bash
set -euo pipefail

LOG_DIR="$(dirname "$0")"
OUTPUT_FILE="${1:-audit-trail.json}"

# Aggregate all logs into structured JSON
{
    echo '{'
    echo '  "task_id": "'$(jq -r .task_id "$LOG_DIR/logging-config.json")'",';
    echo '  "started_at": "'$(jq -r .started_at "$LOG_DIR/logging-config.json")'",';
    echo '  "exported_at": "'$(date -Iseconds)'",';
    echo '  "container_exits": '
    cat "$LOG_DIR/containers"/*.exit.json 2>/dev/null | jq -s '.' || echo '[]'
    echo '  ,'
    echo '  "redis_events": '
    cat "$LOG_DIR/coordination/redis-events.log" 2>/dev/null | jq -s '.' || echo '[]'
    echo '  ,'
    echo '  "lifecycle_events": '
    cat "$LOG_DIR/coordination/lifecycle-events.log" 2>/dev/null | jq -s '.' || echo '[]'
    echo '}'
} | jq '.' > "$OUTPUT_FILE"

echo "Audit trail exported to: $OUTPUT_FILE"
EXPORT_EOF

chmod +x "$LOG_DIR/export-audit-trail.sh"
log_success "Created audit trail export script"

# Create README for log directory
cat > "$LOG_DIR/README.md" <<'README_EOF'
# CFN Docker Mode Logs

This directory contains logs for Docker mode CFN Loop execution.

## Directory Structure

```
logs/docker-mode/{task-id}/
├── logging-config.json           # Logging configuration
├── containers/                   # Container logs
│   ├── {agent-id}.stdout.log    # Container stdout
│   ├── {agent-id}.stderr.log    # Container stderr
│   └── {agent-id}.exit.json     # Container exit event
├── coordination/                 # Coordination logs
│   ├── redis-events.log         # Redis coordination events
│   └── lifecycle-events.log     # Agent lifecycle events
├── metrics/                      # Performance metrics (future)
└── scripts/                      # Helper scripts
    ├── capture-container-logs.sh
    ├── log-redis-event.sh
    ├── log-lifecycle-event.sh
    ├── query-logs.sh
    └── export-audit-trail.sh
```

## Usage Examples

### Query Logs
```bash
# View all logs
./query-logs.sh all

# View only container logs
./query-logs.sh containers

# View only errors
./query-logs.sh errors

# View exit codes
./query-logs.sh exits

# View failed containers
./query-logs.sh failed

# View Redis events
./query-logs.sh redis
```

### Export Audit Trail
```bash
# Export to default file
./export-audit-trail.sh

# Export to custom file
./export-audit-trail.sh /tmp/audit-trail.json
```

### Capture Container Logs (Automatic)
This script is called automatically by spawn-agent.sh when logging is enabled.
```bash
./capture-container-logs.sh <container-id> <agent-id> <log-dir>
```

## Integration with spawn-agent.sh

To enable automatic log capture, add this to spawn-agent.sh:

```bash
# After container spawn
if [[ -f "logs/docker-mode/${TASK_ID}/capture-container-logs.sh" ]]; then
    logs/docker-mode/${TASK_ID}/capture-container-logs.sh \
        "$CONTAINER_ID" "$AGENT_ID" "logs/docker-mode/${TASK_ID}" &
fi
```
README_EOF

log_success "Created README documentation"

# Print usage instructions
cat <<EOF

${GREEN}✓ Docker Logging Enabled Successfully${NC}

Log Directory: $LOG_DIR

${YELLOW}Quick Reference:${NC}

# View all logs
$LOG_DIR/query-logs.sh all

# View only errors
$LOG_DIR/query-logs.sh errors

# View failed containers
$LOG_DIR/query-logs.sh failed

# Export audit trail
$LOG_DIR/export-audit-trail.sh /tmp/audit-trail.json

${YELLOW}Integration with spawn-agent.sh:${NC}

Add this to spawn-agent.sh after container spawn:

  # Enable logging if configured
  if [[ -f "$LOG_DIR/capture-container-logs.sh" ]]; then
      $LOG_DIR/capture-container-logs.sh \\
          "\$CONTAINER_ID" "\$AGENT_ID" "$LOG_DIR" &
  fi

${YELLOW}Files Created:${NC}
  ✓ $CONFIG_FILE
  ✓ $LOG_DIR/capture-container-logs.sh
  ✓ $LOG_DIR/log-redis-event.sh
  ✓ $LOG_DIR/log-lifecycle-event.sh
  ✓ $LOG_DIR/query-logs.sh
  ✓ $LOG_DIR/export-audit-trail.sh
  ✓ $LOG_DIR/README.md

EOF

log_success "Logging infrastructure ready"

if [[ "$VERBOSE" == true ]]; then
    log "Verbose mode enabled"
    log "Logging configuration:"
    cat "$CONFIG_FILE" | jq '.'
fi
