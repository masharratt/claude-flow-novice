#!/bin/bash
set -e

QS=".claude/skills/cfn-ace-system/query-contexts.sh"
PASS=0
FAIL=0

echo "=== ACE Context Query Integration Tests ==="
echo ""

# Test 1
echo "Test 1: Frontend domain detection"
R=$(bash "$QS" "Build React" --limit 2 --format json)
D=$(echo "$R" | jq -r '.query.domains')
if [ "$D" = "frontend" ]; then
  echo "✓ Frontend detected"
  ((PASS++))
else
  echo "✗ Expected frontend, got: $D"
  ((FAIL++))
fi

# Test 2
echo "Test 2: Multi-domain detection"
R2=$(bash "$QS" "JWT auth with React and PostgreSQL" --limit 3 --format json)
D2=$(echo "$R2" | jq -r '.query.domains')
if echo "$D2" | grep -qE "(backend|security|frontend)"; then
  echo "✓ Multi-domain detected: $D2"
  ((PASS++))
else
  echo "✗ Expected backend/security/frontend, got: $D2"
  ((FAIL++))
fi

# Test 3
echo "Test 3: Results returned"
C=$(echo "$R" | jq -r '.results.count')
if [ "$C" -gt 0 ]; then
  echo "✓ Contexts returned: $C"
  ((PASS++))
else
  echo "✗ No results"
  ((FAIL++))
fi

echo ""
echo "=== Summary: $PASS passed, $FAIL failed ==="
[ $FAIL -eq 0 ] && exit 0 || exit 1
