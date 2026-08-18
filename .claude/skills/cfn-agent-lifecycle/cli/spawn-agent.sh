#!/usr/bin/env bash
# CLI wrapper for agent spawning
# Delegates to lib/spawning/spawn-agent.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/../lib/spawning/spawn-agent.sh" "$@"
