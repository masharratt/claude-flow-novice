#!/usr/bin/env bash
# Docker/K8s Infrastructure Validation Script
# Phase 2 Sprint 2.3 - Production Deployment Readiness
#
# Validates:
# - Docker configuration syntax
# - Kubernetes manifests
# - tmpfs configuration
# - Security settings
# - Resource limits
# - Network configuration

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DOCKER_DIR="$PROJECT_ROOT/config/docker"
K8S_DIR="$PROJECT_ROOT/config/k8s"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Validation results
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNINGS=0

log_info() {
  echo -e "${GREEN}[INFO]${NC} $*"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $*"
  WARNINGS=$((WARNINGS + 1))
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $*"
  FAILED_CHECKS=$((FAILED_CHECKS + 1))
}

log_pass() {
  echo -e "${GREEN}[PASS]${NC} $*"
  PASSED_CHECKS=$((PASSED_CHECKS + 1))
}

check_result() {
  TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
  if [ $1 -eq 0 ]; then
    log_pass "$2"
  else
    log_error "$2"
  fi
}

# ==============================================================================
# DOCKER VALIDATION
# ==============================================================================

validate_docker_compose() {
  log_info "Validating Docker Compose configurations..."

  # Check if docker-compose.yml exists
  if [ ! -f "$DOCKER_DIR/docker-compose.yml" ]; then
    log_error "docker-compose.yml not found"
    return 1
  fi
  log_pass "docker-compose.yml exists"
  TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

  # Validate YAML syntax
  if command -v docker-compose &> /dev/null; then
    if docker-compose -f "$DOCKER_DIR/docker-compose.yml" config > /dev/null 2>&1; then
      log_pass "docker-compose.yml syntax is valid"
      TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    else
      log_error "docker-compose.yml has syntax errors"
      TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    fi
  else
    log_warn "docker-compose not installed, skipping syntax validation"
  fi

  # Check tmpfs configuration
  if grep -q "tmpfs:" "$DOCKER_DIR/docker-compose.yml"; then
    log_pass "tmpfs configuration found"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
  else
    log_error "tmpfs configuration missing (required for message-bus)"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
  fi

  # Check shm_size configuration
  if grep -q "shm_size:" "$DOCKER_DIR/docker-compose.yml"; then
    local shm_size=$(grep "shm_size:" "$DOCKER_DIR/docker-compose.yml" | head -1 | awk '{print $2}')
    if [[ "$shm_size" =~ ^[0-9]+[gG]$ ]]; then
      local size_gb=${shm_size//[gG]/}
      if [ "$size_gb" -ge 1 ]; then
        log_pass "shm_size is adequate: $shm_size"
        TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
      else
        log_warn "shm_size may be insufficient: $shm_size (recommend >=1g)"
        TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
      fi
    fi
  else
    log_error "shm_size not configured (required for multi-agent coordination)"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
  fi

  # Check memory limits
  if grep -q "mem_limit:" "$DOCKER_DIR/docker-compose.yml"; then
    log_pass "Memory limits configured"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
  else
    log_warn "Memory limits not set (recommended for production)"
  fi

  # Check security settings
  if grep -q "cap_drop:" "$DOCKER_DIR/docker-compose.yml"; then
    log_pass "Security capabilities configured (cap_drop)"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
  else
    log_warn "Security capabilities not configured"
  fi

  # Check healthcheck
  if grep -q "healthcheck:" "$DOCKER_DIR/docker-compose.yml"; then
    log_pass "Health check configured"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
  else
    log_warn "Health check not configured"
  fi

  # Check Prometheus integration
  if grep -q "prometheus:" "$DOCKER_DIR/docker-compose.yml"; then
    log_pass "Prometheus monitoring configured"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
  else
    log_error "Prometheus monitoring missing"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
  fi
}

validate_dockerfile() {
  log_info "Validating Dockerfile..."

  if [ ! -f "$PROJECT_ROOT/Dockerfile" ]; then
    log_error "Dockerfile not found"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    return 1
  fi
  log_pass "Dockerfile exists"
  TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

  # Check multi-stage build
  local stage_count=$(grep -c "^FROM" "$PROJECT_ROOT/Dockerfile" || echo "0")
  if [ "$stage_count" -ge 2 ]; then
    log_pass "Multi-stage build configured ($stage_count stages)"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
  else
    log_warn "Single-stage build detected (multi-stage recommended for production)"
  fi

  # Check non-root user
  if grep -q "USER" "$PROJECT_ROOT/Dockerfile"; then
    log_pass "Non-root user configured"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
  else
    log_error "Container runs as root (security risk)"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
  fi

  # Check healthcheck
  if grep -q "HEALTHCHECK" "$PROJECT_ROOT/Dockerfile"; then
    log_pass "Dockerfile healthcheck configured"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
  else
    log_warn "No Dockerfile healthcheck"
  fi

  # Check signal handling
  if grep -q "dumb-init" "$PROJECT_ROOT/Dockerfile" || grep -q "tini" "$PROJECT_ROOT/Dockerfile"; then
    log_pass "Signal handling configured (init system)"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
  else
    log_warn "No init system (signals may not be handled properly)"
  fi
}

validate_stability_test_config() {
  log_info "Validating stability test configuration..."

  if [ ! -f "$DOCKER_DIR/docker-compose.stability-test.yml" ]; then
    log_error "docker-compose.stability-test.yml not found"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    return 1
  fi
  log_pass "Stability test configuration exists"
  TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

  # Check 50-agent configuration
  if grep -q "CFN_MAX_AGENTS=50" "$DOCKER_DIR/docker-compose.stability-test.yml"; then
    log_pass "50-agent load test configured"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
  else
    log_warn "50-agent configuration not found"
  fi

  # Check 8-hour duration
  if grep -q "TEST_DURATION_HOURS=8" "$DOCKER_DIR/docker-compose.stability-test.yml"; then
    log_pass "8-hour duration configured"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
  else
    log_warn "8-hour test duration not configured"
  fi

  # Check Prometheus integration
  if grep -q "prometheus:" "$DOCKER_DIR/docker-compose.stability-test.yml"; then
    log_pass "Stability test Prometheus integration configured"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
  else
    log_error "Stability test missing Prometheus"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
  fi
}

# ==============================================================================
# KUBERNETES VALIDATION
# ==============================================================================

validate_k8s_manifests() {
  log_info "Validating Kubernetes manifests..."

  if [ ! -d "$K8S_DIR" ]; then
    log_error "Kubernetes configuration directory not found"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    return 1
  fi

  # Check ConfigMaps
  local configmap_count=$(find "$K8S_DIR" -name "configmap-*.yaml" | wc -l)
  if [ "$configmap_count" -ge 3 ]; then
    log_pass "ConfigMaps found for all environments ($configmap_count)"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
  else
    log_warn "Insufficient ConfigMaps (found: $configmap_count, expected: >=3)"
  fi

  # Check production ConfigMap
  if [ -f "$K8S_DIR/configmap-production.yaml" ]; then
    log_pass "Production ConfigMap exists"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

    # Validate tmpfs configuration
    if grep -q "CFN_BASE_DIR.*shm" "$K8S_DIR/configmap-production.yaml"; then
      log_pass "Production ConfigMap uses tmpfs (/dev/shm)"
      TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    else
      log_error "Production ConfigMap missing tmpfs configuration"
      TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    fi

    # Check agent limits
    if grep -q "CFN_MAX_AGENTS.*500" "$K8S_DIR/configmap-production.yaml"; then
      log_pass "Production ConfigMap supports 500 agents"
      TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    else
      log_warn "Production agent limit not set to 500"
    fi

    # Check security settings
    if grep -q "CFN_ENABLE_AGENT_AUTH.*true" "$K8S_DIR/configmap-production.yaml"; then
      log_pass "Production authentication enabled"
      TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    else
      log_error "Production authentication not enabled"
      TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    fi

    if grep -q "CFN_ENABLE_TLS.*true" "$K8S_DIR/configmap-production.yaml"; then
      log_pass "Production TLS enabled"
      TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    else
      log_error "Production TLS not enabled"
      TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    fi
  else
    log_error "Production ConfigMap not found"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
  fi

  # Check Secrets
  local secret_count=$(find "$K8S_DIR" -name "secret-*.yaml" | wc -l)
  if [ "$secret_count" -ge 2 ]; then
    log_pass "Secrets found for production/staging ($secret_count)"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
  else
    log_warn "Insufficient Secrets (found: $secret_count, expected: >=2)"
  fi

  # Validate YAML syntax if kubectl is available
  if command -v kubectl &> /dev/null; then
    local yaml_valid=true
    for yaml_file in "$K8S_DIR"/*.yaml; do
      if ! kubectl apply --dry-run=client -f "$yaml_file" > /dev/null 2>&1; then
        log_error "Invalid YAML: $(basename "$yaml_file")"
        yaml_valid=false
        TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
      fi
    done
    if [ "$yaml_valid" = true ]; then
      log_pass "All Kubernetes manifests have valid syntax"
      TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    fi
  else
    log_warn "kubectl not installed, skipping YAML validation"
  fi
}

# ==============================================================================
# INFRASTRUCTURE REQUIREMENTS
# ==============================================================================

validate_infrastructure_requirements() {
  log_info "Validating infrastructure requirements..."

  # Check required directories
  local required_dirs=("lib" "scripts" "tests/integration" "config")
  for dir in "${required_dirs[@]}"; do
    if [ -d "$PROJECT_ROOT/$dir" ]; then
      log_pass "Required directory exists: $dir"
      TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    else
      log_error "Missing required directory: $dir"
      TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    fi
  done

  # Check coordination libraries
  local required_libs=("message-bus.sh" "health.sh" "auth.sh")
  for lib in "${required_libs[@]}"; do
    if [ -f "$PROJECT_ROOT/lib/$lib" ]; then
      log_pass "Coordination library exists: $lib"
      TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    else
      log_error "Missing coordination library: $lib"
      TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    fi
  done

  # Check test files
  if [ -f "$PROJECT_ROOT/tests/integration/100-agent-coordination.test.sh" ]; then
    log_pass "100-agent coordination test exists"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
  else
    log_error "100-agent coordination test missing"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
  fi

  # Check monitoring scripts
  if [ -d "$PROJECT_ROOT/scripts/monitoring" ]; then
    log_pass "Monitoring scripts directory exists"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
  else
    log_warn "Monitoring scripts directory missing"
  fi
}

# ==============================================================================
# DEPLOYMENT READINESS CHECKS
# ==============================================================================

validate_deployment_readiness() {
  log_info "Validating production deployment readiness..."

  # Check tmpfs support
  if mountpoint -q /dev/shm 2>/dev/null; then
    log_pass "/dev/shm is mounted (tmpfs available)"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
  else
    log_warn "/dev/shm not mounted (may affect container tmpfs)"
  fi

  # Check Docker daemon
  if docker info > /dev/null 2>&1; then
    log_pass "Docker daemon is running"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

    # Check Docker version
    local docker_version=$(docker --version | grep -oP '\d+\.\d+' | head -1)
    local major_version=$(echo "$docker_version" | cut -d. -f1)
    if [ "$major_version" -ge 20 ]; then
      log_pass "Docker version is adequate: $docker_version"
      TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    else
      log_warn "Docker version may be outdated: $docker_version (recommend >=20.x)"
    fi
  else
    log_error "Docker daemon not running or not accessible"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
  fi

  # Check disk space
  local available_space=$(df -BG /dev/shm 2>/dev/null | tail -1 | awk '{print $4}' | sed 's/G//')
  if [ -n "$available_space" ] && [ "$available_space" -ge 1 ]; then
    log_pass "Sufficient tmpfs space available: ${available_space}G"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
  else
    log_warn "tmpfs space may be insufficient: ${available_space}G"
  fi
}

# ==============================================================================
# MAIN EXECUTION
# ==============================================================================

main() {
  echo "================================================================"
  echo "Docker/K8s Infrastructure Validation"
  echo "Phase 2 Sprint 2.3 - Production Deployment Readiness"
  echo "================================================================"
  echo ""

  validate_docker_compose
  echo ""

  validate_dockerfile
  echo ""

  validate_stability_test_config
  echo ""

  validate_k8s_manifests
  echo ""

  validate_infrastructure_requirements
  echo ""

  validate_deployment_readiness
  echo ""

  # Summary
  echo "================================================================"
  echo "VALIDATION SUMMARY"
  echo "================================================================"
  echo "Total Checks: $TOTAL_CHECKS"
  echo "Passed: ${GREEN}$PASSED_CHECKS${NC}"
  echo "Failed: ${RED}$FAILED_CHECKS${NC}"
  echo "Warnings: ${YELLOW}$WARNINGS${NC}"
  echo ""

  # Calculate confidence score
  local confidence=0
  if [ "$TOTAL_CHECKS" -gt 0 ]; then
    confidence=$(awk "BEGIN {printf \"%.2f\", ($PASSED_CHECKS / $TOTAL_CHECKS)}")
  fi

  echo "Deployment Readiness Score: $confidence"
  echo ""

  # Deployment recommendation
  if (( $(echo "$confidence >= 0.90" | bc -l) )); then
    echo -e "${GREEN}RECOMMENDATION: PRODUCTION READY${NC}"
    echo "Infrastructure meets production deployment criteria"
  elif (( $(echo "$confidence >= 0.75" | bc -l) )); then
    echo -e "${YELLOW}RECOMMENDATION: STAGING READY${NC}"
    echo "Infrastructure suitable for staging, address warnings for production"
  else
    echo -e "${RED}RECOMMENDATION: NOT READY${NC}"
    echo "Critical issues must be resolved before deployment"
  fi
  echo ""

  # JSON output for automation
  cat > /tmp/deployment-validation-result.json <<EOF
{
  "timestamp": $(date +%s),
  "total_checks": $TOTAL_CHECKS,
  "passed": $PASSED_CHECKS,
  "failed": $FAILED_CHECKS,
  "warnings": $WARNINGS,
  "confidence_score": $confidence,
  "production_ready": $(if (( $(echo "$confidence >= 0.90" | bc -l) )); then echo "true"; else echo "false"; fi)
}
EOF

  echo "Detailed results saved to: /tmp/deployment-validation-result.json"

  # Exit with failure if critical issues found
  if [ "$FAILED_CHECKS" -gt 0 ]; then
    exit 1
  fi

  exit 0
}

main "$@"
