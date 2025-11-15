#!/bin/bash
# Main Coordinator Entrypoint

set -euo pipefail

# Environment variables with defaults
export REDIS_HOST="${CFN_REDIS_HOST:-cfn-redis-shared}"
export REDIS_PORT="${CFN_REDIS_PORT:-6379}"
export POSTGRES_HOST="${POSTGRES_HOST:-cfn-postgres}"
export POSTGRES_DB="${POSTGRES_DB:-cfn_corporate}"
export POSTGRES_USER="${POSTGRES_USER:-cfn_admin}"
export LOG_LEVEL="${LOG_LEVEL:-info}"

# Coordinator ID
export COORDINATOR_ID="main-$(hostname)"

# Health check function
health_check() {
    # Check Redis connectivity
    if ! redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping &>/dev/null; then
        echo "ERROR: Cannot connect to Redis at $REDIS_HOST:$REDIS_PORT"
        exit 1
    fi

    # Check PostgreSQL connectivity
    if ! PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT 1" &>/dev/null; then
        echo "ERROR: Cannot connect to PostgreSQL at $POSTGRES_HOST"
        exit 1
    fi

    # Check Docker socket access
    if ! docker ps &>/dev/null; then
        echo "ERROR: Cannot access Docker socket"
        exit 1
    fi

    echo "OK"
    exit 0
}

# Show help
show_help() {
    cat <<EOF
CFN Docker Main Coordinator

Usage: $0 [COMMAND] [OPTIONS]

Commands:
    start              Start the main coordinator
    --health-check     Perform health check
    --version          Show version information
    --help             Show this help message

Environment Variables:
    CFN_REDIS_HOST     Redis host (default: cfn-redis-shared)
    CFN_REDIS_PORT     Redis port (default: 6379)
    POSTGRES_HOST      PostgreSQL host (default: cfn-postgres)
    POSTGRES_DB        Database name (default: cfn_corporate)
    POSTGRES_USER      Database user (default: cfn_admin)
    POSTGRES_PASSWORD  Database password (required)
    LOG_LEVEL          Logging level (default: info)

EOF
}

# Show version
show_version() {
    echo "CFN Docker Main Coordinator v3.0.0"
    echo "Contract Version: 1.0.0"
    echo "Node.js: $(node --version)"
    echo "Docker: $(docker --version)"
}

# Main entry point
main() {
    local command="${1:-start}"

    case "$command" in
        start)
            echo "Starting CFN Docker Main Coordinator..."
            echo "Coordinator ID: $COORDINATOR_ID"
            echo "Redis: $REDIS_HOST:$REDIS_PORT"
            echo "PostgreSQL: $POSTGRES_HOST/$POSTGRES_DB"
            echo ""

            # Start coordinator
            exec node /app/coordinator/coordinator.js
            ;;
        --health-check)
            health_check
            ;;
        --version)
            show_version
            ;;
        --help)
            show_help
            ;;
        *)
            echo "Error: Unknown command: $command"
            show_help
            exit 1
            ;;
    esac
}

main "$@"
