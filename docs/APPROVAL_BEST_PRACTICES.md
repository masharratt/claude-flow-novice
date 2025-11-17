# Approval Best Practices for Skills Database

## Overview

The Skills Database implements a three-tier approval system designed to balance innovation velocity with security and reliability. This system automatically evaluates skill contributions across three approval levels, enabling rapid deployment of trusted patterns while maintaining strict control over higher-risk changes.

### System Philosophy

The approval workflow follows a risk-aware governance model:
- **Security First**: Automatically blocks changes with high security risk
- **Speed for Proven Patterns**: Auto-approves low-risk, well-tested contributions
- **Expert Gate for Novel Approaches**: Requires human review for untested patterns
- **Continuous Improvement**: Escalates skills based on real-world effectiveness metrics

### Three-Tier Approval System

| Level | Risk Range | Process | SLA | Use Case |
|-------|-----------|---------|-----|----------|
| Auto-Approval | ≤ 0.30 | Automated decision | Instant | Proven patterns, low risk |
| Escalation | 0.30 - 0.60 | Expert review | 48 hours | Moderate complexity, infrastructure |
| Human Approval | > 0.60 | Comprehensive review | 7 days | Novel patterns, high security impact |

---

## Approval Level Guidelines

### Auto-Approval (Risk Score ≤ 0.30)

**When to Use:**
- Proven coordination and orchestration patterns
- Well-established agent spawning workflows
- Low-risk monitoring or logging enhancements
- Test utility improvements with no production impact
- Documentation and reference implementations

**Examples:**
- Standard CFN Loop workflow enhancements
- Coordination signal improvements (proven patterns)
- Agent spawning CLI wrapper updates
- Performance monitoring additions
- Unit test suite extensions

**Approval Criteria:**
- Test coverage ≥ 95%
- No external dependencies on unreliable services
- Reviewed patterns (documented in codebase)
- No security-sensitive operations
- No breaking API changes
- Code reviewed by at least one team member

**Review Frequency:** Quarterly audit (statistical validation)

**Escalation Triggers:**
- Test coverage drops below 95%
- Unreviewed patterns introduced
- Performance degradation detected (>10% regression)

**Example Risk Calculation:**
```
Pattern: New coordination signal helper
- Security weight (0.35): 0.0 (no auth/sensitive data) = 0.0
- Complexity weight (0.25): 0.1 (simple wrapper) = 0.025
- Coverage impact (0.20): 0.0 (95% test coverage) = 0.0
- Dependencies weight (0.15): 0.0 (stdlib only) = 0.0
- Criticality weight (0.05): 0.2 (internal tooling) = 0.01
Total Risk Score: 0.035 → AUTO-APPROVED
```

---

### Escalation Review (Risk Score 0.30 - 0.60)

**When to Use:**
- Docker operations and container orchestration
- Database migrations and schema changes
- API integrations with external services
- Caching strategies
- Infrastructure automation
- Performance-critical code paths

**Examples:**
- New Docker build optimization
- PostgreSQL connection pool adjustments
- Redis caching layer integration
- Monitoring system enhancements
- Backup/restore procedure improvements
- Network configuration changes

**Approval Criteria:**
- Test coverage ≥ 90%
- Security review completed (documented)
- Expert consultation on complexity areas
- Performance benchmarks defined and tested
- Rollback procedure documented
- No unknown failure modes

**SLA for Review:** 48 hours (business days)

**Review Checklist:**
- [ ] Architecture reviewed for scalability
- [ ] Performance impact validated
- [ ] Security considerations addressed
- [ ] Failure modes identified
- [ ] Monitoring points defined
- [ ] Rollback procedure tested
- [ ] Team communication plan in place

**Escalation Triggers from Auto-Approval:**
- Bug report received within 30 days
- Performance issues detected (>100ms execution time)
- Confidence impact < 0.05 (ineffective pattern)
- User complaints or operational issues

**Example Risk Calculation:**
```
Pattern: Docker build optimization with new caching layer
- Security weight (0.35): 0.3 (external Docker daemon) = 0.105
- Complexity weight (0.25): 0.5 (new caching logic) = 0.125
- Coverage impact (0.20): 0.2 (90% test coverage) = 0.04
- Dependencies weight (0.15): 0.4 (Docker SDK) = 0.06
- Criticality weight (0.05): 0.4 (build system) = 0.02
Total Risk Score: 0.35 → ESCALATE (Expert Review)
```

---

### Human Approval (Risk Score > 0.60)

**When to Use:**
- Novel authentication or authorization patterns
- Encryption or cryptographic operations
- Payment processing or financial transactions
- Data handling involving PII or sensitive information
- Major architectural shifts
- Compliance-critical features (GDPR, SOC2, HIPAA)
- Production incident resolutions with system-wide impact

**Examples:**
- New JWT validation strategy
- Database encryption at rest
- API rate limiting with financial consequences
- Customer data export functionality
- Audit logging improvements
- Access control policy changes
- Disaster recovery procedures

**Approval Criteria (ALL REQUIRED):**
- Expert security review completed and documented
- Test coverage ≥ 90% (including edge cases)
- Threat model documented
- Compliance requirements verified
- Peer review from 2+ senior engineers
- Documentation complete with examples
- Rollback procedure defined and tested
- Monitoring and alerting configured
- Runbook created for operational concerns
- Legal/compliance sign-off (if applicable)

**SLA for Review:** 7 days (critical path scheduling)

**Emergency SLA:** 4 hours (on-call escalation required)

**Human Review Checklist:**
- [ ] Security threat model completed
- [ ] OWASP Top 10 considerations reviewed
- [ ] Cryptographic operations validated by expert
- [ ] Data flow diagram created
- [ ] PII/sensitive data handling verified
- [ ] Compliance requirements mapped to code
- [ ] Disaster recovery tested
- [ ] Monitoring covers all failure paths
- [ ] Documentation includes security implications
- [ ] Team training completed
- [ ] Approval signed by technical lead

**Example Risk Calculation:**
```
Pattern: New JWT token validation system
- Security weight (0.35): 0.9 (authentication critical) = 0.315
- Complexity weight (0.25): 0.8 (crypto operations) = 0.20
- Coverage impact (0.20): 0.4 (85% coverage) = 0.08
- Dependencies weight (0.15): 0.7 (jwt library) = 0.105
- Criticality weight (0.05): 1.0 (authentication) = 0.05
Total Risk Score: 0.74 → HUMAN APPROVAL REQUIRED
```

---

## Risk Assessment Guidelines

### Risk Calculation Formula

```
risk_score = (security_weight × 0.35) +
             (complexity_weight × 0.25) +
             (coverage_impact × 0.20) +
             (dependencies_weight × 0.15) +
             (criticality_weight × 0.05)
```

**Scoring Scale for Each Factor:** 0.0 (minimal risk) to 1.0 (maximum risk)

### Risk Factor Definitions

#### 1. Security Weight (35% - Highest Impact)
**Considerations:**
- Authentication/authorization changes (0.7-1.0)
- External API communication (0.4-0.7)
- Data encryption/handling (0.6-1.0)
- Input validation (0.3-0.6)
- Privilege elevation (0.8-1.0)
- Audit logging (0.2-0.4)
- No security concerns (0.0)

**Examples:**
- JWT validation system: 0.9
- Docker build cache: 0.3
- New logging format: 0.1
- Payment processor integration: 1.0

#### 2. Complexity Weight (25% - Second Priority)
**Considerations:**
- Lines of code (simple: <50 = 0.1, complex: >500 = 0.8)
- Cyclomatic complexity (simple: <5 = 0.1, complex: >15 = 0.8)
- Nesting depth (shallow: <3 = 0.1, deep: >5 = 0.7)
- Algorithm complexity (O(1) = 0.0, O(n!) = 1.0)
- State management complexity (stateless = 0.0, complex = 0.8)

**Examples:**
- Simple CLI wrapper (50 LOC): 0.1
- Docker orchestration (300 LOC): 0.5
- Distributed consensus algorithm: 0.9

#### 3. Coverage Impact (20% - Test Quality)
**Considerations:**
- Unit test coverage (95%+ = 0.0, <50% = 1.0)
- Integration test coverage (80%+ = 0.1, <20% = 1.0)
- Edge case testing (comprehensive = 0.0, none = 1.0)
- Manual testing required (none = 0.0, extensive = 0.8)
- Production monitoring in place (yes = 0.1, no = 0.8)

**Coverage Scoring:**
```
95%+ coverage: 0.0
80-94% coverage: 0.2
70-79% coverage: 0.4
60-69% coverage: 0.6
<60% coverage: 0.9
```

#### 4. Dependencies Weight (15% - External Risk)
**Considerations:**
- Number of external dependencies (0 = 0.0, 10+ = 0.7)
- Dependency stability (stable, long-term: 0.0, new: 0.8)
- Version constraints (pinned = 0.1, loose = 0.6)
- Security update frequency (active: 0.1, stale: 0.9)
- Transitive dependency risk (well-vetted: 0.1, unknown: 0.7)
- Internal dependencies only: 0.0

**Examples:**
- stdlib only: 0.0
- Single stable dependency (jwt): 0.2
- Three stable dependencies: 0.4
- Ten loosely-versioned dependencies: 0.8

#### 5. Criticality Weight (5% - Impact Scope)
**Considerations:**
- Impact on core system (no = 0.0, yes = 1.0)
- User-facing impact (internal = 0.1, user-visible = 0.8)
- Data criticality (non-critical = 0.1, user data = 0.9)
- Failure consequences (recoverable = 0.2, critical = 1.0)
- Deployment risk (safe rollback = 0.1, hard to revert = 0.8)

**Examples:**
- Test utility: 0.1
- Build system enhancement: 0.4
- User authentication: 1.0
- API response formatting: 0.3

---

## Escalation Criteria

### When to Escalate from Auto-Approval to Escalation Review

**Automatic Escalation Triggers:**
1. Bug report filed within 30 days of deployment
2. Performance issue detected: execution time > 100ms (original baseline)
3. Confidence impact < 0.05 (pattern ineffective in production)
4. Test coverage drops below 95% during iterations
5. Unplanned user impact reported
6. Security vulnerability identified during use

**Manual Escalation (Team Decision):**
- User complaints or operational friction
- Repeated failures in specific conditions
- Resource consumption higher than expected (>20% regression)
- Unexpected interactions with other systems
- Team expertise gap identified

**Escalation Process:**
1. Risk score recalculated with new data
2. If new score > 0.30, trigger escalation review
3. Notify expert reviewer with issue summary
4. Schedule review within 48 hours
5. Document findings in approval_history table
6. Update approval level if necessary

### When to Escalate from Escalation Review to Human Approval

**Automatic Escalation Triggers:**
1. Expert reviewer identifies security concerns during review
2. Performance benchmarks not met (>20% regression)
3. Test coverage insufficient to validate complex behavior
4. Architecture conflicts with existing systems
5. Compliance requirements discovered during review
6. External dependencies have security vulnerabilities

**Criteria for Escalation Decision:**
- Risk score increases to > 0.60 based on findings
- Multiple reviewers recommend human approval
- Precedent exists for similar features requiring human approval
- Business impact exceeds acceptable thresholds
- Regulatory/compliance concerns present

**Escalation Communication:**
1. Expert provides detailed escalation summary
2. Identify specific security/compliance concerns
3. Recommend additional expertise needed
4. Set realistic timeline for human review
5. Prepare detailed documentation for human reviewer

---

## Expert Review Checklist

### Security Audit Checklist

**Authentication & Authorization:**
- [ ] Authentication mechanism clearly defined
- [ ] Authorization boundaries documented
- [ ] Privilege levels validated against requirements
- [ ] Session management reviewed for vulnerabilities
- [ ] Token/credential handling follows best practices
- [ ] Audit trail captures security-relevant events

**Data Protection:**
- [ ] Sensitive data identified and classified
- [ ] Encryption at rest implemented where required
- [ ] Encryption in transit enforced (TLS/HTTPS)
- [ ] Data access controls properly implemented
- [ ] PII handling compliant with regulations
- [ ] Data retention policies enforced

**API Security:**
- [ ] Input validation comprehensive and robust
- [ ] Output encoding prevents injection attacks
- [ ] Rate limiting prevents abuse
- [ ] API authentication enforced
- [ ] CORS policies properly configured
- [ ] Error messages don't leak sensitive information

**Infrastructure Security:**
- [ ] Network isolation properly configured
- [ ] Database credentials not hardcoded
- [ ] Secrets management system used
- [ ] Logging captures security events
- [ ] Monitoring alerts on suspicious activities
- [ ] Incident response procedures documented

### Code Quality Checklist

**Testing:**
- [ ] Unit tests cover all critical paths
- [ ] Integration tests validate external dependencies
- [ ] Edge cases tested and documented
- [ ] Error handling tested
- [ ] Performance tests run and documented
- [ ] Tests runnable in CI/CD pipeline

**Documentation:**
- [ ] Architecture documentation complete
- [ ] API documentation matches implementation
- [ ] Security implications documented
- [ ] Configuration options documented
- [ ] Troubleshooting guide included
- [ ] Examples provided for common use cases

**Performance:**
- [ ] Benchmarks established and met
- [ ] No memory leaks identified
- [ ] Resource usage within acceptable limits
- [ ] Scalability tested
- [ ] Caching strategy validated
- [ ] Database query optimization confirmed

**Maintainability:**
- [ ] Code follows project standards
- [ ] Complexity within acceptable limits
- [ ] Dependencies well-understood
- [ ] Technical debt documented
- [ ] Future maintainability considered
- [ ] Knowledge shared with team

### Operational Readiness Checklist

**Deployment & Rollback:**
- [ ] Deployment procedure documented and tested
- [ ] Rollback procedure verified and tested
- [ ] Data migration strategy (if applicable)
- [ ] Feature flag/gradual rollout possible
- [ ] Deployment runbook created
- [ ] Rollback testing completed

**Monitoring & Alerting:**
- [ ] Key metrics identified and monitored
- [ ] Alerting thresholds defined
- [ ] Dashboard created for visibility
- [ ] Alert escalation procedures documented
- [ ] Log levels appropriate
- [ ] Debugging tools available

**Training & Documentation:**
- [ ] Operations team trained
- [ ] Support team aware of changes
- [ ] Troubleshooting documentation complete
- [ ] Known limitations documented
- [ ] FAQ created for common issues
- [ ] Team training completed and validated

---

## Approval Workflow SLAs

### SLA Framework

| Approval Level | Initial Review | Expert Input | Decision | Total SLA |
|---|---|---|---|---|
| Auto-Approval | Automated (instant) | N/A | Instant | Instant |
| Escalation Review | 4 hours | 24-32 hours | 12-16 hours | 48 hours |
| Human Approval | 8 hours | 72 hours | 24 hours | 7 days |
| Emergency Escalation | 2 hours | 1 hour | 1 hour | 4 hours |

### SLA Details

**Auto-Approval (Instant)**
- Automated scoring and decision
- No human intervention required
- Deployment immediate upon approval
- Monitoring in place for issues

**Escalation Review (48 hours)**
- Day 1 Morning: Triage and assign reviewer
- Day 1 Afternoon: Expert begins review
- Day 2 Morning: Review findings compiled
- Day 2 Afternoon: Decision and feedback provided

**Human Approval (7 days)**
- Day 1: Initial security review by expert
- Day 2-3: Comprehensive technical review
- Day 4-5: Compliance/regulatory review (if applicable)
- Day 5-6: Team feedback collection
- Day 6-7: Leadership approval and sign-off

**Emergency SLA (4 hours)**
- Production incident exceptions only
- Requires director-level approval to invoke
- On-call expert review
- Expedited team consultation
- Same thoroughness as normal review

---

## Best Practices

### 1. Start Conservative, Prove Track Record

**Pattern:**
1. Submit new skill for human approval (even if score suggests lower)
2. Deploy with detailed monitoring and logging
3. Monitor for 30 days of production usage
4. Collect performance metrics
5. After proven reliability: request approval level reduction

**Rationale:**
- Builds confidence in automated systems
- Catches unforeseen edge cases
- Demonstrates operational maturity
- Teams gain competency

**Example Timeline:**
```
Week 1: Human Approval (conservative)
  ↓
Week 2-4: Production deployment with monitoring
  ↓
Week 4: Escalation Review (proven stable)
  ↓
Week 5-8: Additional production usage
  ↓
Week 8: Auto-Approval eligible (after 30 days stable)
```

### 2. Quarterly Effectiveness Audit

**What to Audit:**
- Auto-approved skills: Are they still effective?
- Performance metrics: Execution times stable?
- Error rates: Increasing or stable?
- Usage patterns: Still matching intended use?
- Team feedback: Any operational friction?

**Trigger Escalation If:**
- Usage drops significantly (>50% decline)
- Error rate increases (>10% absolute)
- Performance degrades (>20% regression)
- Low confidence scores from recent users
- Team feedback indicates issues

**Process:**
```bash
# Run quarterly audit
./.claude/skills/approval-audit/run-audit.sh \
  --start-date "Q1_2025" \
  --approval-level "auto" \
  --generate-report
```

### 3. Document Approval Reasoning

**Required Documentation:**
- Decision date and reviewer
- Risk score breakdown
- Key factors influencing decision
- Assumptions and constraints
- Escalation triggers identified
- Any waivers or exceptions

**Approval History Table Schema:**
```sql
CREATE TABLE approval_history (
    id TEXT PRIMARY KEY,
    skill_id TEXT NOT NULL,
    approval_level TEXT NOT NULL,
    decision_date TEXT NOT NULL,
    reviewer_id TEXT NOT NULL,
    risk_score REAL,
    security_weight REAL,
    complexity_weight REAL,
    coverage_weight REAL,
    dependencies_weight REAL,
    criticality_weight REAL,
    decision_reasoning TEXT,
    escalation_triggers TEXT,
    approved_by TEXT,
    confidence REAL,
    metadata JSON
);
```

### 4. Use Approval Metrics to Improve Process

**Key Metrics to Track:**
- Approval level distribution (target: 70% auto, 25% escalate, 5% human)
- Average review time (target: under SLA)
- Escalation rate from each level (target: <10%)
- Approval reversal rate (target: <2%)
- User satisfaction with process (target: >4.0/5.0)

**Process Improvement Triggers:**
- Escalation rate consistently > 15% → Simplify criteria
- Average review time > 1.5× SLA → Increase reviewer capacity
- Approval reversals > 5% → Review criteria accuracy
- User satisfaction < 3.5/5.0 → Gather feedback for improvement

### 5. Maintain Approval Audit Trail for Compliance

**Audit Trail Requirements:**
- Store all approval decisions in database (not git)
- Include timestamp, reviewer, and decision rationale
- Log all escalations with reasons
- Track waivers and exceptions separately
- Retain for 7 years (regulatory requirement)

**Compliance Export:**
```bash
# Generate compliance report for auditors
./.claude/skills/approval-audit/export-compliance-report.sh \
  --format "ISO_8601" \
  --period "2025-Q1" \
  --include-escalations \
  --verify-signatures
```

### 6. Expert Review Allocation

**Recommended Team Structure:**
- 1 Security Expert (owns escalation reviews)
- 1 Architecture Expert (owns complexity evaluation)
- 1 Infrastructure Expert (owns deployment/operations)
- 1 Director/Lead (owns human approval final decision)

**Load Balancing:**
- Security Expert: 10-15 escalation reviews/week
- Architecture Expert: 5-8 escalation reviews/week
- Infrastructure Expert: 5-8 escalation reviews/week
- Director: 1-2 human approval decisions/week

**On-Call Rotation:**
- 24-hour on-call for emergency approvals
- 1-week rotations (all experts participate)
- Compensated time-off for after-hours work

### 7. Continuous Learning

**Knowledge Sharing:**
- Monthly review of interesting escalations
- Quarterly approval process retrospectives
- Shared examples of well-approved skills
- Training for new reviewers (mentorship model)

**Documentation of Patterns:**
```
docs/
  approval-decisions/
    PATTERN_[name]_[date].md
      ├─ Context and decision
      ├─ Risk calculation
      ├─ Follow-up results
      └─ Lessons learned
```

---

## Anti-Patterns to Avoid

### 1. Rubber-Stamping Approvals
**Problem:** Approver doesn't actually review skill
**Prevention:** Require detailed approval rationale and risk breakdown
**Detection:** Anomalously fast approvals or generic reasoning

### 2. Moving Goalposts
**Problem:** Approval criteria change after submission
**Prevention:** Document criteria clearly before submission
**Detection:** Skill approved, then requirements change

### 3. Insufficient Testing
**Problem:** Test coverage adequate on paper, but missing critical scenarios
**Prevention:** Require edge case testing and production monitoring
**Detection:** Escalation triggered within 7 days of approval

### 4. Ignoring Expert Feedback
**Problem:** Approval proceeds despite expert concerns
**Prevention:** Make expert sign-off mandatory for escalation review
**Detection:** Feedback documented but not addressed in approval

### 5. Approval Level Gaming
**Problem:** Artificially lowering risk score to avoid review
**Prevention:** Independent risk calculation validation
**Detection:** Team challenge during review; metrics validation

---

## Summary

The three-tier approval system balances innovation velocity with security and reliability. By starting with human approval for novel patterns, escalating based on operational data, and promoting proven patterns to auto-approval, teams gain confidence in automated systems while maintaining strict control over high-risk changes.

**Key Success Factors:**
1. Transparent risk scoring methodology
2. Conservative default approval levels
3. Data-driven escalation decisions
4. Regular audit and continuous improvement
5. Explicit documentation of decisions
6. Expert reviewer capacity planning
7. Compliance and audit trail maintenance

For questions or approval exceptions, contact the Security and Architecture team.
