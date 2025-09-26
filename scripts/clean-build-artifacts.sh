#!/bin/bash

# Build Artifacts Cleanup Script
# Safe removal of regenerable build artifacts
# Author: CI/CD Pipeline Engineer
# Generated: 2025-09-26

set -e

echo "🧹 Claude Flow Build Artifacts Cleanup"
echo "======================================"

# Verify we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Not in project root directory"
    exit 1
fi

# Function to safely remove if exists
safe_remove() {
    local path="$1"
    local description="$2"

    if [ -e "$path" ]; then
        echo "🗑️  Removing $description: $path"
        rm -rf "$path"
        echo "✅ Removed successfully"
    else
        echo "ℹ️  Not found: $path"
    fi
}

# Function to calculate size before removal
calculate_size() {
    local path="$1"
    if [ -e "$path" ]; then
        du -sh "$path" 2>/dev/null | cut -f1
    else
        echo "0"
    fi
}

echo ""
echo "📊 Calculating space to be recovered..."

# Calculate sizes
DIST_SIZE=$(calculate_size "dist")
BUILD_CONSOLIDATED_SIZE=$(calculate_size "build-consolidated.js")
STALE_PNPM_SIZE=$(calculate_size "pnpm-lock.yaml")

echo "📁 dist/ directory: $DIST_SIZE"
echo "📄 build-consolidated.js: $BUILD_CONSOLIDATED_SIZE"
echo "📄 pnpm-lock.yaml (stale): $STALE_PNPM_SIZE"

echo ""
echo "🚀 Starting cleanup..."

# 1. Remove main build output directory
safe_remove "dist" "TypeScript compiled output directory"

# 2. Remove temporary build script
safe_remove "build-consolidated.js" "temporary build script"

# 3. Remove stale PNPM lockfile (npm is being used)
if [ -f "pnpm-lock.yaml" ] && [ -f "package-lock.json" ]; then
    echo "🔍 Found both pnpm-lock.yaml and package-lock.json"
    echo "📅 pnpm-lock.yaml is older (Sep 24) vs package-lock.json (Sep 26)"
    safe_remove "pnpm-lock.yaml" "stale PNPM lockfile"
fi

# 4. Remove any temporary directories created during build
safe_remove ".crdt-data" "temporary CRDT data"
safe_remove ".demo-crdt-data" "temporary demo CRDT data"

# 5. Remove TypeScript incremental build info (if any)
find . -name "*.tsbuildinfo" -not -path "./node_modules/*" -delete 2>/dev/null || true

# 6. Remove any Jest cache (if present)
safe_remove ".jest" "Jest cache directory"

# 7. Remove any coverage reports (if present)
safe_remove "coverage" "test coverage reports"
safe_remove ".nyc_output" "NYC coverage output"

echo ""
echo "✅ Build artifacts cleanup completed!"
echo ""
echo "🔧 To regenerate build artifacts:"
echo "   npm run build       # Rebuilds dist/ directory"
echo "   npm test            # Regenerates test artifacts"
echo ""
echo "📈 Space recovered: ~$DIST_SIZE + additional temp files"
echo ""
echo "⚠️  Note: All removed files can be regenerated via npm scripts"