#!/bin/bash

# ============================================================================
# build-linux.sh - Compile TypeScript to JavaScript for CFN Agent
# ============================================================================
#
# Usage (from Docker container):
#   scripts/build-linux.sh
#
# Called from: docker/Dockerfile.agent during container build
# Purpose: Compile TypeScript source to JavaScript distribution
#
# This script:
# 1. Validates npm is available
# 2. Cleans previous dist directory
# 3. Runs SWC compiler (faster than tsc)
# 4. Verifies dist/cli/spawn.js exists
# 5. Displays build summary
#
# ============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo -e "${YELLOW}[build-linux.sh]${NC} Starting TypeScript compilation..."
echo "Project root: $PROJECT_ROOT"

# Verify npm is available
if ! command -v npm &> /dev/null; then
    echo -e "${RED}[ERROR]${NC} npm not found in PATH"
    exit 1
fi

echo -e "${GREEN}[OK]${NC} npm version: $(npm --version)"

# Verify we have node_modules
if [ ! -d "$PROJECT_ROOT/node_modules" ]; then
    echo -e "${RED}[ERROR]${NC} node_modules not found. Please run 'npm ci' first."
    exit 1
fi

# Change to project root
cd "$PROJECT_ROOT"

# Run the build using npm script
echo -e "${YELLOW}[build-linux.sh]${NC} Running 'npm run build'..."
npm run build

# Verify dist/cli/spawn.js was created
if [ ! -f "dist/cli/spawn.js" ]; then
    echo -e "${RED}[ERROR]${NC} dist/cli/spawn.js not found after build!"
    echo "Dist directory contents:"
    ls -la dist/ 2>/dev/null || echo "dist/ directory is empty or missing"
    exit 1
fi

# Display build summary
echo ""
echo -e "${GREEN}[SUCCESS]${NC} Build completed!"
echo ""
echo "Build summary:"
ls -lh dist/cli/spawn.js
echo ""
echo "Dist directory contents:"
find dist -type f -name "*.js" | wc -l | xargs echo "  JavaScript files:"
find dist -type f | wc -l | xargs echo "  Total files:"
du -sh dist | awk '{print "  Total size: " $1}'

exit 0
