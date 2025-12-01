#!/bin/bash
set -euo pipefail

# Environment variables
TASK_ID="${TASK_ID:-cfn-cli-cfn-cli-real-e2e-1763661597-8068}"
TASK_DESCRIPTION="${TASK_DESCRIPTION:-Create file 'hello-world.txt' in directory '/tmp/cfn-cli-real-test-cfn-cli-real-e2e-1763661597-8068' with exact content 'Hello CFN Loop'. Verify the file exists after creation.}"
MODE="${MODE:-standard}"
MAX_ITERATIONS="${MAX_ITERATIONS:-5}"
EXPECTED_FILES="${EXPECTED_FILES:-hello-world.txt}"
PROJECT_ROOT="${PROJECT_ROOT:-.}"

echo "📋 CFN v3 Coordinator - CLI Mode (TypeScript-First)"
echo "   TASK_ID: $TASK_ID"
echo "   MODE: $MODE"
echo ""

# Environment Setup
export NODE_ENV="${NODE_ENV:-production}"
export TS_NODE_PROJECT="$PROJECT_ROOT/tsconfig.json"
USE_TYPESCRIPT="${USE_TYPESCRIPT:-true}"

# Check Node.js
if [[ "$USE_TYPESCRIPT" == "true" ]]; then
  if ! command -v node &> /dev/null; then
    echo "⚠️  Warning: Node.js not found. Falling back to bash scripts." >&2
    USE_TYPESCRIPT=false
  fi
fi

# Check compiled TypeScript files
if [[ "$USE_TYPESCRIPT" == "true" ]]; then
  if [ ! -f "$PROJECT_ROOT/.claude/skills/cfn-agent-selection-with-fallback/dist/cli.cjs" ]; then
    echo "⚠️  Warning: TypeScript not compiled. Run 'npm run build' first. Falling back to bash." >&2
    USE_TYPESCRIPT=false
  fi
fi

if [[ "$USE_TYPESCRIPT" == "true" ]]; then
  echo "✅ TypeScript mode enabled"
else
  echo "⚠️  Bash fallback mode enabled"
fi
echo ""

# Store Task Context
echo "📦 Storing task context..."

if [[ "$USE_TYPESCRIPT" == "true" && -f "$PROJECT_ROOT/dist/coordination/store-task-context.js" ]]; then
  node "$PROJECT_ROOT/dist/coordination/store-task-context.js" \
    --task-id "$TASK_ID" \
    --description "$TASK_DESCRIPTION" \
    --mode "$MODE" \
    --max-iterations "$MAX_ITERATIONS" 2>&1 || {
    echo "⚠️  Warning: TypeScript storage failed, falling back to bash" >&2
    USE_TYPESCRIPT=false
  }
fi

if [[ "$USE_TYPESCRIPT" == "false" ]]; then
  "$PROJECT_ROOT/.claude/skills/cfn-redis-coordination/store-task-context.sh" \
    --task-id "$TASK_ID" \
    --description "$TASK_DESCRIPTION" \
    --mode "$MODE" \
    --max-iterations "$MAX_ITERATIONS" 2>&1 || {
    echo "⚠️  Warning: Failed to store context, falling back to direct Redis" >&2
    redis-cli -h "${REDIS_HOST:-localhost}" -p "${REDIS_PORT:-6379}" \
      HSET "swarm:${TASK_ID}:context" "task_description" "$TASK_DESCRIPTION" >/dev/null 2>&1
    redis-cli -h "${REDIS_HOST:-localhost}" -p "${REDIS_PORT:-6379}" \
      HSET "swarm:${TASK_ID}:context" "mode" "$MODE" >/dev/null 2>&1
  }
fi

echo "   ✅ Context stored"

# Store Success Criteria
echo "📋 Storing success criteria..."

CRITERIA_JSON='{
  "test_suites": [{
    "name": "Deliverable Creation",
    "command": "test -f '"$EXPECTED_FILES"' && echo \"File exists\"",
    "required": true,
    "pass_threshold": 0.70
  }],
  "gate_mode": "test-driven",
  "metadata": {
    "created_by": "cfn-v3-coordinator",
    "mode": "'"$MODE"'"
  }
}'

if [[ "$USE_TYPESCRIPT" == "true" && -f "$PROJECT_ROOT/dist/coordination/store-success-criteria.js" ]]; then
  node "$PROJECT_ROOT/dist/coordination/store-success-criteria.js" \
    --task-id "$TASK_ID" \
    --criteria "$CRITERIA_JSON" 2>&1 || {
    echo "⚠️  Warning: TypeScript criteria storage failed, falling back to bash" >&2
    "$PROJECT_ROOT/.claude/skills/cfn-redis-coordination/store-success-criteria.sh" \
      --task-id "$TASK_ID" \
      --criteria "$CRITERIA_JSON" 2>&1
  }
else
  "$PROJECT_ROOT/.claude/skills/cfn-redis-coordination/store-success-criteria.sh" \
    --task-id "$TASK_ID" \
    --criteria "$CRITERIA_JSON" 2>&1
fi

echo "   ✅ Success criteria stored"

# Select Agents
echo "🤖 Selecting agents..."

if [[ "$USE_TYPESCRIPT" == "true" ]]; then
  AGENT_JSON=$(node "$PROJECT_ROOT/.claude/skills/cfn-agent-selection-with-fallback/dist/cli.cjs" \
    "$TASK_DESCRIPTION" --min-validators 3 2>/dev/null || echo '{}')
else
  AGENT_JSON=$("$PROJECT_ROOT/.claude/skills/cfn-agent-selection-with-fallback/select-agents.sh" \
    "$TASK_DESCRIPTION" --min-validators 3 2>/dev/null || echo '{}')
fi

LOOP3_AGENTS=$(echo "$AGENT_JSON" | jq -r '.loop3[]? // empty' | paste -sd ',' - || echo "backend-developer")
LOOP2_AGENTS=$(echo "$AGENT_JSON" | jq -r '.loop2[]? // empty' | paste -sd ',' - || echo "code-reviewer,tester")
PRODUCT_OWNER=$(echo "$AGENT_JSON" | jq -r '.product_owner // "product-owner"')

echo "   ✅ Agents selected"
echo "      Loop 3: $LOOP3_AGENTS"
echo "      Loop 2: $LOOP2_AGENTS"
echo "      Product Owner: $PRODUCT_OWNER"

# Invoke Orchestrator
echo ""
echo "🚀 INVOKING ORCHESTRATOR"
echo "   Orchestrator handles complete CFN Loop execution"
echo ""

if [[ "$USE_TYPESCRIPT" == "true" && -f "$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/dist/cli/orchestrator-cli.js" ]]; then
  echo "   Using TypeScript orchestrator..."
  node "$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/dist/cli/orchestrator-cli.js" \
    --task-id "$TASK_ID" \
    --mode "$MODE" \
    --loop3-agents "$LOOP3_AGENTS" \
    --loop2-agents "$LOOP2_AGENTS" \
    --product-owner "$PRODUCT_OWNER" \
    --max-iterations "$MAX_ITERATIONS" \
    --success-criteria "enabled" 2>&1
  EXIT_CODE=$?
else
  echo "   Using bash orchestrator wrapper..."
  ORCHESTRATOR="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate-wrapper.sh"
  if [[ ! -f "$ORCHESTRATOR" ]]; then
    echo "❌ FATAL: Orchestrator not found at $ORCHESTRATOR"
    exit 1
  fi
  bash "$ORCHESTRATOR" \
    --task-id "$TASK_ID" \
    --mode "$MODE" \
    --loop3-agents "$LOOP3_AGENTS" \
    --loop2-agents "$LOOP2_AGENTS" \
    --product-owner "$PRODUCT_OWNER" \
    --max-iterations "$MAX_ITERATIONS" \
    --success-criteria "enabled" 2>&1
  EXIT_CODE=$?
fi

if [[ $EXIT_CODE -eq 0 ]]; then
  echo ""
  echo "✅ ORCHESTRATOR COMPLETED SUCCESSFULLY"
  exit 0
else
  echo ""
  echo "❌ ORCHESTRATOR FAILED (exit code: $EXIT_CODE)"
  exit $EXIT_CODE
fi
