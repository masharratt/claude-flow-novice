# Playbook-Driven Corporate Organization

**Version:** 1.1.0
**Date:** 2025-11-12
**Enhancement:** Integrates ephemeral agent pattern with ACE playbook system

---

## 1. Architecture Enhancement

### 1.1 From Persistent to Ephemeral Agents

**Current Specification (v1.0.0):**
```
Team Coordinator spawns agents
  → Agents run until task complete
  → Agents may persist for multiple tasks (reuse)
  → Knowledge stored after completion
```

**Enhanced with Playbook Pattern (v1.1.0):**
```
Team Coordinator spawns agents per task
  → Pre-spawn: Load relevant playbook lessons
  → Agent executes single task
  → Post-completion: Extract and store new lessons
  → Agent terminates (ephemeral)
  → Next task spawns fresh agent with updated playbook
```

### 1.2 Cost Comparison

**Persistent Agents (v1.0.0):**
```
Frontend team: 3 agents × $160/month = $480/month
Backend team: 3 agents × $160/month = $480/month
DevOps team: 3 agents × $160/month = $480/month
QA team: 3 agents × $160/month = $480/month

Total: $1,920/month (agents running 24/7)
Idle time: ~90% (waiting for tasks)
```

**Ephemeral + Playbook (v1.1.0):**
```
Frontend team: 50 tasks/month × $1/task = $50/month
Backend team: 60 tasks/month × $1/task = $60/month
DevOps team: 30 tasks/month × $1/task = $30/month
QA team: 40 tasks/month × $1/task = $40/month

Total: $180/month (pay only for task execution)
Savings: 90.6% ($1,740/month saved)
```

---

## 2. Enhanced Database Schema

### 2.1 Playbook Tables (Replaces v1.0.0 `playbooks` table)

```sql
-- ACE Context Reflections (lessons learned)
CREATE TABLE context_reflections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Ownership
    owner_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    team_id VARCHAR(50) NOT NULL,
    scope VARCHAR(20) NOT NULL CHECK (scope IN ('agent', 'team', 'org')),

    -- Content
    content TEXT NOT NULL,
    lesson_type VARCHAR(50) CHECK (lesson_type IN ('learned', 'best_practice', 'anti_pattern', 'key_insight')),
    tags TEXT[] NOT NULL,

    -- Confidence tracking
    confidence DECIMAL(3, 2) NOT NULL DEFAULT 0.80,
    success_count INTEGER NOT NULL DEFAULT 1,
    total_count INTEGER NOT NULL DEFAULT 1,

    -- Metadata
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMP,

    -- Prevent duplicate lessons
    UNIQUE (team_id, scope, content),

    -- Indexes
    INDEX idx_team_scope (team_id, scope),
    INDEX idx_tags (tags),
    INDEX idx_confidence (confidence DESC),
    INDEX idx_last_used (last_used_at DESC)
);

-- Playbook usage tracking
CREATE TABLE playbook_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL,
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    reflection_id UUID REFERENCES context_reflections(id) ON DELETE CASCADE,

    -- Usage result
    was_applied BOOLEAN NOT NULL,
    was_successful BOOLEAN,
    execution_time_ms INTEGER,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),

    INDEX idx_reflection (reflection_id),
    INDEX idx_task (task_id)
);

-- Task-to-reflection mapping (what lessons were used for which tasks)
CREATE TABLE task_reflections (
    task_id UUID NOT NULL,
    reflection_id UUID REFERENCES context_reflections(id) ON DELETE CASCADE,
    relevance_score DECIMAL(3, 2),

    PRIMARY KEY (task_id, reflection_id),
    INDEX idx_task (task_id)
);
```

### 2.2 Schema Comparison

**v1.0.0 Schema (Basic):**
```sql
CREATE TABLE playbooks (
    id UUID PRIMARY KEY,
    agent_id UUID,
    playbook_name VARCHAR(200),
    playbook_content JSONB,  -- Entire playbook as blob
    version INTEGER,
    success_rate DECIMAL(5, 2),
    times_used INTEGER
);

-- Issues:
-- - Playbook is monolithic (hard to query individual lessons)
-- - No scope hierarchy (agent/team/org)
-- - No confidence tracking per lesson
-- - No automatic relevance scoring
```

**v1.1.0 Schema (Playbook-Enhanced):**
```sql
CREATE TABLE context_reflections (
    -- Individual lessons, not monolithic playbooks
    -- Scope hierarchy (agent → team → org)
    -- Confidence tracking (success_count/total_count)
    -- Tag-based relevance (automatic filtering)
    -- Deduplication (UNIQUE constraint)
);

-- Benefits:
-- ✅ Granular lesson tracking
-- ✅ Automatic scope inheritance
-- ✅ Confidence-based prioritization
-- ✅ Tag-based context injection
-- ✅ Usage analytics per lesson
```

---

## 3. Enhanced Agent Spawning Workflow

### 3.1 Team Coordinator: Agent Spawning (v1.1.0)

```typescript
// File: docker/coordinator/src/team-coordinator.ts

async function spawnEphemeralAgent(task: Task): Promise<void> {
  const agentId = generateAgentId(task.role);

  // STEP 1: Extract tags from task description
  const tags = extractTags(task.description);
  // "Fix TypeScript errors in Header component"
  // → ["typescript", "errors", "react", "component"]

  // STEP 2: Automatic context injection (load relevant playbook)
  const contextFile = `/tmp/context-${task.id}.json`;
  await executeHook('pre-spawn', {
    taskId: task.id,
    agentType: task.role,
    tags: tags,
    scope: `team:${this.state.teamId}`,
    outputFile: contextFile
  });

  // STEP 3: Context injection loads relevant lessons from PostgreSQL
  const context = await loadContext(contextFile);

  console.log(`Loaded ${context.lessons.length} lessons for agent ${agentId}`);
  console.log(`- Agent scope: ${context.agentLessons.length}`);
  console.log(`- Team scope: ${context.teamLessons.length}`);
  console.log(`- Org scope: ${context.orgLessons.length}`);

  // STEP 4: Spawn ephemeral container with context
  const container = await this.docker.createContainer({
    Image: `cfn-agent-${this.state.teamId}:latest`,
    Env: [
      `TEAM_ID=${this.state.teamId}`,
      `AGENT_ID=${agentId}`,
      `AGENT_ROLE=${task.role}`,
      `TASK_ID=${task.id}`,
      `TASK_PROMPT=${task.description}`,
      `CONTEXT_FILE=${contextFile}`,  // ← Playbook lessons
      `REDIS_NAMESPACE=team:${this.state.teamId}:agent:${task.role}:${agentId}`
    ],
    HostConfig: {
      NetworkMode: `team-${this.state.teamId}`,
      Binds: [
        `${this.getWorkspacePath(task.role)}:/workspace:${this.getAccessMode(task.role)}`,
        `${contextFile}:/context.json:ro`,  // ← Mount context file
        `/tmp/mcp-${agentId}.json:/home/claude/.config/claude/claude_desktop_config.json:ro`
      ],
      Memory: this.getMemoryLimit(task.role),
      AutoRemove: true  // ← Ephemeral: auto-remove on exit
    },
    Labels: {
      'cfn.component': 'agent',
      'cfn.ephemeral': 'true',
      'cfn.team': this.state.teamId,
      'cfn.task-id': task.id
    }
  });

  await container.start();

  // STEP 5: Monitor completion (no long-term tracking needed)
  const result = await this.waitForCompletion(container.id, task.id);

  // STEP 6: Automatic lesson extraction (post-completion hook)
  await executeHook('post-completion', {
    taskId: task.id,
    agentId: agentId,
    agentOutput: result.output,
    autoExtract: true  // ← Extract lessons from agent output
  });

  console.log(`Agent ${agentId} completed task ${task.id} and exited`);
  // Container auto-removed, but lessons persisted to PostgreSQL
}
```

### 3.2 Context Injection Hook

```bash
#!/bin/bash
# File: .claude/hooks/cfn-pre-spawn-context-inject.sh
# Automatic playbook loading before agent spawn

TASK_ID=$1
AGENT_TYPE=$2
TAGS=$3
SCOPE=$4
OUTPUT_FILE=$5

# Query PostgreSQL for relevant lessons
psql -h $POSTGRES_HOST -U cfn_admin -d cfn_corporate <<EOF > "$OUTPUT_FILE"
SELECT json_agg(
  json_build_object(
    'id', id,
    'content', content,
    'scope', scope,
    'confidence', confidence,
    'success_count', success_count,
    'total_count', total_count,
    'tags', tags,
    'lesson_type', lesson_type
  ) ORDER BY
    CASE scope
      WHEN 'agent' THEN 1
      WHEN 'team' THEN 2
      WHEN 'org' THEN 3
    END,
    confidence DESC
) as lessons
FROM context_reflections
WHERE
  -- Team-specific or org-wide lessons
  (team_id = '${SCOPE##*:}' OR scope = 'org')
  AND
  -- Tags overlap with task tags
  tags && ARRAY['${TAGS//,/\',\'}']
LIMIT 100;
EOF

# Result written to $OUTPUT_FILE
# Agent will load this file on startup
```

### 3.3 Agent Initialization (Enhanced)

```typescript
// File: docker/agents/src/agent-main.ts

async function agentMain() {
  const taskId = process.env.TASK_ID!;
  const agentId = process.env.AGENT_ID!;
  const contextFile = process.env.CONTEXT_FILE!;

  // STEP 1: Load playbook lessons from context file
  const context = JSON.parse(fs.readFileSync(contextFile, 'utf8'));

  console.log(`Loaded ${context.lessons.length} playbook lessons`);

  const playbook = {
    agentLessons: context.lessons.filter(l => l.scope === 'agent'),
    teamLessons: context.lessons.filter(l => l.scope === 'team'),
    orgLessons: context.lessons.filter(l => l.scope === 'org')
  };

  // STEP 2: Execute task with playbook knowledge
  const taskPrompt = buildTaskPrompt(process.env.TASK_PROMPT!, playbook);

  // Example enhanced prompt:
  // Original: "Fix TypeScript errors in Header.tsx"
  // Enhanced:
  // """
  // Fix TypeScript errors in Header.tsx
  //
  // Relevant playbook lessons (12):
  // 1. [TEAM] "React components should use explicit return types" (0.95 confidence, 52/53 success)
  // 2. [ORG] "Import types from @types packages, not implementation files" (0.98 confidence, 127/127 success)
  // 3. [TEAM] "Use `React.FC<Props>` for functional component typing" (0.90 confidence, 38/40 success)
  // ...
  // """

  const result = await executeTask(taskPrompt);

  // STEP 3: Extract new lessons from execution
  const newLessons = extractLessons(result.output);

  console.log(`Discovered ${newLessons.length} new lessons`);

  // STEP 4: Store lessons to PostgreSQL
  for (const lesson of newLessons) {
    await storeLesson({
      taskId,
      agentId,
      teamId: process.env.TEAM_ID!,
      scope: determineScope(lesson),  // agent/team/org
      content: lesson.content,
      lessonType: lesson.type,
      tags: lesson.tags,
      confidence: 0.80  // Default for new lessons
    });
  }

  // STEP 5: Update confidence for used lessons
  for (const usedLesson of context.lessons.filter(l => wasApplied(l, result))) {
    await updateLessonConfidence(usedLesson.id, result.success);
  }

  // STEP 6: Report completion and exit
  await reportCompletion(taskId, agentId, result);

  process.exit(0);  // Ephemeral: exit after single task
}

function extractLessons(output: string): Lesson[] {
  const lessons: Lesson[] = [];

  // Regex patterns for automatic lesson extraction
  const patterns = [
    { type: 'learned', regex: /Learned: (.+)/g },
    { type: 'best_practice', regex: /Best practice: (.+)/g },
    { type: 'anti_pattern', regex: /Anti-pattern: (.+)/g },
    { type: 'key_insight', regex: /Key insight: (.+)/g }
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.regex.exec(output)) !== null) {
      lessons.push({
        content: match[1],
        type: pattern.type,
        tags: extractTagsFromContent(match[1])
      });
    }
  }

  return lessons;
}

async function storeLesson(lesson: LessonInput): Promise<void> {
  await postgres.query(
    `INSERT INTO context_reflections (
      owner_id, team_id, scope, content, lesson_type,
      tags, confidence, success_count, total_count
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (team_id, scope, content)
    DO UPDATE SET
      success_count = context_reflections.success_count + 1,
      total_count = context_reflections.total_count + 1,
      confidence = (context_reflections.success_count + 1)::DECIMAL / (context_reflections.total_count + 1),
      updated_at = NOW()`,
    [
      lesson.agentId,
      lesson.teamId,
      lesson.scope,
      lesson.content,
      lesson.lessonType,
      lesson.tags,
      lesson.confidence,
      1,  // success_count
      1   // total_count
    ]
  );
}

async function updateLessonConfidence(lessonId: string, success: boolean): Promise<void> {
  await postgres.query(
    `UPDATE context_reflections
     SET
       success_count = success_count + CASE WHEN $2 THEN 1 ELSE 0 END,
       total_count = total_count + 1,
       confidence = (success_count + CASE WHEN $2 THEN 1 ELSE 0 END)::DECIMAL / (total_count + 1),
       last_used_at = NOW(),
       updated_at = NOW()
     WHERE id = $1`,
    [lessonId, success]
  );
}
```

---

## 4. Enhanced Implementation Plan Updates

### 4.1 Phase 3 Enhancement (Knowledge Persistence)

**Original Phase 3 (v1.0.0):**
- Implement Redis hot storage
- Implement PostgreSQL playbook storage
- Create knowledge migration pipeline

**Enhanced Phase 3 (v1.1.0):**
- Implement Redis hot storage (unchanged)
- **Replace:** PostgreSQL playbook storage → ACE context reflections schema
- **Add:** Automatic context injection hook (pre-spawn)
- **Add:** Automatic lesson extraction hook (post-completion)
- **Add:** Confidence scoring and update mechanism
- **Add:** Scope hierarchy (agent/team/org)
- Create knowledge migration pipeline (unchanged)

**New Deliverables:**
```bash
# Day 1: Create ACE schema
psql -h $POSTGRES_HOST -U cfn_admin -d cfn_corporate < config/postgres/ace-schema.sql

# Day 2: Implement context injection hook
bash .claude/hooks/cfn-pre-spawn-context-inject.sh \
  --task-id "task-123" \
  --agent-type "react-specialist" \
  --tags "typescript,react,errors" \
  --scope "team:frontend" \
  --output "/tmp/context-task-123.json"

# Day 3: Implement lesson extraction hook
bash .claude/hooks/cfn-post-completion-extract.sh \
  --task-id "task-123" \
  --agent-id "react-specialist-456" \
  --auto-extract

# Day 4: Integrate hooks into coordinator
# Modify: docker/coordinator/src/team-coordinator.ts
# - Add pre-spawn hook call
# - Add post-completion hook call

# Day 5: Test end-to-end
# Spawn agent → verify context loaded → verify lessons extracted
```

### 4.2 New Acceptance Criteria

**v1.0.0 Criteria:**
- [ ] Agent can save playbook to PostgreSQL
- [ ] Agent can load playbook on startup

**v1.1.0 Enhanced Criteria:**
- [ ] ✅ Agent loads relevant lessons based on task tags
- [ ] ✅ Lessons scoped correctly (agent/team/org)
- [ ] ✅ Confidence scores update on each use
- [ ] ✅ New lessons auto-extracted from agent output
- [ ] ✅ Duplicate lessons deduplicated (UNIQUE constraint)
- [ ] ✅ Agent spawns ephemeral (auto-remove on exit)
- [ ] ✅ Playbook accumulates over time (100+ lessons after 10 tasks)

---

## 5. Playbook Analytics Dashboard

### 5.1 Metrics to Track

```sql
-- Team playbook health
SELECT
  team_id,
  scope,
  COUNT(*) as lesson_count,
  AVG(confidence) as avg_confidence,
  SUM(success_count)::DECIMAL / NULLIF(SUM(total_count), 0) as success_rate
FROM context_reflections
WHERE team_id = 'frontend'
GROUP BY team_id, scope;

-- Top lessons by usage
SELECT
  content,
  scope,
  confidence,
  success_count,
  total_count,
  last_used_at
FROM context_reflections
WHERE team_id = 'frontend'
ORDER BY success_count DESC
LIMIT 10;

-- Lesson discovery rate (new lessons per week)
SELECT
  DATE_TRUNC('week', created_at) as week,
  COUNT(*) as new_lessons
FROM context_reflections
WHERE team_id = 'frontend'
GROUP BY week
ORDER BY week DESC;

-- Agent learning efficiency (lessons applied vs discovered)
SELECT
  a.id as agent_id,
  a.role,
  COUNT(DISTINCT tr.reflection_id) as lessons_applied,
  COUNT(DISTINCT cr.id) as lessons_discovered,
  COUNT(DISTINCT tr.reflection_id)::DECIMAL / NULLIF(COUNT(DISTINCT cr.id), 0) as learning_ratio
FROM agents a
LEFT JOIN task_reflections tr ON a.id = tr.task_id
LEFT JOIN context_reflections cr ON cr.owner_id = a.id
GROUP BY a.id, a.role;
```

### 5.2 Grafana Dashboard Panels

```yaml
# Panel 1: Playbook Size Over Time
Query: SELECT created_at, COUNT(*) OVER (ORDER BY created_at) as cumulative_lessons
       FROM context_reflections
       WHERE team_id = 'frontend'

# Panel 2: Confidence Distribution
Query: SELECT confidence, COUNT(*) as lesson_count
       FROM context_reflections
       WHERE team_id = 'frontend'
       GROUP BY confidence

# Panel 3: Top 10 Lessons (Success Rate)
Query: SELECT content, confidence, success_count, total_count
       FROM context_reflections
       WHERE team_id = 'frontend'
       ORDER BY confidence DESC
       LIMIT 10

# Panel 4: Lesson Types Breakdown
Query: SELECT lesson_type, COUNT(*) as count
       FROM context_reflections
       WHERE team_id = 'frontend'
       GROUP BY lesson_type
```

---

## 6. Benefits Summary

### 6.1 Cost Savings

| Metric | v1.0.0 (Persistent) | v1.1.0 (Ephemeral) | Improvement |
|--------|---------------------|---------------------|-------------|
| Monthly cost | $1,920 | $180 | **90.6% reduction** |
| Idle overhead | 95% | 0% | **95% elimination** |
| Memory footprint | 40GB (24/7) | 4GB (peak) | **90% reduction** |

### 6.2 Knowledge Persistence

| Metric | v1.0.0 | v1.1.0 | Improvement |
|--------|--------|--------|-------------|
| Knowledge survival | Crash-dependent | 100% | **Guaranteed** |
| Cross-agent learning | None | Cumulative | **Organizational learning** |
| Consistency | Low | High | **Shared playbook** |
| Lesson granularity | Monolithic | Individual | **Fine-grained** |

### 6.3 Developer Experience

| Metric | v1.0.0 | v1.1.0 | Improvement |
|--------|--------|--------|-------------|
| Manual playbook creation | Required | Automatic | **Zero effort** |
| Context injection | Manual | Automatic | **Zero effort** |
| Lesson extraction | Manual | Automatic | **Zero effort** |
| Confidence tracking | None | Automatic | **Data-driven** |

---

## 7. Migration Path (v1.0.0 → v1.1.0)

### 7.1 Database Migration

```sql
-- Step 1: Create new ACE schema
CREATE TABLE context_reflections (...);
CREATE TABLE playbook_usage (...);
CREATE TABLE task_reflections (...);

-- Step 2: Migrate existing playbooks to lessons
INSERT INTO context_reflections (owner_id, team_id, scope, content, confidence)
SELECT
  agent_id,
  (SELECT team_id FROM agents WHERE id = playbooks.agent_id),
  'team',
  jsonb_array_elements(playbook_content->'steps')->>'description',
  success_rate / 100.0
FROM playbooks;

-- Step 3: Drop old playbooks table (after validation)
DROP TABLE playbooks;
```

### 7.2 Code Migration

```typescript
// Before (v1.0.0):
const playbook = await loadPlaybooks(agentId);
await executeTask(task, playbook);
await savePlaybook(playbook, agentId);

// After (v1.1.0):
// Context injection (automatic via hook)
// Agent loads /context.json on startup
// Lesson extraction (automatic via hook)
// No manual playbook management needed
```

### 7.3 Rollout Strategy

**Week 1:** Deploy ACE schema alongside existing playbooks table
**Week 2:** Enable context injection hooks for new tasks only
**Week 3:** Validate lesson extraction and confidence tracking
**Week 4:** Migrate historical playbooks to ACE schema
**Week 5:** Switch all teams to ephemeral agent pattern
**Week 6:** Drop old playbooks table

---

## 8. Integration with Corporate Teams

### 8.1 Team-Specific Playbook Examples

**Frontend Team Playbook (after 4 weeks):**
```
Agent lessons (scope=agent): 5
- "I prefer detailed error messages in console.log" - 0.88 confidence

Team lessons (scope=team): 32
- "React components should use explicit return types" - 0.95 confidence (52/53)
- "Use React.FC<Props> for functional component typing" - 0.90 confidence (38/40)
- "Import types from @types packages, not implementation" - 0.93 confidence (45/47)

Org lessons (scope=org): 18
- "Use environment variables for API keys" - 0.98 confidence (127/127)
- "Retry failed API calls 3 times with exponential backoff" - 0.93 confidence (89/92)

Total: 55 lessons, 0.91 avg confidence
```

**Backend Team Playbook (after 4 weeks):**
```
Team lessons (scope=team): 41
- "PostgreSQL connection pooling: max 10 connections per service" - 0.94 confidence (67/69)
- "Use parameterized queries to prevent SQL injection" - 0.98 confidence (125/125)
- "API rate limiting: 100 requests per minute per user" - 0.89 confidence (42/45)

Total: 59 lessons, 0.92 avg confidence
```

### 8.2 Cross-Team Knowledge Sharing

**Scenario:** DevOps learns deployment pattern, shares with all teams

```sql
-- DevOps agent discovers best practice
INSERT INTO context_reflections (
  team_id, scope, content, lesson_type, tags
) VALUES (
  'devops',
  'org',  -- ← Shared with entire organization
  'Always use health checks in Docker containers (HEALTHCHECK instruction)',
  'best_practice',
  ARRAY['docker', 'health-checks', 'reliability']
);

-- Now available to ALL teams
-- Frontend agents see this lesson when working on Docker tasks
-- Backend agents see this lesson when creating API containers
-- QA agents see this lesson when building test infrastructure
```

---

**End of Playbook Integration v1.1.0**
