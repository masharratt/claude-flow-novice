#!/usr/bin/env bash
# Install RuVector binary to ~/.local/bin for global access
# Usage: ./scripts/install-ruvector-global.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RUVECTOR_DIR="$PROJECT_ROOT/.claude/skills/cfn-local-ruvector-accelerator"
TARGET_BIN="$HOME/.local/bin/local-ruvector"

echo "[ruvector-install] Installing RuVector to ~/.local/bin/"

# Ensure ~/.local/bin exists
mkdir -p "$HOME/.local/bin"

# Check if we need to build
SOURCE_BINARY="$RUVECTOR_DIR/target/release/local-ruvector"
if [ ! -f "$SOURCE_BINARY" ]; then
    echo "[ruvector-install] Building RuVector from source..."
    if ! command -v cargo &>/dev/null; then
        echo "[ruvector-install] ERROR: cargo not found. Install Rust: https://rustup.rs"
        exit 1
    fi
    cd "$RUVECTOR_DIR"
    cargo build --release
fi

# Copy binary
if [ -f "$SOURCE_BINARY" ]; then
    cp "$SOURCE_BINARY" "$TARGET_BIN"
    chmod +x "$TARGET_BIN"
    echo "[ruvector-install] Installed: $TARGET_BIN"
    echo "[ruvector-install] Version: $($TARGET_BIN --version 2>/dev/null || echo 'unknown')"
else
    echo "[ruvector-install] ERROR: Build failed - binary not found"
    exit 1
fi

# Verify PATH
if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
    echo ""
    echo "[ruvector-install] WARNING: ~/.local/bin not in PATH"
    echo "Add to your shell profile:"
    echo '  export PATH="$HOME/.local/bin:$PATH"'
fi

echo "[ruvector-install] Done. Run 'local-ruvector --help' to verify."
