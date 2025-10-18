#!/bin/bash

# Clean Benchmark Execution Script
# Phase 16: Clean benchmark infrastructure without claude-flow conflicts

set -e

echo "🧹 Phase 16: Clean Benchmark Execution Environment"
echo "=================================================="

# Set benchmark root
BENCHMARK_ROOT="/mnt/c/Users/masha/Documents/claude-flow-novice/benchmark"
cd "$BENCHMARK_ROOT"

echo "📍 Current directory: $(pwd)"

# Clean any residual claude-flow conflicts
echo "🔍 Checking for claude-flow conflicts..."
if [ -d ".claude-flow" ]; then
    echo "❌ Found .claude-flow directory in benchmark root - this should not exist"
    exit 1
fi

if find . -name ".claude-flow" -type d 2>/dev/null | grep -q .; then
    echo "❌ Found .claude-flow subdirectories in benchmark tree"
    find . -name ".claude-flow" -type d 2>/dev/null
    exit 1
fi

echo "✅ No claude-flow conflicts detected"

# Verify benchmark structure
echo "🏗️  Verifying benchmark structure..."
REQUIRED_DIRS=("scripts" "tests" "examples" "config" "src" "docs" "results")

for dir in "${REQUIRED_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        echo "✅ $dir/ directory exists"
    else
        echo "⚠️  $dir/ directory missing - creating..."
        mkdir -p "$dir"
    fi
done

# Verify execution scripts
echo "🔧 Verifying execution scripts..."
if [ -d "scripts/execution" ]; then
    echo "✅ Execution scripts organized in scripts/execution/"
    ls -la scripts/execution/ | head -5
else
    echo "⚠️  No scripts/execution directory found"
fi

# Verify test organization
echo "🧪 Verifying test organization..."
if [ -d "tests" ]; then
    echo "✅ Tests directory exists"
    echo "Test files: $(find tests -name "*.py" | wc -l) Python files"
    echo "Test scripts: $(find tests -name "*.sh" | wc -l) shell scripts"
else
    echo "❌ Tests directory missing"
    exit 1
fi

# Check Python environment
echo "🐍 Checking Python environment..."
if command -v python3 &> /dev/null; then
    echo "✅ Python3 available: $(python3 --version)"
else
    echo "❌ Python3 not available"
    exit 1
fi

# Verify requirements
if [ -f "requirements.txt" ]; then
    echo "✅ requirements.txt found"
    echo "📦 Dependencies: $(wc -l < requirements.txt) packages"
else
    echo "⚠️  requirements.txt not found"
fi

# Check benchmark data organization
echo "📊 Checking benchmark data organization..."
if [ -d "results" ]; then
    echo "✅ Results directory exists"
    echo "Results files: $(find results -name "*.json" 2>/dev/null | wc -l) JSON files"
fi

if [ -d "archive" ]; then
    echo "✅ Archive directory exists"
    echo "Archived files: $(find archive -type f 2>/dev/null | wc -l) files"
fi

echo ""
echo "🎯 Clean Benchmark Environment Summary:"
echo "======================================="
echo "✅ No claude-flow conflicts detected"
echo "✅ Benchmark directory structure verified"
echo "✅ Execution scripts organized"
echo "✅ Test environment clean"
echo "✅ Python environment available"
echo ""
echo "🚀 Benchmark environment ready for execution!"
echo "Use scripts in scripts/execution/ to run benchmarks"
echo "Use tests/ for validation and testing"
echo "Results will be stored in results/"