#!/usr/bin/env bash
# CFN Task Config Initialization Script
# Generates structured task configuration for Task Mode

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Parse arguments
TASK_DESCRIPTION=""
MODE="standard"
TASK_ID=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --task-description)
      TASK_DESCRIPTION="$2"
      shift 2
      ;;
    --mode)
      MODE="$2"
      shift 2
      ;;
    --task-id)
      TASK_ID="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

# Validate required parameters
if [ -z "$TASK_DESCRIPTION" ] || [ -z "$TASK_ID" ]; then
  echo "ERROR: Missing required parameters" >&2
  echo "Usage: $0 --task-description <desc> --task-id <id> [--mode <mode>]" >&2
  exit 1
fi

# Validate mode
case "$MODE" in
  mvp|standard|enterprise) ;;
  *)
    echo "WARNING: Invalid mode '$MODE', defaulting to 'standard'" >&2
    MODE="standard"
    ;;
esac

# Create config directory
CONFIG_DIR="$PROJECT_ROOT/.cfn/task-configs"
mkdir -p "$CONFIG_DIR"

CONFIG_FILE="$CONFIG_DIR/task-${TASK_ID}.json"

# Extract epic goal (first sentence or summary)
EPIC_GOAL=$(echo "$TASK_DESCRIPTION" | head -1 | sed 's/[[:space:]]*$//')

# Infer scope from task description
extract_scope() {
  local description="$1"
  local in_scope=()
  local out_scope=()
  local deliverables=()
  local directory="."
  local acceptance=()

  # Technology detection
  if echo "$description" | grep -iq "jwt\|auth\|oauth"; then
    in_scope+=("JWT token generation and validation")
    in_scope+=("Authentication middleware")
    deliverables+=("src/auth/jwt.ts" "src/auth/middleware.ts" "tests/auth.test.ts")
    directory="src/auth"
    acceptance+=("JWT tokens expire correctly")
    acceptance+=("Authentication tests pass with >80% coverage")
    out_scope+=("Multi-factor authentication")
    out_scope+=("Biometric login")
  fi

  if echo "$description" | grep -iq "api\|backend\|server"; then
    in_scope+=("REST API implementation")
    in_scope+=("Request validation")
    deliverables+=("src/api/routes.ts" "src/api/controllers.ts")
    acceptance+=("API endpoints return correct status codes")
    acceptance+=("Request validation handles edge cases")
    out_scope+=("GraphQL support")
    out_scope+=("WebSocket real-time features")
  fi

  if echo "$description" | grep -iq "database\|schema\|migration"; then
    in_scope+=("Database schema design")
    in_scope+=("Migration scripts")
    deliverables+=("src/db/schema.sql" "src/db/migrations/")
    acceptance+=("Migrations run without errors")
    acceptance+=("Database constraints enforced")
    out_scope+=("Database sharding")
    out_scope+=("Multi-region replication")
  fi

  if echo "$description" | grep -iq "test\|testing"; then
    in_scope+=("Unit tests")
    in_scope+=("Integration tests")
    deliverables+=("tests/unit/" "tests/integration/")
    acceptance+=("Test coverage >80%")
    acceptance+=("All tests pass")
    out_scope+=("End-to-end tests")
    out_scope+=("Performance benchmarks")
  fi

  # Default scope if nothing matched
  if [ ${#in_scope[@]} -eq 0 ]; then
    in_scope+=("Core functionality implementation")
    in_scope+=("Basic error handling")
    deliverables+=("src/main.ts" "tests/main.test.ts")
    acceptance+=("Core features work as specified")
    acceptance+=("Basic tests pass")
    out_scope+=("Advanced features")
    out_scope+=("Performance optimization")
  fi

  # Always add common out-of-scope items
  out_scope+=("User analytics and tracking")
  out_scope+=("Admin dashboard UI")
  out_scope+=("Monitoring and alerting")

  # Build JSON arrays
  local in_scope_json=$(printf '%s\n' "${in_scope[@]}" | jq -R . | jq -s .)
  local out_scope_json=$(printf '%s\n' "${out_scope[@]}" | jq -R . | jq -s .)
  local deliverables_json=$(printf '%s\n' "${deliverables[@]}" | jq -R . | jq -s .)
  local acceptance_json=$(printf '%s\n' "${acceptance[@]}" | jq -R . | jq -s .)

  # Return as JSON object
  jq -n \
    --arg goal "$EPIC_GOAL" \
    --argjson in_scope "$in_scope_json" \
    --argjson out_scope "$out_scope_json" \
    --argjson deliverables "$deliverables_json" \
    --arg directory "$directory" \
    --argjson acceptance "$acceptance_json" \
    '{
      epicGoal: $goal,
      inScope: $in_scope,
      outOfScope: $out_scope,
      deliverables: $deliverables,
      directory: $directory,
      acceptanceCriteria: $acceptance
    }'
}

# Select agents based on task description
select_agents() {
  local description="$1"
  local loop3=()
  local loop2=("reviewer" "tester")

  # Loop 3 implementers
  if echo "$description" | grep -iq "api\|backend\|server"; then
    loop3+=("backend-dev")
  fi

  if echo "$description" | grep -iq "frontend\|react\|vue\|ui"; then
    loop3+=("react-frontend-engineer")
  fi

  if echo "$description" | grep -iq "mobile\|ios\|android"; then
    loop3+=("mobile-dev")
  fi

  if echo "$description" | grep -iq "infrastructure\|deploy\|devops\|docker\|k8s"; then
    loop3+=("devops-engineer")
  fi

  if echo "$description" | grep -iq "npm\|package\|library"; then
    loop3+=("npm-package-specialist")
  fi

  if echo "$description" | grep -iq "research\|analyze\|investigate"; then
    loop3+=("researcher")
  fi

  # Default implementer
  if [ ${#loop3[@]} -eq 0 ]; then
    loop3+=("backend-dev" "researcher")
  fi

  # Loop 2 validators (adaptive scaling)
  # Standard: 3-5 files → add architect, security
  loop2+=("architect" "security-specialist")

  # Complex/Enterprise: >5 files → add code-analyzer
  if echo "$description" | grep -iq "large\|complex\|enterprise"; then
    loop2+=("code-analyzer")
  fi

  # Build JSON arrays
  local loop3_json=$(printf '%s\n' "${loop3[@]}" | jq -R . | jq -s .)
  local loop2_json=$(printf '%s\n' "${loop2[@]}" | jq -R . | jq -s .)

  jq -n \
    --argjson loop3 "$loop3_json" \
    --argjson loop2 "$loop2_json" \
    '{
      loop3: $loop3,
      loop2: $loop2
    }'
}

# Get thresholds based on mode
get_thresholds() {
  local mode="$1"

  case "$mode" in
    mvp)
      echo '{"gate": 0.70, "consensus": 0.80, "maxIterations": 5}'
      ;;
    enterprise)
      echo '{"gate": 0.85, "consensus": 0.95, "maxIterations": 15}'
      ;;
    *)
      echo '{"gate": 0.75, "consensus": 0.90, "maxIterations": 10}'
      ;;
  esac
}

# Generate config
SCOPE_JSON=$(extract_scope "$TASK_DESCRIPTION")
AGENTS_JSON=$(select_agents "$TASK_DESCRIPTION")
THRESHOLDS_JSON=$(get_thresholds "$MODE")
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

CONFIG_JSON=$(jq -n \
  --arg task_id "$TASK_ID" \
  --arg description "$TASK_DESCRIPTION" \
  --arg mode "$MODE" \
  --argjson scope "$SCOPE_JSON" \
  --argjson agents "$AGENTS_JSON" \
  --argjson thresholds "$THRESHOLDS_JSON" \
  --arg created "$TIMESTAMP" \
  '{
    taskId: $task_id,
    taskDescription: $description,
    mode: $mode,
    spawnMode: "task",
    scope: $scope,
    agents: $agents,
    thresholds: $thresholds,
    createdAt: $created
  }')

# Write config file
echo "$CONFIG_JSON" | jq . > "$CONFIG_FILE"

# Validate JSON
if ! jq empty "$CONFIG_FILE" 2>/dev/null; then
  echo "❌ Failed to create valid JSON config" >&2
  rm -f "$CONFIG_FILE"
  exit 1
fi

# Success
echo "✅ Config initialized: $CONFIG_FILE" >&2
echo "$CONFIG_FILE"
