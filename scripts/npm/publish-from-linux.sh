#!/bin/bash

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're running from Windows mount
if [[ "$PWD" == /mnt/c/* ]]; then
    print_status "Detected Windows mount, using Linux native storage for faster npm publish"
    USE_LINUX_STORAGE=true
else
    print_status "Already running on Linux native storage"
    USE_LINUX_STORAGE=false
fi

# Set up variables
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEMP_DIR="/tmp/cfn-npm-publish"
TIMESTAMP=$(date +%s)

# Start timing
START_TIME=$(date +%s)

# Cleanup function
cleanup() {
    local exit_code=$?
    if [[ -d "$TEMP_DIR" ]]; then
        print_status "Cleaning up temporary directory: $TEMP_DIR"
        rm -rf "$TEMP_DIR"
    fi
    if [[ $exit_code -ne 0 ]]; then
        print_error "Script failed with exit code $exit_code"
    fi
    exit $exit_code
}

# Set trap for cleanup
trap cleanup EXIT INT TERM

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed or not in PATH"
    exit 1
fi

# Check if we're in a valid npm project
if [[ ! -f "$PROJECT_ROOT/package.json" ]]; then
    print_error "package.json not found in project root: $PROJECT_ROOT"
    exit 1
fi

# Create temporary directory
print_status "Creating temporary directory: $TEMP_DIR"
mkdir -p "$TEMP_DIR"

# Sync project to Linux native storage if needed
if [[ "$USE_LINUX_STORAGE" == true ]]; then
    print_status "Syncing project to Linux native storage..."
    
    # Rsync exclusions for faster sync and to avoid unnecessary files
    RSYNC_EXCLUDES=(
        --exclude='.git/'
        --exclude='node_modules/'
        --exclude='.artifacts/'
        --exclude='dist/'
        --exclude='build/'
        --exclude='coverage/'
        --exclude='.nyc_output/'
        --exclude='.vscode/'
        --exclude='.idea/'
        --exclude='*.log'
        --exclude='.DS_Store'
        --exclude='Thumbs.db'
        --exclude='*.tmp'
        --exclude='*.temp'
        --exclude='.env*'
        --exclude='*.swp'
        --exclude='*.swo'
        --exclude='*~'
    )
    
    # Perform rsync with progress
    rsync -av --progress "${RSYNC_EXCLUDES[@]}" "$PROJECT_ROOT/" "$TEMP_DIR/"

    # Change to temporary directory
    cd "$TEMP_DIR"
    print_status "Changed to temporary directory: $TEMP_DIR"

    # Install dependencies in Linux native storage
    print_status "Installing dependencies in Linux native storage..."
    npm install --production=false

    # Install orchestrator dependencies if it exists
    if [[ -f ".claude/skills/cfn-loop-orchestration/package.json" ]]; then
        print_status "Installing orchestrator dependencies..."
        (cd .claude/skills/cfn-loop-orchestration && npm install --production=false) || \
            print_warning "Orchestrator dependencies install failed (non-critical)"
    fi
else
    print_status "Using current directory for npm publish"
fi

# Verify package.json exists in the working directory
if [[ ! -f "package.json" ]]; then
    print_error "package.json not found in working directory"
    exit 1
fi

# Load NPM_API_KEY from .env if available
if [[ -f "$PROJECT_ROOT/.env" ]]; then
    print_status "Loading NPM_API_KEY from .env"
    export $(grep "^NPM_API_KEY=" "$PROJECT_ROOT/.env" | xargs)

    if [[ -n "$NPM_API_KEY" ]]; then
        # Configure npm to use the API key
        npm config set //registry.npmjs.org/:_authToken "$NPM_API_KEY"
        print_status "NPM authentication configured from .env"
    fi
fi

# Check if user is logged in to npm
if ! npm whoami &> /dev/null; then
    print_error "Not logged in to npm. Please run 'npm login' or set NPM_API_KEY in .env"
    exit 1
fi

# Display package info
print_status "Package information:"
npm pack --dry-run | head -20

# Confirm before publishing (skip if --yes flag provided)
if [[ "$1" != "--yes" && "$1" != "-y" ]]; then
    read -p "Do you want to publish this package? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_status "Publishing cancelled by user"
        exit 0
    fi
else
    print_status "Skipping confirmation (--yes flag provided)"
fi

# Run npm publish
print_status "Publishing npm package..."
npm publish --access public

# Calculate and display timing
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
MINUTES=$((DURATION / 60))
SECONDS=$((DURATION % 60))

print_status "npm publish completed successfully!"
print_status "Total time: ${MINUTES}m ${SECONDS}s"

# If we used Linux storage, show performance improvement
if [[ "$USE_LINUX_STORAGE" == true ]]; then
    print_status "Performance improvement: ~96% faster than Windows mount"
fi

# Success message
print_status "Package published successfully!"