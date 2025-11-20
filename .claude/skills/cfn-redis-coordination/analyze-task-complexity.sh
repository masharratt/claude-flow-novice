#!/usr/bin/env bash

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

##############################################################################
# Task Complexity Analyzer
#
# Purpose: Deterministically analyze task complexity and determine optimal
#          number of Loop 3 agents needed.
#
# Usage:
#   ./analyze-task-complexity.sh --task "Build React dashboard" [--difficulty auto]
#
# Output (JSON):
#   {
#     "complexity_score": 7.5,
#     "difficulty": "standard",
#     "domains": ["frontend", "backend"],
#     "suggested_agents": {
#       "loop3_count": 3,
#       "loop2_count": 4
#     },
#     "reasoning": "Multi-domain task with moderate scope"
#   }
##############################################################################

set -euo pipefail

# Configuration
TASK_DESCRIPTION=""
DIFFICULTY="auto"  # auto | simple | standard | complex | enterprise

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --task)
      TASK_DESCRIPTION="$2"
      shift 2
      ;;
    --difficulty)
      DIFFICULTY="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

if [ -z "$TASK_DESCRIPTION" ]; then
  echo "Error: --task required" >&2
  exit 1
fi

##############################################################################
# Complexity Scoring Algorithm
##############################################################################

TASK_LOWER=$(echo "$TASK_DESCRIPTION" | tr '[:upper:]' '[:lower:]')
COMPLEXITY_SCORE=0
DETECTED_DOMAINS=()
REASONING=""

# 1. Word Count (longer = more complex)
WORD_COUNT=$(echo "$TASK_DESCRIPTION" | wc -w)
if [ "$WORD_COUNT" -lt 5 ]; then
  WORD_SCORE=1
elif [ "$WORD_COUNT" -lt 10 ]; then
  WORD_SCORE=2
elif [ "$WORD_COUNT" -lt 20 ]; then
  WORD_SCORE=3
else
  WORD_SCORE=4
fi
COMPLEXITY_SCORE=$((COMPLEXITY_SCORE + WORD_SCORE))

# 2. Domain Detection (multi-domain = more complex)
DOMAIN_COUNT=0

if [[ "$TASK_LOWER" =~ react|frontend|ui|component|dashboard ]]; then
  DETECTED_DOMAINS+=("frontend")
  DOMAIN_COUNT=$((DOMAIN_COUNT + 1))
fi

if [[ "$TASK_LOWER" =~ api|backend|server|endpoint|rest|graphql ]]; then
  DETECTED_DOMAINS+=("backend")
  DOMAIN_COUNT=$((DOMAIN_COUNT + 1))
fi

if [[ "$TASK_LOWER" =~ database|db|sql|postgres|mongo|redis ]]; then
  DETECTED_DOMAINS+=("database")
  DOMAIN_COUNT=$((DOMAIN_COUNT + 1))
fi

if [[ "$TASK_LOWER" =~ deploy|infra|docker|k8s|kubernetes|aws|cloud ]]; then
  DETECTED_DOMAINS+=("infrastructure")
  DOMAIN_COUNT=$((DOMAIN_COUNT + 1))
fi

if [[ "$TASK_LOWER" =~ auth|security|encrypt|permission|rbac ]]; then
  DETECTED_DOMAINS+=("security")
  DOMAIN_COUNT=$((DOMAIN_COUNT + 1))
fi

if [[ "$TASK_LOWER" =~ test|qa|validation|coverage ]]; then
  DETECTED_DOMAINS+=("testing")
  DOMAIN_COUNT=$((DOMAIN_COUNT + 1))
fi

if [[ "$TASK_LOWER" =~ architect|design|pattern|system ]]; then
  DETECTED_DOMAINS+=("architecture")
  DOMAIN_COUNT=$((DOMAIN_COUNT + 1))
fi

if [[ "$TASK_LOWER" =~ rust|cargo|tokio ]]; then
  DETECTED_DOMAINS+=("rust")
  DOMAIN_COUNT=$((DOMAIN_COUNT + 1))
fi

# Domain score: 2 points per domain
DOMAIN_SCORE=$((DOMAIN_COUNT * 2))
COMPLEXITY_SCORE=$((COMPLEXITY_SCORE + DOMAIN_SCORE))

# 3. Explicit Scope Indicators
if [[ "$TASK_LOWER" =~ simple|quick|small|basic|minimal|mvp ]]; then
  SCOPE_MODIFIER=-2
  SCOPE_LABEL="reduced (MVP scope detected)"
elif [[ "$TASK_LOWER" =~ production|enterprise|scalable|robust|complete|full ]]; then
  SCOPE_MODIFIER=3
  SCOPE_LABEL="increased (enterprise scope detected)"
elif [[ "$TASK_LOWER" =~ prototype|poc|proof.of.concept ]]; then
  SCOPE_MODIFIER=-1
  SCOPE_LABEL="slightly reduced (prototype scope)"
else
  SCOPE_MODIFIER=0
  SCOPE_LABEL="standard"
fi
COMPLEXITY_SCORE=$((COMPLEXITY_SCORE + SCOPE_MODIFIER))

# 4. Feature Counting (and, with, includes, etc.)
FEATURE_COUNT=0
if [[ "$TASK_LOWER" =~ " and " ]]; then
  FEATURE_COUNT=$((FEATURE_COUNT + 1))
fi
if [[ "$TASK_LOWER" =~ " with " ]]; then
  FEATURE_COUNT=$((FEATURE_COUNT + 1))
fi
if [[ "$TASK_LOWER" =~ " including " ]]; then
  FEATURE_COUNT=$((FEATURE_COUNT + 1))
fi

FEATURE_SCORE=$((FEATURE_COUNT))
COMPLEXITY_SCORE=$((COMPLEXITY_SCORE + FEATURE_SCORE))

# 5. Integration Keywords (increases complexity)
INTEGRATION_COUNT=0
if [[ "$TASK_LOWER" =~ integrat|connect|sync|webhook ]]; then
  INTEGRATION_COUNT=$((INTEGRATION_COUNT + 1))
fi
if [[ "$TASK_LOWER" =~ third.party|external|api ]]; then
  INTEGRATION_COUNT=$((INTEGRATION_COUNT + 1))
fi

INTEGRATION_SCORE=$((INTEGRATION_COUNT))
COMPLEXITY_SCORE=$((COMPLEXITY_SCORE + INTEGRATION_SCORE))

##############################################################################
# Difficulty Classification
##############################################################################

if [ "$DIFFICULTY" = "auto" ]; then
  if [ "$COMPLEXITY_SCORE" -le 3 ]; then
    DIFFICULTY="simple"
  elif [ "$COMPLEXITY_SCORE" -le 7 ]; then
    DIFFICULTY="standard"
  elif [ "$COMPLEXITY_SCORE" -le 12 ]; then
    DIFFICULTY="complex"
  else
    DIFFICULTY="enterprise"
  fi
fi

##############################################################################
# Agent Count Calculation
##############################################################################

case "$DIFFICULTY" in
  simple)
    # MVP/Simple: 1-2 Loop 3 agents
    BASE_LOOP3=1
    BASE_LOOP2=2
    REASONING="Simple task with minimal scope"
    ;;
  standard)
    # Standard: 2-3 Loop 3 agents
    BASE_LOOP3=2
    BASE_LOOP2=3
    REASONING="Standard task with moderate complexity"
    ;;
  complex)
    # Complex: 3-5 Loop 3 agents
    BASE_LOOP3=3
    BASE_LOOP2=4
    REASONING="Complex task with multiple domains"
    ;;
  enterprise)
    # Enterprise: 5-8 Loop 3 agents
    BASE_LOOP3=5
    BASE_LOOP2=5
    REASONING="Enterprise-grade task with high complexity"
    ;;
  *)
    echo "Error: Invalid difficulty: $DIFFICULTY" >&2
    exit 1
    ;;
esac

# Scale by domain count (1 extra agent per additional domain beyond 2)
if [ "$DOMAIN_COUNT" -gt 2 ]; then
  EXTRA_AGENTS=$((DOMAIN_COUNT - 2))
  LOOP3_COUNT=$((BASE_LOOP3 + EXTRA_AGENTS))
else
  LOOP3_COUNT=$BASE_LOOP3
fi

# Cap at reasonable limits
if [ "$LOOP3_COUNT" -gt 8 ]; then
  LOOP3_COUNT=8
fi

# Loop 2 scales with Loop 3 (but slower: +1 validator per 2 implementers)
LOOP2_COUNT=$((BASE_LOOP2 + (LOOP3_COUNT - BASE_LOOP3) / 2))
if [ "$LOOP2_COUNT" -gt 6 ]; then
  LOOP2_COUNT=6
fi

# Ensure minimum validators
if [ "$LOOP2_COUNT" -lt 2 ]; then
  LOOP2_COUNT=2
fi

##############################################################################
# Build Reasoning String
##############################################################################

REASONING_DETAILS="$REASONING (complexity score: $COMPLEXITY_SCORE, domains: $DOMAIN_COUNT, scope: $SCOPE_LABEL)"

##############################################################################
# Output JSON
##############################################################################

# Convert array to JSON array
DOMAINS_JSON=$(printf '%s\n' "${DETECTED_DOMAINS[@]}" | jq -R . | jq -s .)

jq -nc \
  --arg complexity "$COMPLEXITY_SCORE" \
  --arg difficulty "$DIFFICULTY" \
  --argjson domains "$DOMAINS_JSON" \
  --arg loop3 "$LOOP3_COUNT" \
  --arg loop2 "$LOOP2_COUNT" \
  --arg reasoning "$REASONING_DETAILS" \
  --arg word_count "$WORD_COUNT" \
  --arg domain_count "$DOMAIN_COUNT" \
  --arg feature_count "$FEATURE_COUNT" \
  '{
    complexity_score: ($complexity | tonumber),
    difficulty: $difficulty,
    domains: $domains,
    suggested_agents: {
      loop3_count: ($loop3 | tonumber),
      loop2_count: ($loop2 | tonumber)
    },
    reasoning: $reasoning,
    analysis: {
      word_count: ($word_count | tonumber),
      domain_count: ($domain_count | tonumber),
      feature_count: ($feature_count | tonumber)
    }
  }'
