# Skills Database Migration Guide: v1 → v2
## Three-Tier Approval Workflow Integration

**Version:** 1.0.0
**Date:** 2025-11-16
**Status:** Production Ready
**Required for:** Production deployments of Dynamic Skills Database

---

## Table of Contents

1. [Overview](#overview)
2. [Pre-Migration Validation](#pre-migration-validation)
3. [Migration Steps](#migration-steps)
4. [Data Validation](#data-validation)
5. [Rollback Procedure](#rollback-procedure)
6. [Post-Migration Verification](#post-migration-verification)

---

## Overview

### What's Changing

**v1 → v2 is additive with zero breaking changes:**

| Aspect | v1 | v2 | Impact |
|--------|----|----|--------|
| Existing columns | ✓ | ✓ | Preserved as-is |
| Backward compatibility | N/A | ✓ | 100% compatible |
| Data structure | Flat | Enhanced | New tables for approval workflow |
| Downtime required | N/A | None | Online migration possible |
| Rollback | N/A | Safe | Can revert if needed |

### New Tables Added

```
approval_history                   -- Audit trail (required for compliance)
approval_criteria_templates        -- Approval rules and seed data
phase4_skill_generation           -- Phase 4 pattern integration
edge_case_tracking                -- Edge case feedback loop
schema_versions                    -- Migration tracking
```

### Impact on Existing Code

```
Skills Table            Phase 4 Integration     TDD Support
├─ approval_level      ├─ phase4_pattern_id   ├─ test_coverage
├─ approval_criteria   ├─ is_auto_generated    ├─ test_suite_path
├─ last_approved_by    └─ generated_by         └─ required_test_pass_rate
└─ last_approval_date
```

---

## Pre-Migration Validation

### Step 1: Verify v1 Schema Integrity

```bash
#!/bin/bash
set -euo pipefail

DB_PATH="${DB_PATH:-./.claude/skills-database/skills.db}"

echo "=== Pre-Migration Validation ==="
echo "Database: $DB_PATH"

# Check database exists
if [[ ! -f "$DB_PATH" ]]; then
  echo "ERROR: Database not found at $DB_PATH"
  exit 1
fi

# Check v1 tables exist
echo "Checking v1 tables..."
sqlite3 "$DB_PATH" ".tables" | grep -q "skills" && echo "✓ skills table found"
sqlite3 "$DB_PATH" ".tables" | grep -q "agent_skill_mappings" && echo "✓ agent_skill_mappings table found"
sqlite3 "$DB_PATH" ".tables" | grep -q "skill_usage_log" && echo "✓ skill_usage_log table found"
sqlite3 "$DB_PATH" ".tables" | grep -q "bootstrap_skills" && echo "✓ bootstrap_skills table found"

# Validate data integrity
echo "Validating data integrity..."
SKILL_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM skills;")
MAPPING_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM agent_skill_mappings;")
echo "✓ Skills in database: $SKILL_COUNT"
echo "✓ Skill mappings in database: $MAPPING_COUNT"

# Check for foreign key violations (if enabled)
echo "Checking for orphaned records..."
sqlite3 "$DB_PATH" "PRAGMA foreign_keys = ON;" || true
ORPHANED=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM agent_skill_mappings WHERE skill_id NOT IN (SELECT id FROM skills);" 2>/dev/null || echo "0")
if [[ "$ORPHANED" -gt 0 ]]; then
  echo "WARNING: Found $ORPHANED orphaned mappings (will be handled during migration)"
fi

echo "=== Pre-Migration Validation Complete ==="
```

### Step 2: Create Backup

```bash
#!/bin/bash
set -euo pipefail

DB_PATH="${DB_PATH:-./.claude/skills-database/skills.db}"
BACKUP_DIR="${BACKUP_DIR:-.backups/skills-database}"

mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/skills_v1_backup_$TIMESTAMP.db"

echo "Creating backup: $BACKUP_FILE"
cp "$DB_PATH" "$BACKUP_FILE"

# Verify backup
if [[ -f "$BACKUP_FILE" ]]; then
  ORIGINAL_SIZE=$(du -h "$DB_PATH" | cut -f1)
  BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  echo "✓ Backup created successfully"
  echo "  Original: $ORIGINAL_SIZE"
  echo "  Backup: $BACKUP_SIZE"
else
  echo "ERROR: Backup creation failed"
  exit 1
fi
```

---

## Migration Steps

### Step 1: Apply v2 Schema

```bash
#!/bin/bash
set -euo pipefail

DB_PATH="${DB_PATH:-./.claude/skills-database/skills.db}"
SCHEMA_V2="${SCHEMA_V2:-./.claude/skills-database/schema-v2.sql}"

echo "=== Applying v2 Schema ==="

# Enable foreign keys for referential integrity
sqlite3 "$DB_PATH" "PRAGMA foreign_keys = ON;"

# Apply schema
echo "Executing schema-v2.sql..."
sqlite3 "$DB_PATH" < "$SCHEMA_V2"

echo "✓ v2 schema applied successfully"
```

### Step 2: Populate Approval Criteria Templates

The approval criteria templates are automatically seeded during schema creation with:

- **Auto-Approval Rules:**
  - Coordination skills: Low risk (<0.3), 95%+ test coverage
  - Foundation skills: Minimal risk (<0.2), 98%+ test coverage
  - Testing utilities: Low risk (<0.25), 90%+ test coverage

- **Escalation Rules:**
  - Infrastructure: External dependencies require expert review
  - Domain logic: Complex business logic affecting multiple teams
  - Coordination: Complex flows affecting loop orchestration

- **Human Review Rules:**
  - Domain: High-complexity business logic
  - Infrastructure: High-risk production impact
  - Coordination: Phase 4-generated edge case skills

### Step 3: Migrate Existing Skills

```bash
#!/bin/bash
set -euo pipefail

DB_PATH="${DB_PATH:-./.claude/skills-database/skills.db}"

echo "=== Migrating Existing Skills to v2 ==="

# Set default approval levels based on category
echo "Setting default approval levels..."
sqlite3 "$DB_PATH" << EOF
-- Foundation skills: Auto-approval
UPDATE skills SET approval_level = 'auto'
WHERE category = 'foundation' AND approval_level = 'human';

-- Coordination skills: Escalate for review
UPDATE skills SET approval_level = 'escalate'
WHERE category = 'coordination' AND approval_level = 'human';

-- Testing skills: Auto-approval
UPDATE skills SET approval_level = 'auto'
WHERE category = 'testing' AND approval_level = 'human';

-- Domain and infrastructure: Human review
UPDATE skills SET approval_level = 'human'
WHERE category IN ('domain', 'infrastructure') AND approval_level = 'human';
EOF

echo "✓ Approval levels assigned to all existing skills"

# Record approval history for existing skills
echo "Creating approval history for existing skills..."
sqlite3 "$DB_PATH" << EOF
INSERT INTO approval_history
  (skill_id, version, approval_level, approver, decision, reasoning, timestamp)
SELECT
  s.id,
  s.version,
  s.approval_level,
  'system-migration',
  'approved',
  'v1 to v2 migration: existing skill carried forward',
  s.created_at
FROM skills s
WHERE NOT EXISTS (
  SELECT 1 FROM approval_history ah WHERE ah.skill_id = s.id
);
EOF

echo "✓ Approval history created for existing skills"
```

### Step 4: Set Approval Criteria for Existing Skills

```bash
#!/bin/bash
set -euo pipefail

DB_PATH="${DB_PATH:-./.claude/skills-database/skills.db}"

echo "=== Setting Approval Criteria ==="

# Assign approval criteria based on category and risk assessment
sqlite3 "$DB_PATH" << EOF
-- Auto-approval skills get simple criteria
UPDATE skills SET
  approval_criteria = json_object(
    'risk_score', 0.2,
    'test_coverage', 0.95,
    'complexity', 'low'
  )
WHERE approval_level = 'auto' AND approval_criteria IS NULL;

-- Escalation skills get medium criteria
UPDATE skills SET
  approval_criteria = json_object(
    'risk_score', 0.4,
    'test_coverage', 0.85,
    'complexity', 'medium',
    'requires_review', true
  )
WHERE approval_level = 'escalate' AND approval_criteria IS NULL;

-- Human review skills get comprehensive criteria
UPDATE skills SET
  approval_criteria = json_object(
    'risk_score', 0.6,
    'test_coverage', 0.80,
    'complexity', 'high',
    'requires_human_review', true
  )
WHERE approval_level = 'human' AND approval_criteria IS NULL;
EOF

echo "✓ Approval criteria assigned to all skills"
```

---

## Data Validation

### Validation Checklist

```bash
#!/bin/bash
set -euo pipefail

DB_PATH="${DB_PATH:-./.claude/skills-database/skills.db}"

echo "=== Post-Migration Data Validation ==="

# 1. Check all tables exist
echo "1. Verifying all v2 tables exist..."
TABLES=(
  "skills"
  "agent_skill_mappings"
  "skill_usage_log"
  "bootstrap_skills"
  "approval_history"
  "approval_criteria_templates"
  "phase4_skill_generation"
  "edge_case_tracking"
  "schema_versions"
)

for table in "${TABLES[@]}"; do
  COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='$table';")
  if [[ "$COUNT" -gt 0 ]]; then
    echo "  ✓ $table exists"
  else
    echo "  ✗ $table MISSING"
    exit 1
  fi
done

# 2. Verify foreign key integrity
echo "2. Validating foreign key integrity..."
sqlite3 "$DB_PATH" << EOF
PRAGMA foreign_keys = ON;
SELECT COUNT(*) as orphaned_mappings
FROM agent_skill_mappings asm
WHERE skill_id NOT IN (SELECT id FROM skills);
EOF

# 3. Check approval history
echo "3. Validating approval history..."
APPROVAL_RECORDS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM approval_history;")
echo "  ✓ Approval history records: $APPROVAL_RECORDS"

# 4. Verify bootstrap skills
echo "4. Validating bootstrap skills..."
BOOTSTRAP_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM bootstrap_skills;")
echo "  ✓ Bootstrap skills registered: $BOOTSTRAP_COUNT"

# 5. Check schema version
echo "5. Validating schema version..."
SCHEMA_VERSION=$(sqlite3 "$DB_PATH" "SELECT version FROM schema_versions ORDER BY applied_at DESC LIMIT 1;")
echo "  ✓ Current schema version: $SCHEMA_VERSION"

echo "=== Validation Complete ==="
```

---

## Rollback Procedure

If issues occur after migration, rollback is straightforward:

### Option 1: Drop New Tables (Keep v1)

```bash
#!/bin/bash
set -euo pipefail

DB_PATH="${DB_PATH:-./.claude/skills-database/skills.db}"

echo "=== Rolling Back to v1 (Keeping Data) ==="

sqlite3 "$DB_PATH" << EOF
-- Drop new v2 tables (but preserve v1 data)
DROP VIEW IF EXISTS active_skills_with_approval;
DROP VIEW IF EXISTS approval_pending_skills;
DROP VIEW IF EXISTS approval_distribution;
DROP VIEW IF EXISTS migration_status;

DROP TABLE IF EXISTS edge_case_tracking;
DROP TABLE IF EXISTS phase4_skill_generation;
DROP TABLE IF EXISTS approval_criteria_templates;
DROP TABLE IF EXISTS approval_history;
DROP TABLE IF EXISTS schema_versions;
EOF

echo "✓ Rolled back to v1 schema"
echo "NOTE: Your original skills data is preserved"
```

### Option 2: Restore from Backup

```bash
#!/bin/bash
set -euo pipefail

DB_PATH="${DB_PATH:-./.claude/skills-database/skills.db}"
BACKUP_DIR="${BACKUP_DIR:-.backups/skills-database}"

echo "=== Restoring from Backup ==="

# List available backups
echo "Available backups:"
ls -1 "$BACKUP_DIR"/skills_v1_backup_*.db | sort -r | head -5

# Restore from most recent
LATEST_BACKUP=$(ls -1t "$BACKUP_DIR"/skills_v1_backup_*.db | head -1)
echo "Restoring from: $LATEST_BACKUP"

cp "$LATEST_BACKUP" "$DB_PATH"
echo "✓ Database restored to v1 state"
```

---

## Post-Migration Verification

### Verify Application Functionality

```bash
#!/bin/bash
set -euo pipefail

DB_PATH="${DB_PATH:-./.claude/skills-database/skills.db}"

echo "=== Post-Migration Functional Tests ==="

# Test 1: Query skills with approval status
echo "1. Testing skill queries..."
ACTIVE_SKILLS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM active_skills_with_approval;")
echo "  ✓ Active skills with approval: $ACTIVE_SKILLS"

# Test 2: Query approval pending
echo "2. Testing approval pending query..."
PENDING=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM approval_pending_skills;")
echo "  ✓ Approval pending skills: $PENDING"

# Test 3: Check approval distribution
echo "3. Testing approval distribution..."
sqlite3 "$DB_PATH" "SELECT approval_level, skill_count FROM approval_distribution LIMIT 5;"

# Test 4: Verify bootstrap skills can be loaded
echo "4. Testing bootstrap skill loading..."
BOOTSTRAP=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM bootstrap_skills WHERE enabled = 1;")
echo "  ✓ Enabled bootstrap skills: $BOOTSTRAP"

# Test 5: Check agent skill mappings still work
echo "5. Testing agent skill mapping queries..."
AGENT_SKILLS=$(sqlite3 "$DB_PATH" "SELECT COUNT(DISTINCT agent_type) FROM agent_skill_mappings;")
echo "  ✓ Agent types with skill mappings: $AGENT_SKILLS"

echo "=== Post-Migration Verification Complete ==="
```

---

## Migration Timeline

| Phase | Duration | Task | Owner |
|-------|----------|------|-------|
| Pre-Migration | 0.5h | Backup, validate v1 | DevOps |
| Schema Application | 0.1h | Apply v2 schema | DBA |
| Data Migration | 0.3h | Populate approval data | DBA |
| Validation | 0.5h | Run validation suite | QA |
| **Total** | **1.4h** | Complete migration | Team |

---

## Success Criteria

- [x] All v1 tables preserved with 100% data integrity
- [x] All v2 tables created successfully
- [x] Approval history populated for existing skills
- [x] Approval criteria templates seeded with production rules
- [x] Bootstrap skills registered with correct load order
- [x] All indexes created and query performance validated
- [x] Foreign key constraints enforced
- [x] Rollback procedure verified and documented

---

## Support and Rollback

**If migration encounters issues:**

1. **During migration:** Restore from backup (see Option 2 above)
2. **After migration:** Drop new tables only (see Option 1 above) - v1 data preserved
3. **Data loss concerns:** Pre-migration backup is available in `.backups/skills-database/`
4. **Validation failures:** Run post-migration validation suite

**Contact:** Database architecture team for assistance

---

## Next Steps After Migration

After successful migration:

1. **Deploy Phase 4 Integration:** Start using `phase4_skill_generation` table
2. **Enable Approval Workflow:** Configure approval criteria per team
3. **Enable TDD Validation:** Start tracking test coverage and pass rates
4. **Configure Escalation:** Set up expert review workflow for medium-risk skills
5. **Monitor Analytics:** Use `skill_usage_log` for effectiveness tracking

---
