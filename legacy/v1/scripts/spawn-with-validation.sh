#!/bin/bash

##############################################################################
# Spawn Workers with Post-Spawn Validation
#
# Wrapper script that spawns agents via spawn-workers.js and validates them
# Demonstrates Phase 5 validation hook integration pattern
##############################################################################

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Validation hook
VALIDATION_HOOK="$PROJECT_ROOT/config/hooks/post-spawn-validation.js"
SPAWN_SCRIPT="$PROJECT_ROOT/src/cli/hybrid-routing/spawn-workers.js"

# Help text
show_help() {
    cat << EOF
${BLUE}Spawn Workers with Post-Spawn Validation${NC}

Spawns agents and validates their Redis coordination setup

${YELLOW}Usage:${NC}
  $(basename "$0") "Task description" [spawn-workers.js options] [validation options]

${YELLOW}Examples:${NC}
  # Spawn 3 agents with validation
  $(basename "$0") "Build authentication system" --max-agents 3

  # Spawn with specific agent types
  $(basename "$0") "Create API docs" --agents=architect,coder,api-docs

  # Spawn with coordinator and validate
  $(basename "$0") "CFN Loop task" --max-agents 5 --validate-coordinator

${YELLOW}Validation Options:${NC}
  --no-validation          Skip post-spawn validation
  --validate-coordinator   Validate coordinator agent too
  --validation-log FILE    Write validation results to file
  --validation-json        Output validation as JSON

${YELLOW}All other options:${NC}
  Passed directly to spawn-workers.js (see spawn-workers.js --help)
EOF
}

# Parse arguments
TASK=""
SKIP_VALIDATION=false
VALIDATE_COORDINATOR=false
VALIDATION_LOG=""
VALIDATION_JSON=false
SPAWN_ARGS=()

while [[ $# -gt 0 ]]; do
    case $1 in
        --help|-h)
            show_help
            exit 0
            ;;
        --no-validation)
            SKIP_VALIDATION=true
            shift
            ;;
        --validate-coordinator)
            VALIDATE_COORDINATOR=true
            shift
            ;;
        --validation-log)
            VALIDATION_LOG="$2"
            shift 2
            ;;
        --validation-json)
            VALIDATION_JSON=true
            shift
            ;;
        *)
            if [ -z "$TASK" ] && [[ ! "$1" =~ ^-- ]]; then
                TASK="$1"
            else
                SPAWN_ARGS+=("$1")
            fi
            shift
            ;;
    esac
done

if [ -z "$TASK" ]; then
    echo -e "${RED}❌ Error: Task description required${NC}" >&2
    show_help
    exit 1
fi

# Check if validation hook exists
if [ ! -f "$VALIDATION_HOOK" ]; then
    echo -e "${YELLOW}⚠️  Validation hook not found: $VALIDATION_HOOK${NC}" >&2
    echo -e "${YELLOW}   Skipping validation${NC}" >&2
    SKIP_VALIDATION=true
fi

# Check if spawn script exists
if [ ! -f "$SPAWN_SCRIPT" ]; then
    echo -e "${RED}❌ Spawn script not found: $SPAWN_SCRIPT${NC}" >&2
    exit 1
fi

# Print configuration
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Spawn Workers with Validation                           ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Task:${NC} $TASK"
echo -e "${BLUE}Validation:${NC} $([ "$SKIP_VALIDATION" = true ] && echo "Disabled" || echo "Enabled")"
echo ""

# Spawn agents
echo -e "${CYAN}🚀 Spawning agents...${NC}"
echo ""

# Capture agent IDs from spawn output
SPAWN_OUTPUT=$(node "$SPAWN_SCRIPT" "$TASK" "${SPAWN_ARGS[@]}" 2>&1 | tee /dev/tty)
SPAWN_EXIT_CODE=${PIPESTATUS[0]}

if [ $SPAWN_EXIT_CODE -ne 0 ]; then
    echo -e "\n${RED}❌ Agent spawning failed with exit code $SPAWN_EXIT_CODE${NC}" >&2
    exit $SPAWN_EXIT_CODE
fi

echo ""

# Skip validation if requested
if [ "$SKIP_VALIDATION" = true ]; then
    echo -e "${YELLOW}⚠️  Validation skipped${NC}"
    exit 0
fi

# Extract agent IDs from spawn output
# Pattern: "Worker {id} [{type}]: Spawning" or similar
AGENT_IDS=()

while IFS= read -r line; do
    if echo "$line" | grep -qE "Worker [0-9]+ \["; then
        # Extract worker ID and agent type
        WORKER_ID=$(echo "$line" | grep -oE "Worker [0-9]+" | grep -oE "[0-9]+")
        AGENT_TYPE=$(echo "$line" | grep -oE "\[[a-z-]+\]" | tr -d '[]' | head -1)

        if [ -n "$WORKER_ID" ] && [ -n "$AGENT_TYPE" ]; then
            AGENT_ID="${AGENT_TYPE}-${WORKER_ID}"
            AGENT_IDS+=("$AGENT_ID")
        fi
    fi
done <<< "$SPAWN_OUTPUT"

# Check if we found any agent IDs
if [ ${#AGENT_IDS[@]} -eq 0 ]; then
    echo -e "${YELLOW}⚠️  No agent IDs detected in spawn output${NC}"
    echo -e "${YELLOW}   Cannot perform validation${NC}"
    exit 0
fi

echo -e "${CYAN}📋 Detected ${#AGENT_IDS[@]} agent(s): ${AGENT_IDS[*]}${NC}"
echo ""

# Validate each agent
echo -e "${CYAN}✓ Validating agents...${NC}"
echo ""

VALIDATION_FAILED=0
VALIDATION_WARNINGS=0

for AGENT_ID in "${AGENT_IDS[@]}"; do
    echo -e "${BLUE}Validating: $AGENT_ID${NC}"

    # Build validation command
    VALIDATION_CMD="node $VALIDATION_HOOK $AGENT_ID"

    # Add JSON format if requested
    if [ "$VALIDATION_JSON" = true ]; then
        VALIDATION_CMD="$VALIDATION_CMD --format json"
    else
        VALIDATION_CMD="$VALIDATION_CMD --format text"
    fi

    # Add log file if specified
    if [ -n "$VALIDATION_LOG" ]; then
        VALIDATION_CMD="$VALIDATION_CMD --log-file $VALIDATION_LOG"
    fi

    # Run validation
    if eval "$VALIDATION_CMD"; then
        echo -e "${GREEN}✅ $AGENT_ID validated successfully${NC}"
    else
        EXIT_CODE=$?
        if [ $EXIT_CODE -eq 1 ]; then
            echo -e "${RED}❌ $AGENT_ID validation failed${NC}"
            VALIDATION_FAILED=$((VALIDATION_FAILED + 1))
        else
            echo -e "${YELLOW}⚠️  $AGENT_ID validation warnings${NC}"
            VALIDATION_WARNINGS=$((VALIDATION_WARNINGS + 1))
        fi
    fi

    echo ""
done

# Validate coordinator if requested
if [ "$VALIDATE_COORDINATOR" = true ]; then
    echo -e "${BLUE}Validating: coordinator${NC}"

    # Coordinator validation (no specific ID needed)
    COORD_CMD="node $VALIDATION_HOOK coordinator-hybrid"

    if [ "$VALIDATION_JSON" = true ]; then
        COORD_CMD="$COORD_CMD --format json"
    fi

    if [ -n "$VALIDATION_LOG" ]; then
        COORD_CMD="$COORD_CMD --log-file $VALIDATION_LOG"
    fi

    if eval "$COORD_CMD"; then
        echo -e "${GREEN}✅ Coordinator validated successfully${NC}"
    else
        echo -e "${YELLOW}⚠️  Coordinator validation warnings${NC}"
        VALIDATION_WARNINGS=$((VALIDATION_WARNINGS + 1))
    fi

    echo ""
fi

# Summary
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Validation Summary                                      ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Agents Validated:${NC} ${#AGENT_IDS[@]}"
echo -e "${GREEN}Passed:${NC} $((${#AGENT_IDS[@]} - VALIDATION_FAILED - VALIDATION_WARNINGS))"
echo -e "${YELLOW}Warnings:${NC} $VALIDATION_WARNINGS"
echo -e "${RED}Failed:${NC} $VALIDATION_FAILED"
echo ""

if [ $VALIDATION_FAILED -gt 0 ]; then
    echo -e "${RED}❌ Validation completed with $VALIDATION_FAILED failure(s)${NC}"
    exit 1
elif [ $VALIDATION_WARNINGS -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Validation completed with $VALIDATION_WARNINGS warning(s)${NC}"
    exit 0
else
    echo -e "${GREEN}✅ All validations passed${NC}"
    exit 0
fi
