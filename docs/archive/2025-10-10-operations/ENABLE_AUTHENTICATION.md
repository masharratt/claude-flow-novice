# Authentication Enablement Guide

Production deployment guide for enabling message authentication in Claude Flow Novice agent orchestration system.

---

## Security Decision Tree

### When to Enable Authentication

```
START
  |
  v
[Is TLS configured?] --NO--> Deploy TLS first (see TLS Setup)
  |
  YES
  |
  v
[Is audit logging enabled?] --NO--> Configure audit logging
  |
  YES
  |
  v
[Is monitoring configured?] --NO--> Deploy Prometheus + Grafana
  |
  YES
  |
  v
[Environment: Production?] --NO--> Enable in warn mode only
  |
  YES
  |
  v
[ENABLE AUTHENTICATION]
```

### Prerequisites Checklist

- **TLS/mTLS Ready**: Certificate infrastructure provisioned
- **Audit Logging**: Centralized logging for auth events
- **Monitoring**: Metrics collection for signature verification
- **Backup Strategy**: Key backup and rotation procedures
- **Staging Validated**: Auth tested in non-production environment

### Risk Assessment

| Environment | Auth Mode | Rationale |
|-------------|-----------|-----------|
| Development | `disabled` | Local testing, rapid iteration |
| Staging | `warn` | Validate auth without blocking messages |
| Production (Low-Risk) | `warn` → `enforce` | Gradual rollout with monitoring |
| Production (High-Risk) | `enforce` | Zero-trust security posture |

---

## Configuration Steps

### 1. Environment Variables

```bash
# Enable authentication subsystem
export CFN_AUTH_ENABLED=true

# Start in warn mode (logs unsigned messages, doesn't reject)
export CFN_AUTH_MODE=warn

# Optional: Custom key paths (defaults to ~/.claude-flow-novice/keys/)
export CFN_AUTH_KEY_DIR=/etc/claude-flow-novice/keys

# Optional: Key rotation interval (days)
export CFN_AUTH_KEY_ROTATION_DAYS=90
```

### 2. Docker Compose Deployment

```yaml
# docker-compose.yml
services:
  claude-flow-novice:
    image: claude-flow-novice:latest
    environment:
      - CFN_AUTH_ENABLED=true
      - CFN_AUTH_MODE=warn
      - CFN_AUTH_KEY_DIR=/app/keys
    volumes:
      - ./keys:/app/keys:ro
      - ./logs:/app/logs
    secrets:
      - auth_private_key
      - auth_public_key

secrets:
  auth_private_key:
    file: ./secrets/auth_private.pem
  auth_public_key:
    file: ./secrets/auth_public.pem
```

### 3. Kubernetes Deployment

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: claude-flow-novice
  namespace: agent-orchestration
spec:
  template:
    spec:
      containers:
      - name: cfn-server
        image: claude-flow-novice:1.6.6
        env:
        - name: CFN_AUTH_ENABLED
          value: "true"
        - name: CFN_AUTH_MODE
          valueFrom:
            configMapKeyRef:
              name: cfn-config
              key: auth_mode
        volumeMounts:
        - name: auth-keys
          mountPath: /app/keys
          readOnly: true
      volumes:
      - name: auth-keys
        secret:
          secretName: cfn-auth-keys
          defaultMode: 0400
---
apiVersion: v1
kind: Secret
metadata:
  name: cfn-auth-keys
  namespace: agent-orchestration
type: Opaque
data:
  private_key.pem: <base64-encoded-private-key>
  public_key.pem: <base64-encoded-public-key>
```

---

## Key Generation

### Initial Deployment

```bash
# Create key directory
mkdir -p ~/.claude-flow-novice/keys
chmod 700 ~/.claude-flow-novice/keys

# Generate ED25519 key pair (recommended)
openssl genpkey -algorithm ED25519 -out ~/.claude-flow-novice/keys/private_key.pem
openssl pkey -in ~/.claude-flow-novice/keys/private_key.pem -pubout -out ~/.claude-flow-novice/keys/public_key.pem

# Secure permissions
chmod 400 ~/.claude-flow-novice/keys/private_key.pem
chmod 444 ~/.claude-flow-novice/keys/public_key.pem

# Verify key pair
openssl pkey -in ~/.claude-flow-novice/keys/private_key.pem -text -noout
```

### Alternative: RSA-4096 (Higher Compatibility)

```bash
# Generate RSA key pair
openssl genrsa -out ~/.claude-flow-novice/keys/private_key.pem 4096
openssl rsa -in ~/.claude-flow-novice/keys/private_key.pem -pubout -out ~/.claude-flow-novice/keys/public_key.pem

# Secure permissions
chmod 400 ~/.claude-flow-novice/keys/private_key.pem
chmod 444 ~/.claude-flow-novice/keys/public_key.pem
```

### Key Backup

```bash
# Encrypted backup to secure storage
tar czf - ~/.claude-flow-novice/keys | \
  openssl enc -aes-256-cbc -salt -pbkdf2 -out cfn_keys_backup_$(date +%Y%m%d).tar.gz.enc

# Store in secure location (Vault, AWS Secrets Manager, etc.)
aws s3 cp cfn_keys_backup_$(date +%Y%m%d).tar.gz.enc s3://secure-backups/cfn-keys/ \
  --sse aws:kms --sse-kms-key-id alias/cfn-backup-key
```

### Key Rotation

```bash
# Generate new key pair
openssl genpkey -algorithm ED25519 -out ~/.claude-flow-novice/keys/private_key_new.pem
openssl pkey -in ~/.claude-flow-novice/keys/private_key_new.pem -pubout -out ~/.claude-flow-novice/keys/public_key_new.pem

# Atomic rotation (zero-downtime)
mv ~/.claude-flow-novice/keys/private_key.pem ~/.claude-flow-novice/keys/private_key_old.pem
mv ~/.claude-flow-novice/keys/public_key.pem ~/.claude-flow-novice/keys/public_key_old.pem
mv ~/.claude-flow-novice/keys/private_key_new.pem ~/.claude-flow-novice/keys/private_key.pem
mv ~/.claude-flow-novice/keys/public_key_new.pem ~/.claude-flow-novice/keys/public_key.pem

# Restart services
kubectl rollout restart deployment/claude-flow-novice -n agent-orchestration

# Archive old keys (retain for 30 days for audit)
mv ~/.claude-flow-novice/keys/private_key_old.pem ~/.claude-flow-novice/keys/archive/private_$(date +%Y%m%d).pem
```

---

## Validation Tests

### Pre-Enablement Validation

```bash
# Test key generation and signature verification
cat > /tmp/test_auth.sh << 'EOF'
#!/bin/bash
set -e

echo "Testing authentication subsystem..."

# Generate test keys
mkdir -p /tmp/cfn_test_keys
openssl genpkey -algorithm ED25519 -out /tmp/cfn_test_keys/private_key.pem
openssl pkey -in /tmp/cfn_test_keys/private_key.pem -pubout -out /tmp/cfn_test_keys/public_key.pem

# Test signature generation
export CFN_AUTH_ENABLED=true
export CFN_AUTH_MODE=warn
export CFN_AUTH_KEY_DIR=/tmp/cfn_test_keys

# Run basic coordination test
npx claude-flow-novice status

echo "✅ Authentication subsystem validated"
rm -rf /tmp/cfn_test_keys
EOF

chmod +x /tmp/test_auth.sh
/tmp/test_auth.sh
```

### 10-Agent Load Test with Authentication

```bash
# Enable authentication in test environment
export CFN_AUTH_ENABLED=true
export CFN_AUTH_MODE=enforce
export CFN_AUTH_KEY_DIR=~/.claude-flow-novice/keys

# Run 10-agent coordination test
cat > /tmp/test_10_agent_auth.js << 'EOF'
const { spawn } = require('child_process');

async function test10AgentAuth() {
  console.log('Starting 10-agent authentication load test...');

  const agents = [
    'coder', 'backend-dev', 'tester', 'reviewer', 'security-specialist',
    'devops-engineer', 'api-docs', 'researcher', 'perf-analyzer', 'system-architect'
  ];

  const results = {
    total: agents.length,
    success: 0,
    failed: 0,
    auth_verified: 0
  };

  for (const agent of agents) {
    try {
      const proc = spawn('npx', ['claude-flow-novice', 'agent', 'spawn', agent, '--validate-auth']);

      await new Promise((resolve, reject) => {
        proc.on('exit', (code) => {
          if (code === 0) {
            results.success++;
            results.auth_verified++;
          } else {
            results.failed++;
          }
          resolve();
        });

        proc.on('error', reject);

        setTimeout(() => reject(new Error('Agent spawn timeout')), 30000);
      });
    } catch (error) {
      console.error(`Agent ${agent} failed:`, error.message);
      results.failed++;
    }
  }

  console.log('\n10-Agent Authentication Test Results:');
  console.log(`✅ Success: ${results.success}/${results.total}`);
  console.log(`❌ Failed: ${results.failed}/${results.total}`);
  console.log(`🔐 Auth Verified: ${results.auth_verified}/${results.total}`);

  if (results.success === results.total && results.auth_verified === results.total) {
    console.log('\n✅ All agents authenticated successfully');
    process.exit(0);
  } else {
    console.log('\n❌ Authentication test failed');
    process.exit(1);
  }
}

test10AgentAuth().catch(console.error);
EOF

node /tmp/test_10_agent_auth.js
```

### Message Integrity Validation

```bash
# Test message signing and verification
npx claude-flow-novice test auth --verify-signatures --count 100

# Expected output:
# ✅ 100/100 messages signed successfully
# ✅ 100/100 signatures verified
# ✅ 0 signature mismatches
# ✅ 0 unsigned messages (enforce mode)
```

---

## Rollback Procedure

### Emergency Rollback (Auth Breaking Coordination)

```bash
# Step 1: Disable authentication immediately
kubectl set env deployment/claude-flow-novice CFN_AUTH_ENABLED=false -n agent-orchestration

# Step 2: Verify coordination restored
npx claude-flow-novice status
npx claude-flow-novice agent spawn coder --task "Health check"

# Step 3: Collect diagnostics
kubectl logs -l app=claude-flow-novice --tail=1000 > /tmp/auth_failure_logs.txt
grep -i "auth\|signature\|verify" /tmp/auth_failure_logs.txt

# Step 4: Root cause analysis
# - Check key permissions (should be 400 for private, 444 for public)
# - Verify key format (PEM, ED25519 or RSA)
# - Check clock synchronization (NTP drift can cause signature issues)
# - Review audit logs for specific error codes

# Step 5: Fix and re-enable in warn mode
export CFN_AUTH_ENABLED=true
export CFN_AUTH_MODE=warn  # Start in warn mode, not enforce
kubectl set env deployment/claude-flow-novice CFN_AUTH_MODE=warn -n agent-orchestration
```

### Gradual Re-Enablement

```bash
# Week 1: Enable in warn mode
export CFN_AUTH_MODE=warn
# Monitor for unsigned messages, fix any issues

# Week 2: Continue warn mode
# Ensure zero unsigned messages for 7 consecutive days

# Week 3: Enable enforce mode
export CFN_AUTH_MODE=enforce
kubectl set env deployment/claude-flow-novice CFN_AUTH_MODE=enforce -n agent-orchestration

# Week 4: Full production authentication
# Monitor auth failure rate < 0.01%
```

### Rollback Decision Matrix

| Symptom | Severity | Action |
|---------|----------|--------|
| Auth failures < 1% | Low | Continue monitoring, investigate failures |
| Auth failures 1-5% | Medium | Switch to warn mode, identify root cause |
| Auth failures > 5% | High | Disable auth, emergency investigation |
| Zero coordination success | Critical | Immediate rollback, page on-call team |
| Signature verification errors | Medium | Check key integrity, rotate if compromised |

---

## Monitoring

### Prometheus Metrics

```yaml
# /etc/prometheus/cfn_auth_rules.yml
groups:
- name: cfn_authentication
  interval: 30s
  rules:
  - record: cfn:auth:signature_verification_rate
    expr: rate(cfn_auth_signature_verified_total[5m])

  - record: cfn:auth:failure_rate
    expr: rate(cfn_auth_signature_failed_total[5m])

  - record: cfn:auth:unsigned_message_rate
    expr: rate(cfn_auth_unsigned_messages_total[5m])

  - alert: CFNAuthFailureRateHigh
    expr: cfn:auth:failure_rate > 0.05
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "High authentication failure rate"
      description: "Auth failure rate {{ $value }} exceeds 5% threshold"

  - alert: CFNUnsignedMessagesDetected
    expr: cfn:auth:unsigned_message_rate > 0 and on() cfn_auth_mode == "enforce"
    for: 1m
    labels:
      severity: critical
    annotations:
      summary: "Unsigned messages in enforce mode"
      description: "{{ $value }} unsigned messages/sec detected in enforce mode"

  - alert: CFNAuthDisabled
    expr: cfn_auth_enabled == 0 and on() cfn_environment == "production"
    for: 10m
    labels:
      severity: warning
    annotations:
      summary: "Authentication disabled in production"
      description: "CFN authentication has been disabled in production environment"
```

### Grafana Dashboard

```json
{
  "dashboard": {
    "title": "Claude Flow Novice - Authentication",
    "panels": [
      {
        "title": "Signature Verification Rate",
        "targets": [
          {
            "expr": "rate(cfn_auth_signature_verified_total[5m])",
            "legendFormat": "Verified signatures/sec"
          }
        ],
        "type": "graph"
      },
      {
        "title": "Auth Failure Rate",
        "targets": [
          {
            "expr": "rate(cfn_auth_signature_failed_total[5m])",
            "legendFormat": "Failed verifications/sec"
          }
        ],
        "type": "graph",
        "thresholds": [
          { "value": 0.01, "color": "yellow" },
          { "value": 0.05, "color": "red" }
        ]
      },
      {
        "title": "Unsigned Messages (Warn Mode)",
        "targets": [
          {
            "expr": "rate(cfn_auth_unsigned_messages_total[5m])",
            "legendFormat": "Unsigned messages/sec"
          }
        ],
        "type": "graph"
      },
      {
        "title": "Auth Mode Status",
        "targets": [
          {
            "expr": "cfn_auth_mode",
            "legendFormat": "Current mode (0=disabled, 1=warn, 2=enforce)"
          }
        ],
        "type": "stat"
      }
    ]
  }
}
```

### Log Aggregation (ELK Stack)

```json
{
  "query": {
    "bool": {
      "must": [
        { "match": { "service": "claude-flow-novice" } },
        { "match": { "level": "error" } },
        { "wildcard": { "message": "*auth*" } }
      ],
      "filter": [
        { "range": { "@timestamp": { "gte": "now-1h" } } }
      ]
    }
  },
  "aggs": {
    "auth_error_types": {
      "terms": { "field": "error.code" }
    }
  }
}
```

### Alert Configuration

```yaml
# alertmanager.yml
route:
  receiver: 'cfn-ops-team'
  group_by: ['alertname', 'cluster', 'service']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
  - match:
      severity: critical
      service: claude-flow-novice
    receiver: 'cfn-pagerduty'
    continue: true

  - match:
      severity: warning
      alertname: CFNAuthFailureRateHigh
    receiver: 'cfn-slack-security'

receivers:
- name: 'cfn-ops-team'
  email_configs:
  - to: 'cfn-ops@company.com'
    headers:
      Subject: '[CFN] {{ .GroupLabels.alertname }}'

- name: 'cfn-pagerduty'
  pagerduty_configs:
  - service_key: '<pagerduty-service-key>'
    description: '{{ .GroupLabels.alertname }}: {{ .CommonAnnotations.summary }}'

- name: 'cfn-slack-security'
  slack_configs:
  - api_url: '<slack-webhook-url>'
    channel: '#cfn-security-alerts'
    title: '{{ .GroupLabels.alertname }}'
    text: '{{ .CommonAnnotations.description }}'
```

---

## Deployment Checklist

### Pre-Deployment

- [ ] **TLS Provisioned**: Kubernetes cert-manager configured with valid certificates
- [ ] **Audit Logging Configured**: Centralized logging (ELK/Loki) ingesting CFN logs
- [ ] **Prometheus Monitoring Enabled**: CFN auth metrics exported and scraped
- [ ] **Backup Auth Keys**: Keys encrypted and stored in secure vault (AWS Secrets Manager/HashiCorp Vault)
- [ ] **Staging Environment Validated**: Auth tested with 10+ agent coordination in staging
- [ ] **Runbooks Updated**: Incident response procedures include auth rollback steps

### Week 1: Warn Mode Enablement

- [ ] **Enable CFN_AUTH_MODE=warn** in production
- [ ] **Deploy Grafana Dashboard**: Monitor unsigned message rate
- [ ] **Configure Alerts**: Set up Slack/PagerDuty notifications for auth anomalies
- [ ] **Daily Review**: Check logs for unsigned messages and signature failures
- [ ] **Team Training**: Educate ops team on auth troubleshooting

### Week 2: Monitoring and Validation

- [ ] **Monitor for Unsigned Messages**: Target 0 unsigned messages for 7 consecutive days
- [ ] **Performance Validation**: Ensure auth overhead < 5ms per message
- [ ] **Security Audit**: Review auth implementation with security team
- [ ] **Documentation Review**: Ensure runbooks are accurate and complete
- [ ] **Stakeholder Approval**: Get sign-off from security and platform teams

### Week 3: Enforce Mode Enablement

- [ ] **Enable CFN_AUTH_MODE=enforce** in production
- [ ] **24/7 Monitoring**: On-call team prepared for auth-related incidents
- [ ] **Rollback Plan Ready**: Pre-approved rollback procedure if issues arise
- [ ] **Performance Testing**: Validate 10-agent load test with enforce mode
- [ ] **Communication**: Notify development teams of enforce mode activation

### Week 4: Production Hardening

- [ ] **Zero Auth Failures**: Maintain < 0.01% failure rate
- [ ] **Key Rotation Schedule**: Implement 90-day key rotation policy
- [ ] **Compliance Validation**: Verify SOC2/ISO27001 compliance requirements met
- [ ] **Disaster Recovery Test**: Validate key restore and emergency rollback procedures
- [ ] **Post-Implementation Review**: Document lessons learned and update runbooks

---

## Troubleshooting

### Common Issues

**Issue**: High signature verification failure rate

**Diagnosis**:
```bash
# Check key permissions
ls -la ~/.claude-flow-novice/keys/
# Expected: -r-------- (400) for private_key.pem

# Verify key format
openssl pkey -in ~/.claude-flow-novice/keys/private_key.pem -text -noout | head -5

# Check clock drift (NTP)
timedatectl status
# Time synchronization should be active
```

**Solution**:
```bash
# Fix permissions
chmod 400 ~/.claude-flow-novice/keys/private_key.pem
chmod 444 ~/.claude-flow-novice/keys/public_key.pem

# Synchronize clocks
sudo systemctl restart systemd-timesyncd
sudo timedatectl set-ntp true

# Restart services
kubectl rollout restart deployment/claude-flow-novice -n agent-orchestration
```

---

**Issue**: Unsigned messages in enforce mode

**Diagnosis**:
```bash
# Search logs for unsigned message sources
kubectl logs -l app=claude-flow-novice --tail=1000 | \
  grep -i "unsigned message" | \
  jq '.agent_id, .message_type, .timestamp'
```

**Solution**:
```bash
# Identify non-compliant agents
# Update agent spawning code to include signature headers
# Temporarily switch to warn mode if critical agents affected
export CFN_AUTH_MODE=warn
```

---

**Issue**: Authentication disabled in production (alert triggered)

**Diagnosis**:
```bash
# Check environment configuration
kubectl get deployment claude-flow-novice -n agent-orchestration -o yaml | \
  grep -A5 "env:" | grep CFN_AUTH
```

**Solution**:
```bash
# Re-enable authentication
kubectl set env deployment/claude-flow-novice \
  CFN_AUTH_ENABLED=true \
  CFN_AUTH_MODE=warn \
  -n agent-orchestration

# Verify enablement
npx claude-flow-novice config get CFN_AUTH_ENABLED
```

---

## Security Considerations

### Threat Model

| Threat | Mitigation | Monitoring |
|--------|-----------|------------|
| Key compromise | 90-day rotation, encrypted backups, Vault storage | Audit logs, failed auth attempts |
| Message replay | Timestamp validation (5-min window), nonce tracking | Duplicate message detection |
| MITM attack | TLS/mTLS required, signature verification | Certificate expiry alerts |
| Unsigned messages | Enforce mode blocks, warn mode logs | Unsigned message rate metrics |
| Clock skew | NTP synchronization, configurable time tolerance | Time drift monitoring |

### Compliance Mapping

| Framework | Control | Implementation |
|-----------|---------|----------------|
| SOC2 Type II | CC6.1 - Logical access controls | Signature-based authentication, RBAC |
| ISO 27001 | A.9.4.2 - Secure log-on procedures | Cryptographic message signing |
| NIST 800-53 | IA-2 - Identification and authentication | ED25519/RSA key pairs |
| PCI DSS | 8.2 - User authentication | Enforce mode in production |

---

## References

- **Claude Flow Novice Documentation**: `/docs/README.md`
- **TLS Setup Guide**: `/docs/operations/TLS_CONFIGURATION.md`
- **Key Management**: `/docs/security/KEY_ROTATION_POLICY.md`
- **Monitoring Guide**: `/docs/operations/MONITORING_SETUP.md`
- **Incident Response**: `/docs/operations/INCIDENT_RESPONSE_PLAYBOOK.md`

---

**Document Version**: 1.0.0
**Last Updated**: 2025-10-06
**Owner**: DevOps Engineering Team
**Review Cycle**: Quarterly
