---
description: Switch Main Chat and Task tool between Z.ai and Anthropic providers
tags: [config, api, cost-optimization]
---

Switch Main Chat and Task() tool API provider between Z.ai (cost-optimized) and Anthropic (high-quality).

**Important:** CLI agents always use Z.ai (from `.env`). This command only affects Main Chat and Task() spawned agents.

**Usage:**
- `/switch-api` - Show current status
- `/switch-api zai` - Main Chat/Task tool use Z.ai ($0.50/1M tokens)
- `/switch-api max` - Main Chat/Task tool use Anthropic ($15/1M tokens, requires re-login)

**Arguments:**
- `status` - Show current routing configuration (default)
- `zai` - Route Main Chat + Task tool to Z.ai for cost savings
- `max` or `claude` - Route Main Chat + Task tool to Anthropic for quality

**What This Does:**

`/switch-api zai`:
- Adds env vars to `.claude/settings.json`
- Main Chat + Task() agents use Z.ai
- Cost: $0.50/1M tokens (97% savings)
- No login required

`/switch-api max`:
- Removes env vars from `.claude/settings.json`
- Main Chat + Task() agents use Anthropic
- Cost: $15/1M tokens (or $0 with unlimited plan)
- **Requires** running `claude login`

**Combined Architecture:**
```
Main Chat (Anthropic or Z.ai - your choice)
  ↓
Task() → Coordinator (uses Main Chat provider)
  ↓
CLI spawn → Workers (always Z.ai from .env)
```

**Execute:**
```bash
bash scripts/switch-api.sh {{args}}
```

**Examples:**
```bash
/switch-api          # Show current routing
/switch-api zai      # Cost-optimize Main Chat
/switch-api max      # Quality-optimize Main Chat (requires re-login)
```
