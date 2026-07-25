# Switch API Guide

**Status:** ✅ Fully Implemented
**Script:** `scripts/switch-api.sh`
**Commands:** `/switch-api zai`, `/switch-api max`

---

## Overview

The switch-api command controls which API provider Main Chat and Task() tool use.

**Two Independent Routing Systems:**

| Component | Controlled By | Current Setting |
|-----------|--------------|-----------------|
| **Main Chat + Task()** | `/switch-api` | `.claude/settings.json` env vars |
| **CLI Agents** | `.env` file | `CLAUDE_API_PROVIDER=zai` |

**Key Concept:** These are separate! You can have Main Chat on Anthropic and CLI on Z.ai (recommended for hybrid cost savings).

---

## Commands

### Show Current Status

```bash
/switch-api
# or
/switch-api status
```

**Output:**
```
═══════════════════════════════════════
   Claude API Provider Status
═══════════════════════════════════════

✓ Main Chat/Task Tool: Anthropic (default)
  Cost: $15/1M tokens (Claude Max subscription)
  Status: Requires 'claude login'

✓ CLI Agents: Z.ai (from .env)
  Cost: $0.50/1M tokens

Combined Architecture:
  Main Chat → Task tool → Coordinator (uses Main Chat provider)
  Coordinator → CLI spawn → Workers (uses CLI .env provider)
```

---

### Switch to Z.ai (Cost-Optimized)

```bash
/switch-api zai
```

**What it does:**
1. Backs up `.claude/settings.json`
2. Adds env vars:
   ```json
   {
     "env": {
       "ANTHROPIC_BASE_URL": "https://api.z.ai/api/anthropic",
       "ANTHROPIC_AUTH_TOKEN": "cca13d..."
     }
   }
   ```
3. Main Chat + Task() now route to Z.ai

**Output:**
```
═══════════════════════════════════════
✓ Switched to Z.ai
═══════════════════════════════════════

Main Chat + Task Tool: Z.ai
  • All Task() spawned agents use Z.ai
  • Cost: $0.50/1M tokens (97% savings)
  • No login required

CLI Agents: Z.ai (from .env)
  • CLAUDE_API_PROVIDER=zai in .env
  • Independent from Main Chat routing

Next Steps:
  1. Restart Claude desktop (if running)
  2. Test: /cfn-loop "Test task"
  3. Verify logs show: Provider: zai
```

**Cost:** $0.50/1M tokens (97% savings vs Anthropic)

**Benefits:**
- ✅ No login required
- ✅ 97% cost reduction
- ✅ Works immediately
- ✅ All agents use Z.ai

---

### Switch to Anthropic (High-Quality)

```bash
/switch-api max
```

**What it does:**
1. Backs up `.claude/settings.json`
2. Removes env vars (back to default)
3. Main Chat + Task() now route to Anthropic

**Output:**
```
═══════════════════════════════════════
✓ Switched to Anthropic
═══════════════════════════════════════

Main Chat + Task Tool: Anthropic (official)
  • Uses Claude Max subscription
  • Cost: $15/1M tokens (or $0 with unlimited plan)
  • Requires re-login: Run 'claude login'

CLI Agents: Z.ai (from .env)
  • CLAUDE_API_PROVIDER=zai in .env
  • Unchanged - CLI still uses Z.ai for cost savings

Next Steps:
  1. Run: claude login
  2. Authenticate with Anthropic
  3. Restart Claude desktop
  4. Test: Main Chat should work

Combined Savings:
  • Main Chat: $15/1M (high quality)
  • CLI Workers: $0.50/1M (cost optimized)
  • Overall: 88% savings vs all-Anthropic
```

**Important:** Must run `claude login` after switching!

**Cost:** $15/1M tokens (or $0 with unlimited subscription)

**Benefits:**
- ✅ Official Anthropic quality
- ✅ Claude Max features
- ✅ Still 88% savings (CLI uses Z.ai)
- ✅ Hybrid cost/quality optimization

---

## Architecture

### All Z.ai (Maximum Savings)

```bash
# 1. Set Main Chat to Z.ai
/switch-api zai

# 2. CLI already on Z.ai (from .env)
# CLAUDE_API_PROVIDER=zai
```

**Flow:**
```
Main Chat (Z.ai)
  ↓
Task() → Coordinator (Z.ai)
  ↓
CLI spawn → Workers (Z.ai)
```

**Cost:** $0.50/1M tokens everywhere (97% savings)

---

### Hybrid (Best of Both Worlds) - RECOMMENDED

```bash
# 1. Set Main Chat to Anthropic
/switch-api max
claude login

# 2. CLI stays on Z.ai (from .env)
# CLAUDE_API_PROVIDER=zai
```

**Flow:**
```
Main Chat (Anthropic $15/1M)
  ↓
Task() → Coordinator (Anthropic $15/1M)
  ↓
CLI spawn → Workers (Z.ai $0.50/1M)
```

**Cost:**
- Main Chat: $15/1M (1-2 agents)
- Workers: $0.50/1M (10-100 agents)
- **Combined savings: 88-95%**

**Why Recommended:**
- ✅ High-quality Main Chat responses
- ✅ Cost-optimized worker agents
- ✅ Best cost/quality ratio
- ✅ 88-95% overall savings

---

## Use Cases

### Development (Cost-Optimized)

```bash
/switch-api zai
```

**Why:**
- Testing features
- High agent volume
- Budget constraints
- Z.ai quality sufficient

---

### Production (Hybrid)

```bash
/switch-api max
claude login
```

**Why:**
- Critical decisions (Main Chat)
- High-quality coordinator
- Cost-optimized workers (CLI)
- Best balance

---

### Demo/Sales (All Anthropic)

```bash
/switch-api max
claude login

# Temporarily disable CLI Z.ai routing
export CLAUDE_API_PROVIDER=anthropic
```

**Why:**
- Showcase quality
- Impress stakeholders
- Consistent experience

---

## Troubleshooting

### "Requires re-login" after switching to max

**Solution:**
```bash
claude login
```

Then restart Claude desktop.

---

### Main Chat not working after zai switch

**Solution:**
```bash
# Check settings file
cat .claude/settings.json | jq '.env'

# Should show:
# {
#   "ANTHROPIC_BASE_URL": "https://api.z.ai/api/anthropic",
#   "ANTHROPIC_AUTH_TOKEN": "cca13d..."
# }

# Restart Claude desktop
```

---

### CLI agents still using Anthropic

**Solution:**
```bash
# Check .env file
grep CLAUDE_API_PROVIDER .env

# Should show:
# CLAUDE_API_PROVIDER=zai

# If not, add it:
echo "CLAUDE_API_PROVIDER=zai" >> .env
```

---

## Backups

All switches create automatic backups:

```bash
.claude/backups/
  settings-20251020-153045-before-zai.json
  settings-20251020-154120-before-max.json
```

**Restore manually:**
```bash
cp .claude/backups/settings-*.json .claude/settings.json
```

---

## Cost Comparison

### Scenario: CFN Loop with 5 agents, 3 iterations

| Configuration | Main Chat | CLI Workers | Total Cost |
|--------------|-----------|-------------|------------|
| **All Anthropic** | $15/1M | $15/1M | $24.30 |
| **All Z.ai** | $0.50/1M | $0.50/1M | $0.81 |
| **Hybrid** (recommended) | $15/1M | $0.50/1M | $3.06 |

**Savings:**
- All Z.ai: 97% ($23.49 saved)
- Hybrid: 87% ($21.24 saved)

---

## Related Commands

- `/switch-api` - Show status
- `/switch-api zai` - Cost mode
- `/switch-api max` - Quality mode

**Deprecated:**
- ~~`/custom-routing-activate`~~ → Use `/switch-api zai`
- ~~`/custom-routing-deactivate`~~ → Use `/switch-api max`

---

## Summary

**Two routing systems:**
1. **Main Chat + Task() tool:** Controlled by `/switch-api`
2. **CLI agents:** Controlled by `.env` (always Z.ai)

**Recommended setup (Hybrid):**
```bash
# Main Chat: High quality
/switch-api max
claude login

# CLI: Cost optimized (already set in .env)
# CLAUDE_API_PROVIDER=zai ✅
```

**Result:** 88-95% cost savings with best quality

---

**Last Updated:** 2025-10-20
**Script:** `scripts/switch-api.sh`
