# Security Audit: Trigger.dev Phase 1.1 Worker Implementation

**Audit Date**: 2025-11-23
**Scope**: Dockerfile.worker, entrypoint.sh, docker-compose.yml
**Focus Areas**: Credential management, container security, input validation, supply chain
**Consensus Score**: 0.78 (Security concerns identified - requires remediation)

---

## Executive Summary

The trigger.dev Phase 1.1 worker implementation demonstrates good intentions for agent orchestration but contains **critical security vulnerabilities** that must be addressed before production deployment:

1. **CRITICAL**: Exposed Docker socket with insufficient access controls (GID mismatch hack)
2. **CRITICAL**: API keys mounted in readable volumes (.env mounted as ro/rw)
3. **CRITICAL**: Environment variables passed to untrusted agent containers
4. **HIGH**: Missing input validation on AGENT_TYPE before file operations
5. **HIGH**: Provider API keys logged in debug mode
6. **MEDIUM**: Agent profiles copied into image (information disclosure risk)
7. **MEDIUM**: Database credentials in plain environment variables
8. **MEDIUM**: No secret scanning in CI/CD pipeline

---

## 1. Credential Management (CRITICAL)

### 1.1 API Key Exposure in Volumes

**Finding**: CRITICAL - Credentials exposed via direct file mounting

**Location**: `docker-compose.yml` (trigger-worker service)
```yaml
volumes:
  - ../../.env:/workspace/.env:ro  # .env mounted directly
```

**Risk**: Any container that spawns or has access to /workspace can read production secrets.

**Impact**:
- Spawned agent containers inherit parent environment variables
- .env file readable by any process in container
- No encryption or secret management
- Potential exfiltration by compromised agents

**Remediation**:
```yaml
# ❌ WRONG: Direct .env mount
- ../../.env:/workspace/.env:ro

# ✅ CORRECT: Use Docker secrets
# Create secret: docker secret create api_keys .env
secrets:
  api_keys:
    file: .env
# Then inject selectively in services
```

### 1.2 Provider API Keys Passed to Agent Containers

**Finding**: CRITICAL - Sensitive credentials passed to untrusted agents

**Location**: `entrypoint.sh` (setup_zai_environment, setup_kimi_environment, etc.)
```bash
setup_zai_environment() {
  if [[ -z "${ZAI_API_KEY:-}" ]]; then
    log_error "ZAI_API_KEY environment variable is not set"
    return 3
  fi
  export ZAI_BASE_URL="${ZAI_BASE_URL:-https://api.z.ai/v1}"
  export ANTHROPIC_API_KEY="${ZAI_API_KEY}"  # ← Exported to child processes
```

**Risk**:
- API keys exported to environment of spawned processes
- Child processes (agent containers) can access via `env` command
- No scope limiting or revocation mechanism
- Logging statements may expose keys in debug mode

**Impact**:
- Compromised agents can use your API quotas
- API keys visible in process inspection: `ps aux`, `printenv`
- Potential for API abuse and billing fraud
- No audit trail per agent

**Remediation**:
```bash
# ❌ WRONG: Export to environment
export ANTHROPIC_API_KEY="${ZAI_API_KEY}"

# ✅ CORRECT: Pass via secret mount or stdin
# Use Docker secrets or pass through /run/secrets
if [[ -f /run/secrets/zai_api_key ]]; then
  ZAI_API_KEY=$(cat /run/secrets/zai_api_key)
fi

# Or: Use temporary credentials with time-limited scope
TEMP_TOKEN=$(request_scoped_token "agent-${AGENT_TYPE}" "300s")
```

### 1.3 Database Credentials in Environment Variables

**Finding**: HIGH - PostgreSQL and database passwords in plaintext environment

**Location**: `docker-compose.yml`
```yaml
environment:
  DATABASE_URL: postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-trigger}
```

**Risk**:
- Credentials visible in environment variables
- Can be logged by frameworks, monitoring tools
- Inherited by child processes
- No encryption in transit or at rest

**Remediation**:
```yaml
# Use secrets instead
secrets:
  db_password:
    file: .secrets/postgres_password

services:
  postgres:
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password

  trigger-webapp:
    secrets:
      - db_password
    environment:
      DATABASE_URL: postgresql://postgres:$POSTGRES_PASSWORD_FILE@postgres:5432/trigger
```

---

## 2. Container Security (CRITICAL)

### 2.1 Docker Socket Access Without Proper Isolation

**Finding**: CRITICAL - Unsafe docker.sock access control

**Location**: `Dockerfile.worker`
```dockerfile
# Phase 0 Fix Applied: GID mismatch (107 → 1001)
RUN groupadd -g 1001 docker-host || true && \
    usermod -aG docker-host node
```

**Location**: `docker-compose.yml`
```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```

**Risk Analysis**:
1. **GID Mismatch Hack**: Code acknowledges mismatch between container (107) and host (1001) but solves with supplementary group instead of proper seccomp/AppArmor
2. **Unrestricted Docker Access**: Any container with `node` user can:
   - Create containers with `--privileged` flag
   - Mount volumes outside intended scope
   - Escalate to root
   - Access host filesystem
   - Spawn sibling containers with arbitrary capabilities

3. **No API Filtering**: Entire Docker API exposed, not just image spawning

**Impact**:
- Compromised agent container = host compromise
- Privilege escalation vector
- Lateral movement to other containers
- Supply chain attack (untrusted agents)

**Remediation - Option 1: AppArmor Profile**
```dockerfile
# Restrict docker.sock access to image building only
RUN echo 'profile docker-restricted {
  /var/run/docker.sock rw,
  deny /dev/mem rwk,
  deny /dev/kmem rwk,
  deny /sys/module/** rwk,
}' | apparmor_parser -r -

# Use restricted profile
```

**Remediation - Option 2: Sysbox Runtime**
```yaml
# Use gVisor/sysbox for safer container-in-container
runtime: runc-sysbox
volumes:
  - /var/run/docker.sock:/var/run/docker.sock:ro
```

**Remediation - Option 3: docker-slim (Recommended)**
```bash
# Use restricted Docker API proxy
docker-slim --command "build,run" \
  --http-probe=false \
  --preserve-path /workspace \
  cfn-trigger-worker:backend
```

**Remediation - Option 4: Direct Socket Binding (Best)**
```dockerfile
# Don't mount socket at all - use host agent spawning instead
# Remove /var/run/docker.sock mount
# Spawn agents via control plane, not from within container
```

### 2.2 Non-Root User Not Enforced

**Finding**: MEDIUM - Root user execution potential

**Location**: `Dockerfile.worker`
```dockerfile
USER root  # ← Root for package installation

# ... Install packages ...

USER node  # ← Switched to non-root
```

**Risk**: If entrypoint.sh contains bugs, container could re-escalate to root. The switch happens at end of Dockerfile.

**Assessment**: This is acceptable with proper validation, but execution path should prevent root escalation.

**Remediation**:
```dockerfile
# Use multi-stage build to avoid root in runtime
FROM ghcr.io/triggerdotdev/trigger.dev:latest as builder

USER root
RUN apt-get install ... && rm -rf /var/lib/apt/lists/*

# Stage 2: Runtime (no root)
FROM ghcr.io/triggerdotdev/trigger.dev:latest

COPY --from=builder /installed-deps /

USER node  # Set early
```

### 2.3 Missing seccomp/AppArmor Profiles

**Finding**: MEDIUM - No syscall filtering

**Issue**: Container can execute any syscall, including privileged operations.

**Remediation**:
```yaml
services:
  trigger-worker:
    security_opt:
      - apparmor=docker-default
      - seccomp=default
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE
      - CAP_CHOWN
    read_only_root_filesystem: true
    tmpfs:
      - /tmp
      - /run
```

---

## 3. Input Validation (HIGH)

### 3.1 AGENT_TYPE Validation Insufficient

**Finding**: HIGH - Potential path traversal in agent profile resolution

**Location**: `entrypoint.sh`
```bash
validate_agent_type() {
  if [[ ! "$AGENT_TYPE" =~ ^[a-z0-9_-]+$ ]]; then
    log_error "AGENT_TYPE contains invalid characters: $AGENT_TYPE"
    return 1
  fi
}

resolve_agent_profile_path() {
  matching_files=$(find "$AGENT_PROFILES_ROOT" -type f -name "${AGENT_TYPE}.md" 2>/dev/null || true)
}
```

**Risk Analysis**:
1. Regex check allows `-` which could be confused with options
2. `find` command uses user input directly (safe from injection due to `-name` parameter)
3. No check for absolute path or directory traversal symlinks

**Attack Vector**:
```bash
# AGENT_TYPE="backend-developer" ✅ Valid
# AGENT_TYPE="../../../../../../etc/passwd" ✗ Blocked by regex
# AGENT_TYPE="backend--developer" ✓ Would pass regex but might match wrong profile
# AGENT_TYPE=" backend-developer" ✓ Would pass if not trimmed
```

**Remediation**:
```bash
validate_agent_type() {
  # Trim whitespace
  AGENT_TYPE="${AGENT_TYPE##*( )}"
  AGENT_TYPE="${AGENT_TYPE%%*( )}"

  # More restrictive pattern (no leading/trailing dashes)
  if [[ ! "$AGENT_TYPE" =~ ^[a-z][a-z0-9-]*[a-z0-9]$ ]]; then
    log_error "AGENT_TYPE invalid format"
    return 1
  fi

  # Verify no symlinks above agent profile
  local resolved_profile
  resolved_profile=$(realpath "$AGENT_PROFILE_PATH" 2>/dev/null)

  if ! [[ "$resolved_profile" =~ ^${AGENT_PROFILES_ROOT} ]]; then
    log_error "Agent profile path escapes profiles root"
    return 1
  fi
}
```

### 3.2 Provider Configuration Not Validated

**Finding**: MEDIUM - No validation of PROVIDER parameter

**Location**: `entrypoint.sh`
```bash
parse_provider_parameters() {
  PROVIDER=$(echo "$provider_block" | grep -oP '^\s*provider:\s*\K[a-z0-9._-]+' | head -1 || true)

  case "$PROVIDER" in
    zai|kimi|anthropic|gemini|xai|openrouter)
      # ...
    *)
      log_error "Unknown provider: $PROVIDER"
      return 2
      ;;
  esac
}
```

**Risk**:
- Regex allows any lowercase/numbers/dots/dashes
- PROVIDER value could be set from untrusted .md files
- No validation that provider file is in expected location

**Assessment**: Case statement provides whitelist, so this is LOW risk.

---

## 4. Environment Variable Handling (HIGH)

### 4.1 No Validation of Environment Variable Sources

**Finding**: HIGH - Untrusted environment variable propagation

**Location**: `entrypoint.sh` and `docker-compose.yml`
```bash
export ANTHROPIC_API_KEY="${ZAI_API_KEY}"        # From parent environment
export ANTHROPIC_BASE_URL="${ZAI_BASE_URL}"      # From parent environment
```

**Risk**: Spawned agents inherit ALL parent environment variables, including:
- Database credentials
- All API keys
- Secrets from .env file
- Internal service URLs

**Impact**: Agents have access to resources beyond their scope:
```bash
# An agent spawned for "backend-developer" gets access to:
# - ANTHROPIC_API_KEY (intended)
# - DATABASE_URL (unintended)
# - MINIO_ROOT_PASSWORD (unintended)
# - CLICKHOUSE_PASSWORD (unintended)
# - ENCRYPTION_KEY (unintended)
```

**Remediation**:
```bash
# Whitelist only required environment variables
setup_agent_environment() {
  local agent_env=()

  # Only pass essential variables
  agent_env+=("AGENT_TYPE=$AGENT_TYPE")
  agent_env+=("AGENT_PROFILE_PATH=$AGENT_PROFILE_PATH")
  agent_env+=("AGENT_PROVIDER=$PROVIDER")
  agent_env+=("AGENT_MODEL=$PROVIDER_MODEL")
  agent_env+=("CFN_WORKSPACE=/workspace")

  # Pass only the specific API key for this provider
  case "$PROVIDER" in
    zai)
      agent_env+=("ANTHROPIC_API_KEY=${ZAI_API_KEY}")
      agent_env+=("ANTHROPIC_BASE_URL=${ZAI_BASE_URL}")
      ;;
  esac

  # DO NOT: inherit parent environment
  # env -i "${agent_env[@]}" /path/to/agent-task
}
```

### 4.2 Debug Mode Exposes Secrets

**Finding**: HIGH - Secrets logged when DEBUG=true

**Location**: `entrypoint.sh`
```bash
log_debug() {
  if [[ "${DEBUG:-false}" == "true" ]]; then
    echo "[ENTRYPOINT DEBUG] $(date '+%Y-%m-%d %H:%M:%S') :: $*" >&2
  fi
}

# Called with sensitive data:
log_debug "PROVIDER_PARAMETERS block found:"
log_debug "$provider_block"           # Could contain secrets if misformatted
log_debug "ZAI_BASE_URL: $ZAI_BASE_URL"
```

**Risk**: If DEBUG=true is set, logs include:
- API base URLs
- Provider configuration
- Workspace paths
- Potentially API keys if in PROVIDER_PARAMETERS block

**Impact**: Logs stored in:
- Docker logs: `docker logs trigger-dev-worker`
- CloudWatch/ELK: May be centralized
- User terminals: Visible to anyone with container access

**Remediation**:
```bash
log_debug() {
  if [[ "${DEBUG:-false}" == "true" ]]; then
    # Redact sensitive values
    local msg="$*"

    # Mask API keys
    msg="${msg//sk-[a-zA-Z0-9]*/sk-[REDACTED]}"
    msg="${msg//tr_[a-zA-Z0-9]*/tr_[REDACTED]}"
    msg="${msg//Bearer [a-zA-Z0-9]*/Bearer [REDACTED]}"

    echo "[ENTRYPOINT DEBUG] $(date '+%Y-%m-%d %H:%M:%S') :: $msg" >&2
  fi
}
```

---

## 5. File Permissions and Access Control (MEDIUM)

### 5.1 Agent Profiles World-Readable

**Finding**: MEDIUM - Information disclosure risk

**Location**: `Dockerfile.worker`
```dockerfile
COPY .claude/agents/cfn-dev-team /triggerdotdev/.claude/agents/cfn-dev-team
```

**Risk**:
- All agent profiles baked into image
- Profiles may contain sensitive configuration
- Accessible to any container spawned from this image
- Could reveal internal architecture and agent capabilities

**Impact**:
- Leaked system prompts
- Exposed agent specializations
- Revealed provider routing logic
- Potential for prompt injection attacks

**Remediation**:
```dockerfile
# Option 1: Don't bake profiles into image
# Instead, mount from secure volume at runtime

# Option 2: If profiles must be in image:
COPY .claude/agents/cfn-dev-team /triggerdotdev/.claude/agents/cfn-dev-team
RUN chmod 700 /triggerdotdev/.claude/agents && \
    chmod 600 /triggerdotdev/.claude/agents/**/*.md && \
    chown -R node:node /triggerdotdev/.claude/agents

# Option 3: Encrypt profiles
RUN gpg --decrypt /profiles.tar.gz.gpg | tar xz && \
    rm /profiles.tar.gz.gpg
```

### 5.2 /tmp Directory Permissions

**Finding**: MEDIUM - Shared temp directory

**Location**: `Dockerfile.worker`
```dockerfile
RUN mkdir -p /tmp/trigger-dev-deliverables && \
    chown -R node:node /tmp/trigger-dev-deliverables
```

**Risk**: `/tmp` is world-writable. Other containers could:
- Write to `/tmp/trigger-dev-deliverables`
- Interfere with agent operations
- Plant malicious files
- Conduct symlink attacks

**Remediation**:
```dockerfile
# Use more restrictive permissions
RUN mkdir -p /tmp/trigger-dev-deliverables && \
    chown node:node /tmp/trigger-dev-deliverables && \
    chmod 700 /tmp/trigger-dev-deliverables  # Only owner can access

# Use volume instead of /tmp
volumes:
  - trigger_deliverables:/tmp/trigger-dev-deliverables
```

---

## 6. Supply Chain Security (HIGH)

### 6.1 Untrusted Base Image

**Finding**: HIGH - No image verification

**Location**: `Dockerfile.worker`
```dockerfile
FROM ghcr.io/triggerdotdev/trigger.dev:latest
```

**Risk**:
- `:latest` tag is mutable
- No digest pinning
- No signature verification
- Could pull compromised image

**Impact**:
- Backdoored agent containers
- Cryptomining malware in base image
- Data exfiltration from credentials
- Compliance violations

**Remediation**:
```dockerfile
# Pin to specific digest (immutable)
FROM ghcr.io/triggerdotdev/trigger.dev@sha256:abc123def456...

# Or: Pin to specific version
FROM ghcr.io/triggerdotdev/trigger.dev:v1.2.3

# Verify signature
RUN cosign verify --key /etc/signing-key.pub \
  ghcr.io/triggerdotdev/trigger.dev:v1.2.3
```

### 6.2 No Dependency Scanning

**Finding**: HIGH - npm dependencies not audited

**Location**: `Dockerfile.worker`
```dockerfile
COPY trigger-dev/package.json trigger-dev/tsconfig.json ./
RUN npm install && npm run build
```

**Risk**:
- Transitive dependencies may have vulnerabilities
- No supply chain verification (no lockfile mention)
- npm malware not detected

**Remediation**:
```dockerfile
# Use lockfile for reproducible builds
COPY trigger-dev/package*.json ./
RUN npm ci --only=production  # Use lockfile, not package.json

# Scan for vulnerabilities
RUN npm audit --production --audit-level=moderate

# Use snyk/trivy for image scanning
RUN snyk test --severity-threshold=high
```

### 6.3 Alpine Image Implications

**Finding**: MEDIUM - Alpine security trade-offs

**Issue**: Alpine uses musl libc instead of glibc, which:
- Has less security research
- May have different vuln patterns than glibc
- Not all tools compatible

**Assessment**: Alpine is reasonable for this use case given size/security balance, but be aware.

---

## 7. Logging and Monitoring (MEDIUM)

### 7.1 No Audit Trail for Secrets Access

**Finding**: MEDIUM - No logging of credential usage

**Issue**: When agents access ANTHROPIC_API_KEY, no audit log is created:
- No way to track which agents used which keys
- No API usage per-agent tracking
- No detection of credential theft

**Remediation**:
```bash
# Create audit middleware
setup_audit_logging() {
  cat > /tmp/audit.sh << 'EOF'
#!/bin/bash
# Log API key access attempts
{
  echo "$(date -Iseconds) | AGENT=${AGENT_TYPE} | PROVIDER=${PROVIDER} | KEY_ID=sk-***"
} >> /var/log/credential-audit.log
EOF

  # Wrap API calls
  exec &> >(tee -a /var/log/audit.log)
}
```

### 7.2 No Container Security Scanning

**Finding**: MEDIUM - No runtime security monitoring

**Issue**: No detection of:
- Privilege escalation attempts
- Unauthorized syscalls
- Network anomalies
- File system tampering

**Remediation**:
```yaml
services:
  trigger-worker:
    security_opt:
      - seccomp:default
      - apparmor=docker-default

    # Use Falco for runtime security
    image: falcosecurity/falco:latest
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
```

---

## 8. Network Security (MEDIUM)

### 8.1 Network Policy Missing

**Finding**: MEDIUM - No network segmentation

**Location**: `docker-compose.yml`
```yaml
networks:
  - trigger-cfn-network
```

**Risk**:
- trigger-worker can reach ANY service on network
- No restriction to required services (postgres, redis)
- Agent containers unrestricted

**Remediation**:
```yaml
# Use separate networks
networks:
  trigger-backend:
    internal: true  # No external access

  agent-network:
    driver: overlay  # If swarm mode

services:
  postgres:
    networks:
      - trigger-backend  # Only backend services

  redis:
    networks:
      - trigger-backend

  trigger-worker:
    networks:
      - trigger-backend
      - agent-network  # Separate network for agents
```

### 8.2 API_DOMAIN Over HTTP in Development

**Finding**: LOW (Development) - HTTPS required for production

**Location**: `docker-compose.yml`
```yaml
API_DOMAIN: ${API_DOMAIN:-http://trigger-webapp:3000}
```

**Risk**: Internal services use HTTP (acceptable for docker network), but if exposed externally, requires HTTPS.

**Remediation**:
```yaml
# Use https in production
API_DOMAIN: ${API_DOMAIN:-https://trigger-api.example.com}

# Validate in startup
if [[ "$ENVIRONMENT" == "production" && ! "$API_DOMAIN" =~ ^https:// ]]; then
  echo "ERROR: Production must use HTTPS"
  exit 1
fi
```

---

## 9. Secret Rotation and Expiry (MEDIUM)

### 9.1 No Credential Rotation Mechanism

**Finding**: MEDIUM - Static credentials never rotated

**Issue**:
- API keys never rotate
- Compromised keys can be used indefinitely
- No revocation mechanism

**Impact**: Long-term credential compromise risk

**Remediation**:
```bash
# Implement credential rotation
rotate_credentials() {
  local provider=$1

  # Get new token from provider API
  case "$provider" in
    zai)
      NEW_TOKEN=$(curl -X POST https://api.z.ai/v1/auth/rotate \
        -H "Authorization: Bearer $ZAI_API_KEY" \
        -H "Content-Type: application/json" | jq -r '.token')

      # Update secret
      docker secret rm zai_api_key || true
      docker secret create zai_api_key <(echo "$NEW_TOKEN")

      # Restart service
      docker service update --force trigger-worker
      ;;
  esac
}

# Schedule rotation (e.g., daily)
(crontab -l; echo "0 2 * * * /path/to/rotate_credentials") | crontab -
```

---

## 10. Dockerfile Base Image Security (MEDIUM)

### 10.1 Large Base Image Attack Surface

**Finding**: MEDIUM - Extensive base image

**Location**: `Dockerfile.worker`
```dockerfile
FROM ghcr.io/triggerdotdev/trigger.dev:latest
```

**Risk**: Trigger.dev image includes full Node.js runtime + npm + git + other tools. This increases:
- CVE surface area
- Image size (harder to scan)
- Boot time
- Memory footprint

**Assessment**: For trigger.dev worker, this is necessary (can't replace). However, spawned agent containers should use minimal image.

**Remediation**:
```dockerfile
# Spawned agent containers should use alpine
# In orchestration code, when spawning agents:

docker run \
  --image node:20-alpine \  # Minimal base
  --entrypoint "/usr/local/bin/agent-worker" \
  cfn-agent-minimal:latest
```

---

## Summary of Vulnerabilities by Severity

### CRITICAL (Must Fix Before Production)
1. API keys mounted in .env volume (readable by all containers)
2. Provider credentials passed to agent containers (no scope limiting)
3. Docker socket mounted without proper isolation (privilege escalation risk)
4. Database credentials in environment variables (plaintext)

### HIGH (Must Fix Before Production)
5. Insufficient AGENT_TYPE input validation (potential path traversal)
6. No whitelist filtering of environment variables passed to agents
7. Debug mode logs expose secrets
8. Base image `:latest` tag not pinned to digest
9. npm dependencies not audited (no lockfile, no vulnerability scanning)
10. No network policy restricting agent container access

### MEDIUM (Should Fix)
11. Agent profiles world-readable in image (information disclosure)
12. /tmp deliverables directory world-writable (symlink attacks possible)
13. No audit trail for credential access
14. Missing seccomp/AppArmor security profiles
15. No runtime security monitoring (Falco)
16. No credential rotation mechanism
17. No container vulnerability scanning in build pipeline

### LOW (Nice to Have)
18. API_DOMAIN uses HTTP in development (acceptable)

---

## Compliance Gaps

### CIS Docker Benchmark Violations
- 4.1: Image user should be non-root (Acceptable - switched at EOF)
- 5.1: Security modules like AppArmor/SELinux should be enabled (Missing)
- 5.5: Insecure container registries should be avoided (CRITICAL: :latest tag)
- 5.8: Network policy enforcement is needed (Missing)
- 5.27: PIDs cgroup limit should be enforced (Missing)

### OWASP Top 10 Alignment
- A02:2021 - Cryptographic Failures: Database passwords in plaintext
- A03:2021 - Injection: Insufficient input validation on AGENT_TYPE
- A04:2021 - Insecure Design: No threat model for agent spawning
- A05:2021 - Security Misconfiguration: Docker socket mounted unsafely
- A06:2021 - Vulnerable Components: npm audit not run

---

## Recommendations (Priority Order)

### Phase 1: Critical (Week 1)
1. Replace .env volume with Docker secrets
2. Implement credential whitelisting for agent environments
3. Pin base image to digest (not :latest)
4. Add npm audit to build pipeline

### Phase 2: High (Week 2)
5. Implement restricted docker socket access or use sysbox
6. Add comprehensive input validation to entrypoint.sh
7. Remove debug mode or implement secret redaction
8. Add network policies

### Phase 3: Medium (Week 3-4)
9. Implement audit logging for credential access
10. Add seccomp and AppArmor profiles
11. Deploy Falco for runtime security
12. Implement credential rotation

### Phase 4: Compliance (Ongoing)
13. CIS Docker Benchmark automation
14. Regular image scanning (Trivy, Snyk)
15. Penetration testing of agent spawning
16. Security training for developers

---

## Test Cases for Security Validation

```bash
# Test 1: Verify credentials not accessible to spawned agents
docker run -e ZAI_API_KEY=secret-key \
  trigger-dev-worker:test \
  /bin/sh -c "env | grep -i key" && \
  echo "FAIL: Keys in environment" || \
  echo "PASS: Keys not exposed"

# Test 2: Verify agent profile path traversal blocked
AGENT_TYPE="../../../../etc/passwd" \
  docker run trigger-dev-worker:test \
  /bin/sh -c "source /app/entrypoint.sh && validate_agent_type" || \
  echo "PASS: Path traversal blocked"

# Test 3: Verify Docker socket access restrictions
docker run -v /var/run/docker.sock:/var/run/docker.sock \
  trigger-dev-worker:test \
  docker ps && \
  echo "WARNING: Full Docker access granted" || \
  echo "PASS: Docker access restricted"

# Test 4: Verify secrets not logged in debug mode
DEBUG=true docker run trigger-dev-worker:test 2>&1 | \
  grep -i "sk-\|tr_" && \
  echo "FAIL: Secrets logged" || \
  echo "PASS: Secrets redacted"

# Test 5: Verify image digest pinning
docker inspect trigger-dev-worker:test | \
  grep -i ":latest" && \
  echo "FAIL: Using :latest tag" || \
  echo "PASS: Image pinned to digest"
```

---

## References

- CIS Docker Benchmark: https://www.cisecurity.org/benchmark/docker
- OWASP Docker Security Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html
- Docker Best Practices: https://docs.docker.com/develop/dev-best-practices/
- Supply Chain Security (SLSA): https://slsa.dev/
- Kubernetes Pod Security Standards: https://kubernetes.io/docs/concepts/security/pod-security-standards/

---

## Revision History

| Date | Author | Change |
|------|--------|--------|
| 2025-11-23 | Security Specialist | Initial comprehensive audit |

**Status**: READY FOR REMEDIATION
**Next Step**: Create security enhancement issue in backlog
**Estimated Remediation Time**: 2-3 weeks

