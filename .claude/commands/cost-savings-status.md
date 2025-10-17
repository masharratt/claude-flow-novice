---
description: Show current cost-savings mode status and configuration
tags: [config, status, coordination]
---

Display current cost-savings mode status and coordinator configuration.

**Usage:**
- `/cost-savings-status` - Show mode status and details

**What this shows:**
- Current mode: CLI (cost-savings ON) or Task-tool (cost-savings OFF)
- Active coordinator type sections in CLAUDE.md
- Spawning method (spawn-workers.js vs Task tool)
- Provider configuration for workers
- Estimated cost savings percentage

**Mode Indicators:**
- **CLI Mode Active**: spawn-workers.js coordination, ~97% savings
- **Task-tool Mode Active**: Task() coordination, full Claude quality

**Execute status check:**

```bash
node scripts/toggle-cost-savings.cjs status
```

**Output includes:**
- Mode: CLI | Task-tool
- CLAUDE.md sections: Active coordinator profiles
- Spawning pattern: spawn-workers.js | Task()
- Provider: z.ai | Claude Max
- Cost savings: 0% | ~97%
- Last toggled: timestamp
