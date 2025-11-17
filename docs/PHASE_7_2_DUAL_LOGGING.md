# Phase 7.2: Dual Logging System - Usage Guide

## Overview

The Skill Execution Logger provides dual logging for skill executions:
- **SQLite (Skills DB)**: Logs ALL skill executions
- **PostgreSQL (Phase 4 DB)**: Logs ONLY Phase4-generated skills

## Quick Start

### Basic Usage

```typescript
import { SkillExecutionLogger } from './src/cli/skill-execution-logger.js';

// Create logger instance
const logger = new SkillExecutionLogger({
  sqliteDbPath: './.claude/skills-database/skills.db',
  enablePostgres: false  // Disable PostgreSQL for now
});

// Log skill execution
await logger.logSkillExecution({
  agentId: 'backend-dev-1',
  agentType: 'backend-developer',
  skillName: 'jwt-authentication',
  taskId: 'task-123',
  phase: 'loop3',
  confidenceBefore: 0.75,
  confidenceAfter: 0.88,
  executionTimeMs: 12,
  exitCode: 0
});

// Clean up
await logger.close();
```

## Configuration

### Environment Variables

```bash
# SQLite Configuration
CFN_SKILLS_DB_PATH="./.claude/skills-database/skills.db"

# PostgreSQL Configuration (Phase 4)
PHASE4_POSTGRES_HOST="localhost"
PHASE4_POSTGRES_PORT="5432"
PHASE4_POSTGRES_DB="workflow_codification"
PHASE4_POSTGRES_USER="postgres"
PHASE4_POSTGRES_PASS=""
ENABLE_PHASE4_LOGGING="false"  # Enable PostgreSQL logging
```

### Programmatic Configuration

```typescript
const logger = new SkillExecutionLogger({
  sqliteDbPath: './.claude/skills-database/skills.db',
  postgresHost: 'localhost',
  postgresPort: 5432,
  postgresDb: 'workflow_codification',
  postgresUser: 'postgres',
  postgresPass: '',
  enablePostgres: true  // Enable dual logging
});
```

## Logging Behavior

### SQLite Logging (Always)

All skills are logged to SQLite with these fields:
- `agent_id`, `agent_type`, `skill_id`
- `task_id`, `phase`
- `execution_time_ms`, `exit_code`
- `confidence_before`, `confidence_after`
- `approval_level` (auto, escalate, human)
- `phase4_generated` (0 or 1)

### PostgreSQL Logging (Conditional)

Only Phase4-generated skills are logged to PostgreSQL when:
1. `enablePostgres: true`
2. Skill has `generated_by='phase4'` OR `phase4_pattern_id IS NOT NULL`

PostgreSQL logs these fields:
- `skill_id` (uses `phase4_pattern_id`)
- `team_id` (agent_type)
- `task_id`, `execution_time_ms`, `exit_code`
- `cost_avoided_usd`, `tokens_avoided`
- `timestamp`

## Integration with agent-prompt-builder.ts

```typescript
import { SkillExecutionLogger } from './skill-execution-logger.js';
import { AgentExecutionResult } from './types.js';

async function logAgentSkillExecution(
  result: AgentExecutionResult,
  skillName: string
) {
  const logger = new SkillExecutionLogger();

  try {
    await logger.logSkillExecution({
      agentId: result.agentId,
      agentType: result.agentType,
      skillName: skillName,
      taskId: result.taskId,
      phase: result.phase,
      confidenceBefore: result.confidenceBefore,
      confidenceAfter: result.confidenceAfter,
      executionTimeMs: result.executionTimeMs,
      exitCode: result.exitCode,
      costAvoidedUsd: result.metrics?.costAvoidedUsd,
      tokensAvoided: result.metrics?.tokensAvoided
    });
  } finally {
    await logger.close();
  }
}
```

## Error Handling

### Graceful PostgreSQL Fallback

The logger is designed to continue operating even if PostgreSQL is unavailable:

```typescript
const logger = new SkillExecutionLogger({
  enablePostgres: true,
  postgresHost: 'unavailable-host'  // PostgreSQL not available
});

// This will still succeed, logging to SQLite only
await logger.logSkillExecution({
  agentId: 'test-agent',
  agentType: 'tester',
  skillName: 'phase4-skill',
  executionTimeMs: 10,
  exitCode: 0
});
// ✅ Logs to SQLite, warns about PostgreSQL failure, does not throw
```

### Required Fields

The following fields are required:
- `agentId`
- `agentType`
- `skillName` (or `skillId`)
- `executionTimeMs`
- `exitCode`

Missing required fields will throw an error:

```typescript
await logger.logSkillExecution({
  agentId: 'test-agent',
  // Missing agentType - will throw error
});
// ❌ Error: Missing required field: agentType
```

### Skill Not Found

If the skill name doesn't exist in the database:

```typescript
await logger.logSkillExecution({
  agentId: 'test-agent',
  agentType: 'tester',
  skillName: 'nonexistent-skill',
  executionTimeMs: 10,
  exitCode: 0
});
// ❌ Error: Skill not found: nonexistent-skill
```

## Performance

### Benchmarks

- **Single log**: <50ms target (typically 5-15ms)
- **100 logs parallel**: ~7ms average per log
- **Caching**: Skill metadata cached after first lookup

### Optimization Tips

1. **Reuse logger instance** for multiple logs:
   ```typescript
   const logger = new SkillExecutionLogger();

   // Log multiple times
   await logger.logSkillExecution(metrics1);
   await logger.logSkillExecution(metrics2);
   await logger.logSkillExecution(metrics3);

   // Close when done
   await logger.close();
   ```

2. **Batch logging** using Promise.all():
   ```typescript
   const promises = skillExecutions.map(metrics =>
     logger.logSkillExecution(metrics)
   );
   await Promise.all(promises);
   ```

3. **Disable PostgreSQL** if not needed:
   ```typescript
   const logger = new SkillExecutionLogger({
     enablePostgres: false  // Skip PostgreSQL overhead
   });
   ```

## Analytics Queries

### SQLite Analytics

```sql
-- Skills by approval level
SELECT
  approval_level,
  COUNT(*) as execution_count,
  AVG(confidence_after - confidence_before) as avg_confidence_improvement
FROM skill_usage_log
WHERE confidence_before IS NOT NULL
GROUP BY approval_level;

-- Phase4 vs Manual skills
SELECT
  CASE WHEN phase4_generated = 1 THEN 'Phase4' ELSE 'Manual' END as skill_type,
  COUNT(*) as execution_count,
  AVG(execution_time_ms) as avg_execution_time
FROM skill_usage_log
GROUP BY phase4_generated;

-- Top skills by usage
SELECT
  s.name,
  s.approval_level,
  s.generated_by,
  COUNT(sul.id) as usage_count,
  AVG(sul.confidence_after - sul.confidence_before) as avg_improvement
FROM skills s
LEFT JOIN skill_usage_log sul ON s.id = sul.skill_id
GROUP BY s.id
ORDER BY usage_count DESC
LIMIT 10;
```

### PostgreSQL Analytics (Phase 4)

```sql
-- Cost savings from Phase4 skills
SELECT
  skill_id,
  COUNT(*) as execution_count,
  SUM(cost_avoided_usd) as total_cost_avoided,
  SUM(tokens_avoided) as total_tokens_avoided,
  AVG(execution_time_ms) as avg_execution_time
FROM skill_executions
WHERE cost_avoided_usd IS NOT NULL
GROUP BY skill_id
ORDER BY total_cost_avoided DESC;

-- Team usage metrics
SELECT
  team_id,
  COUNT(*) as execution_count,
  SUM(cost_avoided_usd) as total_savings
FROM skill_executions
GROUP BY team_id
ORDER BY total_savings DESC;
```

## Testing

### Unit Tests

```bash
# Run unit tests
npx jest tests/unit/skill-execution-logger.test.ts --config jest.config.ts.cjs
```

### Integration Tests

```bash
# Run integration test
node tests/integration/test-dual-logging.mjs
```

## Architecture

### Database Schema

**SQLite (Skills DB):**
```sql
CREATE TABLE skill_usage_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  agent_type TEXT NOT NULL,
  skill_id INTEGER NOT NULL,
  task_id TEXT,
  phase TEXT,
  loaded_at TEXT NOT NULL DEFAULT (datetime('now')),
  execution_time_ms INTEGER,
  confidence_before REAL,
  confidence_after REAL,
  success_indicator BOOLEAN,
  approval_level TEXT,
  phase4_generated INTEGER DEFAULT 0,
  exit_code INTEGER,
  FOREIGN KEY (skill_id) REFERENCES skills(id)
);
```

**PostgreSQL (Phase 4 DB):**
```sql
CREATE TABLE skill_executions (
  id SERIAL PRIMARY KEY,
  skill_id INTEGER NOT NULL,
  team_id VARCHAR(100) NOT NULL,
  task_id VARCHAR(100),
  execution_time_ms INTEGER,
  exit_code INTEGER,
  cost_avoided_usd DECIMAL(10,4),
  tokens_avoided INTEGER,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Phase4 Detection Logic

A skill is considered Phase4-generated if:
```typescript
skill.generated_by === 'phase4' || skill.phase4_pattern_id !== null
```

### Connection Pooling

PostgreSQL uses connection pooling for performance:
- Max pool size: 10 connections
- Idle timeout: 30 seconds
- Connection timeout: 5 seconds

## Troubleshooting

### PostgreSQL Connection Errors

If you see warnings about PostgreSQL connection failures:
```
[SkillExecutionLogger] PostgreSQL connection failed, will fallback to SQLite only
```

This is expected behavior when PostgreSQL is not available. The logger will:
1. Log the warning
2. Continue logging to SQLite
3. Skip PostgreSQL logging for this instance

### Performance Warnings

If you see warnings about slow logging:
```
[SkillExecutionLogger] Logging took 125ms (target: <50ms) for skill jwt-auth
```

Possible causes:
- High concurrent load
- Database I/O bottleneck
- Network latency (PostgreSQL)

Solutions:
- Reduce concurrent logging operations
- Disable PostgreSQL if not needed
- Use batching instead of individual logs

### Skill Not Found Errors

If skills are not found during logging:
1. Verify skill exists in Skills DB
2. Check skill name spelling
3. Ensure database is initialized

```bash
# Check if skill exists
sqlite3 ./.claude/skills-database/skills.db "SELECT * FROM skills WHERE name = 'your-skill-name';"
```

## Migration from Legacy Logging

If you're migrating from existing logging systems:

1. **Identify logging points**: Find all `skill_usage_log` inserts
2. **Replace with logger**: Use `SkillExecutionLogger` instead of direct SQL
3. **Add Phase4 metadata**: Include `costAvoidedUsd` and `tokensAvoided` for Phase4 skills
4. **Test thoroughly**: Run integration tests to verify behavior

Example migration:

**Before:**
```typescript
db.run(`
  INSERT INTO skill_usage_log (agent_id, agent_type, skill_id, ...)
  VALUES (?, ?, ?, ...)
`, [agentId, agentType, skillId, ...]);
```

**After:**
```typescript
const logger = new SkillExecutionLogger();
await logger.logSkillExecution({
  agentId,
  agentType,
  skillName: skillName,
  ...
});
await logger.close();
```

## Future Enhancements

Potential improvements for Phase 7.3+:
- Batch insertion API for bulk logging
- Real-time metrics dashboard
- Automatic retry for transient PostgreSQL failures
- Skill recommendation engine based on usage patterns
- Cost optimization alerts

## Support

For issues or questions:
- Check test files: `tests/unit/skill-execution-logger.test.ts`
- Review implementation: `src/cli/skill-execution-logger.ts`
- Run integration test: `node tests/integration/test-dual-logging.mjs`
