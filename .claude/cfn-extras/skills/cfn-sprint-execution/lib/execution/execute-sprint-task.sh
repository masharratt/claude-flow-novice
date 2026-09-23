#!/usr/bin/env bash

set -euo pipefail

# Sprint Task Execution Script

# Validate required arguments
[[ $# -lt 4 ]] && { 
    echo "Usage: $0 [SPRINT_CONFIG] [TASK_ID] [AGENT_ID] [SPRINT_ID]"
    exit 1
}

SPRINT_CONFIG="$1"
TASK_ID="$2"
AGENT_ID="$3"
SPRINT_ID="$4"

# Validate file inputs
[[ ! -f "$SPRINT_CONFIG" ]] && {
    echo "Error: Sprint configuration file not found"
    exit 1
}

# Read sprint configuration
CONFIG=$(cat "$SPRINT_CONFIG")

# Extract sprint details
CONTEXT=$(echo "$CONFIG" | jq -r '.context_injection')
DELIVERABLES=$(echo "$CONFIG" | jq -r '.deliverables[]')
IN_SCOPE=$(echo "$CONFIG" | jq -r '.in_scope[]')
OUT_OF_SCOPE=$(echo "$CONFIG" | jq -r '.out_of_scope[]')

# Validate deliverables directory
for deliverable in $DELIVERABLES; do
    mkdir -p "$(dirname "$deliverable")"
done

# Redis coordination - signal sprint start
redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:sprint_started" "$SPRINT_ID"

# Context injection template
cat << EOF > /tmp/sprint_context_${SPRINT_ID}.txt
SPRINT ${SPRINT_ID} CONTEXT:

${CONTEXT}

DELIVERABLES:
$(echo "$DELIVERABLES" | while read -r file; do echo "- ${file}"; done)

IN SCOPE:
$(echo "$IN_SCOPE" | while read -r item; do echo "- ${item}"; done)

OUT OF SCOPE:
$(echo "$OUT_OF_SCOPE" | while read -r item; do echo "- ${item}"; done)

CRITICAL RULES:
1. Only create files in DELIVERABLES list
2. Do not implement anything OUT OF SCOPE
3. Focus strictly on IN SCOPE tasks
EOF

# Signal sprint completion
redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:sprint_completed" "$SPRINT_ID"

# Clean up temporary context file
rm -f "/tmp/sprint_context_${SPRINT_ID}.txt"

echo "Sprint ${SPRINT_ID} execution completed successfully"