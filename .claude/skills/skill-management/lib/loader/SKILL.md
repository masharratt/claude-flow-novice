# CFN Skill Loader

**Version:** 1.0.0
**Status:** Active
**Namespace:** cfn
**Priority:** 10 (Bootstrap)

## Purpose

Provides high-performance contextual skill loading for agent prompt building with LRU caching and SHA256 hash-based validation. Ensures agents receive only relevant skills based on their type, task context, and CFN Loop phase.

## When to Use This Skill

**Mandatory for:**
- Agent prompt building (all agents)
- Agent spawn operations
- Skill content integrity validation
- Performance-critical skill loading (<100ms warm load)

**Use when:**
- Building agent prompts with contextual skills
- Validating skill content hasn't been modified
- Implementing cache invalidation strategies
- Optimizing agent spawn performance

## Core Capabilities

### 1. Contextual Skill Loading

**Load skills based on agent type and task context:**
```typescript
import { SkillLoader } from '../src/cli/skill-loader';

const loader = new SkillLoader(dbService, logger);

const result = await loader.loadContextualSkills({
  agentType: 'backend-developer',
  taskContext: ['authentication', 'security', 'api'],
  maxSkills: 20,
  includeBootstrap: true,
  phase: 'loop3'
});

console.log(`Loaded ${result.totalSkills} skills in ${result.loadTimeMs}ms`);
console.log(`Cache hits: ${result.cacheHitCount}, misses: ${result.cacheMissCount}`);
```

### 2. Hash-Based Validation

**Validate skill content integrity:**
```typescript
import { SkillCacheValidator } from '../src/cli/skill-cache-validator';

const validator = new SkillCacheValidator();

// Compute hash
const contentHash = validator.computeHash(skillContent);

// Validate content
const validation = validator.validateContent(skillContent, expectedHash);

if (!validation.isValid) {
  console.error(`Validation failed: ${validation.reason}`);
}
```

### 3. LRU Cache Management

**Manage skill caching for optimal performance:**
```typescript
// Get cache statistics
const stats = loader.getCacheStats();
console.log(`Cache: ${stats.size}/${stats.maxSize}, TTL: ${stats.ttlMinutes}min`);

// Preload skills for warm-up
await loader.preloadSkills(['cfn-coordination', 'hook-pipeline']);

// Clear cache on demand
loader.clearCache();
```

### 4. Database Query Layer

**Type-safe SQL queries for skill metadata:**
```typescript
import { SkillsQueryBuilder } from '../src/db/skills-query';

// Get skills by agent type with context
const { sql, params } = SkillsQueryBuilder.getSkillsByAgentType(
  'backend-developer',
  ['authentication', 'security'],
  'loop3'
);

const skills = await sqlite.raw(sql, params);
```

## Performance Targets

**SLA Guarantees:**
- Cold load: <1s (first load, empty cache)
- Warm load: <100ms (cached skills)
- Cache TTL: 5 minutes (configurable)
- Cache size: 100 skills (LRU eviction)

**Validation:**
```bash
# Run performance benchmarks
npm test -- tests/skill-loader.test.ts --testNamePattern="performance"
```

## Integration Points

### Agent Prompt Builder

**Used by `src/cli/agent-prompt-builder.ts`:**
```typescript
import { getGlobalLoader } from './skill-loader';

const loader = getGlobalLoader(dbService, logger);

const { skills } = await loader.loadContextualSkills({
  agentType: agentProfile.type,
  taskContext: extractTaskKeywords(taskDescription),
  maxSkills: 20,
  includeBootstrap: true,
});

// Inject skills into agent prompt
const skillsSection = skills.map(s => s.content).join('\n\n---\n\n');
```

### Database Service

**Requires SQLite adapter configuration:**
```typescript
import { DatabaseService } from '../lib/database-service';

const dbService = new DatabaseService({
  sqlite: {
    type: 'sqlite',
    database: './claude-assets/skills/cfn-redis-coordination/data/cfn-loop.db',
  },
});

await dbService.connect();

const loader = new SkillLoader(dbService, logger);
```

## Database Schema

### Skills Table

```sql
CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  file_path TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  namespace TEXT NOT NULL DEFAULT 'cfn',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'deprecated', 'experimental')),
  priority INTEGER NOT NULL DEFAULT 5 CHECK(priority BETWEEN 1 AND 10),
  tags TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Agent-Skill Mappings

```sql
CREATE TABLE IF NOT EXISTS agent_skill_mappings (
  agent_type TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT 0,
  priority INTEGER NOT NULL DEFAULT 5 CHECK(priority BETWEEN 1 AND 10),
  phase TEXT,
  context_keywords TEXT,
  PRIMARY KEY (agent_type, skill_id),
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);
```

### Usage Analytics

```sql
CREATE TABLE IF NOT EXISTS skill_usage_log (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  agent_type TEXT NOT NULL,
  loaded_at TEXT NOT NULL,
  execution_time_ms INTEGER NOT NULL,
  confidence_impact REAL,
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);
```

## Bootstrap Skills

**Always loaded (no database dependency):**
- `cfn-coordination` - Agent coordination protocols
- `hook-pipeline` - Pre/post-edit validation hooks
- `pre-edit-backup` - File backup system
- `cfn-agent-spawning` - Agent spawn utilities
- `cfn-loop-validation` - CFN Loop gate validation

**Location:** `.claude/skills/{skill-id}/SKILL.md`

## Usage Patterns

### Pattern 1: Agent Spawn with Contextual Skills

```bash
#!/bin/bash
# Agent spawn script with skill loading

AGENT_TYPE="backend-developer"
TASK_CONTEXT="authentication,jwt,api"
PHASE="loop3"

# Load skills via TypeScript API
npx tsx -e "
import { getGlobalLoader } from './src/cli/skill-loader';
import { DatabaseService } from './src/lib/database-service';

const dbService = new DatabaseService({
  sqlite: { type: 'sqlite', database: './cfn-loop.db' }
});

await dbService.connect();

const loader = getGlobalLoader(dbService);
const result = await loader.loadContextualSkills({
  agentType: '${AGENT_TYPE}',
  taskContext: '${TASK_CONTEXT}'.split(','),
  phase: '${PHASE}',
  maxSkills: 20,
  includeBootstrap: true
});

console.log(JSON.stringify(result.skills.map(s => s.id)));
"
```

### Pattern 2: Cache Warming for Fast Spawns

```typescript
// Preload common skills at application startup
const commonSkills = [
  'cfn-coordination',
  'hook-pipeline',
  'pre-edit-backup',
  'cfn-agent-spawning',
];

await loader.preloadSkills(commonSkills);

// Subsequent spawns will be faster (<100ms)
```

### Pattern 3: Hash Validation for Security

```typescript
// Validate skill content hasn't been tampered with
const validator = new SkillCacheValidator();

for (const skill of loadedSkills) {
  const validation = validator.validateContent(
    skill.content,
    skill.contentHash
  );

  if (!validation.isValid) {
    throw new Error(`Security violation: ${validation.reason}`);
  }
}
```

## Error Handling

### Missing Database Service

```typescript
// Graceful degradation - load bootstrap skills only
const loader = new SkillLoader(undefined, logger);

const result = await loader.loadContextualSkills({
  agentType: 'backend-developer',
  includeBootstrap: true,
});

// result.skills will contain only bootstrap skills
// result.bootstrapCount = 5
// result.totalSkills = 5
```

### Cache Corruption

```typescript
// Automatic detection and recovery
const invalidSkills = validator.verifyBatchIntegrity(cachedEntries);

if (invalidSkills.length > 0) {
  logger.warn(`Corrupted cache entries detected: ${invalidSkills.join(', ')}`);
  loader.clearCache(); // Force reload from database
}
```

### File Not Found

```typescript
// Logs error but continues loading other skills
try {
  const result = await loader.loadContextualSkills(options);
} catch (error) {
  logger.error('Skill loading failed', error);
  // Falls back to bootstrap skills if available
}
```

## Monitoring & Analytics

### Performance Monitoring

```typescript
const result = await loader.loadContextualSkills(options);

if (result.loadTimeMs > 1000) {
  logger.warn('Skill loading exceeded 1s SLA', {
    loadTimeMs: result.loadTimeMs,
    target: 1000,
    skillCount: result.totalSkills,
  });
}
```

### Cache Hit Rate

```typescript
const hitRate = result.cacheHitCount / (result.cacheHitCount + result.cacheMissCount);

logger.info('Cache performance', {
  hitRate: `${(hitRate * 100).toFixed(2)}%`,
  hits: result.cacheHitCount,
  misses: result.cacheMissCount,
});
```

### Skill Effectiveness

```sql
-- Query skill usage analytics
SELECT
  s.id,
  s.name,
  COUNT(sul.id) as usage_count,
  AVG(sul.confidence_impact) as avg_confidence_impact
FROM skills s
LEFT JOIN skill_usage_log sul ON s.id = sul.skill_id
GROUP BY s.id
ORDER BY avg_confidence_impact DESC;
```

## Testing

### Run Test Suite

```bash
# Full test suite (≥95% coverage target)
npm test -- tests/skill-loader.test.ts

# Watch mode for development
npm test -- tests/skill-loader.test.ts --watch

# Coverage report
npm test -- tests/skill-loader.test.ts --coverage
```

### Manual Testing

```bash
# Test skill loading
npx tsx ./.claude/skills/cfn-skill-loader/execute.sh \
  --agent-type backend-developer \
  --task-context "authentication,api" \
  --max-skills 20

# Test cache performance
npx tsx ./.claude/skills/cfn-skill-loader/execute.sh \
  --benchmark \
  --iterations 10
```

## Migration Guide

### From Static File Loading

**Before (static):**
```typescript
const skillPath = `.claude/skills/${skillId}/SKILL.md`;
const content = fs.readFileSync(skillPath, 'utf-8');
```

**After (cached, validated):**
```typescript
const loader = getGlobalLoader(dbService, logger);
const result = await loader.loadContextualSkills({
  agentType: 'backend-developer',
  includeBootstrap: true,
});

const skill = result.skills.find(s => s.id === skillId);
```

## Troubleshooting

### High Cache Miss Rate

**Symptom:** `cacheMissCount` consistently high
**Solution:**
1. Increase cache size: `loader.cacheMaxSize = 200`
2. Increase TTL: `loader.cacheTTLMinutes = 10`
3. Preload common skills at startup

### Slow Cold Load (>1s)

**Symptom:** First load exceeds 1s SLA
**Solution:**
1. Optimize database queries (add indexes)
2. Reduce `maxSkills` parameter
3. Use phase-specific filtering

### Hash Validation Failures

**Symptom:** Frequent `content hash mismatch` warnings
**Solution:**
1. Verify file system integrity
2. Check for concurrent file modifications
3. Update database hashes: `SkillsQueryBuilder.updateContentHash()`

## Related Skills

- `cfn-coordination` - Agent coordination protocols
- `hook-pipeline` - Pre/post-edit validation
- `cfn-agent-spawning` - Agent lifecycle management
- `cfn-loop-validation` - CFN Loop gate checks

## Changelog

### v1.0.0 (2025-11-15)
- Initial implementation
- LRU caching with 5min TTL
- SHA256 hash validation
- Bootstrap skills support
- Database query layer
- Performance: <1s cold, <100ms warm
- Test coverage: ≥95%

---

**Documentation:** `docs/SKILLLOADER_API.md`
**Tests:** `tests/skill-loader.test.ts`
**Source:** `src/cli/skill-loader.ts`
