#!/usr/bin/env bash
# CLI wrapper for lifecycle hooks
# Delegates to lib/audit/execute-lifecycle-hook.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/../lib/audit/execute-lifecycle-hook.sh" "$@"
