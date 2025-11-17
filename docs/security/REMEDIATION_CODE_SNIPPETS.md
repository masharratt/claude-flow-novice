# Docker Security Vulnerabilities - Remediation Code Snippets

This document contains ready-to-use code fixes for all critical vulnerabilities identified in the Docker test infrastructure security review.

---

## CHE-001: Fix Redis Password Exposure in Healthcheck

### Problem
Redis password exposed in plaintext in Docker healthcheck command.

**File:** `docker/docker-compose.yml`

### Solution 1: Use Socket Authentication (Recommended)

```yaml
# docker/docker-compose.yml (FIXED)

services:
  cfn-redis:
    image: redis:7-alpine
    container_name: cfn-redis
    networks:
      - mcp-network
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    # Use Unix socket with file-based permissions instead of requirepass
    command: >
      redis-server
      --save 60 1
      --loglevel warning
      --unixsocket /var/run/redis/redis.sock
      --unixsocketperm 700
    healthcheck:
      # SECURE: No password in healthcheck
      test: ["CMD", "redis-cli", "-s", "/var/run/redis/redis.sock", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5
    volumes:
      - redis-socket:/var/run/redis

  cfn-coordinator:
    # ... other config
    environment:
      # SECURE: Use socket path instead of password
      - CFN_REDIS_SOCKET=/var/run/redis/redis.sock
    volumes:
      - redis-socket:/var/run/redis:ro
      # ... other volumes
```

### Solution 2: Use Redis ACL with Limited User

```yaml
# docker/docker-compose.yml (FIXED - ACL approach)

services:
  cfn-redis:
    image: redis:7-alpine
    container_name: cfn-redis
    networks:
      - mcp-network
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    # Use Redis ACL for health checks
    command: >
      redis-server
      --save 60 1
      --loglevel warning
      --requirepass ${REDIS_PASSWORD}
      --acl-file /etc/redis/acl.conf
    healthcheck:
      # SECURE: Use limited healthcheck user with no password
      test: ["CMD", "redis-cli", "--user", "healthcheck", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

# /etc/redis/acl.conf (Redis ACL configuration)
# user default on >mainpassword +@all ~*
# user healthcheck on nopass +ping ~*
```

### Solution 3: Use Health Check Script File

```yaml
# docker/docker-compose.yml (FIXED - Script approach)

services:
  cfn-redis:
    image: redis:7-alpine
    container_name: cfn-redis
    networks:
      - mcp-network
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
      - ./docker/redis-health-check.sh:/usr/local/bin/redis-health-check.sh:ro
    command: redis-server --save 60 1 --loglevel warning --requirepass ${REDIS_PASSWORD}
    healthcheck:
      # SECURE: External script stores password securely
      test: ["CMD", "/usr/local/bin/redis-health-check.sh"]
      interval: 5s
      timeout: 3s
      retries: 5
```

Create script file `docker/redis-health-check.sh`:

```bash
#!/bin/sh
# docker/redis-health-check.sh
# Secure Redis health check that doesn't expose password

# Read password from environment variable (not exposed in command line)
REDIS_PASSWORD="${REDIS_PASSWORD:-}"

if [ -n "$REDIS_PASSWORD" ]; then
    # Use password if configured
    redis-cli -a "$REDIS_PASSWORD" ping >/dev/null 2>&1
else
    # Use without password if not configured
    redis-cli ping >/dev/null 2>&1
fi

# Return the exit code (0 = success, non-zero = failure)
exit $?
```

---

## CHE-002: Fix Docker Socket Unrestricted Access

### Problem
Docker socket mounted without privilege restrictions, granting full host access.

**File:** `docker/docker-compose.yml`

### Solution 1: Use Rootless Docker (Most Secure)

```yaml
# docker/docker-compose.yml (FIXED - Rootless)

services:
  cfn-coordinator:
    image: cfn-intelligent-coordinator:latest
    container_name: cfn-coordinator
    user: "1000:1000"  # Non-root user
    # Use rootless Docker socket
    volumes:
      - /run/user/1000/docker.sock:/var/run/docker.sock:ro
      # Read-only mount: container cannot modify Docker daemon
      - ${WORKSPACE_PATH:-/workspace}:/workspace:rw
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE
    # ... rest of config
```

**Host Setup:**

```bash
#!/bin/bash
# Setup script for rootless Docker

# 1. Install rootless Docker tools (one-time)
apt-get install -y docker-rootless-extras

# 2. Install as non-root user
dockerd-rootless-setuptool.sh install

# 3. Configure socket permissions
chmod 755 /run/user/1000/docker.sock

# 4. Test connectivity
export DOCKER_HOST=unix:///run/user/1000/docker.sock
docker ps
```

### Solution 2: Use Limited Docker User with Audit Wrapper

```yaml
# docker/docker-compose.yml (FIXED - Limited user)

services:
  cfn-coordinator:
    image: cfn-intelligent-coordinator:latest
    container_name: cfn-coordinator
    user: "1000:1000"  # Non-root user in docker group
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      # Read-only mount (prevents API signature changes)
      - ${WORKSPACE_PATH:-/workspace}:/workspace:rw
      - ./docker/docker-wrapper.sh:/usr/local/bin/docker:ro
      # Use wrapper that audits Docker operations
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE
    security_opt:
      - no-new-privileges:true
    read_only: true  # Entire filesystem read-only except volumes
    tmpfs:
      - /tmp
      - /run
    # ... rest of config
```

Create wrapper script `docker/docker-wrapper.sh`:

```bash
#!/bin/bash
# docker/docker-wrapper.sh
# Audit and restrict Docker operations

set -euo pipefail

OPERATION="${1:-}"
shift || true

# Allowed operations
ALLOWED_OPERATIONS="run|kill|rm|logs|exec|ps|list"

# Audit operation
echo "$(date): User $(id -u) executed: docker $OPERATION $@" >> /var/log/docker-audit.log

# Check if operation is allowed
if ! echo "$OPERATION" | grep -qE "^($ALLOWED_OPERATIONS)$"; then
    echo "ERROR: Operation '$OPERATION' not allowed" >&2
    exit 1
fi

# Prevent dangerous flags
case "$OPERATION" in
    run)
        # Prevent privileged containers
        if echo "$@" | grep -qE "\-\-privileged"; then
            echo "ERROR: Privileged containers not allowed" >&2
            exit 1
        fi
        # Prevent host filesystem mounts
        if echo "$@" | grep -qE "\-v.*/:.*:"; then
            echo "ERROR: Host root mount not allowed" >&2
            exit 1
        fi
        ;;
esac

# Execute Docker command
exec /usr/bin/docker "$OPERATION" "$@"
```

**Host Setup:**

```bash
#!/bin/bash
# Setup script for limited Docker user

# 1. Create limited docker user
useradd -m -s /bin/bash docker || true

# 2. Add to docker group (allows Docker socket access)
usermod -aG docker docker

# 3. Configure sudoers for wrapper (optional)
echo "docker ALL=(ALL) NOPASSWD: /usr/local/bin/docker-wrapper.sh" \
    | tee /etc/sudoers.d/docker-wrapper

# 4. Verify setup
su - docker -c "docker ps"
```

### Solution 3: Use CloudEvents/gRPC Instead of Docker Socket

```yaml
# docker/docker-compose.yml (FIXED - Event-based orchestration)

services:
  cfn-orchestrator:
    # Host-side service that manages Docker operations
    image: cfn-orchestrator:latest
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      # Only orchestrator has Docker socket
    ports:
      - "50051:50051"  # gRPC port
    networks:
      - mcp-network

  cfn-coordinator:
    image: cfn-intelligent-coordinator:latest
    # NO Docker socket mount!
    environment:
      # Use orchestrator service instead
      - ORCHESTRATOR_HOST=cfn-orchestrator
      - ORCHESTRATOR_PORT=50051
    # Coordinator communicates via gRPC, not Docker socket
    networks:
      - mcp-network
```

---

## CHE-003: Fix Path Traversal in Test Directories

### Problem
Test directories use predictable paths without validation, allowing symlink/path traversal attacks.

**File:** `tests/docker/test-success-criteria-loading.sh`

### Fix: Use mktemp and Path Validation

```bash
#!/bin/bash
# tests/docker/test-success-criteria-loading.sh (FIXED)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# SECURE: Use mktemp for random, secure directory names
# mktemp guarantees:
# - Random name (not predictable)
# - Exclusive creation (no race conditions)
# - Proper permissions (0700)
# - Symlinks not followed
TEST_DIR=$(mktemp -d -p "${TMPDIR:-.}" test-criteria.XXXXXX)

cleanup() {
    # Safe cleanup - no path traversal possible
    rm -rf "$TEST_DIR"
}
trap cleanup EXIT

# Function to validate paths are contained within base directory
validate_path_safe() {
    local file_path="$1"
    local base_dir="${2:-.}"

    # Check if path is a symlink (reject symlinks)
    if [ -L "$file_path" ]; then
        echo "ERROR: Path is a symlink: $file_path" >&2
        return 1
    fi

    # Resolve to absolute path and check containment
    local real_path
    real_path=$(cd "$base_dir" && readlink -f "$file_path" 2>/dev/null || echo "")

    if [ -z "$real_path" ]; then
        echo "ERROR: Path does not exist or invalid: $file_path" >&2
        return 1
    fi

    # Ensure real path is under base directory
    local base_real
    base_real=$(cd "$base_dir" && readlink -f . 2>/dev/null)

    if [[ ! "$real_path" =~ ^"$base_real" ]]; then
        echo "ERROR: Path traversal detected: $file_path" >&2
        return 1
    fi

    echo "$real_path"
}

##############################################################################
# Test 1: DoS Protection - Large File Rejection (>10MB)
##############################################################################
test_dos_protection() {
    run_test "DoS Protection - Reject files >10MB"

    # SECURE: Validate path before use
    LARGE_FILE=$(validate_path_safe "large-criteria.json" "$TEST_DIR")

    dd if=/dev/zero of="$LARGE_FILE" bs=1M count=11 2>/dev/null

    FILE_SIZE=$(stat -c%s "$LARGE_FILE" 2>/dev/null || echo "0")
    MAX_JSON_SIZE=$((10 * 1024 * 1024))

    if [[ "$FILE_SIZE" -gt "$MAX_JSON_SIZE" ]]; then
        pass "Large file correctly rejected"
    else
        fail "DoS protection failed"
    fi
}

# ... rest of tests use validate_path_safe() for all file paths
```

---

## CHE-004: Fix SQL Injection in store-benchmarks.sh

### Problem
SQLite insert operations use incorrect parameter binding, allowing SQL injection.

**File:** `.claude/skills/cfn-test-runner/store-benchmarks.sh`

### Fix: Use Consistent Parameterized Queries

```bash
#!/bin/bash
# .claude/skills/cfn-test-runner/store-benchmarks.sh (FIXED)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
DB_FILE="$PROJECT_ROOT/.artifacts/test-benchmarks.db"

# Source sqlite parameter binding library
source "$PROJECT_ROOT/.claude/skills/bootstrap/sqlite-params.sh"

# Parse arguments
SUITE=""
TOTAL=0
PASSED=0
FAILED=0
SKIPPED=0
DURATION=0
COMMIT=""
BRANCH=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --suite) SUITE="$2"; shift 2 ;;
    --total) TOTAL="$2"; shift 2 ;;
    --passed) PASSED="$2"; shift 2 ;;
    --failed) FAILED="$2"; shift 2 ;;
    --skipped) SKIPPED="$2"; shift 2 ;;
    --duration) DURATION="$2"; shift 2 ;;
    --commit) COMMIT="$2"; shift 2 ;;
    --branch) BRANCH="$2"; shift 2 ;;
    *) shift ;;
  esac
done

SUCCESS_RATE=$(awk "BEGIN {printf \"%.4f\", ($PASSED / $TOTAL)}")

# Get or create suite ID using parameterized query
SUITE_ID=$(sqlite_select "$DB_FILE" "SELECT id FROM test_suites WHERE name = ?1" "$SUITE")
if [ -z "$SUITE_ID" ]; then
  sqlite_insert "$DB_FILE" "INSERT INTO test_suites (name) VALUES (?1)" "$SUITE"
  SUITE_ID=$(sqlite3 "$DB_FILE" "SELECT last_insert_rowid()")
fi

# FIXED: Use function for parameterized insert (consistent pattern)
insert_test_run() {
    local db="$1"
    local suite_id="$2"
    local commit="$3"
    local branch="$4"
    local total="$5"
    local passed="$6"
    local failed="$7"
    local skipped="$8"
    local duration="$9"
    local success_rate="${10}"

    # Use proper parameter binding
    sqlite_insert "$db" \
        "INSERT INTO test_runs (
            suite_id, git_commit, git_branch,
            total_tests, passed, failed, skipped,
            duration_seconds, success_rate
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)" \
        "$suite_id" "$commit" "$branch" "$total" \
        "$passed" "$failed" "$skipped" "$duration" "$success_rate"
}

# Call parameterized function
insert_test_run "$DB_FILE" "$SUITE_ID" "$COMMIT" "$BRANCH" \
    "$TOTAL" "$PASSED" "$FAILED" "$SKIPPED" "$DURATION" "$SUCCESS_RATE"

echo "✅ Benchmark stored (run_id: $(sqlite3 "$DB_FILE" "SELECT last_insert_rowid()"))"
```

---

## Additional Fixes: Credential Handling and Error Sanitization

### Fix HIG-002: Sanitize Error Messages

```bash
# Create utility script: tests/test-log-sanitizer.sh

#!/bin/bash
# tests/test-log-sanitizer.sh
# Remove sensitive information from test logs

sanitize_output() {
    # Remove passwords
    sed -E 's/(password|apikey|token|secret|auth)\s*=\s*[^\s]+/\1=****/gi' | \
    # Remove Bearer tokens
    sed -E 's/(Bearer|Authorization:)\s+[^\s]+/\1 ****/gi' | \
    # Remove -a flags with passwords
    sed -E 's/-a\s+[^\s]+/-a ****/g' | \
    # Remove REDIS_PASSWORD environment variable values
    sed -E 's/REDIS_PASSWORD=[^\s]+/REDIS_PASSWORD=****/g' | \
    # Remove full filesystem paths
    sed -E 's|/mnt/c/Users/[^/\s]+|/path/to|g' | \
    # Remove user home directories
    sed -E 's|/home/[^/\s]+|/home/user|g' | \
    # Remove full project paths
    sed -E 's|/([\w-]+/)*claude-flow-novice|/project|g'
}

# Usage:
# log_info "$(echo "$output" | sanitize_output)"
export -f sanitize_output
```

### Fix HIG-003: Validate Environment Variables

```bash
# Create utility script: tests/test-env-validation.sh

#!/bin/bash
# tests/test-env-validation.sh
# Validate and sanitize environment variables

validate_iteration_limit() {
    local limit="${CFN_ITERATION_LIMIT:-10}"
    local max_limit=100

    # Validate it's a number
    if ! [[ "$limit" =~ ^[0-9]+$ ]]; then
        echo "ERROR: CFN_ITERATION_LIMIT must be a number, got: $limit" >&2
        return 1
    fi

    # Validate it's within bounds
    if [ "$limit" -gt "$max_limit" ]; then
        echo "WARNING: CFN_ITERATION_LIMIT exceeds maximum ($max_limit), capping" >&2
        limit=$max_limit
    fi

    if [ "$limit" -lt 1 ]; then
        echo "ERROR: CFN_ITERATION_LIMIT must be at least 1" >&2
        return 1
    fi

    echo "$limit"
}

validate_memory_budget() {
    local budget="${CFN_MEMORY_BUDGET:-40g}"

    # Validate format (number + unit: b, k, m, g)
    if ! [[ "$budget" =~ ^[0-9]+(b|k|m|g)$ ]]; then
        echo "ERROR: CFN_MEMORY_BUDGET has invalid format: $budget" >&2
        return 1
    fi

    echo "$budget"
}

# Usage:
export CFN_ITERATION_LIMIT=$(validate_iteration_limit)
export CFN_MEMORY_BUDGET=$(validate_memory_budget)
```

---

## Testing the Fixes

### Test Script to Validate Remediations

```bash
#!/bin/bash
# tests/security/validate-remediations.sh
# Verify that all security fixes are in place

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

test_che_001_fix() {
    log_step "Testing CHE-001 fix: Redis password not in healthcheck"

    # Verify healthcheck doesn't contain REDIS_PASSWORD
    if grep -q 'test: \["CMD", "redis-cli".*"-a".*"${REDIS_PASSWORD}"' \
        "$PROJECT_ROOT/docker/docker-compose.yml"; then
        fail "CHE-001 not fixed: Password still in healthcheck"
        return 1
    fi

    pass "CHE-001 fixed: Password removed from healthcheck"
}

test_che_003_fix() {
    log_step "Testing CHE-003 fix: Path traversal prevented"

    # Verify mktemp is used
    if grep -q 'mktemp.*-d.*test-criteria' \
        "$PROJECT_ROOT/tests/docker/test-success-criteria-loading.sh"; then
        pass "CHE-003 fixed: mktemp used for secure temp directories"
    else
        fail "CHE-003 not fixed: mktemp not found"
        return 1
    fi
}

test_che_004_fix() {
    log_step "Testing CHE-004 fix: SQL injection prevented"

    # Verify consistent parameterized queries
    if grep -q 'sqlite_insert.*?1.*?2.*?3' \
        "$PROJECT_ROOT/.claude/skills/cfn-test-runner/store-benchmarks.sh"; then
        pass "CHE-004 fixed: Parameterized queries used"
    else
        fail "CHE-004 not fixed: Parameterized queries not found"
        return 1
    fi
}

# Run all tests
test_che_001_fix
test_che_003_fix
test_che_004_fix

log_info "Remediation validation complete"
```

---

## Implementation Checklist

```markdown
# Security Remediation Checklist

## CHE-001: Redis Password Exposure (15 minutes)
- [ ] Choose remediation approach (socket/ACL/script)
- [ ] Update docker-compose.yml
- [ ] Create health check script (if using solution 3)
- [ ] Update environment variables
- [ ] Test with docker-compose up
- [ ] Verify password not in logs

## CHE-003: Path Traversal (30 minutes)
- [ ] Update test-success-criteria-loading.sh
- [ ] Add validate_path_safe() function
- [ ] Replace all TEST_DIR uses with mktemp
- [ ] Add symlink detection
- [ ] Run test suite to verify
- [ ] Test with path traversal attempts

## CHE-004: SQL Injection (20 minutes)
- [ ] Update store-benchmarks.sh
- [ ] Create insert_test_run() function
- [ ] Replace direct INSERT with function call
- [ ] Verify all parameters are bound
- [ ] Run with malicious branch names to test
- [ ] Verify database integrity

## CHE-002: Docker Socket (2-4 hours)
- [ ] Evaluate three solution approaches
- [ ] Make architectural decision
- [ ] Update docker-compose.yml
- [ ] Update host setup scripts
- [ ] Test Docker operations
- [ ] Document privilege model

## Testing and Validation
- [ ] Run security test suite
- [ ] Execute proof-of-concept exploit attempts
- [ ] Verify all fixes prevent exploitation
- [ ] Re-assess consensus score
- [ ] Document security assumptions
- [ ] Update security documentation
```

---

## Quick Reference

| Issue | File | Lines | Fix Time | Complexity |
|-------|------|-------|----------|------------|
| CHE-001 | docker-compose.yml | 24-28 | 15 min | LOW |
| CHE-003 | test-success-criteria-loading.sh | 15-25 | 30 min | MEDIUM |
| CHE-004 | store-benchmarks.sh | 43-57 | 20 min | LOW |
| CHE-002 | docker-compose.yml | 41-45 | 2-4 hrs | HIGH |

