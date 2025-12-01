#!/bin/bash
# Engineering team initialization script
# Sourced by base entrypoint.sh before agent execution

set -euo pipefail

log "INFO" "Running engineering team initialization"

# Validate Python environment
if ! python3 --version >/dev/null 2>&1; then
    log "ERROR" "Python 3 not available"
    exit 1
fi

# Validate Node.js environment
if ! node --version >/dev/null 2>&1; then
    log "ERROR" "Node.js not available"
    exit 1
fi

# Check if workspace has package.json and install dependencies if needed
if [[ -f /workspace/package.json ]] && [[ ! -d /workspace/node_modules ]]; then
    log "INFO" "Found package.json, installing Node.js dependencies"
    cd /workspace && npm install
fi

# Check if workspace has requirements.txt and install dependencies if needed
if [[ -f /workspace/requirements.txt ]]; then
    log "INFO" "Found requirements.txt, checking Python dependencies"
    # Only install if different from image dependencies
    if ! diff -q /workspace/requirements.txt /app/requirements.txt >/dev/null 2>&1; then
        log "INFO" "Installing workspace-specific Python dependencies"
        pip3 install --no-cache-dir -r /workspace/requirements.txt
    fi
fi

# Set up git config if not present (for commits)
if [[ ! -f /workspace/.git/config ]] && git rev-parse --git-dir >/dev/null 2>&1; then
    log "INFO" "Configuring git for agent"
    git config --global user.name "CFN Engineering Agent"
    git config --global user.email "cfn-engineering@company.com"
fi

log "INFO" "Engineering team initialization complete"
