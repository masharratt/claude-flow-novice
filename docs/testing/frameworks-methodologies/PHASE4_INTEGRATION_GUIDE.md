# Phase 4 Integration Guide: Workflow Codification + Skills Database

## Overview

Phase 4 Workflow Codification is the workflow code generation and optimization system that automatically learns from agent execution patterns. The Skills Database is the persistent store for approved, versioned, and reusable workflows. This guide explains how Phase 4 and the Skills Database integrate to create a closed-loop learning system.

### Integration Architecture

```
Phase 4 Workflow Codification System
├─ Expert approves workflow pattern
├─ Risk assessment calculated
└─ Deployment triggered
    ↓
Skills Database System
├─ Skill record created
├─ Approval workflow managed
├─ Agent mappings generated
└─ Dual logging enabled
    ↓
PostgreSQL (Phase 4)
├─ Cost tracking
├─ ROI metrics
├─ Usage analytics
└─ Pattern effectiveness
    ↓
SQLite (Skills DB)
├─ Execution logs
├─ Performance metrics
├─ Compliance audit trail
└─ Skill versioning
```

### Key Integration Points

1. **Workflow → Skill Conversion**: Phase 4 workflows auto-convert to Skills DB records
2. **Dual Logging**: Execution metrics logged to both PostgreSQL and SQLite
3. **Risk Propagation**: Phase 4 risk assessment informs Skills DB approval level
4. **Version Management**: Skills Database owns version history; Phase 4 tracks ROI
5. **Feedback Loop**: Phase 4 edge case detection triggers Skills DB updates

---

## Auto-Deployment Workflow

### Prerequisites

Before enabling auto-deployment, verify:
- Phase 4 PostgreSQL database is configured and accessible
- Skills Database SQLite file is initialized with schema v2
- `deploy-approved-skill.sh` script is in place
- Team has trained expert approvers
- Rollback procedure is documented

### Step-by-Step Auto-Deployment Process

#### Step 1: Expert Approval in Phase 4

```bash
# Expert reviews workflow pattern in Phase 4 UI/CLI
# Decision made: Pattern is production-ready
# Input: workflow_id = "wf_payment_validation_v1"
# Status: APPROVED
```

**Decision Criteria:**
- Workflow solves real agent execution problem
- Pattern has been tested (>10 successful executions)
- Performance metrics acceptable
- No critical issues in execution logs
- Team consensus on solution

#### Step 2: Trigger Deployment

```bash
# Phase 4 system detects APPROVED status change
# Automatically calls deployment script
./scripts/phase4-integration/deploy-approved-skill.sh \
  --workflow-id "wf_payment_validation_v1" \
  --team-ids "team_payments,team_api" \
  --priority "high" \
  --conditions '{"environments":["production"]}' \
  --dry-run false
```

**Script Output:**
```
[deploy-approved-skill] Starting deployment
[deploy-approved-skill] Workflow ID: wf_payment_validation_v1
[deploy-approved-skill] Extracting skill content...
[deploy-approved-skill] Skill size: 2.3 KB
[deploy-approved-skill] Performing risk assessment...
[deploy-approved-skill] Risk score: 0.42 → ESCALATION level
[deploy-approved-skill] Creating database record...
[deploy-approved-skill] Skill ID: skill_wf_payment_validation_v1
[deploy-approved-skill] Creating agent mappings...
[deploy-approved-skill] Mapped to 8 agents
[deploy-approved-skill] Updating PostgreSQL status...
[deploy-approved-skill] Status: deployed
[deploy-approved-skill] Deployment complete in 1.8s
```

#### Step 3: Skill Content Extraction

```javascript
// Skills Database extracts and normalizes workflow
const skillExtraction = {
  source_workflow_id: "wf_payment_validation_v1",
  skill_id: "skill_wf_payment_validation_v1",
  skill_name: "payment_validation",
  skill_type: "workflow_pattern",
  content: {
    pattern: "validation_pipeline",
    implementation: "async_validation_with_retry",
    steps: [
      "validate_amount",
      "verify_gateway",
      "check_limits",
      "log_attempt"
    ],
    error_handling: "exponential_backoff"
  },
  source_system: "phase4",
  phase4_generated: true,
  created_from_workflow: {
    workflow_id: "wf_payment_validation_v1",
    execution_count: 45,
    success_rate: 0.989,
    avg_execution_time_ms: 142
  }
};
```

#### Step 4: Risk Assessment

```bash
# Skills DB calculates approval level based on:
# 1. Pattern type (workflow_pattern = 0.30 base)
# 2. Complexity from Phase 4 metrics (0.12)
# 3. Coverage from Phase 4 execution logs (0.00 - proven)
# 4. Integration complexity (0.00 - internal pattern)
# 5. System criticality (0.00 - isolated)

Risk Calculation:
- Base risk (workflow_pattern): 0.30
- Phase 4 complexity score: +0.12
- Coverage impact: +0.00 (proven in production)
- Total: 0.42

Approval Level: ESCALATION (0.30-0.60)
Expert Reviewer: @payments-team-lead
SLA: 48 hours (standard)
```

**Risk Categories:**
```
workflow_pattern (proven): 0.30-0.40 → Usually ESCALATION
new_integration: 0.50-0.70 → ESCALATION or HUMAN
security_pattern: 0.70-1.00 → HUMAN APPROVAL
infrastructure: 0.40-0.70 → ESCALATION
```

#### Step 5: Database Record Creation

```sql
-- Skills DB creates skill record
INSERT INTO skills (
  id,
  name,
  type,
  category,
  description,
  content,
  version,
  phase4_generated,
  phase4_workflow_id,
  approval_level,
  approval_status,
  created_at,
  created_by,
  metadata
) VALUES (
  'skill_wf_payment_validation_v1',
  'payment_validation',
  'workflow_pattern',
  'integration',
  'Validates payment amounts and gateway compatibility with exponential backoff retry',
  '{"pattern":"validation_pipeline",...}',
  '1.0.0',
  true,
  'wf_payment_validation_v1',
  'escalation',
  'pending_review',
  datetime('now'),
  'system',
  '{"phase4_metrics":{"success_rate":0.989,"avg_time_ms":142}}'
);

-- Create approval request
INSERT INTO approval_requests (
  id,
  skill_id,
  approval_level,
  request_status,
  risk_score,
  risk_breakdown,
  requested_at,
  requested_by,
  sla_expires_at
) VALUES (
  'apr_' || substr(hex(randomblob(8)),1,16),
  'skill_wf_payment_validation_v1',
  'escalation',
  'pending',
  0.42,
  '{"security":0.3,"complexity":0.12,"coverage":0.0,"deps":0.0,"criticality":0.0}',
  datetime('now'),
  'system',
  datetime('now', '+48 hours')
);
```

#### Step 6: Approval History Logging

```sql
-- Log approval request in audit trail
INSERT INTO approval_history (
  id,
  skill_id,
  approval_level,
  decision_date,
  reviewer_id,
  risk_score,
  security_weight,
  complexity_weight,
  coverage_weight,
  dependencies_weight,
  criticality_weight,
  decision_reasoning,
  escalation_triggers,
  approved_by,
  confidence,
  metadata
) VALUES (
  'aph_' || substr(hex(randomblob(8)),1,16),
  'skill_wf_payment_validation_v1',
  'escalation',
  datetime('now'),
  'system',
  0.42,
  0.3,
  0.12,
  0.0,
  0.0,
  0.0,
  'Phase 4 workflow codification pattern for payment validation with proven production metrics',
  '["phase4_origin","escalation_review_required"]',
  NULL,
  0.85,
  '{
    "phase4_workflow_id":"wf_payment_validation_v1",
    "execution_count":45,
    "success_rate":0.989,
    "auto_escalated_from":"phase4_analysis"
  }'
);
```

#### Step 7: Agent Mapping Creation

```sql
-- Create skill-to-agent mappings based on team_ids
INSERT INTO agent_skill_mappings (
  id,
  agent_id,
  skill_id,
  priority,
  conditions,
  enabled_at,
  created_at
) VALUES
  ('asm_agent_payments_1_skill_1', 'agent_payments_1', 'skill_wf_payment_validation_v1', 1, '{"environments":["production"]}', datetime('now'), datetime('now')),
  ('asm_agent_payments_2_skill_1', 'agent_payments_2', 'skill_wf_payment_validation_v1', 1, '{"environments":["production"]}', datetime('now'), datetime('now')),
  ('asm_agent_api_1_skill_1', 'agent_api_1', 'skill_wf_payment_validation_v1', 2, '{"environments":["production"]}', datetime('now'), datetime('now')),
  ... (8 total mappings for team_payments and team_api)
;

-- Mark mappings as active
UPDATE agent_skill_mappings
SET enabled_at = datetime('now')
WHERE skill_id = 'skill_wf_payment_validation_v1';
```

#### Step 8: PostgreSQL Status Update

```sql
-- Phase 4 PostgreSQL receives update from Skills DB
UPDATE phase4_workflows
SET
  status = 'deployed',
  deployed_at = datetime('now'),
  skills_db_id = 'skill_wf_payment_validation_v1',
  skills_db_approval_level = 'escalation',
  agent_count = 8,
  deployment_metadata = '{"dual_logging":true,"version":"1.0.0"}'
WHERE id = 'wf_payment_validation_v1';
```

---

## Dual Logging Architecture

### Purpose

Dual logging serves two distinct use cases:
1. **SQLite Logging** (Skills DB): Execution analytics, effectiveness metrics, compliance audit
2. **PostgreSQL Logging** (Phase 4): Cost tracking, ROI calculation, pattern effectiveness over time

### Dual Logging Data Flow

```
Agent Execution
    ↓
Skill Executed → skill_execution_logger.ts
    ├─ Is phase4_generated == true?
    ├─ YES: Log to both SQLite and PostgreSQL
    └─ NO: Log to SQLite only
         ↓
    SQLite Logging Chain:
    ├─ Write to skill_executions table
    ├─ Update effectiveness metrics
    ├─ Calculate confidence score
    └─ Trigger analytics queries
         ↓
    PostgreSQL Logging Chain (Phase4 only):
    ├─ Write to workflow_executions table
    ├─ Calculate execution cost
    ├─ Update ROI metrics
    └─ Trigger cost analysis
```

### Implementation Details

**skill-execution-logger.ts Schema:**

```typescript
interface SkillExecutionLog {
  // Required fields
  execution_id: string;
  skill_id: string;
  agent_id: string;
  timestamp: ISO8601DateTime;
  execution_time_ms: number;
  status: 'success' | 'failure' | 'timeout' | 'skipped';

  // Performance metrics
  memory_used_mb: number;
  cpu_usage_percent: number;

  // Outcome tracking
  result_summary: string;
  error_message?: string;
  exit_code: number;

  // Phase 4 tracking
  phase4_generated: boolean;
  phase4_workflow_id?: string;
  phase4_cost_usd?: number;

  // Confidence calculation
  confidence_score: number;
  effectiveness_indicator: 'positive' | 'neutral' | 'negative';

  // Environment context
  environment: 'production' | 'staging' | 'development';
  team_id: string;
  iteration_number?: number;
}
```

**Logging Implementation:**

```typescript
// .src/api/v1/skills/skill-execution-logger.ts

async function logSkillExecution(execution: SkillExecutionLog) {
  // 1. Validate execution data
  validateExecutionData(execution);

  // 2. Write to SQLite (always)
  const sqliteResult = await logToSQLite(execution);

  // 3. Check if Phase4-generated
  if (execution.phase4_generated && execution.phase4_workflow_id) {
    // 4. Write to PostgreSQL (async, fire-and-forget)
    logToPostgreSQLAsync(execution)
      .catch(error => {
        // Log PostgreSQL write failure but don't block
        console.error(`PostgreSQL write failed: ${error.message}`);
        // Mark as requiring retry
        markForPostgresRetry(execution);
      });
  }

  // 5. Return SQLite result to caller
  return {
    success: sqliteResult.success,
    execution_id: sqliteResult.execution_id,
    logged_to_sqlite: true,
    logged_to_postgres: execution.phase4_generated
  };
}

async function logToSQLite(execution: SkillExecutionLog) {
  return db.run(`
    INSERT INTO skill_executions (
      id, skill_id, agent_id, timestamp, execution_time_ms,
      status, memory_used_mb, cpu_usage_percent, result_summary,
      error_message, exit_code, phase4_generated, phase4_workflow_id,
      phase4_cost_usd, confidence_score, effectiveness_indicator,
      environment, team_id, iteration_number
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    execution.execution_id, execution.skill_id, execution.agent_id,
    execution.timestamp, execution.execution_time_ms,
    execution.status, execution.memory_used_mb, execution.cpu_usage_percent,
    execution.result_summary, execution.error_message, execution.exit_code,
    execution.phase4_generated, execution.phase4_workflow_id,
    execution.phase4_cost_usd, execution.confidence_score,
    execution.effectiveness_indicator, execution.environment,
    execution.team_id, execution.iteration_number
  ]);
}

async function logToPostgreSQLAsync(execution: SkillExecutionLog) {
  // Non-blocking async write to PostgreSQL
  return new Promise((resolve) => {
    setImmediate(async () => {
      try {
        await postgresDb.query(`
          INSERT INTO workflow_executions (
            id, workflow_id, agent_id, timestamp, execution_time_ms,
            status, cost_usd, confidence_score, effectiveness_indicator,
            environment, team_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [
          execution.execution_id, execution.phase4_workflow_id,
          execution.agent_id, execution.timestamp, execution.execution_time_ms,
          execution.status, execution.phase4_cost_usd,
          execution.confidence_score, execution.effectiveness_indicator,
          execution.environment, execution.team_id
        ]);
        resolve(true);
      } catch (error) {
        resolve(false);
      }
    });
  });
}
```

### Database Configuration

```bash
# .env configuration
CFN_SKILLS_DATABASE=true
CFN_SKILLS_DB_PATH=./.claude/skills-database/skills.db
CFN_DUAL_LOGGING_ENABLED=true

# PostgreSQL for Phase 4
PHASE4_POSTGRES_HOST=localhost
PHASE4_POSTGRES_PORT=5432
PHASE4_POSTGRES_DB=workflow_codification
PHASE4_POSTGRES_USER=phase4_writer
PHASE4_POSTGRES_PASSWORD=${PHASE4_DB_PASSWORD}

# Logging behavior
CFN_SKILL_LOG_RETENTION_DAYS=90
PHASE4_LOG_RETENTION_DAYS=730
CFN_ASYNC_LOG_BATCH_SIZE=50
CFN_ASYNC_LOG_FLUSH_INTERVAL_MS=5000
```

### Error Handling and Resilience

```bash
# Retry logic for failed PostgreSQL writes
./.claude/skills/dual-logging-retry/process-failed-logs.sh \
  --batch-size 100 \
  --max-retries 3 \
  --backoff-seconds 60

# Monitoring dual logging success
sqlite3 ./.claude/skills-database/skills.db \
  "SELECT
    COUNT(*) as total_logs,
    SUM(CASE WHEN phase4_generated THEN 1 ELSE 0 END) as phase4_logs,
    SUM(CASE WHEN logged_to_postgres THEN 1 ELSE 0 END) as postgres_success,
    ROUND(100.0 * SUM(CASE WHEN phase4_generated AND logged_to_postgres THEN 1 ELSE 0 END) /
          SUM(CASE WHEN phase4_generated THEN 1 ELSE 0 END), 2) as postgres_success_rate
  FROM skill_executions
  WHERE timestamp > datetime('now', '-24 hours');"
```

---

## Edge Case Feedback Loop

### Overview

When Phase 4 detects edge cases or identifies skill improvements through production usage, the feedback loop automatically propagates enhancements back to the Skills Database.

### Edge Case Detection Flow

```
Phase 4 Runtime
├─ Detect anomalous execution pattern
├─ Classify edge case severity
├─ Log to phase4.edge_cases table
└─ Trigger analysis job
    ↓
Edge Case Analysis
├─ Compare to historical patterns
├─ Calculate performance impact
├─ Identify root cause
└─ Recommend fix or variation
    ↓
Expert Review
├─ Validate analysis
├─ Approve proposed enhancement
└─ Trigger propagation
    ↓
Skills DB Update
├─ Create new version
├─ Update approval history
├─ Notify dependent agents
└─ Log propagation
```

### Edge Case Scenarios

**Example 1: Performance Degradation**
```
Detection:
- Execution time: 142ms → 500ms (average)
- Identified: PostgreSQL connection pool exhaustion
- Proposed fix: Increase pool size from 10 to 20

Phase 4:
- Logs edge case: "edge_perf_001_connection_pool"
- Severity: medium (affects 15% of executions)
- Expert review: APPROVED

Skills DB Propagation:
- Creates version 1.0.1
- Updates database connection config
- Increments minor version number
- Notifies all mapped agents
- Logs in approval_history with "edge_case_fix" tag
```

**Example 2: New Conditional Logic**
```
Detection:
- Payment amount > $10,000 requires additional verification
- Manual override: 8 times in past month
- Proposed enhancement: Add high-amount validation path

Phase 4:
- Logs edge case: "edge_logic_002_high_amount"
- Severity: high (manual intervention needed)
- Expert review: APPROVED

Skills DB Propagation:
- Creates version 1.1.0 (new feature)
- Adds conditional branch for $10,000 threshold
- Updates documentation
- Tests on staging environment
- Increments minor version number
- Deprecates v1.0.x when v1.1.0 stable
```

### Propagation Process

**Step 1: Edge Case Detection**

```bash
# Phase 4 job runs hourly
./.claude/skills/phase4-edge-case-detection/analyze-patterns.sh \
  --lookback-hours 24 \
  --anomaly-threshold 2.5 \
  --min-sample-size 100
```

**Step 2: Expert Review**

```sql
-- Edge case marked for review
INSERT INTO phase4_edge_cases (
  id, workflow_id, case_type, severity, detection_date,
  anomaly_metric, anomaly_value, proposed_fix, status
) VALUES (
  'edge_perf_001_connection_pool',
  'wf_payment_validation_v1',
  'performance_degradation',
  'medium',
  datetime('now'),
  'execution_time_ms',
  '500',
  '{"action":"increase_pool_size","current":10,"proposed":20}',
  'pending_review'
);

-- Expert approval (via Phase 4 UI or CLI)
UPDATE phase4_edge_cases
SET status = 'approved_for_propagation',
    approved_by = 'expert_id',
    approved_at = datetime('now')
WHERE id = 'edge_perf_001_connection_pool';
```

**Step 3: Propagate to Skills DB**

```bash
# Automated propagation trigger
./scripts/phase4-integration/propagate-skill-update.sh \
  --edge-case-id "edge_perf_001_connection_pool" \
  --workflow-id "wf_payment_validation_v1" \
  --update-type "bug_fix" \
  --version-increment "patch"
```

**Step 4: Version Update in Skills DB**

```sql
-- Current version: 1.0.0
-- Calculate new version based on update type

-- Create new version record
INSERT INTO skill_versions (
  id, skill_id, version_number, version_tag,
  content_changes, change_summary, update_type,
  propagated_from_edge_case, edge_case_id,
  created_at, status
) VALUES (
  'sv_skill_wf_payment_validation_v1_101',
  'skill_wf_payment_validation_v1',
  '1.0.1',
  'v1.0.1',
  '{"pool_size":{"from":10,"to":20}}',
  'Increase PostgreSQL connection pool to prevent timeout',
  'patch',
  true,
  'edge_perf_001_connection_pool',
  datetime('now'),
  'pending_approval'
);

-- Update skill to point to new version
UPDATE skills
SET version = '1.0.1',
    updated_at = datetime('now')
WHERE id = 'skill_wf_payment_validation_v1';

-- Log in approval history
INSERT INTO approval_history (
  id, skill_id, approval_level, decision_date,
  reviewer_id, risk_score, decision_reasoning,
  escalation_triggers, approved_by, confidence, metadata
) VALUES (
  'aph_edge_propagation_001',
  'skill_wf_payment_validation_v1',
  'escalation',
  datetime('now'),
  'system',
  0.25,  -- Lower risk for proven bug fix
  'Edge case propagation: Connection pool size increase',
  '["phase4_edge_case","production_hotfix"]',
  'expert_id',
  0.95,
  '{"edge_case_id":"edge_perf_001_connection_pool","version":"1.0.1"}'
);
```

### Versioning Strategy

**Version Format:** `MAJOR.MINOR.PATCH-PRERELEASE+METADATA`

**Examples:**
- `1.0.0` - Initial release
- `1.0.1` - Bug fixes (patch)
- `1.1.0` - New features (minor)
- `2.0.0` - Breaking changes (major)
- `1.0.0-beta.1` - Pre-release version
- `1.0.0+phase4.edge001` - Build metadata (Phase 4 origin)

**Increment Rules:**

| Update Type | Increment | Approval | SLA |
|---|---|---|---|
| Bug fix | Patch (1.0.0 → 1.0.1) | Expert escalation | 48 hours |
| New feature | Minor (1.0.0 → 1.1.0) | Human approval | 7 days |
| Breaking change | Major (1.0.0 → 2.0.0) | Director approval | 14 days |
| Security patch | Patch + urgent (1.0.0 → 1.0.1~sec) | Emergency SLA | 4 hours |

### Notification to Agents

```bash
# When new version available, notify mapped agents
./.claude/skills/agent-notification/notify-skill-update.sh \
  --skill-id "skill_wf_payment_validation_v1" \
  --new-version "1.0.1" \
  --agents "agent_payments_1,agent_payments_2,agent_api_1" \
  --notification-type "available_update" \
  --auto-upgrade-at-next-use true
```

---

## Troubleshooting

### Issue 1: deploy-approved-skill.sh Fails with "Database Locked"

**Error Message:**
```
[deploy-approved-skill] ERROR: database locked (attempt 1/3)
[deploy-approved-skill] ERROR: failed to acquire lock after 30 seconds
```

**Root Causes:**
1. Concurrent deployments running
2. Long-running query blocking write access
3. SQLite journal file corruption
4. Insufficient disk space

**Solutions:**

```bash
# Check for concurrent processes
ps aux | grep deploy-approved-skill

# Kill stale processes if needed
pkill -f deploy-approved-skill

# Check database integrity
sqlite3 ./.claude/skills-database/skills.db "PRAGMA integrity_check;"

# Rebuild database if corrupt
sqlite3 ./.claude/skills-database/skills.db "VACUUM;"

# Increase timeout in deployment script
# In deploy-approved-skill.sh:
# sqlite3_timeout=30 → sqlite3_timeout=60

# Verify disk space
df -h /home/user/claude-flow-novice/.claude/skills-database/
```

**Prevention:**
- Enable WAL mode (Write-Ahead Logging) for better concurrency
- Implement queuing system for deployments
- Monitor database lock wait times

---

### Issue 2: Dual Logging Only Writes to SQLite

**Symptom:**
```
SQLite: Records created successfully
PostgreSQL: No records written
Phase 4 ROI dashboard shows: No data
```

**Root Causes:**
1. PostgreSQL connection failed silently
2. `phase4_generated` flag not set correctly
3. PostgreSQL credentials invalid
4. Network connectivity issue

**Debugging Steps:**

```bash
# 1. Verify PostgreSQL connection
psql -h ${PHASE4_POSTGRES_HOST} -U ${PHASE4_POSTGRES_USER} \
  -d ${PHASE4_POSTGRES_DB} -c "SELECT 1;"

# 2. Check phase4_generated flag in SQLite
sqlite3 ./.claude/skills-database/skills.db \
  "SELECT
    COUNT(*) total,
    SUM(CASE WHEN phase4_generated THEN 1 ELSE 0 END) phase4_count
  FROM skill_executions;"

# 3. Enable debug logging
export CFN_SKILL_LOG_LEVEL=debug
./.claude/skills/dual-logging/test-dual-write.sh

# 4. Check PostgreSQL retry queue
sqlite3 ./.claude/skills-database/skills.db \
  "SELECT COUNT(*) FROM postgres_write_retry_queue;"

# 5. Manually retry failed writes
./.claude/skills/dual-logging-retry/process-failed-logs.sh --max-retries 3
```

**Resolution:**
```bash
# Update .env with correct credentials
PHASE4_POSTGRES_HOST=prod-postgres.example.com
PHASE4_POSTGRES_PASSWORD=<new_password>

# Restart logging service
pkill -f skill-execution-logger
npm start -- --service skill-execution-logger

# Verify connection
sleep 5
sqlite3 ./.claude/skills-database/skills.db \
  "SELECT COUNT(*) FROM skill_executions WHERE logged_to_postgres = true;"
```

---

### Issue 3: Skills Not Appearing for Agents

**Symptom:**
```
Skills DB shows: skill_wf_payment_validation_v1 exists
Agent queries show: No skill available
Agent logs: "No matching skills found"
```

**Root Causes:**
1. Agent mappings not created
2. Skill approval still pending
3. Skill approval level mismatch
4. Conditions not matching agent environment

**Debug Process:**

```bash
# 1. Verify skill exists and approved
sqlite3 ./.claude/skills-database/skills.db \
  "SELECT id, name, approval_status, approval_level
   FROM skills WHERE id = 'skill_wf_payment_validation_v1';"

# Expected output: approved | auto|escalation|human

# 2. Check agent mappings
sqlite3 ./.claude/skills-database/skills.db \
  "SELECT agent_id, priority, conditions, enabled_at
   FROM agent_skill_mappings
   WHERE skill_id = 'skill_wf_payment_validation_v1';"

# Expected output: 8+ rows with enabled_at != NULL

# 3. Verify conditions match agent environment
sqlite3 ./.claude/skills-database/skills.db \
  "SELECT
    asm.agent_id,
    asm.conditions,
    (SELECT team_id FROM agents WHERE id = asm.agent_id) as agent_team
   FROM agent_skill_mappings asm
   WHERE skill_id = 'skill_wf_payment_validation_v1';"

# 4. Check agent current environment
# Query Phase 4 system for agent environment metadata
```

**Resolution:**

```bash
# If approval_status = pending: Wait for approval or manually approve
sqlite3 ./.claude/skills-database/skills.db \
  "UPDATE skills SET approval_status = 'approved'
   WHERE id = 'skill_wf_payment_validation_v1';"

# If agent mappings missing: Recreate mappings
./scripts/phase4-integration/create-agent-mappings.sh \
  --skill-id "skill_wf_payment_validation_v1" \
  --team-ids "team_payments,team_api"

# If conditions mismatch: Update conditions
sqlite3 ./.claude/skills-database/skills.db \
  "UPDATE agent_skill_mappings
   SET conditions = json('{\"environments\":[\"production\",\"staging\"]}')
   WHERE skill_id = 'skill_wf_payment_validation_v1';"
```

---

### Issue 4: Approval Level Mismatch

**Symptom:**
```
Phase 4 says: escalation (0.42 risk)
Skills DB says: human (0.75 risk)
Expert review SLA: 48 hours vs 7 days
```

**Root Causes:**
1. Risk calculation formula inconsistency
2. Different input parameters
3. Version mismatch between systems
4. Conflicting policies

**Investigation:**

```bash
# 1. Get Phase 4 risk calculation
psql -h ${PHASE4_POSTGRES_HOST} -d ${PHASE4_POSTGRES_DB} \
  -c "SELECT workflow_id, risk_score, risk_breakdown
      FROM workflow_metrics
      WHERE workflow_id = 'wf_payment_validation_v1'
      ORDER BY calculated_at DESC LIMIT 1;"

# 2. Get Skills DB risk calculation
sqlite3 ./.claude/skills-database/skills.db \
  "SELECT skill_id, risk_score,
    json_extract(risk_breakdown, '$.security_weight') as security,
    json_extract(risk_breakdown, '$.complexity_weight') as complexity,
    json_extract(risk_breakdown, '$.coverage_weight') as coverage
   FROM approval_requests
   WHERE skill_id = 'skill_wf_payment_validation_v1'
   ORDER BY requested_at DESC LIMIT 1;"

# 3. Compare risk factors
echo "Verify: security_weight, complexity_weight, coverage_weight identical"
```

**Resolution:**

```bash
# Align risk calculations using common formula
# docs/APPROVAL_BEST_PRACTICES.md section "Risk Calculation Formula"

# Recalculate both systems
psql -h ${PHASE4_POSTGRES_HOST} -d ${PHASE4_POSTGRES_DB} \
  -c "SELECT * FROM recalculate_workflow_risk('wf_payment_validation_v1');"

sqlite3 ./.claude/skills-database/skills.db \
  "SELECT recalculate_skill_risk('skill_wf_payment_validation_v1');"

# Compare results - should now match within 0.05 tolerance
```

---

## Monitoring and Alerting

### Key Performance Metrics

**Deployment Metrics:**

| Metric | Target | Alert Threshold | Dashboard |
|---|---|---|---|
| Deployment success rate | >95% | <90% | Phase4Integration |
| Average deployment time | <2s | >5s | Phase4Integration |
| Failed deployments/day | <2 | >5 | Phase4Integration |
| Rollback required | <1% | >3% | Phase4Integration |

**Dual Logging Metrics:**

| Metric | Target | Alert Threshold | Dashboard |
|---|---|---|---|
| PostgreSQL write success rate | >99% | <95% | SkillsDBLogging |
| Average log latency | <100ms | >500ms | SkillsDBLogging |
| Retry queue depth | <50 | >1000 | SkillsDBLogging |
| Log data loss | 0% | any | SkillsDBLogging |

**Skills Database Metrics:**

| Metric | Target | Alert Threshold | Dashboard |
|---|---|---|---|
| Phase4 skill usage count | Trending up | Declining >20% | Phase4ROI |
| Skill effectiveness score | >0.8 | <0.5 | SkillsMetrics |
| Agent mapping coverage | >95% | <80% | AgentCoverage |
| Approval SLA compliance | >95% | <90% | ApprovalMetrics |

### Alert Configuration

```yaml
# monitoring/phase4-integration-alerts.yaml

alerts:
  - name: deployment_failure_rate
    metric: phase4_deployment_failures
    threshold: 5 # per day
    severity: critical
    notification: slack:#devops

  - name: dual_logging_divergence
    metric: postgres_write_success_rate
    threshold: 0.95
    severity: high
    notification: slack:#database-team

  - name: skill_approval_sla_miss
    metric: approval_sla_compliance
    threshold: 0.90
    severity: medium
    notification: slack:#approval-team

  - name: phase4_skill_low_effectiveness
    metric: phase4_skill_effectiveness
    threshold: 0.5
    severity: low
    notification: email:architect@example.com
```

### Monitoring Queries

```bash
# Check deployment success
sqlite3 ./.claude/skills-database/skills.db \
  "SELECT
    COUNT(*) as total_deployments,
    SUM(CASE WHEN deployment_status = 'success' THEN 1 ELSE 0 END) as successful,
    ROUND(100.0 * SUM(CASE WHEN deployment_status = 'success' THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate
  FROM deployments
  WHERE deployment_date > datetime('now', '-7 days');"

# Check dual logging health
sqlite3 ./.claude/skills-database/skills.db \
  "SELECT
    COUNT(*) as phase4_skills,
    SUM(CASE WHEN logged_to_postgres THEN 1 ELSE 0 END) as postgres_writes,
    ROUND(100.0 * SUM(CASE WHEN logged_to_postgres THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate
  FROM skill_executions
  WHERE phase4_generated = true
    AND timestamp > datetime('now', '-24 hours');"

# Check Phase4 skill effectiveness
psql -h ${PHASE4_POSTGRES_HOST} -d ${PHASE4_POSTGRES_DB} \
  -c "SELECT workflow_id, success_rate, confidence_score, usage_count
      FROM workflow_metrics
      WHERE last_updated > now() - interval '7 days'
      ORDER BY success_rate DESC;"
```

---

## Testing

### Integration Test Checklist

Before deploying Phase 4 integration to production:

**Deployment Tests:**
- [ ] `deploy-approved-skill.sh` executes without errors
- [ ] Skills DB record created with correct data
- [ ] Approval request created with correct risk score
- [ ] Agent mappings created for all team members
- [ ] PostgreSQL status updated correctly
- [ ] Rollback procedure tested and works
- [ ] Error handling tested (network failure, database lock)

**Dual Logging Tests:**
- [ ] Execution logged to SQLite correctly
- [ ] Execution logged to PostgreSQL correctly
- [ ] `phase4_generated` flag controls logging path
- [ ] Async writes complete within timeout
- [ ] Failed PostgreSQL writes queued for retry
- [ ] Retry mechanism works and completes

**Agent Mapping Tests:**
- [ ] Agents can query mapped skills
- [ ] Skill conditions filter correctly
- [ ] Priority levels respected
- [ ] Multiple team assignments work
- [ ] Skill updates reflected in agent queries

**Edge Case Tests:**
- [ ] Phase 4 detects anomalies correctly
- [ ] Edge case analysis produces valid recommendations
- [ ] Skill version increments correctly
- [ ] New versions available to agents
- [ ] Backward compatibility maintained

**Integration Tests:**
- [ ] End-to-end: approval → deployment → usage → logging
- [ ] Multi-team skill sharing works
- [ ] Version upgrades smooth and non-breaking
- [ ] Approval SLA tracking accurate

### Test Script

```bash
# tests/e2e/test-phase4-integration.sh
#!/bin/bash
set -euo pipefail

echo "=== Phase 4 Integration Test Suite ==="

# 1. Deployment test
echo "Test 1: Deployment flow..."
./scripts/phase4-integration/deploy-approved-skill.sh \
  --workflow-id "wf_test_payment_validation" \
  --team-ids "team_payments" \
  --dry-run false
echo "✓ Deployment successful"

# 2. Dual logging test
echo "Test 2: Dual logging..."
./scripts/phase4-integration/test-dual-logging.sh
echo "✓ Dual logging verified"

# 3. Agent mapping test
echo "Test 3: Agent mappings..."
sqlite3 ./.claude/skills-database/skills.db \
  "SELECT COUNT(*) FROM agent_skill_mappings WHERE skill_id LIKE 'skill_wf_test%';"
echo "✓ Agent mappings created"

# 4. Edge case propagation test
echo "Test 4: Edge case propagation..."
./scripts/phase4-integration/test-edge-case-propagation.sh
echo "✓ Edge case propagation works"

echo "=== All tests passed ==="
```

---

## Production Deployment Checklist

**Before Enabling Phase 4 Integration:**

- [ ] Phase 4 PostgreSQL configured and tested
- [ ] Skills Database SQLite schema v2 deployed
- [ ] `deploy-approved-skill.sh` script tested
- [ ] `skill-execution-logger.ts` deployed to production
- [ ] `propagate-skill-update.sh` tested
- [ ] Monitoring dashboard created
- [ ] Alerting configured and tested
- [ ] Dual logging retry mechanism deployed
- [ ] Team trained on approval workflow
- [ ] Rollback procedure documented and tested
- [ ] Disaster recovery plan documented
- [ ] On-call rotation configured
- [ ] Integration tests passing
- [ ] Load testing passed (expected Phase 4 generation rate)
- [ ] Security review completed
- [ ] Compliance requirements verified
- [ ] Audit trail configured for 7-year retention

**Rollback Procedure:**

```bash
# If critical issues arise:
# 1. Stop new deployments
pkill -f deploy-approved-skill

# 2. Disable dual logging
export CFN_DUAL_LOGGING_ENABLED=false

# 3. Disable Phase 4 skill generation
psql -h ${PHASE4_POSTGRES_HOST} -d ${PHASE4_POSTGRES_DB} \
  -c "UPDATE phase4_settings SET integration_enabled = false;"

# 4. Restore previous version of affected skills
sqlite3 ./.claude/skills-database/skills.db \
  "SELECT restore_skill_version('skill_id', 'previous_version');"

# 5. Notify team and conduct post-mortem
```

---

## Summary

The Phase 4 + Skills Database integration enables:
1. **Automatic workflow codification** → Proven patterns become reusable skills
2. **Risk-aware approval** → Security first, speed for proven patterns
3. **Dual logging** → Cost tracking (Phase 4) + effectiveness analytics (Skills DB)
4. **Feedback loop** → Edge cases auto-propagate as skill improvements
5. **Version management** → Skills mature through iterations

**Success Metrics:**
- Phase 4 skill deployment success rate: >95%
- Dual logging success rate: >99%
- Time from approval to agent availability: <5 minutes
- Edge case detection and propagation: <72 hours

For operational issues or escalations, contact the DevOps and Architecture teams.
