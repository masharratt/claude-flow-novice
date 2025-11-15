#!/bin/bash
# Saves agent output to SQLite via TypeScript adapter

# Enable strict error handling
set -euo pipefail

# Input validation
if [[ $# -lt 5 ]]; then
    echo "Usage: $0 <TASK_ID> <AGENT_ID> <AGENT_OUTPUT> <CONFIDENCE> <ITERATION>"
    exit 1
fi

TASK_ID="$1"
AGENT_ID="$2"
AGENT_OUTPUT="$3"
CONFIDENCE="$4"
ITERATION="$5"

# Normalize confidence to float
NORMALIZED_CONFIDENCE=$(printf "%.2f" "$CONFIDENCE")

# Ensure output is properly escaped for JSON
ESCAPED_OUTPUT=$(echo "$AGENT_OUTPUT" | jq -R -s '.')

# Call TypeScript persistence layer
node -e "
const { SQLiteAdapter } = require('./src/cli/sqlite-adapter');
const adapter = new SQLiteAdapter();

const memoryKey = \`agent/${AGENT_ID}/output/${TASK_ID}\`;
const outputRecord = {
  output: $ESCAPED_OUTPUT,
  confidence: parseFloat('$NORMALIZED_CONFIDENCE'),
  iteration: parseInt('$ITERATION'),
  timestamp: new Date().toISOString(),
  parsed_data: null  // Optional: Add structured parsing logic here
};

try {
  adapter.set(memoryKey, outputRecord, {
    aclLevel: 1,  // Read-only access
    tags: ['agent-output', \`agent-${AGENT_ID}\`, \`task-${TASK_ID}\`]
  });
  console.log(\`Successfully persisted output for agent ${AGENT_ID} in task ${TASK_ID}\`);
} catch (error) {
  console.error('Memory persistence failed:', error);
  process.exit(1);
}
"