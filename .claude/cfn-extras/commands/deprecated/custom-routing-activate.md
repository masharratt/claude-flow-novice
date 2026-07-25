---
description: DEPRECATED - Use /switch-api zai instead
tags: [deprecated, routing]
---

# ⚠️ DEPRECATED Command

**This command is deprecated and no longer needed.**

## Use Instead

```bash
/switch-api zai
```

## What Changed

**Old system (custom-routing):**
- Designed for per-agent profile routing
- Required `tieredRouting` flag in settings.json
- Never fully implemented

**New system (switch-api):**
- ✅ Simple env var configuration
- ✅ Works with Main Chat + Task tool
- ✅ CLI agents use separate routing (.env)
- ✅ Fully operational

## Migration

**If you were using `/custom-routing-activate`:**
```bash
# Just run this instead:
/switch-api zai
```

**Effect:**
- Main Chat + Task() agents use Z.ai ($0.50/1M)
- CLI agents use Z.ai (from .env)
- Combined 97% cost savings

## Why Deprecated

The custom-routing system was designed but never fully implemented. The new switch-api provides:

1. **Simpler configuration** - Just env vars
2. **Actually works** - Complete implementation
3. **Clear separation** - Main Chat vs CLI routing
4. **Better documentation** - See `/switch-api` help

## See Also

- `/switch-api` - Current routing system
- `/switch-api zai` - Enable Z.ai for Main Chat
- `/switch-api max` - Use Anthropic for Main Chat
