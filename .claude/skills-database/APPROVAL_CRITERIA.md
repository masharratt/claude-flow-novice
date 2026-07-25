# Skills Database Approval Criteria
## Three-Tier Approval System - Detailed Definitions

**Version:** 2.0.0
**Date:** 2025-11-16
**Status:** Production Ready
**Audience:** Expert reviewers, system administrators, team leads

---

## Table of Contents

1. [Approval Level Definitions](#approval-level-definitions)
2. [Risk Assessment Rubric](#risk-assessment-rubric)
3. [Decision Matrix & Examples](#decision-matrix--examples)
4. [TDD Integration](#tdd-integration)
5. [Escalation Triggers](#escalation-triggers)
6. [Category-Specific Criteria](#category-specific-criteria)

---

## Approval Level Definitions

### Level 1: Auto-Approved

**Purpose:** Instant approval for low-risk, well-tested skills with minimal external dependencies.

**Automatic Criteria (ALL must be met):**

| Criteria | Requirement | Rationale |
|----------|-------------|-----------|
| Risk Score | ≤ 0.30 | Low security/business impact |
| Test Coverage | ≥ 95% | High code quality confidence |
| Cyclomatic Complexity | ≤ 5 | Simple, maintainable logic |
| External Dependencies | 0 | No API/service calls |
| File System Access | Local skill directory only | No cross-directory modifications |
| Security Review | Not required | Low-risk operations only |
| Database Access | Query-only or local SQLite | No production database writes |
| Credential Usage | None | No API keys or secrets |

**Approval Decision:**
- Status: Automatically APPROVED
- Approver: system
- Time to approval: < 5 seconds
- Audit trail: Automatic entry created

**Database Field Values:**
```sql
approval_level = 'auto'
last_approved_by = 'system'
last_approval_date = datetime('now')
```

**Examples of Auto-Approved Skills:**
1. **cfn-coordination-protocol-v1** (coordination)
   - Risk: 0.15, Coverage: 98%, Complexity: 3

2. **cfn-test-runner-basic** (testing)
   - Risk: 0.20, Coverage: 97%, Complexity: 2

3. **cfn-logging-utility** (foundation)
   - Risk: 0.10, Coverage: 99%, Complexity: 1

---

### Level 2: Escalated Review

**Purpose:** Expert review for medium-risk skills or those with specialized infrastructure dependencies.

**Escalation Criteria (ANY trigger escalation):**

| Trigger | Threshold | Rationale |
|---------|-----------|-----------|
| Risk Score | 0.31-0.60 | Medium security/business impact |
| Test Coverage | 80-94% | Good but not excellent coverage |
| Complexity | 6-15 | Moderate logical complexity |
| External Dependencies | 1-3 API/service calls | May require stability verification |
| Security Review | Required | Security-sensitive operations |
| Infrastructure Changes | Docker, Redis, PostgreSQL | Infrastructure expertise required |
| Cross-Team Dependencies | Affects 2+ teams | Coordination and impact analysis needed |
| Database Writes | Production databases | Data integrity verification required |
| Conditional Deployment | Config-dependent paths | Testing complexity increases |

**Escalation Process:**
- Status: Pending escalation
- Duration: 24-48 hour expert review window
- Notified Experts: 2+ security/infrastructure specialists
- Feedback Loop: Expert may request corrections
- Final Decision: Approved, Escalated-to-Human, or Rejected

**Database Field Values:**
```sql
approval_level = 'escalate'
approval_criteria = {
  "risk_score": 0.45,
  "test_coverage": 0.88,
  "requires_security_review": true,
  "external_apis": ["redis", "postgres"],
  "expert_category": "infrastructure"
}
last_approved_by = 'expert-name@example.com'
last_approval_date = '2025-11-16T14:30:00Z'
```

**Expert Review Responsibilities:**
- Validate risk assessment accuracy
- Confirm test coverage completeness
- Review security implications
- Assess integration impact
- Approve or escalate to human review
- Document reasoning in approval_history

**Examples of Escalated-Review Skills:**
1. **cfn-redis-coordination-v2** (coordination)
   - Risk: 0.45, Coverage: 88%, External: Redis
   - Expert: Infrastructure specialist

2. **cfn-postgres-connection-pool** (infrastructure)
   - Risk: 0.52, Coverage: 85%, Database: PostgreSQL
   - Expert: Database architect

3. **cfn-secure-agent-spawning** (security)
   - Risk: 0.48, Coverage: 90%, Security-critical
   - Expert: Security architect

---

### Level 3: Human Approval

**Purpose:** Senior expert review for high-risk, complex, or strategically important skills.

**Human Review Criteria (ANY trigger human approval):**

| Trigger | Threshold | Rationale |
|---------|-----------|-----------|
| Risk Score | > 0.60 | High security/business impact |
| Test Coverage | < 80% | Insufficient test coverage |
| Complexity | > 15 | High cyclomatic complexity |
| New Category | First skill in category | Requires strategic decision |
| Revenue Impact | Affects revenue systems | Business-critical decision |
| Multi-System Integration | Changes 3+ major systems | Complex interactions require analysis |
| Compliance/Regulatory | HIPAA, SOC2, GDPR implications | Legal/regulatory decision required |
| Escalation Feedback | Repeated rejections/corrections | Quality gate failures indicate deeper issues |
| Architecture Change | Changes approval system itself | Meta-level decision requires oversight |

**Human Review Process:**
- Status: Pending senior expert decision
- Duration: 3-7 day review window
- Assigned: Senior architect + team lead
- Analysis: Deep code review, impact assessment, risk evaluation
- Final Decision: Approved, Rejected, or Needs-Correction
- Board Review: Optional for strategic decisions

**Database Field Values:**
```sql
approval_level = 'human'
approval_criteria = {
  "risk_score": 0.72,
  "test_coverage": 0.75,
  "complexity": 18,
  "affects_systems": ["orchestration", "agent-spawning", "coordination"],
  "requires_board_review": true,
  "compliance_category": "governance"
}
last_approved_by = 'cto@example.com'
last_approval_date = '2025-11-18T10:00:00Z'
```

**Human Review Responsibilities:**
- Conduct comprehensive code review
- Evaluate business impact and risk
- Assess compliance and regulatory implications
- Determine resource requirements
- Make final approval/rejection decision
- Document strategic rationale

**Examples of Human-Approved Skills:**
1. **cfn-orchestration-v3-enhanced** (orchestration)
   - Risk: 0.68, Coverage: 75%, Complexity: 22
   - Strategic: Major system redesign

2. **cfn-agent-spawn-secure-v2** (infrastructure)
   - Risk: 0.75, Coverage: 78%, Security-critical
   - Compliance: GDPR-relevant changes

3. **cfn-event-bus-distributed** (architecture)
   - Risk: 0.70, Coverage: 72%, Affects 5+ systems
   - Strategic: Changes CFN Loop design

---

## Risk Assessment Rubric

### Component Risk Scoring (0.0 = Safe, 1.0 = Critical Risk)

#### 1. Security Impact (Weight: 35%)
```
0.0 - 0.2:   No security implications
              Example: Logging utility, test helper

0.2 - 0.4:   Low security impact (read-only)
              Example: Query tool, metrics reader

0.4 - 0.6:   Medium security impact (write access)
              Example: Database modifier, config updater

0.6 - 0.8:   High security impact (secrets/credentials)
              Example: Key manager, auth system

0.8 - 1.0:   Critical security impact (breach = data loss)
              Example: Encryption system, audit log modifier
```

**Sub-components:**
- Credential Handling: 0=None, 0.3=API keys only, 0.7=Secrets, 1.0=Multi-secret types
- Data Access Scope: 0=Own dir, 0.3=Project, 0.6=Database, 0.9=External systems, 1.0=Critical infrastructure
- Error Handling: 1.0 = Safe, 0.7 = Logs errors, 0.4 = Sometimes logs, 0.0 = Silent failures

#### 2. Complexity Score (Weight: 25%)
```
0 - 3:       Low - Single function, linear flow
             Example: Echo utility, simple wrapper

4 - 7:       Medium - Multiple branches, some state
             Example: Routing logic, multi-step process

8 - 12:      Medium-High - Complex state, recursion
             Example: Tree traversal, backtracking

13 - 20:     High - Multiple interactions, edge cases
             Example: Consensus algorithm, orchestrator

21+:         Critical - Meta-complexity
             Example: Complete CFN Loop redesign
```

**Normalize to 0.0-1.0:** complexity_score / 20 (capped at 1.0)

#### 3. Test Coverage (Weight: 20%)
```
< 50%:       0.9 risk (insufficient confidence)
50-70%:      0.7 risk
70-80%:      0.5 risk
80-95%:      0.2 risk
95%+:        0.0 risk (high confidence)
```

Adjusted by test quality:
- 100% line coverage + edge cases = 0.0
- 95% coverage without edge cases = 0.1
- Coverage < 80% + no critical path testing = 0.9

#### 4. External Dependencies (Weight: 15%)
```
0 dependencies:        0.0 risk
1 stable dependency:   0.2 risk
2-3 dependencies:      0.4 risk
4+ dependencies:       0.6 risk
Unstable/beta deps:    +0.3 risk multiplier
Undocumented deps:     +0.2 risk multiplier
```

**Examples:**
- No external calls = 0.0
- Queries local SQLite = 0.1 (low risk)
- Calls Redis cluster = 0.3 (stable, documented)
- Calls 3 microservices + custom API = 0.7 (high coupling)

#### 5. Business Criticality (Weight: 5%)
```
Non-critical (testing, docs):           0.0 risk
Standard tools (utilities, helpers):    0.1 risk
Important (frequently used):            0.3 risk
Critical (affects multiple teams):      0.5 risk
Revenue-impacting (payment system):     0.8 risk
Core infrastructure (can break system): 1.0 risk
```

### Aggregate Risk Formula

```
Aggregate Risk = (
  Security_Impact × 0.35 +
  Complexity_Score × 0.25 +
  Test_Coverage_Risk × 0.20 +
  External_Deps_Risk × 0.15 +
  Business_Criticality × 0.05
)
```

**Example Calculation:**

**Skill: cfn-redis-coordination-v2**

| Component | Score | Weight | Contribution |
|-----------|-------|--------|--------------|
| Security Impact | 0.35 | 0.35 | 0.1225 |
| Complexity (12/20) | 0.60 | 0.25 | 0.1500 |
| Test Coverage (88%) | 0.20 | 0.20 | 0.0400 |
| External Deps (Redis) | 0.30 | 0.15 | 0.0450 |
| Business Critical | 0.30 | 0.05 | 0.0150 |
| **Total Risk** | | | **0.3725** |

**Decision:** Escalation (0.31-0.60 range)

**Example Calculation:**

**Skill: cfn-agent-spawn-secure-v2**

| Component | Score | Weight | Contribution |
|-----------|-------|--------|--------------|
| Security Impact | 0.75 | 0.35 | 0.2625 |
| Complexity (18/20) | 0.90 | 0.25 | 0.2250 |
| Test Coverage (78%) | 0.50 | 0.20 | 0.1000 |
| External Deps (3 APIs) | 0.40 | 0.15 | 0.0600 |
| Business Critical | 0.80 | 0.05 | 0.0400 |
| **Total Risk** | | | **0.6875** |

**Decision:** Human Approval (> 0.60)

---

## Decision Matrix & Examples

### Complete Decision Tree

```
START: New Skill Submission
  │
  ├─ Risk Score > 0.60?
  │  ├─ YES → HUMAN APPROVAL (Rule 1)
  │  └─ NO  → Continue
  │
  ├─ Test Coverage < 80%?
  │  ├─ YES → HUMAN APPROVAL (Rule 2)
  │  └─ NO  → Continue
  │
  ├─ Complexity > 15?
  │  ├─ YES → HUMAN APPROVAL (Rule 3)
  │  └─ NO  → Continue
  │
  ├─ Risk Score 0.31-0.60?
  │  ├─ YES → ESCALATED REVIEW (Rule 4)
  │  └─ NO  → Continue
  │
  ├─ Test Coverage 80-94%?
  │  ├─ YES → Check Dependencies
  │  │  ├─ External Deps? → ESCALATED REVIEW (Rule 5)
  │  │  └─ No Deps → AUTO APPROVAL
  │  └─ NO  → Continue
  │
  ├─ Complexity 6-15?
  │  ├─ YES → ESCALATED REVIEW (Rule 6)
  │  └─ NO  → Continue
  │
  └─ All Criteria Met?
     ├─ YES → AUTO APPROVAL
     └─ NO  → ESCALATED REVIEW (Fallback)
```

### 25+ Real-World Examples

#### AUTO-APPROVED SKILLS (Risk ≤ 0.30)

**1. cfn-logging-utility**
- Category: foundation
- Risk: 0.12 (safe logging operations)
- Coverage: 99% (comprehensive tests)
- Complexity: 1 (single function)
- Dependencies: 0
- Decision: AUTO
- Reason: Safe utility with excellent coverage

**2. cfn-test-runner-basic**
- Category: testing
- Risk: 0.18 (test execution, no side effects)
- Coverage: 97% (edge cases covered)
- Complexity: 3 (linear flow)
- Dependencies: 0
- Decision: AUTO
- Reason: Simple tool with high confidence

**3. cfn-coordination-protocol-v1**
- Category: coordination
- Risk: 0.15 (no external calls)
- Coverage: 98% (comprehensive blocking tests)
- Complexity: 4 (limited state)
- Dependencies: 0 (signal-based only)
- Decision: AUTO
- Reason: Pure coordination logic, well-tested

**4. cfn-echo-wrapper**
- Category: foundation
- Risk: 0.08 (shell wrapper)
- Coverage: 95% (basic tests)
- Complexity: 2 (passthrough)
- Dependencies: 0
- Decision: AUTO
- Reason: Minimal risk wrapper

**5. cfn-json-parser**
- Category: utilities
- Risk: 0.22 (JSON parsing)
- Coverage: 96% (malformed input tests)
- Complexity: 3 (regex patterns)
- Dependencies: 0 (standard jq)
- Decision: AUTO
- Reason: Well-established tool with safe operations

#### ESCALATED-REVIEW SKILLS (Risk 0.31-0.60)

**6. cfn-redis-coordination-v2**
- Category: coordination
- Risk: 0.37 (Redis connection risk)
- Coverage: 88% (good but not excellent)
- Complexity: 7 (Redis protocol handling)
- Dependencies: Redis cluster
- Trigger: Medium risk + external dependency
- Decision: ESCALATE
- Expert: Infrastructure specialist
- Review SLA: 48 hours

**7. cfn-postgres-connection-pool**
- Category: infrastructure
- Risk: 0.42 (database connection management)
- Coverage: 85% (connection timeout edge cases)
- Complexity: 9 (state machine)
- Dependencies: PostgreSQL server
- Trigger: Database writes + medium complexity
- Decision: ESCALATE
- Expert: Database architect
- Review SLA: 48 hours

**8. cfn-secure-agent-spawning**
- Category: security
- Risk: 0.48 (security-critical operation)
- Coverage: 90% (attack vector testing)
- Complexity: 8 (validation logic)
- Dependencies: 2 (crypto libraries)
- Trigger: Security-sensitive operations
- Decision: ESCALATE
- Expert: Security architect
- Review SLA: 48 hours

**9. cfn-event-bus-local**
- Category: infrastructure
- Risk: 0.35 (local event routing)
- Coverage: 82% (message loss scenarios)
- Complexity: 10 (event queueing)
- Dependencies: 1 (bash arrays)
- Trigger: Medium complexity + external dependency
- Decision: ESCALATE
- Expert: Architecture specialist
- Review SLA: 48 hours

**10. cfn-agent-selector-v2**
- Category: coordination
- Risk: 0.41 (agent selection logic)
- Coverage: 87% (preference handling)
- Complexity: 8 (multi-factor scoring)
- Dependencies: 0
- Trigger: Medium risk + complexity
- Decision: ESCALATE
- Expert: Orchestration specialist
- Review SLA: 48 hours

#### HUMAN-APPROVED SKILLS (Risk > 0.60)

**11. cfn-orchestration-v3-enhanced**
- Category: orchestration
- Risk: 0.68 (orchestrator redesign)
- Coverage: 75% (below threshold)
- Complexity: 22 (high: state machines, timeouts)
- Dependencies: 5 (Redis, databases, APIs)
- Triggers: Risk > 0.60, Coverage < 80%, Complexity > 15
- Decision: HUMAN
- Assigned: CTO + Architecture Lead
- Review SLA: 7 days
- Board Review: YES (strategic change)

**12. cfn-agent-spawn-secure-v2**
- Category: infrastructure
- Risk: 0.75 (security-critical: process creation)
- Coverage: 78% (below threshold)
- Complexity: 14 (near-threshold: process groups)
- Dependencies: 3 (os, signal handlers, crypto)
- Triggers: Risk > 0.60, Coverage < 80%
- Decision: HUMAN
- Assigned: Security Architect + CTO
- Review SLA: 7 days
- Board Review: YES (security implications)

**13. cfn-event-bus-distributed**
- Category: architecture
- Risk: 0.70 (distributed system complexity)
- Coverage: 72% (below threshold)
- Complexity: 24 (very high: consensus, replication)
- Dependencies: 4 (Redis, PostgreSQL, gRPC, custom)
- Triggers: Risk > 0.60, Coverage < 80%, Complexity > 15, Multi-system integration
- Decision: HUMAN
- Assigned: Principal Architect + CTO
- Review SLA: 7 days
- Board Review: YES (affects all systems)

**14. cfn-approval-system-redesign**
- Category: governance
- Risk: 0.82 (affects approval process itself)
- Coverage: 70% (below threshold)
- Complexity: 26 (meta-complexity)
- Dependencies: 6+ (database, notifications, validators)
- Triggers: Risk > 0.60, Coverage < 80%, Architecture change, Revenue impact
- Decision: HUMAN
- Assigned: CTO + All Tech Leads
- Review SLA: 14 days
- Board Review: YES (governance change)

**15. cfn-compliance-audit-system**
- Category: governance
- Risk: 0.80 (regulatory compliance)
- Coverage: 68% (below threshold)
- Complexity: 20 (compliance rules engine)
- Dependencies: 5 (audit log, database, notification)
- Triggers: Risk > 0.60, Coverage < 80%, Compliance implications
- Decision: HUMAN
- Assigned: Compliance Officer + CTO
- Review SLA: 14 days
- Board Review: YES (legal/compliance)

### Category-Specific Patterns

**Coordination Skills:**
- Auto: Risk ≤ 0.25, No external calls, Coverage ≥ 95%
- Escalate: Risk 0.26-0.50, Redis/local services, Coverage ≥ 85%
- Human: Risk > 0.50, Multi-system, Coverage < 80%

**Infrastructure Skills:**
- Auto: Simple utilities, No database access, Coverage ≥ 95%
- Escalate: Docker/Kubernetes changes, PostgreSQL queries, Coverage ≥ 80%
- Human: Distributed system changes, Schema changes, Coverage < 80%

**Security Skills:**
- Auto: Validation logic, No credential handling, Coverage ≥ 95%
- Escalate: Encryption wrappers, API key management, Coverage ≥ 85%
- Human: Auth system changes, Compliance changes, Coverage < 90%

**Testing Skills:**
- Auto: Test runners, Assertions, Coverage ≥ 90%
- Escalate: Custom test frameworks, CI/CD integration, Coverage ≥ 80%
- Human: Credential injection in tests, Agent mocking systems, Coverage < 80%

**Foundation Skills:**
- Auto: Logging, Echo wrappers, Config readers, Coverage ≥ 95%
- Escalate: Complex utilities, Multiple dependencies, Coverage ≥ 90%
- Human: Core utilities affecting other skills, Coverage < 85%

---

## TDD Integration

### Test Coverage Requirements by Approval Level

#### Auto-Approval
- Minimum coverage: **95%**
- Test pass rate: **100%** (no failures allowed)
- Coverage must include:
  - Happy path (main functionality)
  - Error cases (invalid input)
  - Edge cases (boundary conditions)
  - Timeout scenarios (if applicable)
- Coverage gaps allowed: None
- Report format: Line coverage + branch coverage

#### Escalated Review
- Minimum coverage: **80%**
- Test pass rate: **98%+** (max 1 failure per 50 tests)
- Coverage must include:
  - Core functionality paths
  - Major error cases
  - Common edge cases
  - Integration points
- Coverage gaps allowed: < 20% for non-critical paths
- Expert validates coverage adequacy during review

#### Human Approval
- Minimum coverage: **None** (can be < 50%)
- Test pass rate: No minimum
- Coverage quality evaluated by:
  - Test comprehensiveness
  - Critical path coverage
  - Maintainability of tests
  - Test documentation
- Human reviewer determines adequacy
- Plan for test improvement may be required

### Test Execution Integration

**Before Approval Submission:**
```bash
# Run test suite and capture results
./test.sh > test_results.json 2>&1

# Extract coverage metrics
coverage_pct=$(grep 'coverage:' test_results.json | awk '{print $2}')

# Determine approval level based on coverage + risk
if [[ $(echo "$coverage_pct >= 0.95" | bc) -eq 1 ]]; then
  approval_level="auto"
elif [[ $(echo "$coverage_pct >= 0.80" | bc) -eq 1 ]]; then
  approval_level="escalate"
else
  approval_level="human"
fi
```

**Recording Test Results in Database:**
```sql
-- Insert into approval_history
INSERT INTO approval_history (
  skill_id,
  version,
  approval_level,
  approver,
  decision,
  test_results
) VALUES (
  1,
  '2.1.0',
  'escalate',
  'system',
  'escalated',
  json_object(
    'pass_count', 45,
    'fail_count', 0,
    'pass_rate', 1.0,
    'coverage_pct', 88,
    'test_duration_sec', 12.4
  )
);
```

---

## Escalation Triggers

### Automatic Escalation Rules

**Rule 1: Security Sensitivity**
- Any skill handling credentials/secrets
- Any skill modifying audit trails
- Any skill changing access controls
- Result: ESCALATE or HUMAN (auto-escalate to expert)

**Rule 2: External Service Dependencies**
- Redis/Memcached connections
- PostgreSQL/MySQL database access
- AWS/cloud provider API calls
- Third-party API integrations
- Result: ESCALATE (expert review required)

**Rule 3: Test Coverage Below Threshold**
- Coverage 50-79%: ESCALATE
- Coverage < 50%: HUMAN
- Result: Expert determines if acceptable for use case

**Rule 4: Complexity Threshold**
- Cyclomatic complexity 6-15: ESCALATE
- Cyclomatic complexity > 15: HUMAN
- Result: Expert validates that complexity is justified

**Rule 5: Cross-Team Dependencies**
- Any skill used by 3+ teams
- Any skill in critical path for multiple systems
- Any skill affecting deployment pipeline
- Result: ESCALATE or HUMAN (impact analysis required)

**Rule 6: Production Environment Changes**
- Database schema modifications
- Infrastructure configuration changes
- Log level/retention policy changes
- Result: HUMAN (requires coordination)

---

## Category-Specific Criteria

### Coordination Skills
**Purpose:** Enable multi-agent orchestration and synchronization

**Auto-Approval Criteria:**
- Risk ≤ 0.25
- Coverage ≥ 95%
- Complexity ≤ 5
- Only signal-based communication (no API calls)
- No database access

**Example:** `cfn-coordination-protocol-v1` - Pure signal-based blocking mechanism

**Escalation Criteria:**
- Risk 0.26-0.50
- Coverage ≥ 85%
- Uses Redis/local coordination services
- Single system integration

**Example:** `cfn-redis-coordination-v2` - Redis-backed coordination with state management

**Human Approval Criteria:**
- Risk > 0.50
- Coverage < 80%
- Multi-system orchestration
- Changes to CFN Loop semantics

**Example:** `cfn-orchestration-v3-enhanced` - Redesigned orchestration system

### Infrastructure Skills
**Purpose:** Manage system resources, deployment, and operations

**Auto-Approval Criteria:**
- Risk ≤ 0.30
- Coverage ≥ 95%
- Complexity ≤ 5
- No database schema changes
- No credential handling

**Example:** `cfn-docker-helper` - Docker command wrapper

**Escalation Criteria:**
- Risk 0.31-0.60
- Coverage ≥ 80%
- Kubernetes/Docker changes
- Database query (read-only)
- Environment configuration

**Example:** `cfn-postgres-connection-pool` - Connection management

**Human Approval Criteria:**
- Risk > 0.60
- Coverage < 80%
- Database schema changes
- Distributed system changes
- Compliance implications

**Example:** `cfn-event-bus-distributed` - Distributed messaging system

### Security Skills
**Purpose:** Handle authentication, authorization, and secure operations

**Auto-Approval Criteria:**
- Risk ≤ 0.25
- Coverage ≥ 95%
- Complexity ≤ 5
- Validation/sanitization logic only
- No credential creation/storage

**Example:** `cfn-input-validator` - Safe input validation

**Escalation Criteria:**
- Risk 0.31-0.60
- Coverage ≥ 85%
- Encryption wrappers
- API key management (read-only)
- Permission checking

**Example:** `cfn-secure-agent-spawning` - Secure process creation

**Human Approval Criteria:**
- Risk > 0.60
- Coverage < 80%
- Credential storage/generation
- Auth system changes
- Compliance/regulatory implications

**Example:** `cfn-compliance-audit-system` - Regulatory compliance system

### Testing Skills
**Purpose:** Enable reliable test execution and validation

**Auto-Approval Criteria:**
- Risk ≤ 0.25
- Coverage ≥ 95%
- Complexity ≤ 5
- No test side effects
- No credential injection

**Example:** `cfn-test-runner` - Basic test execution wrapper

**Escalation Criteria:**
- Risk 0.31-0.60
- Coverage ≥ 80%
- Custom test framework
- Integration with CI/CD
- Mock object generation

**Example:** `cfn-mock-agent-system` - Agent mocking framework

**Human Approval Criteria:**
- Risk > 0.60
- Coverage < 80%
- Credential injection in tests
- Test database population
- Compliance test requirements

**Example:** `cfn-compliance-test-suite` - Regulatory testing

### Foundation Skills
**Purpose:** Bootstrap system with core utilities

**Auto-Approval Criteria:**
- Risk ≤ 0.20 (most restrictive)
- Coverage ≥ 95%
- Complexity ≤ 5
- No external dependencies
- No state modification

**Example:** `cfn-logging-utility` - Safe logging wrapper

**Escalation Criteria:**
- Risk 0.21-0.45
- Coverage ≥ 90%
- Limited external dependencies
- Used by multiple skills

**Example:** `cfn-json-parser` - JSON parsing utility

**Human Approval Criteria:**
- Risk > 0.45
- Coverage < 80%
- Core infrastructure change
- Affects skill loading
- System bootstrap changes

**Example:** `cfn-skill-registry-v2` - Skills database initialization

---

## Approval Criteria Database Schema

### Storing Approval Criteria

```sql
-- Define criteria for auto-approved coordination skills
INSERT INTO approval_criteria_templates (
  approval_level,
  category,
  criteria_json,
  description,
  enabled
) VALUES (
  'auto',
  'coordination',
  json_object(
    'risk_score_max', 0.3,
    'test_coverage_min', 0.95,
    'complexity_max', 'low',
    'external_dependencies', false,
    'requires_security_review', false,
    'cyclomatic_complexity_max', 5,
    'allowed_file_system_access', 'skill_directory_only'
  ),
  'Auto-approve simple coordination skills with high test coverage and no external dependencies',
  1
);

-- Define criteria for escalated infrastructure skills
INSERT INTO approval_criteria_templates (
  approval_level,
  category,
  criteria_json,
  description,
  enabled
) VALUES (
  'escalate',
  'infrastructure',
  json_object(
    'risk_score_min', 0.31,
    'risk_score_max', 0.6,
    'test_coverage_min', 0.80,
    'complexity_min', 'medium',
    'complexity_max', 'high',
    'allowed_external_services', ['redis', 'postgres', 'docker'],
    'requires_security_review', true,
    'requires_infrastructure_review', true,
    'expert_email', 'infrastructure@example.com'
  ),
  'Escalated review for medium-risk infrastructure changes',
  1
);
```

### Querying for Approval Level

```sql
-- Determine approval level for a new skill
SELECT
  s.id,
  s.name,
  s.category,
  CASE
    WHEN s.test_coverage >= 0.95
      AND json_extract(s.approval_criteria, '$.risk_score') <= 0.30
      AND json_extract(s.approval_criteria, '$.complexity_score') <= 5
      THEN 'auto'
    WHEN s.test_coverage >= 0.80
      AND json_extract(s.approval_criteria, '$.risk_score') <= 0.60
      THEN 'escalate'
    ELSE 'human'
  END as recommended_approval_level
FROM skills s
WHERE s.status = 'active'
ORDER BY s.created_at DESC;
```

---

## Summary

The three-tier approval system ensures:

1. **Efficiency:** 80%+ of skills auto-approved in < 5 seconds
2. **Quality:** Risk-based routing ensures appropriate review levels
3. **Scalability:** Human experts review only high-risk skills
4. **Compliance:** Complete audit trail of all decisions
5. **Flexibility:** Category-specific criteria for domain expertise
6. **Continuous Improvement:** TDD integration drives test coverage

By following these detailed criteria and rubrics, expert reviewers can consistently make informed approval decisions that balance speed, quality, and risk management.
