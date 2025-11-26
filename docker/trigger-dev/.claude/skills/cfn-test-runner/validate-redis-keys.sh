#!/bin/bash
# Redis Key Validator
# Version: 1.0.0
# Purpose: Validate Redis key consistency across codebase

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

VIOLATIONS=0
WARNINGS=0

echo -e "${GREEN}=========================================="
echo "Redis Key Consistency Validator"
echo -e "==========================================${NC}"
echo ""

# Standard patterns (from audit)
VALID_PATTERNS=(
  "swarm:\${TASK_ID}:\${AGENT_ID}:done"
  "swarm:\${TASK_ID}:\${AGENT_ID}:confidence"
  "swarm:\${TASK_ID}:\${AGENT_ID}:result"
  "swarm:\${TASK_ID}:decision"
  "swarm:\${TASK_ID}:gate-passed"
  "swarm:\${TASK_ID}:gate-failed"
  "swarm:\${TASK_ID}:loop2:consensus"
  "swarm:metrics:decisions:*"
)

# Anti-patterns (non-standard)
ANTI_PATTERNS=(
  "swarm:\${TASK_ID}:\${AGENT_ID}:decision"  # Should be task-level
)

echo -e "${BLUE}[1/4] Checking for standard pattern usage...${NC}"

# Find all redis-cli commands
REDIS_FILES=$(grep -rl "redis-cli" "$PROJECT_ROOT/.claude" "$PROJECT_ROOT/tests" 2>/dev/null || true)

for file in $REDIS_FILES; do
  # Skip backup files
  if [[ "$file" =~ \.backup ]]; then
    continue
  fi
  
  # Check for anti-patterns
  for anti_pattern in "${ANTI_PATTERNS[@]}"; do
    # Convert pattern to grep regex
    grep_pattern=$(echo "$anti_pattern" | sed 's/\$/\\$/g' | sed 's/{[^}]*}/.*/g')
    
    if grep -qE "$grep_pattern" "$file" 2>/dev/null; then
      echo -e "${YELLOW}⚠️  WARNING: Non-standard pattern in $file${NC}"
      echo "   Found: $anti_pattern"
      ((WARNINGS++))
    fi
  done
done

echo ""
echo -e "${BLUE}[2/4] Validating Product Owner decision keys...${NC}"

# Check execute-decision.sh uses correct pattern
PO_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-product-owner-decision/execute-decision.sh"
if [ -f "$PO_SCRIPT" ]; then
  # Should have: SET "swarm:${TASK_ID}:decision"
  if grep -q 'SET "swarm:${TASK_ID}:decision"' "$PO_SCRIPT"; then
    echo -e "${GREEN}✅ Product Owner uses standard decision key${NC}"
  else
    echo -e "${RED}❌ VIOLATION: Product Owner decision key non-standard${NC}"
    ((VIOLATIONS++))
  fi
  
  # Should have TTL (EX 3600)
  if grep -q 'EX 3600' "$PO_SCRIPT"; then
    echo -e "${GREEN}✅ Product Owner decision has TTL${NC}"
  else
    echo -e "${YELLOW}⚠️  WARNING: Product Owner decision missing TTL${NC}"
    ((WARNINGS++))
  fi
else
  echo -e "${RED}❌ VIOLATION: Product Owner script not found${NC}"
  ((VIOLATIONS++))
fi

echo ""
echo -e "${BLUE}[3/4] Checking key namespace consistency...${NC}"

# Find keys NOT starting with "swarm:"
NON_SWARM_KEYS=$(grep -rh "redis-cli.*[\"']" "$PROJECT_ROOT/.claude" "$PROJECT_ROOT/tests" 2>/dev/null | \
  grep -oE '"[^"]*"' | \
  grep -v "swarm:" | \
  grep -v "complete" | \
  grep -v "^\"$" | \
  sort -u || true)

if [ -n "$NON_SWARM_KEYS" ]; then
  echo -e "${YELLOW}⚠️  WARNING: Found keys outside 'swarm:' namespace:${NC}"
  echo "$NON_SWARM_KEYS" | head -5
  ((WARNINGS++))
else
  echo -e "${GREEN}✅ All keys use 'swarm:' namespace${NC}"
fi

echo ""
echo -e "${BLUE}[4/4] Checking for missing TTLs...${NC}"

# Find SET commands without EX/EXPIRE
NO_TTL_COUNT=$(grep -rh "redis-cli.*SET" "$PROJECT_ROOT/.claude" 2>/dev/null | \
  grep -v "EX\|EXPIRE" | \
  wc -l || echo 0)

if [ "$NO_TTL_COUNT" -gt 0 ]; then
  echo -e "${YELLOW}⚠️  WARNING: $NO_TTL_COUNT SET commands without TTL${NC}"
  ((WARNINGS++))
else
  echo -e "${GREEN}✅ All SET commands have TTL${NC}"
fi

echo ""
echo -e "${GREEN}=========================================="
echo "Validation Summary"
echo -e "==========================================${NC}"
echo "Violations: $VIOLATIONS"
echo "Warnings: $WARNINGS"

if [ $VIOLATIONS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
  echo -e "${GREEN}✅ PASS: All Redis keys follow standards${NC}"
  exit 0
elif [ $VIOLATIONS -eq 0 ]; then
  echo -e "${YELLOW}⚠️  PASS WITH WARNINGS: $WARNINGS minor issues${NC}"
  exit 0
else
  echo -e "${RED}❌ FAIL: $VIOLATIONS critical violations${NC}"
  exit 1
fi
