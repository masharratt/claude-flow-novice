# ACE System Overview (Adaptive Context Extension)

**Version:** 1.0.0
**Status:** Production-Ready
**Integration:** CFN Loop, Agent Spawning, Learning System

---

## What is ACE?

The **Adaptive Context Extension (ACE)** system is a learning and context management framework that enables agents to:
1. **Learn from execution** - Extract lessons from completed tasks
2. **Store knowledge** - Persist insights in SQLite with semantic tagging
3. **Inject context** - Provide relevant learnings to agents before task execution
4. **Query intelligently** - Find relevant bullets by category, tags, or semantic similarity
5. **Curate automatically** - Merge new learnings with deduplication and version control

---

## Core Components

### 1. Context Bullets (Adaptive Context Table)

**Structure:**
```sql
CREATE TABLE adaptive_context (
  bullet_id TEXT PRIMARY KEY,           -- STRAT-001, PATTERN-042, etc.
  category TEXT NOT NULL,               -- strategy, pattern, edge_case, domain_insight, anti_pattern, optimization
  content TEXT NOT NULL,                -- Actionable lesson with context
  confidence_score REAL DEFAULT 0.5,    -- 0.0-1.0 based on evidence
  helpful_count INTEGER DEFAULT 0,      -- Times this bullet helped
  harmful_count INTEGER DEFAULT 0,      -- Times this bullet led astray
  priority INTEGER DEFAULT 5,           -- 1-10 importance ranking
  tags TEXT,                            -- JSON array: ["cfn-loop", "redis", "coordination"]
  source_context TEXT,                  -- task-id, phase-id, swarm-id
  last_used_at TIMESTAMP,
  usage_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Example Bullet:**
```markdown
**[STRAT-042]** CFN Loop coordination: Redis pub/sub + SQLite persistence
*Confidence: 0.85 | Helpful: 8 | Priority: 8*
Use Redis pub/sub for ephemeral coordination state (heartbeats, agent signals) and SQLite for persistent audit trails and cross-loop data storage.
**Tags:** cfn-loop, coordination, redis, sqlite, persistence
```

### 2. Slash Commands (5 Commands)

**Available Commands:**

1. **/context-reflect** - Extract lessons from task execution
   ```bash
   /context-reflect --task-id=task-auth-123 --auto-curate
   ```

2. **/context-curate** - Merge reflections into adaptive context
   ```bash
   /context-curate --reflection-id=reflection-abc --auto-merge
   ```

3. **/context-query** - Search bullets by category/tags/confidence
   ```bash
   /context-query --tags=cfn-loop,coordination --min-confidence=0.8
   ```

4. **/context-inject** - Inject bullets into CLAUDE.md or agent instructions
   ```bash
   /context-inject --phase=phase-0-foundation --target=./CLAUDE.md
   ```

5. **/context-stats** - View bullet health metrics
   ```bash
   /context-stats
   ```

### 3. Specialized Agents (2 Agents)

- **context-reflector** - Analyzes execution traces, extracts structured lessons
- **context-curator** - Merges reflections using semantic deduplication

---

## Integration with CFN Loop

### Pre-Agent Spawn Context Injection

**Pattern for Coordinators:**

Before spawning agents in Loop 3, coordinators should:

1. **Query relevant context bullets** based on task/phase tags
2. **Inject top bullets** into agent instructions
3. **Log usage** for tracking bullet effectiveness

**Example:**

```javascript
// 1. Query relevant bullets for this phase
const bullets = await queryContext({
  tags: ['cfn-loop', 'coordination', 'phase-0'],
  category: 'strategy',
  minConfidence: 0.7,
  limit: 5
});

// 2. Format bullets for injection
const contextSection = formatBulletsForInjection(bullets);

// 3. Spawn agent with injected context
Task("coder-1", `
## 📘 Adaptive Context (Relevant Learnings)

${contextSection}

---

## TASK ASSIGNMENT
${taskDescription}
`, "coder");

// 4. Log bullet usage
bullets.forEach(bullet => {
  logContextUsage(bullet.bullet_id, taskId, 'coder-1');
});
```

### Post-Loop Reflection

**Pattern for Loop 3 Completion:**

After Loop 3 completes, coordinators should:

1. **Trigger reflection** on agent work
2. **Extract lessons** from execution traces
3. **Auto-curate** if confidence high enough

**Example:**

```javascript
// After Loop 3 completes
const reflectionId = await reflectOnExecution({
  taskId: 'task-auth-implementation',
  agentId: 'coder-1',
  swarmId: 'swarm-phase-0',
  phase: 'phase-0-foundation',
  autoCurate: true  // Auto-merge high-confidence lessons (≥0.8)
});

// Reflection extracts structured lessons like:
// - STRAT-XXX: Successful strategies
// - PATTERN-XXX: Reusable code patterns
// - EDGE-XXX: Edge cases discovered
// - ANTI-XXX: Anti-patterns to avoid
```

---

## Context Injection Modes

### 1. Phase-Aware Injection

Auto-select bullets based on CFN Loop phase:

```bash
# Phase 0: Foundation
/context-inject --phase=phase-0-foundation
# Tags: architecture, foundation, setup, infrastructure

# Phase 1: Core Implementation
/context-inject --phase=phase-1-implementation
# Tags: coding, patterns, testing, best-practices

# Phase 2: Security & Optimization
/context-inject --phase=phase-2-security
# Tags: security, acl, validation, performance
```

### 2. Agent-Specific Injection

Inject bullets relevant to specific agent types:

```bash
# For security specialist agents
/context-inject --agent-type=security-specialist --category=pattern --min-helpful=5

# For coder agents
/context-inject --agent-type=coder --tags=rust,concurrency --limit=10

# For architect agents
/context-inject --agent-type=architect --category=strategy --priority-min=8
```

### 3. Dynamic Injection During Execution

```javascript
// Inline injection when spawning agents
const relevantBullets = await contextInject({
  tags: ['auth', 'security'],
  limit: 5,
  format: 'inline'
});

Task("coder-1", `
  Implement authentication system.

  Before you start, review these proven patterns:
  ${relevantBullets}

  Follow these to avoid common pitfalls.
`, "coder");
```

---

## Bullet Categories

### 1. Strategy (High-Level Approaches)
- **Format:** `[STRAT-XXX]`
- **Example:** "Use Redis pub/sub for ephemeral state + SQLite for persistent audit trails"
- **When to use:** Architectural decisions, coordination patterns, system design

### 2. Pattern (Reusable Code/Architecture Patterns)
- **Format:** `[PATTERN-XXX]`
- **Example:** "API pagination via `while true` until empty page"
- **When to use:** Implementation patterns, coding techniques, proven solutions

### 3. Edge Case (Unexpected Conditions)
- **Format:** `[EDGE-XXX]`
- **Example:** "SQLite ACL permission boundary with nested swarms"
- **When to use:** Corner cases, boundary conditions, gotchas

### 4. Domain Insight (Domain-Specific Knowledge)
- **Format:** `[DOMAIN-XXX]`
- **Example:** "Use phone contacts as identity key when identifying relationships"
- **When to use:** Business domain rules, domain-specific constraints

### 5. Anti-Pattern (Approaches to Avoid)
- **Format:** `[ANTI-XXX]`
- **Example:** "Avoid file-based coordination without locks (use Redis pub/sub)"
- **When to use:** Common mistakes, ineffective approaches, pitfalls

### 6. Optimization (Performance/Efficiency Improvements)
- **Format:** `[OPT-XXX]`
- **Example:** "Cache Redis responses with 5-minute TTL for read-heavy operations"
- **When to use:** Performance tips, resource optimization, efficiency gains

---

## Confidence Scoring

**Guidelines for Reflection Confidence:**

| Confidence | Evidence Level | Example |
|-----------|----------------|---------|
| **0.9-1.0** | Strong empirical | Tests pass, metrics improved, multiple validations |
| **0.7-0.9** | Good evidence | Code works, no tests, positive outcome |
| **0.5-0.7** | Moderate evidence | Worked in specific case, needs broader validation |
| **0.3-0.5** | Hypothesis | Observation, needs testing, limited evidence |
| **0.0-0.3** | Speculation | Unvalidated idea, minimal evidence |

**Curation Updates Confidence:**
- **Reinforcement:** `confidence += 0.05` (up to 1.0) when similar lesson extracted again
- **Helpful usage:** `confidence += 0.02` when bullet marked helpful in task
- **Harmful usage:** `confidence -= 0.10` when bullet led to errors

---

## Deduplication & Versioning

**Semantic Deduplication:**

When curating reflections, the system checks for similar bullets:

```javascript
// Cosine similarity with embeddings
const similarity = cosineSimilarity(newBullet.embedding, existingBullet.embedding);

if (similarity > 0.85) {
  // Merge: Increment helpful_count, boost confidence
  UPDATE adaptive_context SET helpful_count = helpful_count + 1 WHERE bullet_id = 'STRAT-001';
} else if (similarity > 0.6) {
  // Version: Create merged bullet
  INSERT INTO adaptive_context (bullet_id, content, version, parent_bullet_id)
  VALUES ('STRAT-001-v2', 'Merged content...', 2, 'STRAT-001');
} else {
  // New: Add as separate bullet
  INSERT INTO adaptive_context (bullet_id, content) VALUES ('STRAT-042', 'New strategy...');
}
```

**Version Control:**
- Original bullet archived (is_active = 0)
- New version references parent (parent_bullet_id)
- Version number increments (version = 2, 3, ...)

---

## Usage Tracking

**Context Usage Log:**

```sql
CREATE TABLE context_usage_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bullet_id TEXT NOT NULL,
  task_id TEXT,
  agent_id TEXT,
  usage_outcome TEXT,  -- 'helpful', 'harmful', 'neutral'
  outcome_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bullet_id) REFERENCES adaptive_context(bullet_id)
);
```

**Tracking Pattern:**

```javascript
// When agent uses a bullet
await logContextUsage({
  bulletId: 'STRAT-042',
  taskId: 'task-auth-123',
  agentId: 'coder-1',
  usageOutcome: 'helpful',
  outcomeReason: 'Redis pub/sub pattern worked perfectly for coordination'
});

// Triggers update:
// - helpful_count += 1
// - usage_count += 1
// - last_used_at = CURRENT_TIMESTAMP
```

---

## ACL & Security

**Access Control Levels:**

| ACL Level | Scope | Bullet Visibility |
|-----------|-------|------------------|
| **1 (Private)** | Agent-only | Only creating agent can see/use |
| **3 (Swarm)** | Swarm-shared | All agents in swarm can see/use |
| **4 (Project)** | Project-wide | All project agents can see/use |
| **5 (System)** | Global | All agents across all projects |

**Default ACL by Source:**
- Agent reflections: ACL 1 (Private) → requires manual promotion to 3+
- Swarm reflections: ACL 3 (Swarm)
- Phase reflections: ACL 4 (Project)
- System patterns: ACL 5 (Global)

**Sensitive Data Handling:**
- Auto-redact API keys, credentials, PII
- Encrypt bullets with sensitive tags (security, credentials)
- Audit trail in ACL Level 5 (system admin only)

---

## Performance

**Query Performance:**
- Indexed queries: <5ms (tag/category filters)
- Semantic search: <50ms (with SQLite-vec embeddings)
- Injection overhead: <100ms (5-10 bullets)

**Caching:**
- Redis cache: 5-minute TTL for query results
- Bullet embeddings: Lazy generation, cached permanently
- Usage stats: Aggregated hourly via triggers

**Storage:**
- Average bullet size: ~200 bytes
- 1000 bullets: ~200KB in SQLite
- Embeddings: +768 bytes/bullet (if semantic search enabled)

---

## Best Practices

### For Coordinators

1. **Always inject context before spawning agents** (especially Loop 3)
2. **Use phase-aware injection** for automatic relevance filtering
3. **Trigger reflection after Loop 3** to capture learnings
4. **Auto-curate high-confidence lessons** (≥0.8) to speed up learning
5. **Log bullet usage** to track effectiveness

### For Agents

1. **Review injected bullets** before starting implementation
2. **Mark bullets as helpful/harmful** in task completion report
3. **Add new lessons to reflection** during task execution
4. **Reference bullet IDs** when following proven patterns

### For Product Owners

1. **Review high-priority bullets** (priority ≥8) for strategic alignment
2. **Validate bullets with harmful_count ≥3** for archival
3. **Promote valuable bullets** from ACL 1 → ACL 3/4 for team sharing
4. **Audit bullet health** monthly via `/context-stats`

---

## Example Workflow

### Complete ACE Integration (Phase Execution)

**Step 1: Pre-Phase Context Injection**
```bash
# Before starting phase
/context-inject --phase=phase-0-foundation --target=./CLAUDE.md --min-confidence=0.7
```

**Step 2: Agent Spawn with Context**
```javascript
// Coordinator spawns agent with injected context
const bullets = await queryContext({ phase: 'phase-0', limit: 5 });
Task("coder-1", `
## 📘 Adaptive Context
${formatBullets(bullets)}

## TASK
Implement SQLite memory system with ACL.
`, "coder");
```

**Step 3: Agent Execution**
```javascript
// Agent reads bullets, follows proven patterns
// [STRAT-042] says use Redis + SQLite → agent implements both
```

**Step 4: Post-Task Reflection**
```bash
# After task completion
/context-reflect --task-id=task-memory-impl --auto-curate
```

**Step 5: Curation**
```bash
# Curator merges lessons into adaptive_context
# - New strategy: STRAT-043
# - Reinforced existing: STRAT-042 (helpful_count += 1)
```

**Step 6: Usage Tracking**
```sql
-- Automatic tracking via triggers
INSERT INTO context_usage_log (bullet_id, task_id, agent_id, usage_outcome)
VALUES ('STRAT-042', 'task-memory-impl', 'coder-1', 'helpful');
```

---

## Integration Points

### 1. CFN Loop Integration
- **Loop 0:** Epic-level context injection (strategic bullets)
- **Loop 2:** Validation pattern injection for reviewers
- **Loop 3:** Implementation pattern injection for coders
- **Loop 4:** Decision context for Product Owner

### 2. Agent Spawning
- Pre-task hook: Query and inject context
- Task prompt: Include formatted bullets
- Post-task hook: Trigger reflection

### 3. Memory System
- Store bullets in SQLite with ACL
- Cache queries in Redis (5-min TTL)
- Audit usage in context_usage_log

### 4. Validation Hooks
- Post-edit validation can reference bullets
- Security validator uses anti-pattern bullets
- TDD validator uses test pattern bullets

---

## Metrics & Health

**Bullet Health Indicators:**
```sql
-- Query bullet health
SELECT
  category,
  COUNT(*) as total_bullets,
  AVG(confidence_score) as avg_confidence,
  AVG(helpful_count) as avg_helpful,
  AVG(harmful_count) as avg_harmful,
  SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_bullets
FROM adaptive_context
GROUP BY category;
```

**Expected Ranges:**
- **Avg Confidence:** 0.7-0.9 (healthy system learns from evidence)
- **Avg Helpful Count:** 5-15 (bullets being used effectively)
- **Avg Harmful Count:** <2 (bullets mostly correct)
- **Active Bullets:** 100-500 (curated, not overwhelming)

**Maintenance:**
- **Weekly:** Archive bullets with harmful_count ≥5 AND helpful_count <2
- **Monthly:** Deduplicate similar bullets (similarity >0.90)
- **Quarterly:** Prune unused bullets (last_used_at >90 days, helpful_count <3)

---

## See Also

- **Slash Commands:** `.claude/commands/context-*.md` (5 commands)
- **Agents:** `.claude/agents/context-reflector.md`, `context-curator.md`
- **CFN Loop Rules:** `.claude/cfn-loop-rules.md`
- **Memory System:** `.claude/coordinator-patterns.md` (SQLite integration)

---

**Version:** 1.0.0
**Last Updated:** 2025-10-18
**Status:** Production-Ready
