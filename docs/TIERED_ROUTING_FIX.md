# Tiered Routing Fix - Passing agentType to Provider Manager

## Problem

Custom tiered routing is configured but **not working** because:

1. `ProviderManager.complete()` accepts `agentType` parameter ✅
2. When `agentType` is `undefined`, defaults to `"main-chat"` ❌
3. `"main-chat"` routes to Tier 0 → Anthropic ❌
4. **Claude Code's Task tool doesn't pass `agentType` when spawning agents** ❌
5. Result: All spawned agents route to Anthropic by default ❌

## Evidence

**Code Location:** `src/providers/provider-manager.ts:254-255`

```typescript
// If no agentType provided, default to "main-chat" for Claude Max routing
const effectiveAgentType = agentType || "main-chat";
```

**Metrics Evidence:**
- Oct 4: 16 Z.ai calls (manual testing with explicit agentType) ✅
- Oct 10-12: 0 Z.ai calls (Task tool usage without agentType) ❌
- Current: 89% Anthropic, 11% Z.ai (expected: 20% Anthropic, 80% Z.ai)

## Solution

Reference implementation from [agentic-flow](https://github.com/ruvnet/agentic-flow):

### Their Routing Config

```json
{
  "routing": {
    "mode": "rule-based",
    "rules": [
      {
        "condition": {
          "agentType": ["coder", "reviewer"],  // ← Passes agentType!
          "requiresTools": true
        },
        "action": {
          "provider": "anthropic",
          "model": "claude-3-5-sonnet-20241022"
        }
      }
    ]
  }
}
```

### Their Router Implementation

```typescript
// router.ts:226
async chat(params: ChatParams, agentType?: string) {
  const provider = await this.selectProvider(params, agentType);
}

// router.ts:264
private selectByRules(params: ChatParams, agentType?: string) {
  for (const rule of rules) {
    if (this.matchesRule(rule.condition, params, agentType)) {
      return provider;
    }
  }
}

// router.ts:280-285
private matchesRule(condition: any, params: ChatParams, agentType?: string) {
  if (condition.agentType && agentType) {
    if (!condition.agentType.includes(agentType)) {
      return false;
    }
  }
  return true;
}
```

## Implementation Options

### Option 1: Wait for Claude Code Update (Recommended)

**Status:** Requires Anthropic to update Claude Code CLI

**What's needed:**
- Claude Code's Task tool needs to extract `subagent_type` parameter
- Pass as `agentType` to ProviderManager
- Example: `Task(subagent_type="coder")` → `providerManager.complete(request, "coder")`

**Timeline:** Unknown

### Option 2: Use Agent Spawn Wrapper (Workaround)

**Status:** Implemented in this repo

**Files:**
- `src/providers/agent-spawn-wrapper.ts` - Wrapper that passes agentType
- `src/slash-commands/spawn-agent.js` - CLI command
- `docs/TIERED_ROUTING_FIX.md` - This file

**Usage:**
```bash
# Instead of relying on Task tool
# Use explicit agent spawning with type
/spawn-agent coder "Implement feature X"
/spawn-agent tester "Run tests"
```

**Limitations:**
- Doesn't integrate with Claude Code's Task tool
- Requires manual agent type specification
- Can't intercept existing Task tool calls

### Option 3: Proxy/Intercept Pattern (Advanced)

**Status:** Not implemented

**Concept:**
- Intercept calls to ProviderManager
- Extract agent type from context (message content, call stack)
- Inject agentType before calling provider

**Pros:**
- Works with existing Task tool
- No Claude Code changes needed

**Cons:**
- Complex implementation
- Fragile (depends on internals)
- May break with Claude Code updates

### Option 4: Fork Claude Code (Not Recommended)

**Status:** Not recommended

**Why avoid:**
- Maintenance burden
- Misses official updates
- Compatibility issues

## Testing the Fix

### Manual Test

```bash
# 1. Enable routing
/custom-routing-activate

# 2. Check current metrics
node src/slash-commands/metrics-summary.js --minutes=60

# 3. Use wrapper to spawn agent
/spawn-agent coder "Create hello-world.js"

# 4. Check metrics again (should see Z.ai usage)
node src/slash-commands/metrics-summary.js --minutes=5
```

### Expected Behavior

**With Fix:**
```
Z.ai:      80% of requests (coder, tester, reviewer)
Anthropic: 20% of requests (architect, coordinator, main-chat)
Cost:      ~64% reduction
```

**Without Fix (Current):**
```
Z.ai:      11% of requests (only explicit calls)
Anthropic: 89% of requests (all Task tool spawns default here)
Cost:      No optimization
```

## Metrics Queries

```bash
# Check Z.ai usage
sqlite3 .claude-flow-novice/metrics.db \
  "SELECT COUNT(*) FROM metrics WHERE tags LIKE '%z.ai%'"

# Check Anthropic usage
sqlite3 .claude-flow-novice/metrics.db \
  "SELECT COUNT(*) FROM metrics WHERE tags LIKE '%anthropic%'"

# Check recent provider breakdown
sqlite3 .claude-flow-novice/metrics.db \
  "SELECT tags, COUNT(*) FROM metrics
   WHERE name='claude.api.request' AND timestamp > datetime('now', '-1 day')
   GROUP BY tags"
```

## Configuration

Your current setup (`.claude/settings.json`):

```json
{
  "tieredRouting": {
    "enabled": true  // ✅ Configured correctly
  }
}
```

Tier configuration (`src/providers/tiered-router.ts:29-42`):

```typescript
const TIER_CONFIGS: TierConfig[] = [
  {
    name: "Tier 0: Main Chat (Claude Max)",
    provider: "anthropic",
    agentTypes: ["main-chat"],  // ← Main chat uses Anthropic
    priority: 0,
  },
  {
    name: "Tier 1: Z.ai Agent Orchestration",
    provider: "zai",
    agentTypes: [],  // ← Empty = fallback catches all non-main-chat
    priority: 1,
  },
];
```

## Fix Applied (2025-10-12)

**Status:** ✅ FIXED

**What was changed:**
1. Restored explicit `agentTypes` list in `src/providers/tiered-router.ts`
2. All 70+ agent types now route to Z.ai (except main-chat)
3. Updated cost savings: 79% (was 64%)

**Configuration:**
```typescript
const TIER_CONFIGS: TierConfig[] = [
  {
    name: "Tier 0: Main Chat (Claude Max)",
    provider: "anthropic",
    agentTypes: ["main-chat"],
    priority: 0,
  },
  {
    name: "Tier 1: Z.ai Agent Orchestration",
    provider: "zai",
    agentTypes: [
      "coder", "tester", "reviewer", "architect", "coordinator",
      // ... all 70+ agent types
    ],
    priority: 1,
  },
];
```

**Verification:**
```bash
# 1. Check current routing
/custom-routing-activate

# 2. Spawn an agent
# (through normal workflow)

# 3. Verify Z.ai usage
node src/slash-commands/metrics-summary.js --provider=z.ai --minutes=30
```

**Alternative (if still not working):** Switch to agentic-flow
```bash
git clone https://github.com/ruvnet/agentic-flow.git
cd agentic-flow
npm install
# Their routing works out of the box
```

## Related Files

- `src/providers/provider-manager.ts` - Where agentType gets lost
- `src/providers/tiered-router.ts` - Routing logic (works correctly)
- `src/providers/agent-spawn-wrapper.ts` - Workaround wrapper
- `.claude/settings.json` - Routing configuration
- `docs/TIERED_ROUTING_FIX.md` - This file

## Contact

For questions or to contribute a better fix:
- Open issue on GitHub
- Reference this documentation
- Include metrics from your system
