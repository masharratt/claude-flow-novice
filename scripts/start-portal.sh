#!/usr/bin/env bash
# Auto-start web portal if not already running
# Used by session-start hook for seamless portal availability

PORTAL_PORT=${PORTAL_PORT:-3456}
PORTAL_LOG="/tmp/claude-flow-portal.log"
PORTAL_PID="/tmp/claude-flow-portal.pid"

# Check if portal is already running
is_portal_running() {
  if [ -f "$PORTAL_PID" ]; then
    local pid=$(cat "$PORTAL_PID")
    if ps -p "$pid" > /dev/null 2>&1; then
      return 0
    else
      rm -f "$PORTAL_PID"
    fi
  fi
  return 1
}

# Start portal in background
start_portal() {
  local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  local project_root="$(cd "$script_dir/.." && pwd)"

  # Create simple portal server if needed
  local portal_script="$script_dir/simple-portal-server.cjs"

  if [ ! -f "$portal_script" ]; then
    echo "⚠️  Portal server script not found. Run 'npm run portal:setup' first."
    return 1
  fi

  # Start server in background
  cd "$project_root"
  nohup node "$portal_script" > "$PORTAL_LOG" 2>&1 &
  local pid=$!
  echo $pid > "$PORTAL_PID"

  # Wait briefly to ensure it starts
  sleep 2

  # Verify it's running
  if ps -p "$pid" > /dev/null 2>&1; then
    echo "✅ Web portal started on http://localhost:$PORTAL_PORT (PID: $pid)"
    return 0
  else
    echo "❌ Failed to start web portal. Check logs at $PORTAL_LOG"
    rm -f "$PORTAL_PID"
    return 1
  fi
}

# Main logic
if is_portal_running; then
  # Portal already running - silent success
  exit 0
else
  # Start portal
  start_portal
  exit $?
fi
