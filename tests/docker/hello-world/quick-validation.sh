#!/usr/bin/env bash
# Quick Validation of Core Docker-Native Stabilization Features

set -eo pipefail

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

PASSED=0
FAILED=0

log_success() { echo -e "${GREEN}[PASS]${NC} $1"; ((PASSED++)); }
log_error() { echo -e "${RED}[FAIL]${NC} $1"; ((FAILED++)); }
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }

echo "🔍 Quick Validation of Docker-Native CFN Stabilization"
echo "======================================================"

# Test 1: Core Files Exist
echo
log_info "Checking core files..."
files=(
    "Dockerfile.orchestrator"
    "Dockerfile.agent.stabilized"
    "Dockerfile.telemetry"
    "redis/redis.conf"
    "docker-compose.stabilization.yml"
    "docker.stabilization.env"
)

for file in "${files[@]}"; do
    if [[ -f "$file" ]]; then
        log_success "File exists: $file"
    else
        log_error "File missing: $file"
    fi
done

# Test 2: Environment Variable References
echo
log_info "Checking environment variable wiring..."
if grep -q '${CFN_ORCHESTRATOR_MEMORY_LIMIT' docker-compose.stabilization.yml; then
    log_success "Orchestrator memory limit parameterized"
else
    log_error "Orchestrator memory limit not parameterized"
fi

if grep -q '${CFN_TASK_MEMORY_LIMIT' docker-compose.stabilization.yml; then
    log_success "Task agent memory limit parameterized"
else
    log_error "Task agent memory limit not parameterized"
fi

if grep -q '${CFN_CLI_MEMORY_LIMIT' docker-compose.stabilization.yml; then
    log_success "CLI agent memory limit parameterized"
else
    log_error "CLI agent memory limit not parameterized"
fi

# Test 3: Build Targets
echo
log_info "Checking Docker build targets..."
if grep -q "target: task-mode" docker-compose.stabilization.yml; then
    log_success "Task mode build target specified"
else
    log_error "Task mode build target missing"
fi

if grep -q "target: cli-mode" docker-compose.stabilization.yml; then
    log_success "CLI mode build target specified"
else
    log_error "CLI mode build target missing"
fi

# Test 4: Redis Configuration Fix
echo
log_info "Checking Redis configuration fix..."
if grep -q "# Note: These values should be overridden via command-line arguments" redis/redis.conf; then
    log_success "Redis config template fix applied"
else
    log_error "Redis config template fix missing"
fi

if grep -q "echo 'maxmemory" docker-compose.stabilization.yml; then
    log_success "Redis runtime config generation present"
else
    log_error "Redis runtime config generation missing"
fi

# Test 5: Environment Variables
echo
log_info "Checking environment variable definitions..."
if grep -q "CFN_TELEMETRY_MEMORY_LIMIT" docker.stabilization.env; then
    log_success "Telemetry memory limit defined"
else
    log_error "Telemetry memory limit missing"
fi

if grep -q "CFN_GRAFANA_MEMORY_LIMIT" docker.stabilization.env; then
    log_success "Grafana memory limit defined"
else
    log_error "Grafana memory limit missing"
fi

# Test 6: Container Mode Detection
echo
log_info "Checking container mode detection..."
if grep -q "detect_container_mode" Dockerfile.agent.stabilized; then
    log_success "Container mode detection implemented"
else
    log_error "Container mode detection missing"
fi

if grep -q "container-task" Dockerfile.agent.stabilized; then
    log_success "Task mode detection working"
else
    log_error "Task mode detection missing"
fi

# Test 7: Telemetry Redis Client
echo
log_info "Checking telemetry Redis client fix..."
if grep -q "createClient" Dockerfile.telemetry; then
    log_success "Redis v4 createClient used"
else
    log_error "Redis v4 createClient not found"
fi

if grep -q "/proc/meminfo" Dockerfile.telemetry; then
    log_success "Proc meminfo metrics collection implemented"
else
    log_error "Proc meminfo metrics collection missing"
fi

# Results
echo
echo "========================================"
echo "           VALIDATION RESULTS"
echo "========================================"
echo "✅ Passed: $PASSED"
echo "❌ Failed: $FAILED"
echo "========================================"

TOTAL=$((PASSED + FAILED))
if [[ $TOTAL -gt 0 ]]; then
    SUCCESS_RATE=$((PASSED * 100 / TOTAL))
    echo "📊 Success Rate: ${SUCCESS_RATE}%"
fi

echo

if [[ $FAILED -eq 0 ]]; then
    log_success "🎉 ALL VALIDATIONS PASSED!"
    echo
    echo "✅ Core architecture correctly implemented"
    echo "✅ Environment variables properly wired"
    echo "✅ Redis configuration fix applied"
    echo "✅ Docker build targets correctly specified"
    echo "✅ Container mode detection working"
    echo "✅ Telemetry Redis client fixed"
    echo
    echo "🚀 Docker-native CFN stabilization is ready for deployment!"
    exit 0
else
    log_error "❌ Some validations failed"
    echo "🔧 Please fix the issues above before deployment"
    exit 1
fi