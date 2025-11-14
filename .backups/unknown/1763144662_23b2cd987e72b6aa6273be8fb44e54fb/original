---
description: Switch Main Chat and Task tool between Z.ai, Kimi, OpenRouter, and Anthropic providers
tags: [config, api, cost-optimization]
---

Switch Main Chat and Task() tool API provider between multiple AI providers.

**Important:** CLI agents support custom routing when enabled. This command affects Main Chat and Task() spawned agents.

**Usage:**
- `/switch-api` - Show current status
- `/switch-api [zai|kimi|openrouter|max]` - Switch provider
  - `zai` - Z.ai ($0.50/1M tokens)
  - `kimi` - Moonshot Kimi ($2/1M tokens)
  - `openrouter` - OpenRouter (varies by model)
  - `max` or `claude` - Anthropic ($15/1M tokens, requires re-login)

**Arguments:**
- `status` - Show current routing configuration (default)
- `zai` - Route Main Chat + Task tool to Z.ai for cost savings
- `kimi` - Route Main Chat + Task tool to Moonshot Kimi
- `openrouter` - Route Main Chat + Task tool to OpenRouter
- `max` or `claude` - Route Main Chat + Task tool to Anthropic for quality

**What This Does:**

`/switch-api zai`:
- Adds Z.ai env vars to `.claude/settings.json`
- Main Chat + Task() agents use Z.ai
- Cost: $0.50/1M tokens (97% savings)
- No login required

`/switch-api kimi`:
- Adds Kimi env vars to `.claude/settings.json`
- Main Chat + Task() agents use Moonshot Kimi
- Cost: ~$2/1M tokens
- Requires `KIMI_API_KEY` in root `.env`

`/switch-api openrouter`:
- Adds OpenRouter env vars to `.claude/settings.json`
- Main Chat + Task() agents use OpenRouter
- Cost: Varies by model
- Requires `OPENROUTER_API_KEY` in root `.env`

`/switch-api max`:
- Removes env vars from `.claude/settings.json`
- Main Chat + Task() agents use Anthropic
- Cost: $15/1M tokens (or $0 with unlimited plan)
- **Requires** running `claude login`

**Combined Architecture:**
```
Main Chat (Anthropic/Z.ai/Kimi/OpenRouter - your choice)
  ↓
Task() → Coordinator (uses Main Chat provider)
  ↓
CLI spawn → Workers (custom routing when enabled, see agent profiles)
```

**Execute:**
```bash
bash "$(git rev-parse --show-toplevel 2>/dev/null || pwd)/scripts/switch-api.sh" {{args}}
```

**Note:** Script automatically resolves to project root directory.

**Examples:**
```bash
/switch-api             # Show current routing
/switch-api zai         # Cost-optimize with Z.ai
/switch-api kimi        # Use Moonshot Kimi
/switch-api openrouter  # Use OpenRouter (access 400+ models)
/switch-api max         # Quality-optimize with Anthropic (requires re-login)
```
