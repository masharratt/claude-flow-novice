#!/bin/bash
set -euo pipefail

# MCP Health Check Script
# Verifies MCP server connectivity from agent containers

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${CONFIG_FILE:-/app/config/mcp-servers.json}"
MCP_TOKEN="${MCP_TOKEN:-}"

# Exit codes
EXIT_SUCCESS=0
EXIT_CONFIG_ERROR=1
EXIT_CONNECTION_ERROR=2
EXIT_AUTH_ERROR=3

# Check if config file exists
if [ ! -f "$CONFIG_FILE" ]; then
    echo "ERROR: MCP configuration not found: $CONFIG_FILE"
    exit $EXIT_CONFIG_ERROR
fi

# Parse config and test connectivity
if command -v jq &> /dev/null; then
    # Extract server endpoints
    SERVERS=$(jq -r '.servers | to_entries | .[] | "\(.key)=\(.value.endpoint)"' "$CONFIG_FILE" 2>/dev/null || echo "")

    if [ -z "$SERVERS" ]; then
        echo "ERROR: Failed to parse MCP server configuration"
        exit $EXIT_CONFIG_ERROR
    fi

    TOTAL_SERVERS=0
    HEALTHY_SERVERS=0
    FAILED_SERVERS=()

    while IFS= read -r server_line; do
        [ -z "$server_line" ] && continue

        SERVER_NAME="${server_line%%=*}"
        SERVER_ENDPOINT="${server_line#*=}"
        HEALTH_PATH=$(jq -r ".servers.\"$SERVER_NAME\".health_check" "$CONFIG_FILE" 2>/dev/null || echo "/health")
        TIMEOUT=$(jq -r ".servers.\"$SERVER_NAME\".timeout_ms" "$CONFIG_FILE" 2>/dev/null || echo "30000")
        TIMEOUT_SEC=$((TIMEOUT / 1000))

        ((TOTAL_SERVERS++))

        echo "Checking $SERVER_NAME ($SERVER_ENDPOINT$HEALTH_PATH)..."

        # Construct health check URL
        HEALTH_URL="${SERVER_ENDPOINT}${HEALTH_PATH}"

        # Perform health check with timeout
        if timeout "$TIMEOUT_SEC" curl -f -s \
            ${MCP_TOKEN:+-H "X-MCP-Token: $MCP_TOKEN"} \
            "$HEALTH_URL" > /dev/null 2>&1; then
            echo "  ✓ $SERVER_NAME is healthy"
            ((HEALTHY_SERVERS++))
        else
            echo "  ✗ $SERVER_NAME is unhealthy or unreachable"
            FAILED_SERVERS+=("$SERVER_NAME")
        fi
    done <<< "$SERVERS"

    # Summary
    echo ""
    echo "Health Check Summary:"
    echo "  Total Servers: $TOTAL_SERVERS"
    echo "  Healthy: $HEALTHY_SERVERS"
    echo "  Unhealthy: $((TOTAL_SERVERS - HEALTHY_SERVERS))"

    if [ ${#FAILED_SERVERS[@]} -gt 0 ]; then
        echo ""
        echo "Failed Servers:"
        for server in "${FAILED_SERVERS[@]}"; do
            echo "  - $server"
        done
    fi

    # Exit based on health status
    if [ "$HEALTHY_SERVERS" -eq "$TOTAL_SERVERS" ]; then
        echo ""
        echo "All MCP servers are healthy"
        exit $EXIT_SUCCESS
    elif [ "$HEALTHY_SERVERS" -gt 0 ]; then
        echo ""
        echo "WARNING: Some MCP servers are unhealthy"
        exit $EXIT_CONNECTION_ERROR
    else
        echo ""
        echo "ERROR: All MCP servers are unhealthy"
        exit $EXIT_CONNECTION_ERROR
    fi
else
    # Fallback if jq is not available - basic curl test
    echo "WARNING: jq not available - performing basic connectivity test"

    # Test common MCP endpoints
    MCP_ENDPOINTS=(
        "http://mcp-playwright:8081/health"
        "http://mcp-redis-tools:8082/health"
        "http://mcp-n8n:5678/healthz"
        "http://mcp-security-scanner:8084/health"
    )

    HEALTHY=0
    for endpoint in "${MCP_ENDPOINTS[@]}"; do
        if timeout 10 curl -f -s ${MCP_TOKEN:+-H "X-MCP-Token: $MCP_TOKEN"} "$endpoint" > /dev/null 2>&1; then
            echo "✓ $endpoint"
            ((HEALTHY++))
        else
            echo "✗ $endpoint"
        fi
    done

    if [ "$HEALTHY" -gt 0 ]; then
        echo "Some MCP servers are reachable ($HEALTHY/${#MCP_ENDPOINTS[@]})"
        exit $EXIT_SUCCESS
    else
        echo "ERROR: No MCP servers are reachable"
        exit $EXIT_CONNECTION_ERROR
    fi
fi
