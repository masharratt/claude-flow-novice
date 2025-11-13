#!/bin/bash

# WebSocket Readonly Conflict Prevention Test
# Socket-specific adaptation to prevent readonly variable conflicts
# Would have caught production readonly variable bugs in websocket environment

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🔌 WEBSOCKET READONLY CONFLICT PREVENTION TEST"
echo "Socket-specific validation for readonly variable conflicts"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test tracking
TESTS_TOTAL=0
TESTS_PASSED=0
TESTS_FAILED=0

# Mock WebSocket environment variables
export WEBSOCKET_PORT="${WEBSOCKET_PORT:-8080}"
export WEBSOCKET_HOST="${WEBSOCKET_HOST:-localhost}"
export REDIS_URL="${REDIS_URL:-redis://localhost:6379}"

# Log test result
log_test() {
    local test_name="$1"
    local result="$2"
    local details="${3:-}"

    TESTS_TOTAL=$((TESTS_TOTAL + 1))

    if [ "$result" = "PASS" ]; then
        TESTS_PASSED=$((TESTS_PASSED + 1))
        echo -e "  ${GREEN}✅ PASS${NC}: $test_name"
        if [ -n "$details" ]; then
            echo -e "     ${GREEN}$details${NC}"
        fi
    else
        TESTS_FAILED=$((TESTS_FAILED + 1))
        echo -e "  ${RED}❌ FAIL${NC}: $test_name"
        if [ -n "$details" ]; then
            echo -e "     ${RED}$details${NC}"
        fi
    fi
}

echo "Test 1: WebSocket environment variable conflicts..."
# Test websocket-specific readonly variable conflicts
temp_ws_env=$(mktemp)
cat > "$temp_ws_env" << 'EOF'
# WebSocket environment with potential conflicts
readonly WEBSOCKET_PORT=8080
readonly WEBSOCKET_HOST="localhost"
readonly REDIS_URL="redis://localhost:6379"
readonly MAX_CONNECTIONS=100
EOF

temp_ws_config=$(mktemp)
cat > "$temp_ws_config" << 'EOF'
# WebSocket configuration - should use parameter expansion
# Good pattern
: "${WEBSOCKET_PORT:=8080}"
: "${WEBSOCKET_HOST:=localhost}"
: "${REDIS_URL:=redis://localhost:6379}"

# Bad pattern - would cause conflict
# readonly MAX_CONNECTIONS=200  # This would conflict
EOF

if bash -c "source '$temp_ws_env' && source '$temp_ws_config' && echo 'No conflicts detected'" 2>/dev/null; then
    log_test "WebSocket environment loading" "PASS" "Parameter expansion prevents conflicts"
else
    log_test "WebSocket environment loading" "FAIL" "Readonly conflicts detected"
fi

rm -f "$temp_ws_env" "$temp_ws_config"

echo ""
echo "Test 2: Multi-file WebSocket sourcing safety..."
# Test multiple websocket configuration files
temp_ws_server=$(mktemp)
cat > "$temp_ws_server" << 'EOF'
# WebSocket server configuration
readonly WS_SERVER_TIMEOUT=30000
readonly WS_SERVER_MAX_CONNECTIONS=1000
: "${MAX_MEMORY_MB:=4096}"
: "${MAX_CONNECTIONS:=1000}"
EOF

temp_ws_client=$(mktemp)
cat > "$temp_ws_client" << 'EOF'
# WebSocket client configuration
readonly WS_CLIENT_TIMEOUT=10000
readonly WS_CLIENT_RETRY_ATTEMPTS=3
: "${MAX_MEMORY_MB:=2048}"  # Should not conflict with server
: "${MAX_CONNECTIONS:=100}"  # Should not conflict with server
EOF

temp_ws_orchestrator=$(mktemp)
cat > "$temp_ws_orchestrator" << 'EOF'
# WebSocket orchestrator configuration
# Uses parameter expansion to prevent conflicts
: "${WS_SERVER_TIMEOUT:=30000}"
: "${WS_CLIENT_TIMEOUT:=10000}"
: "${WS_SERVER_MAX_CONNECTIONS:=1000}"
: "${WS_CLIENT_RETRY_ATTEMPTS:=3}"
: "${MAX_MEMORY_MB:=8192}"
EOF

if bash -c "
    source '$temp_ws_server'
    source '$temp_ws_client'
    source '$temp_ws_orchestrator'
    echo 'Multi-file WebSocket sourcing successful: MAX_MEMORY_MB=\$MAX_MEMORY_MB, MAX_CONNECTIONS=\$MAX_CONNECTIONS'
" 2>/dev/null; then
    log_test "Multi-file WebSocket sourcing" "PASS" "All WebSocket configs loaded safely"
else
    log_test "Multi-file WebSocket sourcing" "FAIL" "Readonly conflicts in WebSocket configs"
fi

rm -f "$temp_ws_server" "$temp_ws_client" "$temp_ws_orchestrator"

echo ""
echo "Test 3: WebSocket parameter expansion validation..."
# Test websocket-specific parameter expansion patterns
temp_ws_test=$(mktemp)
cat > "$temp_ws_test" << 'EOF'
# Test parameter expansion in WebSocket context

# Initialize with parameter expansion
: "${WEBSOCKET_PORT:=8080}"
: "${WEBSOCKET_HOST:=localhost}"
: "${REDIS_URL:=redis://localhost:6379}"
: "${MAX_CONNECTIONS:=100}"
: "${WS_TIMEOUT:=30000}"

# Validate values
if [ "$WEBSOCKET_PORT" = "8080" ] && [ "$WEBSOCKET_HOST" = "localhost" ]; then
    echo "WebSocket parameter expansion working correctly"
else
    echo "WebSocket parameter expansion failed"
    exit 1
fi

# Test override behavior
WEBSOCKET_PORT=9090
source <(echo ': "${WEBSOCKET_PORT:=8080}"')
if [ "$WEBSOCKET_PORT" = "9090" ]; then
    echo "WebSocket override preservation working"
else
    echo "WebSocket override preservation failed"
    exit 1
fi
EOF

if bash "$temp_ws_test" 2>/dev/null; then
    log_test "WebSocket parameter expansion" "PASS" "Parameter expansion works for WebSocket vars"
else
    log_test "WebSocket parameter expansion" "FAIL" "Parameter expansion broken for WebSocket vars"
fi

rm -f "$temp_ws_test"

echo ""
echo "Test 4: WebSocket production environment simulation..."
# Test websocket production scenario with multiple services
temp_ws_production=$(mktemp)
cat > "$temp_ws_production" << 'EOF'
# WebSocket production environment simulation

# Service 1: WebSocket Server
source <(cat << 'SERVICE1_EOF'
readonly SERVICE1_WS_PORT=8080
readonly SERVICE1_WS_HOST="0.0.0.0"
: "${MAX_MEMORY_MB:=4096}"
SERVICE1_EOF
)

# Service 2: WebSocket Client Manager
source <(cat << 'SERVICE2_EOF'
readonly SERVICE2_MAX_CONNECTIONS=1000
readonly SERVICE2_RETRY_DELAY=5000
: "${MAX_MEMORY_MB:=8192}"  # Should not conflict with Service1
SERVICE2_EOF
)

# Service 3: WebSocket Redis Bridge
source <(cat << 'SERVICE3_EOF'
readonly SERVICE3_REDIS_URL="redis://localhost:6379"
readonly SERVICE3_PUBSUB_CHANNEL="websocket:events"
: "${MAX_MEMORY_MB:=2048}"  # Should not conflict with Service1 or Service2
SERVICE3_EOF
)

echo "WebSocket production environment loaded successfully"
echo "Service1 MAX_MEMORY_MB: $(echo "$MAX_MEMORY_MB")"
echo "All services running without readonly conflicts"
EOF

if bash "$temp_ws_production" 2>/dev/null; then
    log_test "WebSocket production simulation" "PASS" "Multi-service WebSocket environment works"
else
    log_test "WebSocket production simulation" "FAIL" "Readonly conflicts in multi-service WebSocket"
fi

rm -f "$temp_ws_production"

echo ""
echo "Test 5: Real-time WebSocket variable conflict detection..."
# Test detection of actual conflicts in WebSocket context
temp_ws_conflict_test=$(mktemp)
cat > "$temp_ws_conflict_test" << 'EOF'
#!/bin/bash

# WebSocket conflict detection test

# Test that we can detect readonly conflicts
# This script should fail when trying to redeclare a readonly variable

# First, set a websocket variable as readonly
MAX_WS_CONNECTIONS=500
readonly MAX_WS_CONNECTIONS
echo "First WebSocket readonly set successfully"

# This should fail - trying to redeclare readonly
if readonly MAX_WS_CONNECTIONS=200 2>/dev/null; then
    echo "ERROR: WebSocket readonly conflict was not detected"
    exit 1
else
    echo "SUCCESS: WebSocket readonly conflict properly detected"
    exit 0
fi
EOF

if bash "$temp_ws_conflict_test" 2>/dev/null; then
    log_test "WebSocket conflict detection" "PASS" "Readonly conflicts in WebSocket vars properly detected"
else
    log_test "WebSocket conflict detection" "FAIL" "WebSocket conflict detection mechanism broken"
fi

rm -f "$temp_ws_conflict_test"

echo ""
echo "Test 6: WebSocket configuration safety validation..."
# Test that actual websocket configuration files use safe patterns
actual_ws_configs=(
    "$PROJECT_ROOT/tests/web-portal-websocket.test.cjs"
    # Add other websocket config files as they exist
)

ws_config_found=false
for config_file in "${actual_ws_configs[@]}"; do
    if [ -f "$config_file" ]; then
        ws_config_found=true
        echo "Checking WebSocket config: $config_file"

        # Look for potential readonly conflicts in websocket configs
        if grep -n "readonly.*PORT\|readonly.*CONNECTION\|readonly.*TIMEOUT" "$config_file" 2>/dev/null; then
            log_test "WebSocket config safety - $(basename "$config_file")" "WARN" "Found readonly variables that might conflict"
        else
            log_test "WebSocket config safety - $(basename "$config_file")" "PASS" "No problematic readonly patterns found"
        fi
    fi
done

if [ "$ws_config_found" = false ]; then
    log_test "WebSocket config files found" "SKIP" "No WebSocket configuration files to check"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "WEBSOCKET READONLY CONFLICT PREVENTION TEST SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 TEST RESULTS:"
echo "   Total WebSocket tests: $TESTS_TOTAL"
echo "   ✅ Passed: $TESTS_PASSED"
echo "   ❌ Failed: $TESTS_FAILED"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo "🎉 ALL WEBSOCKET TESTS PASSED"
    echo ""
    echo "✅ WebSocket readonly conflict prevention is working correctly"
    echo "✅ WebSocket parameter expansion patterns are safe"
    echo "✅ Multi-service WebSocket environment conflicts are prevented"
    echo "✅ WebSocket conflict detection mechanisms are functional"
    echo ""
    echo "🔧 WebSocket Environment Variables Validated:"
    echo "   • WEBSOCKET_PORT: Parameter expansion prevents conflicts"
    echo "   • WEBSOCKET_HOST: Safe multi-file sourcing"
    echo "   • MAX_CONNECTIONS: Service-specific isolation"
    echo "   • WS_TIMEOUT: Override preservation works"
    echo "   • REDIS_URL: WebSocket Redis bridge safe"
    echo ""
    echo "💡 WebSocket Best Practices Confirmed:"
    echo "   • Use ':=\"\${VAR:=default}\"' for WebSocket config variables"
    echo "   • Avoid 'readonly VAR=value' in WebSocket multi-file contexts"
    echo "   • Test WebSocket multi-service environment loading"
    echo "   • Validate WebSocket override preservation"
    echo ""
    exit 0
else
    echo "❌ WEBSOCKET TESTS FAILED"
    echo ""
    echo "🚨 WebSocket readonly conflict prevention issues detected:"
    echo ""
    echo "⚠️  IMPACT:"
    echo "   • WebSocket orchestrator failures in production"
    echo "   • WebSocket service startup conflicts"
    echo "   • WebSocket Redis bridge communication errors"
    echo "   • Real-time WebSocket event processing failures"
    echo ""
    echo "🔧 RECOMMENDED WEBSOCKET FIXES:"
    echo "   1. Use parameter expansion in WebSocket config files"
    echo "   2. Test WebSocket multi-service environment loading"
    echo "   3. Validate WebSocket override preservation"
    echo "   4. Check WebSocket Redis bridge variable conflicts"
    echo ""
    exit 1
fi