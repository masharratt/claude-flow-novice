#!/usr/bin/env bash
# CLI wrapper for task classification
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/../lib/classifier/classify-task.sh" "$@"
