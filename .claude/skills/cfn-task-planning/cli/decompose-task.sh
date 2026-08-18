#!/usr/bin/env bash
# CLI wrapper for task decomposition
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/../lib/decomposition/task-decomposer.sh" "$@"
