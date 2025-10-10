# Provider Routing Configuration

## Overview

Claude Flow Novice uses a **tiered routing system** to intelligently route requests to the most appropriate LLM provider based on context.

## Current Configuration

### Tier 0: Main Chat (Claude Max)
- **Provider**: Anthropic Claude Max subscription
- **Agent Type**: `main-chat`
- **Purpose**: Highest quality responses for user-facing chat interactions
- **Usage**: Main conversational interface (default when no `agentType` specified)

### Tier 1: Task Tool Agents (Z.ai)
- **Provider**: Z.ai
- **Agent Types**: ALL Task tool agents (coder, tester, reviewer, backend-dev, frontend-dev, analyst, etc.)
- **Purpose**: Cost-effective bulk operations for autonomous agent swarms
- **Usage**: Any Task tool invocation with a specified agent type

## How It Works

### 1. Main Chat Routing
```typescript
// When no agentType is provided (main chat):
providerManager.complete(request);
// → Defaults to agentType="main-chat"
// → Routes to Anthropic Claude Max (Tier 0)
```

### 2. Task Tool Agent Routing
```typescript
// When Task tool spawns an agent:
providerManager.complete(request, "coder");
// → agentType="coder" (any non-"main-chat" type)
// → Routes to Z.ai (Tier 1)
```

## Implementation Details

### Provider Manager (`src/providers/provider-manager.ts`)
```typescript
private async selectProvider(request: LLMRequest, agentType?: string): Promise<ILLMProvider> {
  // Default to "main-chat" if no agentType provided
  const effectiveAgentType = agentType || "main-chat";

  if (this.config.tieredRouting?.enabled && this.tieredRouter) {
    const selectedProvider = await this.tieredRouter.selectProvider(effectiveAgentType);
    // ...
  }
}
```

### Tiered Router (`src/providers/tiered-router.ts`)
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
    agentTypes: [], // Matches all non-"main-chat" agents
    priority: 1,
  },
];
```

## Configuration Changes

### What Changed
1. **Simplified tier structure**: Reduced from 4 tiers to 2 tiers
2. **Default routing**: Main chat now defaults to Claude Max (Tier 0)
3. **Agent routing**: ALL Task tool agents route to Z.ai (Tier 1)
4. **No exceptions**: No special-case agent types for Anthropic routing

### Before
```
Tier 1: coordinator, architect, system-architect → Anthropic
Tier 2: coder, tester, reviewer, backend-dev → Z.ai
Tier 3: All others → Anthropic fallback
```

### After
```
Tier 0: main-chat → Anthropic Claude Max
Tier 1: ALL other agents → Z.ai
```

## Testing

Run the provider routing test:
```bash
node scripts/test-provider-routing.cjs
```

Expected output:
```
✅ WORKING AS DESIGNED:
   1. Main Chat           → Anthropic Claude Max (default routing)
   2. ALL Task Tool Agents → Z.ai (coder, tester, reviewer, backend-dev, etc.)
   3. Agent SDK           → Anthropic (hardcoded, no alternative)
```

## Environment Variables

Ensure both API keys are configured:
```bash
# .env
ANTHROPIC_API_KEY=sk-ant-...
Z_AI_API_KEY=sk-zai-...
```

## Monitoring

Monitor provider usage with metrics:
```bash
# View last hour
/metrics-summary --minutes=60

# View Z.ai usage
/metrics-summary --provider=z.ai

# View last 24 hours
/metrics-summary --minutes=1440
```

## Benefits

1. **Cost Optimization**: Task tool agents use Z.ai for bulk operations
2. **Quality First**: Main chat uses Claude Max subscription for best user experience
3. **Simple Configuration**: Only 2 tiers, easy to understand and maintain
4. **Predictable Routing**: Clear separation between main chat and agent operations
5. **No Special Cases**: All Task tool agents treated uniformly

## Migration Notes

If you were relying on specific agents routing to Anthropic (coordinator, architect, etc.), they now route to Z.ai. To override:

1. **Option A**: Update agent profile in `src/agents/profiles/` with `provider: "anthropic"`
2. **Option B**: Add custom tier in `tiered-router.ts` with specific agent types
3. **Option C**: Use `request.providerOptions.preferredProvider = "anthropic"`

## Troubleshooting

### Agents still using Anthropic
Check agent profile configuration:
```bash
grep -r "provider.*anthropic" src/agents/profiles/
```

### Z.ai requests not showing in metrics
1. Ensure Z_AI_API_KEY is set in .env
2. Check tiered routing is enabled in config
3. Verify agent type is not "main-chat"

### Main chat using Z.ai instead of Claude Max
1. Verify effectiveAgentType defaults to "main-chat"
2. Check Tier 0 configuration in tiered-router.ts
3. Ensure tiered routing is enabled

## Related Documentation

- [Provider Architecture](./PROVIDER_ARCHITECTURE.md)
- [Z.ai Setup Guide](./ZAIR_SETUP_CHECKLIST.md)
- [Metrics Documentation](./HOW_METRICS_WORK.md)
