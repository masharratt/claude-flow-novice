# Security Recommendations: Docker Environment - Priority Action Plan

**Agent:** security-specialist-1763382731-95635
**Date:** 2025-11-17
**Status:** IMMEDIATE ACTION REQUIRED

---

## Critical Priority (Fix Immediately)

### 1. Enable Redis Server Authentication (SEC-001)

**Current State:** Redis server accepts unauthenticated connections
**Risk Score:** 9.1/10 (CRITICAL)
**Impact:** Complete system compromise, data loss, task queue manipulation

**Fix:**
```yaml
# File: docker/docker-compose.yml (line 13)
# CHANGE FROM:
command: redis-server --save 60 1 --loglevel warning

# CHANGE TO:
command: redis-server --save 60 1 --loglevel warning --requirepass ${CFN_REDIS_PASSWORD}
```

**Additional Hardening:**
```yaml
# Disable dangerous commands
command: redis-server \
  --save 60 1 \
  --loglevel warning \
  --requirepass ${CFN_REDIS_PASSWORD} \
  --rename-command FLUSHALL "" \
  --rename-command FLUSHDB "" \
  --rename-command CONFIG ""
```

**Testing:**
```bash
# After fix, verify authentication required
docker exec cfn-redis redis-cli PING
# Expected: (error) NOAUTH Authentication required

# Verify authenticated access works
docker exec cfn-redis redis-cli -a "$REDIS_PASSWORD" PING
# Expected: PONG
```

**Estimated Time:** 15 minutes
**Assignee:** DevOps Lead

---

### 2. Verify .env Gitignore and Key Rotation (SEC-002)

**Current State:** Multiple API keys in .env file (potential leak risk)
**Risk Score:** 8.1/10 (CRITICAL)
**Impact:** Unauthorized API usage, cost abuse, data breach

**Immediate Verification:**
```bash
# 1. Check .env is gitignored
git check-ignore .env
# Expected output: .env

# 2. Check .env never committed
git log --all --full-history -- ".env"
# Expected: (empty output)

# 3. If .env was committed (EMERGENCY):
git rm --cached .env
echo ".env" >> .gitignore
git add .gitignore
git commit -m "chore: ensure .env excluded from version control"

# 4. IMMEDIATELY rotate ALL API keys:
# - ANTHROPIC_API_KEY
# - ZAI_API_KEY
# - KIMI_API_KEY
# - OPENROUTER_API_KEY
# - N8N_API_KEY
# - NPM_API_KEY
```

**Pre-commit Hook Installation:**
```bash
# Install git-secrets to prevent future leaks
brew install git-secrets  # macOS
# or
sudo apt-get install git-secrets  # Linux

git secrets --install
git secrets --register-aws
git secrets --add 'sk-[a-zA-Z0-9]{32,}'  # Anthropic keys
git secrets --add 'npm_[a-zA-Z0-9]{32,}'  # NPM keys
```

**Estimated Time:** 1 hour (verification + rotation if needed)
**Assignee:** Security Lead + DevOps Lead

---

## High Priority (Fix Within 7 Days)

### 3. Implement Server-Side Authentication Tests (SEC-003)

**Current State:** Tests only validate client-side auth, not server enforcement
**Risk Score:** 7.2/10 (HIGH)
**Impact:** Authentication bypass vulnerabilities go undetected

**Implementation:**
```javascript
// File: config/redis.config.test.js
// Add new test suite:

describe('Redis Server Authentication Enforcement', () => {
  test('should reject unauthenticated connections', async () => {
    const client = redis.createClient({
      url: 'redis://cfn-redis:6379',
      password: undefined
    });

    await expect(client.connect()).rejects.toThrow('NOAUTH');
  });

  test('should reject incorrect password', async () => {
    const client = redis.createClient({
      url: 'redis://cfn-redis:6379',
      password: 'wrong-password-12345'
    });

    await expect(client.connect()).rejects.toThrow('WRONGPASS');
  });

  test('should accept correct password', async () => {
    const client = redis.createClient({
      url: 'redis://cfn-redis:6379',
      password: process.env.REDIS_PASSWORD
    });

    await expect(client.connect()).resolves.not.toThrow();
    await client.ping();
    await client.quit();
  });

  test('should reject commands without authentication', async () => {
    const client = redis.createClient({
      url: 'redis://cfn-redis:6379',
      password: undefined
    });

    try {
      await client.connect();
      await expect(client.ping()).rejects.toThrow('NOAUTH');
    } catch (err) {
      // Connection should fail before command execution
      expect(err.message).toContain('NOAUTH');
    }
  });
});
```

**CI/CD Integration:**
```yaml
# .github/workflows/security-tests.yml
name: Security Tests
on: [push, pull_request]

jobs:
  redis-auth-test:
    runs-on: ubuntu-latest
    services:
      redis:
        image: redis:7-alpine
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        env:
          REDIS_PASSWORD: test-password-for-ci
        ports:
          - 6379:6379

    steps:
      - uses: actions/checkout@v3
      - name: Run Redis auth tests
        run: npm test -- redis.config.test.js
        env:
          REDIS_PASSWORD: test-password-for-ci
```

**Estimated Time:** 4 hours
**Assignee:** Backend Developer + QA Engineer

---

## Medium Priority (Fix Within 30 Days)

### 4. Add Password Strength Validation (SEC-004)

**Current State:** No runtime validation of password strength
**Risk Score:** 5.1/10 (MEDIUM)
**Impact:** Weak passwords could be deployed without detection

**Implementation:**
```bash
# File: docker/coordinator-entrypoint.sh
# Add after line 30 (before main coordinator logic):

# Password strength validation
if [[ -n "$CFN_REDIS_PASSWORD" ]]; then
    PW_LENGTH=${#CFN_REDIS_PASSWORD}
    MIN_LENGTH=32

    if [[ $PW_LENGTH -lt $MIN_LENGTH ]]; then
        echo "❌ SECURITY ERROR: REDIS_PASSWORD too weak"
        echo "   Current length: $PW_LENGTH characters"
        echo "   Minimum required: $MIN_LENGTH characters"
        echo "   Generate strong password: openssl rand -base64 32"
        exit 1
    fi

    echo "✅ Redis password validated: $PW_LENGTH characters (minimum $MIN_LENGTH)"

    # Check password entropy (optional)
    if [[ "$CFN_REDIS_PASSWORD" =~ ^[a-zA-Z0-9+/=]+$ ]]; then
        echo "✅ Password format: Base64 encoded (recommended)"
    else
        echo "⚠️  Warning: Password not Base64 format (still valid but less entropy)"
    fi
else
    echo "⚠️  Warning: REDIS_PASSWORD not set (authentication disabled)"
fi
```

**Estimated Time:** 1 hour
**Assignee:** DevOps Lead

---

### 5. Implement Inline JSON Size Validation (SEC-006)

**Current State:** Environment variable content not validated for size
**Risk Score:** 4.9/10 (MEDIUM)
**Impact:** Memory exhaustion via environment variable injection

**Implementation:**
```bash
# File: docker/coordinator-entrypoint.sh
# Add after line 80 (where inline JSON is loaded):

# Validate inline JSON size
INLINE_SIZE=${#SUCCESS_CRITERIA}
MAX_INLINE_SIZE=$((10 * 1024 * 1024))  # 10MB

if [[ $INLINE_SIZE -gt $MAX_INLINE_SIZE ]]; then
    echo "❌ ERROR: Inline success criteria exceeds 10MB limit"
    echo "   Inline size: $((INLINE_SIZE / 1024 / 1024))MB"
    echo "   Maximum allowed: 10MB"
    echo "   Security Risk: DoS via memory exhaustion prevented"
    exit 1
fi

echo "✅ Inline JSON validated: $((INLINE_SIZE / 1024))KB (max 10MB)"
```

**Estimated Time:** 30 minutes
**Assignee:** Backend Developer

---

### 6. Docker Socket Security Hardening (SEC-005)

**Current State:** Coordinator has docker.sock access (required by architecture)
**Risk Score:** 5.8/10 (MEDIUM - justified but monitored)
**Impact:** Coordinator compromise = full system compromise

**Short-Term Mitigation (Monitoring):**
```bash
# Install Falco for runtime security monitoring
# File: docker/docker-compose.monitoring.yml

services:
  falco:
    image: falcosecurity/falco:latest
    privileged: true
    volumes:
      - /var/run/docker.sock:/host/var/run/docker.sock
      - /dev:/host/dev
      - /proc:/host/proc:ro
      - /boot:/host/boot:ro
      - /lib/modules:/host/lib/modules:ro
      - ./falco-rules.yaml:/etc/falco/falco_rules.local.yaml
    environment:
      - FALCO_GRPC_ENABLED=true
    command:
      - /usr/bin/falco
      - --cri
      - /host/var/run/docker.sock
      - -r
      - /etc/falco/falco_rules.local.yaml
```

**Falco Rules:**
```yaml
# File: docker/falco-rules.yaml
- rule: Unauthorized Docker Socket Access
  desc: Detect container accessing docker.sock without authorization
  condition: >
    container and
    fd.name contains /var/run/docker.sock and
    not container.name in (cfn-coordinator, falco)
  output: >
    Unauthorized docker socket access
    (container=%container.name image=%container.image.repository)
  priority: CRITICAL

- rule: Suspicious Docker API Call
  desc: Detect potentially malicious Docker API operations
  condition: >
    container.name = cfn-coordinator and
    (proc.name = docker and proc.args contains "--privileged" or
     proc.args contains "/:/host")
  output: >
    Suspicious Docker API call from coordinator
    (command=%proc.cmdline container=%container.name)
  priority: WARNING
```

**Long-Term Solution (Docker-in-Docker):**
```yaml
# Future architecture (Quarter 2)
services:
  cfn-coordinator:
    # Remove docker.sock mount
    volumes:
      - /workspace:/workspace:rw
    environment:
      - DOCKER_HOST=tcp://docker-dind:2376
      - DOCKER_TLS_VERIFY=1
      - DOCKER_CERT_PATH=/certs/client

  docker-dind:
    image: docker:dind
    privileged: true  # Isolated to this container
    volumes:
      - docker-certs:/certs
    environment:
      - DOCKER_TLS_CERTDIR=/certs
```

**Estimated Time:**
- Monitoring setup: 4 hours
- Docker-in-Docker migration: 16 hours (future)

**Assignee:** Security Engineer + DevOps Lead

---

### 7. Migrate to Secrets Management (SEC-007)

**Current State:** .env file stored in plaintext
**Risk Score:** 5.5/10 (MEDIUM)
**Impact:** Filesystem compromise exposes all credentials

**Phase 1: Docker Secrets (Immediate - 2 hours):**
```yaml
# File: docker-compose.production.yml
version: '3.8'

services:
  cfn-coordinator:
    secrets:
      - redis_password
      - anthropic_api_key
      - zai_api_key
    environment:
      # Reference secrets instead of .env
      - CFN_REDIS_PASSWORD=/run/secrets/redis_password
      - ANTHROPIC_API_KEY=/run/secrets/anthropic_api_key
      - ZAI_API_KEY=/run/secrets/zai_api_key

secrets:
  redis_password:
    file: ./secrets/redis_password.txt  # Not committed, deployed separately
  anthropic_api_key:
    file: ./secrets/anthropic_api_key.txt
  zai_api_key:
    file: ./secrets/zai_api_key.txt
```

**Phase 2: AWS Secrets Manager (Month 2 - 8 hours):**
```javascript
// File: config/secrets-loader.js
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

async function loadSecret(secretName) {
  const client = new SecretsManagerClient({ region: 'us-west-2' });

  try {
    const response = await client.send(
      new GetSecretValueCommand({ SecretId: secretName })
    );

    return JSON.parse(response.SecretString);
  } catch (error) {
    console.error(`Failed to load secret ${secretName}:`, error);
    throw error;
  }
}

module.exports = { loadSecret };
```

**Phase 3: Automatic Rotation (Month 3 - 16 hours):**
```javascript
// AWS Lambda function for automatic key rotation
exports.handler = async (event) => {
  const secretsManager = new AWS.SecretsManager();

  // Rotate Redis password every 90 days
  const newPassword = crypto.randomBytes(32).toString('base64');

  await secretsManager.updateSecret({
    SecretId: 'cfn/redis/password',
    SecretString: newPassword
  }).promise();

  // Restart containers to pick up new password
  const ecs = new AWS.ECS();
  await ecs.updateService({
    service: 'cfn-coordinator',
    forceNewDeployment: true
  }).promise();

  return { statusCode: 200, body: 'Password rotated successfully' };
};
```

**Estimated Time:** 26 hours (phased)
**Assignee:** DevOps Lead + Backend Developer

---

## Low Priority (Monitor)

### 8. Replace Telemetry Docker Socket with cAdvisor (SEC-008)

**Current State:** Telemetry service mounts docker.sock for metrics
**Risk Score:** 3.2/10 (LOW)
**Impact:** Unnecessary attack surface in non-production environment

**Implementation:**
```yaml
# File: docker/docker-compose.stabilization.yml
# REMOVE docker.sock mount from cfn-telemetry

# ADD cAdvisor service
services:
  cadvisor:
    image: gcr.io/cadvisor/cadvisor:v0.47.0
    container_name: cfn-cadvisor
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro
      # NO docker.sock mount required
    ports:
      - "8080:8080"
    networks:
      - mcp-network
    restart: unless-stopped
```

**Estimated Time:** 2 hours
**Assignee:** DevOps Engineer

---

### 9. Clean Up Duplicate .env Variables (SEC-009)

**Current State:** Multiple duplicate entries in .env
**Risk Score:** 2.1/10 (LOW)
**Impact:** Configuration drift, maintenance burden

**Fix:**
```bash
# Manual cleanup of .env file
# Remove duplicate entries:
# - ENABLE_SDK_INTEGRATION (appears 4 times, keep 1)
# - SDK_INTEGRATION_MODE (appears 3 times, keep 1)
# - ENABLE_SDK_CACHING (appears 3 times, keep 1)
# - ENABLE_CONTEXT_EDITING (appears 3 times, keep 1)
# - SDK_CONFIDENCE_THRESHOLD (appears 3 times, keep 1)
# - SDK_MAX_RETRIES (appears 3 times, keep 1)
# - SDK_MINIMUM_COVERAGE (appears 3 times, keep 1)

# Automated deduplication:
sort -u .env -o .env.deduplicated
mv .env .env.backup
mv .env.deduplicated .env
```

**Estimated Time:** 15 minutes
**Assignee:** Any developer

---

## Implementation Timeline

```
Week 1 (Immediate):
├─ Day 1: SEC-001 (Redis auth) + SEC-002 (verify .env gitignore)
├─ Day 2: SEC-002 (key rotation if needed)
├─ Day 3: SEC-003 (auth tests - start)
├─ Day 4: SEC-003 (auth tests - complete)
└─ Day 5: SEC-004 (password validation)

Week 2-4 (High Priority):
├─ Week 2: SEC-003 CI/CD integration
├─ Week 3: SEC-006 (inline JSON validation)
└─ Week 4: SEC-005 (Falco monitoring setup)

Month 2-3 (Medium Priority):
├─ Month 2: SEC-007 Phase 2 (AWS Secrets Manager)
├─ Month 3: SEC-007 Phase 3 (automatic rotation)
└─ Ongoing: SEC-005 long-term (Docker-in-Docker evaluation)

Anytime (Low Priority):
├─ SEC-008 (cAdvisor migration)
└─ SEC-009 (.env cleanup)
```

---

## Success Criteria

### Week 1 Completion:
- [ ] Redis requires authentication (verify with `redis-cli PING`)
- [ ] .env confirmed in .gitignore
- [ ] .env never committed to git history
- [ ] Server-side auth tests implemented and passing
- [ ] Password validation enforced at coordinator startup

### Month 1 Completion:
- [ ] All critical and high priority items resolved
- [ ] Security tests integrated into CI/CD pipeline
- [ ] Falco runtime monitoring operational
- [ ] Inline JSON validation enforced

### Quarter 1 Completion:
- [ ] AWS Secrets Manager migration complete
- [ ] Automatic credential rotation operational
- [ ] Docker-in-Docker architecture evaluated
- [ ] All medium priority items resolved

---

## Contact and Escalation

**Security Lead:** [Contact TBD]
**DevOps Lead:** [Contact TBD]
**Backend Lead:** [Contact TBD]

**Escalation Path:**
1. Security Engineer (implementation issues)
2. Security Lead (risk acceptance decisions)
3. CTO (architectural changes)

**Security Incident Hotline:** [TBD]

---

**Document Status:** ACTIVE
**Next Review:** 2025-11-24 (7 days)
**Owner:** Security Team
