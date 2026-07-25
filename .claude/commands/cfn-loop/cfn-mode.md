---
name: cfn-mode
description: Toggle CFN Loop v3 spawning mode (cli vs task) for cost optimization or debugging
---

Toggle between CLI spawning (cost-optimized, Z.ai routing) and Task spawning (simplified, full visibility).

**Usage:**
/cfn-mode cli      # Enable CLI spawning (95-98% savings; external-API delegation)
/cfn-mode task     # Enable Task spawning (default, full visibility, subscription-backed)
/cfn-mode status   # Show current mode

**Current Mode:**
Check `.cfn-mode.json` or run `/cfn-mode status`

**Mode Details:**
- **CLI Mode**: Coordinator → orchestrator → CLI agents (Z.ai routing)
- **Task Mode**: main chat is Coordinator → JSON → Main Chat spawns Task() agents (Anthropic)

Only CLI mode use Redis context storage for swarm recovery.