# Unified Data Model and Correlation Strategy

**Date:** 2025-11-15
**Purpose:** Cross-database correlation and unified data architecture for PostgreSQL, SQLite, and Redis
**Status:** Design Specification
**Confidence:** 0.92

---

## Executive Summary

This document defines a **universal correlation strategy** across three database systems to enable seamless data integration, consistent analytics, and reliable cross-system queries without requiring complex ETL pipelines.

**Problem Statement:**
- PostgreSQL (Phase 4): Workflow patterns, skill executions, edge cases
- SQLite (Skills DB): Skill metadata, agent mappings, usage analytics
- SQLite (CFN Coordination): Agent lifecycle, task tracking, coordination events
- Redis: Real-time task queues, completion signals, agent status

**Solution:**
- Universal correlation keys (task_id, agent_id, skill_id)
- Standard metadata schema (JSON columns with correlation data)
- Application-level joins via correlation keys
- Event sourcing pattern for cross-database consistency
- Schema versioning with backward compatibility

**Benefits:**
- ✅ 30+ cross-database queries without complex joins
- ✅ Eventual consistency with reconciliation jobs
- ✅ Independent database scaling
- ✅ Clean separation of concerns (transactional vs analytical)
- ✅ No vendor lock-in (database-agnostic correlation)

---

## Table of Contents

1. [Universal Correlation Keys](#1-universal-correlation-keys)
2. [Standard Metadata Schema](#2-standard-metadata-schema)
3. [Entity Relationship Diagram](#3-entity-relationship-diagram)
4. [Cross-Database Query Patterns](#4-cross-database-query-patterns)
5. [Data Consistency Strategy](#5-data-consistency-strategy)
6. [Schema Versioning](#6-schema-versioning)
7. [Migration Plan](#7-migration-plan)
8. [Query Pattern Library](#8-query-pattern-library-30-patterns)
9. [Consistency Monitoring](#9-consistency-monitoring)
10. [Implementation Roadmap](#10-implementation-roadmap)

---

## 1. Universal Correlation Keys

### 1.1 Primary Correlation Keys

#### task_id (UUID v4)
**Format:** `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`
**Purpose:** Primary correlation across ALL systems
**Generation:** `uuidv4()` at task creation time
**Scope:** Global (unique across all databases)
**Lifetime:** Permanent (never reused)

**Example:**
```
task_id: "a7f3b2c1-4d5e-4a1b-9c8d-7e6f5a4b3c2d"
```

**Storage:**
- PostgreSQL: `workflow_patterns.task_id`, `skill_executions.task_id`, `edge_cases.task_id`
- SQLite (Skills DB): `skill_usage_log.task_id`
- SQLite (CFN): `tasks.id`, `agents.task_id`, `coordination_events.task_id`
- Redis: `task:queue`, `task:{task_id}`, `swarm:{task_id}:*`

---

#### agent_id (Composite)
**Format:** `{agent_type}-{timestamp}-{pid}`
**Purpose:** Track individual agent instances across systems
**Generation:** At agent spawn time
**Scope:** Per-task (unique within task execution)
**Lifetime:** Ephemeral (lifecycle of agent container/process)

**Example:**
```
agent_id: "backend-developer-1731686400-12345"
agent_id: "tester-1731686450-12346"
```

**Components:**
- `agent_type`: Agent specialization (backend-developer, tester, frontend-developer)
- `timestamp`: Unix epoch seconds (sortable, unique)
- `pid`: Process ID (prevents collisions in parallel spawns)

**Storage:**
- PostgreSQL: `skill_executions.agent_id`, `skill_approvals.reviewer_id`
- SQLite (Skills DB): `skill_usage_log.agent_id`, `agent_skill_mappings.agent_type`
- SQLite (CFN): `agents.id`, `coordination_events.agent_id`
- Redis: `agent:{agent_id}:status`, `swarm:{task_id}:{agent_id}:done`

---

#### skill_id (Cross-Reference)
**Format:** Integer (auto-increment) OR UUID (if globally unique)
**Purpose:** Link workflow patterns to deployed skills
**Generation:** PostgreSQL `workflow_patterns.id` → SQLite `skills.id`
**Scope:** Global (unique identifier for skill)
**Lifetime:** Permanent (with versioning)

**Cross-Database Mapping:**
```
PostgreSQL: workflow_patterns.id = 42
            workflow_patterns.deployed_skill_id = "skill-npm-build-test"

SQLite:     skills.id = 1001
            skills.name = "codified-npm-build-test"
            skills.source_pattern_id = 42  -- NEW COLUMN
```

**Storage:**
- PostgreSQL: `workflow_patterns.id`, `workflow_patterns.deployed_skill_id`
- SQLite (Skills DB): `skills.id`, `skills.source_pattern_id` (references PostgreSQL)
- SQLite (Skills DB): `skill_usage_log.skill_id`, `agent_skill_mappings.skill_id`

---

#### session_id (Optional - Multi-Task Sessions)
**Format:** UUID v4
**Purpose:** Group related tasks in a larger workflow
**Generation:** At session start (e.g., CFN Loop epic execution)
**Scope:** Global (spans multiple tasks)
**Lifetime:** Duration of session (hours to days)

**Example:**
```
session_id: "b8e4c3d2-5f6g-4b2c-8d9e-6f7g5h4i3j2k"

Related tasks:
- task_id: "a7f3b2c1-..." (session_id: "b8e4c3d2-...")
- task_id: "c9g5d4e3-..." (session_id: "b8e4c3d2-...")
- task_id: "e1h7f6g5-..." (session_id: "b8e4c3d2-...")
```

**Storage:**
- PostgreSQL: `workflow_patterns.session_id` (NEW)
- SQLite (CFN): `tasks.session_id` (NEW)
- Redis: `session:{session_id}:tasks` (list of task_ids)

---

### 1.2 Correlation Key Standards

#### Key Generation Rules

**task_id:**
```javascript
// Node.js
const { v4: uuidv4 } = require('uuid');
const taskId = uuidv4();

// Bash
TASK_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
```

**agent_id:**
```bash
AGENT_TYPE="backend-developer"
TIMESTAMP=$(date +%s)
PID=$$
AGENT_ID="${AGENT_TYPE}-${TIMESTAMP}-${PID}"
```

**skill_id (cross-reference):**
```sql
-- PostgreSQL: Create pattern
INSERT INTO workflow_patterns (pattern_name, task_id, ...)
VALUES ('npm-build-test', 'a7f3b2c1-...', ...)
RETURNING id;  -- Returns: 42

-- SQLite: Deploy skill
INSERT INTO skills (name, source_pattern_id, ...)
VALUES ('codified-npm-build-test', 42, ...)
RETURNING id;  -- Returns: 1001

-- PostgreSQL: Update pattern with deployed skill reference
UPDATE workflow_patterns
SET deployed_skill_id = 'codified-npm-build-test'
WHERE id = 42;
```

---

#### Key Validation Rules

**task_id:**
- ✅ MUST be UUID v4 format
- ✅ MUST be lowercase
- ✅ MUST be globally unique
- ❌ NEVER null in operational tables
- ❌ NEVER reused after task completion

**agent_id:**
- ✅ MUST follow `{type}-{timestamp}-{pid}` format
- ✅ timestamp MUST be Unix epoch (10 digits)
- ✅ pid MUST be positive integer
- ❌ NEVER contain spaces or special chars (except hyphen)
- ❌ NEVER exceed 255 characters

**skill_id:**
- ✅ MUST exist in skills table before reference
- ✅ MUST have corresponding source_pattern_id (if codified)
- ❌ NEVER orphaned (referential integrity enforced)

---

## 2. Standard Metadata Schema

### 2.1 Correlation Metadata (JSON Column)

All tables SHOULD include a `correlation_metadata` JSON column with standardized structure:

```json
{
  "task_id": "a7f3b2c1-4d5e-4a1b-9c8d-7e6f5a4b3c2d",
  "agent_id": "backend-developer-1731686400-12345",
  "session_id": "b8e4c3d2-5f6g-4b2c-8d9e-6f7g5h4i3j2k",
  "parent_task_id": "c9g5d4e3-6h7i-5c3d-9e0f-7g8h6i5j4k3l",
  "iteration": 2,
  "phase": "Loop3",
  "tags": ["authentication", "jwt", "security"],
  "domain": "software-development",
  "priority": "high",
  "source_system": "cfn-loop-cli",
  "created_by": "cfn-v3-coordinator",
  "correlation_version": "1.0"
}
```

### 2.2 Standard Timestamp Columns

**Required columns for all tables:**
```sql
created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
```

**PostgreSQL:**
```sql
created_at TIMESTAMP DEFAULT NOW()
updated_at TIMESTAMP DEFAULT NOW()

-- Trigger for updated_at
CREATE TRIGGER update_timestamp
BEFORE UPDATE ON {table_name}
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
```

**SQLite:**
```sql
created_at TEXT DEFAULT (datetime('now'))
updated_at TEXT DEFAULT (datetime('now'))

-- Trigger for updated_at
CREATE TRIGGER update_{table_name}_timestamp
AFTER UPDATE ON {table_name}
FOR EACH ROW
BEGIN
  UPDATE {table_name}
  SET updated_at = datetime('now')
  WHERE id = NEW.id;
END;
```

---

### 2.3 Schema Additions by Database

#### PostgreSQL (Phase 4 Tables)

**workflow_patterns:**
```sql
ALTER TABLE workflow_patterns ADD COLUMN IF NOT EXISTS task_id UUID;
ALTER TABLE workflow_patterns ADD COLUMN IF NOT EXISTS session_id UUID;
ALTER TABLE workflow_patterns ADD COLUMN IF NOT EXISTS correlation_metadata JSONB;
ALTER TABLE workflow_patterns ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

CREATE INDEX idx_workflow_patterns_task_id ON workflow_patterns(task_id);
CREATE INDEX idx_workflow_patterns_session_id ON workflow_patterns(session_id);
CREATE INDEX idx_workflow_patterns_correlation ON workflow_patterns USING GIN (correlation_metadata);
```

**skill_executions:**
```sql
ALTER TABLE skill_executions ADD COLUMN IF NOT EXISTS agent_id TEXT;
ALTER TABLE skill_executions ADD COLUMN IF NOT EXISTS correlation_metadata JSONB;
ALTER TABLE skill_executions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

CREATE INDEX idx_skill_executions_task_id ON skill_executions(task_id);
CREATE INDEX idx_skill_executions_agent_id ON skill_executions(agent_id);
CREATE INDEX idx_skill_executions_correlation ON skill_executions USING GIN (correlation_metadata);
```

**edge_cases:**
```sql
ALTER TABLE edge_cases ADD COLUMN IF NOT EXISTS agent_id TEXT;
ALTER TABLE edge_cases ADD COLUMN IF NOT EXISTS correlation_metadata JSONB;
ALTER TABLE edge_cases ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

CREATE INDEX idx_edge_cases_task_id ON edge_cases(task_id);
CREATE INDEX idx_edge_cases_agent_id ON edge_cases(agent_id);
```

**skill_approvals:**
```sql
ALTER TABLE skill_approvals ADD COLUMN IF NOT EXISTS task_id UUID;
ALTER TABLE skill_approvals ADD COLUMN IF NOT EXISTS correlation_metadata JSONB;
ALTER TABLE skill_approvals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

CREATE INDEX idx_skill_approvals_task_id ON skill_approvals(task_id);
```

---

#### SQLite (Skills DB Tables)

**skills:**
```sql
ALTER TABLE skills ADD COLUMN source_pattern_id INTEGER;  -- References PostgreSQL workflow_patterns.id
ALTER TABLE skills ADD COLUMN task_id TEXT;  -- UUID of generation task
ALTER TABLE skills ADD COLUMN correlation_metadata TEXT;  -- JSON string
ALTER TABLE skills ADD COLUMN updated_at TEXT DEFAULT (datetime('now'));

CREATE INDEX idx_skills_source_pattern ON skills(source_pattern_id);
CREATE INDEX idx_skills_task_id ON skills(task_id);
```

**skill_usage_log:**
```sql
-- Already has: agent_id, agent_type, skill_id, task_id
ALTER TABLE skill_usage_log ADD COLUMN session_id TEXT;
ALTER TABLE skill_usage_log ADD COLUMN correlation_metadata TEXT;  -- JSON string
ALTER TABLE skill_usage_log ADD COLUMN updated_at TEXT DEFAULT (datetime('now'));

CREATE INDEX idx_skill_usage_session ON skill_usage_log(session_id);
```

**agent_skill_mappings:**
```sql
ALTER TABLE agent_skill_mappings ADD COLUMN correlation_metadata TEXT;  -- JSON string
ALTER TABLE agent_skill_mappings ADD COLUMN updated_at TEXT DEFAULT (datetime('now'));
```

---

#### SQLite (CFN Coordination Tables)

**agents:**
```sql
-- Schema: id (agent_id), type, status, confidence, spawned_at, completed_at, metadata
ALTER TABLE agents ADD COLUMN task_id TEXT;
ALTER TABLE agents ADD COLUMN session_id TEXT;
ALTER TABLE agents ADD COLUMN correlation_metadata TEXT;  -- JSON string
ALTER TABLE agents ADD COLUMN updated_at TEXT DEFAULT (datetime('now'));

CREATE INDEX idx_agents_task_id ON agents(task_id);
CREATE INDEX idx_agents_session_id ON agents(session_id);
```

**tasks:**
```sql
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,  -- task_id (UUID)
  session_id TEXT,
  description TEXT,
  domain TEXT,
  priority TEXT,
  status TEXT,
  correlation_metadata TEXT,  -- JSON string
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_tasks_session_id ON tasks(session_id);
CREATE INDEX idx_tasks_status ON tasks(status);
```

**coordination_events:**
```sql
CREATE TABLE IF NOT EXISTS coordination_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  event_type TEXT NOT NULL,  -- 'spawned', 'completed', 'signal', 'error'
  event_data TEXT,  -- JSON string
  correlation_metadata TEXT,  -- JSON string
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_coord_events_task_id ON coordination_events(task_id);
CREATE INDEX idx_coord_events_agent_id ON coordination_events(agent_id);
CREATE INDEX idx_coord_events_type ON coordination_events(event_type);
```

---

## 3. Entity Relationship Diagram

### 3.1 Cross-Database ERD

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         UNIFIED DATA MODEL                                   │
│                    Cross-Database Correlation                                │
└──────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  PostgreSQL (Phase 4 - Pattern Detection & Cost Tracking)                  │
└─────────────────────────────────────────────────────────────────────────────┘

    workflow_patterns                  skill_executions
    ┌──────────────────┐              ┌──────────────────┐
    │ id (PK)          │              │ id (PK)          │
    │ pattern_name     │              │ skill_id (FK)    │───┐
    │ task_id (UUID)   │──────────────│ task_id (UUID)   │   │
    │ session_id (UUID)│              │ agent_id         │   │
    │ deployed_skill_id│──────┐       │ execution_time_ms│   │
    │ correlation_meta │      │       │ cost_avoided_usd │   │
    │ created_at       │      │       │ correlation_meta │   │
    │ updated_at       │      │       │ created_at       │   │
    └──────────────────┘      │       └──────────────────┘   │
            │                 │                               │
            │                 │       edge_cases              │
            │                 │       ┌──────────────────┐   │
            └─────────────────┼───────│ id (PK)          │   │
                              │       │ skill_id (FK)    │───┤
                              │       │ task_id (UUID)   │   │
                              │       │ agent_id         │   │
                              │       │ failure_reason   │   │
                              │       │ correlation_meta │   │
                              │       │ created_at       │   │
                              │       └──────────────────┘   │
                              │                              │
                              │       skill_approvals        │
                              │       ┌──────────────────┐   │
                              │       │ id (PK)          │   │
                              │       │ skill_id (FK)    │───┤
                              │       │ task_id (UUID)   │   │
                              │       │ reviewer_id      │   │
                              │       │ status           │   │
                              │       │ correlation_meta │   │
                              │       │ created_at       │   │
                              │       └──────────────────┘   │
                              │                              │
┌─────────────────────────────────────────────────────────────────────────────┐
│  SQLite - Skills DB (Skill Metadata & Analytics)                           │
└─────────────────────────────────────────────────────────────────────────────┘
                              │                              │
    skills                    │                              │
    ┌──────────────────┐      │                              │
    │ id (PK)          │◄─────┘ (deployed_skill_id)          │
    │ name             │                                      │
    │ source_pattern_id│───► PostgreSQL workflow_patterns.id │
    │ task_id (UUID)   │                                      │
    │ version          │                                      │
    │ content_path     │                                      │
    │ correlation_meta │                                      │
    │ created_at       │                                      │
    │ updated_at       │                                      │
    └────┬─────────────┘                                      │
         │                                                     │
         │              agent_skill_mappings                  │
         │              ┌──────────────────┐                  │
         └──────────────│ id (PK)          │                  │
                        │ agent_type       │                  │
                        │ skill_id (FK)    │                  │
                        │ priority         │                  │
                        │ correlation_meta │                  │
                        │ created_at       │                  │
                        │ updated_at       │                  │
                        └────┬─────────────┘                  │
                             │                                │
                             │                                │
    skill_usage_log          │                                │
    ┌──────────────────┐     │                                │
    │ id (PK)          │     │                                │
    │ agent_id         │─────┘                                │
    │ agent_type       │                                      │
    │ skill_id (FK)    │◄─────────────────────────────────────┘
    │ task_id (UUID)   │───┐
    │ session_id (UUID)│   │
    │ phase            │   │
    │ confidence_before│   │
    │ confidence_after │   │
    │ execution_time_ms│   │
    │ correlation_meta │   │
    │ loaded_at        │   │
    └──────────────────┘   │
                           │
┌─────────────────────────────────────────────────────────────────────────────┐
│  SQLite - CFN Coordination (Agent Lifecycle & Task Tracking)               │
└─────────────────────────────────────────────────────────────────────────────┘
                           │
    tasks                  │
    ┌──────────────────┐   │
    │ id (PK/UUID)     │◄──┘ (task_id correlation)
    │ session_id (UUID)│
    │ description      │
    │ domain           │
    │ priority         │
    │ status           │
    │ correlation_meta │
    │ created_at       │
    │ updated_at       │
    └────┬─────────────┘
         │
         │              agents
         │              ┌──────────────────┐
         └──────────────│ id (PK)          │  (agent_id)
                        │ task_id (FK/UUID)│
                        │ session_id (UUID)│
                        │ type             │
                        │ status           │
                        │ confidence       │
                        │ spawned_at       │
                        │ completed_at     │
                        │ correlation_meta │
                        │ updated_at       │
                        └────┬─────────────┘
                             │
                             │
    coordination_events      │
    ┌──────────────────┐     │
    │ id (PK)          │     │
    │ task_id (UUID)   │◄────┤
    │ agent_id         │◄────┘
    │ event_type       │
    │ event_data       │
    │ correlation_meta │
    │ created_at       │
    └──────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  Redis (Real-Time Coordination - Ephemeral)                                │
└─────────────────────────────────────────────────────────────────────────────┘

    task:queue                  LIST    [task_ids...]
    task:total                  STRING  Total tasks
    task:completed              STRING  Completed count

    task:{task_id}              HASH    Task metadata
      ├─ batch_id
      ├─ files
      ├─ agent_type
      └─ correlation_metadata (JSON)

    task:{task_id}:result       HASH    Task result
      ├─ agent_id
      ├─ status
      ├─ files_modified
      └─ completed_at

    swarm:{task_id}:{agent_id}:done    STRING  Completion signal

    agent:{agent_id}:status     HASH    Agent status
      ├─ task_id
      ├─ phase
      ├─ confidence
      └─ last_heartbeat

    session:{session_id}:tasks  SET     Task IDs in session

┌─────────────────────────────────────────────────────────────────────────────┐
│  Correlation Keys (Cross-Database)                                         │
└─────────────────────────────────────────────────────────────────────────────┘

task_id (UUID) ────► PostgreSQL: workflow_patterns, skill_executions, edge_cases
               └───► SQLite (Skills): skill_usage_log
               └───► SQLite (CFN): tasks, agents, coordination_events
               └───► Redis: task:{task_id}, swarm:{task_id}:*

agent_id (Composite) ─► PostgreSQL: skill_executions, edge_cases
                     └─► SQLite (Skills): skill_usage_log
                     └─► SQLite (CFN): agents, coordination_events
                     └─► Redis: agent:{agent_id}:status, swarm:*:{agent_id}:*

skill_id (Cross-Ref) ─► PostgreSQL: workflow_patterns.id (source)
                     └─► SQLite (Skills): skills.source_pattern_id (reference)
                     └─► SQLite (Skills): skill_usage_log.skill_id

session_id (UUID) ───► PostgreSQL: workflow_patterns.session_id
                  └──► SQLite (Skills): skill_usage_log.session_id
                  └──► SQLite (CFN): tasks.session_id, agents.session_id
                  └──► Redis: session:{session_id}:tasks
```

---

### 3.2 Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DATA FLOW & CORRELATION                              │
└─────────────────────────────────────────────────────────────────────────────┘

1. TASK CREATION
   ┌──────────────────────────────────────────────┐
   │ User: "Implement JWT authentication"         │
   └──────────────────────────────────────────────┘
                      ↓
   ┌──────────────────────────────────────────────┐
   │ Generate: task_id = uuid()                   │
   │           session_id = uuid() (if epic)      │
   └──────────────────────────────────────────────┘
                      ↓
   ┌──────────────────────────────────────────────┐
   │ INSERT INTO tasks (CFN SQLite)               │
   │   id = task_id                               │
   │   session_id = session_id                    │
   │   correlation_metadata = {...}               │
   └──────────────────────────────────────────────┘
                      ↓
   ┌──────────────────────────────────────────────┐
   │ LPUSH task:queue task_id (Redis)             │
   │ SET task:{task_id} correlation_data (Redis)  │
   └──────────────────────────────────────────────┘

2. AGENT SPAWN
   ┌──────────────────────────────────────────────┐
   │ Generate: agent_id = "backend-1731686400-123"│
   └──────────────────────────────────────────────┘
                      ↓
   ┌──────────────────────────────────────────────┐
   │ INSERT INTO agents (CFN SQLite)              │
   │   id = agent_id                              │
   │   task_id = task_id                          │
   │   correlation_metadata = {task_id, ...}      │
   └──────────────────────────────────────────────┘
                      ↓
   ┌──────────────────────────────────────────────┐
   │ HSET agent:{agent_id}:status ... (Redis)     │
   │   task_id = task_id                          │
   └──────────────────────────────────────────────┘
                      ↓
   ┌──────────────────────────────────────────────┐
   │ INSERT INTO coordination_events (CFN SQLite) │
   │   task_id = task_id                          │
   │   agent_id = agent_id                        │
   │   event_type = 'spawned'                     │
   └──────────────────────────────────────────────┘

3. SKILL EXECUTION
   ┌──────────────────────────────────────────────┐
   │ Agent executes skill: "codified-npm-build"   │
   └──────────────────────────────────────────────┘
                      ↓
   ┌──────────────────────────────────────────────┐
   │ INSERT INTO skill_usage_log (Skills SQLite)  │
   │   task_id = task_id                          │
   │   agent_id = agent_id                        │
   │   skill_id = 1001                            │
   │   session_id = session_id                    │
   │   correlation_metadata = {...}               │
   └──────────────────────────────────────────────┘
                      ↓
   ┌──────────────────────────────────────────────┐
   │ INSERT INTO skill_executions (PostgreSQL)    │
   │   task_id = task_id                          │
   │   agent_id = agent_id                        │
   │   skill_id = 1001                            │
   │   cost_avoided_usd = 0.0024                  │
   │   correlation_metadata = {...}               │
   └──────────────────────────────────────────────┘

4. TASK COMPLETION
   ┌──────────────────────────────────────────────┐
   │ Agent completes task                         │
   └──────────────────────────────────────────────┘
                      ↓
   ┌──────────────────────────────────────────────┐
   │ INCR task:completed (Redis)                  │
   │ HSET task:{task_id}:result ... (Redis)       │
   │ SET swarm:{task_id}:{agent_id}:done (Redis)  │
   └──────────────────────────────────────────────┘
                      ↓
   ┌──────────────────────────────────────────────┐
   │ UPDATE agents (CFN SQLite)                   │
   │   status = 'completed'                       │
   │   completed_at = NOW()                       │
   │   confidence = 0.85                          │
   └──────────────────────────────────────────────┘
                      ↓
   ┌──────────────────────────────────────────────┐
   │ INSERT INTO coordination_events (CFN SQLite) │
   │   event_type = 'completed'                   │
   │   correlation_metadata = {...}               │
   └──────────────────────────────────────────────┘

5. CROSS-DATABASE ANALYTICS
   ┌──────────────────────────────────────────────┐
   │ Application-level join via task_id           │
   │                                              │
   │ SELECT                                       │
   │   pg.pattern_name,                           │
   │   sk.avg_confidence_delta,                   │
   │   cfn.agent_count,                           │
   │   pg.cost_savings                            │
   │ FROM                                         │
   │   workflow_patterns pg (PostgreSQL)          │
   │   JOIN skill_usage_log sk (Skills SQLite)    │
   │     ON pg.task_id = sk.task_id               │
   │   JOIN agents cfn (CFN SQLite)               │
   │     ON pg.task_id = cfn.task_id              │
   └──────────────────────────────────────────────┘
```

---

## 4. Cross-Database Query Patterns

### 4.1 Application-Level Joins

Since databases are separate (PostgreSQL, SQLite, Redis), joins are performed at the **application layer** using correlation keys.

**Pattern:**
1. Query Database A with filter
2. Extract correlation keys (task_id, agent_id)
3. Query Database B using extracted keys
4. Merge results in application code

**Example: Cost savings per task with agent performance**
```javascript
// Step 1: Query PostgreSQL for cost savings
const pgResults = await postgresDb.query(`
  SELECT
    task_id,
    SUM(cost_avoided_usd) AS total_savings,
    COUNT(*) AS execution_count
  FROM skill_executions
  WHERE created_at >= NOW() - INTERVAL '30 days'
  GROUP BY task_id
`);

// Step 2: Extract task_ids
const taskIds = pgResults.rows.map(r => r.task_id);

// Step 3: Query SQLite for agent performance
const sqliteResults = await sqliteDb.all(`
  SELECT
    task_id,
    AVG(confidence_after - confidence_before) AS avg_confidence_delta,
    COUNT(DISTINCT agent_id) AS agent_count
  FROM skill_usage_log
  WHERE task_id IN (${taskIds.map(() => '?').join(',')})
  GROUP BY task_id
`, taskIds);

// Step 4: Merge results
const merged = pgResults.rows.map(pg => {
  const sqlite = sqliteResults.find(s => s.task_id === pg.task_id);
  return {
    task_id: pg.task_id,
    total_savings: pg.total_savings,
    execution_count: pg.execution_count,
    avg_confidence_delta: sqlite?.avg_confidence_delta || 0,
    agent_count: sqlite?.agent_count || 0
  };
});
```

---

### 4.2 Materialized Views (Periodic Sync)

For frequently accessed analytics, create **materialized views** that periodically sync data across databases.

**Example: Daily skill effectiveness summary**
```sql
-- SQLite: Create materialized view table
CREATE TABLE IF NOT EXISTS skill_effectiveness_mv (
  skill_id INTEGER,
  skill_name TEXT,
  total_executions INTEGER,
  total_savings_usd REAL,
  avg_confidence_delta REAL,
  edge_case_count INTEGER,
  last_updated TEXT,
  PRIMARY KEY (skill_id)
);

-- Sync script (run daily via cron)
-- sync-skill-effectiveness.sh
#!/bin/bash

# 1. Query PostgreSQL for cost data
psql -t -c "
  SELECT
    se.skill_id,
    COUNT(*) AS total_executions,
    SUM(cost_avoided_usd) AS total_savings_usd,
    COUNT(DISTINCT ec.id) AS edge_case_count
  FROM skill_executions se
  LEFT JOIN edge_cases ec ON se.skill_id = ec.skill_id
  WHERE se.created_at >= NOW() - INTERVAL '30 days'
  GROUP BY se.skill_id
" > /tmp/pg_skill_data.csv

# 2. Query SQLite for confidence data
sqlite3 skills.db << EOF > /tmp/sqlite_skill_data.csv
  SELECT
    skill_id,
    name,
    AVG(confidence_after - confidence_before) AS avg_confidence_delta
  FROM skills
  JOIN skill_usage_log ON skills.id = skill_usage_log.skill_id
  WHERE loaded_at >= datetime('now', '-30 days')
  GROUP BY skill_id, name;
EOF

# 3. Merge and insert into materialized view
# (Python script or SQL logic to merge CSV data)
python3 << PYTHON
import csv
import sqlite3

# Read data
pg_data = {}
with open('/tmp/pg_skill_data.csv') as f:
    reader = csv.DictReader(f, delimiter='|')
    for row in reader:
        pg_data[row['skill_id']] = row

sqlite_data = {}
with open('/tmp/sqlite_skill_data.csv') as f:
    reader = csv.DictReader(f, delimiter='|')
    for row in reader:
        sqlite_data[row['skill_id']] = row

# Merge and insert
conn = sqlite3.connect('skills.db')
cursor = conn.cursor()

for skill_id, pg_row in pg_data.items():
    sqlite_row = sqlite_data.get(skill_id, {})
    cursor.execute('''
      INSERT OR REPLACE INTO skill_effectiveness_mv
      (skill_id, skill_name, total_executions, total_savings_usd,
       avg_confidence_delta, edge_case_count, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ''', (
      skill_id,
      sqlite_row.get('name', 'unknown'),
      pg_row['total_executions'],
      pg_row['total_savings_usd'],
      sqlite_row.get('avg_confidence_delta', 0),
      pg_row['edge_case_count']
    ))

conn.commit()
conn.close()
PYTHON
```

---

### 4.3 Event Sourcing Pattern

For real-time consistency, use **event sourcing** where all systems publish events to a central bus (Redis Streams or message queue).

**Architecture:**
```
PostgreSQL ──► Event Publisher ──► Redis Stream ──► Event Consumers
SQLite ────────────────────────────────────────────────────┘
```

**Example: Skill execution event**
```javascript
// Publisher (on skill execution)
const event = {
  event_id: uuidv4(),
  event_type: 'skill.executed',
  task_id: 'a7f3b2c1-...',
  agent_id: 'backend-1731686400-123',
  skill_id: 1001,
  cost_avoided_usd: 0.0024,
  confidence_delta: 0.10,
  timestamp: Date.now(),
  correlation_metadata: { ... }
};

// Publish to Redis Stream
await redis.xadd('events:skill_execution', '*',
  'event_id', event.event_id,
  'data', JSON.stringify(event)
);

// Consumer 1: PostgreSQL writer
async function consumeForPostgres() {
  const events = await redis.xread('BLOCK', 5000, 'STREAMS', 'events:skill_execution', '0');
  for (const [stream, messages] of events) {
    for (const [id, fields] of messages) {
      const event = JSON.parse(fields.data);
      await postgresDb.query(`
        INSERT INTO skill_executions (task_id, agent_id, skill_id, cost_avoided_usd, ...)
        VALUES ($1, $2, $3, $4, ...)
      `, [event.task_id, event.agent_id, event.skill_id, event.cost_avoided_usd, ...]);
    }
  }
}

// Consumer 2: SQLite writer
async function consumeForSQLite() {
  const events = await redis.xread('BLOCK', 5000, 'STREAMS', 'events:skill_execution', '0');
  for (const [stream, messages] of events) {
    for (const [id, fields] of messages) {
      const event = JSON.parse(fields.data);
      await sqliteDb.run(`
        INSERT INTO skill_usage_log (task_id, agent_id, skill_id, confidence_before, confidence_after, ...)
        VALUES (?, ?, ?, ?, ?, ...)
      `, [event.task_id, event.agent_id, event.skill_id, event.confidence_before, event.confidence_after, ...]);
    }
  }
}
```

**Benefits:**
- ✅ Eventual consistency (all DBs updated asynchronously)
- ✅ Replay capability (re-populate databases from event stream)
- ✅ Audit trail (complete event history)
- ✅ Decoupled systems (publishers don't know about consumers)

---

## 5. Data Consistency Strategy

### 5.1 Eventual Consistency Model

**Principle:** Accept temporary inconsistencies across databases, reconcile periodically.

**Guarantees:**
- ✅ All writes succeed in primary database first (source of truth)
- ✅ Secondary databases updated asynchronously (within seconds to minutes)
- ✅ Reconciliation jobs detect and fix discrepancies (daily)
- ❌ NOT suitable for financial transactions or critical consistency (use PostgreSQL ACID for those)

**Example: Skill execution logging**
```
1. Agent executes skill ────────► INSERT INTO skill_executions (PostgreSQL) [PRIMARY]
                                   ↓ (success)
2. Publish event ───────────────► Redis Stream [ASYNC]
                                   ↓
3. Consumer updates SQLite ─────► INSERT INTO skill_usage_log (SQLite) [SECONDARY]
                                   ↓ (may fail temporarily)
4. Reconciliation job ──────────► Detect missing records, retry inserts [DAILY]
```

---

### 5.2 Idempotency Keys

**Problem:** Duplicate writes (retry logic, network failures)

**Solution:** Use idempotency keys (task_id + agent_id + event_type) to prevent duplicates.

**PostgreSQL:**
```sql
CREATE UNIQUE INDEX idx_skill_executions_idempotency
ON skill_executions (task_id, agent_id, skill_id, created_at::date);

-- Insert with conflict handling
INSERT INTO skill_executions (task_id, agent_id, skill_id, cost_avoided_usd, ...)
VALUES ($1, $2, $3, $4, ...)
ON CONFLICT (task_id, agent_id, skill_id, created_at::date) DO NOTHING;
```

**SQLite:**
```sql
CREATE UNIQUE INDEX idx_skill_usage_idempotency
ON skill_usage_log (task_id, agent_id, skill_id, loaded_at);

-- Insert with conflict handling
INSERT OR IGNORE INTO skill_usage_log (task_id, agent_id, skill_id, ...)
VALUES (?, ?, ?, ...);
```

---

### 5.3 Reconciliation Jobs

**Daily reconciliation script:**
```bash
#!/bin/bash
# reconcile-skill-executions.sh
# Detects missing records in SQLite that exist in PostgreSQL

set -euo pipefail

echo "Starting reconciliation: PostgreSQL → SQLite"

# 1. Get all task_ids from PostgreSQL (last 7 days)
TASK_IDS=$(psql -t -c "
  SELECT DISTINCT task_id
  FROM skill_executions
  WHERE created_at >= NOW() - INTERVAL '7 days'
")

MISSING_COUNT=0

# 2. Check each task_id exists in SQLite
for TASK_ID in $TASK_IDS; do
  EXISTS=$(sqlite3 skills.db "
    SELECT COUNT(*) FROM skill_usage_log WHERE task_id='$TASK_ID'
  ")

  if [ "$EXISTS" -eq 0 ]; then
    echo "Missing task_id in SQLite: $TASK_ID"
    MISSING_COUNT=$((MISSING_COUNT + 1))

    # 3. Fetch data from PostgreSQL
    PG_DATA=$(psql -t -c "
      SELECT task_id, agent_id, skill_id, execution_time_ms
      FROM skill_executions
      WHERE task_id='$TASK_ID'
    ")

    # 4. Insert into SQLite
    sqlite3 skills.db << EOF
      INSERT OR IGNORE INTO skill_usage_log (task_id, agent_id, skill_id, execution_time_ms, loaded_at)
      VALUES ('$TASK_ID', '$AGENT_ID', $SKILL_ID, $EXECUTION_TIME_MS, datetime('now'));
EOF
  fi
done

echo "Reconciliation complete: $MISSING_COUNT records fixed"

# 5. Alert if too many discrepancies
if [ "$MISSING_COUNT" -gt 100 ]; then
  echo "WARNING: High discrepancy count ($MISSING_COUNT) - check event consumers"
  # Send alert (email, Slack, PagerDuty)
fi
```

---

## 6. Schema Versioning

### 6.1 Schema Version Table

**All databases include:**
```sql
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  description TEXT NOT NULL,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- PostgreSQL
INSERT INTO schema_version (version, description)
VALUES (1, 'Add correlation columns to workflow_patterns');

-- SQLite
INSERT INTO schema_version (version, description)
VALUES (1, 'Add source_pattern_id to skills table');
```

---

### 6.2 Migration Scripts

**PostgreSQL migration: `migrations/20251115_add_correlation_v1.sql`**
```sql
-- Migration: Add correlation columns (v1)
BEGIN;

-- 1. Add columns
ALTER TABLE workflow_patterns ADD COLUMN IF NOT EXISTS task_id UUID;
ALTER TABLE workflow_patterns ADD COLUMN IF NOT EXISTS session_id UUID;
ALTER TABLE workflow_patterns ADD COLUMN IF NOT EXISTS correlation_metadata JSONB;
ALTER TABLE workflow_patterns ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

ALTER TABLE skill_executions ADD COLUMN IF NOT EXISTS agent_id TEXT;
ALTER TABLE skill_executions ADD COLUMN IF NOT EXISTS correlation_metadata JSONB;
ALTER TABLE skill_executions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

ALTER TABLE edge_cases ADD COLUMN IF NOT EXISTS agent_id TEXT;
ALTER TABLE edge_cases ADD COLUMN IF NOT EXISTS correlation_metadata JSONB;
ALTER TABLE edge_cases ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

ALTER TABLE skill_approvals ADD COLUMN IF NOT EXISTS task_id UUID;
ALTER TABLE skill_approvals ADD COLUMN IF NOT EXISTS correlation_metadata JSONB;
ALTER TABLE skill_approvals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- 2. Create indexes
CREATE INDEX IF NOT EXISTS idx_workflow_patterns_task_id ON workflow_patterns(task_id);
CREATE INDEX IF NOT EXISTS idx_workflow_patterns_session_id ON workflow_patterns(session_id);
CREATE INDEX IF NOT EXISTS idx_workflow_patterns_correlation ON workflow_patterns USING GIN (correlation_metadata);

CREATE INDEX IF NOT EXISTS idx_skill_executions_task_id ON skill_executions(task_id);
CREATE INDEX IF NOT EXISTS idx_skill_executions_agent_id ON skill_executions(agent_id);
CREATE INDEX IF NOT EXISTS idx_skill_executions_correlation ON skill_executions USING GIN (correlation_metadata);

CREATE INDEX IF NOT EXISTS idx_edge_cases_task_id ON edge_cases(task_id);
CREATE INDEX IF NOT EXISTS idx_edge_cases_agent_id ON edge_cases(agent_id);

CREATE INDEX IF NOT EXISTS idx_skill_approvals_task_id ON skill_approvals(task_id);

-- 3. Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Create triggers
CREATE TRIGGER update_workflow_patterns_timestamp
BEFORE UPDATE ON workflow_patterns
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_skill_executions_timestamp
BEFORE UPDATE ON skill_executions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_edge_cases_timestamp
BEFORE UPDATE ON edge_cases
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_skill_approvals_timestamp
BEFORE UPDATE ON skill_approvals
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- 5. Record migration
INSERT INTO schema_version (version, description)
VALUES (1, 'Add correlation columns and indexes (task_id, agent_id, session_id, correlation_metadata)');

COMMIT;
```

**SQLite migration: `migrations/sqlite_skills_db_v1.sql`**
```sql
-- Migration: Add correlation columns to Skills DB (v1)
BEGIN;

-- 1. Add columns to skills table
ALTER TABLE skills ADD COLUMN source_pattern_id INTEGER;
ALTER TABLE skills ADD COLUMN task_id TEXT;
ALTER TABLE skills ADD COLUMN correlation_metadata TEXT;
ALTER TABLE skills ADD COLUMN updated_at TEXT DEFAULT (datetime('now'));

-- 2. Add columns to skill_usage_log
ALTER TABLE skill_usage_log ADD COLUMN session_id TEXT;
ALTER TABLE skill_usage_log ADD COLUMN correlation_metadata TEXT;
ALTER TABLE skill_usage_log ADD COLUMN updated_at TEXT DEFAULT (datetime('now'));

-- 3. Add columns to agent_skill_mappings
ALTER TABLE agent_skill_mappings ADD COLUMN correlation_metadata TEXT;
ALTER TABLE agent_skill_mappings ADD COLUMN updated_at TEXT DEFAULT (datetime('now'));

-- 4. Create indexes
CREATE INDEX IF NOT EXISTS idx_skills_source_pattern ON skills(source_pattern_id);
CREATE INDEX IF NOT EXISTS idx_skills_task_id ON skills(task_id);
CREATE INDEX IF NOT EXISTS idx_skill_usage_session ON skill_usage_log(session_id);

-- 5. Create updated_at triggers
CREATE TRIGGER IF NOT EXISTS update_skills_timestamp
AFTER UPDATE ON skills
FOR EACH ROW
BEGIN
  UPDATE skills SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_skill_usage_timestamp
AFTER UPDATE ON skill_usage_log
FOR EACH ROW
BEGIN
  UPDATE skill_usage_log SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_agent_skill_mappings_timestamp
AFTER UPDATE ON agent_skill_mappings
FOR EACH ROW
BEGIN
  UPDATE agent_skill_mappings SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- 6. Record migration
INSERT INTO schema_version (version, description)
VALUES (1, 'Add correlation columns (source_pattern_id, task_id, session_id, correlation_metadata)');

COMMIT;
```

---

### 6.3 Backward Compatibility

**Strategy:** Support N-1 versions (current + previous version)

**Example:**
- Version 2.0 adds `correlation_metadata` column
- Version 1.0 does NOT have this column
- Application code checks for column existence:

```javascript
async function insertSkillExecution(data) {
  const schemaVersion = await getSchemaVersion('skill_executions');

  if (schemaVersion >= 2) {
    // Use new correlation_metadata column
    await db.query(`
      INSERT INTO skill_executions (task_id, agent_id, correlation_metadata, ...)
      VALUES ($1, $2, $3, ...)
    `, [data.task_id, data.agent_id, JSON.stringify(data.correlation), ...]);
  } else {
    // Fall back to old schema (no correlation column)
    await db.query(`
      INSERT INTO skill_executions (task_id, agent_id, ...)
      VALUES ($1, $2, ...)
    `, [data.task_id, data.agent_id, ...]);
  }
}

async function getSchemaVersion(table) {
  const result = await db.query(`
    SELECT MAX(version) as version FROM schema_version
    WHERE description LIKE '%${table}%'
  `);
  return result.rows[0]?.version || 0;
}
```

---

## 7. Migration Plan

### 7.1 Phase 1: Add Correlation Columns (Week 1)

**Objective:** Add task_id, agent_id, session_id, correlation_metadata columns to all tables

**Steps:**
1. ✅ Run PostgreSQL migration: `migrations/20251115_add_correlation_v1.sql`
2. ✅ Run SQLite Skills DB migration: `migrations/sqlite_skills_db_v1.sql`
3. ✅ Run SQLite CFN migration: `migrations/sqlite_cfn_coordination_v1.sql`
4. ✅ Test column additions (no data yet)
5. ✅ Deploy application code that writes to new columns (but doesn't require them)

**Validation:**
```sql
-- PostgreSQL
SELECT column_name FROM information_schema.columns
WHERE table_name = 'workflow_patterns' AND column_name IN ('task_id', 'session_id', 'correlation_metadata');

-- SQLite
PRAGMA table_info(skills);
-- Verify source_pattern_id, task_id, correlation_metadata exist
```

---

### 7.2 Phase 2: Backfill Existing Data (Week 2)

**Objective:** Populate correlation columns for existing records

**Steps:**
1. ✅ Generate task_id for existing workflow_patterns (use created_at + id as seed)
2. ✅ Backfill agent_id for skill_executions (use team_id + timestamp)
3. ✅ Link skills.source_pattern_id to workflow_patterns.id (match by name)
4. ✅ Validate data integrity (no nulls in critical columns)

**Backfill scripts:**
```sql
-- PostgreSQL: Generate task_ids for existing patterns
UPDATE workflow_patterns
SET task_id = uuid_generate_v4()
WHERE task_id IS NULL;

-- SQLite: Link skills to source patterns
UPDATE skills
SET source_pattern_id = (
  SELECT id FROM workflow_patterns
  WHERE workflow_patterns.pattern_name = REPLACE(skills.name, 'codified-', '')
)
WHERE source_pattern_id IS NULL
  AND name LIKE 'codified-%';

-- PostgreSQL: Backfill agent_ids for executions (best-effort)
UPDATE skill_executions
SET agent_id = team_id || '-' || EXTRACT(EPOCH FROM timestamp)::INTEGER || '-0'
WHERE agent_id IS NULL;
```

---

### 7.3 Phase 3: Enable Application-Level Joins (Week 3)

**Objective:** Deploy application code that uses correlation keys for analytics

**Steps:**
1. ✅ Implement query service with application-level joins (see section 8)
2. ✅ Create materialized view sync jobs (daily cron)
3. ✅ Deploy analytics dashboard using unified queries
4. ✅ Monitor query performance (ensure <500ms for dashboard loads)

---

### 7.4 Phase 4: Event Sourcing (Optional - Week 4+)

**Objective:** Implement event-driven consistency for real-time sync

**Steps:**
1. ✅ Set up Redis Streams for event bus
2. ✅ Implement event publishers (skill execution, agent spawn, task completion)
3. ✅ Implement event consumers (PostgreSQL writer, SQLite writer)
4. ✅ Test event replay (repopulate databases from event stream)
5. ✅ Deploy reconciliation jobs (detect and fix discrepancies)

---

## 8. Query Pattern Library (30+ Patterns)

### 8.1 Cost Analytics Queries

#### Q1: Total cost savings by skill (last 30 days)
```sql
-- PostgreSQL
SELECT
  s.name AS skill_name,
  COUNT(se.id) AS total_executions,
  SUM(se.cost_avoided_usd) AS total_savings,
  AVG(se.execution_time_ms) AS avg_execution_time_ms
FROM skill_executions se
JOIN skills s ON se.skill_id = s.source_pattern_id
WHERE se.created_at >= NOW() - INTERVAL '30 days'
GROUP BY s.name
ORDER BY total_savings DESC
LIMIT 10;
```

---

#### Q2: Cost savings per agent type
```sql
-- PostgreSQL + SQLite (application-level join)

-- Step 1: Query PostgreSQL
SELECT
  agent_id,
  SUM(cost_avoided_usd) AS total_savings
FROM skill_executions
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY agent_id;

-- Step 2: Extract agent types from agent_id (backend-developer-...)
-- Step 3: Aggregate by type in application code
```

**Application code:**
```javascript
const pgResults = await postgresDb.query(`
  SELECT agent_id, SUM(cost_avoided_usd) AS total_savings
  FROM skill_executions
  WHERE created_at >= NOW() - INTERVAL '30 days'
  GROUP BY agent_id
`);

const savingsByType = {};
for (const row of pgResults.rows) {
  const agentType = row.agent_id.split('-')[0];  // Extract "backend-developer"
  savingsByType[agentType] = (savingsByType[agentType] || 0) + parseFloat(row.total_savings);
}

console.log(savingsByType);
// { "backend-developer": 12.45, "frontend-developer": 8.32, "tester": 3.21 }
```

---

#### Q3: Cost savings trend (weekly aggregation)
```sql
-- PostgreSQL
SELECT
  DATE_TRUNC('week', created_at) AS week,
  SUM(cost_avoided_usd) AS total_savings,
  COUNT(*) AS execution_count
FROM skill_executions
WHERE created_at >= NOW() - INTERVAL '90 days'
GROUP BY week
ORDER BY week DESC;
```

---

### 8.2 Skill Effectiveness Queries

#### Q4: Skills with highest confidence improvement
```sql
-- SQLite (Skills DB)
SELECT
  s.name,
  AVG(sul.confidence_after - sul.confidence_before) AS avg_confidence_delta,
  COUNT(*) AS usage_count
FROM skill_usage_log sul
JOIN skills s ON sul.skill_id = s.id
WHERE sul.loaded_at >= datetime('now', '-30 days')
  AND sul.confidence_before IS NOT NULL
  AND sul.confidence_after IS NOT NULL
GROUP BY s.name
HAVING avg_confidence_delta > 0.05
ORDER BY avg_confidence_delta DESC
LIMIT 10;
```

---

#### Q5: Underperforming skills (low confidence + high edge cases)
```sql
-- PostgreSQL (edge cases)
SELECT
  skill_id,
  COUNT(*) AS edge_case_count
FROM edge_cases
WHERE created_at >= NOW() - INTERVAL '30 days'
  AND resolved = FALSE
GROUP BY skill_id
HAVING COUNT(*) >= 5;

-- SQLite (low confidence)
SELECT
  skill_id,
  AVG(confidence_after - confidence_before) AS avg_confidence_delta
FROM skill_usage_log
WHERE loaded_at >= datetime('now', '-30 days')
GROUP BY skill_id
HAVING avg_confidence_delta < 0.02;

-- Application join to find intersection
```

---

#### Q6: Skill usage frequency by agent type
```sql
-- SQLite (Skills DB)
SELECT
  agent_type,
  s.name AS skill_name,
  COUNT(*) AS usage_count
FROM skill_usage_log sul
JOIN skills s ON sul.skill_id = s.id
WHERE sul.loaded_at >= datetime('now', '-30 days')
GROUP BY agent_type, s.name
ORDER BY agent_type, usage_count DESC;
```

---

### 8.3 Agent Performance Queries

#### Q7: Agent success rate by type
```sql
-- SQLite (CFN Coordination)
SELECT
  type AS agent_type,
  COUNT(*) AS total_spawns,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
  ROUND(100.0 * SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) / COUNT(*), 2) AS success_rate
FROM agents
WHERE spawned_at >= datetime('now', '-30 days')
GROUP BY type
ORDER BY success_rate DESC;
```

---

#### Q8: Average agent confidence by phase
```sql
-- SQLite (CFN Coordination)
SELECT
  json_extract(correlation_metadata, '$.phase') AS phase,
  AVG(confidence) AS avg_confidence,
  COUNT(*) AS agent_count
FROM agents
WHERE spawned_at >= datetime('now', '-30 days')
  AND confidence IS NOT NULL
GROUP BY phase
ORDER BY phase;
```

---

#### Q9: Agent execution time distribution
```sql
-- SQLite (CFN Coordination)
SELECT
  type AS agent_type,
  AVG((julianday(completed_at) - julianday(spawned_at)) * 24 * 60) AS avg_duration_minutes,
  MIN((julianday(completed_at) - julianday(spawned_at)) * 24 * 60) AS min_duration_minutes,
  MAX((julianday(completed_at) - julianday(spawned_at)) * 24 * 60) AS max_duration_minutes
FROM agents
WHERE spawned_at >= datetime('now', '-7 days')
  AND completed_at IS NOT NULL
GROUP BY type
ORDER BY avg_duration_minutes DESC;
```

---

### 8.4 Task Analytics Queries

#### Q10: Task completion rate by domain
```sql
-- SQLite (CFN Coordination)
SELECT
  domain,
  COUNT(*) AS total_tasks,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
  ROUND(100.0 * SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) / COUNT(*), 2) AS completion_rate
FROM tasks
WHERE created_at >= datetime('now', '-30 days')
GROUP BY domain
ORDER BY completion_rate DESC;
```

---

#### Q11: Tasks with most agent spawns
```sql
-- SQLite (CFN Coordination)
SELECT
  t.id AS task_id,
  t.description,
  COUNT(a.id) AS agent_count,
  t.status
FROM tasks t
JOIN agents a ON t.id = a.task_id
WHERE t.created_at >= datetime('now', '-30 days')
GROUP BY t.id, t.description, t.status
ORDER BY agent_count DESC
LIMIT 10;
```

---

#### Q12: Average iterations per task (by domain)
```sql
-- SQLite (CFN Coordination) + PostgreSQL (workflow patterns)

-- SQLite: Count agents per task (proxy for iterations)
SELECT
  task_id,
  COUNT(DISTINCT json_extract(correlation_metadata, '$.iteration')) AS iteration_count
FROM agents
WHERE spawned_at >= datetime('now', '-30 days')
GROUP BY task_id;

-- Application: Join with tasks.domain to aggregate
```

---

### 8.5 Cross-Database Analytics Queries

#### Q13: ROI per skill (cost savings + confidence improvement)
```javascript
// Application-level join

// Step 1: PostgreSQL - cost savings
const costSavings = await postgresDb.query(`
  SELECT
    skill_id,
    SUM(cost_avoided_usd) AS total_savings
  FROM skill_executions
  WHERE created_at >= NOW() - INTERVAL '30 days'
  GROUP BY skill_id
`);

// Step 2: SQLite - confidence improvement
const confidenceGain = await sqliteDb.all(`
  SELECT
    skill_id,
    AVG(confidence_after - confidence_before) AS avg_confidence_delta
  FROM skill_usage_log
  WHERE loaded_at >= datetime('now', '-30 days')
  GROUP BY skill_id
`);

// Step 3: Merge and calculate ROI score
const roi = costSavings.rows.map(cost => {
  const conf = confidenceGain.find(c => c.skill_id === cost.skill_id);
  return {
    skill_id: cost.skill_id,
    total_savings: cost.total_savings,
    avg_confidence_delta: conf?.avg_confidence_delta || 0,
    roi_score: (cost.total_savings * 10) + (conf?.avg_confidence_delta * 100 || 0)
  };
}).sort((a, b) => b.roi_score - a.roi_score);
```

---

#### Q14: Task success correlation with skill usage
```javascript
// Step 1: SQLite CFN - task success rate
const taskSuccess = await cfnDb.all(`
  SELECT
    task_id,
    CASE WHEN status = 'completed' THEN 1 ELSE 0 END AS success
  FROM tasks
  WHERE created_at >= datetime('now', '-30 days')
`);

// Step 2: SQLite Skills - skill usage per task
const skillUsage = await skillsDb.all(`
  SELECT
    task_id,
    COUNT(DISTINCT skill_id) AS unique_skills_used
  FROM skill_usage_log
  WHERE loaded_at >= datetime('now', '-30 days')
  GROUP BY task_id
`);

// Step 3: Correlate (application logic)
const correlation = taskSuccess.map(task => {
  const skills = skillUsage.find(s => s.task_id === task.task_id);
  return {
    task_id: task.task_id,
    success: task.success,
    skills_used: skills?.unique_skills_used || 0
  };
});

// Calculate correlation coefficient (Pearson's r)
```

---

#### Q15: End-to-end task timeline (spawn → execution → completion)
```javascript
// Step 1: SQLite CFN - agent lifecycle
const agentLifecycle = await cfnDb.all(`
  SELECT
    task_id,
    id AS agent_id,
    spawned_at,
    completed_at
  FROM agents
  WHERE task_id = ?
  ORDER BY spawned_at
`, [taskId]);

// Step 2: SQLite Skills - skill execution times
const skillExecutions = await skillsDb.all(`
  SELECT
    agent_id,
    skill_id,
    execution_time_ms,
    loaded_at
  FROM skill_usage_log
  WHERE task_id = ?
  ORDER BY loaded_at
`, [taskId]);

// Step 3: PostgreSQL - cost data
const costData = await postgresDb.query(`
  SELECT
    agent_id,
    skill_id,
    cost_avoided_usd
  FROM skill_executions
  WHERE task_id = $1
`, [taskId]);

// Step 4: Merge timeline
const timeline = agentLifecycle.map(agent => ({
  agent_id: agent.agent_id,
  spawned_at: agent.spawned_at,
  completed_at: agent.completed_at,
  skills_executed: skillExecutions.filter(s => s.agent_id === agent.agent_id),
  cost_avoided: costData.rows.filter(c => c.agent_id === agent.agent_id).reduce((sum, c) => sum + c.cost_avoided_usd, 0)
}));
```

---

### 8.6 Session Analytics Queries

#### Q16: Multi-task session performance
```sql
-- SQLite (CFN Coordination)
SELECT
  session_id,
  COUNT(DISTINCT id) AS task_count,
  AVG((julianday(updated_at) - julianday(created_at)) * 24) AS avg_task_duration_hours,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_tasks
FROM tasks
WHERE session_id IS NOT NULL
  AND created_at >= datetime('now', '-30 days')
GROUP BY session_id
ORDER BY task_count DESC;
```

---

#### Q17: Session agent diversity
```sql
-- SQLite (CFN Coordination)
SELECT
  a.session_id,
  COUNT(DISTINCT a.type) AS unique_agent_types,
  COUNT(a.id) AS total_agents,
  GROUP_CONCAT(DISTINCT a.type) AS agent_types_used
FROM agents a
WHERE a.session_id IS NOT NULL
  AND a.spawned_at >= datetime('now', '-30 days')
GROUP BY a.session_id
ORDER BY unique_agent_types DESC;
```

---

### 8.7 Edge Case Analysis Queries

#### Q18: Most common edge case patterns
```sql
-- PostgreSQL
SELECT
  failure_reason,
  COUNT(*) AS occurrence_count,
  COUNT(DISTINCT skill_id) AS affected_skills
FROM edge_cases
WHERE created_at >= NOW() - INTERVAL '30 days'
  AND resolved = FALSE
GROUP BY failure_reason
ORDER BY occurrence_count DESC
LIMIT 10;
```

---

#### Q19: Edge case resolution time
```sql
-- PostgreSQL
SELECT
  skill_id,
  AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600) AS avg_resolution_hours,
  COUNT(*) AS total_edge_cases
FROM edge_cases
WHERE resolved = TRUE
  AND created_at >= NOW() - INTERVAL '90 days'
GROUP BY skill_id
ORDER BY avg_resolution_hours DESC;
```

---

#### Q20: Edge case recurrence rate
```sql
-- PostgreSQL
SELECT
  failure_reason,
  COUNT(*) AS total_occurrences,
  COUNT(DISTINCT DATE_TRUNC('day', created_at)) AS days_with_occurrences,
  ROUND(COUNT(*)::NUMERIC / COUNT(DISTINCT DATE_TRUNC('day', created_at)), 2) AS avg_per_day
FROM edge_cases
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY failure_reason
HAVING COUNT(*) >= 5
ORDER BY avg_per_day DESC;
```

---

### 8.8 Approval Workflow Queries

#### Q21: Approval turnaround time
```sql
-- PostgreSQL
SELECT
  reviewer_id,
  AVG(EXTRACT(EPOCH FROM (created_at - submitted_at)) / 3600) AS avg_review_hours,
  COUNT(*) AS total_reviews
FROM skill_approvals
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY reviewer_id
ORDER BY avg_review_hours;
```

---

#### Q22: Approval rate by priority
```sql
-- PostgreSQL
SELECT
  json_extract(correlation_metadata, '$.priority') AS priority,
  COUNT(*) AS total_submissions,
  SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved,
  ROUND(100.0 * SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) / COUNT(*), 2) AS approval_rate
FROM skill_approvals
WHERE created_at >= NOW() - INTERVAL '90 days'
GROUP BY priority
ORDER BY approval_rate DESC;
```

---

### 8.9 Coordination Event Queries

#### Q23: Event frequency by type
```sql
-- SQLite (CFN Coordination)
SELECT
  event_type,
  COUNT(*) AS event_count,
  DATE(created_at) AS event_date
FROM coordination_events
WHERE created_at >= datetime('now', '-7 days')
GROUP BY event_type, event_date
ORDER BY event_date DESC, event_count DESC;
```

---

#### Q24: Agent communication patterns
```sql
-- SQLite (CFN Coordination)
SELECT
  json_extract(event_data, '$.from_agent') AS from_agent,
  json_extract(event_data, '$.to_agent') AS to_agent,
  COUNT(*) AS message_count
FROM coordination_events
WHERE event_type = 'signal'
  AND created_at >= datetime('now', '-7 days')
GROUP BY from_agent, to_agent
ORDER BY message_count DESC
LIMIT 20;
```

---

### 8.10 Real-Time Monitoring Queries (Redis)

#### Q25: Current task queue depth
```bash
redis-cli LLEN task:queue
```

---

#### Q26: Active agents (last 5 minutes)
```bash
redis-cli KEYS "agent:*:status" | while read key; do
  LAST_HEARTBEAT=$(redis-cli HGET "$key" last_heartbeat)
  NOW=$(date +%s)
  if [ $((NOW - LAST_HEARTBEAT)) -lt 300 ]; then
    echo "$key is active"
  fi
done
```

---

#### Q27: Task completion percentage
```bash
TOTAL=$(redis-cli GET task:total)
COMPLETED=$(redis-cli GET task:completed)
echo "scale=2; 100 * $COMPLETED / $TOTAL" | bc
# Output: 75.00 (75% complete)
```

---

### 8.11 Trend Analysis Queries

#### Q28: Skill adoption trend (new skills per week)
```sql
-- SQLite (Skills DB)
SELECT
  strftime('%Y-W%W', created_at) AS week,
  COUNT(*) AS new_skills
FROM skills
WHERE created_at >= datetime('now', '-90 days')
GROUP BY week
ORDER BY week DESC;
```

---

#### Q29: Agent spawn rate trend
```sql
-- SQLite (CFN Coordination)
SELECT
  DATE(spawned_at) AS spawn_date,
  COUNT(*) AS agents_spawned,
  COUNT(DISTINCT type) AS unique_types
FROM agents
WHERE spawned_at >= datetime('now', '-30 days')
GROUP BY spawn_date
ORDER BY spawn_date DESC;
```

---

#### Q30: Cost savings acceleration
```sql
-- PostgreSQL
SELECT
  DATE_TRUNC('week', created_at) AS week,
  SUM(cost_avoided_usd) AS total_savings,
  LAG(SUM(cost_avoided_usd)) OVER (ORDER BY DATE_TRUNC('week', created_at)) AS prev_week_savings,
  ROUND(
    100.0 * (SUM(cost_avoided_usd) - LAG(SUM(cost_avoided_usd)) OVER (ORDER BY DATE_TRUNC('week', created_at)))
    / NULLIF(LAG(SUM(cost_avoided_usd)) OVER (ORDER BY DATE_TRUNC('week', created_at)), 0),
    2
  ) AS growth_rate_percent
FROM skill_executions
WHERE created_at >= NOW() - INTERVAL '12 weeks'
GROUP BY week
ORDER BY week DESC;
```

---

## 9. Consistency Monitoring

### 9.1 Monitoring Dashboard

**Metrics to track:**
```
┌────────────────────────────────────────────────────────────┐
│  Unified Data Model Health Dashboard                      │
└────────────────────────────────────────────────────────────┘

1. Cross-Database Consistency
   ├─ PostgreSQL → SQLite lag: 2.3 seconds (target: <5s)
   ├─ Missing records (PostgreSQL vs SQLite): 0 (target: 0)
   └─ Reconciliation jobs: Last run 2 hours ago (✅ success)

2. Correlation Key Coverage
   ├─ task_id population: 98.7% (target: >95%)
   ├─ agent_id population: 99.2% (target: >95%)
   └─ session_id population: 45.3% (optional, varies)

3. Query Performance
   ├─ Application-level joins: 123ms avg (target: <500ms)
   ├─ Materialized view freshness: 4 hours ago (target: <24h)
   └─ Redis queue depth: 12 tasks (target: <100)

4. Data Quality
   ├─ Orphaned skill_ids: 0 (target: 0)
   ├─ Null correlation_metadata: 3.2% (target: <5%)
   └─ Invalid agent_id format: 0 (target: 0)

5. Event Sourcing (if enabled)
   ├─ Event lag: PostgreSQL 0.8s, SQLite 1.2s (target: <5s)
   ├─ Event consumer health: PostgreSQL ✅, SQLite ✅
   └─ Event stream size: 12.4 MB (last 7 days)
```

---

### 9.2 Consistency Checks (Automated)

**Daily reconciliation script:**
```bash
#!/bin/bash
# check-cross-db-consistency.sh
# Runs daily via cron to detect discrepancies

set -euo pipefail

REPORT_FILE="/var/log/cfn/consistency-$(date +%Y%m%d).log"

echo "=== Cross-Database Consistency Check ===" > "$REPORT_FILE"
echo "Date: $(date)" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# 1. Check task_id coverage
echo "1. Checking task_id coverage..." >> "$REPORT_FILE"

PG_TASK_COUNT=$(psql -t -c "SELECT COUNT(DISTINCT task_id) FROM skill_executions WHERE created_at >= NOW() - INTERVAL '7 days'" | xargs)
SQLITE_TASK_COUNT=$(sqlite3 skills.db "SELECT COUNT(DISTINCT task_id) FROM skill_usage_log WHERE loaded_at >= datetime('now', '-7 days')" | xargs)

if [ "$PG_TASK_COUNT" -ne "$SQLITE_TASK_COUNT" ]; then
  echo "⚠️  WARNING: Task count mismatch" >> "$REPORT_FILE"
  echo "   PostgreSQL: $PG_TASK_COUNT tasks" >> "$REPORT_FILE"
  echo "   SQLite: $SQLITE_TASK_COUNT tasks" >> "$REPORT_FILE"
  echo "   Difference: $((PG_TASK_COUNT - SQLITE_TASK_COUNT))" >> "$REPORT_FILE"
else
  echo "✅ Task count matches: $PG_TASK_COUNT tasks" >> "$REPORT_FILE"
fi

# 2. Check for orphaned skill references
echo "" >> "$REPORT_FILE"
echo "2. Checking for orphaned skill references..." >> "$REPORT_FILE"

ORPHANED=$(sqlite3 skills.db "
  SELECT COUNT(*) FROM skills
  WHERE source_pattern_id IS NOT NULL
    AND source_pattern_id NOT IN (
      SELECT id FROM workflow_patterns
    )
")

if [ "$ORPHANED" -gt 0 ]; then
  echo "⚠️  WARNING: $ORPHANED orphaned skills found" >> "$REPORT_FILE"
else
  echo "✅ No orphaned skills" >> "$REPORT_FILE"
fi

# 3. Check correlation_metadata population
echo "" >> "$REPORT_FILE"
echo "3. Checking correlation_metadata population..." >> "$REPORT_FILE"

NULL_COUNT=$(psql -t -c "SELECT COUNT(*) FROM skill_executions WHERE correlation_metadata IS NULL AND created_at >= NOW() - INTERVAL '7 days'" | xargs)
TOTAL_COUNT=$(psql -t -c "SELECT COUNT(*) FROM skill_executions WHERE created_at >= NOW() - INTERVAL '7 days'" | xargs)
NULL_PERCENT=$(echo "scale=2; 100 * $NULL_COUNT / $TOTAL_COUNT" | bc)

if (( $(echo "$NULL_PERCENT > 5" | bc -l) )); then
  echo "⚠️  WARNING: High null correlation_metadata rate: $NULL_PERCENT%" >> "$REPORT_FILE"
else
  echo "✅ Correlation metadata coverage: $((100 - NULL_PERCENT))%" >> "$REPORT_FILE"
fi

# 4. Send alerts if warnings found
WARNINGS=$(grep -c "⚠️" "$REPORT_FILE" || true)

if [ "$WARNINGS" -gt 0 ]; then
  echo "" >> "$REPORT_FILE"
  echo "SUMMARY: $WARNINGS warnings detected" >> "$REPORT_FILE"

  # Send alert (email, Slack, PagerDuty)
  # mail -s "CFN Data Consistency Warnings" admin@example.com < "$REPORT_FILE"

  exit 1
else
  echo "" >> "$REPORT_FILE"
  echo "SUMMARY: All checks passed ✅" >> "$REPORT_FILE"
  exit 0
fi
```

---

### 9.3 Performance Monitoring

**Query latency monitoring:**
```javascript
// monitoring/query-latency.js

const queries = [
  { name: 'cost_savings_by_skill', fn: () => getCostSavingsBySkill() },
  { name: 'agent_success_rate', fn: () => getAgentSuccessRate() },
  { name: 'cross_db_roi_analysis', fn: () => getCrossDbRoiAnalysis() },
  // ... 30+ queries
];

async function monitorQueryLatency() {
  const results = [];

  for (const query of queries) {
    const start = Date.now();
    try {
      await query.fn();
      const latency = Date.now() - start;
      results.push({
        query: query.name,
        latency_ms: latency,
        status: latency < 500 ? 'OK' : 'SLOW',
        timestamp: new Date()
      });
    } catch (error) {
      results.push({
        query: query.name,
        latency_ms: null,
        status: 'ERROR',
        error: error.message,
        timestamp: new Date()
      });
    }
  }

  // Store results in monitoring database
  await storeLatencyMetrics(results);

  // Alert on slow queries
  const slowQueries = results.filter(r => r.latency_ms > 500);
  if (slowQueries.length > 0) {
    await sendAlert('Slow queries detected', slowQueries);
  }
}

// Run every 5 minutes
setInterval(monitorQueryLatency, 5 * 60 * 1000);
```

---

## 10. Implementation Roadmap

### Week 1: Schema Migrations
- ✅ Day 1-2: Run PostgreSQL migrations (add columns, indexes)
- ✅ Day 3-4: Run SQLite migrations (Skills DB + CFN Coordination)
- ✅ Day 5: Validate schema changes, test column additions

### Week 2: Data Backfill
- ✅ Day 1-2: Backfill task_id for existing workflow_patterns
- ✅ Day 3: Link skills.source_pattern_id to workflow_patterns.id
- ✅ Day 4-5: Backfill agent_id for skill_executions (best-effort)

### Week 3: Application Integration
- ✅ Day 1-2: Implement query service with application-level joins
- ✅ Day 3: Create materialized view sync jobs (cron)
- ✅ Day 4-5: Deploy analytics dashboard, monitor performance

### Week 4+: Event Sourcing (Optional)
- ✅ Day 1-2: Set up Redis Streams event bus
- ✅ Day 3-4: Implement event publishers/consumers
- ✅ Day 5: Deploy reconciliation jobs, test event replay

---

## 11. Success Metrics

### Performance Targets
- ✅ Cross-database query latency: <500ms (95th percentile)
- ✅ Materialized view freshness: <24 hours
- ✅ Reconciliation job runtime: <5 minutes
- ✅ Event lag (if enabled): <5 seconds

### Data Quality Targets
- ✅ task_id coverage: >95% of records
- ✅ agent_id coverage: >95% of records
- ✅ Orphaned references: 0
- ✅ Null correlation_metadata: <5%

### Consistency Targets
- ✅ PostgreSQL ↔ SQLite discrepancies: <1% daily
- ✅ Reconciliation success rate: >99%
- ✅ Event consumer uptime: >99.9%

---

## 12. Appendix

### A. Sample Correlation Metadata
```json
{
  "task_id": "a7f3b2c1-4d5e-4a1b-9c8d-7e6f5a4b3c2d",
  "agent_id": "backend-developer-1731686400-12345",
  "session_id": "b8e4c3d2-5f6g-4b2c-8d9e-6f7g5h4i3j2k",
  "parent_task_id": null,
  "iteration": 2,
  "phase": "Loop3",
  "tags": ["authentication", "jwt", "security"],
  "domain": "software-development",
  "priority": "high",
  "source_system": "cfn-loop-cli",
  "created_by": "cfn-v3-coordinator",
  "correlation_version": "1.0",
  "custom_fields": {
    "estimated_complexity": "medium",
    "skill_count": 3,
    "validator_count": 4
  }
}
```

### B. Reference Implementation Links
- PostgreSQL migrations: `/migrations/20251115_add_correlation_v1.sql`
- SQLite migrations: `/migrations/sqlite_skills_db_v1.sql`
- Query service: `/src/services/unified-query-service.ts`
- Reconciliation jobs: `/scripts/reconciliation/check-consistency.sh`
- Event consumers: `/src/events/consumers/`

### C. Related Documentation
- Phase 4 Skills DB Integration: `/docker/PHASE_4_SKILLS_DB_INTEGRATION.md`
- CFN Coordination Protocols: `/.claude/skills/cfn-coordination/SKILL.md`
- Skills Database Architecture: `/.claude/skills/dynamic-skills-loader/ARCHITECTURE.md`

---

**END OF DOCUMENT**

**Confidence Score:** 0.92

**Rationale:**
- ✅ Complete cross-database ERD with correlation keys
- ✅ 30+ query patterns covering all major use cases
- ✅ Detailed migration plan with backward compatibility
- ✅ Consistency monitoring with automated reconciliation
- ✅ Event sourcing option for real-time sync
- ✅ Application-level joins for independent scaling
- ⚠️  Reduced confidence due to lack of production testing (requires validation)
- ⚠️  Event sourcing complexity (optional, may require iteration)

**Next Steps:**
1. Review and approve migration scripts
2. Test schema changes on staging environment
3. Deploy Week 1 migrations to production
4. Monitor consistency metrics for 7 days
5. Proceed to Week 2 backfill after validation
