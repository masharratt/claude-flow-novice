# Dynamic Skills Database v2.0
## Three-Tier Approval Workflow & Phase 4 Integration

**Version:** 2.0.0
**Status:** Production Ready
**Date:** 2025-11-16
**Branch:** claude/review-skills-db-plan-015DJZLrjxcfs4VuSn7d4Fon

---

## Overview

This directory contains the complete database schema and documentation for the Dynamic Skills Database v2, which integrates:

1. **Three-Tier Approval Workflow** (auto → escalate → human)
2. **TDD Integration** (test coverage, test pass rates)
3. **Phase 4 Workflow Codification** (automatic skill generation)
4. **100% Backward Compatibility** with v1 schema

### Key Improvements

| Feature | v1 | v2 | Benefit |
|---------|----|----|---------|
| Skill storage | ✓ | ✓ | No change to core skills table |
| Approval workflow | ✗ | ✓ | Governance + compliance |
| TDD integration | ✗ | ✓ | Quality gates + test coverage |
| Phase 4 codification | ✗ | ✓ | Cost reduction + automation |
| Audit trail | ✗ | ✓ | Compliance + transparency |

---

## Quick Start

### 1. Review Schema Design

```bash
# Examine the complete schema
less schema-v2.sql

# Key sections:
# - Lines 1-50: Schema overview comments
# - Lines 51-150: Skills table with new columns
# - Lines 151-250: Approval history table
# - Lines 251-350: Approval criteria templates with seed data
# - Lines 351-450: TDD integration
# - Lines 451-550: Phase 4 integration
# - Lines 551+: Indexes, views, migration helpers
```

### 2. Deploy to Database

```bash
# Apply schema to existing database
sqlite3 /path/to/skills.db < schema-v2.sql

# Or during initial setup
sqlite3 /path/to/skills.db < schema-v2.sql
```

### 3. Migrate from v1 (If Needed)

See **MIGRATION_GUIDE_V1_TO_V2.md** for:
- Pre-migration validation
- Backup procedures
- Step-by-step migration
- Rollback procedures
- Data validation

### 4. Implement Approval Workflow

See **IMPLEMENTATION_GUIDE.md** for:
- Architecture patterns
- Code examples for approval decisions
- Query patterns
- Monitoring setup

### 5. Validate Deployment

See **VALIDATION_CHECKLIST.md** for:
- Pre-deployment checks
- Post-deployment tests
- Security validation
- Performance verification

---

## File Guide

### 1. schema-v2.sql (3,100+ lines)
**Purpose:** Complete database schema with all tables, constraints, indexes, and seed data

**Key Sections:**
```text
1. Skills Table (Enhanced)
   - Core skill metadata + approval workflow columns
   - TDD support: test_coverage, test_suite_path
   - Phase 4 integration: phase4_pattern_id, generated_by
   - 11 new columns from v1

2. Approval History Table (NEW)
   - Complete audit trail of all approval decisions
   - Escalation tracking
   - Risk assessment documentation
   - 14 columns total

3. Approval Criteria Templates (NEW)
   - Reusable criteria definitions
   - Seed data: 9 templates (3 levels × 3 categories)
   - 7 columns

4. Agent Skill Mappings (Enhanced)
   - TDD-aware conditions (new tdd_condition column)
   - Priority ordering for skill loading
   - Optional/required skill designation

5. Skill Usage Log (Enhanced)
   - Test suite execution tracking
   - Test pass rate recording
   - Effectiveness metrics

6. Bootstrap Skills Registry
   - 5 core foundation skills
   - Load order management
   - Integrity validation

7. Phase 4 Integration
   - Links skills to workflow patterns
   - Edge case tracking
   - Generation status tracking

8. Indexes (25+ total)
   - Name lookups: O(log n)
   - Category/status filtering: O(log n)
   - Agent type/priority ordering: O(log n)

9. Views (3 total)
   - active_skills_with_approval
   - approval_pending_skills
   - approval_distribution

10. Migration Support
    - schema_versions table
    - Migration helper views
```

**Usage:**
```bash
# Deploy to production
sqlite3 production.db < schema-v2.sql

# Verify deployment
sqlite3 production.db "SELECT version FROM schema_versions;"
# Output: v2.0.0
```

### 2. MIGRATION_GUIDE_V1_TO_V2.md (500+ lines)
**Purpose:** Step-by-step guide for upgrading from v1 to v2

**Key Sections:**
1. **Overview** - What's changing (additive, zero breaking changes)
2. **Pre-Migration Validation** - Verify v1 schema integrity
3. **Migration Steps**
   - Apply v2 schema
   - Populate approval criteria templates
   - Migrate existing skills
   - Set approval levels based on category
4. **Data Validation** - Verify data integrity
5. **Rollback Procedure** - How to revert if needed
6. **Post-Migration Verification** - Functional testing

**Migration Timeline:**
- Total duration: 1.4 hours
- Pre-migration: 0.5 hours
- Schema application: 0.1 hours
- Data migration: 0.3 hours
- Validation: 0.5 hours

**Success Criteria:**
- All v1 data preserved (100% integrity)
- All v2 tables created
- Approval history populated
- Foreign keys enforced
- Rollback verified

### 3. IMPLEMENTATION_GUIDE.md (800+ lines)
**Purpose:** Detailed implementation patterns and code examples

**Key Sections:**
1. **Architecture Overview** - Three-tier approval system diagram
2. **Approval Workflow Implementation**
   - Insert skill with metadata
   - Configure approval criteria
   - Auto-approval evaluation
   - Escalation to expert
   - Expert decision recording
3. **TDD Integration**
   - Track test coverage
   - Execute test suite during approval
   - Log test coverage impact
4. **Phase 4 Integration**
   - Record generated skills
   - Track edge cases
   - Deploy approved skills
5. **Query Patterns**
   - Find pending approvals
   - Distribution by approval level
   - Phase 4-generated skills
   - Effectiveness metrics
6. **Monitoring & Analytics**
   - SLA monitoring
   - Risk assessment dashboard
7. **Troubleshooting**
   - Skills stuck in escalation
   - Low test coverage
   - Orphaned records

**Code Examples:**
All SQL and bash script examples are production-ready and include:
- Parameter validation
- Error handling
- Result logging
- Integration points

### 4. VALIDATION_CHECKLIST.md (600+ lines)
**Purpose:** Comprehensive validation checklist for deployment

**Checklist Categories:**
1. **Pre-Deployment Validation** (35+ items)
   - Schema structure
   - Constraints
   - Foreign keys
   - Indexes

2. **Post-Deployment Validation** (25+ items)
   - Data integrity
   - Functional tests
   - Query performance
   - Views

3. **Migration Validation** (15+ items)
   - Backup verification
   - Data preservation
   - Data quality

4. **Security Validation** (10+ items)
   - No hardcoded secrets
   - Foreign key enforcement
   - Constraint validation

5. **Compliance & Audit** (10+ items)
   - Approval audit trail
   - Decision documentation
   - Approver tracking

6. **Phase 4 Integration** (5+ items)
   - Pattern linking
   - Edge case tracking

7. **TDD Integration** (5+ items)
   - Coverage columns
   - Test suite paths
   - Usage logging

**Sign-Off Section:**
Document reviewed and approved by:
- Schema architect
- Database administrator
- Security reviewer
- Compliance officer

---

## Approval Workflow Overview

### Three-Tier System

```text
SKILL SUBMISSION
│
├─ [AUTO] Low Risk
│  └─ Conditions: risk < 0.3, tests ≥ 95%, simple
│     Result: Instant approval (system)
│
├─ [ESCALATE] Medium Risk
│  └─ Conditions: risk 0.3-0.6, tests ≥ 85%, medium complexity
│     Result: Expert review required (48h SLA)
│
└─ [HUMAN] High Risk
   └─ Conditions: risk > 0.6, complex, multi-team impact
      Result: Human approval required (7d SLA)

APPROVAL HISTORY RECORDED
└─ Timestamp, decision, reasoning, approver, risk assessment

POST-APPROVAL
└─ Skill marked as approved + available for deployment
```

### Approval Criteria Templates (Seed Data)

| Level | Category | Conditions | Count |
|-------|----------|-----------|-------|
| Auto | coordination | risk < 0.3, tests ≥ 95% | 3 |
| Auto | foundation | risk < 0.2, tests ≥ 98% | |
| Auto | testing | risk < 0.25, tests ≥ 90% | |
| Escalate | infrastructure | external API, resource provisioning | 3 |
| Escalate | domain | complex business logic, multi-team | |
| Escalate | coordination | affects loop orchestration | |
| Human | domain | high complexity, revenue impact | 3 |
| Human | infrastructure | high-risk production impact | |
| Human | coordination | Phase 4 generated edge cases | |

---

## TDD Integration

### Test Coverage Tracking

```sql
-- Skills can specify test coverage requirements
UPDATE skills SET
  test_coverage = 0.95,                        -- 95% code coverage
  test_suite_path = '.../test.sh',            -- Path to test script
  required_test_pass_rate = 0.95;             -- Must pass 95% of tests
```

### TDD Conditions in Agent Mappings

```sql
-- Skills can have TDD-based conditional loading
UPDATE agent_skill_mappings SET
  tdd_condition = json_object(
    'require_tests', true,
    'min_coverage', 0.90,
    'min_pass_rate', 0.95
  )
WHERE skill_id = 1;
```

### Test Metrics in Usage Logs

```sql
-- Track test results when skills are used
INSERT INTO skill_usage_log (..., test_suite_executed, test_pass_rate)
VALUES (..., 1, 0.95);
```

---

## Phase 4 Integration

### Automatic Skill Generation from Patterns

```sql
-- When Phase 4 detects a repeated workflow pattern (≥5 occurrences)
-- it can auto-generate a skill and track it for approval

INSERT INTO phase4_skill_generation (
  skill_id,
  phase4_pattern_id,      -- Reference to workflow pattern
  pattern_name,
  generated_by,           -- 'phase4-codification-agent'
  source_reflection_ids,  -- JSON array of source reflections
  generation_status       -- 'generated' → 'approved' → 'deployed'
)
```

### Edge Case Tracking

```sql
-- As Phase 4-generated skills execute, edge cases are tracked
-- and used to improve the generated skills

INSERT INTO edge_case_tracking (
  skill_id,
  edge_case_description,  -- What went wrong
  failure_reason,
  input_parameters,
  expected_output,
  actual_output,
  severity,
  proposed_fix            -- Suggested improvement
);
```

### Continuous Improvement

1. Phase 4 generates skill from pattern
2. Skill goes through approval workflow
3. Skill deployed to production
4. Edge cases tracked during execution
5. Improvements proposed back to experts
6. Cycle repeats with updated skill

---

## Key Metrics

### Query Performance Targets

| Query | Target | Measurement |
|-------|--------|-------------|
| Find active skills | <100ms | Full table scan with filtering |
| Get pending approvals | <100ms | Join with approval_history |
| Load agent skills | <50ms | Indexed lookup by agent_type |
| Skill usage analytics | <200ms | Aggregation over usage_log |

### Data Volume Targets

| Table | Target | Notes |
|-------|--------|-------|
| skills | 500+ | Easily scaled beyond 1000 |
| approval_history | 10,000+ | Audit trail of all decisions |
| skill_usage_log | 10,000+/day | High-volume analytics table |
| approval_criteria_templates | 50-100 | Reusable templates for all categories |

---

## Compliance & Governance

### Audit Trail
- Every approval decision is recorded in `approval_history`
- Cannot be modified (append-only design)
- Includes: decision, reasoning, approver, timestamp, risk assessment

### SLA Tracking
- Auto-approvals: Instant
- Escalations: 48 hours
- Human review: 7 days
- Auto-escalate to Product Owner if SLA exceeded

### Risk Assessment
- Risk scores tracked in `approval_criteria_check`
- Security review marked in approval criteria
- Complexity levels: low, medium, high
- External dependencies noted

### Compliance Fields
- `approver`: WHO made the decision
- `decision`: WHAT was decided (approved/rejected/escalated)
- `reasoning`: WHY that decision was made
- `timestamp`: WHEN it was decided
- `risk_assessment`: HOW risky is this skill

---

## Getting Started

### For Database Administrators

1. **Review** `schema-v2.sql` (focus on table relationships)
2. **Deploy** schema to database
3. **Run** validation checklist from `VALIDATION_CHECKLIST.md`
4. **Monitor** approval SLAs and edge cases

### For Backend Developers

1. **Read** `IMPLEMENTATION_GUIDE.md` (focus on query patterns)
2. **Implement** approval workflow using provided SQL/bash examples
3. **Track** TDD metrics in usage logs
4. **Monitor** skill effectiveness

### For DevOps/Infra Teams

1. **Review** `MIGRATION_GUIDE_V1_TO_V2.md` if upgrading
2. **Run** pre-migration validation
3. **Execute** migration steps
4. **Verify** with post-migration tests
5. **Monitor** database performance

### For Security/Compliance Teams

1. **Review** approval workflow design
2. **Validate** audit trail implementation
3. **Check** constraint enforcement
4. **Verify** no hardcoded secrets
5. **Approve** for production deployment

---

## Troubleshooting

### Common Issues

**Q: Can I rollback from v2 to v1?**
A: Yes! See "Rollback Procedure" in MIGRATION_GUIDE_V1_TO_V2.md. You can either:
- Drop new tables (keep v1 data)
- Restore from pre-migration backup

**Q: Will v2 break existing queries?**
A: No. All v1 tables and columns are preserved unchanged. New columns have sensible defaults.

**Q: How do I enable approval workflow?**
A: See IMPLEMENTATION_GUIDE.md section "Approval Workflow Implementation" for complete code examples.

**Q: What if approval gets stuck?**
A: Query `approval_pending_skills` view to find stalled skills, then escalate to Product Owner.

---

## Next Steps

1. **Deploy schema-v2.sql** to production
2. **Run validation checklist** to verify deployment
3. **Configure approval criteria** for your teams
4. **Implement approval workflow** using examples from IMPLEMENTATION_GUIDE.md
5. **Enable Phase 4 integration** for automatic skill generation
6. **Start tracking TDD metrics** for skill quality

---

## Support & Documentation

- **Schema Questions:** Refer to schema-v2.sql comments
- **Migration Issues:** MIGRATION_GUIDE_V1_TO_V2.md
- **Implementation Help:** IMPLEMENTATION_GUIDE.md
- **Validation Errors:** VALIDATION_CHECKLIST.md
- **Architecture Decisions:** This README + schema comments

---

## Metrics & Analytics

### Key Views

```sql
-- Active skills with approval status
SELECT * FROM active_skills_with_approval;

-- Skills pending approval decisions
SELECT * FROM approval_pending_skills;

-- Approval level distribution
SELECT * FROM approval_distribution;

-- Skill effectiveness metrics
SELECT s.name, COUNT(*) as usage_count,
       AVG(confidence_after - confidence_before) as confidence_boost
FROM skills s
LEFT JOIN skill_usage_log sul ON s.id = sul.skill_id
GROUP BY s.id
ORDER BY confidence_boost DESC;
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0.0 | 2025-11-16 | Initial v2 release with approval workflow + TDD + Phase 4 integration |
| 1.0.0 | 2025-09-15 | Initial version (skills table only) |

---

## Questions?

Refer to the appropriate documentation file:
- **Schema structure:** schema-v2.sql (inline comments)
- **Deployment:** MIGRATION_GUIDE_V1_TO_V2.md
- **Usage:** IMPLEMENTATION_GUIDE.md
- **Validation:** VALIDATION_CHECKLIST.md

---
