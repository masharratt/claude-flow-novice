#!/bin/bash
# Check web portal status

PORTAL_PORT=${PORTAL_PORT:-3456}
PORTAL_PID="/tmp/claude-flow-portal.pid"
PORTAL_LOG="/tmp/claude-flow-portal.log"

echo "🔍 Web Portal Status"
echo "===================="

# Check PID file
if [ -f "$PORTAL_PID" ]; then
  pid=$(cat "$PORTAL_PID")
  if ps -p "$pid" > /dev/null 2>&1; then
    echo "✅ Status: Running (PID: $pid)"
    echo "🌐 URL: http://localhost:$PORTAL_PORT"

    # Check if port is actually listening
    if command -v lsof > /dev/null 2>&1; then
      if lsof -i :$PORTAL_PORT > /dev/null 2>&1; then
        echo "🔌 Port $PORTAL_PORT: Listening"
      else
        echo "⚠️  Port $PORTAL_PORT: Not listening (process may be starting)"
      fi
    fi

    # Show last log lines
    if [ -f "$PORTAL_LOG" ]; then
      echo ""
      echo "📋 Recent logs:"
      tail -5 "$PORTAL_LOG" | sed 's/^/   /'
    fi
  else
    echo "❌ Status: Not running (stale PID file)"
    rm -f "$PORTAL_PID"
  fi
else
  echo "❌ Status: Not running"
fi

echo ""
echo "Commands:"
echo "  npm run portal:start   - Start portal"
echo "  npm run portal:stop    - Stop portal"
echo "  npm run portal:restart - Restart portal"
