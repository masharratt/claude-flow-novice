#!/bin/bash

##############################################################################
# ⚠️  DEPRECATED - This bash script is deprecated
#
# Deprecation Date: 2025-11-20
# Removal Date: 2026-02-20 (90 days)
# Replacement: coordination-wrapper.js
#
# This script will be removed in 90 days. Please migrate to TypeScript.
#
# Migration Guide: See docs/BASH_DEPRECATION_NOTICE.md
# TypeScript Benefits:
#   - Type safety (zero runtime type errors)
#   - 90%+ test coverage
#   - Better performance
#   - Comprehensive documentation
#
# Automatic Migration:
#   Set USE_TYPESCRIPT=true to use TypeScript implementation automatically
#
##############################################################################

set -euo pipefail

TASK_ID="web-portal-skills-loop3"
AGENT_ID="tester"
CONTEXT="Relaunch Loop 3: Complete missing 5/8 test cases"

# Enter waiting mode
./.claude/skills/cfn-redis-coordination/invoke-waiting-mode.sh enter \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --context "$CONTEXT"

# Signal task details via Redis
redis-cli set "swarm:${TASK_ID}:details" "$CONTEXT"

# TODO: Actual agent spawning logic would be here
npx claude-flow-novice spawn-agent tester \
  --task "Complete web portal skills test suite" \
  --context "$CONTEXT" \
  --skills cfn-loop-validation

# Report completion and confidence
./.claude/skills/cfn-redis-coordination/invoke-waiting-mode.sh report \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --confidence 0.90 \
  --iteration 1

