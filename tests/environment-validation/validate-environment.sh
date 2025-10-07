#!/bin/bash

# Environment Validation Script for CLI Coordination
# Validates /dev/shm availability, permissions, and baseline performance

set -euo pipefail

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Result tracking
RESULTS_FILE="/tmp/env-validation-results.json"
CRITICAL_ERRORS=0
WARNINGS=0

echo "========================================="
echo "CLI Coordination Environment Validation"
echo "========================================="
echo ""

# Initialize results JSON
cat > "$RESULTS_FILE" <<EOF
{
  "timestamp": "$(date -Iseconds)",
  "environment": "$(uname -a)",
  "checks": []
}
EOF

add_check() {
  local name="$1"
  local status="$2"
  local message="$3"
  local details="${4:-}"

  jq --arg name "$name" \
     --arg status "$status" \
     --arg message "$message" \
     --arg details "$details" \
     '.checks += [{name: $name, status: $status, message: $message, details: $details}]' \
     "$RESULTS_FILE" > "$RESULTS_FILE.tmp" && mv "$RESULTS_FILE.tmp" "$RESULTS_FILE"
}

# Check 1: /dev/shm exists and is mounted
echo -n "Checking /dev/shm availability... "
if [ -d /dev/shm ]; then
  echo -e "${GREEN}PASS${NC}"
  add_check "shm_exists" "PASS" "/dev/shm directory exists"
else
  echo -e "${RED}FAIL${NC}"
  add_check "shm_exists" "FAIL" "/dev/shm directory not found"
  ((CRITICAL_ERRORS++))
fi

# Check 2: /dev/shm is tmpfs
echo -n "Checking /dev/shm filesystem type... "
FS_TYPE=$(stat -f -c %T /dev/shm 2>/dev/null || echo "unknown")
if [ "$FS_TYPE" = "tmpfs" ]; then
  echo -e "${GREEN}PASS${NC}"
  add_check "shm_tmpfs" "PASS" "/dev/shm is tmpfs"
else
  echo -e "${YELLOW}WARN${NC} (found: $FS_TYPE)"
  add_check "shm_tmpfs" "WARN" "/dev/shm is not tmpfs" "$FS_TYPE"
  ((WARNINGS++))
fi

# Check 3: /dev/shm size
echo -n "Checking /dev/shm size... "
SHM_SIZE=$(df -h /dev/shm | tail -1 | awk '{print $2}')
SHM_SIZE_BYTES=$(df /dev/shm | tail -1 | awk '{print $2}')
echo "$SHM_SIZE"

if [ "$SHM_SIZE_BYTES" -ge 67108864 ]; then  # 64MB minimum
  add_check "shm_size" "PASS" "/dev/shm size adequate" "$SHM_SIZE"
else
  echo -e "${YELLOW}WARN${NC} (below 64MB)"
  add_check "shm_size" "WARN" "/dev/shm size below recommended 64MB" "$SHM_SIZE"
  ((WARNINGS++))
fi

# Check 4: Write permission test
echo -n "Checking /dev/shm write permissions... "
TEST_FILE="/dev/shm/cli-test-$$"
if echo "test" > "$TEST_FILE" 2>/dev/null; then
  rm -f "$TEST_FILE"
  echo -e "${GREEN}PASS${NC}"
  add_check "shm_write" "PASS" "/dev/shm is writable"
else
  echo -e "${RED}FAIL${NC}"
  add_check "shm_write" "FAIL" "/dev/shm write permission denied"
  ((CRITICAL_ERRORS++))
fi

# Check 5: Read permission test
echo -n "Checking /dev/shm read permissions... "
TEST_FILE="/dev/shm/cli-test-$$"
echo "test" > "$TEST_FILE" 2>/dev/null || true
if [ -r "$TEST_FILE" ] && [ "$(cat "$TEST_FILE" 2>/dev/null)" = "test" ]; then
  rm -f "$TEST_FILE"
  echo -e "${GREEN}PASS${NC}"
  add_check "shm_read" "PASS" "/dev/shm is readable"
else
  echo -e "${RED}FAIL${NC}"
  add_check "shm_read" "FAIL" "/dev/shm read permission denied"
  ((CRITICAL_ERRORS++))
fi

# Check 6: File creation/deletion speed test
echo -n "Checking /dev/shm performance (1000 file ops)... "
START=$(date +%s%N)
for i in {1..1000}; do
  echo "msg" > "/dev/shm/perf-test-$i"
  rm -f "/dev/shm/perf-test-$i"
done
END=$(date +%s%N)
DURATION_MS=$(( (END - START) / 1000000 ))
echo "${DURATION_MS}ms"

if [ "$DURATION_MS" -lt 5000 ]; then  # 5s for 1000 ops
  add_check "shm_performance" "PASS" "Performance adequate" "${DURATION_MS}ms for 1000 ops"
else
  echo -e "${YELLOW}WARN${NC} (slower than expected)"
  add_check "shm_performance" "WARN" "Performance below baseline" "${DURATION_MS}ms for 1000 ops"
  ((WARNINGS++))
fi

# Check 7: Node.js availability
echo -n "Checking Node.js availability... "
if command -v node >/dev/null 2>&1; then
  NODE_VERSION=$(node --version)
  echo -e "${GREEN}PASS${NC} ($NODE_VERSION)"
  add_check "nodejs_available" "PASS" "Node.js available" "$NODE_VERSION"
else
  echo -e "${RED}FAIL${NC}"
  add_check "nodejs_available" "FAIL" "Node.js not found"
  ((CRITICAL_ERRORS++))
fi

# Check 8: jq availability (for CLI coordination)
echo -n "Checking jq availability... "
if command -v jq >/dev/null 2>&1; then
  JQ_VERSION=$(jq --version)
  echo -e "${GREEN}PASS${NC} ($JQ_VERSION)"
  add_check "jq_available" "PASS" "jq available" "$JQ_VERSION"
else
  echo -e "${YELLOW}WARN${NC}"
  add_check "jq_available" "WARN" "jq not found (recommended for coordination)"
  ((WARNINGS++))
fi

# Summary
echo ""
echo "========================================="
echo "VALIDATION SUMMARY"
echo "========================================="
echo "Critical Errors: $CRITICAL_ERRORS"
echo "Warnings: $WARNINGS"
echo ""

# Add summary to results
jq --arg errors "$CRITICAL_ERRORS" \
   --arg warnings "$WARNINGS" \
   '.summary = {critical_errors: ($errors|tonumber), warnings: ($warnings|tonumber)}' \
   "$RESULTS_FILE" > "$RESULTS_FILE.tmp" && mv "$RESULTS_FILE.tmp" "$RESULTS_FILE"

# Determine environment readiness
if [ "$CRITICAL_ERRORS" -eq 0 ]; then
  echo -e "${GREEN}ENVIRONMENT READY${NC} for CLI coordination testing"
  jq '.summary.status = "READY"' "$RESULTS_FILE" > "$RESULTS_FILE.tmp" && mv "$RESULTS_FILE.tmp" "$RESULTS_FILE"
  echo ""
  echo "Results saved to: $RESULTS_FILE"
  exit 0
else
  echo -e "${RED}ENVIRONMENT NOT READY${NC} - critical errors must be resolved"
  jq '.summary.status = "NOT_READY"' "$RESULTS_FILE" > "$RESULTS_FILE.tmp" && mv "$RESULTS_FILE.tmp" "$RESULTS_FILE"
  echo ""
  echo "Results saved to: $RESULTS_FILE"
  exit 1
fi
