# Phase 2: Playbook-Driven Ephemeral Agent Specification

**Version:** 2.0.0
**Date:** 2025-11-12
**Status:** Draft
**Dependency:** Phase 1 (Corporate Organization v1.0.0)

---

## 1. Executive Summary

### 1.1 Vision

Transform the corporate organization from persistent agents to **ephemeral agents with eternal knowledge**, enabling:
- **90% cost reduction** through pay-per-task execution
- **100% knowledge persistence** via PostgreSQL-backed playbooks
- **Organizational learning** where every task makes the system smarter
- **Automatic context injection** requiring zero manual effort

### 1.2 Core Principle

**Agents are ephemeral (spawn per task, exit after completion), but knowledge is eternal (survives in ACE playbooks).**

### 1.3 Key Innovations

| Feature | Traditional Approach | Playbook-Driven Approach |
|---------|---------------------|--------------------------|
| **Agent Lifecycle** | Persistent (24/7) | Ephemeral (per-task) |
| **Knowledge Storage** | Process memory | PostgreSQL playbooks |
| **Context Loading** | Manual code | Automatic pre-spawn hook |
| **Lesson Extraction** | Manual documentation | Automatic post-completion hook |
| **Cross-Agent Learning** | None | Cumulative (shared playbook) |
| **Cost Model** | Fixed ($480/month/team) | Variable ($0.50-2/task) |
| **Idle Overhead** | 95% | 0% |
| **Knowledge Survival** | Crash-dependent | 100% guaranteed |

---

## 2. Requirements

### 2.1 Functional Requirements

**FR-1: Ephemeral Agent Lifecycle**
- Agents MUST spawn only when tasks arrive
- Agents MUST load relevant playbook lessons before execution
- Agents MUST execute exactly one task
- Agents MUST extract new lessons after completion
- Agents MUST terminate after task completion

**FR-2: Automatic Context Injection**
- System MUST extract tags from task description automatically
- System MUST query PostgreSQL for relevant lessons
- System MUST filter lessons by scope (agent → team → org)
- System MUST inject top 100 lessons into agent context
- System MUST complete injection within 5 seconds

**FR-3: Automatic Lesson Extraction**
- System MUST parse agent output for lesson patterns
- System MUST extract lessons without manual intervention
- System MUST store lessons to PostgreSQL with metadata
- System MUST deduplicate lessons (same content = same entry)
- System MUST update confidence scores on reuse

**FR-4: Scope Hierarchy**
- Lessons MUST support three scopes: agent, team, org
- Agent scope MUST be private to specific agent
- Team scope MUST be shared within team
- Org scope MUST be shared across all teams
- Scope priority MUST be: agent > team > org

**FR-5: Confidence Tracking**
- Each lesson MUST track success_count and total_count
- Confidence MUST be calculated as success_count / total_count
- Confidence MUST update automatically on each use
- Low confidence lessons (<0.50) MUST be flagged for review

### 2.2 Non-Functional Requirements

**NFR-1: Performance**
- Agent spawn time (including context injection): <30 seconds
- Context injection query time: <5 seconds
- Lesson extraction time: <2 seconds
- PostgreSQL query P95 latency: <100ms

**NFR-2: Scalability**
- Support 100+ concurrent ephemeral agents
- Support 10,000+ lessons per team
- Support 100+ tasks per hour per team
- Support 1M+ playbook usage records

**NFR-3: Reliability**
- Knowledge persistence: 100% (no data loss)
- Lesson deduplication: 100% (no duplicate content)
- Context injection success rate: >99.9%
- Automatic recovery from failed extractions

**NFR-4: Cost Efficiency**
- Target cost: <$0.50 per task (Z.ai provider)
- Maximum cost: <$2 per task (Anthropic provider)
- Idle resource usage: 0% (no persistent agents)
- Storage cost: <$10/month per team (PostgreSQL)

---

## 3. Architecture Overview

### 3.1 High-Level Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Task Arrives                                                │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ Pre-Spawn Hook: Automatic Context Injection                │
│ 1. Extract tags from task description                      │
│ 2. Query PostgreSQL for relevant lessons                   │
│ 3. Filter by scope (agent/team/org)                        │
│ 4. Generate context file with top 100 lessons             │
│ Duration: <5 seconds                                       │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ Spawn Ephemeral Agent Container                            │
│ - Mount context file at /context.json                      │
│ - Mount team workspace (file system isolation)             │
│ - Mount agent-specific MCP config                          │
│ - Set AutoRemove=true (cleanup on exit)                   │
│ Duration: <10 seconds                                      │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ Agent Initialization                                       │
│ 1. Read /context.json (100 playbook lessons)              │
│ 2. Parse lessons by scope (agent/team/org)                │
│ 3. Build enhanced task prompt with lesson context         │
│ Duration: <5 seconds                                       │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ Task Execution                                             │
│ 1. Execute task informed by playbook lessons              │
│ 2. Apply relevant lessons (track usage)                   │
│ 3. Discover new learnings during execution                │
│ 4. Output structured results + lessons                    │
│ Duration: Variable (1-10 minutes typical)                 │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ Post-Completion Hook: Automatic Lesson Extraction         │
│ 1. Read agent output from Redis/logs                      │
│ 2. Parse output for lesson patterns (regex)               │
│ 3. Extract new lessons with metadata                      │
│ 4. Store lessons to PostgreSQL                            │
│ 5. Update confidence for used lessons                     │
│ Duration: <2 seconds                                       │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ Agent Exit                                                 │
│ - Container auto-removed (AutoRemove=true)                │
│ - Knowledge persisted to PostgreSQL (eternal)             │
│ - Next task spawns fresh agent with updated playbook     │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Component Responsibilities

| Component | Responsibility | Technology |
|-----------|---------------|------------|
| **Team Coordinator** | Orchestrate ephemeral agent lifecycle | Node.js + Docker SDK |
| **Pre-Spawn Hook** | Context injection (playbook loading) | Bash + PostgreSQL |
| **Post-Completion Hook** | Lesson extraction and storage | Bash + PostgreSQL |
| **Ephemeral Agent** | Single-task execution with playbook | Docker container |
| **PostgreSQL** | Persistent lesson storage | PostgreSQL 16 |
| **Redis** | Temporary agent state, output buffering | Redis 7 |

---

## 4. Database Schema

### 4.1 Context Reflections Table

```sql
CREATE TABLE context_reflections (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Ownership
    owner_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    team_id VARCHAR(50) NOT NULL,
    scope VARCHAR(20) NOT NULL CHECK (scope IN ('agent', 'team', 'org')),

    -- Content
    content TEXT NOT NULL,
    lesson_type VARCHAR(50) CHECK (lesson_type IN (
        'learned',
        'best_practice',
        'anti_pattern',
        'key_insight',
        'error_solution',
        'optimization'
    )),
    tags TEXT[] NOT NULL,

    -- Confidence tracking
    confidence DECIMAL(3, 2) NOT NULL DEFAULT 0.80 CHECK (confidence >= 0 AND confidence <= 1),
    success_count INTEGER NOT NULL DEFAULT 1 CHECK (success_count >= 0),
    total_count INTEGER NOT NULL DEFAULT 1 CHECK (total_count >= success_count),

    -- Metadata
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMP,
    created_by VARCHAR(100),  -- Agent ID that discovered this lesson

    -- Prevent duplicate lessons
    CONSTRAINT unique_lesson UNIQUE (team_id, scope, content),

    -- Indexes for performance
    INDEX idx_team_scope (team_id, scope),
    INDEX idx_tags (tags) USING GIN,
    INDEX idx_confidence (confidence DESC),
    INDEX idx_last_used (last_used_at DESC),
    INDEX idx_created_at (created_at DESC)
);

-- Automatic updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_context_reflections_updated_at
    BEFORE UPDATE ON context_reflections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

### 4.2 Playbook Usage Table

```sql
CREATE TABLE playbook_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- References
    task_id UUID NOT NULL,
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    reflection_id UUID REFERENCES context_reflections(id) ON DELETE CASCADE,

    -- Usage result
    was_applied BOOLEAN NOT NULL DEFAULT false,
    was_successful BOOLEAN,
    execution_time_ms INTEGER,
    error_message TEXT,

    -- Metadata
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Indexes
    INDEX idx_reflection (reflection_id),
    INDEX idx_task (task_id),
    INDEX idx_agent (agent_id),
    INDEX idx_created_at (created_at DESC)
);
```

### 4.3 Task Reflections Mapping

```sql
CREATE TABLE task_reflections (
    task_id UUID NOT NULL,
    reflection_id UUID REFERENCES context_reflections(id) ON DELETE CASCADE,

    -- Relevance scoring
    relevance_score DECIMAL(3, 2),
    tag_overlap_count INTEGER,

    -- Timestamps
    injected_at TIMESTAMP NOT NULL DEFAULT NOW(),

    PRIMARY KEY (task_id, reflection_id),
    INDEX idx_task (task_id),
    INDEX idx_relevance (relevance_score DESC)
);
```

---

## 5. Hooks Specification

### 5.1 Pre-Spawn Hook (Context Injection)

**Hook Name:** `cfn-pre-spawn-context-inject.sh`
**Location:** `.claude/hooks/cfn-pre-spawn-context-inject.sh`
**Trigger:** Before agent container spawn
**Duration Target:** <5 seconds

**Input Parameters:**
```bash
--task-id        # Task UUID
--agent-type     # Agent role (e.g., "react-specialist")
--tags           # Comma-separated tags from task description
--scope          # Scope filter (e.g., "team:frontend")
--output-file    # Path to write context JSON
```

**Output Format:**
```json
{
  "task_id": "uuid",
  "agent_type": "react-specialist",
  "tags": ["typescript", "react", "errors"],
  "lessons": [
    {
      "id": "uuid",
      "content": "React components should use explicit return types",
      "scope": "team",
      "confidence": 0.95,
      "success_count": 52,
      "total_count": 53,
      "tags": ["react", "typescript", "types"],
      "lesson_type": "best_practice",
      "created_at": "2025-10-15T10:30:00Z"
    }
    // ... 99 more lessons
  ],
  "total_lessons": 100,
  "load_time_ms": 342,
  "scope_breakdown": {
    "agent": 5,
    "team": 52,
    "org": 43
  }
}
```

**Query Logic:**
```sql
SELECT
    id,
    content,
    scope,
    confidence,
    success_count,
    total_count,
    tags,
    lesson_type,
    created_at
FROM context_reflections
WHERE
    -- Scope filter (team-specific or org-wide)
    (team_id = $1 OR scope = 'org')
    AND
    -- Tag overlap (at least one tag matches)
    tags && $2::TEXT[]
ORDER BY
    -- Priority: agent > team > org
    CASE scope
        WHEN 'agent' THEN 1
        WHEN 'team' THEN 2
        WHEN 'org' THEN 3
    END,
    -- Within same scope, order by confidence
    confidence DESC,
    -- Tie-breaker: recently used
    last_used_at DESC NULLS LAST
LIMIT 100;
```

**Error Handling:**
- If query fails: Return empty lessons array (agent proceeds without context)
- If timeout (>5s): Cancel query, return partial results
- If no lessons found: Return empty array (valid for first-time tasks)

### 5.2 Post-Completion Hook (Lesson Extraction)

**Hook Name:** `cfn-post-completion-extract.sh`
**Location:** `.claude/hooks/cfn-post-completion-extract.sh`
**Trigger:** After agent task completion
**Duration Target:** <2 seconds

**Input Parameters:**
```bash
--task-id         # Task UUID
--agent-id        # Agent UUID
--agent-output    # Agent output text (from Redis or logs)
--auto-extract    # Enable automatic regex-based extraction
```

**Extraction Patterns:**
```regex
Learned: (.+)$
Best practice: (.+)$
Anti-pattern: (.+)$
Key insight: (.+)$
Error solution: (.+)$
Optimization: (.+)$
```

**Output:**
```json
{
  "task_id": "uuid",
  "agent_id": "uuid",
  "extracted_lessons": [
    {
      "content": "Product launch subject lines <40 chars get 3x open rate",
      "lesson_type": "learned",
      "tags": ["email", "product-launch", "subject-lines"],
      "confidence": 0.80,
      "scope": "team"
    }
  ],
  "extraction_time_ms": 1250,
  "lessons_stored": 1,
  "lessons_deduplicated": 0,
  "lessons_updated": 2
}
```

**Storage Logic:**
```sql
-- Insert new lesson or update existing
INSERT INTO context_reflections (
    owner_id, team_id, scope, content, lesson_type,
    tags, confidence, success_count, total_count, created_by
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, 1, 1, $8
)
ON CONFLICT (team_id, scope, content)
DO UPDATE SET
    -- Increment counters (assumes success if lesson used again)
    success_count = context_reflections.success_count + 1,
    total_count = context_reflections.total_count + 1,
    -- Recalculate confidence
    confidence = (context_reflections.success_count + 1.0) / (context_reflections.total_count + 1.0),
    -- Update timestamp
    updated_at = NOW();
```

**Error Handling:**
- If extraction fails: Log warning, continue without storing lessons
- If PostgreSQL unavailable: Queue lessons in Redis for retry
- If deduplication conflict: Update existing lesson (idempotent)

---

## 6. Agent Lifecycle States

### 6.1 State Diagram

```
┌─────────────┐
│  NOT_EXIST  │ (No container)
└──────┬──────┘
       │ spawn_agent()
       ▼
┌─────────────┐
│  SPAWNING   │ (Container creating)
└──────┬──────┘
       │ container.start()
       ▼
┌─────────────┐
│   LOADING   │ (Loading context.json)
└──────┬──────┘
       │ context loaded
       ▼
┌─────────────┐
│  EXECUTING  │ (Running task)
└──────┬──────┘
       │ task complete
       ▼
┌─────────────┐
│ EXTRACTING  │ (Extracting lessons)
└──────┬──────┘
       │ lessons stored
       ▼
┌─────────────┐
│   EXITED    │ (Container stopped)
└──────┬──────┘
       │ AutoRemove=true
       ▼
┌─────────────┐
│  REMOVED    │ (Container deleted)
└─────────────┘
```

### 6.2 State Transitions

| From State | Event | To State | Duration |
|------------|-------|----------|----------|
| NOT_EXIST | Task arrives | SPAWNING | 0s |
| SPAWNING | Container created | LOADING | 5-10s |
| LOADING | Context loaded | EXECUTING | 3-5s |
| EXECUTING | Task complete | EXTRACTING | Variable (1-10min) |
| EXTRACTING | Lessons stored | EXITED | 1-2s |
| EXITED | AutoRemove triggered | REMOVED | <1s |

**Total Lifecycle:** 1-15 minutes (typical: 2-5 minutes)

---

## 7. Scope Hierarchy Rules

### 7.1 Scope Definitions

**Agent Scope:**
- **Definition:** Private to specific agent instance
- **Visibility:** Only the owning agent can see these lessons
- **Use Case:** Personal preferences, experimental patterns
- **Example:** "I prefer detailed error messages in console.log"
- **Lifespan:** Until agent ID retired

**Team Scope:**
- **Definition:** Shared within team boundary
- **Visibility:** All agents on same team
- **Use Case:** Team-specific practices, domain knowledge
- **Example:** "React components should use explicit return types"
- **Lifespan:** Permanent (until manually deleted)

**Org Scope:**
- **Definition:** Shared across entire organization
- **Visibility:** All agents on all teams
- **Use Case:** Universal best practices, security rules
- **Example:** "Use environment variables for API keys"
- **Lifespan:** Permanent (org-wide policy)

### 7.2 Conflict Resolution

**Scenario:** Multiple lessons with overlapping guidance

**Priority Order:**
1. **Agent scope** (highest priority, most specific)
2. **Team scope** (medium priority, team-specific)
3. **Org scope** (lowest priority, but mandatory if flagged)

**Example:**
```
Agent lesson:  "Use API key in URL params for speed" (0.60 confidence)
Team lesson:   "Mailchimp: Use X-API-Key header" (0.95 confidence)
Org lesson:    "Never put API keys in URL (security risk)" (0.98 confidence)

Resolution:
1. Filter out org lesson violations (mandatory)
2. Choose highest confidence between agent/team
3. Result: Use X-API-Key header (team lesson, 0.95 confidence)
```

### 7.3 Scope Promotion

**Automatic Promotion Criteria:**
```
IF lesson.confidence > 0.95
   AND lesson.success_count > 50
   AND lesson.scope = 'team'
   THEN
       Suggest promotion to 'org' scope (manual approval required)
```

**Manual Promotion:**
```sql
-- Promote team lesson to org
UPDATE context_reflections
SET
    scope = 'org',
    team_id = NULL  -- No longer team-specific
WHERE
    id = 'lesson-uuid'
    AND scope = 'team'
    AND confidence > 0.90;
```

---

## 8. Acceptance Criteria

### 8.1 Phase 2 Completion Criteria

**AC-1: Ephemeral Agent Lifecycle**
- [ ] Agents spawn only when task arrives (no persistent agents)
- [ ] Agents auto-remove after task completion
- [ ] Agents execute exactly one task per lifecycle
- [ ] Agent spawn time <30 seconds (including context injection)

**AC-2: Context Injection**
- [ ] Pre-spawn hook executes automatically before agent spawn
- [ ] Context file generated with top 100 relevant lessons
- [ ] Context file mounted at /context.json in agent container
- [ ] Context injection completes within 5 seconds
- [ ] Injection success rate >99.9%

**AC-3: Lesson Extraction**
- [ ] Post-completion hook executes automatically after task
- [ ] Lessons extracted via regex patterns (no manual effort)
- [ ] Extracted lessons stored to PostgreSQL
- [ ] Duplicate lessons deduplicated (UNIQUE constraint)
- [ ] Confidence scores updated on lesson reuse

**AC-4: Scope Hierarchy**
- [ ] Lessons support agent/team/org scopes
- [ ] Agent lessons visible only to owning agent
- [ ] Team lessons visible to all team members
- [ ] Org lessons visible to all agents
- [ ] Scope priority enforced (agent > team > org)

**AC-5: Knowledge Persistence**
- [ ] 100% knowledge persistence (survives all crashes)
- [ ] Lessons survive agent container removal
- [ ] Playbook accumulates over time (100+ lessons after 20 tasks)
- [ ] No knowledge loss on container auto-removal

**AC-6: Performance**
- [ ] Context injection query <5 seconds
- [ ] Lesson extraction <2 seconds
- [ ] PostgreSQL query P95 <100ms
- [ ] System supports 100+ concurrent ephemeral agents

**AC-7: Cost Efficiency**
- [ ] Cost per task <$2 (Anthropic provider)
- [ ] Cost per task <$0.50 (Z.ai provider)
- [ ] Idle resource usage = 0% (no persistent agents)
- [ ] 90% cost reduction vs Phase 1 persistent agents

---

## 9. Backwards Compatibility

### 9.1 Migration from Phase 1

**Phase 1 (v1.0.0) Agents:**
- Persistent agents with manual playbook management
- Manual knowledge storage in `playbooks` table

**Phase 2 (v2.0.0) Agents:**
- Ephemeral agents with automatic context injection
- Automatic knowledge storage in `context_reflections` table

**Migration Strategy:**
1. Deploy Phase 2 schema alongside Phase 1 tables
2. Migrate existing playbooks to context_reflections
3. Enable hooks for new tasks only (gradual rollout)
4. Run both systems in parallel for 1 week (validation)
5. Deprecate Phase 1 persistent agents
6. Drop Phase 1 `playbooks` table

**Data Migration Script:**
```sql
-- Migrate Phase 1 playbooks to Phase 2 context_reflections
INSERT INTO context_reflections (
    owner_id, team_id, scope, content, confidence, success_count, total_count
)
SELECT
    p.agent_id,
    a.team_id,
    'team',  -- Default to team scope
    jsonb_array_elements(p.playbook_content->'steps')->>'description',
    p.success_rate / 100.0,
    p.times_used,
    p.times_used
FROM playbooks p
JOIN agents a ON a.id = p.agent_id
WHERE p.playbook_content IS NOT NULL;
```

### 9.2 Rollback Plan

**If Phase 2 fails, rollback to Phase 1:**

```bash
# 1. Disable hooks
mv .claude/hooks/cfn-pre-spawn-context-inject.sh{,.disabled}
mv .claude/hooks/cfn-post-completion-extract.sh{,.disabled}

# 2. Revert coordinator to Phase 1 code
git checkout v1.0.0 -- docker/coordinator/src/team-coordinator.ts

# 3. Restart coordinators
docker restart cfn-team-coordinator-frontend
docker restart cfn-team-coordinator-backend

# 4. Keep Phase 2 data (no data loss)
# context_reflections table remains for future retry
```

---

## 10. Open Questions

### 10.1 Unresolved Decisions

| Question | Options | Recommendation |
|----------|---------|----------------|
| Should low-confidence lessons (<0.50) be auto-deleted? | Yes / No / Flag only | **Flag only** - Manual review prevents false negatives |
| Max lessons per context injection? | 50 / 100 / 200 | **100** - Balance between context richness and token cost |
| Lesson extraction: strict patterns only or NLP? | Strict regex / NLP / Hybrid | **Strict regex** - Deterministic, no external dependencies |
| Scope promotion: automatic or manual approval? | Auto / Manual / Hybrid | **Manual approval** - Prevent accidental org-wide pollution |
| Failed extraction: retry or skip? | Retry 3x / Skip / Queue | **Queue to Redis** - Retry later without blocking agent |

### 10.2 Future Enhancements

- **Semantic search:** Vector embeddings for lesson similarity matching
- **Lesson versioning:** Track lesson evolution over time
- **Conflict detection:** Flag contradictory lessons automatically
- **A/B testing:** Compare agent performance with/without specific lessons
- **Lesson marketplace:** Share lessons across organizations (privacy-preserving)

---

**End of Phase 2 Specification v2.0.0**
