#!/bin/bash
# Validate team-specific Docker image
# Usage: ./validate-team-image.sh <team-name>

set -euo pipefail

# Validate arguments
if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <team-name>"
    echo ""
    echo "Available teams:"
    ls -1 docker/teams/ | grep -v base | grep -v scripts | grep -v README.md
    exit 1
fi

TEAM_NAME="$1"
IMAGE_NAME="cfn-agent-${TEAM_NAME}:latest"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASS_COUNT=0
FAIL_COUNT=0

log_pass() {
    echo -e "${GREEN}✓ PASS:${NC} $1"
    ((PASS_COUNT++))
}

log_fail() {
    echo -e "${RED}✗ FAIL:${NC} $1"
    ((FAIL_COUNT++))
}

log_warn() {
    echo -e "${YELLOW}⚠ WARN:${NC} $1"
}

echo "========================================"
echo "Validating Team Image: $IMAGE_NAME"
echo "========================================"
echo ""

# Test 1: Image exists
echo "Test 1: Image exists"
if docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
    log_pass "Image found"
else
    log_fail "Image not found"
    exit 1
fi

# Test 2: Base layer inheritance
echo ""
echo "Test 2: Base layer inheritance"
if docker history "$IMAGE_NAME" --format "{{.CreatedBy}}" | grep -q "cfn-agent:base"; then
    log_pass "Inherits from base image"
else
    log_warn "Could not verify base layer inheritance (may be normal)"
fi

# Test 3: CFN CLI available
echo ""
echo "Test 3: CFN CLI available"
if docker run --rm "$IMAGE_NAME" npx claude-flow-novice --version >/dev/null 2>&1; then
    CFN_VERSION=$(docker run --rm "$IMAGE_NAME" npx claude-flow-novice --version 2>&1 | head -1)
    log_pass "CFN CLI available ($CFN_VERSION)"
else
    log_fail "CFN CLI not available"
fi

# Test 4: Team environment set
echo ""
echo "Test 4: Team environment set"
TEAM_ENV=$(docker run --rm "$IMAGE_NAME" printenv CFN_TEAM 2>/dev/null || echo "")
if [[ "$TEAM_ENV" == "$TEAM_NAME" ]]; then
    log_pass "CFN_TEAM=$TEAM_ENV"
else
    log_fail "CFN_TEAM not set correctly (expected: $TEAM_NAME, got: $TEAM_ENV)"
fi

# Test 5: Team-specific dependencies
echo ""
echo "Test 5: Team-specific dependencies"
case "$TEAM_NAME" in
    engineering)
        if docker run --rm "$IMAGE_NAME" python3 --version >/dev/null 2>&1; then
            PY_VERSION=$(docker run --rm "$IMAGE_NAME" python3 --version 2>&1)
            log_pass "Python available ($PY_VERSION)"
        else
            log_fail "Python not available"
        fi

        if docker run --rm "$IMAGE_NAME" pytest --version >/dev/null 2>&1; then
            PYTEST_VERSION=$(docker run --rm "$IMAGE_NAME" pytest --version 2>&1 | head -1)
            log_pass "Pytest available ($PYTEST_VERSION)"
        else
            log_fail "Pytest not available"
        fi

        if docker run --rm "$IMAGE_NAME" node --version >/dev/null 2>&1; then
            NODE_VERSION=$(docker run --rm "$IMAGE_NAME" node --version 2>&1)
            log_pass "Node.js available ($NODE_VERSION)"
        else
            log_fail "Node.js not available"
        fi
        ;;

    marketing)
        if docker run --rm "$IMAGE_NAME" php --version >/dev/null 2>&1; then
            PHP_VERSION=$(docker run --rm "$IMAGE_NAME" php --version 2>&1 | head -1)
            log_pass "PHP available ($PHP_VERSION)"
        else
            log_fail "PHP not available"
        fi

        if docker run --rm "$IMAGE_NAME" wp --version >/dev/null 2>&1; then
            WP_VERSION=$(docker run --rm "$IMAGE_NAME" wp --version 2>&1)
            log_pass "WP-CLI available ($WP_VERSION)"
        else
            log_fail "WP-CLI not available"
        fi

        if docker run --rm "$IMAGE_NAME" composer --version >/dev/null 2>&1; then
            COMPOSER_VERSION=$(docker run --rm "$IMAGE_NAME" composer --version 2>&1 | head -1)
            log_pass "Composer available ($COMPOSER_VERSION)"
        else
            log_fail "Composer not available"
        fi
        ;;

    data)
        if docker run --rm "$IMAGE_NAME" python3 --version >/dev/null 2>&1; then
            PY_VERSION=$(docker run --rm "$IMAGE_NAME" python3 --version 2>&1)
            log_pass "Python available ($PY_VERSION)"
        else
            log_fail "Python not available"
        fi

        if docker run --rm "$IMAGE_NAME" python3 -c "import numpy" >/dev/null 2>&1; then
            NUMPY_VERSION=$(docker run --rm "$IMAGE_NAME" python3 -c "import numpy; print(numpy.__version__)" 2>&1)
            log_pass "NumPy available ($NUMPY_VERSION)"
        else
            log_fail "NumPy not available"
        fi

        if docker run --rm "$IMAGE_NAME" python3 -c "import pandas" >/dev/null 2>&1; then
            PANDAS_VERSION=$(docker run --rm "$IMAGE_NAME" python3 -c "import pandas; print(pandas.__version__)" 2>&1)
            log_pass "Pandas available ($PANDAS_VERSION)"
        else
            log_fail "Pandas not available"
        fi

        if docker run --rm "$IMAGE_NAME" python3 -c "import sklearn" >/dev/null 2>&1; then
            SKLEARN_VERSION=$(docker run --rm "$IMAGE_NAME" python3 -c "import sklearn; print(sklearn.__version__)" 2>&1)
            log_pass "Scikit-learn available ($SKLEARN_VERSION)"
        else
            log_fail "Scikit-learn not available"
        fi

        if docker run --rm "$IMAGE_NAME" jupyter --version >/dev/null 2>&1; then
            JUPYTER_VERSION=$(docker run --rm "$IMAGE_NAME" jupyter --version 2>&1 | head -1)
            log_pass "Jupyter available ($JUPYTER_VERSION)"
        else
            log_fail "Jupyter not available"
        fi
        ;;

    *)
        log_warn "No team-specific dependency checks for $TEAM_NAME"
        ;;
esac

# Test 6: Configuration files present
echo ""
echo "Test 6: Team configuration files"
if docker run --rm "$IMAGE_NAME" test -f /etc/cfn/team/agents.json; then
    log_pass "agents.json present"
else
    log_fail "agents.json not found"
fi

# Test 7: Image size reasonable
echo ""
echo "Test 7: Image size"
IMAGE_SIZE=$(docker image inspect "$IMAGE_NAME" --format '{{.Size}}')
IMAGE_SIZE_MB=$((IMAGE_SIZE / 1024 / 1024))
if [[ "$IMAGE_SIZE_MB" -lt 2000 ]]; then
    log_pass "Image size reasonable (${IMAGE_SIZE_MB}MB < 2000MB)"
else
    log_warn "Image size large (${IMAGE_SIZE_MB}MB > 2000MB)"
fi

# Test 8: Entrypoint functional
echo ""
echo "Test 8: Entrypoint functional"
if docker run --rm "$IMAGE_NAME" --help >/dev/null 2>&1; then
    log_pass "Entrypoint executes successfully"
else
    log_fail "Entrypoint execution failed"
fi

# Test 9: Security scan (if Trivy installed)
echo ""
echo "Test 9: Security scan"
if command -v trivy >/dev/null 2>&1; then
    echo "Running Trivy security scan..."
    CRITICAL_VULNS=$(trivy image --severity CRITICAL --quiet "$IMAGE_NAME" 2>/dev/null | grep -c "CRITICAL" || echo "0")
    HIGH_VULNS=$(trivy image --severity HIGH --quiet "$IMAGE_NAME" 2>/dev/null | grep -c "HIGH" || echo "0")

    if [[ "$CRITICAL_VULNS" -eq 0 ]]; then
        log_pass "No critical vulnerabilities"
    else
        log_fail "$CRITICAL_VULNS critical vulnerabilities found"
    fi

    if [[ "$HIGH_VULNS" -eq 0 ]]; then
        log_pass "No high vulnerabilities"
    else
        log_warn "$HIGH_VULNS high vulnerabilities found"
    fi
else
    log_warn "Trivy not installed, skipping security scan"
    log_warn "Install with: brew install aquasecurity/trivy/trivy"
fi

# Summary
echo ""
echo "========================================"
echo "Validation Summary"
echo "========================================"
echo -e "${GREEN}Passed: $PASS_COUNT${NC}"
if [[ "$FAIL_COUNT" -gt 0 ]]; then
    echo -e "${RED}Failed: $FAIL_COUNT${NC}"
fi

if [[ "$FAIL_COUNT" -eq 0 ]]; then
    echo ""
    echo -e "${GREEN}✓ All validation tests passed for $IMAGE_NAME${NC}"
    exit 0
else
    echo ""
    echo -e "${RED}✗ Some validation tests failed${NC}"
    exit 1
fi
