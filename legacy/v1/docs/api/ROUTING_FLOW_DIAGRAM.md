# Provider Routing Flow Diagram

## Request Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Incoming Request                            │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│              Provider Manager: selectProvider()                     │
│  const effectiveAgentType = agentType || "main-chat"                │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│              Tiered Router: selectProvider(agentType)                │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
        ┌───────────────────────┐   ┌───────────────────────┐
        │  agentType = "main-   │   │  agentType = any      │
        │  chat"                │   │  other type           │
        └───────────────────────┘   └───────────────────────┘
                    │                           │
                    ▼                           ▼
        ┌───────────────────────┐   ┌───────────────────────┐
        │  Tier 0 Match         │   │  No Tier 0 Match      │
        │  (Main Chat)          │   │  → Fallback           │
        └───────────────────────┘   └───────────────────────┘
                    │                           │
                    ▼                           ▼
        ┌───────────────────────┐   ┌───────────────────────┐
        │  Anthropic Claude Max │   │  Z.ai                 │
        │  (Tier 0)             │   │  (Tier 1)             │
        └───────────────────────┘   └───────────────────────┘
                    │                           │
                    └─────────────┬─────────────┘
                                  ▼
                    ┌──────────────────────────┐
                    │  LLM Response            │
                    └──────────────────────────┘
```

## Example Scenarios

### Scenario 1: Main Chat Message
```
User: "Help me write a function"
  │
  ├─► Request: { messages: [...], agentType: undefined }
  │
  ├─► Provider Manager: agentType || "main-chat" → "main-chat"
  │
  ├─► Tiered Router: Match Tier 0 agentTypes ["main-chat"]
  │
  └─► Anthropic Claude Max (Tier 0)
```

### Scenario 2: Task Tool Agent (Coder)
```
Task("coder", "Implement feature X", "coder")
  │
  ├─► Request: { messages: [...], agentType: "coder" }
  │
  ├─► Provider Manager: agentType = "coder"
  │
  ├─► Tiered Router: No match in Tier 0 → Fallback
  │
  └─► Z.ai (Tier 1)
```

### Scenario 3: Task Tool Agent (Tester)
```
Task("tester", "Write tests for module Y", "tester")
  │
  ├─► Request: { messages: [...], agentType: "tester" }
  │
  ├─► Provider Manager: agentType = "tester"
  │
  ├─► Tiered Router: No match in Tier 0 → Fallback
  │
  └─► Z.ai (Tier 1)
```

### Scenario 4: Custom Agent Type
```
Task("custom-agent", "Do task Z", "custom-agent")
  │
  ├─► Request: { messages: [...], agentType: "custom-agent" }
  │
  ├─► Provider Manager: agentType = "custom-agent"
  │
  ├─► Tiered Router: No match in Tier 0 → Fallback
  │
  └─► Z.ai (Tier 1)
```

## Tier Configuration

```
TIER_CONFIGS = [
  {
    name: "Tier 0: Main Chat (Claude Max)",
    provider: "anthropic",
    agentTypes: ["main-chat"],
    priority: 0
  },
  {
    name: "Tier 1: Z.ai Agent Orchestration",
    provider: "zai",
    agentTypes: [],  // Empty = fallback for all non-Tier 0
    priority: 1
  }
]
```

## Decision Logic

```typescript
function selectProvider(agentType: string): LLMProvider {
  // Step 1: Check profile preferences (optional override)
  if (profileHasPreference(agentType)) {
    return profilePreference;
  }

  // Step 2: Iterate through tiers by priority (0, 1, 2, ...)
  for (const tier of sortedByPriority(TIER_CONFIGS)) {
    if (tier.agentTypes.includes(agentType)) {
      return tier.provider;
    }
  }

  // Step 3: Fallback to highest priority tier with empty agentTypes
  const fallbackTier = TIER_CONFIGS.find(t => t.agentTypes.length === 0);
  return fallbackTier?.provider || "zai";
}
```

## Provider Capabilities

### Anthropic Claude Max (Tier 0)
- **Context**: 200K tokens
- **Max Output**: 8192 tokens
- **Streaming**: Yes
- **Cost**: $0.003/1K prompt, $0.015/1K completion
- **Use Case**: Main chat, highest quality responses

### Z.ai (Tier 1)
- **Context**: 200K tokens (GLM-4.6)
- **Max Output**: 128K tokens (GLM-4.6)
- **Streaming**: Yes
- **Cost**: $0.003/1K prompt, $0.015/1K completion
- **Use Case**: Task tool agents, bulk operations

## Monitoring

### Real-Time Metrics
```bash
# View provider distribution
/metrics-summary --minutes=60

# View specific provider
/metrics-summary --provider=z.ai

# View last 24 hours
/metrics-summary --minutes=1440
```

### Expected Metrics
```
Provider Distribution:
  Anthropic: ~10% (main chat)
  Z.ai:      ~90% (Task tool agents)
```

## Performance Characteristics

| Metric          | Anthropic Claude Max | Z.ai             |
|-----------------|----------------------|------------------|
| Latency         | ~2-5s               | ~1-3s            |
| Throughput      | High                | Very High        |
| Cost per 1K     | $0.018              | $0.018           |
| Quality         | Excellent           | Very Good        |
| Context Window  | 200K                | 200K             |
| Max Output      | 8K                  | 128K             |

## Troubleshooting Flow

```
┌─────────────────────────────────────────────┐
│  Agent not using expected provider?         │
└─────────────────────────────────────────────┘
                  │
    ┌─────────────┴─────────────┐
    ▼                           ▼
┌─────────────────┐   ┌─────────────────────┐
│  Check agent    │   │  Check tiered       │
│  profile        │   │  router config      │
└─────────────────┘   └─────────────────────┘
    │                           │
    ▼                           ▼
┌─────────────────┐   ┌─────────────────────┐
│  Has provider   │   │  agentType in       │
│  preference?    │   │  correct tier?      │
└─────────────────┘   └─────────────────────┘
    │                           │
    └─────────────┬─────────────┘
                  ▼
    ┌──────────────────────────┐
    │  Check effectiveAgentType│
    │  in provider-manager.ts  │
    └──────────────────────────┘
                  │
                  ▼
    ┌──────────────────────────┐
    │  Verify environment vars │
    │  ANTHROPIC_API_KEY       │
    │  Z_AI_API_KEY            │
    └──────────────────────────┘
```
