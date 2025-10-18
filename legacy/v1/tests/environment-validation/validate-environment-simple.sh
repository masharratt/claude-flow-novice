#!/bin/bash

# Environment Validation Script for CLI Coordination (No jq dependency)
# Validates /dev/shm availability, permissions, and baseline performance

set -euo pipefail

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Result tracking
RESULTS_FILE="/tmp/env-validation-results.txt"
CRITICAL_ERRORS=0
WARNINGS=0

echo "========================================="
echo "CLI Coordination Environment Validation"
echo "========================================="
echo ""

# Initialize results
cat > "$RESULTS_FILE" <<EOF
CLI Coordination Environment Validation Results
Timestamp: $(date -Iseconds)
Environment: $(uname -a)

CHECKS:
EOF

# Check 1: /dev/shm exists and is mounted
echo -n "Checking /dev/shm availability... "
if [ -d /dev/shm ]; then
  echo -e "${GREEN}PASS${NC}"
  echo "  [PASS] /dev/shm directory exists" >> "$RESULTS_FILE"
else
  echo -e "${RED}FAIL${NC}"
  echo "  [FAIL] /dev/shm directory not found" >> "$RESULTS_FILE"
  ((CRITICAL_ERRORS++))
fi

# Check 2: /dev/shm is tmpfs
echo -n "Checking /dev/shm filesystem type... "
FS_TYPE=$(stat -f -c %T /dev/shm 2>/dev/null || echo "unknown")
if [ "$FS_TYPE" = "tmpfs" ]; then
  echo -e "${GREEN}PASS${NC}"
  echo "  [PASS] /dev/shm is tmpfs" >> "$RESULTS_FILE"
else
  echo -e "${YELLOW}WARN${NC} (found: $FS_TYPE)"
  echo "  [WARN] /dev/shm is not tmpfs (found: $FS_TYPE)" >> "$RESULTS_FILE"
  ((WARNINGS++))
fi

# Check 3: /dev/shm size
echo -n "Checking /dev/shm size... "
SHM_SIZE=$(df -h /dev/shm | tail -1 | awk '{print $2}')
SHM_SIZE_KB=$(df /dev/shm | tail -1 | awk '{print $2}')
echo "$SHM_SIZE"

if [ "$SHM_SIZE_KB" -ge 65536 ]; then
  echo "  [PASS] /dev/shm size adequate ($SHM_SIZE)" >> "$RESULTS_FILE"
else
  echo -e "${YELLOW}WARN${NC} (below 64MB)"
  echo "  [WARN] /dev/shm size below recommended 64MB ($SHM_SIZE)" >> "$RESULTS_FILE"
  ((WARNINGS++))
fi

# Check 4: Write permission test
echo -n "Checking /dev/shm write permissions... "
TEST_FILE="/dev/shm/cli-test-$$"
if echo "test" > "$TEST_FILE" 2>/dev/null; then
  rm -f "$TEST_FILE"
  echo -e "${GREEN}PASS${NC}"
  echo "  [PASS] /dev/shm is writable" >> "$RESULTS_FILE"
else
  echo -e "${RED}FAIL${NC}"
  echo "  [FAIL] /dev/shm write permission denied" >> "$RESULTS_FILE"
  ((CRITICAL_ERRORS++))
fi

# Check 5: Read permission test
echo -n "Checking /dev/shm read permissions... "
TEST_FILE="/dev/shm/cli-test-$$"
echo "test" > "$TEST_FILE" 2>/dev/null || true
if [ -r "$TEST_FILE" ] && [ "$(cat "$TEST_FILE" 2>/dev/null)" = "test" ]; then
  rm -f "$TEST_FILE"
  echo -e "${GREEN}PASS${NC}"
  echo "  [PASS] /dev/shm is readable" >> "$RESULTS_FILE"
else
  echo -e "${RED}FAIL${NC}"
  echo "  [FAIL] /dev/shm read permission denied" >> "$RESULTS_FILE"
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

if [ "$DURATION_MS" -lt 5000 ]; then
  echo "  [PASS] Performance adequate (${DURATION_MS}ms for 1000 ops)" >> "$RESULTS_FILE"
else
  echo -e "${YELLOW}WARN${NC} (slower than expected)"
  echo "  [WARN] Performance below baseline (${DURATION_MS}ms for 1000 ops)" >> "$RESULTS_FILE"
  ((WARNINGS++))
fi

# Check 7: Node.js availability
echo -n "Checking Node.js availability... "
if command -v node >/dev/null 2>&1; then
  NODE_VERSION=$(node --version)
  echo -e "${GREEN}PASS${NC} ($NODE_VERSION)"
  echo "  [PASS] Node.js available ($NODE_VERSION)" >> "$RESULTS_FILE"
else
  echo -e "${RED}FAIL${NC}"
  echo "  [FAIL] Node.js not found" >> "$RESULTS_FILE"
  ((CRITICAL_ERRORS++))
fi

# Check 8: bash availability
echo -n "Checking bash availability... "
if command -v bash >/dev/null 2>&1; then
  BASH_VERSION=$(bash --version | head -1)
  echo -e "${GREEN}PASS${NC}"
  echo "  [PASS] bash available ($BASH_VERSION)" >> "$RESULTS_FILE"
else
  echo -e "${RED}FAIL${NC}"
  echo "  [FAIL] bash not found" >> "$RESULTS_FILE"
  ((CRITICAL_ERRORS++))
fi

# Summary
echo "" >> "$RESULTS_FILE"
echo "SUMMARY:" >> "$RESULTS_FILE"
echo "  Critical Errors: $CRITICAL_ERRORS" >> "$RESULTS_FILE"
echo "  Warnings: $WARNINGS" >> "$RESULTS_FILE"

echo ""
echo "========================================="
echo "VALIDATION SUMMARY"
echo "========================================="
echo "Critical Errors: $CRITICAL_ERRORS"
echo "Warnings: $WARNINGS"
echo ""

# Determine environment readiness
if [ "$CRITICAL_ERRORS" -eq 0 ]; then
  echo -e "${GREEN}ENVIRONMENT READY${NC} for CLI coordination testing"
  echo "  Status: READY" >> "$RESULTS_FILE"
  echo ""
  echo "Results saved to: $RESULTS_FILE"
  exit 0
else
  echo -e "${RED}ENVIRONMENT NOT READY${NC} - critical errors must be resolved"
  echo "  Status: NOT_READY" >> "$RESULTS_FILE"
  echo ""
  echo "Results saved to: $RESULTS_FILE"
  exit 1
fi
