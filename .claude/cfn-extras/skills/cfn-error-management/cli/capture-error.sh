#!/usr/bin/env bash
# CLI wrapper for error capture
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$SCRIPT_DIR/../lib/capture/capture-agent-error.sh" "$@"