---
name: cfn-memory-persistence-redis
description: Redis-based agent coordination with pub/sub and waiting mode
version: 1.0.0
tags: [redis, coordination, pub-sub, waiting-mode]
status: production
---

# Redis Coordination Submodule

**Parent Skill:** cfn-memory-persistence
**Purpose:** Redis-based coordination for agent synchronization and waiting mode

## Components

- `bash-wrappers/` - Bash wrapper scripts for Redis operations
- `data/` - SQLite database for local persistence
- `dist/` - Compiled TypeScript
- `coverage/` - Test coverage reports

## Key Operations

- Agent waiting mode (BLPOP-based)
- Confidence score collection
- Context storage and retrieval
- Swarm coordination signals
- Agent completion tracking

## Usage

```bash
# Invoke waiting mode
./.claude/skills/cfn-memory-persistence/lib/redis/bash-wrappers/invoke-waiting-mode.sh \
  --task-id "task-123" \
  --agent-id "agent-456" \
  --action wait

# Store context
./.claude/skills/cfn-memory-persistence/lib/redis/bash-wrappers/store-context.sh \
  --task-id "task-123" \
  --context "implementation context"
```
