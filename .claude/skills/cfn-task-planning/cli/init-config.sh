#!/usr/bin/env bash
# CLI wrapper for task config initialization
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/../lib/config/initialize-config.sh" "$@"
