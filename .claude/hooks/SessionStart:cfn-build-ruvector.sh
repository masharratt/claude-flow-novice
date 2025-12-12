#!/bin/bash
# SessionStart hook: Build RuVector Rust binary if missing
# This ensures RuVector is compiled on cfn init

RUVECTOR_DIR="$(dirname "$(dirname "$(dirname "$0")")")/skills/cfn-local-ruvector-accelerator"
BINARY="$RUVECTOR_DIR/target/release/local-ruvector"

# Only build if binary doesn't exist
if [ ! -f "$BINARY" ]; then
    echo "[cfn-build-ruvector] Binary not found, building..."

    # Check if Cargo is available
    if ! command -v cargo &> /dev/null; then
        echo "[cfn-build-ruvector] WARNING: Cargo not installed, skipping RuVector build"
        exit 0
    fi

    # Build release binary
    cd "$RUVECTOR_DIR" && cargo build --release --quiet 2>/dev/null

    if [ -f "$BINARY" ]; then
        echo "[cfn-build-ruvector] ✅ RuVector binary built successfully"
    else
        echo "[cfn-build-ruvector] WARNING: Build failed, RuVector unavailable"
    fi
else
    echo "[cfn-build-ruvector] ✅ RuVector binary already exists"
fi
