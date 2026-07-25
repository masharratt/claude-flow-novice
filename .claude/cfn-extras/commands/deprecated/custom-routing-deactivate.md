---
description: DEPRECATED - Use /switch-api max instead
tags: [deprecated, routing]
---

# ⚠️ DEPRECATED Command

**This command is deprecated and no longer needed.**

## Use Instead

```bash
/switch-api max
```

## What This Does

Switches Main Chat + Task tool back to Anthropic (default provider).

**Note:** Requires running `claude login` after switching.

## Migration

**If you were using `/custom-routing-deactivate`:**
```bash
# Just run this instead:
/switch-api max

# Then re-authenticate:
claude login
```

## Why Deprecated

The custom-routing system was designed but never fully implemented. The new switch-api provides the same functionality with:

1. **Simpler commands** - `/switch-api zai` or `/switch-api max`
2. **Actually works** - Complete implementation
3. **Clear behavior** - Explicit env var management
4. **Better docs** - See `/switch-api` help

## See Also

- `/switch-api` - Current routing system
- `/switch-api max` - Use Anthropic for Main Chat
- `/switch-api zai` - Use Z.ai for cost savings
