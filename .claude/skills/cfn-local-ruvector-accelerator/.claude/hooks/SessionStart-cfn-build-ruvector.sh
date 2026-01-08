#!/bin/bash
# SessionStart hook: Verify RuVector binary is available
BINARY="$HOME/.local/bin/local-ruvector"

# Check if binary exists in PATH or ~/.local/bin
if command -v local-ruvector &>/dev/null; then
    echo "[cfn-build-ruvector] ✅ local-ruvector available in PATH"
elif [ -x "$BINARY" ]; then
    echo "[cfn-build-ruvector] ✅ local-ruvector available at $BINARY"
else
    echo "[cfn-build-ruvector] ⚠️  local-ruvector not found"
    echo "[cfn-build-ruvector] Install with: ./scripts/install-ruvector-global.sh"
fi
