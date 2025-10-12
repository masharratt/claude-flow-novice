# /custom-routing-activate - Enable Cost-Optimized Routing

Activate tiered provider routing to reduce LLM costs by routing most agents to Z.ai while keeping high-value agents on Anthropic.

## Usage

```bash
/custom-routing-activate
```

Simple! No arguments needed. Just run the command to enable cost optimization.

## What It Does

Activates intelligent routing with three priority levels:

### Priority 1: Agent Profile Override
Agents can specify their preferred provider in their profile:
```yaml
provider: zai        # Force Z.ai for this agent
provider: anthropic  # Force Anthropic for this agent
```

### Priority 2: Tier Configuration
**ALL Task Tool agents route to Z.ai** for maximum cost savings:
- `coder`, `tester`, `reviewer` → Z.ai
- `architect`, `coordinator`, `system-architect` → Z.ai
- `devops-engineer`, `security-specialist` → Z.ai
- All 70+ agent types → Z.ai

Only the main chat uses Anthropic Claude Max:
- `main-chat` → Anthropic (your direct conversations)

## Cost Savings

**Example calculation:**
```
Without routing: 100 agent calls × $0.015 = $1.50
With routing:    99 calls × $0.003 (Z.ai) + 1 call × $0.015 (main-chat) = $0.31

💰 Savings: 79% cost reduction (all agents on Z.ai)
```

## Output

When you run `/custom-routing-activate`:

```
═══════════════════════════════════════════════════════
   Activating Tiered Provider Routing
═══════════════════════════════════════════════════════

✅ Tiered Provider Routing ACTIVATED

📊 Active Routing:
  • ALL Task Tool agents (70+ types) → Z.ai
  • Main chat only → Anthropic Claude Max
  • Maximum cost optimization enabled

💰 Cost Optimization:
  • ~79% cost reduction on agent usage
  • All spawned agents use affordable Z.ai provider
  • Only main chat uses Anthropic Claude Max

🎯 Agent Profile Overrides:
  • Add provider: zai to agent profile → force Z.ai
  • Add provider: anthropic to agent profile → force Anthropic

💾 Configuration saved to:
   /path/to/project/.claude/settings.json

📖 To disable routing:
   /custom-routing-deactivate
═══════════════════════════════════════════════════════
```

## When to Use

**Enable for:**
- ✅ Production development (cost savings)
- ✅ High-volume agent usage
- ✅ Projects with budget constraints
- ✅ Default recommendation for most projects

**Disable for:**
- Testing quality differences between providers
- Debugging provider-specific issues
- Ensuring consistent provider behavior
- Short-term projects where consistency matters more than cost

## Configuration

Settings are saved to `.claude/settings.json`:

```json
{
  "tieredRouting": {
    "enabled": true
  }
}
```

## Related Commands

- `/custom-routing-deactivate` - Disable tiered routing
- `/cfn-loop` - Self-correcting development loop (respects routing)
- `/swarm` - Multi-agent coordination (respects routing)

## Best Practices

1. **Enable by default** - Activate routing for immediate cost savings
2. **Monitor quality** - Ensure Z.ai quality meets your standards
3. **Profile strategic agents** - Mark critical agents with `provider: anthropic`
4. **Test both modes** - Compare results with routing on and off

## Examples

### First-time activation
```bash
$ /custom-routing-activate

✅ Tiered Provider Routing ACTIVATED

💰 Cost Optimization:
  • ~64% cost reduction on agent usage
```

### Already activated
```bash
$ /custom-routing-activate

✅ Tiered routing is already ENABLED

💡 To disable, run: /custom-routing-deactivate
```

## See Also

- **Deactivation**: `/custom-routing-deactivate`
- **Status Check**: `/activate-custom-routing` (shows current status)
- **Agent Profiles**: `.claude/agents/*.md` (add `provider` field)
