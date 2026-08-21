#!/usr/bin/env bash
# Web Portal Skill - Stop Web Portal Server
# Usage: ./invoke-portal-stop.sh [--port PORT] [--force]
#
# Gracefully stops the web portal server with cleanup

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../../.." && pwd)"
WEB_PORTAL_DIR="$PROJECT_ROOT/packages/web-portal"
DEFAULT_PORT=3000
SHUTDOWN_TIMEOUT=10

# Parse arguments
PORT="$DEFAULT_PORT"
FORCE_SHUTDOWN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)
      PORT="$2"
      shift 2
      ;;
    --force)
      FORCE_SHUTDOWN=true
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

# Check for PID file
PID_FILE="$WEB_PORTAL_DIR/.portal.pid"
SERVER_PID=""

if [[ -f "$PID_FILE" ]]; then
  SERVER_PID=$(cat "$PID_FILE" 2>/dev/null || echo "")
fi

# Try graceful shutdown first (if server has /api/shutdown endpoint)
if [[ "$FORCE_SHUTDOWN" == "false" ]]; then
  SHUTDOWN_URL="http://localhost:$PORT/api/shutdown"

  if curl -f -s -X POST "$SHUTDOWN_URL" &>/dev/null; then
    echo "Graceful shutdown initiated via API..." >&2

    # Wait for server to stop
    WAIT_TIME=0
    while [[ $WAIT_TIME -lt $SHUTDOWN_TIMEOUT ]]; do
      if ! curl -f -s "http://localhost:$PORT/health" &>/dev/null; then
        break
      fi

      sleep 1
      WAIT_TIME=$((WAIT_TIME + 1))
    done
  fi
fi

# Check if server is still running
SERVER_RUNNING=false
if curl -f -s "http://localhost:$PORT/health" &>/dev/null; then
  SERVER_RUNNING=true
fi

# Force kill if still running
if [[ "$SERVER_RUNNING" == "true" ]]; then
  echo "Forcing server shutdown..." >&2

  # Kill by PID file
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill -TERM "$SERVER_PID" 2>/dev/null || true
    sleep 2

    if kill -0 "$SERVER_PID" 2>/dev/null; then
      kill -KILL "$SERVER_PID" 2>/dev/null || true
    fi
  fi

  # Kill by port
  if lsof -ti:"$PORT" &>/dev/null; then
    lsof -ti:"$PORT" | xargs -r kill -TERM 2>/dev/null || true
    sleep 2

    if lsof -ti:"$PORT" &>/dev/null; then
      lsof -ti:"$PORT" | xargs -r kill -KILL 2>/dev/null || true
    fi
  fi
fi

# Cleanup PID file
if [[ -f "$PID_FILE" ]]; then
  rm -f "$PID_FILE"
fi

# Verify server is stopped
if curl -f -s "http://localhost:$PORT/health" &>/dev/null; then
  cat <<EOF >&2
{
  "success": false,
  "error": "Failed to stop server on port $PORT",
  "port": $PORT
}
EOF
  exit 1
else
  cat <<EOF
{
  "success": true,
  "message": "Web portal server stopped successfully",
  "port": $PORT,
  "pid": ${SERVER_PID:-"unknown"},
  "method": "$(if [[ "$FORCE_SHUTDOWN" == "true" ]]; then echo "forced"; else echo "graceful"; fi)"
}
EOF
fi
