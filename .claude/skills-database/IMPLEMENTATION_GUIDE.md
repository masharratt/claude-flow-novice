# Skills Database v2 Implementation Guide
## Approval Workflow & Phase 4 Integration

**Version:** 1.0.0
**Date:** 2025-11-16
**Status:** Production Ready
**Audience:** Backend developers, DBAs, DevOps engineers

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Approval Workflow Implementation](#approval-workflow-implementation)
3. [TDD Integration](#tdd-integration)
4. [Phase 4 Codification Integration](#phase-4-codification-integration)
5. [Query Patterns](#query-patterns)
6. [Monitoring & Analytics](#monitoring--analytics)
7. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

### Three-Tier Approval System

```
┌────────────────────────────────────────────────────────────┐
│                   NEW SKILL SUBMISSION                      │
└────────────────────────────────────────────────────────────┘
                           │
                           ▼
            ┌──────────────────────────────┐
            │  Determine Risk Profile      │
            │  - Category (domain, infra)  │
            │  - Complexity               │
            │  - External dependencies     │
            └──────────────────────────────┘
                           │
                ┌──────────┼──────────┐
                │          │          │
                ▼          ▼          ▼
            ┌──────┐  ┌────────┐  ┌─────────┐
            │ AUTO │  │ESCALATE│  │ HUMAN   │
            └──────┘  └────────┘  └─────────┘
              │          │            │
              │          │            │
        [Auto-Check] [Expert]    [Expert]
        Risk<0.3      Review    Review
        Tests≥95%    Required    Required
        Simple       Medium       High
                │            │
                ▼            ▼
            ┌──────────────────────┐
            │  Approval Decision   │
            │  - Approved          │
            │  - Escalated         │
            │  - Rejected          │
            │  - Needs Correction  │
            └──────────────────────┘
                       │
                       ▼
            ┌──────────────────────┐
            │ Production Deployment│
            └──────────────────────┘
```

### Database Relationships

```
skills (Core)
├─ approval_history (Audit Trail)
│  └─ Links to: skill_id, approval decision, approver
├─ approval_criteria_templates (Rules)
│  └─ Defines: approval_level, category, criteria_json
├─ agent_skill_mappings (Usage)
│  └─ Links to: agent_type, priority, conditions
├─ skill_usage_log (Analytics)
│  └─ Tracks: execution_time, confidence_impact, test_results
└─ phase4_skill_generation (Phase 4 Integration)
   └─ Links to: phase4_pattern_id, edge_case_tracking
```

---

## Approval Workflow Implementation

### 1. Add New Skill with Approval Metadata

```sql
-- Insert new skill with approval workflow metadata
INSERT INTO skills (
  name,
  category,
  team,
  content_path,
  content_hash,
  tags,
  version,
  status,
  approval_level,
  approval_criteria,
  test_coverage,
  test_suite_path,
  required_test_pass_rate,
  owner
) VALUES (
  'redis-coordination-v3',
  'coordination',
  'cfn',
  '.claude/skills/coordination/redis-v3/SKILL.md',
  'sha256_hash_of_content',
  '["redis", "async", "coordination"]',
  '3.0.0',
  'active',
  'escalate',  -- Requires expert review (medium risk)
  json_object(
    'risk_score_max', 0.4,
    'test_coverage_min', 0.85,
    'complexity_min', 'medium',
    'requires_security_review', true
  ),
  0.92,  -- 92% test coverage
  '.claude/skills/coordination/redis-v3/test.sh',
  0.95,  -- Requires 95%+ test pass rate
  'alice@example.com'
);
```

### 2. Configure Approval Criteria

```sql
-- Define custom approval criteria for specific category
INSERT OR IGNORE INTO approval_criteria_templates (
  approval_level,
  category,
  criteria_json,
  description,
  enabled
) VALUES (
  'escalate',
  'coordination',
  json_object(
    'risk_score_min', 0.3,
    'risk_score_max', 0.6,
    'test_coverage_min', 0.85,
    'complexity_min', 'medium',
    'affects_loop_orchestration', true,
    'requires_expert_validation', true,
    'expert_email', 'coordinator@example.com'
  ),
  'Medium-risk coordination skills affecting loop orchestration',
  1
);
```

### 3. Automatic Approval Decision

```bash
#!/bin/bash
# Auto-approval evaluation script

DB_PATH="${DB_PATH:-./.claude/skills-database/skills.db}"
SKILL_ID="${SKILL_ID:?Required: SKILL_ID}"

echo "=== Auto-Approval Evaluation ==="

# Get skill and criteria
SKILL=$(sqlite3 "$DB_PATH" << EOF
SELECT s.id, s.name, s.approval_level, s.test_coverage, s.approval_criteria
FROM skills s
WHERE s.id = $SKILL_ID;
EOF
)

# Get template criteria for this skill's level and category
TEMPLATE=$(sqlite3 "$DB_PATH" << EOF
SELECT s.approval_level, act.criteria_json
FROM skills s
JOIN approval_criteria_templates act
  ON s.category = act.category AND s.approval_level = act.approval_level
WHERE s.id = $SKILL_ID;
EOF
)

echo "Skill: $SKILL"
echo "Criteria Template: $TEMPLATE"

# Evaluate auto-approval criteria (if approval_level = 'auto')
if [[ "$SKILL" == *"auto"* ]]; then
  # Extract test coverage from skill
  TEST_COVERAGE=$(echo "$SKILL" | jq '.test_coverage')

  # Check template minimum
  MIN_COVERAGE=$(echo "$TEMPLATE" | jq '.test_coverage_min')

  if (( $(echo "$TEST_COVERAGE >= $MIN_COVERAGE" | bc -l) )); then
    echo "✓ Auto-approved: Test coverage meets requirement ($TEST_COVERAGE >= $MIN_COVERAGE)"
    DECISION="approved"
  else
    echo "✗ Auto-approval failed: Test coverage below minimum"
    DECISION="escalated"
  fi
fi

# Record approval decision
sqlite3 "$DB_PATH" << EOF
INSERT INTO approval_history (
  skill_id, version, approval_level, approver, decision, reasoning
) VALUES (
  $SKILL_ID,
  (SELECT version FROM skills WHERE id = $SKILL_ID),
  (SELECT approval_level FROM skills WHERE id = $SKILL_ID),
  'system',
  '$DECISION',
  'Automatic evaluation: criteria check'
);
EOF

echo "Decision recorded: $DECISION"
```

### 4. Escalation to Expert Review

```bash
#!/bin/bash
# Escalate skill to expert review

DB_PATH="${DB_PATH:-./.claude/skills-database/skills.db}"
SKILL_ID="${SKILL_ID:?Required: SKILL_ID}"
EXPERT_EMAIL="${EXPERT_EMAIL:?Required: EXPERT_EMAIL}"

echo "=== Escalating to Expert Review ==="

# Update approval history with escalation
sqlite3 "$DB_PATH" << EOF
INSERT INTO approval_history (
  skill_id,
  version,
  approval_level,
  approver,
  decision,
  reasoning,
  escalated_to,
  escalation_reason
) VALUES (
  $SKILL_ID,
  (SELECT version FROM skills WHERE id = $SKILL_ID),
  (SELECT approval_level FROM skills WHERE id = $SKILL_ID),
  'system',
  'escalated',
  'Automatic escalation: criteria requirements not met or manual escalation requested',
  '$EXPERT_EMAIL',
  'Medium risk profile requires expert domain knowledge'
);
EOF

echo "✓ Skill escalated to: $EXPERT_EMAIL"
echo "Expert review required for deployment"

# Send notification (integration point)
# notify_expert "$EXPERT_EMAIL" "Skill $SKILL_ID requires your review"
```

### 5. Expert Approval Decision

```bash
#!/bin/bash
# Expert makes final approval decision

DB_PATH="${DB_PATH:-./.claude/skills-database/skills.db}"
SKILL_ID="${SKILL_ID:?Required: SKILL_ID}"
DECISION="${DECISION:?Required: DECISION (approved|rejected|needs_correction)}"
EXPERT_EMAIL="${EXPERT_EMAIL:?Required: EXPERT_EMAIL}"
REASONING="${REASONING:?Required: REASONING}"

echo "=== Expert Approval Decision ==="

# Validate decision
if [[ ! "$DECISION" =~ ^(approved|rejected|needs_correction)$ ]]; then
  echo "ERROR: Invalid decision. Must be: approved, rejected, or needs_correction"
  exit 1
fi

# Record decision
sqlite3 "$DB_PATH" << EOF
INSERT INTO approval_history (
  skill_id,
  version,
  approval_level,
  approver,
  decision,
  reasoning,
  timestamp
) VALUES (
  $SKILL_ID,
  (SELECT version FROM skills WHERE id = $SKILL_ID),
  (SELECT approval_level FROM skills WHERE id = $SKILL_ID),
  '$EXPERT_EMAIL',
  '$DECISION',
  '$REASONING',
  datetime('now')
);

-- Update last approval metadata if approved
UPDATE skills SET
  last_approved_by = '$EXPERT_EMAIL',
  last_approval_date = datetime('now')
WHERE id = $SKILL_ID AND '$DECISION' = 'approved';
EOF

echo "✓ Decision recorded: $DECISION"
echo "Approver: $EXPERT_EMAIL"
echo "Reasoning: $REASONING"
```

---

## TDD Integration

### 1. Track Test Coverage

```sql
-- Update skill with test coverage information
UPDATE skills SET
  test_coverage = 0.95,  -- 95% of code is tested
  test_suite_path = '.claude/skills/coordination/redis-v3/test.sh',
  required_test_pass_rate = 0.95
WHERE id = 1;
```

### 2. Execute Test Suite During Approval

```bash
#!/bin/bash
# Run test suite and record results

DB_PATH="${DB_PATH:-./.claude/skills-database/skills.db}"
SKILL_ID="${SKILL_ID:?Required: SKILL_ID}"

echo "=== TDD Validation ==="

# Get test suite path
TEST_SUITE=$(sqlite3 "$DB_PATH" << EOF
SELECT test_suite_path FROM skills WHERE id = $SKILL_ID;
EOF
)

if [[ -z "$TEST_SUITE" ]]; then
  echo "No test suite configured for this skill"
  exit 1
fi

# Run tests
echo "Running tests: $TEST_SUITE"
TEST_OUTPUT=$("$TEST_SUITE" 2>&1)
TEST_EXIT=$?

# Parse test results
PASS_COUNT=$(echo "$TEST_OUTPUT" | grep -c "PASS" || echo 0)
FAIL_COUNT=$(echo "$TEST_OUTPUT" | grep -c "FAIL" || echo 0)
TOTAL=$((PASS_COUNT + FAIL_COUNT))
PASS_RATE=$(echo "scale=2; $PASS_COUNT / $TOTAL" | bc)

echo "Test Results:"
echo "  Passed: $PASS_COUNT"
echo "  Failed: $FAIL_COUNT"
echo "  Pass Rate: $PASS_RATE"

# Record in approval history
TEST_RESULTS=$(cat <<EOF
{
  "pass_count": $PASS_COUNT,
  "fail_count": $FAIL_COUNT,
  "total_count": $TOTAL,
  "pass_rate": $PASS_RATE
}
EOF
)

sqlite3 "$DB_PATH" << EOF
INSERT INTO approval_history (
  skill_id,
  version,
  approval_level,
  decision,
  test_results
) VALUES (
  $SKILL_ID,
  (SELECT version FROM skills WHERE id = $SKILL_ID),
  (SELECT approval_level FROM skills WHERE id = $SKILL_ID),
  'approved',
  '$TEST_RESULTS'
);
EOF

# Return exit code based on pass rate requirement
REQUIRED_RATE=$(sqlite3 "$DB_PATH" "SELECT required_test_pass_rate FROM skills WHERE id = $SKILL_ID;")
if (( $(echo "$PASS_RATE >= $REQUIRED_RATE" | bc -l) )); then
  echo "✓ Test pass rate meets requirement: $PASS_RATE >= $REQUIRED_RATE"
  exit 0
else
  echo "✗ Test pass rate below requirement: $PASS_RATE < $REQUIRED_RATE"
  exit 1
fi
```

### 3. Log Test Coverage Impact

```sql
-- Record in skill usage log with test metrics
INSERT INTO skill_usage_log (
  agent_id,
  agent_type,
  skill_id,
  task_id,
  phase,
  confidence_before,
  confidence_after,
  execution_time_ms,
  test_suite_executed,
  test_pass_rate,
  success_indicator
) VALUES (
  'backend-developer-1',
  'backend-developer',
  1,
  'cfn-loop-task-123',
  'loop3',
  0.82,
  0.91,
  145,
  1,     -- Tests were executed
  0.95,  -- 95% pass rate
  1      -- Skill helped (confidence increased)
);
```

---

## Phase 4 Codification Integration

### 1. Record Generated Skill

```sql
-- Register Phase 4-generated skill
INSERT INTO skills (
  name,
  category,
  team,
  content_path,
  content_hash,
  version,
  approval_level,
  generated_by,
  is_auto_generated,
  created_at
) VALUES (
  'npm-install-build-test-codified',
  'infrastructure',
  'frontend',
  '.claude/skills/codified/npm-build-workflow/SKILL.md',
  'sha256_hash',
  '1.0.0',
  'escalate',  -- Medium risk, requires expert validation
  'phase4',
  1,           -- Auto-generated from pattern
  datetime('now')
);

-- Link to Phase 4 pattern
INSERT INTO phase4_skill_generation (
  skill_id,
  phase4_pattern_id,
  pattern_name,
  generated_by,
  source_reflection_ids,
  generation_status
) VALUES (
  (SELECT id FROM skills WHERE name = 'npm-install-build-test-codified'),
  42,  -- PostgreSQL workflow_patterns.id
  'npm-install-build-test-workflow',
  'phase4-codification-agent',
  '["uuid-1", "uuid-2", "uuid-3"]',  -- Source reflections
  'generated'  -- Status: generated → approved → deployed
);
```

### 2. Track Edge Cases

```sql
-- Record edge case encountered during skill execution
INSERT INTO edge_case_tracking (
  skill_id,
  edge_case_description,
  failure_reason,
  input_parameters,
  expected_output,
  actual_output,
  severity,
  resolved
) VALUES (
  (SELECT id FROM skills WHERE name = 'npm-install-build-test-codified'),
  'npm install fails with workspace hoisting conflict',
  'Package dependency conflict in monorepo workspace',
  '{"workspace": "frontend/ui", "node_version": "18.0"}',
  'npm install completes successfully',
  'npm ERR! code ERESOLVE\nnpm ERR! ERESOLVE unable to resolve dependency tree',
  'medium',
  0  -- Not yet resolved
);

-- Propose fix
UPDATE edge_case_tracking SET
  proposed_fix = json_object(
    'action', 'update_criteria',
    'parameter', 'npm_legacy_peer_deps',
    'value', true,
    'reasoning', 'Enable legacy peer dependency resolution for monorepos'
  ),
  requires_approval = 1
WHERE id = (SELECT MAX(id) FROM edge_case_tracking);
```

### 3. Deploy Approved Skill

```sql
-- After expert approval, update status to deployed
UPDATE phase4_skill_generation SET
  generation_status = 'deployed',
  deployment_timestamp = datetime('now')
WHERE skill_id = 1
  AND generation_status = 'approved';

-- Update skills table
UPDATE skills SET
  status = 'active',
  last_approved_by = 'expert@example.com',
  last_approval_date = datetime('now')
WHERE id = 1;
```

---

## Query Patterns

### Query 1: Find Skills Pending Approval

```sql
-- Get all skills that need approval decisions
SELECT
  s.id,
  s.name,
  s.category,
  s.approval_level,
  s.version,
  s.created_at,
  COUNT(ah.id) as review_attempts
FROM skills s
LEFT JOIN approval_history ah ON s.id = ah.skill_id
WHERE s.status = 'active'
  AND (
    SELECT COUNT(*)
    FROM approval_history
    WHERE skill_id = s.id AND decision = 'approved'
  ) = 0
GROUP BY s.id
ORDER BY s.created_at ASC;
```

### Query 2: Get Skills by Approval Level

```sql
-- Distribution of skills by approval tier
SELECT
  s.approval_level,
  s.category,
  COUNT(*) as skill_count,
  AVG(s.test_coverage) as avg_test_coverage,
  COUNT(CASE WHEN ah.decision = 'approved' THEN 1 END) as approved_count
FROM skills s
LEFT JOIN approval_history ah ON s.id = ah.skill_id AND ah.decision = 'approved'
WHERE s.status = 'active'
GROUP BY s.approval_level, s.category
ORDER BY s.approval_level, s.category;
```

### Query 3: Find Phase 4-Generated Skills

```sql
-- Get all Phase 4-generated skills with their status
SELECT
  s.id,
  s.name,
  p.pattern_name,
  p.generation_status,
  p.deployment_timestamp,
  COUNT(ec.id) as edge_case_count,
  COUNT(CASE WHEN ec.resolved = 1 THEN 1 END) as resolved_cases
FROM skills s
JOIN phase4_skill_generation p ON s.id = p.skill_id
LEFT JOIN edge_case_tracking ec ON s.id = ec.skill_id
WHERE s.is_auto_generated = 1
GROUP BY s.id, s.name, p.pattern_name, p.generation_status
ORDER BY p.deployment_timestamp DESC;
```

### Query 4: Skill Effectiveness Metrics

```sql
-- Calculate skill effectiveness based on usage impact
SELECT
  s.name,
  COUNT(sul.id) as usage_count,
  AVG(sul.confidence_after - sul.confidence_before) as avg_confidence_boost,
  COUNT(CASE WHEN sul.success_indicator = 1 THEN 1 END) * 100.0 / COUNT(*) as success_rate,
  AVG(sul.test_pass_rate) as avg_test_pass_rate,
  AVG(sul.execution_time_ms) as avg_execution_time_ms
FROM skills s
LEFT JOIN skill_usage_log sul ON s.id = sul.skill_id
WHERE s.status = 'active'
GROUP BY s.id, s.name
ORDER BY avg_confidence_boost DESC;
```

---

## Monitoring & Analytics

### 1. Approval Workflow SLA Monitoring

```sql
-- SLA: Reviews should complete within 48 hours
SELECT
  s.name,
  s.approval_level,
  ah.timestamp as submitted_at,
  datetime('now') as current_time,
  julianday('now') - julianday(ah.timestamp) as days_pending,
  CASE
    WHEN julianday('now') - julianday(ah.timestamp) > 2 THEN 'OVERDUE'
    WHEN julianday('now') - julianday(ah.timestamp) > 1 THEN 'WARNING'
    ELSE 'OK'
  END as sla_status
FROM skills s
LEFT JOIN approval_history ah ON s.id = ah.skill_id
WHERE s.status = 'active'
  AND (
    SELECT COUNT(*)
    FROM approval_history
    WHERE skill_id = s.id AND decision IN ('approved', 'rejected')
  ) = 0
ORDER BY days_pending DESC;
```

### 2. Risk Assessment Dashboard

```sql
-- Overall approval workflow health
SELECT
  'Total Active Skills' as metric, COUNT(*) as value
FROM skills WHERE status = 'active'
UNION ALL
SELECT 'Auto-Approved', COUNT(*) FROM skills WHERE approval_level = 'auto' AND status = 'active'
UNION ALL
SELECT 'Escalated for Review', COUNT(*) FROM skills WHERE approval_level = 'escalate' AND status = 'active'
UNION ALL
SELECT 'Human Review Required', COUNT(*) FROM skills WHERE approval_level = 'human' AND status = 'active'
UNION ALL
SELECT 'Pending Approval', COUNT(DISTINCT s.id)
FROM skills s
WHERE s.status = 'active'
  AND NOT EXISTS (SELECT 1 FROM approval_history ah WHERE ah.skill_id = s.id AND ah.decision = 'approved')
UNION ALL
SELECT 'Average Test Coverage %', CAST(AVG(test_coverage) * 100 AS INTEGER) FROM skills WHERE status = 'active'
UNION ALL
SELECT 'Phase 4 Generated Skills', COUNT(*) FROM skills WHERE is_auto_generated = 1 AND status = 'active';
```

---

## Troubleshooting

### Issue: Skill Stuck in Escalation

```sql
-- Find skills escalated but not reviewed
SELECT
  s.id,
  s.name,
  s.approval_level,
  MAX(ah.escalated_to) as escalated_to,
  MAX(ah.timestamp) as last_escalated,
  julianday('now') - julianday(MAX(ah.timestamp)) as days_since_escalation
FROM skills s
JOIN approval_history ah ON s.id = ah.skill_id
WHERE ah.decision = 'escalated'
GROUP BY s.id
HAVING julianday('now') - julianday(MAX(ah.timestamp)) > 2
ORDER BY days_since_escalation DESC;

-- Auto-escalate to higher authority if SLA exceeded
-- INSERT notification and update escalation tracking
```

### Issue: Test Coverage Below Requirement

```bash
#!/bin/bash
# Identify skills with insufficient test coverage

DB_PATH="${DB_PATH:-./.claude/skills-database/skills.db}"

sqlite3 "$DB_PATH" << EOF
SELECT
  s.id,
  s.name,
  s.approval_level,
  s.test_coverage,
  s.required_test_pass_rate,
  CASE
    WHEN s.test_coverage < 0.80 THEN 'CRITICAL - Add tests'
    WHEN s.test_coverage < 0.90 THEN 'WARNING - Improve coverage'
    ELSE 'OK'
  END as action_required
FROM skills s
WHERE s.status = 'active'
  AND s.test_coverage < s.required_test_pass_rate
ORDER BY s.test_coverage ASC;
EOF
```

### Issue: Orphaned Approvals

```sql
-- Find approval records with deleted skills (data integrity issue)
SELECT
  ah.id,
  ah.skill_id,
  ah.decision,
  ah.timestamp
FROM approval_history ah
WHERE ah.skill_id NOT IN (SELECT id FROM skills)
LIMIT 10;

-- Clean up orphaned records
DELETE FROM approval_history
WHERE skill_id NOT IN (SELECT id FROM skills);
```

---

## Next Steps

1. **Deploy schema-v2.sql** to production SQLite database
2. **Run migration script** to populate approval data for existing skills
3. **Configure approval criteria** per team and category
4. **Set up expert review workflow** with notifications
5. **Integrate with Phase 4 codification** for automatic skill generation
6. **Monitor approval SLAs** and adjust escalation rules
7. **Track TDD metrics** and improve test coverage requirements

---
