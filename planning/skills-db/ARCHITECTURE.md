# Dynamic Skills Database - System Architecture

## Document Metadata
- **Version:** 1.0.0
- **Status:** Draft
- **Date:** 2025-11-15
- **Related:** SPECIFICATION.md, PSEUDOCODE.md, IMPLEMENTATION_PLAN.md

---

## Table of Contents
1. [System Overview](#1-system-overview)
2. [Component Architecture](#2-component-architecture)
3. [Data Flow](#3-data-flow)
4. [Storage Architecture](#4-storage-architecture)
5. [Integration Points](#5-integration-points)
6. [Deployment Architecture](#6-deployment-architecture)
7. [Security Architecture](#7-security-architecture)
8. [Performance Architecture](#8-performance-architecture)
9. [Migration Architecture](#9-migration-architecture)

---

## 1. System Overview

### 1.1 Architectural Principles

**Hybrid Storage Pattern:**
- **Metadata:** SQLite database (selection logic, mappings, analytics)
- **Content:** Git-versioned markdown files (skill content, diffable)
- **Bootstrap:** Static files (no database dependency)

**Design Goals:**
1. **Minimize complexity:** SQLite over PostgreSQL, file-based content over BLOB storage
2. **Preserve git workflow:** Content changes tracked in version control
3. **Enable contextual loading:** Query-based skill selection vs static includes
4. **Support analytics:** Track skill effectiveness and usage patterns
5. **Backward compatible:** Zero breaking changes to existing agent workflows

### 1.2 High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Main Chat / CFN Loop                    │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Agent Prompt Builder                         │
│  (src/cli/agent-prompt-builder.ts)                              │
└────────┬────────────────────────────────────────────┬───────────┘
         │                                            │
         ▼                                            ▼
┌─────────────────────────┐              ┌─────────────────────────┐
│   Bootstrap Skills      │              │   Skill Loader          │
│   (Static Files)        │              │   (Database-Driven)     │
│                         │              │                         │
│  1. database-connection │              │  • Query by agent type  │
│  2. error-handling      │              │  • Filter by context    │
│  3. bash-fundamentals   │              │  • Load content + hash  │
│  4. file-operations     │              │  • Cache skills         │
│  5. skill-loader        │              │                         │
└─────────────────────────┘              └────────┬────────────────┘
                                                  │
         ┌────────────────────────────────────────┤
         │                                        │
         ▼                                        ▼
┌─────────────────────────┐          ┌─────────────────────────────┐
│  Skills Database        │          │  Skill Content Files        │
│  (SQLite)               │          │  (Git-versioned Markdown)   │
│                         │          │                             │
│  • skills               │◄─────────│  .claude/skills/            │
│  • agent_skill_mappings │  hash    │    cfn-coordination/        │
│  • skill_usage_log      │  verify  │      SKILL.md               │
│  • bootstrap_skills     │          │    jwt-authentication/      │
│                         │          │      SKILL.md               │
└────────┬────────────────┘          └─────────────────────────────┘
         │
         ▼
┌─────────────────────────┐          ┌─────────────────────────────┐
│  CLI Tools              │          │  YAML Snapshot              │
│                         │◄────────►│  (Code Review)              │
│  • skill list           │  export  │                             │
│  • skill assign         │  import  │  .claude/skills-database/   │
│  • skill create         │          │    snapshot.yaml            │
│  • skill analytics      │          │                             │
└─────────────────────────┘          └─────────────────────────────┘
```

---

## 2. Component Architecture

### 2.1 Core Components

#### Component: Skill Loader
**Location:** `src/cli/skill-loader.ts`

**Responsibilities:**
- Load bootstrap skills (static files, no DB)
- Query database for agent-skill mappings
- Filter skills by task context (keywords, phase, mode)
- Load skill content from disk
- Validate content hashes
- Cache skills in memory
- Log skill usage for analytics

**Interfaces:**
```typescript
interface SkillLoader {
  loadSkillsForAgent(agentType: string, context: TaskContext): Promise<Skill[]>;
  getSkill(idOrName: number | string): Promise<Skill>;
  validateIntegrity(): Promise<ValidationResult>;
  logSkillUsage(usage: SkillUsageLog): Promise<void>;
}
```

**Dependencies:**
- `better-sqlite3` (SQLite driver)
- `fs/promises` (File I/O)
- `crypto` (SHA256 hashing)
- `SkillCache` (In-memory caching)

---

#### Component: Skill Database
**Location:** `.claude/skills-database/skills.db`

**Responsibilities:**
- Store skill metadata (name, category, version, status)
- Store agent-skill mappings with conditions
- Log skill usage events
- Maintain bootstrap skills registry

**Schema:**
- `skills` (62 rows × ~1KB = 62KB)
- `agent_skill_mappings` (67 agents × 8 skills avg = 536 rows × 500 bytes = 268KB)
- `skill_usage_log` (10,000 events/day × 200 bytes = 2MB/day, 60MB/month)
- `bootstrap_skills` (5 rows × 200 bytes = 1KB)

**Total Size:** ~70MB for 30 days of usage logs

**Indexes:**
- `idx_skills_name` (UNIQUE)
- `idx_skills_status` (filter active skills)
- `idx_agent_skills` (agent_type, priority) - **CRITICAL for performance**
- `idx_usage_agent_type` (analytics queries)
- `idx_usage_skill` (effectiveness analysis)

---

#### Component: Skill Cache
**Location:** `src/cli/skill-cache.ts`

**Responsibilities:**
- Cache up to 100 skill contents in memory
- TTL-based expiration (5 minutes)
- LRU eviction when cache full
- Invalidation on skill updates

**Data Structure:**
```typescript
class SkillCache {
  private cache: Map<string, CachedSkill> = new Map();
  private maxSize: number = 100;
  private ttl: number = 300000; // 5 minutes

  get(skillName: string): string | null;
  set(skillName: string, content: string): void;
  invalidate(skillName: string): void;
  clear(): void;
}
```

**Memory Usage:** 100 skills × 50KB avg = 5MB

---

#### Component: CLI Tool Suite
**Location:** `src/cli/skill-cli.ts`

**Commands:**
```typescript
interface SkillCLI {
  list(options: ListOptions): void;
  assign(options: AssignOptions): void;
  create(options: CreateOptions): void;
  update(options: UpdateOptions): void;
  deprecate(options: DeprecateOptions): void;
  export(outputPath: string): void;
  import(inputPath: string, validateOnly: boolean): void;
  analytics(command: string, options: AnalyticsOptions): void;
  validate(options: ValidateOptions): void;
}
```

**User Interface:**
```bash
npx cfn skill <command> [options]
```

---

#### Component: YAML Snapshot Manager
**Location:** `src/cli/yaml-snapshot.ts`

**Responsibilities:**
- Export database to human-readable YAML
- Import YAML with validation
- Diff detection for code review
- Schema version compatibility

**File Format:**
```yaml
version: "1.0"
exported_at: "2025-11-15T10:30:00Z"
schema_version: 1
skills: [...]
agent_skill_mappings: [...]
```

**Size:** ~200KB for 62 skills + 536 mappings

---

### 2.2 Integration Components

#### Component: Agent Prompt Builder Integration
**Location:** `src/cli/agent-prompt-builder.ts` (modified)

**Changes:**
```typescript
// BEFORE (static file-based)
const skillsSection = buildSkillsSection(); // Hardcoded includes

// AFTER (database-driven)
const skillLoader = new SkillLoader();
const skills = await skillLoader.loadSkillsForAgent(
  definition.type,
  context
);
const skillsSection = formatSkillsForPrompt(skills);
```

**Backward Compatibility:**
- Feature flag: `CFN_SKILLS_DATABASE=true`
- Falls back to static skills if database unavailable
- Bootstrap skills always loaded (no flag required)

---

#### Component: Git Pre-Commit Hook
**Location:** `.git/hooks/pre-commit`

**Responsibilities:**
- Validate skill assignments before commit
- Check content hashes match files
- Ensure YAML snapshot is up-to-date
- Block commit if validation fails

**Script:**
```bash
#!/bin/bash
npx cfn skill validate --strict || {
  echo "Skill validation failed. Run 'npx cfn skill export' to update snapshot."
  exit 1
}
```

---

## 3. Data Flow

### 3.1 Skill Loading Flow (Agent Spawn)

```
┌──────────────────────────────────────────────────────────────────┐
│ 1. Agent Spawn Request                                           │
│    Input: agentType="backend-developer", taskContext={...}       │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ 2. Load Bootstrap Skills (Static Files)                          │
│    • database-connection.md                                      │
│    • error-handling.md                                           │
│    • bash-fundamentals.md                                        │
│    • file-operations.md                                          │
│    • skill-loader.md                                             │
│    Time: ~2ms (cached by OS)                                     │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ 3. Query Database for Agent Skills                               │
│    SELECT s.*, m.priority FROM skills s                          │
│    JOIN agent_skill_mappings m ON s.id = m.skill_id              │
│    WHERE m.agent_type = 'backend-developer'                      │
│      AND s.status = 'active'                                     │
│    ORDER BY m.priority ASC                                       │
│    Time: ~3ms (indexed query)                                    │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ 4. Apply Conditional Filtering                                   │
│    • taskContext includes "authentication" → load jwt-auth skill │
│    • phase == "loop3" → load implementation skills               │
│    • mode == "standard" → skip experimental skills               │
│    Time: ~1ms (in-memory filtering)                              │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ 5. Load Skill Content from Disk                                  │
│    • Check cache first (hit rate ~80%)                           │
│    • Read markdown files if cache miss                           │
│    • Validate SHA256 hashes (non-blocking)                       │
│    Time: ~8ms (5-7 skills, 80% cache hit)                        │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ 6. Build Agent Prompt                                            │
│    • Inject bootstrap skills                                     │
│    • Inject database skills                                      │
│    • Format with priority order                                  │
│    Time: ~1ms                                                    │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ 7. Log Skill Usage                                               │
│    INSERT INTO skill_usage_log (agent_id, skill_id, loaded_at)   │
│    Time: ~1ms (async, non-blocking)                              │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ 8. Return Prompt to Agent Spawner                                │
│    Output: Prompt with 5 bootstrap + 7 contextual skills         │
│    Total Time: ~16ms (vs 0ms baseline, 16ms overhead acceptable) │
└──────────────────────────────────────────────────────────────────┘
```

**Performance Analysis:**
- Baseline (static skills): 0ms (skills hardcoded in prompt)
- Database-driven: 16ms total
- Overhead: 16ms (+∞% but absolute value acceptable)
- Target: ≤15ms (✅ within spec after optimization)

**Optimization Opportunities:**
- Increase cache hit rate to 90% → reduce to 12ms
- Preload common agent skills → reduce to 8ms
- Parallel content loading → reduce to 10ms

---

### 3.2 Skill Update Flow

```
┌──────────────────────────────────────────────────────────────────┐
│ 1. Developer Edits Skill Content                                 │
│    vim .claude/skills/cfn-coordination/SKILL.md                  │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ 2. Update Database Metadata                                      │
│    npx cfn skill update --skill=cfn-coordination --version=2.2.0 │
│      --recalculate-hash                                          │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ 3. Recalculate Content Hash                                      │
│    hash=$(sha256sum .claude/skills/cfn-coordination/SKILL.md)    │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ 4. Update Database                                               │
│    UPDATE skills SET version='2.2.0', content_hash='<hash>',     │
│      updated_at=datetime('now')                                  │
│    WHERE name='cfn-coordination'                                 │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ 5. Invalidate Cache                                              │
│    skillCache.invalidate('cfn-coordination')                     │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ 6. Export YAML Snapshot                                          │
│    npx cfn skill export --output=snapshot.yaml                   │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ 7. Commit to Git                                                 │
│    git add .claude/skills/cfn-coordination/SKILL.md              │
│    git add .claude/skills-database/snapshot.yaml                 │
│    git commit -m "feat(skills): Update coordination to v2.2.0"   │
└──────────────────────────────────────────────────────────────────┘
```

---

### 3.3 Analytics Flow

```
┌──────────────────────────────────────────────────────────────────┐
│ 1. Skill Usage Logged (After Agent Execution)                    │
│    INSERT INTO skill_usage_log VALUES (                          │
│      agent_id='backend-developer-1',                             │
│      skill_id=1,                                                 │
│      confidence_before=0.75,                                     │
│      confidence_after=0.88                                       │
│    )                                                             │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ 2. Analytics Query (Daily/Weekly)                                │
│    npx cfn skill analytics effectiveness --skill=jwt-auth        │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ 3. Aggregate Metrics                                             │
│    SELECT AVG(confidence_after - confidence_before) as impact,   │
│           COUNT(*) as usage_count                                │
│    FROM skill_usage_log                                          │
│    WHERE skill_id = 1 AND loaded_at >= datetime('now', '-30d')   │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ 4. Generate Report                                               │
│    Skill: jwt-authentication                                     │
│    Usage: 127 loads (30 days)                                    │
│    Avg Confidence Impact: +0.13                                  │
│    Recommendation: HIGHLY_EFFECTIVE                              │
└──────────────────────────────────────────────────────────────────┘
```

---

## 4. Storage Architecture

### 4.1 Database Storage

**Technology:** SQLite 3.x

**Location:** `.claude/skills-database/skills.db`

**Configuration:**
```sql
PRAGMA journal_mode = WAL;  -- Write-Ahead Logging for concurrency
PRAGMA synchronous = NORMAL;  -- Balance safety vs performance
PRAGMA cache_size = 10000;  -- 10,000 pages × 4KB = 40MB cache
PRAGMA temp_store = MEMORY;  -- Store temp tables in memory
```

**Indexes:**
```sql
CREATE INDEX idx_skills_name ON skills(name);  -- UNIQUE lookups
CREATE INDEX idx_skills_status ON skills(status);  -- Filter active
CREATE INDEX idx_agent_skills ON agent_skill_mappings(agent_type, priority);  -- PRIMARY query path
CREATE INDEX idx_usage_skill ON skill_usage_log(skill_id);  -- Analytics
CREATE INDEX idx_usage_timestamp ON skill_usage_log(loaded_at);  -- Time-based queries
```

**Growth Projection:**
- Year 1: 100 skills, 100 agents, 3.6M usage events = 720MB
- Year 2: 200 skills, 200 agents, 7.2M usage events = 1.4GB
- Year 3: 500 skills, 500 agents, 18M usage events = 3.6GB

**Mitigation:**
- Archival policy: Move usage logs > 90 days to separate archive DB
- Vacuum monthly: `PRAGMA auto_vacuum = INCREMENTAL;`
- Compression: SQLite supports ZSTD compression (future)

---

### 4.2 File Storage (Skill Content)

**Technology:** Git-versioned markdown files

**Location:** `.claude/skills/`

**Structure:**
```
.claude/skills/
├── bootstrap/
│   ├── database-connection.md  (5KB)
│   ├── error-handling.md  (8KB)
│   ├── bash-fundamentals.md  (12KB)
│   ├── file-operations.md  (10KB)
│   └── skill-loader.md  (7KB)
├── cfn-coordination/
│   └── SKILL.md  (50KB)
├── jwt-authentication/
│   └── SKILL.md  (30KB)
└── ...
```

**Total Size:** 62 skills × 40KB avg = 2.5MB

**Benefits:**
- Git diff shows content changes
- Code review on skill content
- Branching for skill experiments
- Rollback to previous versions

---

### 4.3 YAML Snapshot Storage

**Technology:** YAML files

**Location:** `.claude/skills-database/snapshot.yaml`

**Purpose:**
- Human-readable database export
- Code review via git diff
- Deployment artifact
- Disaster recovery

**Update Frequency:** On every skill modification (via git hook)

**Size:** ~200KB (compressed ~50KB)

---

## 5. Integration Points

### 5.1 Agent Spawning Integration

**File:** `src/cli/agent-spawn.ts`

**Integration Point:**
```typescript
// Before spawning agent
const prompt = await buildAgentPrompt(agentDefinition, taskContext);

// buildAgentPrompt now calls SkillLoader
const skillLoader = new SkillLoader();
const skills = await skillLoader.loadSkillsForAgent(
  agentDefinition.type,
  taskContext
);
```

**Impact:** All CLI-spawned agents get contextual skills automatically

---

### 5.2 CFN Loop Orchestrator Integration

**File:** `.claude/skills/cfn-loop-orchestration/orchestrate.sh`

**Integration Point:**
```bash
# Pass task context to agent spawn
npx claude-flow-novice agent-spawn \
  --agent="backend-developer" \
  --context='{"keywords": ["auth"], "phase": "loop3"}' \
  --task-id="$TASK_ID"
```

**Database Query:**
```sql
SELECT s.* FROM skills s
JOIN agent_skill_mappings m ON s.id = m.skill_id
WHERE m.agent_type = 'backend-developer'
  AND s.status = 'active'
  AND (
    json_extract(m.conditions, '$.phase') LIKE '%loop3%' OR
    json_extract(m.conditions, '$.taskContext') LIKE '%auth%'
  )
ORDER BY m.priority ASC
```

---

### 5.3 Main Chat Task() Integration

**Current:** Main Chat spawns agents via Task() tool (no CLI)

**Challenge:** Task() agents don't use CLI agent-spawn → no database access

**Solution:** Inject skill loading into Task() agent prompts

**File:** `src/task-tool/agent-prompt-builder.ts` (hypothetical)

**Integration:**
```typescript
// When Main Chat uses Task() tool
const skillLoader = new SkillLoader();
const skills = await skillLoader.loadSkillsForAgent(
  agentType,
  extractContextFromPrompt(prompt)
);

// Inject skills into Task() agent prompt
const enhancedPrompt = `
${originalPrompt}

## Applicable Skills
${skills.map(s => s.content).join('\n\n')}
`;
```

---

## 6. Deployment Architecture

### 6.1 Development Environment

**Setup:**
```bash
# 1. Clone repository
git clone https://github.com/user/claude-flow-novice.git
cd claude-flow-novice

# 2. Install dependencies
npm install

# 3. Initialize database
npm run skills:init

# 4. Seed from existing skills
npm run skills:seed

# 5. Validate
npx cfn skill validate
```

**Database Location:** `.claude/skills-database/skills.db` (gitignored)

**YAML Snapshot:** `.claude/skills-database/snapshot.yaml` (committed)

---

### 6.2 CI/CD Pipeline

**GitHub Actions Workflow:**
```yaml
name: Skills Database Validation

on: [push, pull_request]

jobs:
  validate-skills:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm install

      - name: Initialize database
        run: npm run skills:init

      - name: Import snapshot
        run: npx cfn skill import .claude/skills-database/snapshot.yaml

      - name: Validate all skills
        run: npx cfn skill validate --strict

      - name: Check hash integrity
        run: |
          npx cfn skill validate --check-hashes || {
            echo "Skill content hashes don't match. Run 'npx cfn skill update --recalculate-all-hashes'"
            exit 1
          }
```

---

### 6.3 Production Deployment

**Deployment Steps:**
1. Pull latest code
2. Import YAML snapshot to database
3. Validate integrity
4. Enable feature flag
5. Monitor skill loading latency

**Rollback Plan:**
1. Disable feature flag (`CFN_SKILLS_DATABASE=false`)
2. Agents fall back to static skills
3. Zero downtime

---

## 7. Security Architecture

### 7.1 Threat Model

**Threats:**
1. **Malicious skill content injection** - Attacker modifies skill files
2. **Database tampering** - Attacker modifies skill metadata
3. **Supply chain attack** - Compromised skill dependencies
4. **Privilege escalation** - Agents gain write access to database

**Mitigations:**
1. **Content hash validation** - Detect file tampering (non-blocking warning)
2. **Read-only agent access** - Agents cannot write to database
3. **Git-based audit trail** - All content changes tracked
4. **Pre-commit validation** - Block commits with invalid skills

---

### 7.2 Access Control

**Roles:**

| Role | Read Skills | Write Skills | Read DB | Write DB | Execute Agents |
|------|-------------|--------------|---------|----------|----------------|
| Agent | ✅ | ❌ | ❌ | ❌ | ✅ |
| Developer | ✅ | ✅ | ✅ | ✅ via CLI | ✅ |
| CI/CD | ✅ | ❌ | ✅ | ✅ (validate) | ❌ |

**Implementation:**
- Agents run with read-only filesystem access to `.claude/skills/`
- Database writes restricted to CLI tools
- Git hooks enforce validation before commits

---

### 7.3 Content Validation

**Hash Validation:**
```typescript
function validateContentHash(skill: Skill): boolean {
  const content = fs.readFileSync(skill.contentPath, 'utf-8');
  const actualHash = crypto.createHash('sha256').update(content).digest('hex');

  if (actualHash !== skill.contentHash) {
    logger.warn(`Hash mismatch for skill ${skill.name}: expected ${skill.contentHash}, got ${actualHash}`);
    return false;
  }

  return true;
}
```

**Non-Blocking:** Hash mismatches log warnings but don't block skill loading (allows recovery)

---

## 8. Performance Architecture

### 8.1 Latency Budget

**Target:** ≤15ms total skill loading overhead per agent spawn

**Breakdown:**
- Bootstrap skills: 2ms (OS cache)
- Database query: 3ms (indexed)
- Conditional filtering: 1ms (in-memory)
- Content loading: 8ms (80% cache hit)
- Prompt building: 1ms
- Usage logging: 1ms (async)

**Total:** 16ms (1ms over budget, acceptable)

---

### 8.2 Caching Strategy

**L1 Cache: In-Memory Skill Cache**
- Size: 100 skills × 50KB = 5MB
- TTL: 5 minutes
- Hit rate: 80% (warm cache)
- Eviction: LRU

**L2 Cache: OS Filesystem Cache**
- Size: Automatic (kernel managed)
- Hit rate: 95% for frequently accessed files
- Latency: <1ms for cached reads

**Cache Invalidation:**
- Explicit: On skill update
- Implicit: TTL expiration
- Global: System restart

---

### 8.3 Database Optimization

**Query Optimization:**
```sql
-- BEFORE: Full table scan (slow)
SELECT * FROM skills WHERE name = 'cfn-coordination';

-- AFTER: Indexed lookup (fast)
CREATE UNIQUE INDEX idx_skills_name ON skills(name);
SELECT * FROM skills WHERE name = 'cfn-coordination';
```

**Result:** 100ms → 2ms (50× speedup)

**Connection Pooling:**
```typescript
// Single persistent connection (SQLite is single-writer)
const db = new Database('.claude/skills-database/skills.db', {
  readonly: true,  // Agents use read-only connections
  fileMustExist: true
});
```

---

### 8.4 Scalability Analysis

**Current Load:**
- 67 agents × 10 spawns/hour = 670 skill loads/hour
- 670 loads × 16ms = 10.7 seconds/hour of skill loading

**Projected Load (10× scale):**
- 200 agents × 100 spawns/hour = 20,000 skill loads/hour
- 20,000 loads × 16ms = 320 seconds/hour = 5.3 minutes/hour

**Bottlenecks:**
- SQLite write lock (usage logging) - **Mitigation:** Async batch inserts
- Disk I/O (content loading) - **Mitigation:** Increase cache hit rate to 95%
- Database size (usage logs) - **Mitigation:** Archive old logs

**Capacity:**
- SQLite handles 100,000 reads/second (far exceeds our 6 reads/second)
- Filesystem handles 10,000 file reads/second (exceeds our 6 reads/second)
- **Conclusion:** No scalability concerns for 10× growth

---

## 9. Migration Architecture

### 9.1 Migration Phases

**Phase 1: Database Setup (Week 1)**
- Create schema
- Seed bootstrap skills
- Import existing 62 skills
- Zero impact on agents

**Phase 2: Parallel Testing (Week 2)**
- Feature flag: `CFN_SKILLS_DATABASE=experimental`
- Log database results vs static results
- Fix discrepancies

**Phase 3: Canary Deployment (Week 3)**
- Enable for 10% of agents
- Monitor confidence scores
- Rollback if issues

**Phase 4: Full Rollout (Week 4)**
- Enable for all agents
- Deprecate static skill includes
- Document new workflow

**Phase 5: Optimization (Week 5+)**
- Analytics-driven skill assignment
- Cross-team skill sharing
- Deprecate unused skills

---

### 9.2 Rollback Strategy

**Trigger:** Confidence scores drop >5% or skill loading failures >1%

**Rollback Steps:**
1. Disable feature flag: `CFN_SKILLS_DATABASE=false`
2. Agents revert to static skills immediately
3. Investigate root cause
4. Fix database/code
5. Re-enable feature flag

**Recovery Time Objective (RTO):** <5 minutes

**Recovery Point Objective (RPO):** No data loss (usage logs optional)

---

### 9.3 Data Migration

**Filesystem → Database:**
```bash
#!/bin/bash
# scripts/migrate-skills-to-database.sh

for skill_dir in .claude/skills/*/; do
  skill_name=$(basename "$skill_dir")
  skill_file="$skill_dir/SKILL.md"

  if [ -f "$skill_file" ]; then
    # Calculate hash
    hash=$(sha256sum "$skill_file" | cut -d' ' -f1)

    # Infer metadata
    category=$(infer_category "$skill_name")
    team=$(infer_team "$skill_name")

    # Insert into database
    sqlite3 .claude/skills-database/skills.db <<SQL
      INSERT OR IGNORE INTO skills (
        name, category, team, content_path, content_hash, version, status
      ) VALUES (
        '$skill_name', '$category', '$team', '$skill_file', '$hash', '1.0.0', 'active'
      );
SQL
  fi
done
```

---

## 10. Monitoring & Observability

### 10.1 Metrics

**Skill Loading Metrics:**
- `skill_load_latency_ms{agent_type, phase}` - P50, P95, P99
- `skill_cache_hit_rate{agent_type}` - Percentage
- `skill_load_errors_total{skill_id, error_type}` - Counter

**Database Metrics:**
- `database_query_latency_ms{query_type}` - P50, P95, P99
- `database_connections_active` - Gauge
- `database_size_bytes` - Gauge

**Analytics Metrics:**
- `skill_usage_count{skill_id, agent_type, phase}` - Counter
- `skill_confidence_impact{skill_id}` - Histogram

---

### 10.2 Logging

**Structured Logging:**
```typescript
logger.info('Skill loaded', {
  agentId: 'backend-developer-1',
  skillId: 1,
  skillName: 'cfn-coordination',
  loadTimeMs: 12,
  cacheHit: true,
  hashValid: true
});
```

**Log Levels:**
- `ERROR`: Hash validation failures, database errors
- `WARN`: Hash mismatches (non-blocking), deprecated skills loaded
- `INFO`: Skill loads, cache operations
- `DEBUG`: Detailed query traces

---

### 10.3 Alerting

**Alerts:**
1. **High Latency:** Skill loading >50ms (P95) for 5 minutes
2. **Cache Degradation:** Cache hit rate <70% for 10 minutes
3. **Database Errors:** >10 errors/minute
4. **Hash Mismatches:** >5 mismatches/hour (possible tampering)

---

## 11. Future Architecture Enhancements

### 11.1 Remote Skill Repositories
- Fetch skills from GitHub/npm
- Skill versioning with semver ranges
- Private skill registries

### 11.2 AI-Driven Skill Recommendation
- Analyze task descriptions with LLM
- Suggest relevant skills dynamically
- Auto-assign skills based on success patterns

### 11.3 Multi-Database Support
- PostgreSQL for enterprise deployments
- Redis for distributed caching
- Elasticsearch for skill search

### 11.4 Web-Based Management UI
- Visual skill editor
- Agent-skill matrix view
- Real-time analytics dashboards

---

## 12. Architecture Decision Records

### ADR-001: Why SQLite over PostgreSQL?

**Decision:** Use SQLite for v1

**Rationale:**
- Simpler deployment (no server process)
- Sufficient performance for <100k queries/day
- Embedded database (no network latency)
- Single file for easy backup/restore

**Trade-offs:**
- No concurrent writes (acceptable - writes are rare)
- Limited to single server (no distributed deployment)
- Max DB size ~140TB (far exceeds our needs)

---

### ADR-002: Why Hybrid Storage (DB + Files)?

**Decision:** Store metadata in DB, content in git-versioned files

**Rationale:**
- Preserve git workflow for content review
- Enable SQL queries for skill selection
- Avoid BLOB storage complexity
- Support diff-based code review

**Trade-offs:**
- Two sources of truth (mitigated by hash validation)
- Slightly more complex than pure DB approach
- Requires YAML snapshot for deployment

---

### ADR-003: Why Non-Blocking Hash Validation?

**Decision:** Log warnings on hash mismatch, don't block skill loading

**Rationale:**
- Allows recovery from accidental corruption
- Prevents DoS via hash manipulation
- Developers fix issues during next commit

**Trade-offs:**
- Potential security risk if attacker modifies skills
- Mitigated by git-based audit trail and pre-commit hooks

---

This architecture document provides a comprehensive blueprint for implementing the dynamic skills database system with clear components, data flows, and integration points.
