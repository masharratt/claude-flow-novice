#!/bin/bash

# Task Complexity Estimator for CFN v3
# Removed set -o pipefail for compatibility

TASK_TYPE=""
DESCRIPTION=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --task-type) TASK_TYPE="$2"; shift 2 ;;
    --description) DESCRIPTION="$2"; shift 2 ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
done

if [ -z "$DESCRIPTION" ]; then
  echo "Usage: estimate-complexity.sh --task-type TYPE --description 'text'" >&2
  exit 1
fi

DESC_LOWER=$(echo "$DESCRIPTION" | tr '[:upper:]' '[:lower:]')

# Helper function to check keyword
has_keyword() {
  local keyword="$1"
  echo "$DESC_LOWER" | grep -qi "$keyword"
  return $?
}

# Factor 1: Step Count
# Count action verbs
ACTION_VERBS="implement build create add update modify refactor deploy configure setup integrate test"
STEP_COUNT=0
for verb in $ACTION_VERBS; do
  if has_keyword "$verb"; then
    ((STEP_COUNT++)) || true
  fi
done

STEP_SCORE=$((STEP_COUNT / 3))

# Factor 2: Security/Compliance
SECURITY_SCORE=0
if has_keyword "security\|authentication\|authorization\|jwt\|oauth\|rbac"; then
  ((SECURITY_SCORE++))
fi
if has_keyword "compliance\|gdpr\|hipaa\|pci\|sox"; then
  ((SECURITY_SCORE++))
fi
if has_keyword "encryption\|ssl\|tls\|certificate"; then
  ((SECURITY_SCORE++))
fi

# Factor 3: Scope
SCOPE_SCORE=0
if has_keyword "file\|files"; then
  FILE_COUNT=$(echo "$DESC_LOWER" | grep -o "file" | wc -l)
  if [ "$FILE_COUNT" -gt 5 ]; then
    SCOPE_SCORE=3
  elif [ "$FILE_COUNT" -ge 2 ]; then
    SCOPE_SCORE=2
  else
    SCOPE_SCORE=1
  fi
fi
if has_keyword "system-wide\|entire system\|all"; then
  SCOPE_SCORE=3
fi

# Factor 4: Dependencies
DEPENDENCY_SCORE=0
if has_keyword "api\|external service\|third-party"; then
  ((DEPENDENCY_SCORE++))
fi
if has_keyword "database\|sql\|schema\|migration"; then
  ((DEPENDENCY_SCORE++))
fi
if has_keyword "microservice\|services\|distributed"; then
  ((DEPENDENCY_SCORE++))
fi

# Factor 5: Tech Stack
TECH_SCORE=0
if has_keyword "new technology\|learning\|unfamiliar"; then
  ((TECH_SCORE++))
fi
if has_keyword "experimental\|cutting-edge\|beta"; then
  TECH_SCORE=2
fi
if has_keyword "legacy\|migration\|refactor"; then
  ((TECH_SCORE++))
fi

# Calculate total score
TOTAL_SCORE=$((STEP_SCORE + SECURITY_SCORE + SCOPE_SCORE + DEPENDENCY_SCORE + TECH_SCORE))

# Determine complexity and iterations
if [ "$TOTAL_SCORE" -le 2 ]; then
  COMPLEXITY="low"
  ESTIMATED_ITERATIONS=2
  CONFIDENCE=0.80
elif [ "$TOTAL_SCORE" -le 4 ]; then
  COMPLEXITY="medium"
  ESTIMATED_ITERATIONS=$((TOTAL_SCORE))
  CONFIDENCE=0.75
else
  COMPLEXITY="high"
  ESTIMATED_ITERATIONS=$((TOTAL_SCORE))
  if [ "$ESTIMATED_ITERATIONS" -gt 7 ]; then
    ESTIMATED_ITERATIONS=7
  fi
  CONFIDENCE=0.70
fi

# Build reasoning
REASONING="Complexity: $COMPLEXITY"
if [ "$SECURITY_SCORE" -gt 0 ]; then
  REASONING="$REASONING. Security requirements detected ($SECURITY_SCORE factors)."
fi
if [ "$SCOPE_SCORE" -ge 2 ]; then
  REASONING="$REASONING. Multi-file or system-wide scope."
fi
if [ "$DEPENDENCY_SCORE" -gt 0 ]; then
  REASONING="$REASONING. External dependencies ($DEPENDENCY_SCORE)."
fi

# Build JSON output
cat <<EOF
{
  "complexity": "$COMPLEXITY",
  "estimated_iterations": $ESTIMATED_ITERATIONS,
  "confidence": $CONFIDENCE,
  "factors": {
    "step_count": $STEP_COUNT,
    "security": $SECURITY_SCORE,
    "scope": $SCOPE_SCORE,
    "dependencies": $DEPENDENCY_SCORE,
    "tech_stack": $TECH_SCORE,
    "total": $TOTAL_SCORE
  },
  "reasoning": "$REASONING"
}
EOF