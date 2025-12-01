#!/bin/bash
# Build TypeScript implementation to JavaScript
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Building cfn-dependency-ingestion TypeScript..."

# Compile TypeScript to JavaScript (ESM for Node.js type: module)
npx tsc src/ingest-dependencies.ts \
  --outDir dist \
  --module esnext \
  --target es2020 \
  --esModuleInterop \
  --resolveJsonModule \
  --skipLibCheck \
  --moduleResolution node

# Make the output executable
chmod +x dist/ingest-dependencies.js

echo "✓ Build complete: dist/ingest-dependencies.js"
