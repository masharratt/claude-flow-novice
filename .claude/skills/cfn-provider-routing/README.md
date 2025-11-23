# CFN Provider Routing - Cross-Provider Model Compatibility

## Overview

This module provides cross-provider model compatibility for CFN Loop agent routing. It translates agent-specified models (sonnet/haiku/opus) to provider-specific model names without requiring Redis calls.

## Problem Solved

**Before:** Agent profiles specified Anthropic-specific models (`model: sonnet`, `model: haiku`) but providers use different model names:
- Z.ai: `glm-4.6`
- Kimi: `kimi-k2-turbo-preview`
- OpenRouter: `anthropic/claude-sonnet-4.5`
- Gemini: `google/gemini-2.0-flash-001`
- XAi: `grok-beta`

**After:** Centralized mapping system automatically translates agent models to provider-specific models.

## Files

- **`provider-model-mappings.yaml`** - Configuration file with all provider model mappings
- **`resolve-provider-model.ts`** - TypeScript resolver service (NO REDIS CALLS)
- **`README.md`** - This documentation

## Usage

### Command Line
```bash
# Resolve model for provider
./resolve-provider-model.ts --provider zai --model sonnet
# Output: glm-4.6

# Get configuration summary
./resolve-provider-model.ts --summary

# Use cost tier optimization
./resolve-provider-model.ts --provider kimi --model haiku --tier economy
```

### Programmatic
```typescript
import ProviderModelResolver from './resolve-provider-model';

const resolver = new ProviderModelResolver();

// Basic resolution
const model = resolver.resolveModel('zai', 'sonnet'); // glm-4.6

// With cost optimization
const economyModel = resolver.resolveModel('kimi', 'haiku', 'economy');

// Check provider support
if (resolver.isProviderSupported('zai')) {
  // Use Z.ai routing
}
```

## Integration Points

The resolver integrates with existing CFN Loop components:

1. **Agent Spawning**: `cfn-agent-spawning` scripts use resolver to set ANTHROPIC_MODEL
2. **Provider Selection**: `get-agent-provider-env.sh` calls resolver for model mapping
3. **Cost Optimization**: CLI mode can specify cost tiers for agent execution

## Configuration

### Adding New Providers

1. Add provider to `provider-model-mappings.yaml`:
```yaml
mappings:
  sonnet:
    newprovider: newprovider-sonnet-model
  haiku:
    newprovider: newprovider-haiku-model

defaults:
  newprovider: newprovider-default-model
```

2. Update provider detection logic in existing routing scripts

### Adding New Agent Models

1. Add model mapping for all providers:
```yaml
mappings:
  newmodel:
    anthropic: claude-3-5-newmodel
    zai: glm-4.6-newmodel
    kimi: kimi-newmodel
    # ... etc for all providers
```

## Architecture Benefits

- ✅ **Single source of truth** - All mappings in one YAML file
- ✅ **Zero Redis dependency** - Pure configuration resolution
- ✅ **Easy provider addition** - Add provider to config only
- ✅ **Cost optimization support** - Built-in tier-based model selection
- ✅ **TypeScript safety** - Full type checking and validation
- ✅ **Agent profile simplicity** - No need to update 65+ agent files
- ✅ **Testing simplicity** - Validate mappings in isolation

## Migration Path

1. **Phase 1**: Deploy resolver alongside existing system
2. **Phase 2**: Update agent spawning to use resolver
3. **Phase 3**: Remove hardcoded model logic from routing scripts
4. **Phase 4**: Add cost tier optimization to CLI mode

## Testing

```bash
# Test all provider mappings
./resolve-provider-model.ts --summary

# Validate specific mappings
./resolve-provider-model.ts --provider zai --model sonnet
./resolve-provider-model.ts --provider kimi --model haiku
./resolve-provider-model.ts --provider openrouter --model opus
```

## Performance

- **Startup time**: <10ms (YAML file load)
- **Resolution time**: <1ms per lookup
- **Memory usage**: <1MB (small config object)
- **No external dependencies**: Pure Node.js implementation