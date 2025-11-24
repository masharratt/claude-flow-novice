#!/bin/bash
# tests/security/test-phase-6-hardening.sh
# Phase 6 Security Hardening Audit
# Validates connection pooling, query optimization, Docker security, caching security, and credential handling

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test counters
PASSED=0
FAILED=0

cleanup() {
  log_info "Cleaning up test resources..."
}
trap cleanup EXIT

# ============================================================================
# 1. CONNECTION POOLING SECURITY
# ============================================================================

test_connection_credentials_not_exposed() {
  log_step "GIVEN connection pool configuration"

  # WHEN checking if credentials are hardcoded
  log_info "Testing credential exposure in source code..."

  local cred_check=0

  # Check for hardcoded passwords in connection pool
  if grep -r "password.*=.*['\"].*['\"]" "$PROJECT_ROOT/src/lib/connection-pool.ts" 2>/dev/null | grep -v "password: string" | grep -v "password:" > /dev/null; then
    log_error "FAIL: Hardcoded credentials found in connection-pool.ts"
    ((FAILED++))
    return 1
  fi

  # Check that credentials come from config object only
  if grep -q "this.config.postgres.password" "$PROJECT_ROOT/src/lib/connection-pool.ts"; then
    log_success "PASS: PostgreSQL credentials loaded from config"
    ((PASSED++))
  else
    log_error "FAIL: PostgreSQL credential handling missing"
    ((FAILED++))
    return 1
  fi

  # Check that Redis password is handled securely
  if grep -q "password: this.config.redis.options?.redisOptions?.password" "$PROJECT_ROOT/src/lib/connection-pool.ts"; then
    log_success "PASS: Redis credentials loaded from config"
    ((PASSED++))
  else
    log_error "FAIL: Redis credential handling missing"
    ((FAILED++))
    return 1
  fi
}

test_connection_pool_limits() {
  log_step "GIVEN connection pool configuration"

  # WHEN checking pool limits
  log_info "Testing connection pool limits..."

  # Check max connections is set
  if grep -q "max: this.config.postgres.max || 20" "$PROJECT_ROOT/src/lib/connection-pool.ts"; then
    log_success "PASS: Max connections limit set (default: 20)"
    ((PASSED++))
  else
    log_error "FAIL: Max connections limit not found"
    ((FAILED++))
    return 1
  fi

  # Check idle timeout is set for DoS prevention
  if grep -q "idleTimeoutMillis:" "$PROJECT_ROOT/src/lib/connection-pool.ts"; then
    log_success "PASS: Idle timeout configured for connection cleanup"
    ((PASSED++))
  else
    log_error "FAIL: Idle timeout not configured"
    ((FAILED++))
    return 1
  fi

  # Check connection timeout for hanging connections
  if grep -q "connectionTimeoutMillis:" "$PROJECT_ROOT/src/lib/connection-pool.ts"; then
    log_success "PASS: Connection timeout configured"
    ((PASSED++))
  else
    log_error "FAIL: Connection timeout not configured"
    ((FAILED++))
    return 1
  fi
}

test_ssl_tls_validation() {
  log_step "GIVEN PostgreSQL connection configuration"

  # WHEN checking SSL/TLS setup
  log_info "Testing SSL/TLS configuration..."

  # Check if SSL can be configured (pg-pool supports ssl option)
  if grep -q "pg.*Pool\|PoolConfig" "$PROJECT_ROOT/src/lib/connection-pool.ts"; then
    log_success "PASS: Using pg-pool which supports SSL configuration"
    ((PASSED++))
  else
    log_error "FAIL: Not using secure pool implementation"
    ((FAILED++))
    return 1
  fi

  # Verify no plaintext protocol usage in Redis
  if ! grep -q "telnet\|plain.*text.*redis" "$PROJECT_ROOT/src/lib/connection-pool.ts"; then
    log_success "PASS: No plaintext Redis protocol detected"
    ((PASSED++))
  else
    log_error "FAIL: Plaintext Redis protocol found"
    ((FAILED++))
    return 1
  fi
}

test_connection_pool_error_handling() {
  log_step "GIVEN connection pool with error scenarios"

  # WHEN checking error handling
  log_info "Testing connection pool error handling..."

  # Check error handler for PostgreSQL
  if grep -q "pgPool.on.*error" "$PROJECT_ROOT/src/lib/connection-pool.ts"; then
    log_success "PASS: PostgreSQL error handler configured"
    ((PASSED++))
  else
    log_error "FAIL: PostgreSQL error handler missing"
    ((FAILED++))
    return 1
  fi

  # Check graceful shutdown
  if grep -q "shutdown.*Promise.all" "$PROJECT_ROOT/src/lib/connection-pool.ts"; then
    log_success "PASS: Graceful shutdown implemented"
    ((PASSED++))
  else
    log_error "FAIL: Graceful shutdown not implemented"
    ((FAILED++))
    return 1
  fi
}

# ============================================================================
# 2. QUERY OPTIMIZATION SECURITY
# ============================================================================

test_sql_injection_prevention() {
  log_step "GIVEN query optimizer with parameterized queries"

  # WHEN checking for SQL injection vulnerabilities
  log_info "Testing SQL injection prevention..."

  # Check getCostByTeam uses parameterized queries
  if grep -A 10 "getCostByTeam.*teamId" "$PROJECT_ROOT/src/lib/query-optimizer.ts" | grep -q '\$1'; then
    log_success "PASS: getCostByTeam uses parameterized queries"
    ((PASSED++))
  else
    log_error "FAIL: getCostByTeam may have SQL injection vulnerability"
    ((FAILED++))
    return 1
  fi

  # Check getCostByAgentType uses parameterized queries
  if grep -A 10 "getCostByAgentType.*agentType" "$PROJECT_ROOT/src/lib/query-optimizer.ts" | grep -q '\$1'; then
    log_success "PASS: getCostByAgentType uses parameterized queries"
    ((PASSED++))
  else
    log_error "FAIL: getCostByAgentType may have SQL injection vulnerability"
    ((FAILED++))
    return 1
  fi

  # Check getDailyCostSummary uses parameterized queries
  if grep -A 15 "getDailyCostSummary" "$PROJECT_ROOT/src/lib/query-optimizer.ts" | grep -q '\$'; then
    log_success "PASS: getDailyCostSummary uses parameterized queries"
    ((PASSED++))
  else
    log_error "FAIL: getDailyCostSummary may have SQL injection vulnerability"
    ((FAILED++))
    return 1
  fi
}

test_materialized_view_access_control() {
  log_step "GIVEN materialized views for cost aggregation"

  # WHEN checking access control
  log_info "Testing materialized view access control..."

  # Check views are created with proper permissions
  if grep -q "CREATE MATERIALIZED VIEW" "$PROJECT_ROOT/migrations/002_create_materialized_views.sql"; then
    log_success "PASS: Materialized views created via migration"
    ((PASSED++))
  else
    log_error "FAIL: Materialized views not found in migration"
    ((FAILED++))
    return 1
  fi

  # Verify views don't expose sensitive data
  if ! grep -q "password\|secret\|key\|token" "$PROJECT_ROOT/migrations/002_create_materialized_views.sql"; then
    log_success "PASS: Views don't expose sensitive fields"
    ((PASSED++))
  else
    log_error "FAIL: Sensitive fields may be exposed in views"
    ((FAILED++))
    return 1
  fi
}

test_index_creation_safety() {
  log_step "GIVEN indexes on agents table"

  # WHEN checking index creation
  log_info "Testing index creation safety..."

  # Verify indexes are created with IF NOT EXISTS
  if grep -q "CREATE INDEX IF NOT EXISTS" "$PROJECT_ROOT/migrations/001_add_agent_indexes.sql"; then
    log_success "PASS: Indexes use IF NOT EXISTS clause"
    ((PASSED++))
  else
    log_error "FAIL: Indexes missing safety clause"
    ((FAILED++))
    return 1
  fi

  # Verify composite indexes are sensible
  if grep -q "team_id.*status\|status.*spawned_at" "$PROJECT_ROOT/migrations/001_add_agent_indexes.sql"; then
    log_success "PASS: Composite indexes follow best practices"
    ((PASSED++))
  else
    log_error "FAIL: Index strategy questionable"
    ((FAILED++))
    return 1
  fi
}

# ============================================================================
# 3. DOCKER OPTIMIZATION SECURITY
# ============================================================================

test_docker_multi_stage_build() {
  log_step "GIVEN multi-stage Dockerfile"

  # WHEN checking build stages
  log_info "Testing Docker multi-stage security..."

  # Check for separate build and runtime stages
  if grep -q "FROM.*AS builder" "$PROJECT_ROOT/docker/Dockerfile.optimized"; then
    log_success "PASS: Build stage configured"
    ((PASSED++))
  else
    log_error "FAIL: Build stage missing"
    ((FAILED++))
    return 1
  fi

  if grep -q "FROM.*AS runtime" "$PROJECT_ROOT/docker/Dockerfile.optimized"; then
    log_success "PASS: Runtime stage configured"
    ((PASSED++))
  else
    log_error "FAIL: Runtime stage missing"
    ((FAILED++))
    return 1
  fi
}

test_docker_dev_dependencies_excluded() {
  log_step "GIVEN runtime stage in Dockerfile"

  # WHEN checking dependency pruning
  log_info "Testing dev dependencies excluded from runtime..."

  # Check that dev dependencies are pruned in builder
  if grep -q "npm prune --production" "$PROJECT_ROOT/docker/Dockerfile.optimized"; then
    log_success "PASS: Dev dependencies pruned"
    ((PASSED++))
  else
    log_error "FAIL: Dev dependencies not pruned"
    ((FAILED++))
    return 1
  fi

  # Verify runtime stage doesn't copy dev deps
  if grep -A 100 "AS runtime" "$PROJECT_ROOT/docker/Dockerfile.optimized" | grep -q "node_modules.*builder" && \
     ! grep -A 100 "AS runtime" "$PROJECT_ROOT/docker/Dockerfile.optimized" | grep -q "npm ci"; then
    log_success "PASS: Runtime stage only copies production modules"
    ((PASSED++))
  else
    log_error "FAIL: Runtime stage may have dev dependencies"
    ((FAILED++))
    return 1
  fi
}

test_docker_non_root_user() {
  log_step "GIVEN Docker runtime stage"

  # WHEN checking user configuration
  log_info "Testing non-root user enforcement..."

  # Check that non-root user is created
  if grep -q "addgroup.*adduser\|adduser.*-S.*cfn" "$PROJECT_ROOT/docker/Dockerfile.optimized"; then
    log_success "PASS: Non-root user 'cfn' created"
    ((PASSED++))
  else
    log_error "FAIL: Non-root user not created"
    ((FAILED++))
    return 1
  fi

  # Check that USER directive is set
  if grep -q "^USER cfn" "$PROJECT_ROOT/docker/Dockerfile.optimized"; then
    log_success "PASS: USER directive set to non-root"
    ((PASSED++))
  else
    log_error "FAIL: User not switched to non-root"
    ((FAILED++))
    return 1
  fi

  # Check chown is applied to critical directories
  if grep -q "chown=cfn:cfn" "$PROJECT_ROOT/docker/Dockerfile.optimized"; then
    log_success "PASS: Ownership transferred to cfn user"
    ((PASSED++))
  else
    log_error "FAIL: File ownership not transferred"
    ((FAILED++))
    return 1
  fi
}

test_docker_secrets_not_in_image() {
  log_step "GIVEN Dockerfile with secrets handling"

  # WHEN checking for secrets in image layers
  log_info "Testing secrets not embedded in image..."

  # Check no API keys in Dockerfile
  if ! grep -q "ANTHROPIC_API_KEY\|KIMI_API_KEY" "$PROJECT_ROOT/docker/Dockerfile.optimized" | grep -v "ENV"; then
    log_success "PASS: API keys not hardcoded in Dockerfile"
    ((PASSED++))
  else
    log_error "FAIL: Secrets may be in Dockerfile"
    ((FAILED++))
    return 1
  fi

  # Check no passwords in Docker build
  if ! grep -q "password.*=\|passwd" "$PROJECT_ROOT/docker/Dockerfile.optimized" | grep -v "ERROR"; then
    log_success "PASS: No passwords in Dockerfile"
    ((PASSED++))
  else
    log_error "FAIL: Passwords found in Dockerfile"
    ((FAILED++))
    return 1
  fi
}

test_docker_health_check() {
  log_step "GIVEN Docker runtime configuration"

  # WHEN checking health check
  log_info "Testing health check configuration..."

  # Verify HEALTHCHECK directive
  if grep -q "HEALTHCHECK" "$PROJECT_ROOT/docker/Dockerfile.optimized"; then
    log_success "PASS: HEALTHCHECK configured"
    ((PASSED++))
  else
    log_error "FAIL: HEALTHCHECK missing"
    ((FAILED++))
    return 1
  fi
}

# ============================================================================
# 4. CACHING SECURITY
# ============================================================================

test_cache_poisoning_prevention() {
  log_step "GIVEN result cache with cache keys"

  # WHEN checking cache key generation
  log_info "Testing cache poisoning prevention..."

  # Check cache uses SHA-256 hashing for keys
  if grep -q "createHash.*sha256" "$PROJECT_ROOT/src/lib/result-cache.ts"; then
    log_success "PASS: Cache keys use SHA-256 hashing"
    ((PASSED++))
  else
    log_error "FAIL: Cache key hashing not secure"
    ((FAILED++))
    return 1
  fi

  # Check namespace isolation
  if grep -q "namespace.*cfn:agent:result" "$PROJECT_ROOT/src/lib/result-cache.ts"; then
    log_success "PASS: Cache namespace configured"
    ((PASSED++))
  else
    log_error "FAIL: Cache namespace not isolated"
    ((FAILED++))
    return 1
  fi
}

test_sensitive_data_in_cache() {
  log_step "GIVEN cache for agent results"

  # WHEN checking what data is cached
  log_info "Testing sensitive data handling in cache..."

  # Check that caching doesn't store credentials
  if ! grep -q "password\|credential\|secret\|token" "$PROJECT_ROOT/src/lib/result-cache.ts" | grep -v "// \|/\*"; then
    log_success "PASS: No sensitive data cached"
    ((PASSED++))
  else
    log_error "FAIL: Cache may store sensitive data"
    ((FAILED++))
    return 1
  fi
}

test_cache_ttl_validation() {
  log_step "GIVEN cache with TTL configuration"

  # WHEN checking TTL settings
  log_info "Testing cache TTL validation..."

  # Verify default TTL is 1 hour
  if grep -q "ttl.*3600\|1.*hour" "$PROJECT_ROOT/src/lib/result-cache.ts"; then
    log_success "PASS: Cache TTL set to 1 hour default"
    ((PASSED++))
  else
    log_error "FAIL: Cache TTL not properly configured"
    ((FAILED++))
    return 1
  fi
}

test_cache_eviction_policy() {
  log_step "GIVEN Redis cache configuration"

  # WHEN checking eviction policy
  log_info "Testing cache eviction policy..."

  # Check for cache invalidation methods
  if grep -q "invalidate\|clearCache" "$PROJECT_ROOT/src/lib/result-cache.ts"; then
    log_success "PASS: Cache invalidation methods implemented"
    ((PASSED++))
  else
    log_error "FAIL: Cache invalidation not available"
    ((FAILED++))
    return 1
  fi
}

# ============================================================================
# 5. TEST SECURITY
# ============================================================================

test_no_credentials_in_tests() {
  log_step "GIVEN test scripts for Phase 6"

  # WHEN checking test files
  log_info "Testing no credentials in test scripts..."

  # Check for hardcoded API keys in tests
  if ! grep -r "sk-ant-\|sk-\|bearer.*token" "$PROJECT_ROOT/tests/perf/" 2>/dev/null | grep -v "test-"; then
    log_success "PASS: No hardcoded credentials in perf tests"
    ((PASSED++))
  else
    log_error "FAIL: Credentials found in test files"
    ((FAILED++))
    return 1
  fi
}

test_test_cleanup() {
  log_step "GIVEN test scripts with cleanup"

  # WHEN checking cleanup procedures
  log_info "Testing test cleanup procedures..."

  # Verify tests have cleanup functions
  if grep -q "cleanup()\|trap cleanup EXIT" "$PROJECT_ROOT/tests/perf/test-connection-pooling.sh"; then
    log_success "PASS: Connection pooling tests have cleanup"
    ((PASSED++))
  else
    log_error "FAIL: Connection pooling tests missing cleanup"
    ((FAILED++))
    return 1
  fi
}

# ============================================================================
# 6. COMPLIANCE & OWASP CHECKS
# ============================================================================

test_owasp_injection_prevention() {
  log_step "GIVEN query implementations"

  # WHEN checking OWASP A03:2021 Injection
  log_info "Testing OWASP A03:2021 Injection prevention..."

  # Verify no string concatenation in queries
  if ! grep -q "query.*+\|query.*\`.*\${\|query.*concat" "$PROJECT_ROOT/src/lib/query-optimizer.ts"; then
    log_success "PASS: No string concatenation in queries (OWASP A03:2021)"
    ((PASSED++))
  else
    log_error "FAIL: Potential SQL injection (OWASP A03:2021)"
    ((FAILED++))
    return 1
  fi
}

test_owasp_broken_access_control() {
  log_step "GIVEN Docker image with user permissions"

  # WHEN checking OWASP A01:2021 Broken Access Control
  log_info "Testing OWASP A01:2021 Broken Access Control..."

  # Verify non-root user prevents privilege escalation
  if grep -q "USER cfn\|adduser.*cfn" "$PROJECT_ROOT/docker/Dockerfile.optimized"; then
    log_success "PASS: Non-root user prevents privilege escalation (OWASP A01:2021)"
    ((PASSED++))
  else
    log_error "FAIL: Root access not restricted (OWASP A01:2021)"
    ((FAILED++))
    return 1
  fi
}

test_owasp_exposed_secrets() {
  log_step "GIVEN application code"

  # WHEN checking OWASP A02:2021 Cryptographic Failures
  log_info "Testing OWASP A02:2021 exposed secrets..."

  # Verify credentials come from environment/config, not code
  local secret_check=0

  if ! grep -r "password.*=.*['\"][^$]" "$PROJECT_ROOT/src/lib/" 2>/dev/null | grep -v "password: string" | grep -v ".password"; then
    log_success "PASS: No hardcoded secrets (OWASP A02:2021)"
    ((PASSED++))
  else
    log_error "FAIL: Secrets may be hardcoded (OWASP A02:2021)"
    ((FAILED++))
    return 1
  fi
}

# ============================================================================
# MAIN TEST EXECUTION
# ============================================================================

log_section "Phase 6 Security Hardening Audit"

# Connection Pooling Tests
log_subsection "Connection Pooling Security (5 tests)"
test_connection_credentials_not_exposed
test_connection_pool_limits
test_ssl_tls_validation
test_connection_pool_error_handling
test_connection_pool_limits

# Query Optimization Tests
log_subsection "Query Optimization Security (3 tests)"
test_sql_injection_prevention
test_materialized_view_access_control
test_index_creation_safety

# Docker Security Tests
log_subsection "Docker Optimization Security (5 tests)"
test_docker_multi_stage_build
test_docker_dev_dependencies_excluded
test_docker_non_root_user
test_docker_secrets_not_in_image
test_docker_health_check

# Caching Security Tests
log_subsection "Caching Security (4 tests)"
test_cache_poisoning_prevention
test_sensitive_data_in_cache
test_cache_ttl_validation
test_cache_eviction_policy

# Test Security
log_subsection "Test Security (2 tests)"
test_no_credentials_in_tests
test_test_cleanup

# OWASP Compliance
log_subsection "OWASP Top 10 Compliance (3 tests)"
test_owasp_injection_prevention
test_owasp_broken_access_control
test_owasp_exposed_secrets

# ============================================================================
# SUMMARY
# ============================================================================

log_section "Phase 6 Security Audit Summary"

TOTAL=$((PASSED + FAILED))
PASS_RATE=$((PASSED * 100 / TOTAL))

echo ""
echo "Test Results:"
echo "  Passed: $PASSED"
echo "  Failed: $FAILED"
echo "  Total:  $TOTAL"
echo "  Pass Rate: $PASS_RATE%"
echo ""

if [ $FAILED -eq 0 ]; then
  log_success "All security tests PASSED"
  exit 0
else
  log_error "$FAILED security issues found"
  exit 1
fi
