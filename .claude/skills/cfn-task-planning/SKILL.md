# 1. Classify task
TASK_JSON=$(./cli/classify-task.sh "$TASK_DESCRIPTION" --format=json)
TASK_TYPE=$(echo "$TASK_JSON" | jq -r '.task_type')
COMPLEXITY=$(echo "$TASK_JSON" | jq -r '.complexity')

# 2. Initialize config
./cli/init-config.sh --task-id "$TASK_ID" --description "$TASK_DESCRIPTION"

# 3. Decompose if complex
if [ "$COMPLEXITY" = "high" ]; then
  SUBTASKS=$(./cli/decompose-task.sh --task-id "$TASK_ID" --description "$TASK_DESCRIPTION")
fi

# 4. Store audit data after completion
./lib/audit/store-task-audit.sh --task-id "$TASK_ID" --result "success" --confidence 0.92