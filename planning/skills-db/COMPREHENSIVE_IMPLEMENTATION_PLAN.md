# Skills Database - Comprehensive Implementation Plan
# With Approval Workflow Integration

## Document Metadata
- **Version:** 2.0.0
- **Status:** Ready for Implementation
- **Date:** 2025-11-15
- **Branch:** `claude/dynamic-skills-database-01JVQeuVPQKnuhu2gYukCyGb`
- **Related:** SPECIFICATION.md, ARCHITECTURE.md, PHASE4_INTEGRATION.md

---

## Executive Summary

This comprehensive plan integrates the **Dynamic Skills Database** (6-week implementation) with the **Phase 4 Workflow Codification System** (already complete). The key addition is an **approval workflow system** that governs skill deployment with three authorization levels.

### Key Additions to Original Plan

1. **Approval Workflow Integration**
   - Three-tier approval system (auto, escalate, human)
   - Integration with Phase 4 approval workflow
   - Skill lifecycle state management

2. **Phase 4 Integration Points**
   - Automatic skill deployment from Phase 4 approval workflow
   - Dual logging to SQLite + PostgreSQL
   - Edge case feedback loop with version management

3. **Enhanced Schema**
   - `approval_level` column in skills table
   - `approval_history` table for audit trail
   - Integration with Phase 4's `skill_approvals` table

---

## Table of Contents

1. [Implementation Timeline](#1-implementation-timeline)
2. [Enhanced Database Schema](#2-enhanced-database-schema)
3. [Phase 1: Foundation with Approval](#3-phase-1-foundation-with-approval)
4. [Phase 2: Database Infrastructure](#4-phase-2-database-infrastructure)
5. [Phase 3: Skill Loader](#5-phase-3-skill-loader)
6. [Phase 4: CLI Tooling with Approval](#6-phase-4-cli-tooling-with-approval)
7. [Phase 5: Integration & Testing](#7-phase-5-integration--testing)
8. [Phase 6: Analytics & Optimization](#8-phase-6-analytics--optimization)
9. [Phase 4 Workflow Integration](#9-phase-4-workflow-integration)
10. [Deployment Guide](#10-deployment-guide)
11. [Risk Management](#11-risk-management)
12. [Success Criteria](#12-success-criteria)

---

## 1. Implementation Timeline

### Total Duration: 7 Weeks (35 Business Days)

| Phase | Duration | Key Deliverables |
|-------|----------|------------------|
| Phase 1: Foundation with Approval | 4 days | Bootstrap skills, schema with approval columns |
| Phase 2: Database Infrastructure | 5 days | SQLite + approval tables, migration script |
| Phase 3: Skill Loader | 5 days | SkillLoader class, caching, hash validation |
| Phase 4: CLI Tooling with Approval | 6 days | CLI commands + approval workflow |
| Phase 5: Integration & Testing | 7 days | Agent prompt builder, E2E tests |
| Phase 6: Analytics & Optimization | 5 days | Usage logging, analytics, optimization |
| **Phase 7: Phase 4 Integration** | **3 days** | **Auto-deployment, dual logging, edge cases** |

**Buffer:** 5 days for unexpected issues

---

## 2. Enhanced Database Schema

### 2.1 Skills Table (Enhanced)

```sql
CREATE TABLE skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,
  team TEXT,
  content_path TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  tags TEXT,  -- JSON array
  version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'deprecated', 'archived')),

  -- NEW: Approval Workflow Integration
  approval_level TEXT NOT NULL DEFAULT 'human' CHECK(approval_level IN ('auto', 'escalate', 'human')),
  approval_criteria TEXT,  -- JSON: {"risk_score": 0.3, "test_coverage": 0.8}

  deprecation_note TEXT,
  replacement_id INTEGER,
  owner TEXT,

  -- NEW: Phase 4 Integration
  phase4_pattern_id INTEGER,  -- References workflow_patterns.id in PostgreSQL
  generated_by TEXT,  -- 'phase4' | 'manual' | 'imported'

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (replacement_id) REFERENCES skills(id)
);
```

### 2.2 Approval History Table (NEW)

```sql
CREATE TABLE approval_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  skill_id INTEGER NOT NULL,
  version TEXT NOT NULL,
  approval_level TEXT NOT NULL,
  approver TEXT,  -- 'system' | 'expert-email@example.com'
  decision TEXT NOT NULL CHECK(decision IN ('approved', 'rejected', 'escalated')),
  reasoning TEXT,
  risk_assessment TEXT,  -- JSON: {"security": "low", "complexity": "medium"}
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);
```

### 2.3 Approval Criteria Definitions (NEW)

```sql
CREATE TABLE approval_criteria_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  approval_level TEXT NOT NULL,
  category TEXT NOT NULL,
  criteria_json TEXT NOT NULL,  -- JSON criteria definition
  description TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed data for approval criteria
INSERT INTO approval_criteria_templates (approval_level, category, criteria_json, description) VALUES
  ('auto', 'coordination', '{"max_commands": 5, "test_coverage": 0.9, "no_external_calls": true}', 'Auto-approve simple coordination skills with high test coverage'),
  ('escalate', 'infrastructure', '{"external_api_calls": true, "security_review": true}', 'Escalate infrastructure skills with external dependencies'),
  ('human', 'domain', '{"complexity": "high", "business_logic": true}', 'Require human review for complex business logic');
```

### 2.4 Updated Indexes

```sql
-- Existing indexes
CREATE INDEX idx_skills_name ON skills(name);
CREATE INDEX idx_skills_status ON skills(status);
CREATE INDEX idx_skills_category ON skills(category);
CREATE INDEX idx_skills_team ON skills(team);

-- NEW: Approval workflow indexes
CREATE INDEX idx_skills_approval_level ON skills(approval_level);
CREATE INDEX idx_skills_phase4_pattern ON skills(phase4_pattern_id);
CREATE INDEX idx_approval_history_skill ON approval_history(skill_id);
CREATE INDEX idx_approval_history_timestamp ON approval_history(timestamp);
```

---

## 3. Phase 1: Foundation with Approval (Days 1-4)

### 3.1 Objectives
- Create bootstrap skills directory and files
- Design database schema with approval workflow
- Define approval criteria templates
- Document approval process

### 3.2 Tasks

#### Task 1.1: Create Bootstrap Skills Directory
**Owner:** Backend Developer
**Duration:** 0.5 days
**Priority:** P0 (Critical)

**Steps:**
1. Create directory: `.claude/skills/bootstrap/`
2. Create 5 bootstrap skill files:
   - `database-connection.md` - SQLite connection patterns
   - `error-handling.md` - Bash error handling and exit codes
   - `bash-fundamentals.md` - Core bash scripting patterns
   - `file-operations.md` - File I/O, path resolution
   - `skill-loader.md` - Dynamic skill loading from database

3. Add approval metadata to each skill:
```markdown
---
name: database-connection
category: foundation
approval_level: auto
approval_criteria:
  max_commands: 3
  test_coverage: 0.95
  no_external_calls: true
---
```

**Deliverable:** 5 markdown files with approval metadata

**Acceptance Criteria:**
- [ ] All 5 files exist
- [ ] Each file has valid frontmatter with approval_level
- [ ] Total size < 50KB
- [ ] No database dependency in content

---

#### Task 1.2: Design Enhanced Database Schema
**Owner:** Architect
**Duration:** 1.5 days
**Priority:** P0 (Critical)

**Steps:**
1. Review SPECIFICATION.md data model
2. Add approval workflow columns to skills table
3. Create approval_history table
4. Create approval_criteria_templates table
5. Define indexes for approval queries
6. Document schema versioning strategy

**Deliverable:** `schema-v2.sql` file with approval workflow

**SQL Location:** `.claude/skills-database/schema-v2.sql`

**Acceptance Criteria:**
- [ ] Schema supports all requirements from SPECIFICATION.md
- [ ] Approval workflow columns defined
- [ ] Foreign keys and constraints correct
- [ ] Indexes on critical query paths
- [ ] Migration path from v1 documented

---

#### Task 1.3: Define Approval Criteria Templates
**Owner:** Architect
**Duration:** 1 day
**Priority:** P0 (Critical)

**Steps:**
1. Define criteria for `auto` approval:
   - Simple coordination skills (≤5 commands)
   - High test coverage (≥90%)
   - No external API calls
   - No file system modifications outside skill directory

2. Define criteria for `escalate` approval:
   - Infrastructure changes (Docker, Redis, PostgreSQL)
   - External API calls
   - Security-sensitive operations
   - Cross-team dependencies

3. Define criteria for `human` approval:
   - Complex business logic
   - High risk score (security impact)
   - Low test coverage (<80%)
   - New skill categories

**Deliverable:** Approval criteria decision matrix

**Document Location:** `.claude/skills-database/APPROVAL_CRITERIA.md`

**Acceptance Criteria:**
- [ ] All three levels documented with examples
- [ ] Risk assessment rubric defined
- [ ] Escalation paths documented
- [ ] Integration with Phase 4 approval workflow specified

---

#### Task 1.4: Document Approval Process
**Owner:** Architect
**Duration:** 1 day
**Priority:** P1 (High)

**Steps:**
1. Create `.claude/skills-database/APPROVAL_WORKFLOW.md`
2. Document approval decision tree
3. Document integration with Phase 4 workflow
4. Document expert review process
5. Document audit trail requirements

**Deliverable:** Comprehensive APPROVAL_WORKFLOW.md

**Acceptance Criteria:**
- [ ] Decision tree for all approval levels
- [ ] Integration with Phase 4 documented
- [ ] Expert notification templates included
- [ ] Audit trail examples provided

---

### 3.3 Phase 1 Deliverables

**Files Created:**
- `.claude/skills/bootstrap/*.md` (5 files with approval metadata)
- `.claude/skills-database/schema-v2.sql` (enhanced schema)
- `.claude/skills-database/APPROVAL_CRITERIA.md` (criteria decision matrix)
- `.claude/skills-database/APPROVAL_WORKFLOW.md` (process documentation)
- `.claude/skills-database/README.md` (updated with approval info)

**Documentation:**
- Database schema v2 specification
- Approval criteria templates
- Approval workflow process
- Integration plan with Phase 4

---

## 4. Phase 2: Database Infrastructure (Days 5-9)

### 4.1 Objectives
- Initialize SQLite database with approval tables
- Create migration script from filesystem
- Implement YAML export/import with approval metadata
- Implement approval workflow engine

### 4.2 Tasks

#### Task 2.1: Database Initialization Script
**Owner:** Backend Developer
**Duration:** 1 day
**Priority:** P0 (Critical)

**Steps:**
1. Create `scripts/skills-db/init-database-v2.sh`
2. Apply schema-v2.sql
3. Seed approval_criteria_templates
4. Validate database structure
5. Create health check query

**Script Location:** `scripts/skills-db/init-database-v2.sh`

**Key Features:**
```bash
#!/bin/bash
set -euo pipefail

DB_PATH=".claude/skills-database/skills.db"
SCHEMA_PATH=".claude/skills-database/schema-v2.sql"

# Create database
sqlite3 "$DB_PATH" < "$SCHEMA_PATH"

# Seed approval criteria
sqlite3 "$DB_PATH" << EOF
INSERT INTO approval_criteria_templates (approval_level, category, criteria_json, description) VALUES
  ('auto', 'coordination', '{"max_commands": 5, "test_coverage": 0.9, "no_external_calls": true}', 'Auto-approve simple coordination skills'),
  ('escalate', 'infrastructure', '{"external_api_calls": true, "security_review": true}', 'Escalate infrastructure skills'),
  ('human', 'domain', '{"complexity": "high", "business_logic": true}', 'Require human review for complex logic');
EOF

# Validate
sqlite3 "$DB_PATH" <<SQL
SELECT 'Tables:' as check, COUNT(*) as count FROM sqlite_master WHERE type='table';
SELECT 'Approval Criteria:' as check, COUNT(*) as count FROM approval_criteria_templates;
SQL

echo "Database v2 initialized successfully: $DB_PATH"
```

**Acceptance Criteria:**
- [ ] Script creates database successfully
- [ ] All tables including approval tables created
- [ ] Approval criteria seeded
- [ ] Indexes created
- [ ] Health check passes

---

#### Task 2.2: Enhanced Filesystem Migration Script
**Owner:** Backend Developer
**Duration:** 2 days
**Priority:** P0 (Critical)

**Steps:**
1. Update `scripts/skills-db/seed-from-filesystem.sh`
2. Parse frontmatter for approval_level
3. Infer approval_level if not specified
4. Calculate content hashes
5. Insert into database with approval metadata

**Script Enhancement:**
```bash
#!/bin/bash
set -euo pipefail

DB_PATH=".claude/skills-database/skills.db"
SKILLS_DIR=".claude/skills"

for skill_file in "$SKILLS_DIR"/*/SKILL.md; do
  # Skip bootstrap skills
  if [[ "$skill_file" == *"/bootstrap/"* ]]; then
    continue
  fi

  skill_dir=$(dirname "$skill_file")
  skill_name=$(basename "$skill_dir")
  content_hash=$(sha256sum "$skill_file" | cut -d' ' -f1)

  # Parse frontmatter for approval_level
  if grep -q "^approval_level:" "$skill_file"; then
    approval_level=$(grep "^approval_level:" "$skill_file" | cut -d':' -f2 | tr -d ' ')
  else
    # Infer approval level based on category and complexity
    if [[ "$skill_name" == cfn-* ]]; then
      approval_level="escalate"  # CFN infrastructure skills need review
    elif [[ "$skill_name" == *"test"* ]]; then
      approval_level="auto"  # Testing skills are low risk
    else
      approval_level="human"  # Default to human review
    fi
  fi

  # Infer category, team, etc.
  # ... (existing logic)

  # Insert with approval metadata
  sqlite3 "$DB_PATH" <<SQL
    INSERT OR IGNORE INTO skills (
      name, category, team, content_path, content_hash, version, status,
      approval_level, generated_by, owner
    ) VALUES (
      '$skill_name', '$category', '$team', '$skill_file', '$content_hash',
      '1.0.0', 'active', '$approval_level', 'manual', '$team'
    );
SQL

  echo "Imported: $skill_name (approval: $approval_level)"
done
```

**Acceptance Criteria:**
- [ ] All 62 existing skills imported
- [ ] Approval levels assigned (parsed or inferred)
- [ ] Content hashes calculated correctly
- [ ] No duplicate entries
- [ ] Migration report generated

---

#### Task 2.3: YAML Export with Approval Metadata
**Owner:** Backend Developer
**Duration:** 1 day
**Priority:** P1 (High)

**Steps:**
1. Update `src/cli/yaml-snapshot.ts`
2. Include approval_level in exports
3. Include approval_history in exports
4. Format approval criteria as YAML

**TypeScript Enhancement:**
```typescript
const snapshot: SnapshotData = {
  version: '2.0',
  exported_at: new Date().toISOString(),
  schema_version: 2,
  skills: skills.map(s => ({
    id: s.id,
    name: s.name,
    category: s.category,
    team: s.team,
    content_path: s.content_path,
    content_hash: s.content_hash,
    tags: s.tags ? JSON.parse(s.tags) : [],
    version: s.version,
    status: s.status,

    // NEW: Approval workflow fields
    approval_level: s.approval_level,
    approval_criteria: s.approval_criteria ? JSON.parse(s.approval_criteria) : null,

    owner: s.owner,
    phase4_pattern_id: s.phase4_pattern_id,
    generated_by: s.generated_by
  })),

  // NEW: Approval history export
  approval_history: approvalHistory.map(h => ({
    skill_id: h.skill_id,
    version: h.version,
    approval_level: h.approval_level,
    approver: h.approver,
    decision: h.decision,
    reasoning: h.reasoning,
    timestamp: h.timestamp
  }))
};
```

**Acceptance Criteria:**
- [ ] YAML includes approval metadata
- [ ] Approval history exported
- [ ] File remains human-readable
- [ ] File size < 750KB (increased from 500KB)

---

#### Task 2.4: Approval Workflow Engine Implementation
**Owner:** Backend Developer
**Duration:** 1 day
**Priority:** P0 (Critical)

**Steps:**
1. Create `scripts/skills-db/approve-skill.sh`
2. Implement approval decision logic
3. Integrate with Phase 4 approval workflow
4. Record approval history
5. Trigger notifications for escalations

**Script Location:** `scripts/skills-db/approve-skill.sh`

**Key Features:**
```bash
#!/bin/bash
set -euo pipefail

SKILL_ID="$1"
VERSION="$2"
APPROVER="${3:-system}"
DECISION="${4:-approved}"  # approved | rejected | escalated

DB_PATH=".claude/skills-database/skills.db"

# Get skill details
skill_info=$(sqlite3 "$DB_PATH" "SELECT name, approval_level FROM skills WHERE id=$SKILL_ID;")
skill_name=$(echo "$skill_info" | cut -d'|' -f1)
approval_level=$(echo "$skill_info" | cut -d'|' -f2)

# Record approval decision
sqlite3 "$DB_PATH" <<EOF
INSERT INTO approval_history (skill_id, version, approval_level, approver, decision, timestamp)
VALUES ($SKILL_ID, '$VERSION', '$approval_level', '$APPROVER', '$DECISION', datetime('now'));
EOF

# Handle decision
case "$DECISION" in
  "approved")
    echo "✅ Skill approved: $skill_name (v$VERSION)"

    # If from Phase 4, update workflow_patterns status
    if [[ -n "${CFN_DB_HOST:-}" ]]; then
      psql -h "$CFN_DB_HOST" -c "UPDATE workflow_patterns SET status='deployed' WHERE deployed_skill_id=$SKILL_ID;"
    fi
    ;;

  "escalated")
    echo "⚠️  Skill escalated for expert review: $skill_name"
    # Trigger notification (email/Slack)
    ./notify-expert.sh "$skill_name" "$VERSION" "escalation"
    ;;

  "rejected")
    echo "❌ Skill rejected: $skill_name"
    sqlite3 "$DB_PATH" "UPDATE skills SET status='archived' WHERE id=$SKILL_ID;"
    ;;
esac
```

**Acceptance Criteria:**
- [ ] Approval decisions recorded in database
- [ ] Integration with Phase 4 workflow
- [ ] Notifications triggered for escalations
- [ ] Audit trail complete

---

### 4.3 Phase 2 Deliverables

**Scripts:**
- `scripts/skills-db/init-database-v2.sh` (enhanced initialization)
- `scripts/skills-db/seed-from-filesystem.sh` (enhanced with approval)
- `scripts/skills-db/approve-skill.sh` (approval workflow engine)

**TypeScript Modules:**
- `src/cli/yaml-snapshot.ts` (updated with approval metadata)

**Database:**
- `.claude/skills-database/skills.db` (v2 schema with approval tables)

**Snapshot:**
- `.claude/skills-database/snapshot.yaml` (v2 with approval metadata)

---

## 5. Phase 3: Skill Loader (Days 10-14)

### 5.1 Objectives
- Implement SkillLoader class with approval awareness
- Implement skill caching
- Implement hash validation
- Write unit tests

### 5.2 Tasks

#### Task 3.1: SkillLoader Class Implementation
**Owner:** Backend Developer
**Duration:** 2 days
**Priority:** P0 (Critical)

**File:** `src/cli/skill-loader.ts`

**Key Enhancement - Approval Awareness:**
```typescript
class SkillLoader {
  async loadSkillsForAgent(
    agentType: string,
    context: TaskContext
  ): Promise<Skill[]> {
    // Load bootstrap skills first
    const bootstrapSkills = await this.loadBootstrapSkills();

    // Query database for agent-specific skills
    const query = `
      SELECT s.*, m.priority, m.required
      FROM skills s
      JOIN agent_skill_mappings m ON m.skill_id = s.id
      WHERE m.agent_type = ?
        AND s.status = 'active'
        AND (
          m.conditions IS NULL
          OR json_extract(m.conditions, '$.taskContext') LIKE ?
        )
      ORDER BY m.priority ASC, s.approval_level ASC
    `;

    const skills = await this.db.all(query, [agentType, `%${context.keywords}%`]);

    // Load content and validate hashes
    const loadedSkills = await Promise.all(
      skills.map(s => this.loadSkillContent(s))
    );

    return [...bootstrapSkills, ...loadedSkills];
  }

  // NEW: Check if skill requires approval before deployment
  async requiresApproval(skill: SkillMetadata): Promise<boolean> {
    if (skill.approval_level === 'auto') return false;

    // Check if already approved
    const approved = await this.db.get(`
      SELECT 1 FROM approval_history
      WHERE skill_id = ? AND version = ? AND decision = 'approved'
      LIMIT 1
    `, [skill.id, skill.version]);

    return !approved;
  }
}
```

**Acceptance Criteria:**
- [ ] Loads bootstrap skills without DB
- [ ] Queries database efficiently (≤3ms)
- [ ] Filters by approval status
- [ ] Returns skills in priority order (approval level as secondary sort)
- [ ] Unit tests pass (90% coverage)

---

#### Task 3.2: Skill Cache Implementation
**Owner:** Backend Developer
**Duration:** 1 day
**Priority:** P1 (High)

**(No changes from original plan - Task 3.2 remains the same)**

---

#### Task 3.3: Hash Validation Implementation
**Owner:** Backend Developer
**Duration:** 1 day
**Priority:** P1 (High)

**(No changes from original plan - Task 3.3 remains the same)**

---

#### Task 3.4: Unit Tests with Approval Scenarios
**Owner:** QA Engineer
**Duration:** 1 day
**Priority:** P0 (Critical)

**Additional Test Cases:**
- Approval level filtering
- Auto-approved skills bypass approval check
- Escalated skills trigger notification
- Approval history validation
- Phase 4 integration approval flow

**Test Files:**
- `tests/unit/skill-loader.test.ts` (enhanced)
- `tests/unit/approval-workflow.test.ts` (new)

**Acceptance Criteria:**
- [ ] 90% code coverage
- [ ] All approval workflow scenarios tested
- [ ] Integration with Phase 4 mocked
- [ ] Performance tests (latency < 15ms)

---

### 5.3 Phase 3 Deliverables

**TypeScript Modules:**
- `src/cli/skill-loader.ts` (enhanced with approval awareness)
- `src/cli/skill-cache.ts` (unchanged)
- `src/cli/approval-checker.ts` (new)

**Tests:**
- `tests/unit/skill-loader.test.ts` (enhanced)
- `tests/unit/skill-cache.test.ts` (unchanged)
- `tests/unit/approval-workflow.test.ts` (new)

---

## 6. Phase 4: CLI Tooling with Approval (Days 15-20)

### 6.1 Objectives
- Implement CLI command structure
- Implement core commands with approval workflow
- Implement approval management commands
- Write integration tests

### 6.2 Tasks

#### Task 4.1: CLI Framework Setup
**Owner:** Backend Developer
**Duration:** 1 day
**Priority:** P0 (Critical)

**(Unchanged from original plan)**

---

#### Task 4.2: Implement List Command with Approval Filter
**Owner:** Backend Developer
**Duration:** 1 day
**Priority:** P1 (High)

**Enhancement - Approval Filtering:**
```bash
$ npx cfn skill list --approval=auto

id | name                | category      | approval | version | status | agents
---+---------------------+---------------+----------+---------+--------+-------
3  | error-handling      | testing       | auto     | 1.2.0   | active | 8
7  | bash-fundamentals   | foundation    | auto     | 1.0.0   | active | 15

$ npx cfn skill list --pending-approval

id | name                | category      | approval | version | status | awaiting
---+---------------------+---------------+----------+---------+--------+---------
12 | jwt-authentication  | domain        | human    | 1.0.0   | staged | expert
18 | redis-cluster       | infra         | escalate | 1.1.0   | staged | security
```

**Acceptance Criteria:**
- [ ] Filter by approval_level works
- [ ] Show pending approvals
- [ ] Color-code by approval status
- [ ] Performance < 100ms for 500 skills

---

#### Task 4.3: Implement Approval Management Commands
**Owner:** Backend Developer
**Duration:** 2 days
**Priority:** P0 (Critical)

**New Commands:**
```bash
# Approve a skill
npx cfn skill approve \
  --skill=jwt-authentication \
  --version=1.0.0 \
  --approver=expert@example.com \
  --decision=approved \
  --reasoning="Security review passed"

# Escalate a skill
npx cfn skill escalate \
  --skill=redis-cluster \
  --version=1.1.0 \
  --reason="Requires security review for external Redis connection"

# Check approval status
npx cfn skill approval-status --skill=jwt-authentication

# List pending approvals
npx cfn skill pending --approval-level=human
```

**Implementation:**
```typescript
async function cmdApprove(options: ApprovalOptions) {
  const { skill, version, approver, decision, reasoning } = options;

  // Get skill ID
  const skillRecord = await db.get('SELECT id, approval_level FROM skills WHERE name = ?', skill);

  // Record approval
  await db.run(`
    INSERT INTO approval_history (skill_id, version, approval_level, approver, decision, reasoning, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `, [skillRecord.id, version, skillRecord.approval_level, approver, decision, reasoning]);

  // Update skill status based on decision
  if (decision === 'approved') {
    await db.run('UPDATE skills SET status = ? WHERE id = ?', ['active', skillRecord.id]);
    console.log(chalk.green(`✅ Skill approved: ${skill} (v${version})`));
  } else if (decision === 'rejected') {
    await db.run('UPDATE skills SET status = ? WHERE id = ?', ['archived', skillRecord.id]);
    console.log(chalk.red(`❌ Skill rejected: ${skill}`));
  }

  // If integrated with Phase 4, update workflow_patterns status
  if (process.env.CFN_DB_HOST) {
    await updatePhase4Status(skillRecord.phase4_pattern_id, decision);
  }
}
```

**Acceptance Criteria:**
- [ ] Approval workflow commands functional
- [ ] Integration with Phase 4 workflow
- [ ] Audit trail recorded
- [ ] Notifications triggered

---

#### Task 4.4: Implement Create/Update/Deprecate Commands
**Owner:** Backend Developer
**Duration:** 1 day
**Priority:** P1 (High)

**Enhancement - Approval Level Assignment:**
```bash
# Create with explicit approval level
npx cfn skill create \
  --name=graphql-federation \
  --category=domain \
  --team=backend \
  --content-path=.claude/skills/graphql-federation/SKILL.md \
  --tags=graphql,federation \
  --version=1.0.0 \
  --approval-level=human \
  --approval-criteria='{"complexity": "high", "business_logic": true}'

# Update triggers re-approval if approval_level changes
npx cfn skill update \
  --skill=cfn-coordination \
  --version=2.2.0 \
  --approval-level=escalate \
  --recalculate-hash
```

**Acceptance Criteria:**
- [ ] Create validates approval_level
- [ ] Update triggers re-approval if needed
- [ ] Approval criteria stored as JSON
- [ ] Clear success/error messages

---

#### Task 4.5: Implement Analytics Commands
**Owner:** Backend Developer
**Duration:** 1 day
**Priority:** P2 (Medium)

**Enhancement - Approval Analytics:**
```bash
# Approval velocity report
npx cfn skill analytics approval-velocity

# Output:
# Approval Velocity (30 days):
#
# Auto-approved: 45 skills (avg: instant)
# Escalated: 12 skills (avg: 2.3 days)
# Human review: 8 skills (avg: 5.7 days)
#
# SLA Compliance: 87% (target: 90%)

# Approval bottlenecks
npx cfn skill analytics approval-bottlenecks

# Skills by approval level
npx cfn skill analytics by-approval-level
```

**Acceptance Criteria:**
- [ ] Approval velocity calculated
- [ ] SLA compliance tracked
- [ ] Bottlenecks identified
- [ ] Reports formatted clearly

---

### 6.3 Phase 4 Deliverables

**CLI Tool:**
- `src/cli/skill-cli.ts` (enhanced with approval commands)

**New Commands:**
- `approve`, `escalate`, `approval-status`, `pending`
- Analytics: `approval-velocity`, `approval-bottlenecks`, `by-approval-level`

**Documentation:**
- CLI usage guide: `docs/SKILLS_CLI_GUIDE.md` (updated)
- Approval workflow guide: `docs/APPROVAL_WORKFLOW_GUIDE.md` (new)

---

## 7. Phase 5: Integration & Testing (Days 21-27)

### 7.1 Objectives
- Integrate SkillLoader into agent-prompt-builder
- Add feature flag
- Test approval workflow integration
- Validate backward compatibility

### 7.2 Tasks

#### Task 5.1: Agent Prompt Builder Integration
**Owner:** Integration Engineer
**Duration:** 2 days
**Priority:** P0 (Critical)

**File:** `src/cli/agent-prompt-builder.ts` (modify)

**Enhancement - Approval Awareness:**
```typescript
export async function buildAgentPrompt(
  definition: AgentDefinition,
  context: TaskContext
): Promise<string> {
  const sections: string[] = [];

  // ... existing code ...

  // Load skills from database (if enabled)
  if (process.env.CFN_SKILLS_DATABASE === 'true') {
    const skillLoader = new SkillLoader();
    const skills = await skillLoader.loadSkillsForAgent(
      definition.type,
      context
    );

    // Filter skills that require approval (if in staging)
    const approvedSkills = skills.filter(s => {
      if (process.env.CFN_ENV === 'production') {
        // In production, only load approved skills
        return s.status === 'active';
      }
      return true; // In staging, load all skills
    });

    if (approvedSkills.length > 0) {
      sections.push('## Applicable Skills');
      sections.push('');

      for (const skill of approvedSkills) {
        sections.push(`### ${skill.name} (v${skill.version}) [${skill.approval_level}]`);
        sections.push(skill.content);
        sections.push('');
      }

      // Log usage for analytics
      await skillLoader.logSkillUsage({
        agentId: getAgentId(definition, context),
        agentType: definition.type,
        skillIds: approvedSkills.map(s => s.id),
        taskId: context.taskId,
        phase: extractPhase(context),
        loadedAt: new Date()
      });
    }
  }

  return sections.join('\n');
}
```

**Acceptance Criteria:**
- [ ] Feature flag controls database usage
- [ ] Approval status checked in production
- [ ] Skills injected in correct order
- [ ] Usage logged asynchronously

---

#### Task 5.2: E2E Testing with Approval Scenarios
**Owner:** QA Engineer
**Duration:** 2 days
**Priority:** P0 (Critical)

**Additional Test Scenarios:**
1. **Auto-approved skill deployment**
   - Create simple coordination skill
   - Verify auto-approval
   - Verify immediate availability to agents

2. **Human-approval skill workflow**
   - Create complex business logic skill
   - Verify pending approval state
   - Approve via CLI
   - Verify availability to agents

3. **Escalated skill workflow**
   - Create infrastructure skill
   - Verify escalation notification
   - Expert approves
   - Verify deployment

4. **Phase 4 integration**
   - Phase 4 generates skill
   - Verify auto-deployment to Skills DB
   - Verify approval workflow integration
   - Verify dual logging

**Test Files:**
- `tests/e2e/approval-workflow-e2e.test.ts` (new)
- `tests/e2e/phase4-integration.test.ts` (new)

**Acceptance Criteria:**
- [ ] All approval scenarios pass
- [ ] Phase 4 integration tested
- [ ] No regression in agent confidence
- [ ] Latency overhead < 20ms

---

#### Task 5.3: Performance Benchmarking
**Owner:** QA Engineer
**Duration:** 1 day
**Priority:** P1 (High)

**Additional Benchmarks:**
- Approval query latency: ≤2ms
- Approval history insertion: ≤5ms
- Phase 4 integration overhead: ≤10ms

**Acceptance Criteria:**
- [ ] All targets met
- [ ] Benchmarks documented
- [ ] Approval workflow adds <5ms overhead

---

#### Task 5.4: Integration with CFN Loop Orchestrator
**Owner:** Integration Engineer
**Duration:** 2 days
**Priority:** P1 (High)

**(Unchanged from original plan)**

---

### 7.3 Phase 5 Deliverables

**Integrations:**
- `src/cli/agent-prompt-builder.ts` (modified with approval awareness)
- `.claude/skills/cfn-loop-orchestration/orchestrate.sh` (modified)

**Tests:**
- E2E tests (7 scenarios including approval workflows)
- Performance benchmarks (with approval overhead)
- Phase 4 integration tests

---

## 8. Phase 6: Analytics & Optimization (Days 28-32)

### 8.1 Objectives
- Implement usage logging with approval metadata
- Create analytics dashboards (CLI-based)
- Optimize skill assignments based on data
- Document best practices

### 8.2 Tasks

#### Task 6.1: Enhanced Usage Logging
**Owner:** Backend Developer
**Duration:** 1 day
**Priority:** P1 (High)

**Enhancement - Approval Metadata:**
```typescript
await skillLoader.logSkillUsage({
  agentId: 'backend-developer-1',
  agentType: 'backend-developer',
  skillIds: [1, 2, 5],
  taskId: 'task-123',
  phase: 'loop3',
  loadedAt: new Date(),
  confidenceBefore: 0.75,
  confidenceAfter: 0.88,
  executionTimeMs: 12,

  // NEW: Approval metadata
  approvalLevels: ['auto', 'auto', 'human'],
  phase4Generated: [false, false, true]
});
```

**Acceptance Criteria:**
- [ ] Approval metadata logged
- [ ] Phase 4 origin tracked
- [ ] Queryable for analytics

---

#### Task 6.2: Analytics Dashboard (CLI) with Approval Metrics
**Owner:** Backend Developer
**Duration:** 2 days
**Priority:** P2 (Medium)

**New Analytics Commands:**
```bash
# Effectiveness by approval level
npx cfn skill analytics effectiveness-by-approval

# Output:
# Skill Effectiveness by Approval Level (30 days):
#
# Auto-approved skills:
#   - Avg confidence impact: +0.08
#   - Usage count: 1,234
#   - Success rate: 96%
#
# Human-approved skills:
#   - Avg confidence impact: +0.12
#   - Usage count: 456
#   - Success rate: 94%
#
# Escalated skills:
#   - Avg confidence impact: +0.06
#   - Usage count: 234
#   - Success rate: 89%

# Phase 4 generated skills performance
npx cfn skill analytics phase4-performance

# Approval workflow efficiency
npx cfn skill analytics approval-efficiency
```

**Acceptance Criteria:**
- [ ] Approval-level effectiveness calculated
- [ ] Phase 4 skills tracked separately
- [ ] Approval efficiency measured
- [ ] Reports formatted clearly

---

#### Task 6.3: Skill Assignment Optimization
**Owner:** Architect
**Duration:** 1 day
**Priority:** P2 (Medium)

**(Enhanced with approval-aware optimization)**

**Additional Optimization:**
- Promote high-performing auto-approved skills to more agents
- Review human-approved skills with low effectiveness
- Escalate auto-approved skills with security issues

**Acceptance Criteria:**
- [ ] 5+ optimization opportunities identified
- [ ] Approval level adjustments recommended
- [ ] Expected impact documented

---

#### Task 6.4: Documentation & Best Practices
**Owner:** Architect
**Duration:** 1 day
**Priority:** P1 (High)

**Additional Documents:**
1. **Approval Workflow Best Practices** (`docs/APPROVAL_BEST_PRACTICES.md`)
   - When to use each approval level
   - Risk assessment guidelines
   - Escalation criteria
   - Expert review checklist

2. **Phase 4 Integration Guide** (`docs/PHASE4_INTEGRATION_GUIDE.md`)
   - Auto-deployment workflow
   - Dual logging setup
   - Edge case feedback loop
   - Troubleshooting

**Acceptance Criteria:**
- [ ] All guides comprehensive
- [ ] Approval workflow documented
- [ ] Phase 4 integration explained
- [ ] Troubleshooting steps clear

---

### 8.3 Phase 6 Deliverables

**Analytics:**
- Enhanced usage logging with approval metadata
- CLI analytics dashboard (7 commands total)
- Approval efficiency tracking

**Documentation:**
- Approval workflow best practices
- Phase 4 integration guide
- Optimization recommendations

---

## 9. Phase 4 Workflow Integration (Days 33-35)

### 9.1 Objectives
- Implement automatic skill deployment from Phase 4
- Implement dual logging (SQLite + PostgreSQL)
- Implement edge case feedback loop
- Test end-to-end integration

### 9.2 Tasks

#### Task 7.1: Phase 4 → Skills DB Deployment Pipeline
**Owner:** Integration Engineer
**Duration:** 1 day
**Priority:** P0 (Critical)

**Implementation:**

**File:** `.claude/skills/workflow-codification/deploy-approved-skill.sh`

```bash
#!/bin/bash
set -euo pipefail

# Phase 4 Approval Workflow calls this script when skill is APPROVED

PATTERN_ID="$1"
SKILL_NAME="$2"
CONTENT_PATH="$3"
CATEGORY="${4:-domain}"

SKILLS_DB=".claude/skills-database/skills.db"

# 1. Calculate content hash
CONTENT_HASH=$(sha256sum "$CONTENT_PATH" | awk '{print $1}')

# 2. Determine approval level based on category and Phase 4 metrics
if [[ "$CATEGORY" == "coordination" ]]; then
  APPROVAL_LEVEL="auto"
elif [[ "$CATEGORY" == "infrastructure" ]]; then
  APPROVAL_LEVEL="escalate"
else
  APPROVAL_LEVEL="human"
fi

# 3. Insert into Skills DB
SKILL_ID=$(sqlite3 "$SKILLS_DB" <<EOF
INSERT INTO skills (name, category, team, content_path, content_hash, tags, version, status, approval_level, phase4_pattern_id, generated_by, owner)
VALUES (
  '$SKILL_NAME',
  '$CATEGORY',
  'foundation',
  '$CONTENT_PATH',
  '$CONTENT_HASH',
  '["automated", "phase4-generated"]',
  '1.0.0',
  'active',
  '$APPROVAL_LEVEL',
  $PATTERN_ID,
  'phase4',
  'workflow-codification-system'
);
SELECT last_insert_rowid();
EOF
)

# 4. Record approval decision (auto-approved by Phase 4)
sqlite3 "$SKILLS_DB" <<EOF
INSERT INTO approval_history (skill_id, version, approval_level, approver, decision, reasoning, timestamp)
VALUES (
  $SKILL_ID,
  '1.0.0',
  '$APPROVAL_LEVEL',
  'phase4-system',
  'approved',
  'Auto-approved by Phase 4 workflow codification system after expert review',
  datetime('now')
);
EOF

# 5. Auto-map to relevant agents based on pattern teams
TEAM_IDS=$(psql -h "$CFN_DB_HOST" -t -c "SELECT DISTINCT team_id FROM workflow_patterns WHERE id=$PATTERN_ID;")

for AGENT_TYPE in $TEAM_IDS; do
  sqlite3 "$SKILLS_DB" <<EOF
  INSERT INTO agent_skill_mappings (agent_type, skill_id, priority, required, conditions)
  VALUES (
    '$AGENT_TYPE',
    $SKILL_ID,
    5,
    0,
    '{"taskContext": ["automation"], "phase": "loop3"}'
  );
EOF
done

# 6. Update Phase 4 workflow_patterns status
psql -h "$CFN_DB_HOST" -c "UPDATE workflow_patterns SET status='deployed', deployed_skill_id=$SKILL_ID WHERE id=$PATTERN_ID;"

echo "✅ Skill deployed to Skills DB: $SKILL_NAME (ID: $SKILL_ID, Approval: $APPROVAL_LEVEL)"
echo "   Mapped to agents: $TEAM_IDS"
```

**Acceptance Criteria:**
- [ ] Phase 4 approved skills auto-deploy
- [ ] Approval level assigned correctly
- [ ] Agent mappings created
- [ ] PostgreSQL status updated

---

#### Task 7.2: Dual Logging Implementation
**Owner:** Backend Developer
**Duration:** 1 day
**Priority:** P0 (Critical)

**Implementation:**

**File:** `src/cli/skill-execution-logger.ts`

```typescript
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
  costAvoidedUsd?: number;
  tokensAvoided?: number;
  approvalLevel?: string;
  phase4Generated?: boolean;
}

async function logSkillExecution(metrics: SkillExecutionMetrics) {
  const skillId = await getSkillIdByName(metrics.skillName);

  // 1. Log to Skills DB (SQLite) - Analytics
  await sqliteDb.run(`
    INSERT INTO skill_usage_log (
      agent_id, agent_type, skill_id, task_id, phase,
      loaded_at, confidence_before, confidence_after, execution_time_ms
    ) VALUES (?, ?, ?, ?, ?, datetime('now'), ?, ?, ?)
  `, [
    metrics.agentId,
    metrics.agentType,
    skillId,
    metrics.taskId,
    metrics.phase,
    metrics.confidenceBefore,
    metrics.confidenceAfter,
    metrics.executionTimeMs
  ]);

  // 2. Log to Phase 4 (PostgreSQL) - Cost Tracking (if Phase 4 generated skill)
  if (metrics.phase4Generated && metrics.costAvoidedUsd) {
    await postgresDb.query(`
      INSERT INTO skill_executions (
        skill_id, team_id, task_id, execution_time_ms, exit_code,
        cost_avoided_usd, tokens_avoided, timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    `, [
      skillId,
      metrics.agentType,
      metrics.taskId,
      metrics.executionTimeMs,
      metrics.exitCode,
      metrics.costAvoidedUsd,
      metrics.tokensAvoided
    ]);
  }
}
```

**Acceptance Criteria:**
- [ ] Dual logging functional
- [ ] SQLite logs all skills
- [ ] PostgreSQL logs Phase 4 skills only
- [ ] No performance degradation

---

#### Task 7.3: Edge Case Feedback Loop
**Owner:** Integration Engineer
**Duration:** 1 day
**Priority:** P0 (Critical)

**Implementation:**

**File:** `.claude/skills/workflow-codification/propagate-skill-update.sh`

```bash
#!/bin/bash
set -euo pipefail

# Phase 4 edge case tracker calls this when skill update is approved

SKILL_NAME="$1"
NEW_VERSION="$2"
UPDATE_PATH="$3"

SKILLS_DB=".claude/skills-database/skills.db"

# 1. Calculate new content hash
NEW_HASH=$(sha256sum "$UPDATE_PATH" | awk '{print $1}')

# 2. Update Skills DB version
sqlite3 "$SKILLS_DB" <<EOF
UPDATE skills
SET version = '$NEW_VERSION',
    content_hash = '$NEW_HASH',
    content_path = '$UPDATE_PATH',
    updated_at = datetime('now')
WHERE name = '$SKILL_NAME';
EOF

# 3. Record approval for new version
SKILL_ID=$(sqlite3 "$SKILLS_DB" "SELECT id FROM skills WHERE name='$SKILL_NAME';")
sqlite3 "$SKILLS_DB" <<EOF
INSERT INTO approval_history (skill_id, version, approval_level, approver, decision, reasoning, timestamp)
VALUES (
  $SKILL_ID,
  '$NEW_VERSION',
  'auto',
  'phase4-edge-case-system',
  'approved',
  'Auto-approved skill update to resolve edge case',
  datetime('now')
);
EOF

# 4. Invalidate cache (force reload)
rm -f /tmp/skill-cache-*.json

echo "✅ Skill updated in Skills DB: $SKILL_NAME → $NEW_VERSION"
```

**Acceptance Criteria:**
- [ ] Edge case updates propagate
- [ ] Version incremented correctly
- [ ] Cache invalidated
- [ ] Approval recorded

---

#### Task 7.4: End-to-End Integration Testing
**Owner:** QA Engineer
**Duration:** 0.5 days
**Priority:** P0 (Critical)

**Test Scenarios:**
1. Phase 4 detects pattern → generates skill → auto-deploys to Skills DB
2. Agent uses Phase 4 skill → dual logging → cost tracking
3. Skill fails → edge case captured → update proposed → propagated to Skills DB

**Acceptance Criteria:**
- [ ] Full pipeline tested
- [ ] No data loss in dual logging
- [ ] Version management works
- [ ] Approval workflow integrated

---

### 9.3 Phase 7 Deliverables

**Integration Scripts:**
- `deploy-approved-skill.sh` - Phase 4 → Skills DB deployment
- `propagate-skill-update.sh` - Edge case updates to Skills DB

**TypeScript Modules:**
- `skill-execution-logger.ts` - Dual logging implementation

**Tests:**
- E2E Phase 4 integration tests

**Documentation:**
- Phase 4 integration architecture
- Troubleshooting guide

---

## 10. Deployment Guide

### 10.1 Prerequisites

**Software Requirements:**
- Node.js 18+
- SQLite 3.35+
- PostgreSQL 14+ (for Phase 4 integration)
- Bash 4.0+
- jq 1.6+

**Environment Variables:**
```bash
# Skills Database
CFN_SKILLS_DATABASE=true
CFN_SKILLS_DB_PATH=./.claude/skills-database/skills.db
CFN_ENV=production  # or staging

# Phase 4 Integration (optional)
CFN_DB_HOST=localhost
CFN_DB_PORT=5432
CFN_DB_NAME=cfn_workflow
CFN_DB_USER=cfn_user
CFN_DB_PASSWORD=secret
```

### 10.2 Deployment Steps

**Step 1: Initialize Database**
```bash
cd /home/user/claude-flow-novice
./scripts/skills-db/init-database-v2.sh
```

**Step 2: Seed from Filesystem**
```bash
./scripts/skills-db/seed-from-filesystem.sh
```

**Step 3: Export Baseline Snapshot**
```bash
npx cfn skill export --output=.claude/skills-database/snapshot-v2-baseline.yaml
```

**Step 4: Enable Feature Flag**
```bash
echo "CFN_SKILLS_DATABASE=true" >> .env
echo "CFN_ENV=production" >> .env
```

**Step 5: Test Agent Spawn**
```bash
npx claude-flow-novice agent-spawn \
  --agent=backend-developer \
  --task="Implement JWT authentication" \
  --context='{"keywords": ["auth", "jwt"]}'
```

**Step 6: Verify Skill Loading**
```bash
# Check logs for skill loading
tail -f logs/agent-spawn.log | grep "Applicable Skills"

# Expected output:
# Applicable Skills:
# ### jwt-authentication (v1.0.0) [human]
# ### error-handling (v1.2.0) [auto]
```

**Step 7: Enable Phase 4 Integration (Optional)**
```bash
# Configure PostgreSQL connection
echo "CFN_DB_HOST=localhost" >> .env
echo "CFN_DB_NAME=cfn_workflow" >> .env

# Test Phase 4 deployment
./test-phase4-deployment.sh
```

### 10.3 Rollback Plan

**If Issues Occur:**
```bash
# 1. Disable feature flag
echo "CFN_SKILLS_DATABASE=false" >> .env

# 2. Revert to static skills (automatic fallback)

# 3. Restore database from snapshot (if needed)
npx cfn skill import --input=.claude/skills-database/snapshot-v2-baseline.yaml

# 4. Investigate logs
tail -f logs/skill-loader.log
```

---

## 11. Risk Management

### 11.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Approval workflow bottleneck | High | High | Auto-approve low-risk skills, parallel expert reviews |
| Phase 4 integration failures | Medium | High | Graceful degradation, manual deployment fallback |
| Database corruption | Low | High | Daily YAML snapshots, automated backups |
| Performance degradation | Medium | Medium | Aggressive caching, query optimization |
| Approval level misclassification | Medium | Medium | Criteria validation, expert override capability |

### 11.2 Process Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Scope creep (approval features) | High | Medium | Strict phase boundaries, MVP approval workflow first |
| Timeline slippage | Medium | Medium | Buffer days, early risk identification |
| Phase 4 dependency delays | Low | High | Parallel development, mock Phase 4 for testing |
| Expert availability for approvals | High | High | Auto-approve criteria, approval SLA tracking |

---

## 12. Success Criteria

### 12.1 Functional Success

- [ ] All 62 existing skills imported with approval levels
- [ ] Bootstrap skills load without database dependency
- [ ] Approval workflow functional (auto, escalate, human)
- [ ] Phase 4 skills auto-deploy to Skills DB
- [ ] Dual logging captures all executions
- [ ] Edge case feedback loop updates skills
- [ ] CLI commands functional (15+ commands)

### 12.2 Performance Success

- [ ] Skill loading latency ≤15ms (average)
- [ ] Approval query latency ≤2ms (P95)
- [ ] Database query latency ≤3ms (P95)
- [ ] Cache hit rate ≥80%
- [ ] Phase 4 integration overhead ≤10ms
- [ ] No regression in CFN Loop success rates

### 12.3 Quality Success

- [ ] Unit test coverage ≥90%
- [ ] E2E tests cover critical paths (10+ scenarios)
- [ ] All documentation complete
- [ ] Zero breaking changes to existing workflows
- [ ] Code review approval from architect
- [ ] Approval workflow validated by security team

### 12.4 Business Success

- [ ] Prompt size reduced by ≥40% (contextual loading)
- [ ] Skill update time reduced by ≥80% (1 UPDATE vs 23 files)
- [ ] Auto-approval rate ≥60% (low-risk skills)
- [ ] Expert approval SLA ≥90% compliance
- [ ] Phase 4 skills deployed within 24h of approval
- [ ] ≥5 optimization opportunities identified from analytics

---

## Appendix A: Approval Level Decision Matrix

| Criteria | Auto | Escalate | Human |
|----------|------|----------|-------|
| **Commands** | ≤5 | 6-15 | >15 |
| **Test Coverage** | ≥90% | 70-90% | <70% |
| **External Calls** | None | Read-only | Write |
| **File Operations** | Read | Write (temp) | Write (system) |
| **Security Impact** | None | Low | High |
| **Complexity** | Low | Medium | High |
| **Business Logic** | None | Simple | Complex |

---

## Appendix B: Phase 4 Integration Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Phase 4 Workflow Codification                │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
        ┌────────────────────────────────┐
        │   Pattern Detected (≥5 uses)   │
        └────────────────┬───────────────┘
                         │
                         ▼
        ┌────────────────────────────────┐
        │   Skill Generated (AI Agent)   │
        └────────────────┬───────────────┘
                         │
                         ▼
        ┌────────────────────────────────┐
        │  Expert Review (Phase 4 CLI)   │
        └────────┬───────────────┬───────┘
                 │               │
        APPROVED │               │ REJECTED
                 │               │
                 ▼               ▼
┌────────────────────────────┐  ┌────────────────┐
│ deploy-approved-skill.sh   │  │ Archive Skill  │
│ • Insert to Skills DB      │  └────────────────┘
│ • Assign approval level    │
│ • Map to agents            │
│ • Update Phase 4 status    │
└────────────────┬───────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────────────────┐
│                      Skills Database (SQLite)                   │
│  • skills table (with approval_level, phase4_pattern_id)       │
│  • approval_history (auto-approved by Phase 4)                 │
│  • agent_skill_mappings (auto-generated)                       │
└────────────────┬───────────────────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────────────────┐
│                    Agent Execution                              │
│  • Load skill via SkillLoader                                  │
│  • Execute skill                                                │
│  • Dual logging (SQLite + PostgreSQL)                          │
└────────────────┬───────────────────────────────────────────────┘
                 │
                 ▼
        ┌────────────────────────────────┐
        │    Skill Execution Success?    │
        └────────┬───────────────┬───────┘
                 │               │
           YES   │               │ NO (Edge Case)
                 │               │
                 ▼               ▼
┌────────────────────────┐  ┌──────────────────────────────┐
│ skill_usage_log (OK)   │  │ track-edge-case.sh           │
│ skill_executions (OK)  │  │ • Capture failure            │
└────────────────────────┘  │ • Detect recurring (≥3x)     │
                            │ • generate-skill-update.sh   │
                            └────────────────┬─────────────┘
                                             │
                                             ▼
                            ┌────────────────────────────────┐
                            │ propagate-skill-update.sh      │
                            │ • Update version in Skills DB  │
                            │ • Record approval (auto)       │
                            │ • Invalidate cache             │
                            └────────────────────────────────┘
```

---

**Document Status:** Ready for Implementation
**Estimated Completion:** 7 weeks from start date
**Next Action:** Architect approval + team assignment
