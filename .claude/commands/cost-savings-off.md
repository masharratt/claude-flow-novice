---
description: Disable CLI cost-savings mode and use Task-tool coordination
tags: [config, coordination, task-tool]
---

Disable CLI cost-savings mode to use traditional Task-tool agent spawning.

**Usage:**
- `/cost-savings-off` - Disable CLI cost-savings mode

**What this does:**
- Deactivates CLI-based coordination
- Updates CLAUDE.md to inject Task-tool coordinator sections
- Uses Task() spawning for all agents
- Agents run on main provider (Claude Max or z.ai based on /switch-api)
- Prioritizes coordinator intelligence over cost

**Mode Details:**
- **Coordinator**: Spawned via Task tool in main chat
- **Workers**: Spawned via Task tool by coordinator
- **Spawning**: Uses `Task("agent-type", "instructions", "type")`
- **Coordination**: Direct Task tool orchestration
- **State**: SQLite persistence with ACL

**Execute mode toggle:**

```bash
node scripts/toggle-cost-savings.cjs off
```

**After disabling:**
- Coordinators will use Task tool for agent spawning
- CLAUDE.md will show Task spawning patterns
- All multi-agent work routes through Task coordination
- Higher cost but maximum coordinator intelligence
