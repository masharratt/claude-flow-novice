#!/usr/bin/env bash
# Task Decomposition for Complex Operations
# Breaks down complex tasks into smaller, tool-budget-efficient subtasks

set -euo pipefail

# Default values
DEFAULT_TOOL_BUDGET=10
DEFAULT_COMPLEXITY="medium"

# Where generated output goes.
#
# `.artifacts/<area>/` is the CFN convention for per-project generated output
# (cfn-edit-safety writes .artifacts/feedback, cfn-memory-persistence writes
# .artifacts/memory, cfn-test-framework writes .artifacts/analytics), and
# `.artifacts/` is gitignored, which is correct for ephemeral decomposition
# JSON and agent prompts.
#
# The anchor is CLAUDE_PROJECT_DIR (the project Claude Code was started in),
# falling back to cwd when this script is run standalone. It is deliberately
# NOT $HOME (this is per-project output, not shared CFN data) and NOT derived
# from BASH_SOURCE (that resolves into the CFN source tree, which is shared by
# every project via the reverse symlinks).
#
# Nothing is ever written under .claude/skills/: that tree is CFN source.
ARTIFACTS_DIR="${CLAUDE_PROJECT_DIR:-$PWD}/.artifacts/task-decomposition"
PROMPTS_DIR="$ARTIFACTS_DIR/prompts"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to show usage
show_help() {
    cat << EOF
Usage: $0 [OPTIONS] [TASK_ID] [TASK_DESCRIPTION] [TOOL_BUDGET] [COMPLEXITY]

Positional arguments:
  TASK_ID          Task identifier
  TASK_DESCRIPTION Task description
  TOOL_BUDGET      Tool budget per agent (default: $DEFAULT_TOOL_BUDGET)
  COMPLEXITY       Complexity level: low, medium, high (default: $DEFAULT_COMPLEXITY)

Named arguments:
  --task-id=ID           Task identifier
  --description=TEXT     Task description
  --tool-budget=N        Tool budget per agent (default: $DEFAULT_TOOL_BUDGET)
  --complexity=LEVEL     Complexity level: low, medium, high (default: $DEFAULT_COMPLEXITY)
  --help, -h             Show this help message

Examples:
  # Positional arguments
  $0 task123 "Fix TypeScript errors" 15 high

  # Named arguments
  $0 --task-id=task123 --description="Fix TypeScript errors" --tool-budget=15 --complexity=high

  # Mixed (named takes precedence)
  $0 task123 "Fix TypeScript errors" --complexity=high
EOF
}

# Function to parse arguments
parse_arguments() {
    TASK_ID=""
    TASK_DESCRIPTION=""
    TOOL_BUDGET="$DEFAULT_TOOL_BUDGET"
    COMPLEXITY_THRESHOLD="$DEFAULT_COMPLEXITY"

    # Check for help flag
    for arg in "$@"; do
        case $arg in
            --help|-h)
                show_help
                exit 0
                ;;
        esac
    done

    # Parse named arguments
    local named_args=()
    local positional_args=()
    
    for arg in "$@"; do
        case $arg in
            --task-id=*)
                TASK_ID="${arg#*=}"
                named_args+=("$arg")
                ;;
            --description=*)
                TASK_DESCRIPTION="${arg#*=}"
                named_args+=("$arg")
                ;;
            --tool-budget=*)
                TOOL_BUDGET="${arg#*=}"
                named_args+=("$arg")
                ;;
            --complexity=*)
                COMPLEXITY_THRESHOLD="${arg#*=}"
                named_args+=("$arg")
                ;;
            *)
                positional_args+=("$arg")
                ;;
        esac
    done

    # If no named arguments were used, parse positional arguments
    if [ ${#named_args[@]} -eq 0 ]; then
        case ${#positional_args[@]} in
            0)
                echo -e "${RED}Error: Missing required arguments${NC}"
                show_help
                exit 1
                ;;
            1)
                TASK_ID="${positional_args[0]}"
                echo -e "${RED}Error: Missing TASK_DESCRIPTION${NC}"
                show_help
                exit 1
                ;;
            2)
                TASK_ID="${positional_args[0]}"
                TASK_DESCRIPTION="${positional_args[1]}"
                ;;
            3)
                TASK_ID="${positional_args[0]}"
                TASK_DESCRIPTION="${positional_args[1]}"
                TOOL_BUDGET="${positional_args[2]}"
                ;;
            4|*)
                TASK_ID="${positional_args[0]}"
                TASK_DESCRIPTION="${positional_args[1]}"
                TOOL_BUDGET="${positional_args[2]}"
                COMPLEXITY_THRESHOLD="${positional_args[3]}"
                ;;
        esac
    else
        # Named arguments used - validate required ones
        if [ -z "$TASK_ID" ]; then
            echo -e "${RED}Error: --task-id is required${NC}"
            show_help
            exit 1
        fi
        if [ -z "$TASK_DESCRIPTION" ]; then
            echo -e "${RED}Error: --description is required${NC}"
            show_help
            exit 1
        fi
    fi

    # Validate values
    if ! [[ "$TOOL_BUDGET" =~ ^[0-9]+$ ]]; then
        echo -e "${RED}Error: TOOL_BUDGET must be a number${NC}"
        exit 1
    fi

    case "$COMPLEXITY_THRESHOLD" in
        low|medium|high)
            ;;
        *)
            echo -e "${RED}Error: COMPLEXITY must be one of: low, medium, high${NC}"
            exit 1
            ;;
    esac
}

# Function to analyze task complexity
analyze_task_complexity() {
    local description="$1"
    local complexity_score=0

    # File operation indicators
    if echo "$description" | grep -qiE "(fix|create|modify|update|delete|write).*file"; then
        ((complexity_score += 3))
    fi

    # Directory exploration indicators
    if echo "$description" | grep -qiE "(explore|find|search|scan|directory|folder)"; then
        ((complexity_score += 2))
    fi

    # Multiple component indicators
    if echo "$description" | grep -qiE "(multiple|batch|all|every|comprehensive)"; then
        ((complexity_score += 4))
    fi

    # TypeScript/Complex file indicators
    if echo "$description" | grep -qiE "(typescript|tsx|interface|type|complex)"; then
        ((complexity_score += 2))
    fi

    # Dependency analysis indicators
    if echo "$description" | grep -qiE "(dependency|import|require|module)"; then
        ((complexity_score += 2))
    fi

    echo "$complexity_score"
}

# Function to decompose TypeScript error fixing tasks
decompose_typescript_task() {
    local task_id="$1"
    local description="$2"
    local output_file="$ARTIFACTS_DIR/${task_id}-subtasks.json"

    mkdir -p "$ARTIFACTS_DIR"

    echo -e "${YELLOW}Decomposing TypeScript task...${NC}" >&2

    # Create subtasks
    cat > "$output_file" << EOF
{
  "task_id": "$task_id",
  "original_task": "$description",
  "decomposition_strategy": "typescript-error-fixing",
  "subtasks": [
    {
      "subtask_id": "${task_id}-recon",
      "title": "Directory Reconnaissance",
      "description": "Explore project structure and identify TypeScript files needing fixes",
      "agent_type": "researcher",
      "tool_budget": 5,
      "expected_tools": ["find", "grep", "Read", "Glob"],
      "deliverables": ["file-list.txt", "error-classification.json"],
      "estimated_duration": "5-10 minutes"
    },
    {
      "subtask_id": "${task_id}-pattern",
      "title": "Error Pattern Analysis",
      "description": "Analyze TypeScript errors and identify common patterns",
      "agent_type": "analyst",
      "tool_budget": 8,
      "expected_tools": ["Read", "Grep", "Bash"],
      "deliverables": ["error-patterns.json", "fix-strategy.md"],
      "estimated_duration": "10-15 minutes"
    },
    {
      "subtask_id": "${task_id}-fix",
      "title": "File-by-File Fixes",
      "description": "Fix TypeScript errors in identified files using patterns",
      "agent_type": "backend-developer",
      "tool_budget": 15,
      "expected_tools": ["Read", "Edit", "Write", "Bash"],
      "deliverables": ["fixed-files/", "fix-summary.json"],
      "estimated_duration": "20-30 minutes",
      "batch_processing": {
        "max_files_per_batch": 3,
        "batches_total": 5
      }
    },
    {
      "subtask_id": "${task_id}-validate",
      "title": "Validation and Testing",
      "description": "Validate fixes and run TypeScript compilation",
      "agent_type": "tester",
      "tool_budget": 10,
      "expected_tools": ["Bash", "Read", "Write"],
      "deliverables": ["validation-report.json", "compilation-results.txt"],
      "estimated_duration": "10-15 minutes"
    }
  ],
  "coordination": {
    "dependency_order": ["recon", "pattern", "fix", "validate"],
    "redis_context_keys": {
      "recon": "${task_id}:recon:results",
      "pattern": "${task_id}:pattern:results",
      "fix": "${task_id}:fix:results",
      "validate": "${task_id}:validate:results"
    }
  }
}
EOF

    echo -e "${GREEN}✓ Task decomposition created: $output_file${NC}" >&2
    echo "$output_file"
}

# Function to decompose file exploration tasks
decompose_exploration_task() {
    local task_id="$1"
    local description="$2"
    local output_file="$ARTIFACTS_DIR/${task_id}-subtasks.json"

    mkdir -p "$ARTIFACTS_DIR"

    echo -e "${YELLOW}Decomposing exploration task...${NC}" >&2

    cat > "$output_file" << EOF
{
  "task_id": "$task_id",
  "original_task": "$description",
  "decomposition_strategy": "directory-exploration",
  "subtasks": [
    {
      "subtask_id": "${task_id}-scan",
      "title": "Targeted Directory Scan",
      "description": "Scan specific directories for target files using ripgrep",
      "agent_type": "researcher",
      "tool_budget": 6,
      "expected_tools": ["Bash", "rg", "Glob", "Read"],
      "deliverables": ["target-files.txt", "directory-map.json"],
      "estimated_duration": "5-8 minutes"
    },
    {
      "subtask_id": "${task_id}-analyze",
      "title": "File Content Analysis",
      "description": "Analyze found files to understand structure and patterns",
      "agent_type": "analyst",
      "tool_budget": 8,
      "expected_tools": ["Read", "Grep", "Write"],
      "deliverables": ["file-analysis.json", "content-summary.md"],
      "estimated_duration": "8-12 minutes"
    }
  ]
}
EOF

    echo -e "${GREEN}✓ Task decomposition created: $output_file${NC}" >&2
    echo "$output_file"
}

# Function to create task-specific agent prompts
create_agent_prompts() {
    local subtasks_file="$1"
    local prompts_dir="$PROMPTS_DIR"

    mkdir -p "$prompts_dir"

    # Extract subtask information
    local task_id=$(jq -r '.task_id' "$subtasks_file")
    local strategy=$(jq -r '.decomposition_strategy' "$subtasks_file")

    # Generate prompts for each subtask
    jq -r '.subtasks[] | @base64' "$subtasks_file" | while read -r subtask_b64; do
        local subtask=$(echo "$subtask_b64" | base64 -d)
        local subtask_id=$(echo "$subtask" | jq -r '.subtask_id')
        local title=$(echo "$subtask" | jq -r '.title')
        local description=$(echo "$subtask" | jq -r '.description')
        local tool_budget=$(echo "$subtask" | jq -r '.tool_budget')
        local deliverables=$(echo "$subtask" | jq -r '.deliverables[]')

        cat > "$prompts_dir/${subtask_id}-prompt.md" << EOF
# Task: $title

## Context
You are working on subtask "${subtask_id}" of the larger task "${task_id}".

## Your Mission
$description

## Tool Budget Optimization
You have **$tool_budget tool uses** available. Use them efficiently:

### Recommended Tool Sequence:
1. **Exploration tools** (Read, Glob, Bash) - 2-3 uses
2. **Analysis tools** (Grep, Read) - 2-3 uses
3. **Implementation tools** (Edit, Write) - 3-5 uses
4. **Validation tools** (Bash, Read) - 1-2 uses

### Efficiency Tips:
- **Batch operations**: Read multiple files in one tool use when possible
- **Targeted searches**: Use specific patterns instead of broad scans
- **Early validation**: Check results after each major step
- **Combine tool uses**: Use compound commands to reduce tool count

## Expected Deliverables
$deliverables

## Success Criteria
- All deliverables created with high quality
- Tool budget not exceeded
- Results passed to next subtask via Redis

## Redis Context
- Store results in: \`${task_id}:${subtask_id}:results\`
- Use confidence scoring based on deliverable completion
- Signal completion via Redis LPUSH to \`${task_id}:${subtask_id}:done\`
EOF

        echo -e "${GREEN}✓ Created prompt for $subtask_id${NC}" >&2
    done
}

# Main execution
main() {
    # Parse arguments
    parse_arguments "$@"

    echo -e "${BLUE}🔧 CFN Loop Task Decomposition${NC}"
    echo "Task ID: $TASK_ID"
    echo "Tool Budget: $TOOL_BUDGET per agent"
    echo "Complexity: $COMPLEXITY_THRESHOLD"
    echo ""

    local complexity_score=$(analyze_task_complexity "$TASK_DESCRIPTION")
    echo -e "${YELLOW}Task Complexity Score: $complexity_score${NC}"

    local decomposition_file=""

    # Determine decomposition strategy based on task type
    if echo "$TASK_DESCRIPTION" | grep -qiE "(typescript|tsx|ts27|ts23|error|fix)"; then
        decomposition_file=$(decompose_typescript_task "$TASK_ID" "$TASK_DESCRIPTION")
    elif echo "$TASK_DESCRIPTION" | grep -qiE "(explore|find|search|scan)"; then
        decomposition_file=$(decompose_exploration_task "$TASK_ID" "$TASK_DESCRIPTION")
    else
        echo -e "${YELLOW}Using general task decomposition...${NC}"
        decomposition_file=$(decompose_typescript_task "$TASK_ID" "$TASK_DESCRIPTION")
    fi

    # Create agent prompts
    if [ -n "$decomposition_file" ] && [ -f "$decomposition_file" ]; then
        create_agent_prompts "$decomposition_file"

        echo -e "\n${GREEN}=== Task Decomposition Complete ===${NC}"
        echo -e "📄 ${BLUE}Decomposition file:${NC} $decomposition_file"
        echo -e "🤖 ${BLUE}Agent prompts:${NC} $PROMPTS_DIR/"
        echo -e "💡 ${BLUE}Strategy:${NC} Break complex task into tool-budget-efficient subtasks"

        # Store decomposition info in Redis for coordinator
        if command -v redis-cli >/dev/null 2>&1; then
            redis-cli set "${TASK_ID}:decomposition" "$(cat "$decomposition_file")" >/dev/null
            echo -e "📦 ${BLUE}Redis context stored:${NC} ${TASK_ID}:decomposition"
        fi

        return 0
    else
        echo -e "${RED}❌ Task decomposition failed${NC}"
        return 1
    fi
}

# Execute main function with all arguments
main "$@"
