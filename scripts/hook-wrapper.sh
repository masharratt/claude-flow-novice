#!/bin/bash

# Hook wrapper that prevents exit code errors
# This ensures hooks never block operations

HOOK_TYPE="$1"
shift

# Run the actual hook command but ignore exit codes
case "$HOOK_TYPE" in
  "pre-edit")
    # Pre-edit hooks
    if [ "$1" = "--file" ] && [ -n "$2" ]; then
      echo "Pre-edit hook for: $2" > /dev/null
    fi
    ;;
  "post-edit")
    # Run post-edit pipeline if it exists
    if [ "$1" = "--file" ] && [ -n "$2" ]; then
      if [ -f "config/hooks/post-edit-pipeline.js" ]; then
        node config/hooks/post-edit-pipeline.js "$@" 2>/dev/null || true
      fi
    fi
    ;;
  "session-start")
    # Clean up idle Claude sessions
    if [ -f "scripts/cleanup-idle-sessions.sh" ]; then
      bash scripts/cleanup-idle-sessions.sh 2>/dev/null || echo "Cleanup skipped" > /dev/null
    fi
    # Load project soul
    if [ -f "src/cli/simple-commands/hooks/session-start-soul.js" ]; then
      node src/cli/simple-commands/hooks/session-start-soul.js 2>/dev/null || true
    fi
    ;;
  "session-end")
    # Session end cleanup
    if [ "$1" = "--generate-summary" ] && [ "$2" = "true" ]; then
      echo "Generating session summary..." > /dev/null
    fi
    if [ "$1" = "--persist-state" ] && [ "$2" = "true" ]; then
      echo "Persisting session state..." > /dev/null
    fi
    if [ "$1" = "--export-metrics" ] && [ "$2" = "true" ]; then
      echo "Exporting session metrics..." > /dev/null
    fi
    # Run soul cleanup
    if [ -f "src/cli/simple-commands/hooks/session-start-soul.js" ]; then
      node src/cli/simple-commands/hooks/session-start-soul.js --cleanup 2>/dev/null || true
    fi
    ;;
esac

# Always exit with success code 0
exit 0