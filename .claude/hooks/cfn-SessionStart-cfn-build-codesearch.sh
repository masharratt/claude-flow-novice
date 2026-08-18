#!/usr/bin/env bash
# SessionStart hook: Ensure CodeSearch binary is available (global or local)
GLOBAL_BINARY="$HOME/.local/bin/local-codesearch"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd -P)"
CODESEARCH_DIR="$PROJECT_ROOT/.claude/skills/cfn-codesearch"
LOCAL_BINARY="$CODESEARCH_DIR/target/release/local-codesearch"

# Check global first (preferred)
if [ -f "$GLOBAL_BINARY" ]; then
    exit 0
fi

# Fall back to local binary
if [ -f "$LOCAL_BINARY" ]; then
    exit 0
fi

# Build locally if cargo available
if command -v cargo &>/dev/null && [ -d "$CODESEARCH_DIR" ]; then
    echo "[cfn-build-codesearch] Building CodeSearch..."
    cd "$CODESEARCH_DIR" && cargo build --release --quiet 2>/dev/null
    [ -f "$LOCAL_BINARY" ] && echo "[cfn-build-codesearch] Built locally" || echo "[cfn-build-codesearch] Build skipped"
fi
