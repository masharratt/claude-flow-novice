---
description: Enable CLI-based cost-savings mode with spawn-workers.js coordination
tags: [config, cost-optimization, coordination, cli]
---

Enable cost-savings mode to use CLI-based agent spawning with spawn-workers.js for 97% cost reduction.

**Usage:**
- `/cost-savings-on` - Enable CLI cost-savings mode

**What this does:**
- Activates CLI-based coordination using spawn-workers.js
- Updates CLAUDE.md to inject CLI coordinator sections
- Uses z.ai provider for worker agents ($0.50/1M tokens)
- Coordinator runs on Claude Max subscription ($0)
- Achieves ~97% cost savings vs pure Claude

**Mode Details:**
- **Coordinator**: Runs in main chat (Claude Max, $0)
- **Workers**: Spawned via CLI with z.ai provider
- **Spawning**: Uses `npx claude-flow-spawn --agents=type1,type2 --provider zai`
- **Coordination**: Redis pub/sub messaging
- **State**: SQLite persistence with ACL

**Execute mode toggle:**

```bash
npx claude-flow-cost-savings on
```

**After enabling:**
- Coordinators will use spawn-workers.js for agent spawning
- CLAUDE.md will show CLI spawning patterns
- All multi-agent work routes through CLI coordination
- Cost savings apply automatically to all phases
