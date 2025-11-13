# Phase 3: Workflow Codification System - Architecture

**Version:** 3.0.0
**Status:** DRAFT
**Dependencies:** Phase 1 (Corporate Organization), Phase 2 (Playbook-Driven Architecture)
**Date:** 2025-11-12

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Component Architecture](#2-component-architecture)
3. [Data Architecture](#3-data-architecture)
4. [Deployment Architecture](#4-deployment-architecture)
5. [Skill Lifecycle](#5-skill-lifecycle)
6. [Integration Points](#6-integration-points)
7. [Performance Architecture](#7-performance-architecture)
8. [Security Architecture](#8-security-architecture)

---

## 1. System Architecture Overview

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 3: WORKFLOW CODIFICATION SYSTEM                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────────────┐
│  PHASE 2: ACE PLAYBOOK SYSTEM                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │  PostgreSQL (context_reflections table)                                 │  │
│  │  - Stores lessons from completed tasks                                  │  │
│  │  - Includes workflow_steps, tags, domain, confidence                    │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     │ Weekly Query (90-day window)
                                     ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│  PATTERN ANALYZER (Batch Processing)                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │  .claude/skills/workflow-codification/analyze-patterns.sh               │  │
│  │  - Queries ACE reflections (≥5 occurrences, ≥85% similarity)            │  │
│  │  - Calculates deterministic flag, confidence, cost savings              │  │
│  │  - Stores in workflow_patterns table                                    │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     │ High priority patterns
                                     ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│  SKILL GENERATOR (Ephemeral AI Agent)                                         │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │  Agent Type: skill-generator                                            │  │
│  │  Spawned by: Main Coordinator (on-demand)                               │  │
│  │  Generates:                                                              │  │
│  │    - execute.sh (main skill script)                                     │  │
│  │    - validate.sh (parameter validation)                                 │  │
│  │    - test.sh (test suite with edge cases)                               │  │
│  │    - SKILL.md (documentation)                                            │  │
│  │    - edge-cases.json (known edge cases)                                 │  │
│  │    - metadata.json (skill metadata)                                     │  │
│  │  Output: Staging repository (git branch)                                │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     │ Skill package generated
                                     ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│  APPROVAL WORKFLOW ENGINE                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │  .claude/skills/workflow-codification/approval-workflow.sh              │  │
│  │  - Notifies team expert (email + Slack)                                 │  │
│  │  - Tracks approval state (PENDING_REVIEW → APPROVED/REJECTED/CORRECTING)│  │
│  │  - SLA monitoring (48h high priority, 7 days medium/low)                │  │
│  │  - Handles corrections (feedback loop to skill generator)               │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     │ Expert approves
                                     ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│  SKILL DEPLOYMENT PIPELINE                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │  .claude/skills/workflow-codification/deploy-skill.sh                   │  │
│  │  - Moves skill from staging → production                                │  │
│  │  - Git merge (branch → main)                                            │  │
│  │  - Updates metadata (deployed_at, status)                               │  │
│  │  - Notifies affected teams                                              │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     │ Skill available
                                     ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│  PHASE 1: TEAM COORDINATOR (Runtime Decision)                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │  FOR EACH task:                                                          │  │
│  │    1. Check if codified skill exists (FindMatchingSkill)                │  │
│  │    2. Calculate similarity (≥80% threshold)                             │  │
│  │    3. IF match: Execute skill script (30s timeout)                      │  │
│  │    4. IF no match OR failure: Spawn ephemeral AI agent (Phase 2)        │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────────┘
                                     │
                      ┌──────────────┴──────────────┐
                      │                             │
                      ▼ Success                     ▼ Failure
┌─────────────────────────────────────┐  ┌─────────────────────────────────────┐
│  COST TRACKING ENGINE               │  │  EDGE CASE TRACKER                  │
│  ┌───────────────────────────────┐  │  │  ┌───────────────────────────────┐  │
│  │  track-cost-savings.sh        │  │  │  │  track-edge-case.sh           │  │
│  │  - Log execution              │  │  │  │  - Capture failure details    │  │
│  │  - Calculate cost avoided     │  │  │  │  - Classify severity          │  │
│  │  - Update total_savings       │  │  │  │  - Increment occurrence count │  │
│  └───────────────────────────────┘  │  │  └───────────────────────────────┘  │
└─────────────────────────────────────┘  └─────────────────────────────────────┘
                                                        │
                                                        │ ≥3 occurrences
                                                        ▼
                                         ┌─────────────────────────────────────┐
                                         │  SKILL UPDATE PROPOSAL AGENT        │
                                         │  ┌───────────────────────────────┐  │
                                         │  │  skill-update-generator       │  │
                                         │  │  - Reads current skill        │  │
                                         │  │  - Reads edge case details    │  │
                                         │  │  - Generates updated skill    │  │
                                         │  │  - Increments version (patch) │  │
                                         │  └───────────────────────────────┘  │
                                         └─────────────────────────────────────┘
                                                        │
                                                        │ Back to Approval Workflow
                                                        ▼
                                         [Expert Review for Skill Update]
```

---

## 2. Component Architecture

### 2.1 Pattern Analyzer Component

**Location:** `.claude/skills/workflow-codification/analyze-patterns.sh`

**Execution:** Weekly cron job (Monday 9 AM)

**Inputs:**
- PostgreSQL `context_reflections` table (90-day window)

**Processing:**
```bash
#!/bin/bash
# analyze-patterns.sh

set -euo pipefail

# Configuration
readonly DB_HOST="${CFN_POSTGRES_HOST}"
readonly DB_NAME="cfn_corporate"
readonly WINDOW_DAYS=90
readonly MIN_OCCURRENCES=5
readonly MIN_SIMILARITY=0.85

# STEP 1: Query reflections
psql -h "$DB_HOST" -d "$DB_NAME" -c "
  SELECT
    id,
    task_id,
    team_id,
    content,
    workflow_steps,
    confidence,
    created_at,
    json_extract(metadata, '$.tags') as tags,
    json_extract(metadata, '$.domain') as domain
  FROM context_reflections
  WHERE
    created_at > NOW() - INTERVAL '${WINDOW_DAYS} days' AND
    confidence >= 0.75 AND
    json_array_length(workflow_steps) >= 2
  ORDER BY created_at DESC
" --csv > /tmp/reflections.csv

# STEP 2: Group by workflow signature (Python script)
python3 ./.claude/skills/workflow-codification/lib/group-workflows.py \
  --input /tmp/reflections.csv \
  --output /tmp/workflow-groups.json \
  --min-occurrences "$MIN_OCCURRENCES" \
  --min-similarity "$MIN_SIMILARITY"

# STEP 3: Store patterns in database
python3 ./.claude/skills/workflow-codification/lib/store-patterns.py \
  --input /tmp/workflow-groups.json \
  --db-host "$DB_HOST" \
  --db-name "$DB_NAME"

# STEP 4: Trigger skill generation for high-priority patterns
psql -h "$DB_HOST" -d "$DB_NAME" -t -c "
  SELECT id FROM workflow_patterns
  WHERE status = 'DETECTED' AND priority = 'high'
" | while read -r pattern_id; do
  # Spawn skill generator agent
  ./.claude/skills/workflow-codification/spawn-skill-generator.sh \
    --pattern-id "$pattern_id"
done

# STEP 5: Generate report
python3 ./.claude/skills/workflow-codification/lib/generate-pattern-report.py \
  --db-host "$DB_HOST" \
  --db-name "$DB_NAME" \
  --output docs/WORKFLOW_PATTERNS_REPORT.md

echo "Pattern analysis complete"
```

**Outputs:**
- `workflow_patterns` table records
- `docs/WORKFLOW_PATTERNS_REPORT.md` report
- Skill generator agent spawns (high priority patterns)

**Performance:**
- Execution time: 30-120 seconds (depends on reflection count)
- PostgreSQL query time: 5-15 seconds
- Python processing: 20-100 seconds

---

### 2.2 Skill Generator Component (AI Agent)

**Agent Type:** `skill-generator`

**Spawning:** On-demand (triggered by pattern analyzer or manual invocation)

**Context Injection:**
```bash
# spawn-skill-generator.sh

PATTERN_ID="$1"

# Retrieve pattern details
PATTERN=$(psql -h "$DB_HOST" -d "$DB_NAME" -t -c "
  SELECT row_to_json(t) FROM (
    SELECT * FROM workflow_patterns WHERE id = '$PATTERN_ID'
  ) t
")

# Retrieve related reflections
REFLECTIONS=$(psql -h "$DB_HOST" -d "$DB_NAME" -t -c "
  SELECT json_agg(t) FROM (
    SELECT content, workflow_steps, metadata
    FROM context_reflections
    WHERE
      tags && (SELECT tags FROM workflow_patterns WHERE id = '$PATTERN_ID')::TEXT[] AND
      created_at > NOW() - INTERVAL '90 days'
    LIMIT 20
  ) t
")

# Build prompt
PROMPT=$(cat <<EOF
# Skill Generation Task

Generate a complete CFN skill package from the following workflow pattern.

## Pattern Details
$PATTERN

## Historical Context (ACE Reflections)
$REFLECTIONS

## Requirements
[... detailed requirements from SPECIFICATION.md ...]

## Output Format
Provide each file as a code block with filename header.
EOF
)

# Spawn ephemeral agent (Phase 2 integration)
npx claude-flow-novice agent-spawn \
  --agent-type "skill-generator" \
  --task-prompt "$PROMPT" \
  --context-file /tmp/pattern-context.json \
  --output-file /tmp/skill-output.txt \
  --on-complete "./.claude/skills/workflow-codification/on-skill-generated.sh" \
  --auto-remove
```

**Agent Lifecycle:**
1. **SPAWN:** Agent spawned with pattern + reflections context
2. **LOAD_CONTEXT:** Loads pattern details and historical reflections
3. **EXECUTE:** Generates skill files (execute.sh, test.sh, SKILL.md, etc.)
4. **VALIDATE:** Self-validates generated scripts (shellcheck)
5. **OUTPUT:** Writes skill package to structured output
6. **COMPLETE:** Triggers callback (on-skill-generated.sh)
7. **CLEANUP:** Container auto-removed (ephemeral)

**Timing:**
- Spawn → Load Context: 5-10s
- Generate Skill Files: 60-90s (AI generation)
- Validation: 5-10s
- Total: 70-110s

---

### 2.3 Approval Workflow Component

**Location:** `.claude/skills/workflow-codification/approval-workflow.sh`

**State Machine:**

```
DETECTED
    │
    ▼
GENERATING (Skill generator spawned)
    │
    ├─> GENERATION_FAILED (Validation errors) [Terminal]
    │
    ▼
PENDING_REVIEW (Expert notified)
    │
    ├─> APPROVED ──> DEPLOYING ──> DEPLOYED [Terminal]
    │                    │
    │                    └─> DEPLOYMENT_FAILED (Retry or escalate)
    │
    ├─> REJECTED ──> ARCHIVED [Terminal]
    │
    └─> NEEDS_CORRECTION ──> CORRECTING ──> [Back to PENDING_REVIEW]
```

**Notification System:**

**Email Template:**
```bash
# send-approval-email.sh

EXPERT_EMAIL="$1"
PATTERN_ID="$2"
SKILL_ID="$3"

PATTERN=$(psql -h "$DB_HOST" -d "$DB_NAME" -t -c "
  SELECT pattern_name, priority, estimated_savings_usd
  FROM workflow_patterns WHERE id = '$PATTERN_ID'
")

SUBJECT="[CFN] New Skill Ready for Review: $(echo $PATTERN | cut -f1)"

BODY=$(cat <<EOF
Hi $(get-expert-name "$EXPERT_EMAIL"),

A new skill has been generated and is ready for your review:

Skill: $(echo $PATTERN | cut -f1)
Priority: $(echo $PATTERN | cut -f2)
Estimated Savings: \$$(echo $PATTERN | cut -f3)/month

Review at: .claude/skills/staging/codified-${SKILL_ID}/

Actions:
  Approve:  ./.claude/skills/workflow-codification/review-skill.sh --skill-id "$SKILL_ID" --action approve
  Reject:   ./.claude/skills/workflow-codification/review-skill.sh --skill-id "$SKILL_ID" --action reject --feedback "reason"
  Correct:  ./.claude/skills/workflow-codification/review-skill.sh --skill-id "$SKILL_ID" --action correct --feedback "changes needed"

SLA: 48 hours (high priority) or 7 days (medium/low)

Thank you,
CFN Workflow Codification System
EOF
)

# Send email
echo "$BODY" | mail -s "$SUBJECT" "$EXPERT_EMAIL"
```

**Slack Integration:**
```bash
# send-slack-notification.sh

CHANNEL="$1"
SKILL_ID="$2"
EXPERT_HANDLE="$3"

MESSAGE=$(cat <<EOF
{
  "channel": "$CHANNEL",
  "text": "🤖 New Skill Ready for Review",
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "🤖 New Skill Ready for Review"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Skill:* $(get-skill-name $SKILL_ID)\n*Priority:* $(get-skill-priority $SKILL_ID)\n*Savings:* \$$(get-skill-savings $SKILL_ID)/month"
      }
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {"type": "plain_text", "text": "✅ Approve"},
          "value": "approve_$SKILL_ID",
          "action_id": "approve_skill"
        },
        {
          "type": "button",
          "text": {"type": "plain_text", "text": "❌ Reject"},
          "value": "reject_$SKILL_ID",
          "action_id": "reject_skill",
          "style": "danger"
        },
        {
          "type": "button",
          "text": {"type": "plain_text", "text": "🔄 Request Correction"},
          "value": "correct_$SKILL_ID",
          "action_id": "correct_skill"
        }
      ]
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": "cc: <@$EXPERT_HANDLE>"
        }
      ]
    }
  ]
}
EOF
)

curl -X POST -H 'Content-type: application/json' \
  --data "$MESSAGE" \
  "$SLACK_WEBHOOK_URL"
```

**SLA Monitoring:**
```bash
# sla-monitor.sh (Cron: every 6 hours)

# Check for pending reviews exceeding SLA
psql -h "$DB_HOST" -d "$DB_NAME" -t -c "
  SELECT pattern_id, skill_id, expert_id, priority, created_at
  FROM approval_requests
  WHERE
    status = 'PENDING_REVIEW' AND
    (
      (priority = 'high' AND created_at < NOW() - INTERVAL '48 hours') OR
      (priority != 'high' AND created_at < NOW() - INTERVAL '7 days')
    )
" | while IFS='|' read -r pattern_id skill_id expert_id priority created_at; do
  # Escalate to Product Owner
  escalate-to-product-owner \
    --pattern-id "$pattern_id" \
    --skill-id "$skill_id" \
    --expert-id "$expert_id" \
    --priority "$priority" \
    --pending-since "$created_at"
done
```

---

### 2.4 Skill Deployment Component

**Location:** `.claude/skills/workflow-codification/deploy-skill.sh`

**Deployment Process:**
```bash
#!/bin/bash
# deploy-skill.sh

set -euo pipefail

SKILL_ID="$1"
PATTERN_ID="$2"

# STEP 1: Retrieve skill paths
STAGING_PATH=".claude/skills/staging/codified-${SKILL_ID}/"
PRODUCTION_PATH=".claude/skills/codified-${SKILL_ID}/"

# STEP 2: Validate skill is in staging
if [[ ! -d "$STAGING_PATH" ]]; then
  echo "Error: Staging skill not found: $STAGING_PATH"
  exit 1
fi

# STEP 3: Run final tests
echo "Running final tests..."
bash "${STAGING_PATH}test.sh"

if [[ $? -ne 0 ]]; then
  echo "Error: Tests failed, cannot deploy"
  exit 1
fi

# STEP 4: Move to production
echo "Deploying skill to production..."
mv "$STAGING_PATH" "$PRODUCTION_PATH"

# STEP 5: Git operations
GIT_BRANCH="skill/${SKILL_ID}"
git checkout main
git merge "$GIT_BRANCH" --no-ff -m "Deploy skill: $SKILL_ID"
git branch -d "$GIT_BRANCH"
git push origin main

# STEP 6: Update metadata
METADATA_FILE="${PRODUCTION_PATH}metadata.json"
jq '.deployed_at = now | .status = "DEPLOYED"' "$METADATA_FILE" > /tmp/metadata.json
mv /tmp/metadata.json "$METADATA_FILE"

# STEP 7: Update database
psql -h "$DB_HOST" -d "$DB_NAME" -c "
  UPDATE workflow_patterns
  SET
    status = 'DEPLOYED',
    production_path = '$PRODUCTION_PATH',
    deployed_at = NOW()
  WHERE id = '$PATTERN_ID'
"

# STEP 8: Notify affected teams
TEAMS=$(psql -h "$DB_HOST" -d "$DB_NAME" -t -c "
  SELECT unnest(teams_affected) FROM workflow_patterns WHERE id = '$PATTERN_ID'
")

for team in $TEAMS; do
  notify-team \
    --team-id "$team" \
    --message "New skill deployed: $(basename $PRODUCTION_PATH) at $PRODUCTION_PATH"
done

echo "Skill deployed successfully: $PRODUCTION_PATH"
```

---

### 2.5 Edge Case Tracker Component

**Location:** `.claude/skills/workflow-codification/track-edge-case.sh`

**Invocation:** Team Coordinator (after skill execution failure)

**Processing:**
```bash
#!/bin/bash
# track-edge-case.sh

set -euo pipefail

# Parse arguments
SKILL_ID=""
TASK_ID=""
TEAM_ID=""
EXIT_CODE=""
INPUT_PARAMS=""
EXPECTED_OUTPUT=""
ACTUAL_OUTPUT=""
STDERR=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skill-id) SKILL_ID="$2"; shift 2 ;;
    --task-id) TASK_ID="$2"; shift 2 ;;
    --team-id) TEAM_ID="$2"; shift 2 ;;
    --exit-code) EXIT_CODE="$2"; shift 2 ;;
    --input-params) INPUT_PARAMS="$2"; shift 2 ;;
    --expected-output) EXPECTED_OUTPUT="$2"; shift 2 ;;
    --actual-output) ACTUAL_OUTPUT="$2"; shift 2 ;;
    --stderr) STDERR="$2"; shift 2 ;;
    *) echo "Unknown argument: $1"; exit 1 ;;
  esac
done

# STEP 1: Classify severity
SEVERITY="low"
if echo "$STDERR" | grep -iE "(security|unauthorized|corruption|data loss)"; then
  SEVERITY="critical"
elif [[ $EXIT_CODE -ge 100 ]] || echo "$STDERR" | grep -iE "(fatal|panic|abort)"; then
  SEVERITY="high"
elif [[ $EXIT_CODE -ge 10 ]] || echo "$STDERR" | grep -iE "(error|failed|exception)"; then
  SEVERITY="medium"
fi

# STEP 2: Extract failure reason
FAILURE_REASON=$(echo "$STDERR" | head -n1 | cut -c1-200)

# STEP 3: Check for existing edge case (UPSERT)
psql -h "$DB_HOST" -d "$DB_NAME" -c "
  INSERT INTO edge_cases (
    skill_id,
    task_id,
    team_id,
    failure_reason,
    input_parameters,
    expected_output,
    actual_output,
    stack_trace,
    severity,
    occurrence_count,
    resolved,
    first_seen,
    last_seen
  )
  VALUES (
    '$SKILL_ID',
    '$TASK_ID',
    '$TEAM_ID',
    '$FAILURE_REASON',
    '$INPUT_PARAMS'::jsonb,
    '$EXPECTED_OUTPUT',
    '$ACTUAL_OUTPUT',
    '$STDERR',
    '$SEVERITY',
    1,
    FALSE,
    NOW(),
    NOW()
  )
  ON CONFLICT (skill_id, failure_reason, input_parameters)
  DO UPDATE SET
    occurrence_count = edge_cases.occurrence_count + 1,
    last_seen = NOW()
  RETURNING id, occurrence_count
"

# STEP 4: Check if threshold reached (≥3 occurrences)
EDGE_CASE_ID=$(psql -h "$DB_HOST" -d "$DB_NAME" -t -c "
  SELECT id FROM edge_cases
  WHERE skill_id = '$SKILL_ID' AND failure_reason = '$FAILURE_REASON'
")

OCCURRENCE_COUNT=$(psql -h "$DB_HOST" -d "$DB_NAME" -t -c "
  SELECT occurrence_count FROM edge_cases WHERE id = '$EDGE_CASE_ID'
")

if [[ $OCCURRENCE_COUNT -ge 3 ]]; then
  echo "Edge case threshold reached (≥3), proposing skill update..."
  ./.claude/skills/workflow-codification/propose-skill-update.sh \
    --skill-id "$SKILL_ID" \
    --edge-case-id "$EDGE_CASE_ID"
fi

echo "Edge case tracked: $EDGE_CASE_ID (occurrence: $OCCURRENCE_COUNT)"
```

---

### 2.6 Cost Tracking Component

**Location:** `.claude/skills/workflow-codification/track-cost-savings.sh`

**Invocation:** Team Coordinator (after successful skill execution)

**Processing:**
```bash
#!/bin/bash
# track-cost-savings.sh

set -euo pipefail

SKILL_ID="$1"
TEAM_ID="$2"
TASK_ID="$3"
EXECUTION_TIME_MS="$4"
EXIT_CODE="$5"

# Constants
readonly AI_INPUT_TOKENS=5000
readonly AI_OUTPUT_TOKENS=2000
readonly TOKEN_COST_PER_MILLION=0.50
readonly SCRIPT_COST=0.0001

# Calculate cost avoided
TOTAL_TOKENS=$((AI_INPUT_TOKENS + AI_OUTPUT_TOKENS))
AI_COST=$(echo "scale=6; ($TOTAL_TOKENS / 1000000) * $TOKEN_COST_PER_MILLION" | bc)
COST_AVOIDED=$(echo "scale=6; $AI_COST - $SCRIPT_COST" | bc)

# Insert execution log
psql -h "$DB_HOST" -d "$DB_NAME" -c "
  INSERT INTO skill_executions (
    skill_id,
    team_id,
    task_id,
    execution_time_ms,
    exit_code,
    cost_avoided_usd,
    tokens_avoided,
    timestamp
  )
  VALUES (
    '$SKILL_ID',
    '$TEAM_ID',
    '$TASK_ID',
    $EXECUTION_TIME_MS,
    $EXIT_CODE,
    $COST_AVOIDED,
    $TOTAL_TOKENS,
    NOW()
  )
"

# Update total savings in pattern
psql -h "$DB_HOST" -d "$DB_NAME" -c "
  UPDATE workflow_patterns
  SET
    total_executions = total_executions + 1,
    total_savings_usd = total_savings_usd + $COST_AVOIDED
  WHERE id = (SELECT pattern_id FROM skill_metadata WHERE skill_id = '$SKILL_ID')
"

echo "Cost tracking logged: \$${COST_AVOIDED} saved"
```

---

## 3. Data Architecture

### 3.1 Database Schema (PostgreSQL)

```sql
-- ============================================================================
-- WORKFLOW PATTERNS TABLE
-- ============================================================================
CREATE TABLE workflow_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pattern_name VARCHAR(255) NOT NULL UNIQUE,
    workflow_steps JSONB NOT NULL,           -- ["step1", "step2", ...]
    occurrence_count INTEGER NOT NULL,
    teams_affected TEXT[] NOT NULL,
    similarity_score DECIMAL(3,2) NOT NULL,
    deterministic BOOLEAN DEFAULT FALSE,
    confidence_score DECIMAL(3,2) NOT NULL,
    estimated_savings_usd DECIMAL(10,2),
    priority VARCHAR(20) CHECK (priority IN ('high', 'medium', 'low')),
    status VARCHAR(50) DEFAULT 'DETECTED',   -- DETECTED, GENERATING, PENDING_REVIEW, APPROVED, REJECTED, DEPLOYED
    tags TEXT[],
    domain TEXT[],
    production_path TEXT,
    total_executions INTEGER DEFAULT 0,
    total_savings_usd DECIMAL(10,2) DEFAULT 0.0,
    version VARCHAR(20) DEFAULT '1.0.0',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deployed_at TIMESTAMP
);

CREATE INDEX idx_workflow_patterns_status ON workflow_patterns(status);
CREATE INDEX idx_workflow_patterns_priority ON workflow_patterns(priority);
CREATE INDEX idx_workflow_patterns_teams ON workflow_patterns USING GIN(teams_affected);
CREATE INDEX idx_workflow_patterns_tags ON workflow_patterns USING GIN(tags);

-- ============================================================================
-- SKILL METADATA TABLE
-- ============================================================================
CREATE TABLE skill_metadata (
    skill_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pattern_id UUID NOT NULL REFERENCES workflow_patterns(id),
    git_branch VARCHAR(255),
    staging_path TEXT,
    parameters JSONB,                        -- [{"name": "param1", "type": "string", ...}]
    test_coverage DECIMAL(3,2),
    edge_cases_count INTEGER DEFAULT 0,
    generated_at TIMESTAMP,
    approved_at TIMESTAMP,
    approved_by VARCHAR(255),
    rejected_at TIMESTAMP,
    rejected_by VARCHAR(255),
    rejection_reason TEXT
);

CREATE INDEX idx_skill_metadata_pattern ON skill_metadata(pattern_id);

-- ============================================================================
-- APPROVAL REQUESTS TABLE
-- ============================================================================
CREATE TABLE approval_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pattern_id UUID NOT NULL REFERENCES workflow_patterns(id),
    skill_id UUID NOT NULL REFERENCES skill_metadata(skill_id),
    expert_id VARCHAR(255) NOT NULL,
    expert_email VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'PENDING_REVIEW',
    priority VARCHAR(20),
    sla_hours INTEGER,
    sla_deadline TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_approval_requests_status ON approval_requests(status);
CREATE INDEX idx_approval_requests_expert ON approval_requests(expert_id);
CREATE INDEX idx_approval_requests_sla ON approval_requests(sla_deadline) WHERE status = 'PENDING_REVIEW';

-- ============================================================================
-- APPROVAL LOG TABLE
-- ============================================================================
CREATE TABLE approval_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_id UUID NOT NULL REFERENCES skill_metadata(skill_id),
    expert_id VARCHAR(255) NOT NULL,
    action VARCHAR(50) NOT NULL,              -- approve, reject, correct
    feedback TEXT,
    timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_approval_log_skill ON approval_log(skill_id);

-- ============================================================================
-- EDGE CASES TABLE
-- ============================================================================
CREATE TABLE edge_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_id UUID NOT NULL,
    task_id UUID,
    team_id VARCHAR(50) NOT NULL,
    failure_reason TEXT NOT NULL,
    input_parameters JSONB NOT NULL,
    expected_output TEXT,
    actual_output TEXT,
    stack_trace TEXT,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
    occurrence_count INTEGER DEFAULT 1,
    resolved BOOLEAN DEFAULT FALSE,
    resolution_notes TEXT,
    update_proposed BOOLEAN DEFAULT FALSE,
    proposed_version VARCHAR(20),
    first_seen TIMESTAMP DEFAULT NOW(),
    last_seen TIMESTAMP DEFAULT NOW(),
    UNIQUE (skill_id, failure_reason, input_parameters)
);

CREATE INDEX idx_edge_cases_skill ON edge_cases(skill_id);
CREATE INDEX idx_edge_cases_unresolved ON edge_cases(skill_id, resolved) WHERE resolved = FALSE;
CREATE INDEX idx_edge_cases_severity ON edge_cases(severity);
CREATE INDEX idx_edge_cases_occurrence ON edge_cases(occurrence_count) WHERE occurrence_count >= 3;

-- ============================================================================
-- SKILL EXECUTIONS TABLE (Cost Tracking)
-- ============================================================================
CREATE TABLE skill_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_id UUID NOT NULL,
    team_id VARCHAR(50) NOT NULL,
    task_id UUID,
    execution_time_ms INTEGER NOT NULL,
    exit_code INTEGER NOT NULL,
    cost_avoided_usd DECIMAL(10,6) NOT NULL,
    tokens_avoided INTEGER NOT NULL,
    timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_skill_executions_skill ON skill_executions(skill_id);
CREATE INDEX idx_skill_executions_team ON skill_executions(team_id);
CREATE INDEX idx_skill_executions_timestamp ON skill_executions(timestamp);

-- Partitioning by month for performance (optional, for large scale)
-- CREATE TABLE skill_executions_YYYY_MM PARTITION OF skill_executions
--   FOR VALUES FROM ('YYYY-MM-01') TO ('YYYY-MM+1-01');
```

### 3.2 Storage Estimation

**Workflow Patterns:**
- Average pattern size: 2 KB (workflow_steps, tags, metadata)
- 100 patterns: 200 KB
- 1,000 patterns: 2 MB

**Edge Cases:**
- Average edge case size: 1 KB (failure_reason, stack_trace, params)
- 1,000 edge cases/year: 1 MB
- 10,000 edge cases/year: 10 MB

**Skill Executions:**
- Average execution record: 200 bytes
- 10,000 executions/month: 2 MB/month = 24 MB/year
- With partitioning: Old partitions archived/dropped after 12 months

**Total Storage (Year 1):**
- Patterns: 2 MB
- Edge Cases: 10 MB
- Executions: 24 MB
- **Total: ~40 MB**

**Storage Cost:** Negligible (<$1/year on PostgreSQL cloud hosting)

---

## 4. Deployment Architecture

### 4.1 Directory Structure

```
.claude/
├── skills/
│   ├── staging/                          # Pending approval
│   │   └── codified-{skill-id}/
│   │       ├── execute.sh
│   │       ├── validate.sh
│   │       ├── test.sh
│   │       ├── SKILL.md
│   │       ├── edge-cases.json
│   │       └── metadata.json
│   │
│   ├── codified-{skill-id}/              # Production (deployed)
│   │   ├── execute.sh
│   │   ├── validate.sh
│   │   ├── test.sh
│   │   ├── SKILL.md
│   │   ├── edge-cases.json
│   │   ├── metadata.json
│   │   └── rollback/
│   │       ├── v1.0.0/
│   │       ├── v1.0.1/
│   │       └── v1.1.0/
│   │
│   └── workflow-codification/            # System scripts
│       ├── analyze-patterns.sh
│       ├── spawn-skill-generator.sh
│       ├── approval-workflow.sh
│       ├── deploy-skill.sh
│       ├── track-edge-case.sh
│       ├── track-cost-savings.sh
│       ├── propose-skill-update.sh
│       ├── review-skill.sh
│       ├── sla-monitor.sh
│       └── lib/
│           ├── group-workflows.py
│           ├── store-patterns.py
│           └── generate-pattern-report.py
│
├── config/
│   └── workflow-codification.json        # Configuration
│
└── logs/
    └── workflow-codification/
        ├── pattern-analysis-{date}.log
        ├── skill-generation-{skill-id}.log
        └── skill-deployment-{skill-id}.log
```

### 4.2 Configuration File

**Location:** `.claude/config/workflow-codification.json`

```json
{
  "workflow_codification": {
    "enabled": true,
    "pattern_analyzer": {
      "cron_schedule": "0 9 * * 1",
      "window_days": 90,
      "min_occurrences": 5,
      "min_similarity": 0.85,
      "min_confidence": 0.75
    },
    "skill_generator": {
      "agent_type": "skill-generator",
      "timeout_seconds": 180,
      "validation_required": true,
      "auto_approve": false
    },
    "approval_workflow": {
      "sla_high_priority_hours": 48,
      "sla_medium_priority_hours": 168,
      "notification_channels": ["email", "slack"],
      "escalation_enabled": true
    },
    "edge_case_tracking": {
      "enabled": true,
      "update_threshold": 3,
      "severity_levels": ["critical", "high", "medium", "low"]
    },
    "cost_tracking": {
      "enabled": true,
      "ai_input_tokens": 5000,
      "ai_output_tokens": 2000,
      "token_cost_per_million": 0.50,
      "script_cost": 0.0001
    },
    "skill_matching": {
      "similarity_threshold": 0.80,
      "keyword_weight": 0.50,
      "workflow_weight": 0.30,
      "pattern_name_weight": 0.20
    },
    "deployment": {
      "require_tests_pass": true,
      "git_auto_merge": true,
      "notify_teams": true
    }
  }
}
```

---

## 5. Skill Lifecycle

### 5.1 Complete Lifecycle Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SKILL LIFECYCLE                                   │
└─────────────────────────────────────────────────────────────────────────────┘

STATE 1: NOT_EXIST (Pattern not yet detected)
    │
    │ Weekly pattern analysis runs
    │ ≥5 occurrences detected
    ▼
STATE 2: DETECTED (Pattern stored in workflow_patterns table)
    │ priority=high|medium|low
    │ status=DETECTED
    │
    │ [HIGH PRIORITY AUTO-TRIGGER]
    ▼
STATE 3: GENERATING (Skill generator agent spawned)
    │ status=GENERATING
    │ Agent generates: execute.sh, test.sh, SKILL.md, metadata.json
    │
    ├─> [VALIDATION FAILS] ──> STATE 10: GENERATION_FAILED [Terminal]
    │
    ▼
STATE 4: PENDING_REVIEW (Skill in staging, expert notified)
    │ status=PENDING_REVIEW
    │ Expert receives email + Slack notification
    │ SLA timer started (48h or 7 days)
    │
    ├─> [EXPERT: APPROVE] ──────────────────────────────┐
    │                                                    │
    ├─> [EXPERT: REJECT] ──> STATE 11: REJECTED ──> STATE 12: ARCHIVED [Terminal]
    │                            status=REJECTED
    │
    ├─> [EXPERT: CORRECT] ──> STATE 13: NEEDS_CORRECTION
    │                            │ status=NEEDS_CORRECTION
    │                            │ Expert provides feedback
    │                            ▼
    │                         STATE 14: CORRECTING (Re-generation)
    │                            │ AI regenerates with feedback
    │                            └──> [Back to STATE 4: PENDING_REVIEW]
    │
    ▼
STATE 5: APPROVED (Expert approved, ready for deployment)
    │ status=APPROVED
    │ approved_by={expert-id}
    │ approved_at={timestamp}
    │
    ▼
STATE 6: DEPLOYING (Deployment in progress)
    │ status=DEPLOYING
    │ Move staging → production
    │ Git merge (branch → main)
    │ Update metadata (deployed_at)
    │
    ├─> [DEPLOYMENT FAILS] ──────> STATE 15: DEPLOYMENT_FAILED
    │                                  │ Retry or escalate
    │                                  └──> [Back to STATE 4 or Manual Fix]
    │
    ▼
STATE 7: DEPLOYED (Skill live, available to teams)
    │ status=DEPLOYED
    │ deployed_at={timestamp}
    │ production_path={path}
    │
    │ [RUNTIME: Team Coordinator invokes skill]
    │
    ├─> [EXECUTION SUCCESS] ──> STATE 8: ACTIVE_USE
    │       │ Cost tracking logged
    │       │ total_executions++
    │       │ total_savings_usd += cost_avoided
    │       │
    │       └──> [Continue STATE 7: DEPLOYED]
    │
    ├─> [EXECUTION FAILURE] ──> STATE 9: EDGE_CASE_DETECTED
            │ Edge case tracked in edge_cases table
            │ occurrence_count++
            │
            ├─> [occurrence_count < 3] ──> [Back to STATE 7]
            │
            └─> [occurrence_count ≥ 3] ──> STATE 16: UPDATE_PROPOSED
                    │ Skill update proposal generated
                    │ new_version={version+1}
                    │
                    └──> [Back to STATE 4: PENDING_REVIEW for update]

TERMINAL STATES:
- STATE 10: GENERATION_FAILED (Skill generation validation errors)
- STATE 12: ARCHIVED (Expert rejected skill, unsuitable for codification)
```

### 5.2 Lifecycle Timing

| State | Duration | Notes |
|-------|----------|-------|
| DETECTED → GENERATING | < 5s | Immediate for high priority |
| GENERATING | 70-110s | AI generation + validation |
| PENDING_REVIEW | 48h-7d | SLA depends on priority |
| APPROVED → DEPLOYING | 10-30s | Git operations + tests |
| DEPLOYING → DEPLOYED | < 60s | File operations + notifications |
| DEPLOYED → ACTIVE_USE | Ongoing | Runtime invocations |
| EDGE_CASE_DETECTED → UPDATE_PROPOSED | 1-7d | Batched weekly |

**Total Time to Production:**
- **High Priority (Auto-Approved by Expert):** 2-4 days
- **Medium Priority:** 7-14 days
- **Low Priority:** 14-30 days

---

## 6. Integration Points

### 6.1 Phase 1 Integration (Corporate Organization)

**Team Coordinator Decision Logic:**

```bash
# Team Coordinator main loop
FOR EACH task IN task_queue:
    # PHASE 3 INTEGRATION: Check for codified skill
    skill = FindMatchingSkill(task.description, team_id)

    IF skill AND skill.status == "DEPLOYED":
        # Execute codified skill (Phase 3)
        result = ExecuteCodifiedSkill(skill.id, task.description, task.context)

        IF result.success:
            # Log cost savings (Phase 3)
            LogSkillExecution(skill.id, team_id, task.id, result)
            RETURN result
        ELSE:
            # Track edge case (Phase 3)
            TrackEdgeCase(skill.id, task.id, team_id, result)

            # Fallback to AI agent (Phase 2)
            RETURN SpawnEphemeralAgent(task.description, team_id, task.context)
        END IF
    ELSE:
        # No matching skill - spawn AI agent (Phase 2)
        RETURN SpawnEphemeralAgent(task.description, team_id, task.context)
    END IF
END FOR
```

**Resource Budget Tracking:**
- Skills tracked separately from AI agent budget
- Cost savings credited to team's efficiency metrics
- Dashboard shows: AI cost vs Script cost per team

---

### 6.2 Phase 2 Integration (ACE Playbook System)

**Pattern Analyzer → ACE Reflections:**

```sql
-- Pattern analyzer queries ACE reflections
SELECT
    id,
    task_id,
    team_id,
    content,
    workflow_steps,           -- Used for pattern detection
    confidence,
    created_at,
    json_extract(metadata, '$.tags') as tags,
    json_extract(metadata, '$.domain') as domain
FROM context_reflections
WHERE
    created_at > NOW() - INTERVAL '90 days' AND
    confidence >= 0.75 AND
    json_array_length(workflow_steps) >= 2;
```

**Skill Generator Context Injection:**
- ACE reflections provide historical context for skill generation
- Edge cases from reflections included in generated test suite
- Anti-patterns from reflections included in skill documentation

**Feedback Loop:**
- Codified skills create new reflections: "Skill X used successfully for task Y"
- Edge cases stored in ACE system as lessons: "Avoid input Z for skill X"

---

## 7. Performance Architecture

### 7.1 Performance Targets

| Operation | Target | Actual (Expected) | Notes |
|-----------|--------|-------------------|-------|
| Pattern Analysis (Weekly) | < 120s | 30-120s | Depends on reflection count |
| Skill Generation | < 180s | 70-110s | AI-powered generation |
| Skill Deployment | < 60s | 10-30s | Git operations + tests |
| Skill Execution | < 30s | 5-20s | Replaces 200s AI execution |
| Edge Case Tracking | < 100ms | 20-50ms | PostgreSQL UPSERT |
| Cost Tracking | < 50ms | 10-30ms | PostgreSQL INSERT |
| Pattern Detection Query | < 5s | 1-5s | Indexed PostgreSQL query |

### 7.2 Caching Strategy

**No explicit caching layer needed** for Phase 3 (unlike Phase 2 Redis caching).

Rationale:
- Pattern analysis is weekly batch (no real-time queries)
- Skill execution is file-based (no database queries during execution)
- Edge case tracking is async (non-blocking)
- Cost tracking is async (non-blocking)

PostgreSQL query optimization (indexes) sufficient for performance.

---

### 7.3 Scalability Architecture

**Horizontal Scaling:**
- Pattern analyzer: Single weekly batch job (no scaling needed)
- Skill generator agents: Ephemeral, auto-scale based on pattern detection rate
- Skill execution: Stateless bash scripts (scales with team coordinator instances)

**Vertical Scaling:**
- PostgreSQL: Standard scaling (read replicas if needed at high scale)
- Storage: Git repository (standard best practices)

**Capacity Planning:**

| Metric | Year 1 | Year 2 | Year 3 |
|--------|--------|--------|--------|
| Workflow Patterns | 100 | 300 | 500 |
| Edge Cases | 1,000 | 3,000 | 5,000 |
| Skill Executions/Month | 10,000 | 50,000 | 100,000 |
| PostgreSQL Storage | 40 MB | 120 MB | 200 MB |
| Skill Repository Size | 50 MB | 150 MB | 250 MB |

---

## 8. Security Architecture

### 8.1 Security Layers

**Layer 1: Input Validation (All Skills)**
```bash
# validate.sh (generated for every skill)

validate_input() {
  local param_name="$1"
  local param_value="$2"
  local param_type="$3"

  # Type validation
  case "$param_type" in
    string)
      [[ -n "$param_value" ]] || { echo "Error: $param_name empty"; return 1; }
      # No shell metacharacters
      [[ ! "$param_value" =~ [\;\|\&\$\`] ]] || { echo "Error: invalid chars"; return 1; }
      ;;
    integer)
      [[ "$param_value" =~ ^[0-9]+$ ]] || { echo "Error: not integer"; return 1; }
      ;;
    path)
      # Path traversal prevention
      [[ ! "$param_value" =~ \.\. ]] || { echo "Error: path traversal"; return 1; }
      [[ -e "$param_value" ]] || { echo "Error: path not found"; return 1; }
      ;;
  esac
}
```

**Layer 2: Secrets Management**
- Skills NEVER hardcode secrets
- Environment variables for sensitive data
- Example: `$API_KEY`, `$DB_PASSWORD`

**Layer 3: Shellcheck Validation**
- All generated bash scripts validated with shellcheck
- No SC2086 (unquoted variables), SC2046 (command substitution), etc.

**Layer 4: Audit Logging**
```sql
-- All skill executions logged with metadata
INSERT INTO skill_executions (
    skill_id,
    team_id,
    task_id,
    execution_time_ms,
    exit_code,
    timestamp
) VALUES (...);

-- All approval actions logged
INSERT INTO approval_log (
    skill_id,
    expert_id,
    action,
    feedback,
    timestamp
) VALUES (...);
```

**Layer 5: Access Control**
- Only team experts can approve skills for their domain
- Only deployed skills can be executed by team coordinators
- Git branch protections on main branch

### 8.2 Threat Model

| Threat | Mitigation | Residual Risk |
|--------|-----------|---------------|
| Command Injection | Input validation (no shell metacharacters) | Low |
| Path Traversal | Path validation (no `..`), existence check | Low |
| Secrets Exposure | No hardcoding, env vars only, git-secrets hook | Low |
| Malicious Skill | Expert approval required, test suite validation | Medium |
| Edge Case DOS | Async tracking, occurrence limit, monitoring | Low |
| Data Poisoning | Pattern detection threshold (≥5 occurrences) | Medium |

---

**End of Architecture Document**

**Version:** 3.0.0
**Status:** DRAFT
**Completion:** Phase 3 documentation complete (SPECIFICATION.md, PSEUDOCODE.md, ARCHITECTURE.md)
