#!/bin/bash
# Cerebras Routing Hook - Injects CCR tag into Task tool prompts
#
# Maps Claude model tiers to Cerebras models:
#   haiku  → gpt-oss-120b  (3000 tok/s)
#   sonnet → zai-glm-4.6   (1000 tok/s)
#   opus   → zai-glm-4.6   (1000 tok/s)

set -euo pipefail

# Read hook input from stdin
INPUT=$(cat)

# Extract model and prompt from tool_input
MODEL=$(echo "$INPUT" | jq -r '.tool_input.model // "haiku"')
PROMPT=$(echo "$INPUT" | jq -r '.tool_input.prompt // ""')

# Skip if prompt already has CCR tag
if echo "$PROMPT" | grep -q '<CCR-SUBAGENT-MODEL>'; then
    echo '{"decision":"allow"}'
    exit 0
fi

# Map Claude model tier to Cerebras model
map_to_cerebras() {
    local model="$1"
    if [[ "$model" == *"haiku"* ]]; then
        echo "gpt-oss-120b"
    elif [[ "$model" == *"sonnet"* ]]; then
        echo "zai-glm-4.6"
    elif [[ "$model" == *"opus"* ]]; then
        echo "zai-glm-4.6"
    else
        echo "gpt-oss-120b"
    fi
}

CEREBRAS_MODEL=$(map_to_cerebras "$MODEL")

# Prepend CCR tag to prompt
WRAPPED_PROMPT="<CCR-SUBAGENT-MODEL>cerebras,${CEREBRAS_MODEL}</CCR-SUBAGENT-MODEL>
${PROMPT}"

# Escape for JSON
ESCAPED_PROMPT=$(echo "$WRAPPED_PROMPT" | jq -Rs .)

# Output hook response with updated prompt
cat << EOF
{
  "decision": "allow",
  "updatedInput": {
    "prompt": ${ESCAPED_PROMPT}
  }
}
EOF
