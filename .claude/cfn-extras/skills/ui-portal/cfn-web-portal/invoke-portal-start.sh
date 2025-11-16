#!/usr/bin/env bash
# Web Portal Skill - Start Web Portal Server
# Usage: ./invoke-portal-start.sh [--port PORT] [--production]
#
# Starts the web portal server with health check validation
# Returns: JSON with server URL, status, and health check results

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.claude/skills/cfn-cfn-.claude/skills/cfn-cfn-.." && pwd)"
WEB_PORTAL_DIR="$PROJECT_ROOT/packages/web-portal"
DEFAULT_PORT=3000
MAX_HEALTH_CHECK_ATTEMPTS=30
HEALTH_CHECK_INTERVAL=1

# Parse arguments
PORT="$DEFAULT_PORT"
PRODUCTION_MODE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)
      PORT="$2"
      shift 2
      ;;
    --production)
      PRODUCTION_MODE=true
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

# Validate web portal directory exists
if [[ ! -d "$WEB_PORTAL_DIR" ]]; then
  echo "{\"success\":false,\"error\":\"Web portal directory not found: $WEB_PORTAL_DIR\"}" >&2
  exit 1
fi

# Kill any existing processes on the target port
if lsof -ti:"$PORT" &>/dev/null; then
  echo "Killing existing process on port $PORT..." >&2
  lsof -ti:"$PORT" | xargs -r kill -9 || true
  sleep 2
fi

# Start the server
cd "$WEB_PORTAL_DIR"

if [[ "$PRODUCTION_MODE" == "true" ]]; then
  # Production mode: build and start
  echo "Building for production..." >&2
  npm run build &>/dev/null || {
    echo "{\"success\":false,\"error\":\"Build failed\"}" >&2
    exit 1
  }

  PORT="$PORT" npm run start &>/dev/null &
  SERVER_PID=$!
else
  # Development mode: start dev server
  echo "Starting development server on port $PORT..." >&2
  PORT="$PORT" npm run dev &>/dev/null &
  SERVER_PID=$!
fi

# Store PID for cleanup
echo "$SERVER_PID" > "$WEB_PORTAL_DIR/.portal.pid"

# Health check loop
HEALTH_CHECK_URL="http://localhost:$PORT/health"
ATTEMPTS=0
HEALTHY=false

echo "Waiting for server to be healthy..." >&2
while [[ $ATTEMPTS -lt $MAX_HEALTH_CHECK_ATTEMPTS ]]; do
  if curl -f -s "$HEALTH_CHECK_URL" &>/dev/null; then
    HEALTHY=true
    break
  fi

  ATTEMPTS=$((ATTEMPTS + 1))
  sleep "$HEALTH_CHECK_INTERVAL"
done

# Check Redis connection
REDIS_CONNECTED=false
if redis-cli ping &>/dev/null; then
  REDIS_CONNECTED=true
fi

# Construct response
if [[ "$HEALTHY" == "true" ]]; then
  cat <<EOF
{
  "success": true,
  "serverUrl": "http://localhost:$PORT",
  "port": $PORT,
  "pid": $SERVER_PID,
  "mode": "$(if [[ "$PRODUCTION_MODE" == "true" ]]; then echo "production"; else echo "development"; fi)",
  "health": {
    "status": "healthy",
    "redis": $REDIS_CONNECTED,
    "uptime": 0,
    "checks": $ATTEMPTS
  },
  "endpoints": {
    "api": "http://localhost:$PORT/api",
    "metrics": "http://localhost:$PORT/api/metrics",
    "agents": "http://localhost:$PORT/api/agents",
    "events": "http://localhost:$PORT/api/events",
    "health": "http://localhost:$PORT/health"
  }
}
EOF
else
  # Server failed to start
  kill "$SERVER_PID" &>/dev/null || true
  rm -f "$WEB_PORTAL_DIR/.portal.pid"

  cat <<EOF >&2
{
  "success": false,
  "error": "Server failed health check after $MAX_HEALTH_CHECK_ATTEMPTS attempts",
  "port": $PORT,
  "redisConnected": $REDIS_CONNECTED
}
EOF
  exit 1
fi
