#!/usr/bin/env bash
set -euo pipefail

# Repo root, derived from this script's own location so the script
# works from any checkout on any machine.
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../.." && pwd -P)"

# Logging function
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" >&2
}

# Error handler
handle_error() {
    log "ERROR: An error occurred in line $1"
    log "Last command failed: $BASH_COMMAND"
    exit 1
}

# Trap errors
trap 'handle_error $LINENO' ERR

# Path to Python script
PYTHON_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-agent-discovery/discover-agents.py"

# Output file
OUTPUT_FILE="$PROJECT_ROOT/.claude/skills/cfn-agent-discovery/agents-registry.json"

# Logging file
LOG_FILE="/tmp/agent-discovery.log"

log "Starting agent discovery process"

# Check Python is available
if ! command -v python3 &> /dev/null; then
    log "ERROR: Python3 is not installed"
    exit 1
fi

# Ensure we have required packages
log "Installing required Python packages"

# Try multiple methods to install PyYAML
install_methods=(
    "python3 -m pip install --user --break-system-packages pyyaml"
    "python3 -m venv /tmp/pyenv && /tmp/pyenv/bin/pip install pyyaml"
    "pip3 install --user pyyaml"
    "pip install --user pyyaml"
)

installed=false
for method in "${install_methods[@]}"; do
    log "Trying installation method: $method"
    if $method; then
        installed=true
        break
    fi
done

if [ "$installed" = false ]; then
    log "ERROR: Could not install PyYAML"
    exit 1
fi

# Run Python discovery script with logging
log "Running discovery script"
python3 "$PYTHON_SCRIPT" 2>&1 | tee "$LOG_FILE"

# Check script succeeded
if [ ! -f "$OUTPUT_FILE" ]; then
    log "ERROR: Output file was not generated"
    exit 1
fi

# Optional: Run jq to validate JSON (if jq is available)
if command -v jq &> /dev/null; then
    log "Validating JSON output"
    if jq '.' "$OUTPUT_FILE" > /dev/null 2>&1; then
        log "✅ JSON is valid"
    else
        log "❌ Invalid JSON"
        exit 1
    fi
fi

# Show total agents
total_agents=$(jq '.total_agents' "$OUTPUT_FILE" 2>/dev/null || echo 0)
log "Total agents discovered: $total_agents"

# Final success log
log "Agent discovery completed successfully"