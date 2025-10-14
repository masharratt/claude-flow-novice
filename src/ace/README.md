# ACE (Adaptive Context Extension) System

Implementation of Stanford's Generator/Reflector/Curator architecture for claude-flow-novice with SQLite persistence.

## Architecture

```
Generator (Main Claude + Agents)
    ↓ execution traces
Reflector (ace-reflect)
    ↓ extracted lessons
Curator (ace-curate)
    ↓ deduplicated bullets
Adaptive Context (SQLite)
```

## CLI Commands

### ace-reflect
Extract lessons from task execution:
```bash
ace-reflect --task-id=TASK_ID [--type=success|failure|optimization|edge_case] [--auto-curate]
```

### ace-curate
Merge reflections with deduplication:
```bash
ace-curate --reflection-id=ID [--similarity=0.85]
```

### ace-query
Query bullets from adaptive context:
```bash
ace-query [--category=CATEGORY] [--tags=tag1,tag2] [--min-confidence=0.7] [--limit=15]
```

### ace-inject
Inject context for agent spawning:
```bash
ace-inject --agent-type=coder [--phase=auth] [--limit=15]
```

### ace-stats
View system statistics:
```bash
ace-stats
```

## Programmatic Usage

```javascript
const { ACESystem } = require('claude-flow-novice/ace');

const ace = new ACESystem({
  dbPath: '.artifacts/database/swarm-memory.db'
});

await ace.initialize();

// Reflect on task
const result = await ace.reflect({
  taskId: 'task-123',
  trace: { /* execution data */ },
  feedback: { /* signals */ },
  reflectionType: 'success'
});

// Curate reflection
await ace.curate({
  reflectionId: result.reflectionId,
  similarityThreshold: 0.85
});

// Query bullets
const bullets = await ace.query({
  category: 'pattern',
  tags: ['coding'],
  minConfidence: 0.7,
  limit: 15
});

// Inject context
const context = await ace.inject({
  agentType: 'coder',
  phase: 'auth',
  limit: 15
});

await ace.close();
```

## Integration with CFN Loop

ACE hooks are integrated with all 15 coordinators via:

1. **Post-Task Reflection** - Extract coordination lessons
2. **Pre-Agent Spawn Context** - Inject relevant bullets
3. **Post-CFN-Loop Reflection** - Phase-level insights

See coordinator profiles in `.claude/agents/` for hook usage.

## Database Schema

- `adaptive_context` - Structured bullets with metadata
- `context_reflections` - Raw reflections before curation
- `context_usage_log` - Helpful/harmful tracking
- `context_merge_log` - Audit trail

Schema: `src/sqlite/adaptive-context-schema.sql`

## Features

- Incremental delta updates (no CLAUDE.md rewrites)
- Semantic deduplication (similarity thresholds: 0.6-0.95)
- Helpful/harmful counter tracking with confidence evolution
- ACL-aware permissions (5 levels)
- Agent-type-specific context mapping
- Phase-aware bullet injection
