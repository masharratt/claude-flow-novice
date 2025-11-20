#!/usr/bin/env bash

##############################################################################
# Iteration Manager (TypeScript Wrapper)
# Prepares next iteration and generates wake signals
#
# Usage:
#   iteration-manager-ts.sh --current-iteration <n> \
#                           --agents <agent1,agent2,...> \
#                           [--feedback <json>]
#
# Returns:
#   Next iteration metadata (JSON)
##############################################################################

set -euo pipefail

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HELPERS_DIR="$SCRIPT_DIR/../src/helpers"

# Parameters
CURRENT_ITERATION=""
AGENTS=""
FEEDBACK="{}"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --current-iteration) CURRENT_ITERATION="$2"; shift 2 ;;
    --agents) AGENTS="$2"; shift 2 ;;
    --feedback) FEEDBACK="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# Validation
if [ -z "$CURRENT_ITERATION" ] || [ -z "$AGENTS" ]; then
  echo "Error: Missing required parameters" >&2
  exit 1
fi

# Convert comma-separated agents to JSON array
IFS=',' read -ra AGENT_ARRAY <<< "$AGENTS"
AGENTS_JSON="["
for i in "${!AGENT_ARRAY[@]}"; do
  if [ $i -gt 0 ]; then
    AGENTS_JSON+=","
  fi
  AGENTS_JSON+="\"${AGENT_ARRAY[$i]}\""
done
AGENTS_JSON+="]"

# Build TypeScript invocation
TS_CODE="
import { prepareIteration, wakeAgents } from './iteration-manager';

const iteration = prepareIteration({
  currentIteration: $CURRENT_ITERATION,
  feedback: $FEEDBACK
});

console.log('Iteration Preparation:');
console.log(\`  Next Iteration: \${iteration.nextIteration}\`);
console.log(\`  Timestamp: \${iteration.timestamp}\`);
console.log();

const agentIds = $AGENTS_JSON;
const wake = wakeAgents(agentIds);

console.log('Wake Signals Generated:');
wake.signals.forEach((signal, idx) => {
  console.log(\`  [\${idx + 1}] \${signal}\`);
});
console.log();
console.log(\`✅ Prepared iteration \${iteration.nextIteration} for \${agentIds.length} agents\`);

// Output JSON for programmatic consumption
console.log();
console.log('JSON_OUTPUT:', JSON.stringify({
  nextIteration: iteration.nextIteration,
  timestamp: iteration.timestamp,
  signals: wake.signals
}));
"

# Execute TypeScript code
cd "$HELPERS_DIR"
ts-node -e "$TS_CODE"
