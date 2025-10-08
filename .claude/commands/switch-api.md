---
description: Switch between z.ai and Anthropic Claude Max API providers
tags: [config, api, utility]
---

Switch Claude API provider between z.ai (GLM models) and official Anthropic Claude Max.

**Usage:**
- `/switch-api` - Show current API
- `/switch-api zai` - Switch to z.ai (GLM-4.6)
- `/switch-api max` - Switch to Claude Max
- `/switch-api list` - List saved configurations
- `/switch-api save <name>` - Save current config
- `/switch-api restore <name>` - Restore saved config

**Arguments:**
- `zai` - Use z.ai API with GLM models
- `max` or `claude` - Use official Anthropic API
- `status` - Show current API configuration
- `list` - List all saved configurations
- `save <name>` - Save current settings
- `restore <name>` - Restore previously saved settings

Execute API switch: {{args}}
