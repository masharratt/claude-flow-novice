#!/usr/bin/env bash
# CLI wrapper for agent selection
# Delegates to lib/selection/select-agents-with-fallback.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/../lib/selection/select-agents-with-fallback.sh" "$@"
