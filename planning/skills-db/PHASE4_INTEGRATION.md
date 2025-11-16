# Phase 4 Workflow Codification Integration Guide

## Document Metadata
- **Version:** 1.0.0
- **Status:** Integration Specification
- **Date:** 2025-11-15
- **Related:** COMPREHENSIVE_IMPLEMENTATION_PLAN.md

---

## Overview

This document specifies how the **Skills Database** (SQLite-based skill management) integrates with the **Phase 4 Workflow Codification System** (PostgreSQL-based pattern detection and skill generation).

### Integration Value Proposition

**Combined Benefits:**
- **60-80% AI cost reduction** (Phase 4 skill execution vs agent spawning)
- **40% prompt size reduction** (Skills DB contextual loading)
- **Complete lifecycle automation** (detect → generate → approve → deploy → analyze → improve)
- **Cross-team collaboration** (foundation skills shared via Skills DB)
- **Continuous improvement** (edge cases → updates → better reliability)

---

## Integration Points

### Integration Point A: Deployment Pipeline

**Trigger:** Phase 4 approval workflow transitions skill to DEPLOYED state

**Action:** Insert skill into Skills DB and map to relevant agents

**Script:** `.claude/skills/workflow-codification/deploy-approved-skill.sh`

```bash
#!/bin/bash
set -euo pipefail

# Called by Phase 4 approval workflow when skill is APPROVED

PATTERN_ID="$1"            # PostgreSQL workflow_patterns.id
SKILL_NAME="$2"            # Generated skill name
CONTENT_PATH="$3"          # Path to generated SKILL.md
CATEGORY="${4:-domain}"    # Inferred category

SKILLS_DB=".claude/skills-database/skills.db"
PHASE4_DB_HOST="${CFN_DB_HOST}"

echo "🚀 Deploying Phase 4 skill to Skills DB..."
echo "   Pattern ID: $PATTERN_ID"
echo "   Skill Name: $SKILL_NAME"
echo "   Category: $CATEGORY"

# 1. Calculate content hash for integrity validation
CONTENT_HASH=$(sha256sum "$CONTENT_PATH" | awk '{print $1}')

# 2. Determine approval level based on category and Phase 4 metrics
case "$CATEGORY" in
  "coordination")
    APPROVAL_LEVEL="auto"
    echo "   Approval Level: auto (simple coordination pattern)"
    ;;
  "infrastructure")
    APPROVAL_LEVEL="escalate"
    echo "   Approval Level: escalate (infrastructure changes require review)"
    ;;
  *)
    APPROVAL_LEVEL="human"
    echo "   Approval Level: human (default for complex logic)"
    ;;
esac

# 3. Extract tags from Phase 4 pattern detection
TAGS=$(psql -h "$PHASE4_DB_HOST" -t -c \
  "SELECT string_agg(tag, ',') FROM (
     SELECT DISTINCT unnest(regexp_split_to_array(workflow_steps, E'[\\s,;]+')) AS tag
     FROM workflow_patterns WHERE id=$PATTERN_ID LIMIT 10
   ) t;")
TAGS_JSON="[\"automated\", \"phase4-generated\", ${TAGS//,/\", \"}]"

# 4. Insert into Skills DB
SKILL_ID=$(sqlite3 "$SKILLS_DB" <<EOF
INSERT INTO skills (
  name, category, team, content_path, content_hash, tags, version, status,
  approval_level, phase4_pattern_id, generated_by, owner, created_at
) VALUES (
  '$SKILL_NAME',
  '$CATEGORY',
  'foundation',
  '$CONTENT_PATH',
  '$CONTENT_HASH',
  '$TAGS_JSON',
  '1.0.0',
  'active',
  '$APPROVAL_LEVEL',
  $PATTERN_ID,
  'phase4',
  'workflow-codification-system',
  datetime('now')
);
SELECT last_insert_rowid();
EOF
)

echo "   ✅ Skill inserted into Skills DB (ID: $SKILL_ID)"

# 5. Record approval decision (auto-approved by Phase 4 expert review)
sqlite3 "$SKILLS_DB" <<EOF
INSERT INTO approval_history (
  skill_id, version, approval_level, approver, decision, reasoning, timestamp
) VALUES (
  $SKILL_ID,
  '1.0.0',
  '$APPROVAL_LEVEL',
  'phase4-expert-review',
  'approved',
  'Auto-approved by Phase 4 workflow codification system after expert review in Phase 4 approval workflow',
  datetime('now')
);
EOF

echo "   ✅ Approval recorded in audit trail"

# 6. Auto-map to relevant agents based on pattern teams
TEAM_IDS=$(psql -h "$PHASE4_DB_HOST" -t -c \
  "SELECT DISTINCT team_id FROM workflow_patterns WHERE id=$PATTERN_ID;")

if [[ -z "$TEAM_IDS" ]]; then
  echo "   ⚠️  No teams found for pattern $PATTERN_ID, skipping agent mapping"
else
  for AGENT_TYPE in $TEAM_IDS; do
    sqlite3 "$SKILLS_DB" <<EOF
    INSERT INTO agent_skill_mappings (
      agent_type, skill_id, priority, required, conditions, created_at
    ) VALUES (
      '$AGENT_TYPE',
      $SKILL_ID,
      5,
      0,
      '{"taskContext": ["automation"], "phase": "loop3"}',
      datetime('now')
    );
EOF
    echo "   ✅ Mapped to agent: $AGENT_TYPE (priority: 5)"
  done
fi

# 7. Update Phase 4 workflow_patterns status
psql -h "$PHASE4_DB_HOST" -c \
  "UPDATE workflow_patterns SET status='deployed', deployed_skill_id=$SKILL_ID WHERE id=$PATTERN_ID;"

echo "   ✅ Phase 4 status updated to 'deployed'"
echo ""
echo "✅ Deployment complete: $SKILL_NAME"
echo "   Skills DB ID: $SKILL_ID"
echo "   Mapped Agents: $TEAM_IDS"
echo "   Approval Level: $APPROVAL_LEVEL"
```

**Data Flow:**
1. Phase 4 expert approves skill in Phase 4 approval workflow
2. Phase 4 calls `deploy-approved-skill.sh`
3. Script inserts skill into Skills DB with approval metadata
4. Script creates agent mappings based on pattern teams
5. Script updates Phase 4 `workflow_patterns.status = 'deployed'`
6. Agents automatically load skill on next spawn (contextual loading)

---

### Integration Point B: Dual Logging

**Trigger:** Skill execution (both static and Phase 4-generated skills)

**Action:** Log to both Skills DB (SQLite) and Phase 4 (PostgreSQL)

**Implementation:** `src/cli/skill-execution-logger.ts`

```typescript
import Database from 'better-sqlite3';
import { Pool } from 'pg';

interface SkillExecutionMetrics {
  agentId: string;
  agentType: string;
  skillName: string;
  taskId?: string;
  phase?: string;
  confidenceBefore?: number;
  confidenceAfter?: number;
  executionTimeMs: number;
  exitCode: number;

  // Phase 4 cost tracking (only for Phase 4-generated skills)
  costAvoidedUsd?: number;
  tokensAvoided?: number;

  // Metadata
  approvalLevel?: string;
  phase4Generated?: boolean;
}

export async function logSkillExecution(metrics: SkillExecutionMetrics): Promise<void> {
  const sqliteDb = new Database('.claude/skills-database/skills.db');
  const postgresDb = new Pool({
    host: process.env.CFN_DB_HOST,
    database: process.env.CFN_DB_NAME
  });

  try {
    // Get skill ID from Skills DB
    const skillRecord = sqliteDb.prepare('SELECT id, phase4_pattern_id FROM skills WHERE name = ?')
      .get(metrics.skillName) as { id: number; phase4_pattern_id: number | null };

    if (!skillRecord) {
      console.warn(`Skill not found in database: ${metrics.skillName}`);
      return;
    }

    // 1. ALWAYS log to Skills DB (analytics for all skills)
    sqliteDb.prepare(`
      INSERT INTO skill_usage_log (
        agent_id, agent_type, skill_id, task_id, phase,
        loaded_at, confidence_before, confidence_after, execution_time_ms
      ) VALUES (?, ?, ?, ?, ?, datetime('now'), ?, ?, ?)
    `).run(
      metrics.agentId,
      metrics.agentType,
      skillRecord.id,
      metrics.taskId,
      metrics.phase,
      metrics.confidenceBefore,
      metrics.confidenceAfter,
      metrics.executionTimeMs
    );

    console.log(`✅ Logged to Skills DB: ${metrics.skillName}`);

    // 2. ONLY log to Phase 4 if skill was generated by Phase 4 (cost tracking)
    if (metrics.phase4Generated && metrics.costAvoidedUsd && skillRecord.phase4_pattern_id) {
      await postgresDb.query(`
        INSERT INTO skill_executions (
          skill_id, team_id, task_id, execution_time_ms, exit_code,
          cost_avoided_usd, tokens_avoided, timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      `, [
        skillRecord.phase4_pattern_id,  // Use Phase 4 pattern ID
        metrics.agentType,
        metrics.taskId,
        metrics.executionTimeMs,
        metrics.exitCode,
        metrics.costAvoidedUsd,
        metrics.tokensAvoided
      ]);

      console.log(`✅ Logged to Phase 4: ${metrics.skillName} (cost avoided: $${metrics.costAvoidedUsd})`);
    }
  } finally {
    sqliteDb.close();
    await postgresDb.end();
  }
}
```

**Usage in Agent Execution:**
```typescript
// After agent executes skill
await logSkillExecution({
  agentId: 'backend-dev-1',
  agentType: 'backend-developer',
  skillName: 'codified-npm-build-test',
  taskId: 'task-123',
  phase: 'loop3',
  confidenceBefore: 0.75,
  confidenceAfter: 0.88,
  executionTimeMs: 12000,
  exitCode: 0,

  // Phase 4 metrics (only if skill is Phase 4-generated)
  costAvoidedUsd: 0.0024,
  tokensAvoided: 5000,
  phase4Generated: true
});
```

**Data Correlation:**
- **Skills DB:** Track all skill usage for effectiveness analysis
- **Phase 4 DB:** Track cost savings only for Phase 4-generated skills
- **Correlation Key:** `task_id` links records across databases

---

### Integration Point C: Edge Case Feedback Loop

**Trigger:** Skill execution failure (exit code != 0)

**Action:** Capture edge case in Phase 4, trigger skill update, update Skills DB version

**Flow:**
1. Skill fails during agent execution
2. Phase 4 Edge Case Tracker captures failure
3. Recurring detection: ≥3 occurrences → generate skill update
4. Skill update proposal created (new version)
5. Expert review via Phase 4 approval workflow
6. If approved: propagate update to Skills DB

**Script:** `.claude/skills/workflow-codification/propagate-skill-update.sh`

```bash
#!/bin/bash
set -euo pipefail

# Called by Phase 4 when skill update is approved

SKILL_NAME="$1"
NEW_VERSION="$2"      # e.g., "1.0.1" (semantic version)
UPDATE_PATH="$3"      # Path to updated SKILL.md
EDGE_CASE_ID="$4"     # Phase 4 edge_cases.id

SKILLS_DB=".claude/skills-database/skills.db"
PHASE4_DB_HOST="${CFN_DB_HOST}"

echo "📦 Propagating skill update to Skills DB..."
echo "   Skill: $SKILL_NAME"
echo "   Version: $NEW_VERSION"
echo "   Edge Case: $EDGE_CASE_ID"

# 1. Calculate new content hash
NEW_HASH=$(sha256sum "$UPDATE_PATH" | awk '{print $1}')

# 2. Get current skill info
SKILL_ID=$(sqlite3 "$SKILLS_DB" "SELECT id FROM skills WHERE name='$SKILL_NAME';")
OLD_VERSION=$(sqlite3 "$SKILLS_DB" "SELECT version FROM skills WHERE name='$SKILL_NAME';")

echo "   Current Version: $OLD_VERSION → $NEW_VERSION"

# 3. Update Skills DB version
sqlite3 "$SKILLS_DB" <<EOF
UPDATE skills
SET version = '$NEW_VERSION',
    content_hash = '$NEW_HASH',
    content_path = '$UPDATE_PATH',
    updated_at = datetime('now')
WHERE name = '$SKILL_NAME';
EOF

echo "   ✅ Version updated in Skills DB"

# 4. Record approval for new version (auto-approved by Phase 4 edge case resolution)
sqlite3 "$SKILLS_DB" <<EOF
INSERT INTO approval_history (
  skill_id, version, approval_level, approver, decision, reasoning, timestamp
) VALUES (
  $SKILL_ID,
  '$NEW_VERSION',
  'auto',
  'phase4-edge-case-system',
  'approved',
  'Auto-approved skill update to resolve edge case #$EDGE_CASE_ID',
  datetime('now')
);
EOF

echo "   ✅ Approval recorded for version $NEW_VERSION"

# 5. Invalidate cache (force agents to reload on next spawn)
rm -f /tmp/skill-cache-*.json
echo "   ✅ Cache invalidated"

# 6. Update Phase 4 edge case status
psql -h "$PHASE4_DB_HOST" -c \
  "UPDATE edge_cases SET resolved=true WHERE id=$EDGE_CASE_ID;"

echo "   ✅ Phase 4 edge case marked as resolved"
echo ""
echo "✅ Skill update complete: $SKILL_NAME v$NEW_VERSION"
```

**Version Management:**
- **Patch version** (1.0.0 → 1.0.1): Edge case fix, auto-approved
- **Minor version** (1.0.0 → 1.1.0): Feature enhancement, requires approval
- **Major version** (1.0.0 → 2.0.0): Breaking change, requires expert review

---

## Combined Analytics Queries

### Query 1: Cost Savings Per Skill (Phase 4 + Skills DB)

```sql
-- Combine Skills DB usage with Phase 4 cost tracking

-- Step 1: Get usage from Skills DB (SQLite)
SELECT
  s.name,
  s.category,
  s.approval_level,
  COUNT(sul.id) AS usage_count,
  AVG(sul.confidence_after - sul.confidence_before) AS avg_confidence_delta
FROM skills s
JOIN skill_usage_log sul ON sul.skill_id = s.id
WHERE s.phase4_pattern_id IS NOT NULL  -- Only Phase 4 skills
GROUP BY s.name, s.category, s.approval_level;

-- Step 2: Get cost savings from Phase 4 (PostgreSQL)
SELECT
  wp.pattern_name,
  wp.deployed_skill_id,
  COUNT(se.id) AS total_executions,
  SUM(se.cost_avoided_usd) AS total_savings,
  AVG(se.execution_time_ms) AS avg_execution_time_ms
FROM workflow_patterns wp
JOIN skill_executions se ON se.skill_id = wp.id
WHERE wp.status = 'deployed'
GROUP BY wp.pattern_name, wp.deployed_skill_id;

-- Step 3: Application-level join (in TypeScript/CLI)
```

### Query 2: Skill Effectiveness (Skills DB Only)

```sql
-- Identify skills that improve agent confidence

SELECT
  s.name,
  s.category,
  s.approval_level,
  s.generated_by,
  COUNT(sul.id) AS usage_count,
  AVG(sul.confidence_after - sul.confidence_before) AS avg_confidence_delta,
  AVG(sul.execution_time_ms) AS avg_load_time_ms
FROM skills s
JOIN skill_usage_log sul ON sul.skill_id = s.id
WHERE sul.confidence_before IS NOT NULL
  AND sul.confidence_after IS NOT NULL
GROUP BY s.name, s.category, s.approval_level, s.generated_by
HAVING avg_confidence_delta > 0.05  -- Skills that improve confidence by ≥5%
ORDER BY avg_confidence_delta DESC;
```

### Query 3: Underperforming Skills (Combined)

```sql
-- Skills with high edge cases AND low confidence impact

-- Step 1: Get edge case counts (PostgreSQL)
SELECT skill_id, COUNT(*) AS edge_case_count
FROM edge_cases
WHERE resolved = false
GROUP BY skill_id;

-- Step 2: Get confidence impact (SQLite)
SELECT skill_id, AVG(confidence_after - confidence_before) AS avg_confidence_delta
FROM skill_usage_log
GROUP BY skill_id;

-- Step 3: Application-level join to identify:
-- Skills with edge_case_count > 5 AND avg_confidence_delta < 0.03
```

---

## Deployment Checklist

### Phase 4 Database Setup

```bash
# 1. Ensure PostgreSQL is running
pg_isready -h localhost

# 2. Create Phase 4 database (if not exists)
createdb cfn_workflow

# 3. Apply Phase 4 schema
psql -h localhost -d cfn_workflow -f docker/workflow-codification/schema.sql

# 4. Verify tables exist
psql -h localhost -d cfn_workflow -c "\dt"
# Expected: workflow_patterns, skill_executions, edge_cases, skill_approvals
```

### Skills DB Setup

```bash
# 1. Initialize Skills DB v2
./scripts/skills-db/init-database-v2.sh

# 2. Seed from filesystem
./scripts/skills-db/seed-from-filesystem.sh

# 3. Verify skills imported
sqlite3 .claude/skills-database/skills.db "SELECT COUNT(*) FROM skills;"
# Expected: 62 (existing skills) + 5 (bootstrap)
```

### Integration Testing

```bash
# 1. Test Phase 4 → Skills DB deployment
./tests/integration/test-phase4-deployment.sh

# 2. Test dual logging
./tests/integration/test-dual-logging.sh

# 3. Test edge case feedback loop
./tests/integration/test-edge-case-update.sh

# 4. Run full E2E test
./tests/integration/test-phase4-skills-db-e2e.sh
```

---

## Troubleshooting

### Issue: Phase 4 deployment fails

**Symptom:** `deploy-approved-skill.sh` exits with error

**Diagnosis:**
```bash
# Check Skills DB accessibility
sqlite3 .claude/skills-database/skills.db "SELECT 1;"

# Check PostgreSQL connection
psql -h $CFN_DB_HOST -c "SELECT 1;"

# Check skill content file exists
ls -la "$CONTENT_PATH"
```

**Solutions:**
1. Ensure Skills DB is initialized
2. Verify PostgreSQL credentials in `.env`
3. Check file paths are absolute, not relative

### Issue: Dual logging only logs to one database

**Symptom:** Skills DB has logs, but PostgreSQL `skill_executions` is empty

**Diagnosis:**
```bash
# Check if skill is Phase 4-generated
sqlite3 .claude/skills-database/skills.db \
  "SELECT name, phase4_pattern_id FROM skills WHERE name='$SKILL_NAME';"

# If phase4_pattern_id is NULL, skill is not Phase 4-generated (expected)
```

**Solution:** Only Phase 4-generated skills log to PostgreSQL. Static skills only log to SQLite.

### Issue: Edge case updates not propagating

**Symptom:** Phase 4 edge case resolved, but Skills DB version not updated

**Diagnosis:**
```bash
# Check Phase 4 edge case status
psql -h $CFN_DB_HOST -c "SELECT * FROM edge_cases WHERE id=$EDGE_CASE_ID;"

# Check Skills DB version
sqlite3 .claude/skills-database/skills.db \
  "SELECT name, version FROM skills WHERE name='$SKILL_NAME';"
```

**Solutions:**
1. Verify `propagate-skill-update.sh` is called by Phase 4
2. Check file permissions on updated SKILL.md
3. Manually trigger update: `./propagate-skill-update.sh "$SKILL_NAME" "1.0.1" "$UPDATE_PATH" "$EDGE_CASE_ID"`

---

## Performance Optimization

### Cache Invalidation Strategy

**Problem:** Cache invalidation adds latency to skill updates

**Solution:** Lazy cache invalidation with versioning
```typescript
// Instead of rm -f /tmp/skill-cache-*.json
// Use versioned cache keys

const cacheKey = `skill-${skillName}-v${version}`;
cache.set(cacheKey, content, { ttl: 3600 });

// Old versions expire naturally after 1 hour
// No need to invalidate on update
```

### Batch Deployments

**Problem:** Deploying 20 skills sequentially adds 20× latency

**Solution:** Batch insert into Skills DB
```bash
# Instead of 20 separate INSERT statements
# Use single transaction with multiple values

sqlite3 "$SKILLS_DB" <<EOF
BEGIN TRANSACTION;
INSERT INTO skills (...) VALUES (...);
INSERT INTO skills (...) VALUES (...);
-- ... (20 skills)
COMMIT;
EOF
```

---

## Security Considerations

### SQL Injection Prevention

**Risk:** Phase 4 pattern names or skill names could contain SQL injection

**Mitigation:**
```bash
# Escape single quotes before SQL insertion
SAFE_SKILL_NAME="${SKILL_NAME//\'/\'\'}"

sqlite3 "$SKILLS_DB" "INSERT INTO skills (name) VALUES ('$SAFE_SKILL_NAME');"
```

### Content Hash Validation

**Risk:** Skill content modified maliciously between Phase 4 and Skills DB

**Mitigation:**
```bash
# Always recalculate hash, don't trust Phase 4 hash
CONTENT_HASH=$(sha256sum "$CONTENT_PATH" | awk '{print $1}')

# Verify hash on load
if [[ "$STORED_HASH" != "$CONTENT_HASH" ]]; then
  echo "⚠️  Hash mismatch detected for $SKILL_NAME"
  # Log warning, but continue execution (non-blocking)
fi
```

---

**Document Status:** Integration Specification Complete
**Next Steps:**
1. Implement deployment scripts
2. Implement dual logging
3. Implement edge case propagation
4. Test end-to-end integration
