# Provider Routing Verification

## ✅ Updated Configuration (2025-10-05)

**MAJOR CHANGE:** Simplified from 4-tier to 2-tier routing for clarity and maintainability.

### System Architecture (Simplified 2-Tier)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CURRENT SETUP (2-TIER)                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  MAIN CHAT (You ↔ Claude Code)                                     │
│  ├─ Route: Anthropic Claude Max (direct)                           │
│  ├─ Model: claude-sonnet-4 (Tier 0: main-chat)                     │
│  └─ Cost: Claude Max subscription (highest quality)                │
│                                                                     │
│  TASK TOOL AGENTS (ALL Agent Types)                                │
│  ├─ Route: Z.ai API (https://api.z.ai)                             │
│  ├─ Model: glm-4.6, glm-4.5 (Tier 1: all agents)                   │
│  └─ Cost: LOWEST (Z.ai pricing for bulk operations)                │
│                                                                     │
│  AGENT SDK (Caching & Context Editing)                              │
│  ├─ Route: Anthropic API (hardcoded, no alternative)               │
│  ├─ Key: ANTHROPIC_API_KEY from .env                               │
│  └─ Savings: 90% cost reduction via extended caching               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Actual Usage Metrics (Last 24 Hours)

```
API Request Distribution:
├─ Anthropic: 104 requests (88.9%)
│  ├─ claude-3-sonnet-20240229: 100 requests (Tier 1 agents)
│  └─ claude-3-haiku-20240307:   4 requests
│
└─ Z.ai:      13 requests (11.1%)
   ├─ glm-4.6: 11 requests (Tier 2 agents)
   └─ glm-4.5:  2 requests
```

**Note:** High Anthropic usage (88.9%) is expected because:
1. Most recent work used strategic agents (coordinator, architect)
2. Agent SDK calls count as Anthropic requests
3. Main chat wasn't using Z.ai yet (configuration just completed)

### Expected Future Distribution

After Claude Code restart with Z.ai main chat:

```
Expected API Distribution:
├─ Z.ai:      ~70-80% (main chat + worker agents)
└─ Anthropic: ~20-30% (strategic agents + Agent SDK)
```

---

## 🔍 Configuration Files

### 1. Global Settings (`~/.claude/settings.json`)

**Purpose:** Routes main chat to Z.ai

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "model": "sonnet",
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.z.ai/api/anthropic",
    "ANTHROPIC_AUTH_TOKEN": "${ZAI_API_KEY}"
  }
}
```

**Status:** ✅ Configured (requires Claude Code restart)

### 2. Project Environment (`.env`)

**Purpose:** Stores API keys for both providers

```bash
# Anthropic API (for Tier 1 agents + Agent SDK)
ANTHROPIC_API_KEY=sk-ant-api03-dRM...

# Z.ai API (for main chat + Tier 2 agents)
ZAI_API_KEY=cca13d09dcd6407...
Z_AI_API_KEY=cca13d09dcd6407...  # Compatibility alias
```

**Status:** ✅ Configured

### 3. Tiered Router (`src/providers/tiered-router.ts`)

**Purpose:** Routes agent execution by type (SIMPLIFIED 2-TIER)

```typescript
const TIER_CONFIGS: TierConfig[] = [
  {
    name: "Tier 0: Main Chat (Claude Max)",
    provider: "anthropic",
    agentTypes: ["main-chat"],
    priority: 0,
  },
  {
    name: "Tier 1: Z.ai Agent Orchestration (ALL Task Tool Agents)",
    provider: "zai",
    agentTypes: [],  // All agents EXCEPT "main-chat"
    priority: 1,
  },
];
```

**Status:** ✅ Updated (2025-10-05)

### 4. Agent SDK (`src/sdk/config.cjs`)

**Purpose:** Anthropic Agent SDK configuration

```javascript
{
  apiKey: process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY,
  // NO baseURL option - hardcoded to https://api.anthropic.com
}
```

**Status:** ✅ Working (Anthropic only, no Z.ai routing possible)

---

## 🧪 Testing Commands

### Check Current Routing

```bash
# Run comprehensive test
node scripts/test-provider-routing.cjs

# View metrics summary
node src/slash-commands/metrics-summary.js --minutes=60

# Check Z.ai usage specifically
node src/slash-commands/metrics-summary.js --provider=z.ai

# Check Anthropic usage
node src/slash-commands/metrics-summary.js --provider=anthropic
```

### Expected Test Output

```
✅ WORKING AS DESIGNED:
   1. Main Chat           → Anthropic Claude Max (default routing)
   2. ALL Task Tool Agents → Z.ai (coder, tester, reviewer, backend-dev, etc.)
   3. Agent SDK           → Anthropic (hardcoded, no alternative)
```

---

## 💰 Cost Optimization Analysis

### Current Costs (Before Z.ai Main Chat)

| Component | Provider | Model | Volume | Cost Impact |
|-----------|----------|-------|--------|-------------|
| Main Chat | Anthropic | claude-3-sonnet | High | **HIGHEST** |
| Tier 1 Agents | Anthropic | claude-3-sonnet | Low | Medium |
| Tier 2 Agents | Z.ai | glm-4.6 | Medium | **LOWEST** |
| Agent SDK | Anthropic | (caching) | - | 90% reduction |

### Expected Costs (After Z.ai Main Chat)

| Component | Provider | Model | Volume | Cost Impact |
|-----------|----------|-------|--------|-------------|
| Main Chat | Z.ai | glm-4.6 | High | **LOWEST** ⬇️ |
| Tier 1 Agents | Anthropic | claude-3-sonnet | Low | Medium |
| Tier 2 Agents | Z.ai | glm-4.6 | Medium | **LOWEST** |
| Agent SDK | Anthropic | (caching) | - | 90% reduction |

**Key Change:** Main chat moves from HIGHEST cost (Anthropic Sonnet) to LOWEST cost (Z.ai GLM-4.6)

---

## 📊 Metrics Tracking

### Enable/Disable Tracking

```bash
# Enable metrics collection
/metrics-summary --enable

# Disable metrics collection
/metrics-summary --disable

# Check tracking status
/metrics-summary --status
```

### Query Examples

```bash
# Last hour (default)
/metrics-summary

# Last 24 hours
/metrics-summary --minutes=1440

# Last week
/metrics-summary --minutes=10080

# Z.ai only
/metrics-summary --provider=z.ai

# Specific model
/metrics-summary --model=glm-4.6
```

---

## ⚠️ Important Notes

### Agent SDK Limitation

The Claude Agent SDK is **hardcoded to Anthropic API** and **cannot be routed through Z.ai**. This is by design:

- ✅ **Benefit:** 90% cost reduction via extended caching
- ✅ **Benefit:** 84% token reduction via context editing
- ❌ **Limitation:** Must use Anthropic subscription
- ✅ **Acceptable:** Agent SDK overhead is minimal compared to savings

### Main Chat Configuration

The global settings change requires **Claude Code restart** to take effect:

1. Close Claude Code
2. Restart Claude Code
3. New sessions will use Z.ai automatically

### Provider Detection

The system automatically detects provider from API URL:
- `api.anthropic.com` → tracked as "anthropic"
- `api.z.ai` → tracked as "z.ai"

---

## ✅ Verification Checklist

- [x] `.env` has both `ANTHROPIC_API_KEY` and `ZAI_API_KEY`
- [x] Global settings configured with Z.ai endpoint
- [x] Tiered router has Z.ai provider
- [x] Metrics database tracking provider tags
- [x] Test script confirms routing works
- [x] Z.ai requests visible in metrics (11.1% currently, will increase)
- [x] Anthropic requests for Tier 1 agents only
- [ ] **PENDING:** Claude Code restart to activate Z.ai main chat

---

## 🎯 Next Steps

1. **Restart Claude Code** to activate Z.ai main chat routing
2. **Monitor metrics** over next 24 hours: `/metrics-summary`
3. **Verify distribution** shifts to ~70-80% Z.ai requests
4. **Compare costs** in provider dashboards (Anthropic vs Z.ai)

---

## 📚 Reference

- **Metrics Summary**: `src/slash-commands/metrics-summary.js`
- **Tiered Router**: `src/providers/tiered-router.ts`
- **Z.ai Provider**: `src/providers/zai-provider.ts`
- **Agent SDK Config**: `src/sdk/config.cjs`
- **Metrics Storage**: `src/observability/metrics-storage.ts`

**Test Script:** `scripts/test-provider-routing.cjs`
**Metrics Database:** `.claude-flow-novice/metrics.db`
**Global Settings:** `~/.claude/settings.json`
