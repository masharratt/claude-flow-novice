# Security Remediation Roadmap: Trigger.dev Phase 1.2

**Current Score**: 0.78 (Requires Security Hardening)
**Target Score**: 0.92 (Production-Ready)
**Timeline**: 2-3 weeks
**Effort**: 80-120 engineering hours

---

## Phase 1.2 Security Hardening Milestones

### Week 1: Critical Fixes (Blocks Production)

#### Milestone 1.1: Credential Management Overhaul (20 hours)

**Objective**: Replace plaintext credentials with secure secrets management

**Tasks**:

**1.1.1 Implement Docker Secrets**
- Create secrets for each credential type
- Remove .env volume mount
- Update docker-compose.yml

**Implementation**:
```bash
# Create secrets
docker secret create zai_api_key <(echo "$ZAI_API_KEY")
docker secret create kimi_api_key <(echo "$KIMI_API_KEY")
docker secret create anthropic_api_key <(echo "$ANTHROPIC_API_KEY")
docker secret create db_password <(echo "$POSTGRES_PASSWORD")
docker secret create encryption_key <(echo "$ENCRYPTION_KEY")

# Update service configuration
services:
  trigger-worker:
    secrets:
      - zai_api_key
      - kimi_api_key
      - anthropic_api_key
      - db_password
    environment:
      # Reference secrets, don't embed them
      ZAI_API_KEY_FILE: /run/secrets/zai_api_key
      DATABASE_URL: postgresql://postgres:PASSWORD_FILE@postgres/trigger

  postgres:
    secrets:
      - db_password
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
```

**Success Criteria**:
- [ ] Docker secrets created for all API keys
- [ ] .env volume mount removed
- [ ] Services using secret files instead of env vars
- [ ] No credentials in docker inspect output
- [ ] Tests pass with secret injection

**Effort**: 8 hours

---

**1.1.2 Whitelist Environment Variables for Agents**
- Implement strict env var filtering
- Only pass required variables to spawned agents

**Implementation**:
```bash
# In entrypoint.sh
setup_agent_environment() {
  # Create minimal environment for agent
  local agent_env=(
    "AGENT_TYPE=$AGENT_TYPE"
    "AGENT_PROFILE_PATH=$AGENT_PROFILE_PATH"
    "AGENT_PROVIDER=$PROVIDER"
    "AGENT_MODEL=$PROVIDER_MODEL"
    "CFN_WORKSPACE=/workspace"
  )

  # Add ONLY the required API key for this provider
  case "$PROVIDER" in
    zai)
      # Read from secret file, not environment
      if [[ -f /run/secrets/zai_api_key ]]; then
        agent_env+=("ANTHROPIC_API_KEY=$(cat /run/secrets/zai_api_key)")
      fi
      ;;
    anthropic)
      if [[ -f /run/secrets/anthropic_api_key ]]; then
        agent_env+=("ANTHROPIC_API_KEY=$(cat /run/secrets/anthropic_api_key)")
      fi
      ;;
  esac

  # Execute with minimal environment (no inheritance)
  exec env -i "${agent_env[@]}" /path/to/agent-executor
}
```

**Success Criteria**:
- [ ] Agents receive only whitelisted env vars
- [ ] No inheritance from parent environment
- [ ] Database credentials not passed to agents
- [ ] Tests verify isolation

**Effort**: 8 hours

---

**1.1.3 Implement Secret Redaction in Logging**
- Remove secrets from debug output
- Sanitize log streams

**Implementation**:
```bash
# Add to entrypoint.sh
redact_secrets() {
  local text="$1"

  # API keys: sk-*, tr_*, Bearer *
  text="${text//sk-[a-zA-Z0-9]*/sk-[REDACTED]}"
  text="${text//tr_[a-zA-Z0-9]*/tr_[REDACTED]}"
  text="${text//Bearer [a-zA-Z0-9]*/Bearer [REDACTED]}"

  # Database URLs
  text="${text//(postgres.*@)/(postgres:***@)/}"

  echo "$text"
}

log_debug() {
  if [[ "${DEBUG:-false}" == "true" ]]; then
    local msg="$(redact_secrets "$*")"
    echo "[ENTRYPOINT DEBUG] $(date '+%Y-%m-%d %H:%M:%S') :: $msg" >&2
  fi
}
```

**Success Criteria**:
- [ ] DEBUG=true logs contain no API keys
- [ ] Database URLs redacted
- [ ] No plaintext secrets in any log output
- [ ] Performance impact <5%

**Effort**: 4 hours

---

#### Milestone 1.2: Input Validation Hardening (12 hours)

**Objective**: Prevent path traversal and injection attacks

**Tasks**:

**1.2.1 Strengthen AGENT_TYPE Validation**
```bash
validate_agent_type_strict() {
  # Trim whitespace
  local trimmed="${AGENT_TYPE##*([[:space:]])}"
  trimmed="${trimmed%%*([[:space:]])}"

  # Strict pattern: starts with letter, ends with alphanumeric
  if [[ ! "$trimmed" =~ ^[a-z]([a-z0-9-]*[a-z0-9])?$ ]]; then
    log_error "Invalid AGENT_TYPE format: $AGENT_TYPE"
    return 1
  fi

  # Verify no relative path components
  if [[ "$trimmed" =~ \.\./ ]] || [[ "$trimmed" == "." ]]; then
    log_error "AGENT_TYPE contains path traversal: $AGENT_TYPE"
    return 1
  fi

  # Check resolved path doesn't escape root
  AGENT_PROFILE_PATH=$(realpath "$AGENT_PROFILES_ROOT/$trimmed.md" 2>/dev/null)
  if [[ $? -ne 0 ]] || ! [[ "$AGENT_PROFILE_PATH" =~ ^${AGENT_PROFILES_ROOT} ]]; then
    log_error "Agent profile path escapes profiles root"
    return 1
  fi

  AGENT_TYPE="$trimmed"
  return 0
}
```

**Success Criteria**:
- [ ] Regex enforces strict format (no leading/trailing special chars)
- [ ] Path traversal attempts rejected
- [ ] Whitespace trimming prevents bypass
- [ ] realpath verification prevents symlink attacks
- [ ] Automated tests cover 10+ attack vectors

**Effort**: 6 hours

---

**1.2.2 Validate Provider Configuration**
```bash
validate_provider_config() {
  # Whitelist valid providers
  local valid_providers="zai kimi anthropic gemini xai openrouter"

  if [[ ! " $valid_providers " =~ " $PROVIDER " ]]; then
    log_error "Invalid provider: $PROVIDER (not in whitelist)"
    return 1
  fi

  # Whitelist valid models per provider
  case "$PROVIDER" in
    zai)
      if [[ ! " glm-4-6 glm-4 glm-3 " =~ " $PROVIDER_MODEL " ]]; then
        log_error "Invalid model for zai: $PROVIDER_MODEL"
        return 1
      fi
      ;;
    anthropic)
      if [[ ! " claude-3-opus claude-3-sonnet claude-3-haiku " =~ " $PROVIDER_MODEL " ]]; then
        log_error "Invalid model for anthropic: $PROVIDER_MODEL"
        return 1
      fi
      ;;
  esac

  return 0
}
```

**Success Criteria**:
- [ ] Provider whitelist enforced
- [ ] Model whitelist per provider
- [ ] Invalid combinations rejected
- [ ] Security scanning for prompt injection

**Effort**: 6 hours

---

#### Milestone 1.3: Base Image Security (8 hours)

**Objective**: Pin images to digest for reproducibility and integrity

**Tasks**:

**1.3.1 Pin Base Image to Digest**
```dockerfile
# ❌ OLD: Mutable reference
FROM ghcr.io/triggerdotdev/trigger.dev:latest

# ✅ NEW: Immutable digest
FROM ghcr.io/triggerdotdev/trigger.dev@sha256:abc123def456...

# Add verification
RUN cosign verify --key /etc/signing-key.pub \
  ghcr.io/triggerdotdev/trigger.dev@sha256:abc123def456...
```

**Discovery Process**:
```bash
# Find current digest
docker pull ghcr.io/triggerdotdev/trigger.dev:latest
docker images --digests | grep triggerdotdev

# Extract digest
DIGEST=$(docker inspect --format='{{index .RepoDigests 0}}' ghcr.io/triggerdotdev/trigger.dev:latest)

# Update Dockerfile with full digest
sed -i "s|FROM ghcr.io/triggerdotdev/trigger.dev:latest|FROM $DIGEST|" Dockerfile.worker
```

**Success Criteria**:
- [ ] Dockerfile uses sha256 digest, not tag
- [ ] Digest verified on each build
- [ ] Image signature validation enabled
- [ ] CI/CD prevents untrusted images

**Effort**: 4 hours

---

**1.3.2 Add npm Vulnerability Scanning**
```dockerfile
# Add to Dockerfile.worker build stage
RUN npm audit --production --audit-level=moderate || \
  { echo "npm vulnerabilities found"; exit 1; }

# Use lockfile for reproducibility
COPY trigger-dev/package-lock.json ./
RUN npm ci --only=production
```

**Success Criteria**:
- [ ] npm audit runs on build
- [ ] No moderate+ vulnerabilities allowed
- [ ] package-lock.json enforced
- [ ] CVE tracking integrated

**Effort**: 4 hours

---

### Week 2: High-Priority Fixes

#### Milestone 2.1: Docker Socket Isolation (24 hours)

**Objective**: Prevent privilege escalation via docker socket

**Option A: sysbox Runtime (Recommended)**
```yaml
services:
  trigger-worker:
    runtime: sysbox-runc  # Safely runs containers-in-containers
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
```

**Benefits**:
- Native container-in-container support
- Prevents privilege escalation
- No special capabilities needed
- Transparent to applications

**Implementation**:
1. Install sysbox-runc on host
2. Update docker daemon config
3. Update docker-compose.yml
4. Test agent spawning with sysbox

**Effort**: 12 hours

---

**Option B: AppArmor Profile (Alternative)**
```apparmor
profile docker-restricted {
  # Allow docker socket read-only
  /var/run/docker.sock rw,

  # Prevent privilege escalation
  deny /dev/mem rwk,
  deny /dev/kmem rwk,
  deny /sys/module/** rwk,
  deny /sys/firmware/** rwk,

  # Restrict syscalls
  deny ptrace,
  deny signal,
}
```

**Effort**: 16 hours (more complex)

---

**Option C: Socket Filtering API (Advanced)**
Use systemd socket activation to filter Docker API calls.

**Effort**: 20 hours (most complex)

---

**Recommendation**: Use Option A (sysbox) for Week 2, implement Option B (AppArmor) in Week 3 as defense-in-depth

**Success Criteria**:
- [ ] sysbox-runc installed on test host
- [ ] Agent spawning works with sysbox
- [ ] Privilege escalation attempts blocked
- [ ] Performance impact <10%
- [ ] CI/CD updated with sysbox

---

#### Milestone 2.2: Network Policy Implementation (16 hours)

**Objective**: Segment networks to prevent lateral movement

**Implementation**:

**Task 2.2.1: Create Service-Specific Networks**
```yaml
networks:
  trigger-core:
    internal: true  # No external access
    driver: bridge

  agent-network:
    driver: overlay  # If using swarm
    internal: false  # Agents can reach internet

services:
  postgres:
    networks:
      - trigger-core  # Only backend services

  redis:
    networks:
      - trigger-core

  trigger-webapp:
    networks:
      - trigger-core

  trigger-worker:
    networks:
      - trigger-core  # Access to services
      - agent-network # Communicate with agents

  # Spawned agents on agent-network only
```

**Task 2.2.2: Implement Network Policies**
```yaml
# Kubernetes network policies (if using K8s)
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: trigger-worker-policy
spec:
  podSelector:
    matchLabels:
      app: trigger-worker
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: trigger-dev
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: postgres
      ports:
        - protocol: TCP
          port: 5432
    - to:
        - podSelector:
            matchLabels:
              app: redis
      ports:
        - protocol: TCP
          port: 6379
```

**Success Criteria**:
- [ ] trigger-core network isolated from external
- [ ] agent-network for spawned containers
- [ ] Postgres only accessible from trigger-core
- [ ] Redis only accessible from trigger-core
- [ ] Agents can reach API services only

**Effort**: 16 hours

---

### Week 3: Medium-Priority Enhancements

#### Milestone 3.1: Audit Logging (12 hours)

**Objective**: Track credential access and agent execution

**Implementation**:
```bash
# Create audit logging system
audit_log() {
  local event="$1"
  local agent_type="$2"
  local provider="$3"
  local status="$4"

  # Log to file and syslog
  {
    echo "$(date -Iseconds) | EVENT=$event | AGENT=$agent_type | PROVIDER=$provider | STATUS=$status"
  } | tee -a /var/log/trigger-agent-audit.log | logger -t trigger-audit
}

# Log each significant event
audit_log "AGENT_SPAWN" "$AGENT_TYPE" "$PROVIDER" "START"
audit_log "PROVIDER_CONFIG" "$AGENT_TYPE" "$PROVIDER" "SUCCESS"
audit_log "API_KEY_ACCESS" "$AGENT_TYPE" "$PROVIDER" "AUTH_REQUESTED"
audit_log "AGENT_SPAWN" "$AGENT_TYPE" "$PROVIDER" "COMPLETE"
```

**Effort**: 8 hours

---

#### Milestone 3.2: Runtime Security with Falco (12 hours)

**Objective**: Detect suspicious container behavior

**Implementation**:
```bash
# Deploy Falco for runtime monitoring
docker run -d --name falco \
  --cap-add SYS_PTRACE \
  --cap-add SYS_RESOURCE \
  -v /var/run/docker.sock:/host/var/run/docker.sock \
  -v /proc:/host/proc:ro \
  -v /sys:/host/sys:ro \
  falcosecurity/falco:latest

# Custom rules for agent containers
- rule: Unauthorized Docker API Access
  desc: Agent attempts to use docker API
  condition: container and proc.name=docker and container.name=agent-*
  output: Unauthorized docker access (user=%user.name container=%container.name)
  priority: CRITICAL
```

**Effort**: 8 hours

---

#### Milestone 3.3: File Permission Hardening (8 hours)

**Objective**: Tighten permissions on sensitive files

**Tasks**:

**3.3.1: Restrict Agent Profiles**
```dockerfile
COPY .claude/agents/cfn-dev-team /triggerdotdev/.claude/agents/cfn-dev-team

# Restrict access to profiles
RUN chmod 700 /triggerdotdev/.claude/agents && \
    chmod 600 /triggerdotdev/.claude/agents/**/*.md && \
    chown -R node:node /triggerdotdev/.claude/agents
```

**3.3.2: Secure Temp Directory**
```dockerfile
RUN mkdir -p /tmp/trigger-dev-deliverables && \
    chown node:node /tmp/trigger-dev-deliverables && \
    chmod 700 /tmp/trigger-dev-deliverables  # Only owner
```

**Success Criteria**:
- [ ] Agent profiles 600 (not world-readable)
- [ ] Temp directory 700 (not world-writable)
- [ ] No world-readable secrets files
- [ ] Ownership enforced (node:node)

**Effort**: 4 hours

---

#### Milestone 3.4: Credential Rotation Framework (12 hours)

**Objective**: Enable API key rotation without downtime

**Implementation**:
```bash
# Credential rotation script
rotate_credentials() {
  local provider=$1
  local days_until_expiry=30

  echo "Rotating credentials for $provider..."

  # Request new token from provider
  case "$provider" in
    zai)
      NEW_TOKEN=$(curl -X POST https://api.z.ai/v1/auth/rotate \
        -H "Authorization: Bearer $(cat /run/secrets/zai_api_key)" \
        -H "Content-Type: application/json" \
        -d "{\"expires_in\": \"$(( days_until_expiry * 86400 ))\"}" \
        | jq -r '.token')
      ;;
  esac

  # Update secret without downtime
  docker secret rm zai_api_key || true
  docker secret create zai_api_key <(echo "$NEW_TOKEN")

  # Drain workers gracefully
  docker service update --force trigger-worker

  # Log rotation event
  audit_log "CREDENTIAL_ROTATION" "$provider" "SUCCESS"
}

# Schedule rotation (every 30 days)
# 0 2 * * * /path/to/rotate_credentials zai
```

**Success Criteria**:
- [ ] Credentials can rotate without manual updates
- [ ] No downtime during rotation
- [ ] Old credentials revoked after rotation
- [ ] Audit log captures rotation events

**Effort**: 8 hours

---

### Week 4: Compliance and Automation

#### Milestone 4.1: CIS Docker Benchmark Automation (16 hours)

**Objective**: Automated compliance validation

**Implementation**:
```bash
# CIS Benchmark check script
check_cis_docker_benchmark() {
  local score=0
  local max=100

  # 4.1: Create a user for the container
  if grep -q "^USER" Dockerfile.worker; then
    ((score += 5))
  fi

  # 5.1: Verify AppArmor Profile
  if docker inspect trigger-worker | grep -q "apparmor"; then
    ((score += 5))
  fi

  # 5.27: Restrict PIDs cgroup limit
  if docker inspect trigger-worker | grep -q "PidsLimit"; then
    ((score += 5))
  fi

  # ... additional checks ...

  echo "CIS Benchmark Score: $score / $max"
  [[ $score -ge 80 ]] && return 0 || return 1
}

# CI/CD Integration
check_cis_docker_benchmark || {
  echo "CIS Benchmark score below threshold"
  exit 1
}
```

**Effort**: 8 hours

---

#### Milestone 4.2: Image Vulnerability Scanning (8 hours)

**Objective**: Automated CVE detection in images

**Implementation**:
```bash
# Add to CI/CD pipeline
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy:latest image \
  --severity HIGH,CRITICAL \
  --exit-code 1 \
  trigger-dev-worker:latest

# Policy enforcement
--format json \
--output scan-results.json \
--fail-on-severity CRITICAL
```

**Effort**: 4 hours

---

#### Milestone 4.3: Documentation and Training (8 hours)

**Objective**: Ensure team understands security architecture

**Deliverables**:
- Security architecture diagram
- Credential management runbook
- Incident response procedures
- Agent spawning best practices
- Troubleshooting guide

**Effort**: 8 hours

---

## Testing Strategy

### Security Test Suite

```bash
# Create comprehensive test suite
tests/security/
├── test-credential-isolation.sh      # Verify env var isolation
├── test-input-validation.sh          # Path traversal attempts
├── test-docker-socket-isolation.sh   # Privilege escalation blocked
├── test-secret-redaction.sh          # Debug mode verification
├── test-network-policies.sh          # Network segmentation
└── test-base-image-integrity.sh      # Image digest validation
```

### Test Coverage Goals
- Path traversal: 10+ attack vectors
- Credential exposure: 5+ scenarios
- Privilege escalation: 8+ techniques
- Network access: 6+ lateral movement attempts
- Supply chain: 4+ image tampering scenarios

---

## Validation Gates

### Phase 1.2 Completion Criteria

**Must Have (Blocking)**:
- [ ] All 4 CRITICAL issues resolved
- [ ] Security consensus score ≥0.90
- [ ] npm audit passes
- [ ] No secrets in docker logs
- [ ] Base image pinned to digest
- [ ] Docker socket isolated (sysbox or AppArmor)

**Should Have (Highly Recommended)**:
- [ ] Network policies enforced
- [ ] Audit logging implemented
- [ ] Input validation hardened
- [ ] File permissions tightened
- [ ] CIS Benchmark score ≥85%

**Nice to Have (Future Phases)**:
- [ ] Credential rotation automated
- [ ] Falco runtime monitoring
- [ ] SIEM integration
- [ ] Penetration test results

---

## Effort Summary

| Phase | Week | Hours | Effort |
|---|---|---|---|
| Critical Fixes | Week 1 | 40 | HIGH |
| High Priority | Week 2 | 40 | HIGH |
| Medium Priority | Week 3 | 44 | MEDIUM |
| Compliance | Week 4 | 32 | LOW |
| **Total** | **4 weeks** | **156** | **2-3 devs** |

**Target Completion**: 2 weeks (if 2 engineers, parallel work)

---

## Success Metrics

### Security Score Progression
- Week 0: 0.78 (Requires Hardening)
- Week 1: 0.82 (Credentials Secured)
- Week 2: 0.88 (Docker & Network Secured)
- Week 3: 0.91 (Monitoring & Logging)
- Week 4: 0.94 (Compliance Ready)

### Production Readiness Criteria
- Security consensus score ≥ 0.92
- All CRITICAL issues resolved
- All HIGH issues resolved
- CIS Docker Benchmark ≥85%
- Zero unpatched CVEs
- Audit logging functional
- Network policies enforced

---

## Decision Points

**Week 1 Checkpoint**:
- Are all CRITICAL issues resolved?
- YES → Proceed to Week 2
- NO → Extend Week 1

**Week 2 Checkpoint**:
- Does docker socket isolation work?
- YES → Proceed to Week 3
- NO → Try alternative approach (AppArmor vs sysbox)

**Week 3 Checkpoint**:
- Is security score ≥0.90?
- YES → Proceed to Week 4
- NO → Identify remaining gaps

**Week 4 Checkpoint**:
- Is score ≥0.92 and all blocking criteria met?
- YES → APPROVED FOR PRODUCTION
- NO → Extend Week 4 or defer non-blocking items

---

## Cost Estimate

**Resource Requirements**:
- 2-3 senior security/DevOps engineers: 2 weeks
- Infrastructure for testing: $500-1000
- Tools (Trivy, sysbox, Falco): Free/OSS
- **Total estimated cost**: $12,000-18,000

**ROI**:
- Prevents credential breach (potential $1M+ impact)
- Compliance enablement (regulatory requirements)
- Production confidence (enables customer deployments)

---

## Escalation Path

**If blocking issues discovered**:
1. Alert CTO immediately
2. Assess impact to production timeline
3. Decide: Defer to Phase 1.3 or extend timeline
4. Update project dependencies

**If schedule slips**:
1. Identify critical path blocker
2. Reallocate resources
3. Descope non-blocking items (defer to Phase 1.3)
4. Maintain security standards

---

**Roadmap Owner**: Security Specialist
**Last Updated**: 2025-11-23
**Status**: READY FOR IMPLEMENTATION

