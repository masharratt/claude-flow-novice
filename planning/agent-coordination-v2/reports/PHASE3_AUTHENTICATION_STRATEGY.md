# Phase 3: Authentication & Authorization Strategy

**Status**: DESIGN SPECIFICATION
**Priority**: CRITICAL (blocks production deployment)
**Timeline**: Phase 3 (post-Phase 2 completion)
**Security Level**: HIGH

---

## Executive Summary

Phase 1 CLI coordination infrastructure currently has **NO authentication or authorization**, allowing any local process to impersonate agents and send/receive messages. This document defines the authentication and authorization strategy for Phase 3 implementation.

**Critical Vulnerabilities Addressed**:
- Agent identity spoofing (any process can claim to be any agent)
- Unauthorized message sending (no sender verification)
- No access control (all agents can message any other agent)
- No audit trail for security events

---

## Threat Model

### Attack Scenarios (Current State - Phase 2)

#### 1. Agent Impersonation Attack
```bash
# Attacker impersonates admin agent
send_message "fake-admin-agent" "critical-agent" "shutdown" "{}"
# → NO VERIFICATION, message accepted
```

**Impact**: Complete system compromise, unauthorized commands

#### 2. Message Eavesdropping
```bash
# Read messages intended for other agents
cat /dev/shm/cfn-mvp/messages/sensitive-agent/inbox/*.json
# → World-readable, information disclosure
```

**Impact**: Data leakage, privacy violation

#### 3. Unauthorized Command Execution
```bash
# Any process can control any agent
send_message "attacker" "database-agent" "execute_sql" '{"query":"DROP TABLE users;"}'
# → NO AUTHORIZATION CHECK
```

**Impact**: Data destruction, privilege escalation

---

## Authentication Strategy (Phase 3)

### 1. Agent Identity Verification

#### 1.1 Shared Secret Authentication (Initial Implementation)

**Components**:
- Pre-shared keys (PSK) per agent
- HMAC-SHA256 message signing
- Message integrity verification

**Implementation**:
```bash
# Agent registration (during init_message_bus)
AGENT_SECRET_FILE="/var/run/cfn-secrets/$agent_id.key"
if [[ ! -f "$AGENT_SECRET_FILE" ]]; then
    # Generate 256-bit random secret
    openssl rand -base64 32 > "$AGENT_SECRET_FILE"
    chmod 600 "$AGENT_SECRET_FILE"
fi

# Message signing (during send_message)
compute_message_signature() {
    local agent_id="$1"
    local message_json="$2"
    local secret=$(cat "/var/run/cfn-secrets/$agent_id.key")

    # HMAC-SHA256 signature
    echo -n "$message_json" | openssl dgst -sha256 -hmac "$secret" -binary | base64
}

# Message structure with signature
{
  "msg_id": "msg-1234",
  "from": "agent-1",
  "to": "agent-2",
  "timestamp": 1696594335,
  "signature": "HMAC-SHA256-BASE64...",
  "payload": {...}
}

# Signature verification (during receive_messages)
verify_message_signature() {
    local from_agent="$1"
    local message_json="$2"
    local claimed_sig="$3"

    local computed_sig=$(compute_message_signature "$from_agent" "$message_json")

    if [[ "$computed_sig" != "$claimed_sig" ]]; then
        log_error "SECURITY: Invalid signature from $from_agent"
        emit_security_event "signature_verification_failed" "$from_agent"
        return 1
    fi

    return 0
}
```

**Security Properties**:
- ✅ Prevents impersonation (attacker needs agent's secret)
- ✅ Message integrity (tampering detected)
- ✅ Backward compatible (Phase 2 agents fail gracefully)

**Limitations**:
- ❌ Secret distribution challenge (manual provisioning)
- ❌ No key rotation mechanism (requires agent restart)
- ❌ Vulnerable to key compromise (no revocation)

#### 1.2 Public Key Infrastructure (PKI) - Future Enhancement

**Components** (Phase 4+):
- X.509 certificates for agent identity
- Certificate Authority (CA) for trust chain
- Certificate revocation lists (CRL)

**Benefits Over PSK**:
- Centralized key management
- Dynamic key rotation
- Scalable trust model (CA signs new agents)
- Non-repudiation (private key proof)

---

### 2. Authorization & Access Control

#### 2.1 Role-Based Access Control (RBAC)

**Agent Roles**:
```yaml
roles:
  admin:
    permissions:
      - send_to: "*"
      - receive_from: "*"
      - execute_commands: ["shutdown", "restart", "configure"]

  coordinator:
    permissions:
      - send_to: ["worker-*", "validator-*"]
      - receive_from: "*"
      - execute_commands: ["assign_task", "collect_results"]

  worker:
    permissions:
      - send_to: ["coordinator-*"]
      - receive_from: ["coordinator-*", "worker-*"]
      - execute_commands: ["process_task", "report_status"]

  validator:
    permissions:
      - send_to: ["coordinator-*"]
      - receive_from: ["coordinator-*"]
      - execute_commands: ["validate", "approve", "reject"]
```

**Implementation**:
```bash
# Role assignment (during init_message_bus)
AGENT_ROLE_FILE="/var/run/cfn-roles/$agent_id.role"
echo "worker" > "$AGENT_ROLE_FILE"

# Authorization check (before send_message)
check_send_authorization() {
    local from_agent="$1"
    local to_agent="$2"
    local msg_type="$3"

    local from_role=$(cat "/var/run/cfn-roles/$from_agent.role")

    # Check if sender role allows sending to recipient
    if ! role_can_send_to "$from_role" "$to_agent"; then
        log_error "SECURITY: $from_agent (role: $from_role) not authorized to send to $to_agent"
        emit_security_event "unauthorized_send" "$from_agent" "$to_agent"
        return 1
    fi

    # Check if sender role allows message type
    if ! role_can_execute "$from_role" "$msg_type"; then
        log_error "SECURITY: $from_agent (role: $from_role) not authorized for message type: $msg_type"
        emit_security_event "unauthorized_command" "$from_agent" "$msg_type"
        return 1
    fi

    return 0
}
```

#### 2.2 Attribute-Based Access Control (ABAC) - Advanced

**Attributes** (Phase 4+):
- Agent metadata: environment (prod/staging), criticality (high/low)
- Message context: time-of-day, request rate, data sensitivity
- Dynamic policies: "Only allow DB writes from prod agents during business hours"

**Example Policy**:
```json
{
  "policy_id": "db-write-restriction",
  "effect": "allow",
  "conditions": {
    "agent.environment": "production",
    "message.type": "database_write",
    "time.hour": {"$gte": 9, "$lte": 17},
    "agent.role": "backend-service"
  }
}
```

---

### 3. Secure Communication Channels

#### 3.1 Encryption at Rest (tmpfs)

**Current State**: Messages stored in plaintext in `/dev/shm`

**Phase 3 Implementation**:
```bash
# Encrypt message payload before writing
encrypt_message_payload() {
    local payload="$1"
    local recipient_public_key="/var/run/cfn-keys/$to_agent.pub"

    # AES-256-GCM encryption with recipient's public key
    echo "$payload" | openssl enc -aes-256-gcm -pbkdf2 -pass "file:$recipient_public_key" -base64
}

# Decrypt message payload after reading
decrypt_message_payload() {
    local encrypted_payload="$1"
    local agent_private_key_file="/var/run/cfn-keys/${agent_id}.key"

    echo "$encrypted_payload" | openssl enc -aes-256-gcm -d -pbkdf2 -pass "file:$agent_private_key_file" -base64
}
```

**Benefits**:
- Prevents eavesdropping on tmpfs
- Protects sensitive data in multi-tenant environments
- Defense-in-depth (even if file permissions fail)

#### 3.2 TLS for Remote Agents (Phase 4+)

For distributed deployments beyond single-node tmpfs:
- TLS 1.3 for message transport
- Mutual TLS (mTLS) for bidirectional authentication
- Certificate pinning for trust verification

---

## Audit & Logging

### Security Event Logging

**Events to Log**:
```bash
# Security-critical events
emit_security_event() {
    local event_type="$1"
    local agent_id="$2"
    local details="${3:-{}}"

    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")
    local audit_entry=$(jq -n \
        --arg ts "$timestamp" \
        --arg event "$event_type" \
        --arg agent "$agent_id" \
        --argjson details "$details" \
        '{
            timestamp: $ts,
            event_type: $event,
            agent_id: $agent,
            details: $details,
            severity: "CRITICAL"
        }')

    # Append to tamper-evident audit log (write-only, append-only)
    echo "$audit_entry" >> /var/log/cfn-security-audit.jsonl
    chmod 600 /var/log/cfn-security-audit.jsonl
}

# Audit events
- signature_verification_failed: Invalid message signature
- unauthorized_send: Agent attempted unauthorized send
- unauthorized_command: Agent attempted unauthorized command
- role_escalation_attempt: Agent tried to elevate privileges
- key_compromise_detected: Secret key leaked or misused
- rate_limit_exceeded: Agent exceeded message rate limit
```

**Audit Log Format** (JSON Lines):
```json
{"timestamp":"2025-10-07T04:00:00.000Z","event_type":"unauthorized_send","agent_id":"attacker","details":{"from":"attacker","to":"admin-agent","msg_type":"shutdown"},"severity":"CRITICAL"}
{"timestamp":"2025-10-07T04:00:05.123Z","event_type":"signature_verification_failed","agent_id":"fake-agent","details":{"claimed_sig":"ABC...","computed_sig":"XYZ..."},"severity":"CRITICAL"}
```

---

## Implementation Roadmap

### Phase 3.1: Basic Authentication (Weeks 1-2)

**Deliverables**:
- [ ] Shared secret generation and storage (`/var/run/cfn-secrets/`)
- [ ] HMAC-SHA256 message signing in `send_message()`
- [ ] Signature verification in `receive_messages()`
- [ ] Secret rotation mechanism (manual trigger)
- [ ] Security event logging infrastructure

**Acceptance Criteria**:
- All messages signed and verified
- Impersonation attacks blocked (signature verification fails)
- Security audit log captures authentication failures

### Phase 3.2: Authorization (Weeks 3-4)

**Deliverables**:
- [ ] RBAC role definition system
- [ ] Role assignment during agent initialization
- [ ] Authorization checks in `send_message()` before send
- [ ] Access control policy enforcement
- [ ] Role-based message filtering

**Acceptance Criteria**:
- Agents restricted to allowed recipients
- Unauthorized commands rejected
- Role violations logged to audit trail

### Phase 3.3: Encryption (Weeks 5-6)

**Deliverables**:
- [ ] Payload encryption before tmpfs write
- [ ] Payload decryption after tmpfs read
- [ ] Key pair generation per agent
- [ ] Encrypted message performance benchmarking

**Acceptance Criteria**:
- Messages encrypted at rest in tmpfs
- Eavesdropping attacks fail (encrypted payloads)
- Performance impact <10% vs plaintext

### Phase 3.4: Advanced Security (Weeks 7-8)

**Deliverables**:
- [ ] Certificate-based authentication (PKI)
- [ ] Dynamic authorization policies (ABAC)
- [ ] Security incident response automation
- [ ] Penetration testing and hardening

**Acceptance Criteria**:
- PKI-based auth operational (CA + certificates)
- ABAC policies enforceable
- Penetration test report with no critical findings

---

## Security Testing Plan

### 1. Authentication Testing

**Test Cases**:
```bash
# Test 1: Valid signature accepted
send_message_with_signature "agent-1" "agent-2" "test" "{}" "valid-signature"
# Expected: Message delivered

# Test 2: Invalid signature rejected
send_message_with_signature "agent-1" "agent-2" "test" "{}" "invalid-signature"
# Expected: Message rejected, audit log entry

# Test 3: Replay attack (reused signature)
original_msg=$(send_message "agent-1" "agent-2" "test" "{}")
replay_message "$original_msg"
# Expected: Rejected (timestamp/nonce validation)
```

### 2. Authorization Testing

**Test Cases**:
```bash
# Test 1: Authorized send succeeds
send_message "worker-1" "coordinator-1" "task_result" "{}"
# Expected: Message delivered (worker → coordinator allowed)

# Test 2: Unauthorized send blocked
send_message "worker-1" "admin-agent" "shutdown" "{}"
# Expected: Rejected, audit log entry

# Test 3: Role escalation blocked
assign_role "worker-1" "admin"  # Attacker attempts
# Expected: Rejected, role unchanged
```

### 3. Encryption Testing

**Test Cases**:
```bash
# Test 1: Encrypted payload unreadable
send_message "agent-1" "agent-2" "secret" '{"password":"admin123"}'
cat /dev/shm/cfn-mvp/messages/agent-2/inbox/*.json
# Expected: Payload encrypted, not plaintext

# Test 2: Only recipient can decrypt
decrypt_message "agent-2" "$encrypted_msg"
# Expected: Decryption succeeds

decrypt_message "attacker" "$encrypted_msg"
# Expected: Decryption fails (wrong key)
```

---

## Backward Compatibility

**Migration Strategy**:
- Phase 3.1: Dual-mode authentication (accept unsigned + signed messages)
- Phase 3.2: Deprecation warnings for unsigned messages
- Phase 3.3: Enforce authentication (reject unsigned messages)

**Compatibility Flag**:
```bash
# Enable gradual rollout
AUTH_ENFORCE_MODE="${AUTH_ENFORCE_MODE:-warn}"
# Options: disabled, warn, enforce
```

---

## Performance Impact Analysis

### Benchmarks (Estimated)

| Operation | Phase 2 (No Auth) | Phase 3 (Auth) | Overhead |
|-----------|-------------------|----------------|----------|
| **send_message** | 2ms | 3.5ms | +75% (HMAC computation) |
| **receive_messages** | 5ms | 7ms | +40% (signature verification) |
| **100 messages** | 200ms | 350ms | +75% overall |

**Optimization Strategies**:
- Batch signature verification (verify 10 messages in parallel)
- Hardware acceleration (AES-NI for encryption)
- Signature caching (trust window: 5 seconds)

---

## Production Deployment Checklist

**MUST complete before Phase 3 production:**

- [ ] **Authentication System**
  - [ ] Shared secrets generated for all agents
  - [ ] HMAC signing enabled for all `send_message()` calls
  - [ ] Signature verification active in `receive_messages()`
  - [ ] Secret rotation procedure documented

- [ ] **Authorization System**
  - [ ] RBAC roles defined for all agent types
  - [ ] Authorization policies configured
  - [ ] Access control enforcement validated

- [ ] **Audit & Monitoring**
  - [ ] Security audit log operational
  - [ ] SIEM integration configured (Splunk/ELK)
  - [ ] Alerting for critical security events

- [ ] **Testing & Validation**
  - [ ] Penetration testing completed (no critical findings)
  - [ ] Authentication bypass tests passed
  - [ ] Authorization tests passed (100% coverage)

- [ ] **Compliance**
  - [ ] Security review approved by CISO
  - [ ] Compliance validation (SOC 2 / ISO 27001)
  - [ ] Incident response runbook finalized

---

## References

### Security Standards
- **NIST SP 800-63B**: Digital Identity Guidelines (Authentication)
- **NIST SP 800-162**: Attribute-Based Access Control (ABAC)
- **OWASP ASVS**: Application Security Verification Standard
- **CWE-306**: Missing Authentication for Critical Function

### Implementation Resources
- OpenSSL HMAC-SHA256: `man openssl-dgst`
- Bash cryptography best practices: OWASP Bash Security Cheat Sheet
- RBAC design patterns: NIST RBAC Model

---

**Document Version**: 1.0
**Last Updated**: 2025-10-07
**Author**: Security Specialist Agent (Phase 2 Sprint 2.1)
**Status**: APPROVED FOR PHASE 3 IMPLEMENTATION
