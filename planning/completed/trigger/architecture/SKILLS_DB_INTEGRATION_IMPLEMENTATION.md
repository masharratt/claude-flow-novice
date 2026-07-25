# Skills DB Integration Implementation

## 1. Overview

### What Skills DB Contains
- **Agent Profiles**: Capabilities, default configurations, tool access
- **Skills**: Modular capabilities with dependencies and versioning
- **Playbooks**: Reusable task patterns with success metrics
- **Codified Patterns**: Validated solutions extracted from successful executions

### Role in CFN Loop
- **Capability Lookup**: Match agents to tasks based on skill requirements
- **Pattern Injection**: Inject proven solutions into job payloads
- **Learning Storage**: Record outcomes and extract new patterns

### Current vs Future State
```
Current: .claude/skills/*.md files (43 skills)
         .claude/agents/*.md files (23 agents)

Future:  Centralized PostgreSQL + pgvector
         Real-time capability matching
         Continuous learning from executions
```

---

## 2. Database Schema

### ERD Diagram
```
+------------------+       +----------------------+
|     skills       |       |  skill_dependencies  |
+------------------+       +----------------------+
| id (PK)          |<------| skill_id (FK)        |
| name             |       | depends_on_id (FK)   |
| description      |       +----------------------+
| category         |
| version          |       +------------------+
| status           |       |  agent_profiles  |
| embedding (vec)  |       +------------------+
| metadata (jsonb) |       | id (PK)          |
+------------------+       | name             |
        ^                  | type             |
        |                  | skills (array)   |
        |                  | default_config   |
+------------------+       | tool_access      |
|  agent_skills    |       +------------------+
+------------------+              |
| agent_id (FK)    |--------------+
| skill_id (FK)    |
| proficiency      |
+------------------+

+------------------+       +----------------------+
|    playbooks     |       |  codified_patterns   |
+------------------+       +----------------------+
| id (PK)          |       | id (PK)              |
| name             |       | version              |
| trigger_patterns |       | pattern_json (jsonb) |
| steps (jsonb)    |       | test_cases (jsonb)   |
| success_rate     |       | success_count        |
| usage_count      |       | created_at           |
| category         |       | validated_at         |
+------------------+       +----------------------+

+----------------------+
|  execution_history   |
+----------------------+
| id (PK)              |
| task_id              |
| agent_id (FK)        |
| skill_used (FK)      |
| playbook_used (FK)   |
| outcome              |
| duration_ms          |
| metadata (jsonb)     |
| created_at           |
+----------------------+
```

### DDL Scripts
```sql
-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector";

-- Skills table
CREATE TABLE skills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    category VARCHAR(50) NOT NULL,
    version VARCHAR(20) DEFAULT '1.0.0',
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'deprecated', 'draft')),
    embedding vector(1536),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Skill dependencies
CREATE TABLE skill_dependencies (
    skill_id UUID REFERENCES skills(id) ON DELETE CASCADE,
    depends_on_id UUID REFERENCES skills(id) ON DELETE CASCADE,
    PRIMARY KEY (skill_id, depends_on_id)
);

-- Agent profiles
CREATE TABLE agent_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL UNIQUE,
    skills UUID[] DEFAULT '{}',
    default_config JSONB DEFAULT '{}',
    tool_access TEXT[] DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Agent-skill proficiency mapping
CREATE TABLE agent_skills (
    agent_id UUID REFERENCES agent_profiles(id) ON DELETE CASCADE,
    skill_id UUID REFERENCES skills(id) ON DELETE CASCADE,
    proficiency DECIMAL(3,2) DEFAULT 1.0 CHECK (proficiency BETWEEN 0 AND 1),
    PRIMARY KEY (agent_id, skill_id)
);

-- Playbooks
CREATE TABLE playbooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    trigger_patterns TEXT[] NOT NULL,
    steps JSONB NOT NULL,
    success_rate DECIMAL(5,4) DEFAULT 0,
    usage_count INTEGER DEFAULT 0,
    category VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Codified patterns
CREATE TABLE codified_patterns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    version INTEGER DEFAULT 1,
    pattern_json JSONB NOT NULL,
    test_cases JSONB DEFAULT '[]',
    success_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    validated_at TIMESTAMP
);

-- Execution history
CREATE TABLE execution_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id VARCHAR(100) NOT NULL,
    agent_id UUID REFERENCES agent_profiles(id),
    skill_used UUID REFERENCES skills(id),
    playbook_used UUID REFERENCES playbooks(id),
    outcome VARCHAR(20) CHECK (outcome IN ('success', 'failure', 'partial', 'timeout')),
    duration_ms INTEGER,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_skills_category ON skills(category);
CREATE INDEX idx_skills_embedding ON skills USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_playbooks_patterns ON playbooks USING GIN (trigger_patterns);
CREATE INDEX idx_execution_task ON execution_history(task_id);
CREATE INDEX idx_execution_created ON execution_history(created_at DESC);
```

---

## 3. API Layer

### TypeScript Client Interface
```typescript
// src/skills-db/types.ts
export interface Skill {
  id: string;
  name: string;
  description: string;
  category: string;
  version: string;
  status: 'active' | 'deprecated' | 'draft';
  metadata: Record<string, unknown>;
}

export interface AgentProfile {
  id: string;
  name: string;
  type: string;
  skills: string[];
  defaultConfig: Record<string, unknown>;
  toolAccess: string[];
}

export interface Playbook {
  id: string;
  name: string;
  triggerPatterns: string[];
  steps: PlaybookStep[];
  successRate: number;
  usageCount: number;
}

export interface CodifiedPattern {
  id: string;
  version: number;
  patternJson: Record<string, unknown>;
  testCases: TestCase[];
  successCount: number;
}

export type Outcome = 'success' | 'failure' | 'partial' | 'timeout';

// src/skills-db/client.ts
export interface SkillsDBClient {
  // Skills
  getSkill(id: string): Promise<Skill>;
  listSkills(filters: SkillFilters): Promise<Skill[]>;
  searchSkills(query: string, limit?: number): Promise<Skill[]>;

  // Agent Profiles
  getAgentProfile(type: string): Promise<AgentProfile>;
  getAgentSkills(agentId: string): Promise<Skill[]>;
  findAgentsWithSkills(requiredSkills: string[]): Promise<AgentProfile[]>;

  // Playbooks
  findPlaybooks(taskDescription: string): Promise<Playbook[]>;
  getPlaybook(id: string): Promise<Playbook>;
  recordPlaybookUsage(playbookId: string, outcome: Outcome): Promise<void>;

  // Patterns
  getPatternForTask(taskType: string): Promise<CodifiedPattern | null>;
  submitPatternCandidate(pattern: PatternCandidate): Promise<void>;

  // Analytics
  getSkillUsageStats(timeRange: TimeRange): Promise<UsageStats>;
  getAgentPerformance(agentId: string): Promise<PerformanceStats>;
}
```

### Implementation
```typescript
// src/skills-db/postgres-client.ts
import { Pool } from 'pg';

export class PostgresSkillsDBClient implements SkillsDBClient {
  private pool: Pool;
  private cache: RedisCache;

  constructor(connectionString: string, redis: RedisCache) {
    this.pool = new Pool({ connectionString, max: 20 });
    this.cache = redis;
  }

  async getSkill(id: string): Promise<Skill> {
    const cached = await this.cache.get(`skill:${id}`);
    if (cached) return JSON.parse(cached);

    const result = await this.pool.query(
      'SELECT * FROM skills WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      throw new Error(`Skill not found: ${id}`);
    }

    const skill = this.mapSkill(result.rows[0]);
    await this.cache.set(`skill:${id}`, JSON.stringify(skill), 'EX', 3600);
    return skill;
  }

  async findPlaybooks(taskDescription: string): Promise<Playbook[]> {
    // Semantic search using embeddings
    const embedding = await this.getEmbedding(taskDescription);

    const result = await this.pool.query(`
      SELECT p.*,
             1 - (s.embedding <=> $1::vector) as similarity
      FROM playbooks p
      LEFT JOIN skills s ON s.id = ANY(p.required_skills)
      WHERE p.success_rate > 0.7
      ORDER BY similarity DESC, p.success_rate DESC
      LIMIT 5
    `, [embedding]);

    return result.rows.map(this.mapPlaybook);
  }

  async recordPlaybookUsage(
    playbookId: string,
    outcome: Outcome
  ): Promise<void> {
    await this.pool.query(`
      UPDATE playbooks
      SET usage_count = usage_count + 1,
          success_rate = (
            success_rate * usage_count + $2
          ) / (usage_count + 1)
      WHERE id = $1
    `, [playbookId, outcome === 'success' ? 1 : 0]);

    await this.cache.del(`playbook:${playbookId}`);
  }

  async findAgentsWithSkills(requiredSkills: string[]): Promise<AgentProfile[]> {
    const result = await this.pool.query(`
      SELECT ap.* FROM agent_profiles ap
      JOIN agent_skills ask ON ap.id = ask.agent_id
      WHERE ask.skill_id = ANY($1::uuid[])
      GROUP BY ap.id
      HAVING COUNT(DISTINCT ask.skill_id) >= $2
      ORDER BY AVG(ask.proficiency) DESC
    `, [requiredSkills, requiredSkills.length]);

    return result.rows.map(this.mapAgentProfile);
  }
}
```

---

## 4. trigger.dev Integration Points

### Job Start: Query Skills DB
```typescript
// src/trigger/jobs/cfn-loop.ts
import { task } from "@trigger.dev/sdk/v3";
import { skillsDB } from "../skills-db";

export const cfnLoopTask = task({
  id: "cfn-loop",
  run: async (payload: CFNLoopPayload, { ctx }) => {
    // 1. Query relevant playbooks
    const playbooks = await skillsDB.findPlaybooks(payload.taskDescription);

    // 2. Query patterns
    const pattern = await skillsDB.getPatternForTask(payload.taskType);

    // 3. Inject into context
    const enrichedPayload = {
      ...payload,
      playbooks: playbooks.slice(0, 3),
      suggestedPattern: pattern,
    };

    // Continue with execution...
  }
});
```

### Agent Selection
```typescript
// src/trigger/agent-selector.ts
export async function selectAgentForTask(
  taskRequirements: string[]
): Promise<AgentProfile> {
  const agents = await skillsDB.findAgentsWithSkills(taskRequirements);

  if (agents.length === 0) {
    throw new Error(`No agent found with skills: ${taskRequirements.join(', ')}`);
  }

  // Return highest proficiency agent
  return agents[0];
}
```

### Job Complete: Record Outcome
```typescript
// src/trigger/hooks/on-complete.ts
export async function recordExecution(
  taskId: string,
  agentId: string,
  skillUsed: string,
  playbookUsed: string | null,
  outcome: Outcome,
  durationMs: number
): Promise<void> {
  await skillsDB.recordExecution({
    taskId,
    agentId,
    skillUsed,
    playbookUsed,
    outcome,
    durationMs,
    metadata: { timestamp: new Date().toISOString() }
  });

  if (playbookUsed) {
    await skillsDB.recordPlaybookUsage(playbookUsed, outcome);
  }
}
```

### Learning: Pattern Extraction
```typescript
// src/trigger/learning/pattern-extractor.ts
export async function extractPattern(
  execution: ExecutionRecord
): Promise<void> {
  if (execution.outcome !== 'success') return;
  if (execution.durationMs > 300000) return; // Skip slow executions

  const pattern = analyzeExecution(execution);

  if (pattern.confidence > 0.8) {
    await skillsDB.submitPatternCandidate({
      sourceExecution: execution.id,
      pattern: pattern.data,
      confidence: pattern.confidence
    });
  }
}
```

---

## 5. Data Flow

```
                    +------------------+
                    |  Task Request    |
                    +--------+---------+
                             |
                             v
                    +------------------+
                    | trigger.dev Job  |
                    +--------+---------+
                             |
              +--------------+--------------+
              |                             |
              v                             v
    +------------------+          +------------------+
    | Skills DB Query  |          |   Redis Cache    |
    | - playbooks      |<-------->|   (hit/miss)     |
    | - patterns       |          +------------------+
    | - agent caps     |
    +--------+---------+
             |
             v
    +------------------+
    | Inject to Payload|
    +--------+---------+
             |
             v
    +------------------+
    | Agent Execution  |
    +--------+---------+
             |
             v
    +------------------+
    | Record Outcome   |
    +--------+---------+
             |
             v
    +------------------+
    | Pattern Extract  |
    | (if successful)  |
    +------------------+
```

---

## 6. Caching Strategy

### Configuration
```typescript
// src/skills-db/cache-config.ts
export const CACHE_TTL = {
  skill: 3600,           // 1 hour
  agentProfile: 1800,    // 30 minutes
  playbook: 900,         // 15 minutes
  pattern: 7200,         // 2 hours
  searchResults: 300,    // 5 minutes
};

export const CACHE_KEYS = {
  skill: (id: string) => `skills:skill:${id}`,
  agentProfile: (type: string) => `skills:agent:${type}`,
  playbook: (id: string) => `skills:playbook:${id}`,
  playbookSearch: (hash: string) => `skills:playbook:search:${hash}`,
};
```

### Cache Invalidation
```typescript
// src/skills-db/cache-invalidation.ts
export async function invalidateOnUpdate(
  entityType: string,
  entityId: string
): Promise<void> {
  const patterns = [
    `skills:${entityType}:${entityId}`,
    `skills:${entityType}:search:*`,
  ];

  for (const pattern of patterns) {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }
}
```

### Fallback Behavior
```typescript
async function getWithFallback<T>(
  cacheKey: string,
  dbQuery: () => Promise<T>,
  ttl: number
): Promise<T> {
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch (e) {
    logger.warn('Cache read failed', { error: e });
  }

  const result = await dbQuery();

  try {
    await redis.set(cacheKey, JSON.stringify(result), 'EX', ttl);
  } catch (e) {
    logger.warn('Cache write failed', { error: e });
  }

  return result;
}
```

---

## 7. Migration from File-Based Skills

### Migration Script
```bash
#!/bin/bash
# scripts/migrate-skills-to-db.sh

set -euo pipefail

SKILLS_DIR=".claude/skills"
AGENTS_DIR=".claude/agents/cfn-dev-team"

# Parse skill files and insert to DB
for skill_file in "$SKILLS_DIR"/*/SKILL.md; do
  skill_name=$(basename "$(dirname "$skill_file")")

  # Extract YAML frontmatter
  description=$(sed -n '/^---$/,/^---$/p' "$skill_file" | grep 'description:' | cut -d: -f2-)
  category=$(sed -n '/^---$/,/^---$/p' "$skill_file" | grep 'category:' | cut -d: -f2-)

  # Insert to DB
  psql "$DATABASE_URL" <<SQL
    INSERT INTO skills (name, description, category, status)
    VALUES ('$skill_name', '$description', '$category', 'active')
    ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;
SQL
done

echo "Migrated $(ls -d "$SKILLS_DIR"/*/ | wc -l) skills"
```

### Backward Compatibility
```typescript
// src/skills-db/fallback.ts
export async function getSkillWithFallback(
  skillName: string
): Promise<Skill> {
  try {
    return await skillsDB.getSkillByName(skillName);
  } catch (e) {
    logger.warn(`DB lookup failed for ${skillName}, using file fallback`);
    return loadSkillFromFile(skillName);
  }
}

function loadSkillFromFile(skillName: string): Skill {
  const skillPath = `.claude/skills/${skillName}/SKILL.md`;
  const content = fs.readFileSync(skillPath, 'utf-8');
  return parseSkillMarkdown(content);
}
```

### Validation Script
```bash
#!/bin/bash
# scripts/validate-migration.sh

DB_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM skills")
FILE_COUNT=$(ls -d .claude/skills/*/ | wc -l)

if [ "$DB_COUNT" -eq "$FILE_COUNT" ]; then
  echo "Migration validated: $DB_COUNT skills"
  exit 0
else
  echo "Mismatch: DB=$DB_COUNT, Files=$FILE_COUNT"
  exit 1
fi
```

---

## 8. Search & Discovery

### Full-Text Search
```sql
-- Create text search index
CREATE INDEX idx_skills_search ON skills
USING GIN (to_tsvector('english', name || ' ' || description));

-- Search query
SELECT * FROM skills
WHERE to_tsvector('english', name || ' ' || description)
  @@ plainto_tsquery('english', $1)
ORDER BY ts_rank(to_tsvector('english', name || ' ' || description),
                 plainto_tsquery('english', $1)) DESC
LIMIT 10;
```

### Semantic Search (pgvector)
```typescript
async searchSkillsSemantic(
  query: string,
  limit: number = 10
): Promise<Skill[]> {
  const embedding = await this.getEmbedding(query);

  const result = await this.pool.query(`
    SELECT *, 1 - (embedding <=> $1::vector) as similarity
    FROM skills
    WHERE status = 'active'
    ORDER BY embedding <=> $1::vector
    LIMIT $2
  `, [embedding, limit]);

  return result.rows.map(this.mapSkill);
}
```

### Tag-Based Filtering
```sql
-- Skills with tags
SELECT * FROM skills
WHERE metadata->'tags' ?| ARRAY['backend', 'api', 'rest']
ORDER BY created_at DESC;
```

---

## 9. Versioning & Audit

### Change Tracking
```sql
-- Audit log table
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name VARCHAR(50) NOT NULL,
    record_id UUID NOT NULL,
    action VARCHAR(20) NOT NULL,
    old_values JSONB,
    new_values JSONB,
    changed_by VARCHAR(100),
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Trigger for skills table
CREATE OR REPLACE FUNCTION audit_skills_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_log (table_name, record_id, action, old_values, new_values)
        VALUES ('skills', OLD.id, 'UPDATE', row_to_json(OLD), row_to_json(NEW));
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO audit_log (table_name, record_id, action, old_values)
        VALUES ('skills', OLD.id, 'DELETE', row_to_json(OLD));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER skills_audit
AFTER UPDATE OR DELETE ON skills
FOR EACH ROW EXECUTE FUNCTION audit_skills_changes();
```

### Rollback Capability
```typescript
async rollbackSkill(skillId: string, toVersion: number): Promise<void> {
  const auditRecord = await this.pool.query(`
    SELECT old_values FROM audit_log
    WHERE table_name = 'skills' AND record_id = $1
    ORDER BY changed_at DESC
    OFFSET $2 LIMIT 1
  `, [skillId, toVersion - 1]);

  if (auditRecord.rows.length === 0) {
    throw new Error(`Version ${toVersion} not found for skill ${skillId}`);
  }

  const oldValues = auditRecord.rows[0].old_values;
  await this.pool.query(`
    UPDATE skills SET
      name = $2, description = $3, category = $4, metadata = $5
    WHERE id = $1
  `, [skillId, oldValues.name, oldValues.description,
      oldValues.category, oldValues.metadata]);
}
```

---

## 10. Performance Considerations

### Connection Pooling
```typescript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,                    // Max connections
  idleTimeoutMillis: 30000,   // Close idle after 30s
  connectionTimeoutMillis: 2000,
});
```

### Query Optimization
```sql
-- Analyze query plans
EXPLAIN ANALYZE SELECT * FROM playbooks
WHERE trigger_patterns @> ARRAY['create.*endpoint'];

-- Partial index for active skills
CREATE INDEX idx_active_skills ON skills(category)
WHERE status = 'active';

-- Covering index for common queries
CREATE INDEX idx_skills_lookup ON skills(id, name, category, status);
```

### Read Replicas
```typescript
// src/skills-db/connection.ts
const writePool = new Pool({ connectionString: PRIMARY_URL });
const readPool = new Pool({ connectionString: REPLICA_URL });

export async function query(sql: string, params: any[], readOnly = true) {
  const pool = readOnly ? readPool : writePool;
  return pool.query(sql, params);
}
```

### Batch Operations
```typescript
async batchInsertExecutions(
  executions: ExecutionRecord[]
): Promise<void> {
  const values = executions.map((e, i) =>
    `($${i*5+1}, $${i*5+2}, $${i*5+3}, $${i*5+4}, $${i*5+5})`
  ).join(',');

  const params = executions.flatMap(e => [
    e.taskId, e.agentId, e.skillUsed, e.outcome, e.durationMs
  ]);

  await this.pool.query(`
    INSERT INTO execution_history
    (task_id, agent_id, skill_used, outcome, duration_ms)
    VALUES ${values}
  `, params);
}
```

---

## 11. Example Queries

### Find Playbooks for Task
```sql
-- Find playbooks matching task pattern with success rate
SELECT
  p.id,
  p.name,
  p.success_rate,
  p.usage_count,
  p.steps
FROM playbooks p
WHERE p.trigger_patterns @> ARRAY['create.*endpoint']
  AND p.success_rate > 0.7
ORDER BY p.success_rate DESC, p.usage_count DESC
LIMIT 5;
```

### Get Agent with Required Skills
```sql
-- Find agents with at least 3 backend skills
SELECT
  ap.id,
  ap.name,
  ap.type,
  COUNT(ask.skill_id) as skill_count,
  AVG(ask.proficiency) as avg_proficiency
FROM agent_profiles ap
JOIN agent_skills ask ON ap.id = ask.agent_id
JOIN skills s ON ask.skill_id = s.id
WHERE s.category = 'backend'
  AND s.status = 'active'
GROUP BY ap.id
HAVING COUNT(ask.skill_id) >= 3
ORDER BY avg_proficiency DESC;
```

### Skill Usage Analytics
```sql
-- Top skills by usage in last 30 days
SELECT
  s.name,
  s.category,
  COUNT(eh.id) as usage_count,
  AVG(CASE WHEN eh.outcome = 'success' THEN 1 ELSE 0 END) as success_rate,
  AVG(eh.duration_ms) as avg_duration
FROM skills s
JOIN execution_history eh ON s.id = eh.skill_used
WHERE eh.created_at > NOW() - INTERVAL '30 days'
GROUP BY s.id
ORDER BY usage_count DESC
LIMIT 20;
```

### Pattern Discovery
```sql
-- Find patterns ready for validation (3+ successes)
SELECT
  cp.id,
  cp.pattern_json,
  cp.success_count,
  cp.created_at
FROM codified_patterns cp
WHERE cp.validated_at IS NULL
  AND cp.success_count >= 3
ORDER BY cp.success_count DESC;
```

### Agent Performance
```sql
-- Agent performance over time
SELECT
  ap.name,
  DATE_TRUNC('week', eh.created_at) as week,
  COUNT(*) as tasks,
  AVG(CASE WHEN eh.outcome = 'success' THEN 1 ELSE 0 END) as success_rate
FROM agent_profiles ap
JOIN execution_history eh ON ap.id = eh.agent_id
WHERE eh.created_at > NOW() - INTERVAL '90 days'
GROUP BY ap.id, week
ORDER BY ap.name, week;
```

---

## Related Documentation
- [Trigger.dev Migration Plan](/docs/planning/TRIGGER_DEV_MIGRATION_PLAN.md)
- [CFN Loop Architecture](/docs/CFN_LOOP_ARCHITECTURE.md)
- [Agent Profiles](/docs/AGENT_PROFILES.md)
