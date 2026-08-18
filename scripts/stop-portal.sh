#!/usr/bin/env bash
# Stop the web portal server

PORTAL_PID="/tmp/claude-flow-portal.pid"

if [ ! -f "$PORTAL_PID" ]; then
  echo "ℹ️  Portal not running (no PID file found)"
  exit 0
fi

pid=$(cat "$PORTAL_PID")

if ps -p "$pid" > /dev/null 2>&1; then
  echo "🛑 Stopping web portal (PID: $pid)..."
  kill "$pid"
  sleep 1

  # Force kill if still running
  if ps -p "$pid" > /dev/null 2>&1; then
    kill -9 "$pid"
  fi

  rm -f "$PORTAL_PID"
  echo "✅ Portal stopped"
else
  echo "ℹ️  Portal not running (stale PID file removed)"
  rm -f "$PORTAL_PID"
fi

exit 0
