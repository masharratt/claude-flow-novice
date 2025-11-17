#!/bin/bash

# Agent Lifecycle Hook Execution Script
# Provides SQLite-based lifecycle management for agent auditing
# Usage: ./execute-lifecycle-hook.sh <action> [options]

set -euo pipefail

# Configuration
DB_PATH="${AGENT_LIFECYCLE_DB:-./agent-lifecycle.db}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Initialize SQLite database
init_database() {
    if [[ ! -f "$DB_PATH" ]]; then
        log_info "Creating agent lifecycle database: $DB_PATH"
        sqlite3 "$DB_PATH" << 'EOF'
-- Create agents table
CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'spawned',
    confidence REAL,
    output TEXT,
    metadata TEXT,
    spawned_at TEXT NOT NULL,
    completed_at TEXT,
    updated_at TEXT NOT NULL
);

-- Create lifecycle_events table
CREATE TABLE IF NOT EXISTS lifecycle_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    confidence REAL,
    reasoning TEXT,
    phase TEXT,
    iteration INTEGER,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (agent_id) REFERENCES agents(id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_type ON agents(type);
CREATE INDEX IF NOT EXISTS idx_lifecycle_agent_id ON lifecycle_events(agent_id);
CREATE INDEX IF NOT EXISTS idx_lifecycle_timestamp ON lifecycle_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_lifecycle_event_type ON lifecycle_events(event_type);
EOF
        log_success "Database initialized successfully"
    fi
}

# Validate agent ID format
validate_agent_id() {
    local agent_id="$1"
    if [[ ! "$agent_id" =~ ^[a-zA-Z0-9_-]+$ ]]; then
        log_error "Invalid agent ID format: $agent_id"
        log_error "Agent ID must contain only alphanumeric characters, hyphens, and underscores"
        exit 1
    fi

    if [[ ${#agent_id} -lt 3 || ${#agent_id} -gt 64 ]]; then
        log_error "Agent ID must be between 3 and 64 characters: $agent_id"
        exit 1
    fi
}

# Validate confidence score
validate_confidence() {
    local confidence="$1"
    if [[ ! "$confidence" =~ ^0\.[0-9]+$|^1\.0$|^0$|^1$ ]]; then
        log_error "Invalid confidence score: $confidence"
        log_error "Confidence must be between 0.0 and 1.0"
        exit 1
    fi
}

# Spawn agent registration
spawn_agent() {
    local agent_id="$1"
    local agent_type="$2"
    local acl_level="${3:-1}"
    local agent_name="${4:-$agent_id}"

    validate_agent_id "$agent_id"
    # Escape single quotes by doubling them for SQL safety
    agent_name="${agent_name//\'/\'\'}"
    agent_type="${agent_type//\'/\'\'}"

    if [[ ! "$acl_level" =~ ^[1-6]$ ]]; then
        log_error "Invalid ACL level: $acl_level (must be 1-6)"
        exit 1
    fi

    log_info "Registering agent spawn: $agent_id (type: $agent_type, ACL: $acl_level)"

    sqlite3 "$DB_PATH" << EOF
INSERT OR REPLACE INTO agents (
    id, name, type, status, metadata, spawned_at, updated_at
) VALUES (
    '$agent_id',
    '$agent_name',
    '$agent_type',
    'spawned',
    '{"aclLevel": $acl_level, "spawnedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"}',
    datetime('now'),
    datetime('now')
);
EOF

    # Log spawn event
    sqlite3 "$DB_PATH" << EOF
INSERT INTO lifecycle_events (
    agent_id, event_type, reasoning, timestamp
) VALUES (
    '$agent_id',
    'spawn',
    'Agent spawned via lifecycle hook',
    datetime('now')
);
EOF

    log_success "Agent $agent_id registered successfully"
}

# Update agent confidence
update_confidence() {
    local agent_id="$1"
    local confidence="$2"
    local reasoning="${3:-No reasoning provided}"
    local phase="${4:-}"
    local iteration="${5:-}"

    validate_agent_id "$agent_id"
    validate_confidence "$confidence"

    # Escape single quotes for SQL safety
    reasoning="${reasoning//\'/\'\'}"

    log_info "Updating confidence for agent $agent_id: $confidence"

    # Update agent confidence
    sqlite3 "$DB_PATH" << EOF
UPDATE agents
SET confidence = $confidence, updated_at = datetime('now')
WHERE id = '$agent_id';
EOF

    # Log confidence update event
    sqlite3 "$DB_PATH" << EOF
INSERT INTO lifecycle_events (
    agent_id, event_type, confidence, reasoning, phase, iteration, timestamp
) VALUES (
    '$agent_id',
    'confidence_update',
    $confidence,
    '$reasoning',
    ${phase:+"'${phase}'":NULL},
    ${iteration:+$iteration},
    datetime('now')
);
EOF

    log_success "Confidence updated for agent $agent_id"
}

# Complete agent
complete_agent() {
    local agent_id="$1"
    local confidence="$2"
    local output="${3:-}"
    local phase="${4:-}"
    local iteration="${5:-}"

    validate_agent_id "$agent_id"
    validate_confidence "$confidence"

    # Escape single quotes for SQL safety
    output="${output//\'/\'\'}"

    log_info "Completing agent $agent_id with confidence: $confidence"

    # Mark agent as completed
    sqlite3 "$DB_PATH" << EOF
UPDATE agents
SET status = 'completed',
    confidence = $confidence,
    output = ${output:+"'${output}'":NULL},
    completed_at = datetime('now'),
    updated_at = datetime('now')
WHERE id = '$agent_id';
EOF

    # Log completion event
    sqlite3 "$DB_PATH" << EOF
INSERT INTO lifecycle_events (
    agent_id, event_type, confidence, reasoning, phase, iteration, timestamp
) VALUES (
    '$agent_id',
    'complete',
    $confidence,
    ${output:+"'${output}'":'Agent completed'},
    ${phase:+"'${phase}'":NULL},
    ${iteration:+$iteration},
    datetime('now')
);
EOF

    # Check CFN Loop gate
    local gate_status="FAIL"
    if (( $(echo "$confidence >= 0.75" | bc -l) )); then
        gate_status="PASS"
    fi

    log_success "Agent $agent_id completed (CFN Loop 3 Gate: $gate_status)"
}

# Terminate agent
terminate_agent() {
    local agent_id="$1"
    local reason="${2:-Normal termination}"

    validate_agent_id "$agent_id"

    # Escape single quotes for SQL safety
    reason="${reason//\'/\'\'}"

    log_info "Terminating agent $agent_id: $reason"

    # Mark agent as terminated
    sqlite3 "$DB_PATH" << EOF
UPDATE agents
SET status = 'terminated', updated_at = datetime('now')
WHERE id = '$agent_id';
EOF

    # Log termination event
    sqlite3 "$DB_PATH" << EOF
INSERT INTO lifecycle_events (
    agent_id, event_type, reasoning, timestamp
) VALUES (
    '$agent_id',
    'terminate',
    '$reason',
    datetime('now')
);
EOF

    log_success "Agent $agent_id terminated"
}

# Query agent status
query_status() {
    local agent_id="$1"
    local limit="${2:-10}"

    validate_agent_id "$agent_id"

    log_info "Querying status for agent $agent_id"

    echo ""
    echo "=== Agent Status ==="
    sqlite3 "$DB_PATH" << EOF
SELECT
    id,
    name,
    type,
    status,
    confidence,
    spawned_at,
    completed_at,
    updated_at
FROM agents
WHERE id = '$agent_id';
EOF

    echo ""
    echo "=== Recent Lifecycle Events ==="
    sqlite3 "$DB_PATH" << EOF
SELECT
    timestamp,
    event_type,
    confidence,
    reasoning
FROM lifecycle_events
WHERE agent_id = '$agent_id'
ORDER BY timestamp DESC
LIMIT $limit;
EOF
}

# Show usage
show_usage() {
    echo "Agent Lifecycle Hook Execution Script"
    echo ""
    echo "Usage: $0 <action> [options]"
    echo ""
    echo "Actions:"
    echo "  spawn     --agent-id <id> --agent-type <type> [--acl-level <level>] [--name <name>]"
    echo "  update    --agent-id <id> --confidence <score> --reasoning <text> [--phase <phase>] [--iteration <n>]"
    echo "  complete  --agent-id <id> --confidence <score> [--output <text>] [--phase <phase>] [--iteration <n>]"
    echo "  terminate --agent-id <id> [--reason <text>]"
    echo "  status    --agent-id <id> [--limit <n>]"
    echo ""
    echo "Environment Variables:"
    echo "  AGENT_LIFECYCLE_DB    Path to SQLite database (default: ./agent-lifecycle.db)"
    echo ""
    echo "Examples:"
    echo "  $0 spawn --agent-id docker-1 --agent-type docker-specialist --acl-level 1"
    echo "  $0 update --agent-id docker-1 --confidence 0.85 --reasoning \"Implementation complete\""
    echo "  $0 complete --agent-id docker-1 --confidence 0.90 --output \"Docker setup complete\""
    echo "  $0 status --agent-id docker-1"
}

# Parse command line arguments
parse_args() {
    local action="$1"
    shift

    case "$action" in
        "spawn")
            local agent_id=""
            local agent_type=""
            local acl_level="1"
            local agent_name=""

            while [[ $# -gt 0 ]]; do
                case "$1" in
                    --agent-id)
                        agent_id="$2"
                        shift 2
                        ;;
                    --agent-type)
                        agent_type="$2"
                        shift 2
                        ;;
                    --acl-level)
                        acl_level="$2"
                        shift 2
                        ;;
                    --name)
                        agent_name="$2"
                        shift 2
                        ;;
                    *)
                        log_error "Unknown option: $1"
                        show_usage
                        exit 1
                        ;;
                esac
            done

            if [[ -z "$agent_id" || -z "$agent_type" ]]; then
                log_error "Missing required arguments for spawn"
                show_usage
                exit 1
            fi

            init_database
            spawn_agent "$agent_id" "$agent_type" "$acl_level" "$agent_name"
            ;;

        "update")
            local agent_id=""
            local confidence=""
            local reasoning=""
            local phase=""
            local iteration=""

            while [[ $# -gt 0 ]]; do
                case "$1" in
                    --agent-id)
                        agent_id="$2"
                        shift 2
                        ;;
                    --confidence)
                        confidence="$2"
                        shift 2
                        ;;
                    --reasoning)
                        reasoning="$2"
                        shift 2
                        ;;
                    --phase)
                        phase="$2"
                        shift 2
                        ;;
                    --iteration)
                        iteration="$2"
                        shift 2
                        ;;
                    *)
                        log_error "Unknown option: $1"
                        show_usage
                        exit 1
                        ;;
                esac
            done

            if [[ -z "$agent_id" || -z "$confidence" ]]; then
                log_error "Missing required arguments for update"
                show_usage
                exit 1
            fi

            init_database
            update_confidence "$agent_id" "$confidence" "$reasoning" "$phase" "$iteration"
            ;;

        "complete")
            local agent_id=""
            local confidence=""
            local output=""
            local phase=""
            local iteration=""

            while [[ $# -gt 0 ]]; do
                case "$1" in
                    --agent-id)
                        agent_id="$2"
                        shift 2
                        ;;
                    --confidence)
                        confidence="$2"
                        shift 2
                        ;;
                    --output)
                        output="$2"
                        shift 2
                        ;;
                    --phase)
                        phase="$2"
                        shift 2
                        ;;
                    --iteration)
                        iteration="$2"
                        shift 2
                        ;;
                    *)
                        log_error "Unknown option: $1"
                        show_usage
                        exit 1
                        ;;
                esac
            done

            if [[ -z "$agent_id" || -z "$confidence" ]]; then
                log_error "Missing required arguments for complete"
                show_usage
                exit 1
            fi

            init_database
            complete_agent "$agent_id" "$confidence" "$output" "$phase" "$iteration"
            ;;

        "terminate")
            local agent_id=""
            local reason=""

            while [[ $# -gt 0 ]]; do
                case "$1" in
                    --agent-id)
                        agent_id="$2"
                        shift 2
                        ;;
                    --reason)
                        reason="$2"
                        shift 2
                        ;;
                    *)
                        log_error "Unknown option: $1"
                        show_usage
                        exit 1
                        ;;
                esac
            done

            if [[ -z "$agent_id" ]]; then
                log_error "Missing required arguments for terminate"
                show_usage
                exit 1
            fi

            init_database
            terminate_agent "$agent_id" "$reason"
            ;;

        "status")
            local agent_id=""
            local limit="10"

            while [[ $# -gt 0 ]]; do
                case "$1" in
                    --agent-id)
                        agent_id="$2"
                        shift 2
                        ;;
                    --limit)
                        limit="$2"
                        shift 2
                        ;;
                    *)
                        log_error "Unknown option: $1"
                        show_usage
                        exit 1
                        ;;
                esac
            done

            if [[ -z "$agent_id" ]]; then
                log_error "Missing required arguments for status"
                show_usage
                exit 1
            fi

            init_database
            query_status "$agent_id" "$limit"
            ;;

        "help"|"--help"|"-h")
            show_usage
            ;;

        *)
            log_error "Unknown action: $action"
            show_usage
            exit 1
            ;;
    esac
}

# Check for required dependencies
check_dependencies() {
    if ! command -v sqlite3 &> /dev/null; then
        log_error "sqlite3 is required but not installed"
        exit 1
    fi

    if ! command -v bc &> /dev/null; then
        log_warning "bc is recommended for confidence calculations"
    fi
}

# Main execution
main() {
    check_dependencies

    if [[ $# -eq 0 ]]; then
        show_usage
        exit 1
    fi

    parse_args "$@"
}

# Execute main function
main "$@"