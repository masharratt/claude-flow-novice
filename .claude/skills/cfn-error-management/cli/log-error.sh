#!/usr/bin/env bash
# CLI wrapper for error logging
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$SCRIPT_DIR/../lib/logging/invoke-error-logging.sh" "$@"