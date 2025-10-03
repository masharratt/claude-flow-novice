# /custom-routing-deactivate - Disable Tiered Routing

Deactivate tiered provider routing so all agents use the default provider configuration (sonnet model).

## Usage

```bash
/custom-routing-deactivate
```

Simple! No arguments needed. Just run the command to disable tiered routing.

## What It Does

Disables profile-based provider routing. After deactivation:

- ✅ All agents use **sonnet model** (from agent profiles)
- ✅ Single provider for all agents
- ✅ No provider-based routing
- ✅ Consistent behavior across all agents

## Use Cases

**Disable for:**
- Testing quality differences between providers
- Debugging provider-specific issues
- Ensuring consistent provider behavior
- A/B testing routing vs non-routing
- Projects where consistency matters more than cost

**Enable for:**
- Production development (cost savings)
- High-volume agent usage
- Projects with budget constraints

## Output

When you run `/custom-routing-deactivate`:

```
═══════════════════════════════════════════════════════
   Deactivating Tiered Provider Routing
═══════════════════════════════════════════════════════

✅ Tiered Provider Routing DEACTIVATED

📊 Current Routing:
  • All agents use sonnet model (from agent profiles)
  • Single provider for all agents
  • No provider-based routing

⚠️  Cost Impact:
  • All agents use default provider (typically Anthropic)
  • No cost optimization active
  • Useful for testing or consistency requirements

💾 Configuration saved to:
   /path/to/project/.claude/settings.json

📖 To enable routing:
   /custom-routing-activate
═══════════════════════════════════════════════════════
```

## Configuration

Settings are saved to `.claude/settings.json`:

```json
{
  "tieredRouting": {
    "enabled": false
  }
}
```

## Cost Impact

**Without routing (after deactivation):**
```
100 agent calls × $0.015 (Anthropic) = $1.50
```

**With routing (before deactivation):**
```
80 calls × $0.003 (Z.ai) + 20 calls × $0.015 (Anthropic) = $0.54
```

**Impact of deactivation:** +$0.96 per 100 agent calls (178% increase)

## Related Commands

- `/custom-routing-activate` - Enable tiered routing
- `/activate-custom-routing` - Show routing status
- `/cfn-loop` - Self-correcting development loop

## When to Deactivate

### Good Reasons:
✅ Testing quality differences
✅ Debugging provider issues
✅ Short-term consistency needs
✅ Comparing routing vs non-routing

### Bad Reasons:
❌ "I don't understand routing" - Learn it first, saves money
❌ "Too complicated" - It's automatic once enabled
❌ "Not sure if it works" - Test it with small tasks first

## Examples

### Deactivate routing
```bash
$ /custom-routing-deactivate

✅ Tiered Provider Routing DEACTIVATED

📊 Current Routing:
  • All agents use sonnet model (from agent profiles)
  • Single provider for all agents
```

### Already deactivated
```bash
$ /custom-routing-deactivate

✅ Tiered routing is already DISABLED

💡 To enable cost optimization, run: /custom-routing-activate
```

## Best Practices

1. **Deactivate temporarily** - Only disable for testing, then re-enable
2. **Document why** - Note the reason for deactivation in project docs
3. **Set reminder** - Remember to re-enable after testing
4. **Compare results** - Use deactivation to validate routing quality

## See Also

- **Activation**: `/custom-routing-activate`
- **Status Check**: `/activate-custom-routing`
- **Cost Analysis**: Check `.claude/settings.json` for current state
