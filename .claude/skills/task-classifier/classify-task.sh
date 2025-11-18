#!/bin/bash
# Task Classification Skill
# Analyzes task description and suggests appropriate agent specializations

set -euo pipefail

# Usage: classify-task.sh <task-description>
TASK_DESCRIPTION="${1:-}"

if [[ -z "$TASK_DESCRIPTION" ]]; then
    echo "Usage: $0 <task-description>" >&2
    exit 1
fi

# Keywords for classification
FRONTEND_KEYWORDS="ui|ux|react|component|css|styling|layout|responsive|frontend|interface"
BACKEND_KEYWORDS="api|endpoint|server|database|rest|graphql|backend|service|authentication"
DEVOPS_KEYWORDS="docker|kubernetes|ci/cd|deployment|infrastructure|container|pipeline"
TESTING_KEYWORDS="test|qa|validation|coverage|integration|unit|e2e"
SECURITY_KEYWORDS="security|auth|encryption|vulnerability|audit|penetration"
DATA_KEYWORDS="database|sql|migration|schema|data|model|entity"
PERFORMANCE_KEYWORDS="performance|optimization|speed|cache|memory|cpu"

# Classify based on keywords
CLASSIFICATIONS=()

if echo "$TASK_DESCRIPTION" | grep -qiE "$FRONTEND_KEYWORDS"; then
    CLASSIFICATIONS+=("frontend")
fi

if echo "$TASK_DESCRIPTION" | grep -qiE "$BACKEND_KEYWORDS"; then
    CLASSIFICATIONS+=("backend")
fi

if echo "$TASK_DESCRIPTION" | grep -qiE "$DEVOPS_KEYWORDS"; then
    CLASSIFICATIONS+=("devops")
fi

if echo "$TASK_DESCRIPTION" | grep -qiE "$TESTING_KEYWORDS"; then
    CLASSIFICATIONS+=("testing")
fi

if echo "$TASK_DESCRIPTION" | grep -qiE "$SECURITY_KEYWORDS"; then
    CLASSIFICATIONS+=("security")
fi

if echo "$TASK_DESCRIPTION" | grep -qiE "$DATA_KEYWORDS"; then
    CLASSIFICATIONS+=("data")
fi

if echo "$TASK_DESCRIPTION" | grep -qiE "$PERFORMANCE_KEYWORDS"; then
    CLASSIFICATIONS+=("performance")
fi

# Default to general if no specific classification
if [[ ${#CLASSIFICATIONS[@]} -eq 0 ]]; then
    CLASSIFICATIONS+=("general")
fi

# Output classifications as comma-separated list
IFS=','
echo "${CLASSIFICATIONS[*]}"
