# Compliance-First Governance - Pseudocode

## Core Algorithms

### Algorithm 1: Policy Evaluation Engine

```python
class PolicyEngine:
    """
    Core policy evaluation engine that decides ALLOW/DENY/WARN
    for agent actions based on regulatory rules.
    """

    def __init__(self, redis_client, policy_cache_ttl=300):
        self.redis = redis_client
        self.cache_ttl = policy_cache_ttl
        self.policy_packs = {}  # In-memory policy pack registry

    def evaluate(self, agent_action: AgentAction, policy_pack: str) -> PolicyDecision:
        """
        Main evaluation function. Implements multi-stage decision pipeline.

        Args:
            agent_action: The action an agent wants to perform
            policy_pack: Which regulatory framework to enforce (HIPAA, SOX, GDPR)

        Returns:
            PolicyDecision with ALLOW/DENY/WARN and metadata
        """

        # Stage 1: Check cache for recent identical decision
        cache_key = f"policy:{policy_pack}:{hash(agent_action)}"
        cached_decision = self.redis.get(cache_key)

        if cached_decision and not agent_action.requires_fresh_eval:
            return PolicyDecision.from_cache(cached_decision)

        # Stage 2: Load applicable policy rules
        applicable_rules = self.get_applicable_rules(
            action_type=agent_action.type,
            resource=agent_action.resource,
            policy_pack=policy_pack
        )

        if not applicable_rules:
            # No rules apply -> default ALLOW (fail-open for non-regulated actions)
            return PolicyDecision(
                decision="ALLOW",
                reason="No applicable policy rules",
                evaluated_rules=[]
            )

        # Stage 3: Evaluate each rule in priority order
        decisions = []
        for rule in sorted(applicable_rules, key=lambda r: r.priority, reverse=True):
            try:
                rule_decision = self.evaluate_rule(rule, agent_action)
                decisions.append(rule_decision)

                # Short-circuit on DENY (most restrictive wins)
                if rule_decision.decision == "DENY":
                    break

            except PolicyEvaluationError as e:
                # Log error but continue evaluation (don't fail open on bugs)
                self.log_error(f"Rule {rule.id} evaluation failed: {e}")
                continue

        # Stage 4: Aggregate decisions (most restrictive wins)
        final_decision = self.aggregate_decisions(decisions)

        # Stage 5: Cache decision for performance
        if final_decision.cacheable:
            self.redis.setex(cache_key, self.cache_ttl, final_decision.to_json())

        # Stage 6: Log decision to audit trail
        self.log_audit_event(
            event_type="POLICY_EVAL",
            agent_action=agent_action,
            decision=final_decision
        )

        return final_decision

    def evaluate_rule(self, rule: PolicyRule, action: AgentAction) -> RuleDecision:
        """
        Evaluate a single policy rule against an agent action.
        Uses embedded JavaScript/Python DSL for complex conditions.
        """

        # Build evaluation context
        context = {
            'action': action.to_dict(),
            'resource': action.resource,
            'user': action.user_context,
            'timestamp': action.timestamp,
            'data_classification': action.data_classification,
            'environment': os.environ
        }

        # Execute rule condition (sandboxed evaluation)
        try:
            if rule.condition_type == "javascript":
                result = self.js_sandbox.eval(rule.condition, context)
            elif rule.condition_type == "python":
                result = self.py_sandbox.eval(rule.condition, context)
            else:
                raise ValueError(f"Unsupported condition type: {rule.condition_type}")

            # Convert result to decision
            if result is True:
                # Condition matched -> apply rule action
                return RuleDecision(
                    rule_id=rule.id,
                    decision=rule.action,  # ALLOW/DENY/WARN
                    reason=rule.description,
                    violation_code=rule.regulatory_reference if rule.action == "DENY" else None
                )
            else:
                # Condition not matched -> rule doesn't apply
                return RuleDecision(
                    rule_id=rule.id,
                    decision="ALLOW",
                    reason=f"Rule {rule.id} condition not met"
                )

        except Exception as e:
            # Fail-secure: treat evaluation errors as DENY
            return RuleDecision(
                rule_id=rule.id,
                decision="DENY",
                reason=f"Rule evaluation error: {str(e)}",
                error=True
            )

    def aggregate_decisions(self, decisions: List[RuleDecision]) -> PolicyDecision:
        """
        Combine multiple rule decisions into final policy decision.
        Most restrictive wins: DENY > WARN > ALLOW
        """

        # Check for any DENY decisions
        denials = [d for d in decisions if d.decision == "DENY"]
        if denials:
            # Return first DENY (highest priority rule)
            primary_denial = denials[0]
            return PolicyDecision(
                decision="DENY",
                violated_rule=primary_denial.rule_id,
                violation_code=primary_denial.violation_code,
                reason=primary_denial.reason,
                remediation=self.get_remediation(primary_denial.rule_id),
                evaluated_rules=[d.rule_id for d in decisions]
            )

        # Check for any WARN decisions
        warnings = [d for d in decisions if d.decision == "WARN"]
        if warnings:
            return PolicyDecision(
                decision="WARN",
                warnings=[w.reason for w in warnings],
                evaluated_rules=[d.rule_id for d in decisions]
            )

        # All rules allowed
        return PolicyDecision(
            decision="ALLOW",
            evaluated_rules=[d.rule_id for d in decisions],
            ttl_seconds=300  # Cache for 5 minutes
        )
```

### Algorithm 2: Action Interception Pipeline

```python
class ActionInterceptor:
    """
    Intercepts all agent actions before execution for policy evaluation.
    Integrates with CFN v3 orchestrate.sh via hook injection.
    """

    def __init__(self, policy_engine: PolicyEngine):
        self.policy_engine = policy_engine
        self.interception_points = self.register_hooks()

    def intercept(self, agent_id: str, action: dict) -> InterceptionResult:
        """
        Main interception function called before every agent action.

        Flow:
        1. Normalize action to standard format
        2. Classify action type and resource
        3. Evaluate against policy
        4. ALLOW: return execution token, DENY: raise exception
        """

        # Stage 1: Normalize action from various formats
        normalized_action = self.normalize_action(action)

        # Stage 2: Classify action for policy matching
        action_classification = self.classify_action(normalized_action)

        # Stage 3: Get policy pack for this agent/user
        policy_pack = self.get_policy_pack(agent_id)

        # Stage 4: Evaluate policy
        decision = self.policy_engine.evaluate(
            agent_action=normalized_action,
            policy_pack=policy_pack
        )

        # Stage 5: Handle decision
        if decision.decision == "ALLOW":
            # Generate execution token for audit trail
            execution_token = self.generate_execution_token(
                agent_id=agent_id,
                action=normalized_action,
                decision=decision
            )

            return InterceptionResult(
                allowed=True,
                execution_token=execution_token,
                conditions=decision.conditions
            )

        elif decision.decision == "WARN":
            # Allow but log warning
            self.log_warning(agent_id, normalized_action, decision)

            execution_token = self.generate_execution_token(
                agent_id=agent_id,
                action=normalized_action,
                decision=decision,
                warnings=decision.warnings
            )

            return InterceptionResult(
                allowed=True,
                execution_token=execution_token,
                warnings=decision.warnings
            )

        else:  # DENY
            # Block action and trigger violation workflow
            self.handle_violation(
                agent_id=agent_id,
                action=normalized_action,
                decision=decision
            )

            raise PolicyViolationError(
                rule=decision.violated_rule,
                code=decision.violation_code,
                reason=decision.reason,
                remediation=decision.remediation
            )

    def register_hooks(self) -> dict:
        """
        Register interception hooks at various CFN v3 execution points.

        Hook Points:
        - Pre-agent-spawn: Before orchestrate.sh spawns agent
        - Pre-file-operation: Before any file read/write/delete
        - Pre-network-request: Before API calls or database queries
        - Pre-process-spawn: Before shell command execution
        """

        hooks = {
            'pre_agent_spawn': self.hook_agent_spawn,
            'pre_file_operation': self.hook_file_operation,
            'pre_network_request': self.hook_network_request,
            'pre_process_spawn': self.hook_process_spawn
        }

        # Inject hooks into CFN orchestration pipeline
        for hook_name, hook_function in hooks.items():
            cfn_hook_system.register(hook_name, hook_function)

        return hooks

    def hook_file_operation(self, agent_id: str, operation: dict) -> None:
        """
        Example hook: Intercept file operations.

        Checks:
        - Does file contain regulated data (PHI, PII, PCI)?
        - Is encryption required for this data classification?
        - Does agent have permission to access this file?
        """

        action = AgentAction(
            type="FILE_OPERATION",
            operation=operation['type'],  # READ, WRITE, DELETE
            resource=operation['path'],
            data_classification=self.classify_file(operation['path']),
            agent_id=agent_id,
            user_context=self.get_user_context(agent_id)
        )

        # Intercept and evaluate
        result = self.intercept(agent_id, action)

        # If DENIED, exception already raised
        # If ALLOWED, attach execution token to operation
        operation['compliance_token'] = result.execution_token

        # Check conditions (e.g., "must use encryption")
        if result.conditions:
            self.enforce_conditions(operation, result.conditions)
```

### Algorithm 3: Immutable Audit Log with Hash Chains

```python
class AuditLogger:
    """
    Tamper-proof audit logging using hash chains and cryptographic signatures.
    Implements append-only storage with verification capabilities.
    """

    def __init__(self, db_connection, signing_key):
        self.db = db_connection
        self.signing_key = signing_key  # Ed25519 private key
        self.last_event_hash = self.get_last_event_hash()

    def log_event(self, event: AuditEvent) -> str:
        """
        Log an audit event with hash chain and signature.

        Hash Chain:
        event_N.hash = SHA256(event_N.data + event_{N-1}.hash)

        This creates a tamper-proof chain where modifying any event
        breaks all subsequent hashes.
        """

        # Stage 1: Add hash chain link
        event.previous_hash = self.last_event_hash
        event_data = event.to_canonical_json()  # Deterministic serialization
        event.hash_chain = hashlib.sha256(
            event_data.encode('utf-8') +
            self.last_event_hash.encode('utf-8')
        ).hexdigest()

        # Stage 2: Sign event with private key
        event.signature = self.sign_event(event, self.signing_key)

        # Stage 3: Write to database (append-only)
        event_id = self.db.execute("""
            INSERT INTO audit_events (
                event_id, timestamp, event_type, agent_id, user_id,
                resource, operation, policy_rule, decision,
                violation_code, context, hash_chain, signature,
                retention_until
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            event.event_id,
            event.timestamp,
            event.event_type,
            event.agent_id,
            event.user_id,
            event.resource,
            event.operation,
            event.policy_rule,
            event.decision,
            event.violation_code,
            json.dumps(event.context),
            event.hash_chain,
            event.signature,
            event.retention_until
        ))

        # Stage 4: Update last hash for next event
        self.last_event_hash = event.hash_chain

        # Stage 5: Trigger async replication to backup storage
        self.replicate_to_backup(event)

        return event.event_id

    def verify_chain(self, start_event_id: str = None) -> VerificationResult:
        """
        Verify integrity of audit log hash chain.

        Returns:
        - is_valid: bool (true if chain is intact)
        - broken_at: event_id where chain breaks (if invalid)
        - total_events: number of events verified
        """

        events = self.db.execute("""
            SELECT event_id, hash_chain, previous_hash, signature
            FROM audit_events
            WHERE event_id >= COALESCE(?, '00000000-0000-0000-0000-000000000000')
            ORDER BY timestamp ASC
        """, (start_event_id,))

        previous_hash = None
        for event in events:
            # Verify hash chain link
            expected_hash = hashlib.sha256(
                event.to_canonical_json().encode('utf-8') +
                (previous_hash or '').encode('utf-8')
            ).hexdigest()

            if event.hash_chain != expected_hash:
                return VerificationResult(
                    is_valid=False,
                    broken_at=event.event_id,
                    reason=f"Hash mismatch at {event.event_id}"
                )

            # Verify signature
            if not self.verify_signature(event):
                return VerificationResult(
                    is_valid=False,
                    broken_at=event.event_id,
                    reason=f"Invalid signature at {event.event_id}"
                )

            previous_hash = event.hash_chain

        return VerificationResult(
            is_valid=True,
            total_events=len(events)
        )

    def sign_event(self, event: AuditEvent, private_key) -> str:
        """
        Sign event with Ed25519 for tamper detection.
        """
        message = event.to_canonical_json().encode('utf-8')
        signature = ed25519.sign(message, private_key)
        return base64.b64encode(signature).decode('utf-8')

    def verify_signature(self, event: AuditEvent) -> bool:
        """
        Verify event signature with public key.
        """
        message = event.to_canonical_json().encode('utf-8')
        signature = base64.b64decode(event.signature)

        try:
            ed25519.verify(signature, message, self.public_key)
            return True
        except ed25519.SignatureMismatch:
            return False
```

### Algorithm 4: Compliance Score Calculation

```python
class ComplianceScoring:
    """
    Calculate compliance scores for agents, teams, and projects.
    Scoring algorithm weights violations by severity and recency.
    """

    def calculate_score(
        self,
        entity_id: str,
        entity_type: str,
        policy_pack: str,
        start_date: datetime,
        end_date: datetime
    ) -> ComplianceScore:
        """
        Calculate compliance score using weighted violation penalty model.

        Score Formula:
        base_score = 100
        penalty = Σ(violation_severity * recency_weight * frequency_multiplier)
        final_score = max(0, base_score - penalty)

        Severity Weights:
        - LOW: -1 point
        - MEDIUM: -5 points
        - HIGH: -10 points
        - CRITICAL: -25 points

        Recency Weight:
        - Last 7 days: 1.0x
        - Last 30 days: 0.5x
        - Last 90 days: 0.25x
        - Older: 0.1x

        Frequency Multiplier:
        - Same violation 2-5 times: 1.5x
        - Same violation 6-10 times: 2.0x
        - Same violation 11+ times: 3.0x
        """

        # Fetch all violations for entity in date range
        violations = self.db.execute("""
            SELECT
                policy_rule,
                violation_code,
                timestamp,
                severity,
                COUNT(*) as occurrence_count
            FROM audit_events
            WHERE entity_id = ?
                AND event_type = 'POLICY_VIOLATION'
                AND policy_pack = ?
                AND timestamp BETWEEN ? AND ?
            GROUP BY policy_rule, violation_code, DATE(timestamp)
        """, (entity_id, policy_pack, start_date, end_date))

        # Calculate total penalty
        base_score = 100
        total_penalty = 0

        severity_weights = {
            'LOW': 1,
            'MEDIUM': 5,
            'HIGH': 10,
            'CRITICAL': 25
        }

        for violation in violations:
            # Severity penalty
            severity_penalty = severity_weights.get(violation.severity, 5)

            # Recency weight (more recent violations weighted higher)
            days_ago = (end_date - violation.timestamp).days
            if days_ago <= 7:
                recency_weight = 1.0
            elif days_ago <= 30:
                recency_weight = 0.5
            elif days_ago <= 90:
                recency_weight = 0.25
            else:
                recency_weight = 0.1

            # Frequency multiplier (repeated violations penalized more)
            if violation.occurrence_count >= 11:
                frequency_multiplier = 3.0
            elif violation.occurrence_count >= 6:
                frequency_multiplier = 2.0
            elif violation.occurrence_count >= 2:
                frequency_multiplier = 1.5
            else:
                frequency_multiplier = 1.0

            # Total penalty for this violation
            violation_penalty = (
                severity_penalty *
                recency_weight *
                frequency_multiplier *
                violation.occurrence_count
            )

            total_penalty += violation_penalty

        # Calculate final score
        final_score = max(0, base_score - total_penalty)

        # Determine grade
        if final_score >= 95:
            grade = 'A'
        elif final_score >= 85:
            grade = 'B'
        elif final_score >= 70:
            grade = 'C'
        elif final_score >= 60:
            grade = 'D'
        else:
            grade = 'F'

        # Calculate metrics
        total_evaluations = self.count_evaluations(entity_id, policy_pack, start_date, end_date)
        violation_count = sum(v.occurrence_count for v in violations)

        return ComplianceScore(
            entity_id=entity_id,
            entity_type=entity_type,
            policy_pack=policy_pack,
            period={'start': start_date, 'end': end_date},
            metrics={
                'total_evaluations': total_evaluations,
                'violations': violation_count,
                'violation_rate': violation_count / total_evaluations if total_evaluations > 0 else 0,
                'remediated': self.count_remediated(entity_id, start_date, end_date),
                'mttr_hours': self.calculate_mttr(entity_id, start_date, end_date)
            },
            score=final_score,
            grade=grade,
            trend=self.calculate_trend(entity_id, policy_pack, end_date)
        )
```

---

## Data Flow

### Flow 1: Agent Action with Policy Enforcement

```
┌─────────────┐
│ Agent       │
│ (wants to   │
│ write file) │
└──────┬──────┘
       │
       │ 1. Agent calls file_write("patient_data.json", phi_content)
       ▼
┌─────────────────────┐
│ Action Interceptor  │
│ (hook in            │
│ orchestrate.sh)     │
└──────┬──────────────┘
       │
       │ 2. Intercept file_write, normalize to AgentAction
       ▼
┌─────────────────────┐
│ Policy Engine       │
│ (evaluate action)   │
└──────┬──────────────┘
       │
       │ 3. Load HIPAA policy pack
       │ 4. Evaluate: hipaa_phi_encryption rule
       │ 5. Condition: requires_encryption(phi_content) == true
       │    BUT encryption=false in action
       │ 6. Decision: DENY
       ▼
┌─────────────────────┐
│ Audit Logger        │
│ (log violation)     │
└──────┬──────────────┘
       │
       │ 7. Log POLICY_VIOLATION event
       │ 8. Add to hash chain
       │ 9. Sign with Ed25519
       ▼
┌─────────────────────┐
│ Violation Handler   │
│ (notify & block)    │
└──────┬──────────────┘
       │
       │ 10. Send Slack alert to agent owner
       │ 11. Create Jira ticket for remediation
       │ 12. Raise PolicyViolationError
       ▼
┌─────────────────────┐
│ Agent               │
│ (receives error)    │
└─────────────────────┘
       │
       │ 13. Agent sees: "HIPAA-164.312(a)(2)(iv): PHI must be encrypted"
       │ 14. Remediation: "Enable AES-256-GCM encryption before writing"
       │ 15. Agent fixes code, retries with encryption=true
       ▼
     (Success: Action allowed with execution_token)
```

### Flow 2: Compliance Report Generation

```
┌─────────────────────┐
│ Compliance Officer  │
│ (requests report)   │
└──────┬──────────────┘
       │
       │ 1. GET /api/v1/compliance/report?pack=HIPAA_2024
       ▼
┌─────────────────────┐
│ Report Generator    │
└──────┬──────────────┘
       │
       │ 2. Query audit_events for period (2024-01-01 to 2024-12-31)
       ▼
┌─────────────────────┐
│ PostgreSQL          │
│ (audit events DB)   │
└──────┬──────────────┘
       │
       │ 3. Return 1,250,000 policy evaluations
       │    - 1,249,658 ALLOW
       │    - 342 DENY (violations)
       ▼
┌─────────────────────┐
│ Compliance Scoring  │
└──────┬──────────────┘
       │
       │ 4. Calculate compliance score per entity
       │ 5. Aggregate violations by rule
       │ 6. Calculate MTTR (mean time to remediation)
       ▼
┌─────────────────────┐
│ PDF Generator       │
└──────┬──────────────┘
       │
       │ 7. Render compliance report template
       │ 8. Include violation details, trends, top offenders
       │ 9. Generate hash chain verification proof
       ▼
┌─────────────────────┐
│ Compliance Officer  │
│ (downloads PDF)     │
└─────────────────────┘
       │
       │ 10. Share with external auditor
       │ 11. Auditor independently verifies hash chain
```

---

## State Machines

### Violation Remediation State Machine

```
┌─────────────┐
│  DETECTED   │  ← Violation discovered by policy engine
└──────┬──────┘
       │
       │ Auto-transition (send notifications)
       ▼
┌─────────────┐
│  NOTIFIED   │  ← Agent owner and compliance team alerted
└──────┬──────┘
       │
       │ Compliance officer triages (24h SLA)
       ▼
┌─────────────┐
│   TRIAGED   │  ← Severity confirmed, owner assigned
└──────┬──────┘
       │
       │ Developer fixes code/config
       ▼
┌─────────────┐
│ IN_PROGRESS │  ← Remediation work started
└──────┬──────┘
       │
       │ Submit fix for verification
       ▼
┌─────────────┐
│ VERIFYING   │  ← Rerun action through policy engine
└──────┬──────┘
       │
       ├─ PASS ──────────┐
       │                  ▼
       │            ┌─────────────┐
       │            │  REMEDIATED │  ← Violation fixed
       │            └─────────────┘
       │
       ├─ FAIL ──────────┐
       │                  ▼
       │            ┌─────────────┐
       │            │  REJECTED   │  ← Fix didn't solve violation
       │            └──────┬──────┘
       │                   │
       │                   │ Back to IN_PROGRESS
       │                   ▼
       └────────────────  (retry)

Special States:
┌─────────────┐
│  ESCALATED  │  ← Missed SLA, escalate to manager
└─────────────┘

┌─────────────┐
│   WAIVED    │  ← Compliance officer grants exception
└─────────────┘
```

### Policy Deployment State Machine

```
┌─────────────┐
│    DRAFT    │  ← Policy being authored
└──────┬──────┘
       │
       │ Submit for review
       ▼
┌─────────────┐
│   REVIEW    │  ← Compliance team reviews
└──────┬──────┘
       │
       │ Approve (with or without changes)
       ▼
┌─────────────┐
│  SIMULATION │  ← Test against historical audit logs
└──────┬──────┘
       │
       │ Simulation results reviewed
       │
       ├─ Too many false positives → back to DRAFT
       │
       ├─ Acceptable → continue
       ▼
┌─────────────┐
│   STAGING   │  ← Deploy to staging environment
└──────┬──────┘
       │
       │ Staging tests pass
       ▼
┌─────────────┐
│ PRODUCTION  │  ← Live policy enforcement
└──────┬──────┘
       │
       │ Monitor for issues
       │
       ├─ No issues for 7 days → STABLE
       │
       ├─ Issues detected → ROLLBACK
       ▼
┌─────────────┐
│   STABLE    │  ← Policy proven in production
└─────────────┘

Rollback Path:
┌─────────────┐
│  ROLLBACK   │  ← Revert to previous version
└──────┬──────┘
       │
       │ Investigate issues
       ▼
     (back to DRAFT for fixes)
```

---

## Example Implementations

### Example 1: HIPAA PHI Encryption Rule

```yaml
# Policy rule definition
rule_id: hipaa_phi_encryption
pack_id: HIPAA_2024
version: 1.2.0
name: PHI Encryption Requirement
description: All Protected Health Information (PHI) must be encrypted at rest using AES-256-GCM or ChaCha20-Poly1305
regulatory_reference: HIPAA-164.312(a)(2)(iv)
scope:
  - FILE_WRITE
  - DATA_STORAGE
  - DATABASE_INSERT
priority: 100  # High priority
action: DENY
severity: CRITICAL

condition: |
  // JavaScript DSL for rule condition
  function evaluate(context) {
    const action = context.action;
    const resource = context.resource;

    // Check if resource contains PHI
    const containsPHI = (
      resource.data_classification === 'PHI' ||
      resource.path.includes('patient') ||
      resource.path.includes('medical')
    );

    if (!containsPHI) {
      // Rule doesn't apply to non-PHI data
      return false;
    }

    // PHI detected - check encryption
    const validAlgorithms = ['AES-256-GCM', 'ChaCha20-Poly1305'];
    const hasEncryption = action.encryption && action.encryption.enabled;
    const validAlgorithm = hasEncryption && validAlgorithms.includes(action.encryption.algorithm);
    const validKeyManagement = hasEncryption && ['AWS-KMS', 'HSM'].includes(action.encryption.key_management);

    // Deny if PHI without proper encryption
    return !(hasEncryption && validAlgorithm && validKeyManagement);
  }

remediation: |
  Enable encryption for PHI data:

  1. Use AES-256-GCM or ChaCha20-Poly1305 algorithm
  2. Manage keys via AWS KMS or Hardware Security Module (HSM)
  3. Example code:

  ```python
  from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
  import boto3

  # Get encryption key from AWS KMS
  kms = boto3.client('kms')
  key_response = kms.generate_data_key(
      KeyId='arn:aws:kms:us-east-1:123456789:key/...',
      KeySpec='AES_256'
  )

  # Encrypt PHI data
  cipher = Cipher(
      algorithms.AES(key_response['Plaintext']),
      modes.GCM(nonce)
  )
  encryptor = cipher.encryptor()
  encrypted_phi = encryptor.update(phi_data) + encryptor.finalize()
  ```

metadata:
  created_by: compliance@hospital.com
  created_at: 2024-01-15T10:00:00Z
  auditor_approved: true
  auditor_name: Deloitte Cyber Risk Services
  certification_date: 2024-06-15
```

### Example 2: Integration with CFN v3 Orchestrator

```bash
#!/bin/bash
# File: .claude/hooks/cfn-compliance-check.sh
# Hook injected into orchestrate.sh before agent actions

set -euo pipefail

AGENT_ID="$1"
ACTION_TYPE="$2"
ACTION_PAYLOAD="$3"
POLICY_PACK="${COMPLIANCE_POLICY_PACK:-HIPAA_2024}"

# Call policy evaluation API
DECISION=$(curl -s -X POST http://localhost:3000/api/v1/policy/evaluate \
  -H "Authorization: Bearer ${CFN_SERVICE_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"agent_id\": \"${AGENT_ID}\",
    \"action\": ${ACTION_PAYLOAD},
    \"policy_pack\": \"${POLICY_PACK}\"
  }")

# Extract decision
DECISION_RESULT=$(echo "$DECISION" | jq -r '.decision')

if [ "$DECISION_RESULT" = "DENY" ]; then
  # Block action
  VIOLATION_CODE=$(echo "$DECISION" | jq -r '.violation_code')
  REASON=$(echo "$DECISION" | jq -r '.reason')
  REMEDIATION=$(echo "$DECISION" | jq -r '.remediation')

  echo "POLICY VIOLATION: ${VIOLATION_CODE}" >&2
  echo "Reason: ${REASON}" >&2
  echo "" >&2
  echo "Remediation:" >&2
  echo "${REMEDIATION}" >&2

  exit 1

elif [ "$DECISION_RESULT" = "WARN" ]; then
  # Allow but warn
  WARNINGS=$(echo "$DECISION" | jq -r '.warnings[]')
  echo "POLICY WARNING: ${WARNINGS}" >&2

  # Continue execution
  EXECUTION_TOKEN=$(echo "$DECISION" | jq -r '.execution_token')
  echo "$EXECUTION_TOKEN"

else
  # Allow
  EXECUTION_TOKEN=$(echo "$DECISION" | jq -r '.execution_token')
  echo "$EXECUTION_TOKEN"
fi
```

---

## Integration with CFN v3

### Orchestration Integration Points

```typescript
// File: src/orchestrator/compliance-middleware.ts

import { PolicyEngine } from './policy-engine';
import { AuditLogger } from './audit-logger';

export class ComplianceMiddleware {
  constructor(
    private policyEngine: PolicyEngine,
    private auditLogger: AuditLogger
  ) {}

  /**
   * Middleware injected before agent spawn in orchestrate.sh
   */
  async beforeAgentSpawn(
    agentId: string,
    agentType: string,
    task: string,
    context: Record<string, any>
  ): Promise<void> {
    const action = {
      type: 'AGENT_SPAWN',
      agent_type: agentType,
      task: task,
      context: context
    };

    const decision = await this.policyEngine.evaluate(action, context.policyPack);

    if (decision.decision === 'DENY') {
      throw new PolicyViolationError(decision);
    }

    // Log agent spawn approval
    await this.auditLogger.logEvent({
      event_type: 'AGENT_SPAWN',
      agent_id: agentId,
      decision: decision.decision,
      policy_pack: context.policyPack
    });
  }

  /**
   * Middleware injected before file operations
   */
  async beforeFileOperation(
    agentId: string,
    operation: 'READ' | 'WRITE' | 'DELETE',
    filePath: string,
    content?: any
  ): Promise<string> {
    // Classify file for data sensitivity
    const dataClassification = await this.classifyFile(filePath, content);

    const action = {
      type: 'FILE_OPERATION',
      operation: operation,
      resource: filePath,
      data_classification: dataClassification,
      encryption: this.detectEncryption(content)
    };

    const decision = await this.policyEngine.evaluate(action, this.getPolicyPack(agentId));

    if (decision.decision === 'DENY') {
      throw new PolicyViolationError(decision);
    }

    // Return execution token for audit trail
    return decision.execution_token;
  }
}
```

---

## Error Handling

### Error Hierarchy

```python
class ComplianceError(Exception):
    """Base exception for compliance system"""
    pass

class PolicyViolationError(ComplianceError):
    """Raised when action violates policy"""
    def __init__(self, decision: PolicyDecision):
        self.rule_id = decision.violated_rule
        self.violation_code = decision.violation_code
        self.reason = decision.reason
        self.remediation = decision.remediation
        super().__init__(f"{self.violation_code}: {self.reason}")

class PolicyEvaluationError(ComplianceError):
    """Raised when policy engine fails to evaluate rule"""
    pass

class AuditLogError(ComplianceError):
    """Raised when audit logging fails"""
    pass

class HashChainBrokenError(ComplianceError):
    """Raised when audit log tampering detected"""
    def __init__(self, broken_at: str):
        self.broken_at = broken_at
        super().__init__(f"Audit log hash chain broken at event {broken_at}")
```

### Error Recovery Strategies

```python
def safe_policy_evaluation(action: AgentAction, policy_pack: str) -> PolicyDecision:
    """
    Wrap policy evaluation with fail-secure error handling.

    Strategy:
    1. Try primary policy engine
    2. On failure, try cache (if available)
    3. On cache miss, fail-secure (DENY)
    4. Log all errors for investigation
    """

    try:
        # Primary evaluation
        return policy_engine.evaluate(action, policy_pack)

    except PolicyEvaluationError as e:
        logger.error(f"Policy evaluation failed: {e}")

        # Try cache
        cached_decision = cache.get(action.cache_key())
        if cached_decision and cached_decision.age_seconds < 3600:
            logger.warn("Using cached policy decision due to evaluation failure")
            return cached_decision

        # Fail-secure: deny on error
        logger.critical(f"No cache available, failing secure (DENY)")
        return PolicyDecision(
            decision="DENY",
            reason=f"Policy evaluation failed: {str(e)}",
            error=True
        )

    except Exception as e:
        # Unexpected error - fail secure
        logger.critical(f"Unexpected error in policy evaluation: {e}")
        return PolicyDecision(
            decision="DENY",
            reason="Internal error in compliance system",
            error=True
        )
```

---

## Testing Strategy

### Unit Tests

```python
def test_hipaa_phi_encryption_rule():
    """Test HIPAA PHI encryption rule enforcement"""

    # Setup
    policy_engine = PolicyEngine(redis_client=mock_redis)
    policy_engine.load_pack("HIPAA_2024")

    # Test 1: Deny unencrypted PHI write
    action = AgentAction(
        type="FILE_WRITE",
        resource="/data/patients/john_doe.json",
        data_classification="PHI",
        encryption=None  # No encryption
    )

    decision = policy_engine.evaluate(action, "HIPAA_2024")

    assert decision.decision == "DENY"
    assert decision.violated_rule == "hipaa_phi_encryption"
    assert decision.violation_code == "HIPAA-164.312(a)(2)(iv)"

    # Test 2: Allow encrypted PHI write
    action_encrypted = AgentAction(
        type="FILE_WRITE",
        resource="/data/patients/john_doe.json",
        data_classification="PHI",
        encryption={
            "enabled": True,
            "algorithm": "AES-256-GCM",
            "key_management": "AWS-KMS"
        }
    )

    decision_encrypted = policy_engine.evaluate(action_encrypted, "HIPAA_2024")

    assert decision_encrypted.decision == "ALLOW"
    assert "hipaa_phi_encryption" in decision_encrypted.evaluated_rules

def test_audit_log_hash_chain():
    """Test audit log tamper detection via hash chain"""

    # Setup
    audit_logger = AuditLogger(db_connection=test_db, signing_key=test_key)

    # Log 3 events
    event1_id = audit_logger.log_event(AuditEvent(...))
    event2_id = audit_logger.log_event(AuditEvent(...))
    event3_id = audit_logger.log_event(AuditEvent(...))

    # Verify chain is valid
    result = audit_logger.verify_chain()
    assert result.is_valid == True
    assert result.total_events == 3

    # Tamper with middle event
    test_db.execute("""
        UPDATE audit_events
        SET decision = 'ALLOW'
        WHERE event_id = ?
    """, (event2_id,))

    # Verify chain detects tampering
    result_tampered = audit_logger.verify_chain()
    assert result_tampered.is_valid == False
    assert result_tampered.broken_at == event3_id  # Broken at next event
```

### Integration Tests

```bash
#!/bin/bash
# Test compliance system integration with CFN v3

set -euo pipefail

# Start compliance services
docker-compose up -d policy-engine audit-logger

# Wait for services
sleep 5

# Test 1: Policy violation blocks agent action
echo "Test 1: Policy violation blocks agent"
RESULT=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/v1/policy/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "test-agent-001",
    "action": {
      "type": "FILE_WRITE",
      "resource": "/data/patient_phi.json",
      "data_classification": "PHI",
      "encryption": null
    },
    "policy_pack": "HIPAA_2024"
  }')

if [ "$RESULT" != "200" ]; then
  echo "FAIL: Expected 200, got $RESULT"
  exit 1
fi

# Check decision is DENY
DECISION=$(curl -s -X POST http://localhost:3000/api/v1/policy/evaluate \
  -H "Content-Type: application/json" \
  -d '{...}' | jq -r '.decision')

if [ "$DECISION" != "DENY" ]; then
  echo "FAIL: Expected DENY, got $DECISION"
  exit 1
fi

echo "PASS: Policy violation correctly blocked"

# Test 2: Audit log written
echo "Test 2: Audit log written"
AUDIT_COUNT=$(psql -h localhost -U postgres -d cfn_compliance -t -c \
  "SELECT COUNT(*) FROM audit_events WHERE agent_id = 'test-agent-001'")

if [ "$AUDIT_COUNT" -lt 1 ]; then
  echo "FAIL: Expected audit event, found 0"
  exit 1
fi

echo "PASS: Audit log written correctly"

echo "All integration tests passed!"
```

---

**Document Version:** 1.0
**Last Updated:** 2024-11-17
**Author:** CFN System Architect
