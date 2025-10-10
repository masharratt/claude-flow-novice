# Authentication System Migration Guide

**Version**: 1.0
**Target**: Phase 3 Authentication Implementation
**Timeline**: 8 weeks (Phase 3.1-3.4)
**Last Updated**: 2025-10-06

---

## Overview

This guide provides step-by-step instructions for migrating the Claude Flow Novice (CFN) CLI coordination system from **Phase 2 (no authentication)** to **Phase 3 (HMAC-SHA256 authentication + RBAC)**.

**Migration Strategy**: Gradual rollout with backward compatibility
- **Phase 3.1** (Weeks 1-2): Dual-mode (accept unsigned + signed messages)
- **Phase 3.2** (Weeks 3-4): Deprecation warnings (log unsigned messages)
- **Phase 3.3** (Weeks 5-6): Enforcement (reject unsigned messages)
- **Phase 3.4** (Weeks 7-8): Advanced security (PKI, ABAC)

---

## Pre-Migration Checklist

**MUST complete before starting migration:**

- [ ] **Backup Current System**
  ```bash
  # Backup message bus state
  tar -czf /backup/cfn-phase2-$(date +%F).tar.gz /dev/shm/cfn-mvp

  # Backup configuration
  cp -r lib/ /backup/lib-phase2/
  cp -r config/ /backup/config-phase2/
  ```

- [ ] **Verify System Health**
  ```bash
  # Check all agents running
  ./lib/health.sh get-cluster-health | jq -r '.agents[] | select(.status != "healthy")'

  # Verify message throughput
  ./lib/metrics.sh get-metrics | jq -r '.message_rate'
  ```

- [ ] **Document Current Agent Topology**
  ```bash
  # List all active agents
  ls /dev/shm/cfn-mvp/messages/ > /tmp/agent-inventory.txt

  # Map agent roles (manual for Phase 2)
  # coordinator-1, coordinator-2 → coordinator role
  # worker-1..10 → worker role
  # validator-1..3 → validator role
  # admin-1 → admin role
  ```

- [ ] **Test Rollback Procedure**
  ```bash
  # Practice rolling back to Phase 2
  ./scripts/rollback-to-phase2.sh --dry-run
  ```

- [ ] **Notify Stakeholders**
  - [ ] Operations team briefed on migration timeline
  - [ ] Monitoring alerts configured for authentication failures
  - [ ] On-call engineer assigned for migration window

---

## Phase 3.1: Basic Authentication (Weeks 1-2)

### Objective

Enable dual-mode authentication (accept unsigned + signed messages) to allow gradual agent migration.

### Step 1: Install Authentication Library

```bash
# Download Phase 3 auth library
git fetch origin phase-3-auth
git checkout phase-3-auth -- lib/auth.sh

# Verify installation
source lib/auth.sh
type generate_agent_key sign_message verify_message
# Output: generate_agent_key is a function
```

### Step 2: Configure Dual-Mode Authentication

```bash
# Set environment variables
cat >> ~/.bashrc <<'EOF'
# Phase 3.1: Dual-mode authentication
export CFN_AUTH_ENABLED="true"
export CFN_AUTH_MODE="warn"  # Accept unsigned + signed, log warnings
export CFN_SECRET_DIR="/var/run/cfn-secrets"
export CFN_ROLE_DIR="/var/run/cfn-roles"
export CFN_AUDIT_LOG="/var/log/cfn-security-audit.jsonl"
EOF

source ~/.bashrc
```

### Step 3: Initialize Secret Storage

```bash
# Create secret directories
mkdir -p /var/run/cfn-secrets /var/run/cfn-roles
chmod 700 /var/run/cfn-secrets /var/run/cfn-roles

# Initialize audit log
touch /var/log/cfn-security-audit.jsonl
chmod 600 /var/log/cfn-security-audit.jsonl
```

### Step 4: Generate Agent Keys (Rolling Update)

**Option A: Automated Migration Script**
```bash
#!/bin/bash
# migrate-agents-phase3.1.sh

source lib/auth.sh

# Load agent inventory
while IFS= read -r agent_id; do
  # Determine role based on agent name pattern
  if [[ "$agent_id" == admin-* ]]; then
    role="admin"
  elif [[ "$agent_id" == coordinator-* ]]; then
    role="coordinator"
  elif [[ "$agent_id" == validator-* ]]; then
    role="validator"
  else
    role="worker"
  fi

  # Generate key and assign role
  echo "Migrating $agent_id (role: $role)..."
  generate_agent_key "$agent_id" "$role"

  # Verify key generated
  if [[ -f "/var/run/cfn-secrets/$agent_id.key" ]]; then
    echo "✓ Key generated for $agent_id"
  else
    echo "✗ FAILED: $agent_id"
    exit 1
  fi
done < /tmp/agent-inventory.txt

echo "Migration complete: $(wc -l < /tmp/agent-inventory.txt) agents"
```

**Option B: Manual Migration (Small Deployments)**
```bash
# Generate keys manually
generate_agent_key "coordinator-1" "coordinator"
generate_agent_key "worker-1" "worker"
generate_agent_key "validator-1" "validator"
generate_agent_key "admin-1" "admin"

# Verify keys
ls -la /var/run/cfn-secrets/
# Output:
# -rw------- 1 user user 45 Oct  6 15:30 coordinator-1.key
# -rw------- 1 user user 45 Oct  6 15:30 worker-1.key
```

### Step 5: Update Message Bus (Add Signature Support)

```bash
# Backup original message-bus.sh
cp lib/message-bus.sh lib/message-bus.sh.phase2

# Patch send_message() to add optional signing
cat > /tmp/send_message.patch <<'EOF'
--- lib/message-bus.sh.phase2
+++ lib/message-bus.sh
@@ -186,6 +186,18 @@
   "requires_ack": false
 }
 EOF
+
+  # Phase 3: Sign message if authentication enabled
+  if [[ "${CFN_AUTH_ENABLED:-false}" == "true" ]]; then
+    if command -v sign_message >/dev/null 2>&1; then
+      message=$(sign_message "$message" "$from")
+    else
+      log_error "WARN: CFN_AUTH_ENABLED=true but sign_message not found"
+    fi
+  fi
 )
EOF

patch -p0 < /tmp/send_message.patch
```

### Step 6: Verify Dual-Mode Operation

```bash
# Test 1: Send unsigned message (Phase 2 agent)
export CFN_AUTH_ENABLED="false"
send_message "worker-1" "coordinator-1" "test" '{"mode":"unsigned"}'
# Expected: Message delivered, no signature field

# Test 2: Send signed message (Phase 3 agent)
export CFN_AUTH_ENABLED="true"
send_message "worker-1" "coordinator-1" "test" '{"mode":"signed"}'
# Expected: Message delivered with signature field

# Test 3: Verify both messages received
receive_messages "coordinator-1" | jq -r '.[] | .signature // "UNSIGNED"'
# Output:
# UNSIGNED
# 4A8F3C2E1D0B9A7F6E5D4C3B2A1F0E9D8C7B6A5F4E3D2C1B0A9F8E7D6C5B4A3F

# Test 4: Check audit log for warnings
grep "unsigned_message" /var/log/cfn-security-audit.jsonl
# Expected: Warning logged for unsigned message
```

### Step 7: Monitor for Issues

```bash
# Real-time audit log monitoring
tail -f /var/log/cfn-security-audit.jsonl | jq -r '.event_type'

# Check signature verification failures
grep "signature_verification_failed" /var/log/cfn-security-audit.jsonl | wc -l
# Expected: 0 (no failures in dual-mode)

# Monitor message delivery rates
watch -n 5 './lib/metrics.sh get-metrics | jq -r ".message_rate"'
```

**Success Criteria (Phase 3.1)**:
- ✅ All agents have keys generated
- ✅ Dual-mode accepts unsigned + signed messages
- ✅ No message delivery failures
- ✅ Audit log capturing unsigned message warnings

---

## Phase 3.2: RBAC Authorization (Weeks 3-4)

### Objective

Enable role-based access control and enforce authorization checks.

### Step 1: Deploy RBAC Policy

```bash
# Create RBAC policy file
cat > /var/run/cfn-roles/rbac-policy.yaml <<'EOF'
roles:
  admin:
    permissions:
      send_to: ["*"]
      receive_from: ["*"]
      execute_commands: ["shutdown", "restart", "configure", "rotate_keys", "assign_role"]
    constraints:
      max_agents: 2
      require_2fa: false  # Enable in Phase 3.4

  coordinator:
    permissions:
      send_to: ["worker-*", "validator-*"]
      receive_from: ["*"]
      execute_commands: ["assign_task", "collect_results", "broadcast", "request_status"]
    constraints:
      max_message_rate: 1000  # messages per minute

  worker:
    permissions:
      send_to: ["coordinator-*"]
      receive_from: ["coordinator-*", "worker-*"]
      execute_commands: ["process_task", "report_status", "request_help"]
    constraints:
      max_message_rate: 100
      max_payload_size: 1048576  # 1MB

  validator:
    permissions:
      send_to: ["coordinator-*"]
      receive_from: ["coordinator-*"]
      execute_commands: ["validate", "approve", "reject"]
    constraints:
      require_consensus: true
      min_confidence: 0.90
EOF

chmod 600 /var/run/cfn-roles/rbac-policy.yaml
```

### Step 2: Enable RBAC Checks

```bash
# Update environment variables
export CFN_RBAC_ENABLED="true"
export CFN_RBAC_POLICY="/var/run/cfn-roles/rbac-policy.yaml"

# Patch send_message() to add authorization check
cat > /tmp/rbac.patch <<'EOF'
--- lib/message-bus.sh
+++ lib/message-bus.sh
@@ -135,6 +135,14 @@
     return 1
   fi

+  # Phase 3.2: RBAC authorization check
+  if [[ "${CFN_RBAC_ENABLED:-false}" == "true" ]]; then
+    if ! check_rbac "$from" "send_to" "$to"; then
+      return 1
+    fi
+    if ! check_rbac "$from" "execute_command" "$msg_type"; then
+      return 1
+    fi
+  fi

   local recipient_inbox="$MESSAGE_BASE_DIR/$to/inbox"
EOF

patch -p0 < /tmp/rbac.patch
```

### Step 3: Test RBAC Enforcement

```bash
# Test 1: Authorized send (worker → coordinator)
send_message "worker-1" "coordinator-1" "task_result" '{"status":"completed"}'
# Expected: Message delivered

# Test 2: Unauthorized send (worker → admin)
send_message "worker-1" "admin-1" "shutdown" '{}'
# Expected: [MESSAGE-BUS] ERROR: SECURITY: worker-1 (role: worker) not authorized to send to admin-1

# Test 3: Unauthorized command (worker executing admin command)
send_message "worker-1" "coordinator-1" "shutdown" '{}'
# Expected: [MESSAGE-BUS] ERROR: SECURITY: worker-1 (role: worker) not authorized for command: shutdown

# Verify audit log
grep "unauthorized_send\|unauthorized_command" /var/log/cfn-security-audit.jsonl
```

**Success Criteria (Phase 3.2)**:
- ✅ RBAC policy loaded and validated
- ✅ Authorization checks blocking unauthorized sends
- ✅ Audit log capturing RBAC violations
- ✅ No false positives (legitimate messages blocked)

---

## Phase 3.3: Enforcement Mode (Weeks 5-6)

### Objective

Reject all unsigned messages (enforcement mode).

### Step 1: Switch to Enforcement Mode

```bash
# Update environment variable
export CFN_AUTH_MODE="enforce"

# Restart message bus (graceful)
pkill -SIGUSR1 cfn-message-bus  # Graceful restart
```

### Step 2: Verify All Agents Signing Messages

```bash
# Check for unsigned messages in last 24 hours
find /dev/shm/cfn-mvp/messages/*/inbox -name "*.json" -mtime -1 -exec \
  jq -r 'select(.signature == null) | .from' {} \; | sort -u

# Expected: (empty output - all messages signed)
# If any agents listed → those agents not migrated yet
```

### Step 3: Monitor Rejection Rate

```bash
# Count signature verification failures
grep "signature_verification_failed" /var/log/cfn-security-audit.jsonl | \
  jq -r '.timestamp' | tail -100 | wc -l

# Acceptable: <1% of total messages
# If >1% → rollback to dual-mode, investigate failing agents
```

### Step 4: Performance Benchmarking

```bash
# Measure authentication overhead
time send_message "worker-1" "coordinator-1" "benchmark" '{}'
# Expected: <5ms (vs 2ms Phase 2 baseline)

# Run 10-agent stress test
./tests/integration/100-agent-coordination.test.sh --auth-enabled
# Expected: All tests pass, <20% overhead vs Phase 2
```

**Success Criteria (Phase 3.3)**:
- ✅ All messages signed (0 unsigned messages)
- ✅ <1% signature verification failures
- ✅ <20% performance overhead vs Phase 2
- ✅ No system instability

---

## Phase 3.4: Advanced Security (Weeks 7-8)

### Objective

Deploy payload encryption, automated key rotation, and enhanced monitoring.

### Step 1: Enable Payload Encryption

```bash
# Generate encryption keys for all agents
for agent_id in $(cat /tmp/agent-inventory.txt); do
  # Generate RSA key pair for encryption
  openssl genrsa -out "/var/run/cfn-keys/$agent_id.priv" 2048
  openssl rsa -in "/var/run/cfn-keys/$agent_id.priv" \
    -pubout -out "/var/run/cfn-keys/$agent_id.pub"

  chmod 600 "/var/run/cfn-keys/$agent_id.priv"
  chmod 644 "/var/run/cfn-keys/$agent_id.pub"
done

# Enable encryption
export CFN_ENCRYPTION_ENABLED="true"
```

### Step 2: Setup Automated Key Rotation

```bash
# Create daily key rotation cron job
cat > /etc/cron.daily/cfn-key-rotation <<'EOF'
#!/bin/bash
source /path/to/lib/auth.sh

# Rotate all agent keys
rotate_keys

# Cleanup old keys after 7 days
find /var/run/cfn-secrets -name "*.key.old" -mtime +7 -delete

# Send notification
echo "CFN key rotation completed: $(date)" | \
  mail -s "CFN Key Rotation" admin@example.com
EOF

chmod +x /etc/cron.daily/cfn-key-rotation

# Test rotation
/etc/cron.daily/cfn-key-rotation
```

### Step 3: Deploy Advanced Monitoring

```bash
# Setup SIEM integration (Splunk/ELK)
cat > /etc/rsyslog.d/50-cfn-audit.conf <<'EOF'
# Forward CFN audit logs to SIEM
$ModLoad imfile
$InputFileName /var/log/cfn-security-audit.jsonl
$InputFileTag cfn-audit:
$InputFileStateFile stat-cfn-audit
$InputFileSeverity info
$InputFileFacility local3
$InputRunFileMonitor

local3.* @@siem.example.com:514
EOF

systemctl restart rsyslog

# Configure alerts for critical events
cat > /etc/alerting/cfn-critical.rules <<'EOF'
# Alert on signature verification failures
MATCH event_type=signature_verification_failed
THRESHOLD count > 10 in 5m
ACTION email:security@example.com, sms:oncall
EOF
```

**Success Criteria (Phase 3.4)**:
- ✅ Payload encryption operational (AES-256-GCM)
- ✅ Automated key rotation (daily cron)
- ✅ SIEM integration active (audit logs forwarded)
- ✅ Alerting configured for critical events

---

## Testing & Validation

### Integration Testing

**Test Suite**: `/tests/integration/phase3-auth-integration.test.sh`

```bash
#!/bin/bash
# Phase 3 integration test suite

source lib/auth.sh
source lib/message-bus.sh

test_authentication() {
  # Test 1: Valid signature accepted
  signed_msg=$(sign_message '{"msg_id":"test-1","from":"worker-1","to":"coordinator-1","timestamp":1696594335,"type":"test","payload":{}}' "worker-1")
  if verify_message "$signed_msg"; then
    echo "✓ Test 1 PASSED: Valid signature accepted"
  else
    echo "✗ Test 1 FAILED: Valid signature rejected"
    return 1
  fi

  # Test 2: Invalid signature rejected
  invalid_msg='{"msg_id":"test-2","from":"worker-1","signature":"FAKE_SIGNATURE","timestamp":1696594335,"type":"test","payload":{}}'
  if ! verify_message "$invalid_msg"; then
    echo "✓ Test 2 PASSED: Invalid signature rejected"
  else
    echo "✗ Test 2 FAILED: Invalid signature accepted"
    return 1
  fi

  # Test 3: Replay attack detected
  old_msg='{"msg_id":"test-3","from":"worker-1","signature":"OLD_SIG","timestamp":1000000000,"type":"test","payload":{}}'
  if ! verify_message "$old_msg"; then
    echo "✓ Test 3 PASSED: Replay attack detected"
  else
    echo "✗ Test 3 FAILED: Replay attack accepted"
    return 1
  fi
}

test_rbac() {
  # Test 1: Authorized send allowed
  if check_rbac "worker-1" "send_to" "coordinator-1"; then
    echo "✓ Test 1 PASSED: Authorized send allowed"
  else
    echo "✗ Test 1 FAILED: Authorized send blocked"
    return 1
  fi

  # Test 2: Unauthorized send blocked
  if ! check_rbac "worker-1" "send_to" "admin-1"; then
    echo "✓ Test 2 PASSED: Unauthorized send blocked"
  else
    echo "✗ Test 2 FAILED: Unauthorized send allowed"
    return 1
  fi

  # Test 3: Unauthorized command blocked
  if ! check_rbac "worker-1" "execute_command" "shutdown"; then
    echo "✓ Test 3 PASSED: Unauthorized command blocked"
  else
    echo "✗ Test 3 FAILED: Unauthorized command allowed"
    return 1
  fi
}

# Run tests
test_authentication
test_rbac

echo "Integration tests complete"
```

### Performance Testing

**10-Agent Coordination Test**:
```bash
#!/bin/bash
# Test 10-agent coordination with authentication

# Initialize 10 worker agents
for i in {1..10}; do
  generate_agent_key "worker-$i" "worker"
  init_message_bus "worker-$i"
done

# Initialize coordinator
generate_agent_key "coordinator-1" "coordinator"
init_message_bus "coordinator-1"

# Benchmark: Send 100 messages from each worker
start_time=$(date +%s.%N)

for i in {1..10}; do
  for j in {1..100}; do
    send_message "worker-$i" "coordinator-1" "task_result" '{"result":"completed"}' &
  done
done

wait
end_time=$(date +%s.%N)

# Calculate throughput
elapsed=$(echo "$end_time - $start_time" | bc)
throughput=$(echo "1000 / $elapsed" | bc)

echo "Throughput: $throughput messages/sec"
echo "Expected: >500 messages/sec (with authentication)"
```

---

## Rollback Procedures

### Rollback to Phase 2 (No Authentication)

**Trigger Conditions**:
- Signature verification failures >5%
- RBAC false positives (legitimate messages blocked)
- Performance degradation >30%
- System instability

**Rollback Steps**:
```bash
#!/bin/bash
# rollback-to-phase2.sh

# 1. Disable authentication
export CFN_AUTH_ENABLED="false"
export CFN_AUTH_MODE="disabled"
export CFN_RBAC_ENABLED="false"

# 2. Restore Phase 2 message-bus.sh
cp /backup/lib-phase2/message-bus.sh lib/message-bus.sh

# 3. Restart message bus
pkill -9 cfn-message-bus
./lib/message-bus.sh init-system

# 4. Verify rollback
send_message "worker-1" "coordinator-1" "test" '{"rollback":"confirmed"}'
if receive_messages "coordinator-1" | grep -q "rollback"; then
  echo "✓ Rollback successful - Phase 2 operational"
else
  echo "✗ Rollback failed - investigate"
  exit 1
fi

# 5. Notify operations
echo "ROLLBACK: Phase 3 → Phase 2 at $(date)" | \
  mail -s "CFN Rollback" ops@example.com
```

### Rollback to Phase 3.2 (Dual-Mode)

**Use Case**: Phase 3.3 enforcement causing failures

```bash
# Revert to dual-mode (accept unsigned + signed)
export CFN_AUTH_MODE="warn"

# Restart message bus
pkill -SIGUSR1 cfn-message-bus

# Verify dual-mode active
grep "CFN_AUTH_MODE=warn" /proc/$(pgrep cfn-message-bus)/environ
```

---

## Production Deployment Timeline

### Week-by-Week Plan

| Week | Phase | Activities | Validation |
|------|-------|------------|------------|
| **1** | 3.1 | Install auth library, generate keys (10% agents) | Dual-mode operational, no failures |
| **2** | 3.1 | Generate keys (remaining 90% agents) | All agents have keys, audit log active |
| **3** | 3.2 | Deploy RBAC policy, enable authorization | RBAC blocking unauthorized sends |
| **4** | 3.2 | RBAC tuning (fix false positives) | <1% false positive rate |
| **5** | 3.3 | Enable enforcement mode (reject unsigned) | 0 unsigned messages, <1% rejection rate |
| **6** | 3.3 | Performance optimization (batching, caching) | <20% overhead vs Phase 2 |
| **7** | 3.4 | Deploy encryption, key rotation | Encryption operational, daily rotation |
| **8** | 3.4 | SIEM integration, penetration testing | Penetration test passed, SIEM live |

### Go-Live Criteria

**MUST meet ALL criteria before production deployment:**

- [ ] **Functional**
  - [ ] 100% agents have keys and roles assigned
  - [ ] Signature verification passing rate ≥99%
  - [ ] RBAC false positive rate <1%
  - [ ] Message delivery success rate ≥99.9%

- [ ] **Performance**
  - [ ] Authentication overhead <20% vs Phase 2
  - [ ] Message latency <10ms (p99)
  - [ ] 10-agent test completes without errors

- [ ] **Security**
  - [ ] Penetration testing completed (0 critical findings)
  - [ ] Audit log capturing all security events
  - [ ] Key rotation automated (daily cron)
  - [ ] Encryption at rest operational

- [ ] **Operational**
  - [ ] Rollback procedure tested and documented
  - [ ] Operations team trained on troubleshooting
  - [ ] Monitoring dashboards configured
  - [ ] On-call engineer assigned

---

## Troubleshooting

See [docs/AUTHENTICATION.md](AUTHENTICATION.md#troubleshooting-guide) for detailed troubleshooting steps.

**Quick Fixes**:

| Issue | Quick Fix |
|-------|-----------|
| Signature verification failed | `rotate_keys --agent <agent_id> --force` |
| Unauthorized send blocked | Check RBAC policy, verify role assignment |
| Key file not found | `generate_agent_key <agent_id> <role>` |
| Performance degradation | Enable signature caching, batch verification |

---

## Post-Migration Tasks

**After successful migration to Phase 3:**

- [ ] Archive Phase 2 backups (retain 90 days)
- [ ] Update documentation (architecture diagrams, API docs)
- [ ] Conduct security audit (external firm)
- [ ] Schedule Phase 4 planning (PKI, ABAC)
- [ ] Publish migration post-mortem (lessons learned)

---

## Support & Escalation

**Contact**:
- **Migration Lead**: [Your Name] <email@example.com>
- **Security Team**: security@example.com
- **On-Call**: PagerDuty Escalation #12345

**Escalation Criteria**:
- Signature verification failures >5%
- RBAC false positives >5%
- Performance degradation >30%
- Security incident detected

---

## References

- **Authentication Overview**: [docs/AUTHENTICATION.md](AUTHENTICATION.md)
- **API Reference**: [docs/API_AUTH.md](API_AUTH.md)
- **Security Requirements**: [docs/SECURITY_AUTH.md](SECURITY_AUTH.md)
- **Phase 3 Strategy**: [planning/agent-coordination-v2/PHASE3_AUTHENTICATION_STRATEGY.md](../planning/agent-coordination-v2/PHASE3_AUTHENTICATION_STRATEGY.md)

---

**Document Version**: 1.0
**Confidence**: 0.93/1.0
**Author**: Migration Specialist
**Status**: Ready for Phase 3 Execution
