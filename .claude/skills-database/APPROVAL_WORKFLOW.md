# Skills Database Approval Workflow
## Three-Tier Approval Process Implementation & Execution

**Version:** 2.0.0
**Date:** 2025-11-16
**Status:** Production Ready
**Audience:** System administrators, DevOps engineers, approval workflow coordinators

---

## Table of Contents

1. [Workflow Overview](#workflow-overview)
2. [Auto-Approval Workflow](#auto-approval-workflow)
3. [Escalated Review Workflow](#escalated-review-workflow)
4. [Human Approval Workflow](#human-approval-workflow)
5. [Phase 4 Integration](#phase-4-integration)
6. [Approval History & Audit Trail](#approval-history--audit-trail)
7. [Expert Notification Templates](#expert-notification-templates)
8. [Workflow Execution Guide](#workflow-execution-guide)

---

## Workflow Overview

### Complete Approval Flow Diagram

```text
┌─────────────────────────────────────────────────────────────────────┐
│                     NEW SKILL SUBMISSION                            │
│                  (via PR or direct database)                        │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────────┐
        │    INITIAL VALIDATION & ANALYSIS     │
        │  - Calculate risk score              │
        │  - Measure test coverage             │
        │  - Check dependencies                │
        │  - Validate skill metadata           │
        └──────────────┬───────────────────────┘
                       │
         ┌─────────────┴──────────────┬──────────────────┐
         │                            │                  │
         ▼                            ▼                  ▼
    ┌──────────┐              ┌────────────┐      ┌────────────┐
    │   AUTO   │              │ ESCALATED  │      │   HUMAN    │
    │APPROVAL  │              │   REVIEW   │      │ APPROVAL   │
    │≤30 Risk  │              │ 31-60 Risk │      │  >60 Risk  │
    │≥95% Cov  │              │ 80-94% Cov │      │ <80% Cov   │
    └────┬─────┘              └─────┬──────┘      └─────┬──────┘
         │                          │                   │
         ▼                          ▼                   ▼
    [Auto-Check]            [Expert Review]       [Expert Review]
    (5 seconds)             (24-48 hours)         (3-7 days)
         │                          │                   │
         ▼                          ▼                   ▼
    ┌──────────┐              ┌────────────┐      ┌────────────┐
    │ APPROVED │◄─────────────│ APPROVED   │◄─────│ APPROVED   │
    │          │              │ ESCALATE   │      │ REJECTED   │
    │ (system) │              │ HUMAN      │      │ NEEDS_FIX  │
    └────┬─────┘              └─────┬──────┘      └─────┬──────┘
         │                          │                   │
         │                          ▼                   │
         │                    [Human Review]            │
         │                   (3-7 days)                 │
         │                          │                   │
         │      ┌────────────────────┼───────────────┐  │
         │      │                    │               │  │
         │      ▼                    ▼               ▼  │
         │  ┌──────────┐         ┌──────────┐   ┌─────┴────┐
         │  │ APPROVED │         │ REJECTED │   │NEEDS_FIX │
         │  │(expert)  │         │(revert)  │   │(revise)  │
         │  └─────┬────┘         └──────────┘   └────┬─────┘
         │        │                                   │
         └────────┼───────────────────────────────────┘
                  │
                  ▼
      ┌─────────────────────────────┐
      │  APPROVAL DECISION MADE      │
      │  - Logged in approval_history│
      │  - Audit trail recorded      │
      │  - Expert signature          │
      └────────────┬────────────────┘
                   │
                   ▼
      ┌─────────────────────────────┐
      │ DEPLOYMENT AUTHORIZATION    │
      │  - Skills table updated      │
      │  - version marked approved   │
      │  - Ready for agent loading   │
      └─────────────────────────────┘
```

### Parallel vs Sequential Processing

**Auto-Approved Skills (Parallel):**
- Multiple auto-approvals processed simultaneously
- No blocking dependencies
- System-driven (no human intervention)

**Escalated Review Skills (Sequential with SLA):**
- Assigned to available experts
- 24-48 hour review window
- Expert can escalate to human if needed

**Human Approval (Sequential with SLA):**
- Assigned to senior experts
- 3-7 day review window
- Requires documented reasoning

---

## Auto-Approval Workflow

### Step 1: Skill Submission & Initial Validation

**Input:** New skill record inserted into database or submitted via pull request

```sql
-- Check if skill meets auto-approval criteria
SELECT
  id,
  name,
  category,
  approval_level,
  test_coverage,
  json_extract(approval_criteria, '$.risk_score') as risk_score
FROM skills
WHERE status = 'active'
  AND approval_level = 'auto'
  AND test_coverage >= 0.95
LIMIT 10;
```

**Validation Checks:**

| Check | Requirement | Validation Query |
|-------|-------------|------------------|
| Risk Score | ≤ 0.30 | `SELECT risk_score WHERE risk_score <= 0.30` |
| Test Coverage | ≥ 95% | `SELECT test_coverage WHERE test_coverage >= 0.95` |
| Complexity | ≤ 5 | `SELECT complexity WHERE complexity <= 5` |
| External Deps | 0 | `SELECT dep_count WHERE dep_count = 0` |
| File Access | Skill dir only | Regex check: skill path in content_path |

**Failure Path:** If any check fails, route to ESCALATED REVIEW

### Step 2: Automated Risk Assessment

```bash
#!/bin/bash
# Calculate risk score automatically

skill_id=$1
test_coverage=$(sqlite3 skills.db "SELECT test_coverage FROM skills WHERE id=$skill_id")
complexity=$(sqlite3 skills.db "SELECT json_extract(approval_criteria, '$.complexity_score') FROM skills WHERE id=$skill_id")

# Risk formula: (complexity/20 * 0.25) + ((1.0 - test_coverage) * 0.20)
complexity_risk=$(echo "scale=3; $complexity / 20 * 0.25" | bc)
coverage_risk=$(echo "scale=3; (1.0 - $test_coverage) * 0.20" | bc)
total_risk=$(echo "scale=3; $complexity_risk + $coverage_risk" | bc)

echo $total_risk
```

**Risk Score Results:**
- < 0.30: Continue to approval
- 0.30-0.60: Route to escalation
- > 0.60: Route to human review

### Step 3: Test Execution Verification

```bash
#!/bin/bash
# Run test suite and capture results

test_suite_path=$(sqlite3 skills.db "SELECT test_suite_path FROM skills WHERE id=$skill_id")
cd $(dirname "$test_suite_path")

# Execute tests
bash test.sh > test_output.json 2>&1
test_exit_code=$?

# Extract metrics
pass_count=$(grep '"pass_count"' test_output.json | head -1 | awk -F: '{print $2}' | tr -d ', ')
fail_count=$(grep '"fail_count"' test_output.json | head -1 | awk -F: '{print $2}' | tr -d ', ')
coverage=$(grep '"coverage"' test_output.json | head -1 | awk -F: '{print $2}' | tr -d ', ')

# Validate: pass_rate must be 100%, coverage ≥ 95%
if [ $fail_count -eq 0 ] && [ $(echo "$coverage >= 0.95" | bc) -eq 1 ]; then
  echo "PASS"
else
  echo "FAIL"
fi
```

**Test Verification Rules:**
- All tests must pass (0 failures)
- Coverage must be ≥ 95%
- Timeout: 5 minutes per test suite
- Failure escalates to ESCALATED REVIEW

### Step 4: Automatic Approval Decision

```bash
#!/bin/bash
# Execute auto-approval if all checks pass

skill_id=$1
approval_timestamp=$(date -u +'%Y-%m-%dT%H:%M:%SZ')

# Update skills table
sqlite3 skills.db << EOF
UPDATE skills
SET
  approval_level = 'auto',
  last_approved_by = 'system',
  last_approval_date = '$approval_timestamp'
WHERE id = $skill_id;

-- Insert approval history
INSERT INTO approval_history (
  skill_id,
  version,
  approval_level,
  approver,
  decision,
  reasoning,
  timestamp
) VALUES (
  $skill_id,
  (SELECT version FROM skills WHERE id = $skill_id),
  'auto',
  'system',
  'approved',
  'Automatic approval: Risk ≤ 0.30, Coverage ≥ 95%, All tests passed',
  '$approval_timestamp'
);
EOF

echo "SKILL $skill_id: APPROVED (auto)"
```

**Database State After Auto-Approval:**

```sql
-- Skills table updated
UPDATE skills
SET
  approval_level = 'auto',
  last_approved_by = 'system',
  last_approval_date = '2025-11-16T14:30:00Z'
WHERE id = 42;

-- Approval history appended
INSERT INTO approval_history (
  skill_id,
  version,
  approval_level,
  approver,
  decision,
  reasoning,
  test_results,
  timestamp
) VALUES (
  42,
  '1.0.0',
  'auto',
  'system',
  'approved',
  'Automatic approval: Risk=0.25, Coverage=98%, Tests=45/45 passed',
  '{"pass_count": 45, "fail_count": 0, "pass_rate": 1.0, "coverage": 0.98}',
  '2025-11-16T14:30:00Z'
);
```

### Step 5: Deployment Authorization

```bash
#!/bin/bash
# Auto-approved skill ready for agent loading

skill_id=$1
skill_name=$(sqlite3 skills.db "SELECT name FROM skills WHERE id=$skill_id")

# Verify approval status
approval_status=$(sqlite3 skills.db "SELECT decision FROM approval_history WHERE skill_id=$skill_id ORDER BY timestamp DESC LIMIT 1")

if [ "$approval_status" == "approved" ]; then
  echo "✓ SKILL '$skill_name' ready for deployment"
  # Skill can now be loaded by agents without additional review
else
  echo "✗ SKILL '$skill_name' not approved for deployment"
fi
```

### Auto-Approval Performance Metrics

**Timing:**
- Validation checks: 100-200ms
- Risk calculation: 50-100ms
- Test execution: 5-30 seconds (varies by test suite)
- Approval decision: 50-100ms
- **Total: 5-35 seconds per skill**

**Cost Savings:**
- Human review: ~15 minutes per skill × $0.50/min = $7.50/skill
- Auto-approval overhead: $0.02/skill
- **Savings per auto-approved skill: ~$7.48**
- At 80% auto-approval rate with 500 skills: ~$3,000/month savings

---

## Escalated Review Workflow

### Step 1: Escalation Trigger Detection

**Triggers that route to escalation:**

```bash
#!/bin/bash
# Check if skill meets escalation criteria

skill_id=$1

sqlite3 skills.db << EOF | grep -q "escalate" && {
  SELECT 'escalate' FROM skills
  WHERE id = $skill_id
    AND (
      json_extract(approval_criteria, '$.risk_score') > 0.30
      OR test_coverage < 0.95
      OR json_extract(approval_criteria, '$.external_dependencies') = true
    )
  LIMIT 1;
}
EOF

if [ $? -eq 0 ]; then
  echo "ROUTE: ESCALATED_REVIEW"
else
  echo "ROUTE: AUTO_APPROVAL"
fi
```

**Escalation Criteria:**

| Trigger | Description | Example |
|---------|-------------|---------|
| Risk Score 0.31-0.60 | Medium risk | Redis coordination, database pool |
| Test Coverage 80-94% | Good but not excellent | Infrastructure changes |
| External Dependencies | 1-3 API/service calls | PostgreSQL, Redis, APIs |
| Security-Sensitive | Credential handling, auth | Secure agent spawning |
| Infrastructure Changes | Docker, Kubernetes, config | Container orchestration |
| Cross-Team Impact | Affects 2+ teams | Coordination system changes |

### Step 2: Expert Assignment

```bash
#!/bin/bash
# Assign skill to appropriate expert based on category

skill_id=$1
category=$(sqlite3 skills.db "SELECT category FROM skills WHERE id=$skill_id")

case "$category" in
  "coordination")
    expert="orchestration-specialist@example.com"
    expertise="CFN Loop, agent coordination"
    ;;
  "infrastructure")
    expert="infrastructure-specialist@example.com"
    expertise="Docker, Kubernetes, PostgreSQL"
    ;;
  "security")
    expert="security-architect@example.com"
    expertise="Cryptography, access control"
    ;;
  "testing")
    expert="testing-lead@example.com"
    expertise="Test frameworks, CI/CD"
    ;;
  *)
    expert="default-expert@example.com"
    expertise="General review"
    ;;
esac

echo "ASSIGNED_TO: $expert ($expertise)"
```

**Expert Availability Matrix:**

```text
Category         Primary Expert              Backup Expert
─────────────────────────────────────────────────────────────
coordination     orchestration@example.com   architecture@example.com
infrastructure   devops@example.com          platform@example.com
security         security-arch@example.com   compliance@example.com
testing          qa-lead@example.com         devops@example.com
foundation       platform@example.com        architecture@example.com
```

### Step 3: Escalation Notification

**Notification Template (email):**

```text
Subject: [Skills DB] Escalation Review Required - {SKILL_NAME}

To: {EXPERT_EMAIL}
CC: skills-database-admins@example.com

---

Expert Review Request
Skill: {SKILL_NAME}
Version: {VERSION}
Category: {CATEGORY}
Requested At: {TIMESTAMP}
Review SLA: 24-48 hours

Skill Summary:
- Risk Score: {RISK_SCORE}/1.0
- Test Coverage: {COVERAGE}%
- Complexity: {COMPLEXITY_LEVEL}
- External Dependencies: {DEP_COUNT}

Why This Escalation:
{ESCALATION_REASON}

Trigger Criteria Met:
{CRITERIA_LIST}

Next Steps:
1. Access database: sqlite3 skills.db
2. Review skill: SELECT * FROM skills WHERE id={SKILL_ID}
3. Check tests: {TEST_SUITE_PATH}
4. Approve or escalate: Use approval_update.sh script
5. Document reasoning in approval_history

Review Deadline: {DEADLINE_DATE}

Best regards,
Skills Database Workflow
```

### Step 4: Expert Review & Decision

**Expert Review Checklist:**

```markdown
## Review Checklist for Escalated Skills

### Code Review
- [ ] Logic is clear and maintainable
- [ ] Error handling is comprehensive
- [ ] Security implications are minimal
- [ ] No hardcoded secrets or API keys
- [ ] Dependencies are stable and well-documented

### Test Coverage Review
- [ ] Test suite covers main functionality
- [ ] Edge cases are tested
- [ ] Error cases are tested
- [ ] Integration points are verified
- [ ] Coverage is ≥ 80%

### External Dependency Review
- [ ] Dependencies are stable
- [ ] Version pinning is used
- [ ] Fallback strategies exist
- [ ] Performance implications understood
- [ ] Scaling characteristics known

### Impact Analysis
- [ ] No breaking changes to existing APIs
- [ ] Documentation is clear
- [ ] Migration path exists (if applicable)
- [ ] Monitoring/observability is built-in
- [ ] Rollback procedure documented

### Decision
- [ ] APPROVE
- [ ] ESCALATE_TO_HUMAN
- [ ] REQUEST_CHANGES (feedback loop)
```

**Approval Decision Recording:**

```bash
#!/bin/bash
# Expert records decision

skill_id=$1
expert_email="$2"
decision="$3"  # approved | escalated | rejected
reasoning="$4"

sqlite3 skills.db << EOF
INSERT INTO approval_history (
  skill_id,
  version,
  approval_level,
  approver,
  decision,
  reasoning,
  risk_assessment,
  timestamp,
  review_duration_minutes
) VALUES (
  $skill_id,
  (SELECT version FROM skills WHERE id = $skill_id),
  'escalate',
  '$expert_email',
  '$decision',
  '$reasoning',
  json_object(
    'security', 'low',
    'complexity', 'medium',
    'maintainability', 'high'
  ),
  datetime('now'),
  (SELECT (julianday('now') - julianday(created_at)) * 1440
   FROM (SELECT MAX(timestamp) as created_at FROM approval_history WHERE skill_id=$skill_id))
);
EOF
```

### Step 5: Feedback Loop (If Changes Needed)

**When Expert Requests Changes:**

```bash
#!/bin/bash
# Create feedback task for skill owner

skill_id=$1
feedback="$2"

# Record feedback in approval_history
sqlite3 skills.db << EOF
INSERT INTO approval_history (
  skill_id,
  version,
  approval_level,
  approver,
  decision,
  reasoning,
  timestamp
) VALUES (
  $skill_id,
  (SELECT version FROM skills WHERE id = $skill_id),
  'escalate',
  'expert@example.com',
  'needs_correction',
  'Expert feedback: $feedback',
  datetime('now')
);
EOF

# Notify skill owner
cat << FEEDBACK | mail -s "Skills DB: Feedback Required - Skill $skill_id" owner@example.com
Expert Review Feedback:

$feedback

Please address feedback and resubmit for review.
Response SLA: 5 business days
FEEDBACK
```

### Expert Review Performance SLA

**Target Response Time:** 24-48 hours

```sql
-- Query to monitor expert response time
SELECT
  s.name,
  s.category,
  MIN(ah.timestamp) as review_started,
  MAX(ah.timestamp) as review_completed,
  (julianday(MAX(ah.timestamp)) - julianday(MIN(ah.timestamp))) * 24 as hours_to_review
FROM skills s
JOIN approval_history ah ON s.id = ah.skill_id
WHERE ah.approval_level = 'escalate'
  AND ah.decision IN ('approved', 'escalated')
GROUP BY s.id
ORDER BY hours_to_review DESC;
```

---

## Human Approval Workflow

### Step 1: Human Review Escalation Trigger

**Conditions requiring human approval:**

```sql
-- Query to identify skills needing human approval
SELECT
  s.id,
  s.name,
  s.category,
  json_extract(s.approval_criteria, '$.risk_score') as risk_score,
  s.test_coverage,
  json_extract(s.approval_criteria, '$.complexity_score') as complexity,
  CASE
    WHEN json_extract(s.approval_criteria, '$.risk_score') > 0.60 THEN 'High Risk'
    WHEN s.test_coverage < 0.80 THEN 'Low Coverage'
    WHEN json_extract(s.approval_criteria, '$.complexity_score') > 15 THEN 'High Complexity'
    ELSE 'Escalated from Expert Review'
  END as escalation_reason
FROM skills s
WHERE s.status = 'active'
  AND (
    json_extract(s.approval_criteria, '$.risk_score') > 0.60
    OR s.test_coverage < 0.80
    OR json_extract(s.approval_criteria, '$.complexity_score') > 15
  );
```

### Step 2: Senior Expert Assignment

**Human Review Assignment (High Priority):**

```bash
#!/bin/bash
# Assign to senior experts based on criticality

skill_id=$1
risk_score=$(sqlite3 skills.db "SELECT json_extract(approval_criteria, '$.risk_score') FROM skills WHERE id=$skill_id")
category=$(sqlite3 skills.db "SELECT category FROM skills WHERE id=$skill_id")

# High-risk skills assigned to CTO
if [ $(echo "$risk_score > 0.70" | bc) -eq 1 ]; then
  primary_reviewer="cto@example.com"
  secondary_reviewer="architecture-lead@example.com"
  board_review="YES"
elif [ $(echo "$risk_score > 0.60" | bc) -eq 1 ]; then
  primary_reviewer="principal-architect@example.com"
  secondary_reviewer="team-lead@example.com"
  board_review="NO"
else
  primary_reviewer="tech-lead@example.com"
  secondary_reviewer="expert@example.com"
  board_review="NO"
fi

echo "Primary: $primary_reviewer"
echo "Secondary: $secondary_reviewer"
echo "Board Review: $board_review"
```

**Senior Reviewer List:**

| Role | Email | Expertise | Max Reviews/Week |
|------|-------|-----------|------------------|
| CTO | cto@example.com | Overall system architecture | 3 |
| Principal Architect | principal-arch@example.com | Advanced system design | 5 |
| Security Architect | security-arch@example.com | Security & compliance | 5 |
| DevOps Lead | devops-lead@example.com | Infrastructure & deployment | 4 |
| Platform Lead | platform-lead@example.com | Foundation & core systems | 4 |

### Step 3: Comprehensive Review & Risk Assessment

**Review Process (7-14 day SLA):**

```bash
#!/bin/bash
# Senior expert conducts comprehensive review

skill_id=$1
reviewer="$2"

echo "=== HUMAN REVIEW PROCESS ==="
echo "Skill ID: $skill_id"
echo "Reviewer: $reviewer"
echo "SLA: 7 days"
echo ""
echo "Step 1: Deep Code Review"
echo "- Architectural alignment"
echo "- Design patterns validation"
echo "- Security implications analysis"
echo ""
echo "Step 2: Test Adequacy Assessment"
echo "- Critical path coverage"
echo "- Edge case identification"
echo "- Test maintainability"
echo ""
echo "Step 3: Business Impact Analysis"
echo "- Revenue implications"
echo "- Team impact"
echo "- Rollout risk"
echo ""
echo "Step 4: Integration Risk Assessment"
echo "- System interactions"
echo "- Deployment complexity"
echo "- Failure mode analysis"
echo ""
echo "Step 5: Strategic Decision"
echo "- Align with roadmap"
echo "- Resource requirements"
echo "- Timeline feasibility"
```

**Comprehensive Review Checklist:**

```markdown
## Human Approval Review Checklist

### Architectural Alignment
- [ ] Consistent with CFN Loop design principles
- [ ] Integrates cleanly with existing systems
- [ ] Doesn't create technical debt
- [ ] Future-proofs the system

### Code Quality & Maintainability
- [ ] Code review: architecture, patterns, conventions
- [ ] Documentation: clear, accurate, complete
- [ ] Testability: easy to modify and extend
- [ ] Performance: meets requirements

### Security & Compliance
- [ ] Security review completed
- [ ] No hardcoded secrets/credentials
- [ ] Audit trail properly maintained
- [ ] Compliance requirements met

### Testing & Quality Assurance
- [ ] Test strategy documented
- [ ] Critical paths have tests
- [ ] Edge cases identified
- [ ] Test coverage analysis

### Business Impact
- [ ] Revenue implications analyzed
- [ ] User impact assessment
- [ ] Rollout strategy defined
- [ ] Success metrics identified

### Operational Readiness
- [ ] Monitoring/alerting configured
- [ ] Rollback procedure documented
- [ ] Training plan completed
- [ ] Support documentation ready

### Strategic Alignment
- [ ] Aligns with product roadmap
- [ ] Resources allocated
- [ ] Timeline feasible
- [ ] Dependencies resolved

### Final Decision
- [ ] APPROVED (with conditions if applicable)
- [ ] NEEDS_CHANGES (specific feedback required)
- [ ] ESCALATE_TO_BOARD (strategic significance)
- [ ] REJECTED (with alternative recommendations)
```

### Step 4: Board Review (if applicable)

**Board Review Process for Strategic Changes:**

```bash
#!/bin/bash
# Escalate high-impact skills to board review

skill_id=$1

# Check if board review is required
board_review=$(sqlite3 skills.db "
  SELECT json_extract(approval_criteria, '$.requires_board_review')
  FROM skills WHERE id=$skill_id
")

if [ "$board_review" == "true" ]; then
  # Schedule board review
  echo "Board Review Required"
  echo "Skill: $(sqlite3 skills.db "SELECT name FROM skills WHERE id=$skill_id")"
  echo "Meeting: Next Architecture Review Board"
  echo "Attendees: CTO, Principal Architect, Tech Leads"
  echo "Duration: 60 minutes"

  # Record board review request
  sqlite3 skills.db << EOF
  UPDATE skills SET
    approval_criteria = json_set(
      approval_criteria,
      '$.board_review_status',
      'scheduled'
    )
  WHERE id=$skill_id;
EOF
fi
```

### Step 5: Final Approval Decision

**Recording Human Approval Decision:**

```bash
#!/bin/bash
# Record final approval decision

skill_id=$1
reviewer="$2"
decision="$3"  # approved | needs_changes | rejected
reasoning="$4"

sqlite3 skills.db << EOF
-- Update skills table
UPDATE skills
SET
  approval_level = 'human',
  last_approved_by = '$reviewer',
  last_approval_date = datetime('now')
WHERE id=$skill_id;

-- Record in approval_history
INSERT INTO approval_history (
  skill_id,
  version,
  approval_level,
  approver,
  decision,
  reasoning,
  risk_assessment,
  approval_criteria_check,
  timestamp,
  review_duration_minutes
) VALUES (
  $skill_id,
  (SELECT version FROM skills WHERE id=$skill_id),
  'human',
  '$reviewer',
  '$decision',
  '$reasoning',
  json_object(
    'security', 'medium',
    'complexity', 'high',
    'maintainability', 'good',
    'business_impact', 'moderate'
  ),
  json_object(
    'risk_score_check', 'passed',
    'coverage_check', 'needs_improvement',
    'complexity_check', 'passed',
    'integration_check', 'passed'
  ),
  datetime('now'),
  (SELECT (julianday('now') - julianday(MIN(timestamp))) * 1440
   FROM approval_history WHERE skill_id=$skill_id)
);
EOF

echo "Decision recorded: $decision"
echo "Reviewer: $reviewer"
echo "Timestamp: $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
```

### Human Approval Performance SLA

**Target Response Time:** 3-7 days (strategic reviews may take longer)

```sql
-- Monitor human review response times
SELECT
  s.name,
  s.category,
  json_extract(s.approval_criteria, '$.risk_score') as risk,
  COUNT(ah.id) as review_attempts,
  (julianday(MAX(ah.timestamp)) - julianday(MIN(ah.timestamp))) as days_in_review
FROM skills s
JOIN approval_history ah ON s.id = ah.skill_id
WHERE ah.approval_level = 'human'
GROUP BY s.id
ORDER BY days_in_review DESC;
```

---

## Phase 4 Integration

### Automatic Skill Generation from Patterns

**Phase 4 Workflow Codification → Dynamic Skills Database:**

```bash
#!/bin/bash
# Phase 4 generates new skills → Auto-inserted with approval routing

phase4_pattern_id=$1
pattern_name=$(sqlite3 skills.db "SELECT name FROM phase4_patterns WHERE id=$phase4_pattern_id")

# Generate skill from Phase 4 pattern
generated_skill_name="generated-${pattern_name}-$(date +%s)"
generated_skill_path=".claude/skills/generated/${generated_skill_name}/SKILL.md"

# Create skill content
echo "Skill generated from Phase 4 pattern: $pattern_name" > "$generated_skill_path"

# Insert into skills table with approval metadata
sqlite3 skills.db << EOF
INSERT INTO skills (
  name,
  category,
  content_path,
  content_hash,
  version,
  approval_level,
  test_coverage,
  phase4_pattern_id,
  generated_by,
  is_auto_generated
) VALUES (
  '$generated_skill_name',
  'generated',
  '$generated_skill_path',
  '$(sha256sum "$generated_skill_path" | awk '{print $1}')',
  '1.0.0-generated',
  'escalate',
  0.0,
  $phase4_pattern_id,
  'phase4',
  1
);
EOF

echo "Skill generated: $generated_skill_name"
```

### Edge Case Tracking & Feedback Loop

**Capturing Edge Cases During Execution:**

```bash
#!/bin/bash
# Phase 4-generated skill encounters edge case

skill_id=$1
edge_case_description="$2"
failure_reason="$3"

# Record edge case
sqlite3 skills.db << EOF
INSERT INTO edge_case_tracking (
  skill_id,
  edge_case_description,
  failure_reason,
  severity,
  detected_at,
  resolved
) VALUES (
  $skill_id,
  '$edge_case_description',
  '$failure_reason',
  'medium',
  datetime('now'),
  0
);

-- Check if edge case requires approval update
UPDATE skills
SET approval_level = 'escalate'
WHERE id=$skill_id
  AND is_auto_generated = 1
  AND (SELECT COUNT(*) FROM edge_case_tracking WHERE skill_id=$skill_id AND resolved=0) > 0;
EOF
```

### Continuous Skill Evolution

**Skill Version Updates with Edge Case Fixes:**

```sql
-- Query: Track skill evolution through edge case fixes
SELECT
  s.name,
  s.version,
  COUNT(DISTINCT ect.id) as unresolved_edge_cases,
  MAX(ect.detected_at) as last_edge_case,
  s.test_coverage,
  ah.decision as last_approval
FROM skills s
LEFT JOIN edge_case_tracking ect ON s.id = ect.skill_id AND ect.resolved = 0
LEFT JOIN approval_history ah ON s.id = ah.skill_id
WHERE s.is_auto_generated = 1
GROUP BY s.id
HAVING unresolved_edge_cases > 0
ORDER BY last_edge_case DESC;
```

**Skill Update Workflow:**

1. Edge case detected in Phase 4-generated skill
2. Edge case recorded in `edge_case_tracking` table
3. Skill owner reviews and develops fix
4. Version incremented (e.g., 1.0.0 → 1.0.1)
5. Resubmit for approval (follows standard workflow)
6. Once approved, edge case marked as resolved
7. Skill continues to evolve based on real usage

---

## Approval History & Audit Trail

### Audit Trail Structure

**All approval decisions are immutable and append-only:**

```sql
-- Approval history is insert-only (never UPDATE/DELETE)
SELECT
  id,
  skill_id,
  version,
  approval_level,
  approver,
  decision,
  reasoning,
  risk_assessment,
  test_results,
  timestamp
FROM approval_history
WHERE skill_id = 42
ORDER BY timestamp ASC;
```

### Querying Approval History

**Find Latest Approval Decision:**

```sql
-- Get most recent approval decision for a skill
SELECT
  ah.id,
  ah.approver,
  ah.decision,
  ah.reasoning,
  ah.timestamp,
  (julianday('now') - julianday(ah.timestamp)) as days_since_approval
FROM approval_history ah
WHERE ah.skill_id = 42
ORDER BY ah.timestamp DESC
LIMIT 1;
```

**Approval Timeline for a Skill:**

```sql
-- Track complete approval history
SELECT
  ah.timestamp,
  ah.approval_level,
  ah.approver,
  ah.decision,
  ah.reasoning,
  (julianday(LAG(ah.timestamp) OVER (ORDER BY ah.timestamp)) -
   julianday(ah.timestamp)) * 24 as hours_from_previous_decision
FROM approval_history ah
WHERE ah.skill_id = 42
ORDER BY ah.timestamp ASC;
```

### Compliance & Retention

**Approval History Retention Policy:**

```sql
-- Retain approval history for minimum 3 years (SOC2 requirement)
-- Archive records older than 7 years (cost optimization)

-- Active records: 0-7 years
SELECT COUNT(*) as active_records
FROM approval_history
WHERE julianday('now') - julianday(timestamp) < (365 * 7);

-- Archive records: 7+ years
SELECT COUNT(*) as archived_records
FROM approval_history
WHERE julianday('now') - julianday(timestamp) >= (365 * 7);
```

**Export Approval Audit Trail:**

```bash
#!/bin/bash
# Export approval history for compliance audit

start_date="$1"  # YYYY-MM-DD
end_date="$2"    # YYYY-MM-DD

sqlite3 skills.db << EOF | csv2json > approval_audit_export.json
SELECT
  ah.id,
  s.name as skill_name,
  ah.version,
  ah.approval_level,
  ah.approver,
  ah.decision,
  ah.reasoning,
  ah.timestamp
FROM approval_history ah
JOIN skills s ON ah.skill_id = s.id
WHERE DATE(ah.timestamp) BETWEEN '$start_date' AND '$end_date'
ORDER BY ah.timestamp DESC;
EOF

echo "Exported: approval_audit_export.json"
```

---

## Expert Notification Templates

### Template 1: Escalation Request (Email)

```text
Subject: [Skills DB] Escalation Review Required - {SKILL_NAME} v{VERSION}

To: {EXPERT_EMAIL}
CC: skills-admins@example.com
Priority: High

---

Escalation Review Request

Skill: {SKILL_NAME}
Category: {CATEGORY}
Version: {VERSION}
Submitted: {SUBMISSION_DATE}
Review SLA: 24-48 hours
Deadline: {DEADLINE_DATE}

Escalation Reason:
{PRIMARY_TRIGGER}

Risk Assessment:
- Risk Score: {RISK_SCORE}/1.0
- Test Coverage: {COVERAGE}%
- Complexity: {COMPLEXITY_LEVEL} (Score: {COMPLEXITY_SCORE})
- External Dependencies: {DEP_COUNT}

Triggering Criteria:
{CRITERIA_MET}

Skill Overview:
{BRIEF_DESCRIPTION}

Database Records:
Skill ID: {SKILL_ID}
Content Path: {CONTENT_PATH}
Test Suite: {TEST_SUITE_PATH}

How to Review:
1. Access database: sqlite3 skills.db
2. Review skill metadata: SELECT * FROM skills WHERE id={SKILL_ID}
3. Review approval criteria: SELECT approval_criteria FROM skills WHERE id={SKILL_ID}
4. Review test results: {TEST_SUITE_PATH}

Decision Instructions:
Use the approval_update.sh script to record your decision:
  ./approval_update.sh {SKILL_ID} {EXPERT_EMAIL} [approved|escalated|rejected] "Your reasoning"

Examples:
  ./approval_update.sh {SKILL_ID} {EXPERT_EMAIL} approved "All criteria met, excellent test coverage"
  ./approval_update.sh {SKILL_ID} {EXPERT_EMAIL} escalated "Escalate to human review due to security implications"
  ./approval_update.sh {SKILL_ID} {EXPERT_EMAIL} rejected "Lacks proper error handling"

Questions?
Reply to this email or contact skills-admins@example.com

---
Skills Database Workflow System
```

### Template 2: Human Approval Request (Email)

```text
Subject: [Skills DB] URGENT: Human Approval Required - {SKILL_NAME}

To: {CTO_EMAIL}, {PRINCIPAL_ARCHITECT_EMAIL}
CC: architecture-board@example.com
Priority: Urgent

---

Human Approval Request - High Risk Skill

Skill: {SKILL_NAME}
Category: {CATEGORY}
Version: {VERSION}
Risk Score: {RISK_SCORE}/1.0 (>0.60 = HIGH RISK)
SLA: {SLA_DAYS} days (Deadline: {DEADLINE_DATE})

Escalation Reason:
{ESCALATION_REASON}

Why This Requires Human Decision:
{HUMAN_APPROVAL_RATIONALE}

Risk Assessment Summary:
- Security Impact: {SECURITY_IMPACT}
- Complexity: {COMPLEXITY_LEVEL} (Score: {COMPLEXITY_SCORE})
- Test Coverage: {COVERAGE}%
- Business Criticality: {BUSINESS_IMPACT}
- Integration Risk: {INTEGRATION_RISK}

Strategic Implications:
{STRATEGIC_ANALYSIS}

Approval History:
{PREVIOUS_DECISIONS}

Board Review Required: {BOARD_REVIEW_NEEDED}
If yes, schedule with Architecture Review Board

Database Access:
Skill ID: {SKILL_ID}
SELECT * FROM skills WHERE id={SKILL_ID};
SELECT * FROM approval_history WHERE skill_id={SKILL_ID};

Review Checklist:
- [ ] Code review completed
- [ ] Security implications analyzed
- [ ] Business impact understood
- [ ] Resource requirements assessed
- [ ] Risk mitigation strategies identified
- [ ] Integration plan validated

Decision Submission:
./human_approval.sh {SKILL_ID} "{YOUR_DECISION}" "Your detailed reasoning"

Contact:
skills-admins@example.com (any questions)

---
Skills Database Workflow System
```

### Template 3: Approval Decision Notification (Email)

```text
Subject: [Skills DB] Approval Decision - {SKILL_NAME} [{DECISION}]

To: {SKILL_OWNER_EMAIL}
CC: {TEAM_LEAD_EMAIL}, skills-admins@example.com

---

Approval Decision Notification

Skill: {SKILL_NAME}
Version: {VERSION}
Decision: {DECISION}
Approved By: {APPROVER_NAME}
Approval Level: {LEVEL}
Timestamp: {DECISION_TIMESTAMP}

{DECISION_OUTCOME}

Approval Reasoning:
{APPROVER_REASONING}

{IF_APPROVED}
✓ Your skill is now APPROVED and ready for deployment.
Status: Ready for agent loading
Next Steps:
1. Deploy to production (if needed)
2. Update team documentation
3. Monitor initial execution for any issues

{IF_REJECTED}
✗ Your skill was REJECTED.
Feedback:
{FEEDBACK}

Next Steps:
1. Review feedback carefully
2. Address concerns
3. Update skill and resubmit
4. Contact {APPROVER_NAME} if you have questions

{IF_NEEDS_CHANGES}
⚠ Your skill needs corrections before approval.
Required Changes:
{REQUIRED_CHANGES}

Next Steps:
1. Address each feedback item
2. Update tests if coverage is < 95%
3. Resubmit for review (expected SLA: 5 business days)
4. Reference this email in your resubmission

Approval History:
Created: {CREATION_TIMESTAMP}
Last Review: {LAST_REVIEW_TIMESTAMP}
Total Review Time: {TOTAL_REVIEW_TIME}

Questions?
Contact {APPROVER_NAME} or skills-admins@example.com

---
Skills Database Workflow System
```

### Template 4: Slack Notification (Auto-Approval)

```text
:white_check_mark: **Skill Auto-Approved**

Skill: {SKILL_NAME}
Version: {VERSION}
Category: {CATEGORY}
Risk Score: {RISK_SCORE}
Coverage: {COVERAGE}%

Status: Ready for deployment
Time to Approval: {APPROVAL_TIME}

Approver: system
Database ID: {SKILL_ID}
```

### Template 5: Slack Notification (Escalation)

```text
:warning: **Escalation Review in Progress**

Skill: {SKILL_NAME}
Version: {VERSION}
Escalated To: {EXPERT_NAME}
Category: {CATEGORY}

Escalation Reason: {PRIMARY_TRIGGER}
Review SLA: {SLA_HOURS} hours
Expected Deadline: {DEADLINE_TIME}

Database ID: {SKILL_ID}
Status Dashboard: {DASHBOARD_URL}
```

---

## Workflow Execution Guide

### Quick Start: Processing New Skill Submission

**Step 1: Submit Skill (PR or Direct Database)**

```bash
# Via pull request
git checkout -b feature/new-coordination-skill
# ... create skill files ...
git commit -m "feat: Add new coordination skill"
git push origin feature/new-coordination-skill
# Create PR with approval metadata in description

# Via direct database insertion
sqlite3 skills.db << EOF
INSERT INTO skills (
  name, category, content_path, content_hash,
  version, approval_level, test_coverage,
  owner, tags
) VALUES (
  'new-skill-name',
  'coordination',
  '.claude/skills/new-skill/SKILL.md',
  '$(sha256sum new-skill-path | awk '{print $1}')',
  '1.0.0',
  'escalate',
  0.88,
  'owner@example.com',
  '["redis", "async"]'
);
EOF
```

**Step 2: Automatic Risk Assessment**

```bash
# Risk assessment runs automatically
./scripts/assess-skill-risk.sh {skill_id}

# Output:
# Risk Score: 0.42
# Coverage: 88%
# Complexity: 7
# Recommendation: ESCALATE
```

**Step 3: Route to Approval Level**

```bash
# Automatic routing
case "$recommendation" in
  "AUTO")
    ./workflows/auto-approval.sh {skill_id}
    ;;
  "ESCALATE")
    ./workflows/escalation-review.sh {skill_id}
    ;;
  "HUMAN")
    ./workflows/human-approval.sh {skill_id}
    ;;
esac
```

**Step 4: Monitor Progress**

```bash
# Check approval status
sqlite3 skills.db << EOF
SELECT
  s.name,
  s.approval_level,
  ah.decision,
  ah.approver,
  ah.timestamp
FROM skills s
LEFT JOIN approval_history ah ON s.id = ah.skill_id
WHERE s.id = {skill_id}
ORDER BY ah.timestamp DESC;
EOF
```

### Performance Monitoring Dashboard

```sql
-- Overall approval metrics
SELECT
  approval_level,
  COUNT(*) as total_skills,
  AVG(test_coverage) as avg_coverage,
  COUNT(DISTINCT approver) as reviewer_count,
  AVG(julianday('now') - julianday(last_approval_date)) as avg_days_since_approval
FROM skills
WHERE status = 'active'
GROUP BY approval_level;

-- Expert workload
SELECT
  approver,
  COUNT(*) as skills_reviewed,
  AVG(review_duration_minutes) as avg_review_time,
  COUNT(CASE WHEN decision='approved' THEN 1 END) as approved,
  COUNT(CASE WHEN decision='rejected' THEN 1 END) as rejected
FROM approval_history
WHERE timestamp > datetime('now', '-30 days')
GROUP BY approver
ORDER BY skills_reviewed DESC;

-- SLA compliance
SELECT
  approval_level,
  COUNT(CASE WHEN (julianday('now') - julianday(timestamp)) <= sla_days THEN 1 END) as on_time,
  COUNT(CASE WHEN (julianday('now') - julianday(timestamp)) > sla_days THEN 1 END) as overdue,
  ROUND(100.0 * COUNT(CASE WHEN (julianday('now') - julianday(timestamp)) <= sla_days THEN 1 END) / COUNT(*), 2) as sla_pct
FROM approval_history
WHERE timestamp > datetime('now', '-90 days')
GROUP BY approval_level;
```

---

## Summary

The three-tier approval workflow provides:

1. **Efficiency:** 80%+ auto-approval in < 35 seconds per skill
2. **Quality:** Expert review for medium/high-risk skills
3. **Scalability:** Process hundreds of skills monthly
4. **Compliance:** Complete immutable audit trail
5. **Flexibility:** Category-specific routing and expert assignment
6. **Continuous Improvement:** Edge case feedback loop from Phase 4
7. **Clear SLAs:** Defined review timelines and escalation paths
8. **Transparency:** Real-time status tracking and notifications

Use these workflows to ensure consistent, high-quality skill approvals that balance innovation with governance.
