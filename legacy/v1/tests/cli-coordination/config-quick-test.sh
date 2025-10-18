#!/usr/bin/env bash
# Quick Configuration Test - Sprint 1.3
# Validates core functionality without complex subshell nesting

set -euo pipefail

CONFIG_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../config/coordination-config.sh"

echo "=== Configuration System Quick Test ==="
echo ""

# Test 1: Default load
echo "[Test 1] Default configuration load..."
if bash "$CONFIG_FILE" > /dev/null 2>&1; then
  echo "✅ PASS: Default configuration loads"
else
  echo "❌ FAIL: Default configuration failed"
  exit 1
fi

# Test 2: Environment override
echo "[Test 2] Environment variable override..."
if bash -c "export CFN_MAX_AGENTS=200 && bash \"$CONFIG_FILE\"" 2>&1 | grep -q "Max Agents:.*200"; then
  echo "✅ PASS: Environment override works"
else
  echo "❌ FAIL: Environment override failed"
  exit 1
fi

# Test 3: Validation rejects invalid value
echo "[Test 3] Validation rejects invalid CFN_MAX_AGENTS..."
TEST_SCRIPT="/tmp/test-validation-$$.sh"
cat > "$TEST_SCRIPT" <<EOF
export CFN_MAX_AGENTS=2000
bash '$CONFIG_FILE' 2>&1
EOF
TEST_OUTPUT=$(timeout 5 bash "$TEST_SCRIPT")
rm -f "$TEST_SCRIPT"

if echo "$TEST_OUTPUT" | grep -q "ERROR.*CFN_MAX_AGENTS"; then
  echo "✅ PASS: Validation rejects invalid value"
else
  echo "❌ FAIL: Validation did not reject invalid value"
  exit 1
fi

# Test 4: Directory creation
echo "[Test 4] Directory initialization..."
TEST_DIR="/tmp/cfn-test-$$"
if bash -c "export CFN_BASE_DIR=\"$TEST_DIR\" && bash \"$CONFIG_FILE\"" > /dev/null 2>&1; then
  if [ -d "$TEST_DIR/metrics" ] && [ -d "$TEST_DIR/health" ] && [ -d "$TEST_DIR/alerts" ]; then
    echo "✅ PASS: Directories created successfully"
    rm -rf "$TEST_DIR"
  else
    echo "❌ FAIL: Directories not created"
    rm -rf "$TEST_DIR"
    exit 1
  fi
else
  echo "❌ FAIL: Directory initialization failed"
  exit 1
fi

# Test 5: Config can be sourced
echo "[Test 5] Configuration sourcing..."
cd "$(dirname "$CONFIG_FILE")/.." || exit 1
if source "config/coordination-config.sh" 2>&1 | grep -q "Configuration loaded successfully"; then
  if [ "$CFN_MAX_AGENTS" = "100" ]; then
    echo "✅ PASS: Configuration sourced successfully"
  else
    echo "❌ FAIL: Variables not exported correctly"
    exit 1
  fi
else
  echo "❌ FAIL: Configuration sourcing failed"
  exit 1
fi

echo ""
echo "=== All Tests Passed ✅ ==="
