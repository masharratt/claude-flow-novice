# Archived: Redis-Based CFN Loop Coordination

**Archived Date:** 2024-11-21
**Reason:** Migration to trigger.dev workflow orchestration

## Contents

```
.archive/cfn-redis-coordination-legacy/
├── skills/
│   ├── cfn-coordination/          # Agent completion, coordination signals
│   ├── cfn-redis-coordination/    # Redis BLPOP/LPUSH patterns
│   ├── cfn-docker-redis-coordination/  # Docker + Redis integration
│   ├── cfn-redis-cleanup/         # Redis key cleanup utilities
│   └── cfn-redis-data-extraction/ # Redis data extraction tools
├── src-cli/
│   ├── coordination-signal.ts     # Redis LPUSH signal dispatch
│   └── coordination-wait.ts       # Redis BLPOP blocking waits
└── src-coordination/
    └── index.ts                   # Coordination module entry
```

## Why Archived (Not Deleted)

1. **Historical reference** - Patterns may inform future work
2. **Rollback capability** - Can restore if trigger.dev migration fails
3. **Documentation** - Shows evolution of coordination approach

## Replacement

All functionality replaced by:
- `trigger-dev/` - trigger.dev workflow orchestration
- `src/integration/` - trigger.dev client, webhooks, Task Mode adapter

## To Restore

```bash
# If rollback needed:
mv .archive/cfn-redis-coordination-legacy/skills/* .claude/skills/
mv .archive/cfn-redis-coordination-legacy/src-cli/* src/cli/
mv .archive/cfn-redis-coordination-legacy/src-coordination src/coordination
```

## Related Documentation

- `/docs/TRIGGER_DEV_MIGRATION_PLAN.md` - Full migration plan
- `/docs/TRIGGER_DEV_INTEGRATION.md` - New integration guide
