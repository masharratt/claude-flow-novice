# Skills Database v2 Validation Checklist
## Schema Implementation & Deployment Verification

**Version:** 1.0.0
**Date:** 2025-11-16
**Purpose:** Verify correct implementation of schema-v2.sql with approval workflow integration
**Owner:** Database architecture team

---

## PRE-DEPLOYMENT VALIDATION

### Schema Structure Validation

- [ ] **All tables exist**
  ```bash
  sqlite3 skills.db ".tables" | grep -q "skills approval_history approval_criteria_templates"
  ```
  Expected: Command returns success (no output means success)

- [ ] **All required columns in `skills` table**
  ```sql
  -- Check for new v2 columns
  PRAGMA table_info(skills);
  ```
  Verify present:
  - [ ] `approval_level` (TEXT)
  - [ ] `approval_criteria` (TEXT)
  - [ ] `test_coverage` (REAL)
  - [ ] `test_suite_path` (TEXT)
  - [ ] `required_test_pass_rate` (REAL)
  - [ ] `phase4_pattern_id` (INTEGER)
  - [ ] `generated_by` (TEXT)
  - [ ] `is_auto_generated` (BOOLEAN)
  - [ ] `last_approved_by` (TEXT)
  - [ ] `last_approval_date` (TEXT)

- [ ] **All columns in `approval_history` table**
  ```sql
  PRAGMA table_info(approval_history);
  ```
  Verify present (full list):
  - [ ] `id` (INTEGER PRIMARY KEY)
  - [ ] `skill_id` (INTEGER NOT NULL)
  - [ ] `version` (TEXT NOT NULL)
  - [ ] `approval_level` (TEXT NOT NULL)
  - [ ] `approver` (TEXT)
  - [ ] `decision` (TEXT NOT NULL)
  - [ ] `reasoning` (TEXT)
  - [ ] `risk_assessment` (TEXT)
  - [ ] `test_results` (TEXT)
  - [ ] `approval_criteria_check` (TEXT)
  - [ ] `escalation_reason` (TEXT)
  - [ ] `escalated_to` (TEXT)
  - [ ] `timestamp` (TEXT)
  - [ ] `review_duration_minutes` (INTEGER)

- [ ] **All columns in `approval_criteria_templates` table**
  ```sql
  PRAGMA table_info(approval_criteria_templates);
  ```
  Verify present:
  - [ ] `id` (INTEGER PRIMARY KEY)
  - [ ] `approval_level` (TEXT NOT NULL)
  - [ ] `category` (TEXT NOT NULL)
  - [ ] `criteria_json` (TEXT NOT NULL)
  - [ ] `description` (TEXT NOT NULL)
  - [ ] `enabled` (BOOLEAN)
  - [ ] `created_at` (TEXT)
  - [ ] `updated_at` (TEXT)

- [ ] **All columns in `agent_skill_mappings` table (TDD additions)**
  ```sql
  PRAGMA table_info(agent_skill_mappings);
  ```
  Verify TDD-related columns:
  - [ ] `tdd_condition` (TEXT) - NEW
  - [ ] Other columns from v1 preserved

- [ ] **All columns in `skill_usage_log` table (TDD additions)**
  ```sql
  PRAGMA table_info(skill_usage_log);
  ```
  Verify TDD-related columns:
  - [ ] `test_suite_executed` (BOOLEAN) - NEW
  - [ ] `test_pass_rate` (REAL) - NEW
  - [ ] Other columns from v1 preserved

- [ ] **Bootstrap skills table exists and is populated**
  ```sql
  SELECT COUNT(*) FROM bootstrap_skills;
  ```
  Expected: 5 records (for the 5 bootstrap skills)

### Constraints Validation

- [ ] **CHECK constraints on approval_level**
  ```sql
  -- Test invalid value should fail
  INSERT INTO skills (name, approval_level, ...)
  VALUES ('test', 'invalid', ...);  -- Should fail
  ```

- [ ] **CHECK constraints on status**
  ```sql
  -- Verify only valid statuses are accepted
  SELECT COUNT(*) FROM skills
  WHERE status NOT IN ('active', 'deprecated', 'archived');
  ```
  Expected: 0 rows

- [ ] **CHECK constraints on decision**
  ```sql
  -- Verify approval history decisions are valid
  SELECT COUNT(*) FROM approval_history
  WHERE decision NOT IN ('approved', 'rejected', 'escalated', 'needs_correction');
  ```
  Expected: 0 rows

- [ ] **UNIQUE constraint on skill name**
  ```sql
  -- Attempt to insert duplicate name (should fail)
  INSERT INTO skills (name, ...) VALUES (
    (SELECT name FROM skills LIMIT 1), ...
  );  -- Should fail
  ```

- [ ] **UNIQUE constraint on (agent_type, skill_id)**
  ```sql
  -- Verify each agent can have skill only once
  SELECT agent_type, skill_id, COUNT(*) as cnt
  FROM agent_skill_mappings
  GROUP BY agent_type, skill_id
  HAVING cnt > 1;
  ```
  Expected: 0 rows (no duplicates)

### Foreign Key Validation

- [ ] **Enable foreign keys check**
  ```bash
  sqlite3 skills.db "PRAGMA foreign_keys;"
  ```
  Expected: 1 (enabled)

- [ ] **No orphaned approval_history records**
  ```sql
  SELECT COUNT(*) FROM approval_history
  WHERE skill_id NOT IN (SELECT id FROM skills);
  ```
  Expected: 0 rows

- [ ] **No orphaned agent_skill_mappings records**
  ```sql
  SELECT COUNT(*) FROM agent_skill_mappings
  WHERE skill_id NOT IN (SELECT id FROM skills);
  ```
  Expected: 0 rows

- [ ] **No orphaned phase4_skill_generation records**
  ```sql
  SELECT COUNT(*) FROM phase4_skill_generation
  WHERE skill_id NOT IN (SELECT id FROM skills);
  ```
  Expected: 0 rows

- [ ] **No orphaned edge_case_tracking records**
  ```sql
  SELECT COUNT(*) FROM edge_case_tracking
  WHERE skill_id NOT IN (SELECT id FROM skills);
  ```
  Expected: 0 rows

### Index Validation

- [ ] **All required indexes exist**
  ```sql
  SELECT COUNT(*) FROM sqlite_master
  WHERE type='index' AND name LIKE 'idx_%';
  ```
  Expected: At least 25+ indexes

- [ ] **Performance indexes are present**
  - [ ] `idx_skills_name` - Required for skill lookups
  - [ ] `idx_skills_approval_level` - For approval workflow queries
  - [ ] `idx_skills_phase4_pattern` - For Phase 4 integration
  - [ ] `idx_approval_history_skill` - For audit trail queries
  - [ ] `idx_approval_history_timestamp` - For time-based queries
  - [ ] `idx_agent_skills_priority` - For skill loading order
  - [ ] `idx_usage_agent_type` - For analytics by agent type

- [ ] **Composite indexes are present**
  - [ ] `idx_agent_mapping_type_priority` - For skill loading
  - [ ] `idx_skills_category_status` - For category/status queries

---

## POST-DEPLOYMENT VALIDATION

### Data Integrity Tests

- [ ] **Approval criteria templates seeded correctly**
  ```sql
  SELECT COUNT(*) FROM approval_criteria_templates;
  ```
  Expected: At least 9 templates (3 auto, 3 escalate, 3 human)

- [ ] **Bootstrap skills registry populated**
  ```sql
  SELECT COUNT(*) FROM bootstrap_skills WHERE enabled = 1;
  ```
  Expected: Skills from `.claude/skills/bootstrap/` directory:
  - bash-fundamentals (load_order: 1)
  - database-connection (load_order: 2)
  - file-operations (load_order: 3)
  - error-handling (load_order: 4)
  - skill-loader (load_order: 5)

  To verify count matches directory:
  ```bash
  EXPECTED_COUNT=$(ls -1 .claude/skills/bootstrap/*.md | wc -l)
  ACTUAL_COUNT=$(sqlite3 skills.db "SELECT COUNT(*) FROM bootstrap_skills WHERE enabled = 1")
  [ "$EXPECTED_COUNT" -eq "$ACTUAL_COUNT" ] && echo "✓ Bootstrap count correct" || echo "✗ Count mismatch"
  ```

  ```sql
  SELECT DISTINCT load_order FROM bootstrap_skills ORDER BY load_order;
  ```
  Expected: 1, 2, 3, 4, 5 (sequential, no gaps)

- [ ] **Schema version recorded**
  ```sql
  SELECT version FROM schema_versions ORDER BY applied_at DESC LIMIT 1;
  ```
  Expected: v2.0.0

### Functional Tests

- [ ] **Can insert skill with all v2 fields**
  ```sql
  INSERT INTO skills (
    name, category, team, content_path, content_hash, tags, version,
    approval_level, approval_criteria, test_coverage, test_suite_path,
    phase4_pattern_id, generated_by, owner
  ) VALUES (
    'test-skill', 'coordination', 'cfn',
    '/path/to/skill.md', 'hash123', '[]', '1.0.0',
    'auto', '{}', 0.95, '/path/to/test.sh',
    NULL, 'manual', 'owner@example.com'
  );
  ```
  Expected: Insert succeeds

- [ ] **Can record approval decision**
  ```sql
  INSERT INTO approval_history (
    skill_id, version, approval_level, approver, decision
  ) VALUES (1, '1.0.0', 'auto', 'system', 'approved');
  ```
  Expected: Insert succeeds

- [ ] **Can track edge cases**
  ```sql
  INSERT INTO edge_case_tracking (
    skill_id, edge_case_description, severity
  ) VALUES (1, 'Test edge case', 'medium');
  ```
  Expected: Insert succeeds

- [ ] **Can log skill usage with TDD metrics**
  ```sql
  INSERT INTO skill_usage_log (
    agent_id, agent_type, skill_id, test_suite_executed, test_pass_rate
  ) VALUES ('agent-1', 'backend', 1, 1, 0.95);
  ```
  Expected: Insert succeeds

### Query Performance Tests

- [ ] **Active skills query completes in < 100ms**
  ```bash
  time sqlite3 skills.db "SELECT * FROM active_skills_with_approval LIMIT 100;"
  ```

- [ ] **Approval pending query completes in < 100ms**
  ```bash
  time sqlite3 skills.db "SELECT * FROM approval_pending_skills;"
  ```

- [ ] **Agent skill mappings query completes in < 50ms**
  ```bash
  time sqlite3 skills.db \
    "SELECT * FROM agent_skill_mappings WHERE agent_type = 'backend-developer' ORDER BY priority;"
  ```

- [ ] **Approval history query completes in < 100ms**
  ```bash
  time sqlite3 skills.db \
    "SELECT * FROM approval_history WHERE skill_id = 1 ORDER BY timestamp DESC;"
  ```

### View Validation

- [ ] **active_skills_with_approval view works**
  ```sql
  SELECT COUNT(*) FROM active_skills_with_approval;
  ```
  Expected: Returns count of active skills

- [ ] **approval_pending_skills view works**
  ```sql
  SELECT COUNT(*) FROM approval_pending_skills;
  ```
  Expected: Returns count of pending skills

- [ ] **approval_distribution view works**
  ```sql
  SELECT COUNT(*) FROM approval_distribution;
  ```
  Expected: Shows distribution by approval level

---

## MIGRATION VALIDATION (If migrating from v1)

### Pre-Migration Backup

- [ ] **Backup created successfully**
  ```bash
  ls -lh .backups/skills-database/skills_v1_backup_*.db
  ```
  Expected: File exists and size matches original

- [ ] **Backup is readable**
  ```bash
  sqlite3 .backups/skills-database/skills_v1_backup_*.db "SELECT COUNT(*) FROM skills;"
  ```
  Expected: Returns skill count

### Data Preservation

- [ ] **All v1 skills preserved**
  ```sql
  SELECT COUNT(*) FROM skills;
  ```
  Expected: Count matches pre-migration count

- [ ] **All v1 skill mappings preserved**
  ```sql
  SELECT COUNT(*) FROM agent_skill_mappings;
  ```
  Expected: Count matches pre-migration count

- [ ] **All v1 usage logs preserved**
  ```sql
  SELECT COUNT(*) FROM skill_usage_log;
  ```
  Expected: Count matches pre-migration count

- [ ] **All v1 bootstrap skills preserved**
  ```sql
  SELECT COUNT(*) FROM bootstrap_skills;
  ```
  Expected: Count matches pre-migration count

### Data Migration Quality

- [ ] **Approval levels assigned to all skills**
  ```sql
  SELECT COUNT(*) FROM skills WHERE approval_level IS NULL;
  ```
  Expected: 0 (all skills have approval level)

- [ ] **Approval history created for existing skills**
  ```sql
  SELECT COUNT(DISTINCT skill_id) FROM approval_history;
  ```
  Expected: Count >= number of v1 skills

- [ ] **No data loss in migration**
  ```sql
  SELECT COUNT(*) FROM skills WHERE content_hash IS NULL;
  ```
  Expected: 0 (all skills have integrity hash)

---

## SECURITY VALIDATION

- [ ] **No hardcoded secrets in schema**
  ```bash
  grep -E "(password|key|secret|token)" schema-v2.sql | wc -l
  ```
  Expected: 0 matches

- [ ] **Foreign keys enforced for referential integrity**
  ```bash
  sqlite3 skills.db "PRAGMA foreign_keys;"
  ```
  Expected: 1 (enabled)

- [ ] **CHECK constraints prevent invalid approval decisions**
  ```sql
  -- Attempt invalid decision (should fail)
  INSERT INTO approval_history (skill_id, decision)
  VALUES (1, 'invalid_decision');  -- Should fail
  ```
  Expected: Error

- [ ] **Approval history is append-only** (no updates to past decisions)
  ```bash
  grep -n "UPDATE approval_history" schema-v2.sql
  ```
  Expected: 0 matches (no updates allowed)

---

## COMPLIANCE & AUDIT VALIDATION

- [ ] **Approval audit trail is complete**
  ```sql
  SELECT COUNT(*) FROM approval_history WHERE timestamp IS NULL;
  ```
  Expected: 0 (all decisions timestamped)

- [ ] **All approval decisions have reasoning documented**
  ```sql
  SELECT COUNT(*) FROM approval_history
  WHERE decision != 'approved' AND reasoning IS NULL;
  ```
  Expected: 0 (all rejections/escalations have reasoning)

- [ ] **Approver identification is tracked**
  ```sql
  SELECT COUNT(DISTINCT approver) FROM approval_history;
  ```
  Expected: Multiple unique approvers

- [ ] **Edge cases are tracked for improvement**
  ```sql
  SELECT COUNT(*) FROM edge_case_tracking
  WHERE detected_at IS NOT NULL;
  ```
  Expected: >= 0 (edge cases properly timestamped)

---

## PHASE 4 INTEGRATION VALIDATION

- [ ] **Phase 4 skill generation table exists**
  ```sql
  SELECT COUNT(*) FROM sqlite_master
  WHERE type='table' AND name='phase4_skill_generation';
  ```
  Expected: 1

- [ ] **Can link skills to Phase 4 patterns**
  ```sql
  INSERT INTO skills (name, phase4_pattern_id, generated_by, ...)
  VALUES ('phase4-skill', 123, 'phase4', ...);
  ```
  Expected: Insert succeeds

- [ ] **Edge case tracking works for Phase 4 skills**
  ```sql
  INSERT INTO edge_case_tracking (skill_id, edge_case_description, severity)
  VALUES (1, 'Phase 4 generated skill edge case', 'medium');
  ```
  Expected: Insert succeeds

---

## TDD INTEGRATION VALIDATION

- [ ] **Test coverage column exists and accepts values**
  ```sql
  UPDATE skills SET test_coverage = 0.95 WHERE id = 1;
  SELECT test_coverage FROM skills WHERE id = 1;
  ```
  Expected: Returns 0.95

- [ ] **Test suite path column exists**
  ```sql
  UPDATE skills SET test_suite_path = '/path/to/test.sh' WHERE id = 1;
  SELECT test_suite_path FROM skills WHERE id = 1;
  ```
  Expected: Returns path

- [ ] **Required test pass rate enforced**
  ```sql
  SELECT required_test_pass_rate FROM skills WHERE id = 1;
  ```
  Expected: Returns value between 0.0 and 1.0

- [ ] **TDD conditions in agent mappings work**
  ```sql
  UPDATE agent_skill_mappings SET
    tdd_condition = json_object('require_tests', true, 'min_coverage', 0.9)
  WHERE id = 1;
  SELECT json_extract(tdd_condition, '$.require_tests') FROM agent_skill_mappings WHERE id = 1;
  ```
  Expected: Returns 1 (true)

- [ ] **Usage log tracks test metrics**
  ```sql
  SELECT test_suite_executed, test_pass_rate FROM skill_usage_log
  WHERE test_suite_executed = 1 LIMIT 1;
  ```
  Expected: Returns proper values

---

## SIGN-OFF

Schema v2 validation complete when ALL items are checked:

| Component | Status | Date | Reviewer |
|-----------|--------|------|----------|
| Schema Structure | ✓ | 2025-11-16 | [Name] |
| Constraints | ✓ | 2025-11-16 | [Name] |
| Foreign Keys | ✓ | 2025-11-16 | [Name] |
| Indexes | ✓ | 2025-11-16 | [Name] |
| Data Integrity | ✓ | 2025-11-16 | [Name] |
| Functional Tests | ✓ | 2025-11-16 | [Name] |
| Performance Tests | ✓ | 2025-11-16 | [Name] |
| Security | ✓ | 2025-11-16 | [Name] |
| Compliance | ✓ | 2025-11-16 | [Name] |
| Phase 4 Integration | ✓ | 2025-11-16 | [Name] |
| TDD Integration | ✓ | 2025-11-16 | [Name] |

**Overall Status:** [APPROVED / PENDING / FAILED]

**Sign-Off:** [Reviewer Name] on [Date]

**Next Steps:**
- [ ] Deploy to production
- [ ] Monitor query performance
- [ ] Implement approval workflow automation
- [ ] Enable Phase 4 skill generation
- [ ] Start tracking TDD metrics

---
