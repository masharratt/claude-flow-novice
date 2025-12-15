#!/bin/bash
# SessionStart hook: Ensure RuVector binary is available (global or local)
GLOBAL_BINARY="$HOME/.local/bin/local-ruvector"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
RUVECTOR_DIR="$PROJECT_ROOT/.claude/skills/cfn-local-ruvector-accelerator"
LOCAL_BINARY="$RUVECTOR_DIR/target/release/local-ruvector"

# Check global first (preferred)
if [ -f "$GLOBAL_BINARY" ]; then
    exit 0
fi

# Fall back to local binary
if [ -f "$LOCAL_BINARY" ]; then
    exit 0
fi

# Build locally if cargo available
if command -v cargo &>/dev/null && [ -d "$RUVECTOR_DIR" ]; then
    echo "[cfn-build-ruvector] Building RuVector..."
    cd "$RUVECTOR_DIR" && cargo build --release --quiet 2>/dev/null
    [ -f "$LOCAL_BINARY" ] && echo "[cfn-build-ruvector] Built locally" || echo "[cfn-build-ruvector] Build skipped"
fi
