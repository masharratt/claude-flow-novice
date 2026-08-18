#!/usr/bin/env bash
# CLI wrapper for error batching
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$SCRIPT_DIR/../lib/batching/cli.sh" "$@"