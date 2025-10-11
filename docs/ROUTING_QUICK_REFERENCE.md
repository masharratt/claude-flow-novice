# Provider Routing - Quick Reference

## TL;DR

**Main chat** → Anthropic Claude Max
**ALL Task tool agents** → Z.ai

## Configuration Files

| File | What Changed |
|------|--------------|
| `src/providers/tiered-router.ts` | Simplified to 2 tiers (0: main-chat → anthropic, 1: all others → zai) |
| `src/providers/provider-manager.ts` | Default agentType to "main-chat" when not provided |
| `scripts/test-provider-routing.cjs` | Updated test output and summary |

## How to Test

```bash
# Quick test
node scripts/test-provider-routing.cjs

# Expected:
# ✅ Tier 0: Main chat → Anthropic Claude Max
# ✅ Tier 1: ALL Task tool agents → Z.ai
```

## How to Verify in Production

```bash
# Check last hour of metrics
/metrics-summary --minutes=60

# Check Z.ai usage specifically
/metrics-summary --provider=z.ai

# Expected distribution:
# Anthropic: ~10% (main chat)
# Z.ai: ~90% (Task tool agents)
```

## Common Agent Types → Provider Mapping

| Agent Type | Provider | Reason |
|------------|----------|--------|
| `main-chat` (default) | Anthropic Claude Max | Highest quality for user chat |
| `coder` | Z.ai | Cost-effective bulk operations |
| `tester` | Z.ai | Cost-effective bulk operations |
| `reviewer` | Z.ai | Cost-effective bulk operations |
| `backend-dev` | Z.ai | Cost-effective bulk operations |
| `frontend-dev` | Z.ai | Cost-effective bulk operations |
| `analyst` | Z.ai | Cost-effective bulk operations |
| `researcher` | Z.ai | Cost-effective bulk operations |
| Any custom type | Z.ai | Default fallback to Tier 1 |

## Environment Variables Required

```bash
# .env
ANTHROPIC_API_KEY=sk-ant-...  # For main chat
Z_AI_API_KEY=sk-zai-...       # For Task tool agents
```

## Code Examples

### Main Chat Request
```typescript
// User sends message in chat
providerManager.complete({
  messages: [{ role: "user", content: "Help me" }]
});
// agentType = undefined → "main-chat" → Anthropic Claude Max
```

### Task Tool Agent Request
```typescript
// Spawn coder agent
Task("coder", "Implement feature X", "coder");
// agentType = "coder" → Z.ai
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Main chat using Z.ai | Check effectiveAgentType defaults to "main-chat" |
| Agents using Anthropic | Check agent profile doesn't override provider |
| No Z.ai requests in metrics | Verify Z_AI_API_KEY is set, tiered routing enabled |
| Metrics database error | Run `npm run build` to regenerate compiled files |

## Benefits

✅ **Simplicity**: 2 tiers instead of 4
✅ **Predictability**: Main chat vs. agents clearly separated
✅ **Cost-effective**: ALL Task agents use Z.ai
✅ **Quality**: Main chat uses Claude Max
✅ **No special cases**: Uniform agent routing

## Next Steps

1. ✅ Changes committed
2. ✅ Test routing with `scripts/test-provider-routing.cjs`
3. ⏳ Monitor metrics with `/metrics-summary`
4. ⏳ Verify Z.ai requests appear in database
5. ⏳ Confirm main chat quality with Claude Max

## Documentation

📖 [Full Configuration Guide](./docs/PROVIDER_ROUTING_CONFIGURATION.md)
📊 [Routing Flow Diagram](./docs/ROUTING_FLOW_DIAGRAM.md)
📝 [Summary](./ROUTING_SIMPLIFICATION_SUMMARY.md)

## Support

Questions? Check:
- [Z.ai Setup Checklist](./docs/ZAIR_SETUP_CHECKLIST.md)
- [Provider Architecture](./docs/PROVIDER_ARCHITECTURE.md)
- [Metrics Documentation](./docs/HOW_METRICS_WORK.md)
