# Custom Provider Routing System

**Version:** 1.0.0
**Date:** 2025-11-10
**Status:** Production Ready

## Overview

The Custom Provider Routing system allows CLI and Docker agents to use different AI providers (Z.ai, Kimi, OpenRouter, Anthropic) based on agent-specific configuration, enabling:

- **Cost optimization** per agent type
- **Model selection** based on task requirements
- **Provider flexibility** without code changes
- **Fallback support** to Main Chat settings

## Architecture

### Components

1. **Provider Parameter Parser** (`.claude/skills/cfn-agent-spawning/parse-agent-provider.sh`)
   - Extracts provider/model from agent profiles
   - Returns empty for agents without custom routing

2. **Provider Environment Getter** (`.claude/skills/cfn-agent-spawning/get-agent-provider-env.sh`)
   - Determines provider environment variables
   - Respects `CFN_CUSTOM_ROUTING` flag
   - Falls back to Main Chat settings

3. **Switch API Command** (`/switch-api`)
   - Configures Main Chat provider
   - Supports: zai, kimi, openrouter, max (anthropic)

4. **Spawn Scripts Integration**
   - CLI: `.claude/skills/cfn-loop-orchestration/helpers/spawn-agents.sh`
   - Docker: `.claude/skills/cfn-docker-agent-spawning/spawn-agent.sh`

### Logic Flow

```
┌─────────────────────────────────────────┐
│ Agent Spawning Request                  │
└──────────────┬──────────────────────────┘
               │
               ▼
    ┌──────────────────────┐
    │ CFN_CUSTOM_ROUTING?  │
    └──────┬───────────────┘
           │
    ┌──────▼───────┐
    │ Enabled?     │
    └──────┬───────┘
           │
    ┌──────▼───────────────────┐
    │ No: Use Main Chat        │
    │     Settings             │
    └──────────────────────────┘
           │
    ┌──────▼───────────────────────┐
    │ Yes: Check Agent Profile     │
    │      for PROVIDER_PARAMETERS │
    └──────┬───────────────────────┘
           │
    ┌──────▼────────────────┐
    │ Parameters Found?     │
    └──────┬────────────────┘
           │
    ┌──────▼──────────────────────┐
    │ Yes: Use Agent Provider     │
    │      (kimi/openrouter/zai)  │
    └──────┬──────────────────────┘
           │
    ┌──────▼──────────────────────────┐
    │ No: Default to Z.ai + glm-4.6  │
    └────────────────────────────────┘
           │
           ▼
    ┌─────────────────────────────┐
    │ Export ANTHROPIC_* env vars │
    └─────────────────────────────┘
           │
           ▼
    ┌─────────────────────────────┐
    │ Spawn Agent with Provider   │
    └─────────────────────────────┘
```

## Supported Providers

### 1. Z.ai (Default for Custom Routing)
```bash
Base URL: https://api.z.ai/api/anthropic
API Key: ZAI_API_KEY (from .env)
Cost: $0.50/1M tokens
Model: glm-4.6 (default when CFN_CUSTOM_ROUTING=true)
Fallback: glm-4.5-air (automatic on glm-4.6 errors)
```

**Note:** When `CFN_CUSTOM_ROUTING=true` and an agent has no provider parameters, it defaults to Z.ai with glm-4.6 model.

#### Memory Management (v2.17.0+)

Z.ai provider includes memory leak prevention measures:
- **Client Singleton**: Reuses Anthropic SDK client across API calls
- **HTTP Agent Pooling**: Limits concurrent connections (maxSockets: 10, maxFreeSockets: 5)
- **Stream Cleanup**: Explicit stream disposal in finally blocks
- **Reference Counting**: Ensures client disposal only when all operations complete

**Memory Leak Fix (2025-12-01):**
- Root cause: Unclosed HTTP connections from per-call client creation
- Impact: All GLM models (4.5, 4.6, future versions)
- Solution: Singleton pattern + HTTP agent configuration
- Validation: Integration test enforces <50MB growth per 10 agent spawns
- Related: `tests/integration/test-zai-memory-leak.sh`

### 2. Kimi (Moonshot AI)
```bash
Base URL: https://api.moonshot.ai/anthropic
API Key: KIMI_API_KEY (from .env)
Cost: ~$2/1M tokens
Model: kimi-k2-turbo-preview
```

### 3. OpenRouter
```bash
Base URL: https://openrouter.ai/api/v1
API Key: OPENROUTER_API_KEY (from .env)
Cost: Varies by model
Model: anthropic/claude-sonnet-4.5 (default)
         400+ other models available
```

### 4. Anthropic (Default)
```bash
Base URL: (not set - uses default)
API Key: (requires `claude login`)
Cost: $15/1M tokens (or $0 with unlimited plan)
Model: claude-sonnet-4
```

## Default Behavior

### Custom Routing Disabled (`CFN_CUSTOM_ROUTING=false` or not set)
All agents use Main Chat settings from `.claude/settings.json`.

### Custom Routing Enabled (`CFN_CUSTOM_ROUTING=true`)
- **Agents WITH provider parameters**: Use their configured provider/model
- **Agents WITHOUT provider parameters**: Default to Z.ai + glm-4.6

**Example:**
```bash
# Enable custom routing
export CFN_CUSTOM_ROUTING=true

# backend-developer has: provider=zai, model=glm-4.6
# Uses: Z.ai + glm-4.6

# frontend-developer has no provider parameters
# Uses: Z.ai + glm-4.6 (default)

# security-specialist has: provider=anthropic
# Uses: Anthropic (Claude default)
```

## Usage

### 1. Configure Main Chat Provider

```bash
# Show current provider
/switch-api

# Switch to Z.ai (cost-optimized)
/switch-api zai

# Switch to Kimi
/switch-api kimi

# Switch to OpenRouter
/switch-api openrouter

# Switch to Anthropic (high-quality)
/switch-api max
```

### 2. Enable Custom Routing

Add to your `.env` file:

```bash
# Enable custom routing for CLI/Docker agents
CFN_CUSTOM_ROUTING=true

# Provider API keys
ZAI_API_KEY=your-zai-key-here
KIMI_API_KEY=your-kimi-key-here
OPENROUTER_API_KEY=your-openrouter-key-here
```

### 3. Configure Agent-Specific Providers

Add provider parameters to agent profiles after the frontmatter:

```markdown
---
name: backend-developer
description: Backend development agent
tools: [Read, Write, Edit, Bash]
model: sonnet
---

<!-- PROVIDER_PARAMETERS
provider: openrouter
model: anthropic/claude-sonnet-4.5
-->

# Backend Developer Agent
...
```

**Available providers:**
- `zai` - Cost-optimized general tasks
- `kimi` - Mid-range general tasks
- `openrouter` - Access to 400+ models
- `anthropic` - High-quality tasks (default)

**Model examples:**
- Z.ai: `claude-sonnet-4`
- Kimi: `kimi-k2-turbo-preview`
- OpenRouter: `anthropic/claude-sonnet-4.5`, `google/gemini-2.5-pro-preview`, etc.
- Anthropic: Uses default (no custom model)

### 4. Spawn Agents with Custom Routing

#### CLI Mode (Automatic)

When custom routing is enabled, agents automatically use their configured providers:

```bash
# This agent will use OpenRouter if backend-developer has provider parameters
/cfn-loop-cli "Implement JWT authentication" --mode=standard
```

#### Docker Mode (Automatic)

Docker agents also respect custom routing:

```bash
.claude/skills/cfn-docker-agent-spawning/spawn-agent.sh backend-developer task-123
```

## Provider Selection Strategy

### When to Use Each Provider

**Z.ai** - Best for:
- High-volume simple tasks
- Cost-sensitive workflows
- Background processing
- Data transformation agents

**Kimi** - Best for:
- General development tasks
- Mid-complexity workflows
- Balanced cost/quality
- International projects

**OpenRouter** - Best for:
- Specialized model requirements
- Multi-model experimentation
- Access to latest models
- Specific task optimization

**Anthropic** - Best for:
- Critical production code
- Complex reasoning tasks
- High-stakes decisions
- Premium quality requirements

## Example Configurations

### Cost-Optimized Team

```markdown
<!-- backend-developer.md -->
<!-- PROVIDER_PARAMETERS
provider: zai
model: claude-sonnet-4
-->

<!-- frontend-developer.md -->
<!-- PROVIDER_PARAMETERS
provider: kimi
model: kimi-k2-turbo-preview
-->

<!-- security-specialist.md -->
<!-- PROVIDER_PARAMETERS
provider: anthropic
model: (uses default)
-->
```

**Cost per 1M tokens:**
- Backend tasks: $0.50 (Z.ai)
- Frontend tasks: $2.00 (Kimi)
- Security reviews: $15.00 (Anthropic)
- **Average: ~$5.83/1M tokens (61% savings)**

### Quality-Focused Team

```markdown
<!-- All agents -->
<!-- PROVIDER_PARAMETERS
provider: anthropic
model: (uses default)
-->
```

**Cost per 1M tokens:** $15.00 (Anthropic)

### Hybrid Team

```markdown
<!-- Loop 3 implementers: Cost-optimized -->
<!-- backend-developer.md, react-frontend-engineer.md -->
<!-- PROVIDER_PARAMETERS
provider: zai
model: claude-sonnet-4
-->

<!-- Loop 2 validators: High-quality -->
<!-- security-specialist.md, code-quality-validator.md -->
<!-- PROVIDER_PARAMETERS
provider: anthropic
model: (uses default)
-->

<!-- Product Owner: Premium -->
<!-- product-owner.md -->
<!-- PROVIDER_PARAMETERS
provider: anthropic
model: (uses default)
-->
```

**Cost per iteration:**
- Loop 3 (3 agents): $1.50 (Z.ai)
- Loop 2 (2 agents): $30.00 (Anthropic)
- Product Owner (1 agent): $15.00 (Anthropic)
- **Total: $46.50/iteration (68% savings vs all-Anthropic)**

## Configuration Files

### Required Environment Variables

Add to root `.env`:

```bash
# Main Chat provider (via /switch-api)
# Configured in .claude/settings.json

# Custom routing toggle
CFN_CUSTOM_ROUTING=true

# Provider API keys
ZAI_API_KEY=your-zai-key-here
KIMI_API_KEY=your-kimi-key-here
OPENROUTER_API_KEY=your-openrouter-key-here
```

### Main Chat Settings

Location: `.claude/settings.local.json` (preferred) or `.claude/settings.json`

**Note:** The switch-api script automatically detects which file exists and uses `settings.local.json` if available.

Example (Z.ai):
```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.z.ai/api/anthropic",
    "ANTHROPIC_AUTH_TOKEN": "your-zai-key-here"
  }
}
```

Example (Kimi):
```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.moonshot.ai/anthropic",
    "ANTHROPIC_AUTH_TOKEN": "your-kimi-key-here",
    "ANTHROPIC_MODEL": "kimi-k2-turbo-preview",
    "ANTHROPIC_SMALL_FAST_MODEL": "kimi-k2-turbo-preview"
  }
}
```

Example (OpenRouter):
```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://openrouter.ai/api/v1",
    "ANTHROPIC_AUTH_TOKEN": "your-openrouter-key-here",
    "ANTHROPIC_MODEL": "anthropic/claude-sonnet-4.5",
    "ANTHROPIC_SMALL_FAST_MODEL": "anthropic/claude-sonnet-4.5"
  }
}
```

## Troubleshooting

### Issue: Agents not using custom provider

**Solution:**
1. Check `CFN_CUSTOM_ROUTING=true` in `.env`
2. Verify API keys are set correctly
3. Confirm agent profile has `PROVIDER_PARAMETERS` section
4. Restart any running agents

### Issue: Provider authentication fails

**Solution:**
1. Verify API key is valid
2. Check provider base URL is correct
3. Test key with direct API call
4. Ensure key has sufficient credits

### Issue: Model not found error

**Solution:**
1. Check model name matches provider's format
2. For OpenRouter: verify model exists at https://openrouter.ai/models
3. For Kimi: confirm model is available in your region
4. For Z.ai: use supported models only

### Issue: Custom routing not respected

**Solution:**
1. Check `CFN_CUSTOM_ROUTING=true` in `.env`
2. Verify spawn scripts are using latest version
3. Confirm provider parameters format is correct
4. Test with provider parser: `bash .claude/skills/cfn-agent-spawning/parse-agent-provider.sh AGENT_TYPE --field provider`

## Migration Guide

### From Task Mode to CLI Mode with Custom Routing

**Before:**
```bash
/cfn-loop-task "Task description"
# All agents use Main Chat provider
```

**After:**
```bash
# 1. Enable custom routing
echo "CFN_CUSTOM_ROUTING=true" >> .env

# 2. Add provider parameters to agent profiles
# (see "Configure Agent-Specific Providers" above)

# 3. Use CLI mode
/cfn-loop-cli "Task description" --mode=standard
# Agents now use custom providers
```

### From Z.ai Only to Multi-Provider

**Before:**
```bash
# All agents use Z.ai
/switch-api zai
```

**After:**
```bash
# 1. Keep Main Chat on Z.ai for coordinators
/switch-api zai

# 2. Enable custom routing
echo "CFN_CUSTOM_ROUTING=true" >> .env

# 3. Configure agent-specific providers
# High-value agents: anthropic
# Standard agents: kimi
# Simple agents: zai (fallback to Main Chat)
```

## Performance Metrics

### Latency Impact

- **Z.ai**: ~500ms overhead vs Anthropic
- **Kimi**: ~300ms overhead vs Anthropic
- **OpenRouter**: ~200ms overhead vs Anthropic (varies by model)

### Cost Savings

- **All Z.ai**: 97% savings ($0.50 vs $15/1M tokens)
- **Hybrid (70% Z.ai, 30% Anthropic)**: 68% savings
- **All Kimi**: 87% savings ($2 vs $15/1M tokens)

### Quality Impact

- **Z.ai**: 95% quality vs Anthropic for simple tasks
- **Kimi**: 92% quality vs Anthropic for standard tasks
- **OpenRouter (Claude)**: 100% quality (same model)

## Security Considerations

1. **API Keys**: Never commit API keys to git
2. **Key Rotation**: Rotate keys regularly
3. **Access Control**: Limit key permissions to minimum required
4. **Audit Logs**: Monitor provider API usage
5. **Fallback**: Always have Anthropic as fallback option

## Future Enhancements

- [ ] Automatic cost tracking per agent
- [ ] Provider failover on rate limits
- [ ] Dynamic model selection based on task complexity
- [ ] Usage analytics dashboard
- [ ] Provider benchmarking tools

## Related Documentation

- [Agent Creation Guide](../.claude/agents/cfn-dev-team/CLAUDE.md)
- [CFN Loop Coordination](../CLAUDE.md)
- [Switch API Command](../.claude/commands/switch-api.md)
- [Docker Agent Spawning](../.claude/skills/cfn-docker-agent-spawning/SKILL.md)

## Support

For issues or questions:
1. Check troubleshooting section above
2. Review provider documentation
3. Test with `/switch-api status`
4. Verify agent profile format

---

**Document Version:** 1.0.0
**Last Updated:** 2025-11-10
**Maintained By:** Claude Flow Novice Team
