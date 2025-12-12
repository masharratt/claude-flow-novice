#!/bin/bash
# SessionStart hook: Build RuVector Rust binary if missing
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
RUVECTOR_DIR="$PROJECT_ROOT/.claude/skills/cfn-local-ruvector-accelerator"
BINARY="$RUVECTOR_DIR/target/release/local-ruvector"

if [ ! -f "$BINARY" ]; then
    echo "[cfn-build-ruvector] Building RuVector..."
    command -v cargo &>/dev/null && cd "$RUVECTOR_DIR" && cargo build --release --quiet 2>/dev/null
    [ -f "$BINARY" ] && echo "[cfn-build-ruvector] ✅ Built" || echo "[cfn-build-ruvector] Build skipped"
fi
