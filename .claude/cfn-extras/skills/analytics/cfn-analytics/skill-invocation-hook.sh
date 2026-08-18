#!/usr/bin/env bash
# Skill Invocation Logging Hook

# Ensure required arguments are provided
if [ $# -lt 5 ]; then
    echo "Usage: $0 <skill_name> <user_prompt> <outcome> <input_tokens> <output_tokens> [confidence_score] [context_reduction_percentage]"
    exit 1
fi

# Default values
CONFIDENCE_SCORE=${6:-0.0}
CONTEXT_REDUCTION=${7:-0.0}

# Path to the logging script (adjust as needed)
LOGGING_SCRIPT="/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-analytics/log-skill-invocation.js"

# Execute logging script
node "$LOGGING_SCRIPT" \
    "$1" \
    "$2" \
    "$3" \
    "$4" \
    "$5" \
    "$CONFIDENCE_SCORE" \
    "$CONTEXT_REDUCTION_PERCENTAGE"

# Exit with the script's return code
exit $?