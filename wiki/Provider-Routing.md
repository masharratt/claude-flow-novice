# Provider Routing

Intelligent tiered provider routing system that automatically selects optimal AI providers based on agent profiles, task complexity, and cost optimization goals.

---

## Overview

Provider routing enables cost-effective LLM usage by automatically routing agent requests to the most appropriate provider:

- **Profile-based overrides** - Agent profiles specify preferred providers
- **Tiered fallback** - Automatic failover from free to paid tiers
- **Cost optimization** - Up to 64% reduction in API costs
- **Quality preservation** - Maintains output quality while reducing costs

---

## Architecture

### Routing Priority

Provider selection follows this priority hierarchy:

```
1. Agent Profile Override (highest priority)
   └─> Profile.provider field (zai, anthropic, custom)

2. Tiered Provider Router
   ├─> Tier 1: zai (free, rate limited)
   ├─> Tier 2: deepseek (budget-friendly)
   └─> Tier 3: anthropic (premium, fallback)

3. Default Provider
   └─> anthropic (if no routing configured)
```

### Tier Characteristics

| Tier | Provider | Cost | Rate Limit | Use Cases |
|------|----------|------|------------|-----------|
| **Tier 1** | zai | Free | 60 req/min | Non-critical tasks, research, drafting |
| **Tier 2** | deepseek | Budget | 100 req/min | Standard development, testing |
| **Tier 3** | anthropic | Premium | 1000 req/min | Critical tasks, production code |

---

## Configuration

### Global Routing Setup

Enable tiered routing in `.claude-flow/settings.json`:

```json
{
  "providers": {
    "routing": {
      "enabled": true,
      "strategy": "tiered",
      "tiers": [
        {
          "name": "zai",
          "priority": 1,
          "rateLimit": 60,
          "fallbackOnError": true
        },
        {
          "name": "deepseek",
          "priority": 2,
          "rateLimit": 100,
          "fallbackOnError": true
        },
        {
          "name": "anthropic",
          "priority": 3,
          "rateLimit": 1000,
          "fallbackOnError": false
        }
      ]
    }
  }
}
```

### Agent Profile Overrides

Override routing for specific agents in `.claude/agents/[agent-name].md`:

```markdown
---
name: security-specialist
provider: anthropic
reasoning: Security validation requires highest quality analysis
---

# Security Specialist

Critical security auditing agent that requires premium provider.
```

**Profile Provider Options:**
- `zai` - Force zai (free tier)
- `anthropic` - Force Claude (premium)
- `deepseek` - Force DeepSeek (budget)
- `custom` - Custom provider endpoint
- `default` - Use global routing (tiered)

---

## Usage Examples

### Example 1: Enable Tiered Routing

```bash
# Activate custom routing system
/custom-routing-activate

# Expected output:
# ✅ Custom routing activated
# Priority: Profile → Tier 1 (zai) → Tier 2 (deepseek) → Tier 3 (anthropic)
# Cost savings: ~64% (free tier + budget fallback)
```

**What happens:**
1. All agents without profile overrides use zai (free) first
2. If zai fails/rate-limited, fallback to deepseek (budget)
3. If deepseek fails, fallback to anthropic (premium)

### Example 2: Profile-Based Override

**Agent profile** (`.claude/agents/architect.md`):
```markdown
---
name: system-architect
provider: anthropic
reasoning: Architecture decisions require highest quality reasoning
---
```

**Routing behavior:**
- `system-architect` ALWAYS uses `anthropic` (ignores tiered routing)
- Other agents use tiered routing (zai → deepseek → anthropic)

### Example 3: Mixed Agent Swarm

```javascript
mcp__claude-flow-novice__swarm_init({
  topology: "mesh",
  maxAgents: 4,
  strategy: "balanced"
})

// Agent 1: researcher (no profile override)
// → Uses zai (free tier, Tier 1)
Task("Researcher", "Research JWT libraries", "researcher")

// Agent 2: system-architect (profile: anthropic)
// → Uses anthropic (premium, profile override)
Task("Architect", "Design auth system", "system-architect")

// Agent 3: coder (no profile override)
// → Uses zai (free tier, Tier 1)
Task("Coder", "Implement endpoints", "coder")

// Agent 4: security-specialist (profile: anthropic)
// → Uses anthropic (premium, profile override)
Task("Security Auditor", "Audit auth", "security-specialist")
```

**Cost breakdown:**
- 2 agents on zai (free) = $0
- 2 agents on anthropic (premium) = standard cost
- **Total savings: ~50%** vs all-anthropic approach

### Example 4: Disable Custom Routing

```bash
# Deactivate custom routing (revert to default)
/custom-routing-deactivate

# Expected output:
# ✅ Custom routing deactivated
# Reverting to default provider (anthropic) for all agents
```

---

## Cost Optimization

### Savings Calculation

**Scenario:** 10-agent swarm, 100 requests per agent

**Without routing (all anthropic):**
```
10 agents × 100 requests × $0.015/request = $15.00
```

**With tiered routing:**
```
Tier 1 (zai):      7 agents × 100 × $0.00 = $0.00
Tier 2 (deepseek): 2 agents × 100 × $0.003 = $0.60
Tier 3 (anthropic): 1 agent × 100 × $0.015 = $1.50

Total cost: $2.10
Savings: $12.90 (86% reduction)
```

### Best Practices for Cost Optimization

**Use free tier (zai) for:**
- Research and exploration tasks
- Documentation generation
- Code comments and explanations
- Non-critical bug fixes
- Test case generation

**Use budget tier (deepseek) for:**
- Standard feature development
- Refactoring work
- Integration testing
- API endpoint implementation

**Use premium tier (anthropic) for:**
- Security auditing and validation
- Architecture design decisions
- Critical bug fixes in production
- Complex algorithm implementation
- Final consensus validation

---

## Monitoring and Debugging

### Check Current Routing Status

```bash
# View provider configuration
npx claude-flow-novice status --providers

# Expected output:
# Provider Routing: ENABLED
# Strategy: tiered
# Active Tiers: zai → deepseek → anthropic
# Profile Overrides: 2 agents
```

### View Agent Provider Assignments

```bash
# List agents and their assigned providers
npx claude-flow-novice agents list --show-providers

# Expected output:
# Agent               | Provider   | Source
# --------------------|------------|----------------
# researcher          | zai        | tiered (tier1)
# coder               | zai        | tiered (tier1)
# system-architect    | anthropic  | profile override
# security-specialist | anthropic  | profile override
# tester              | deepseek   | tiered (tier2, zai rate-limited)
```

### Debugging Routing Decisions

Enable routing debug logs:

```bash
# Enable detailed routing logs
export CLAUDE_FLOW_DEBUG_ROUTING=1

# Run agents and check logs
npx claude-flow-novice agents spawn researcher

# Logs show:
# [ROUTING] Agent: researcher
# [ROUTING] Profile provider: undefined
# [ROUTING] Trying Tier 1: zai
# [ROUTING] ✅ zai responded successfully
# [ROUTING] Final provider: zai (tier1)
```

---

## Slash Commands

### `/custom-routing-activate`

**Purpose:** Enable profile-based tiered provider routing

**Usage:**
```bash
/custom-routing-activate
```

**What it does:**
1. Enables tiered routing system
2. Loads agent profile overrides
3. Configures fallback chain: zai → deepseek → anthropic
4. Displays expected cost savings

**Output:**
```
✅ Custom routing activated

Priority System:
1. Agent profile provider overrides (if specified)
2. Tiered routing: zai (free) → deepseek (budget) → anthropic (premium)
3. Default fallback: anthropic

Cost Optimization:
- Estimated savings: ~64% for typical workloads
- Free tier usage: ~70% of requests
- Budget tier usage: ~20% of requests
- Premium tier usage: ~10% of requests

Profile Overrides Loaded: 2
- system-architect → anthropic
- security-specialist → anthropic
```

### `/custom-routing-deactivate`

**Purpose:** Disable custom routing and revert to default provider

**Usage:**
```bash
/custom-routing-deactivate
```

**What it does:**
1. Disables tiered routing
2. Ignores profile overrides
3. Routes all requests to default provider (anthropic)

**Output:**
```
✅ Custom routing deactivated

All agents now use default provider: anthropic

Note: This increases API costs but ensures consistent quality
across all agents regardless of profile settings.
```

---

## Advanced Configuration

### Custom Provider Tiers

Add custom providers to routing tiers:

```json
{
  "providers": {
    "routing": {
      "tiers": [
        {
          "name": "local-llama",
          "priority": 1,
          "endpoint": "http://localhost:11434",
          "rateLimit": null,
          "fallbackOnError": true
        },
        {
          "name": "zai",
          "priority": 2,
          "rateLimit": 60,
          "fallbackOnError": true
        },
        {
          "name": "anthropic",
          "priority": 3,
          "rateLimit": 1000,
          "fallbackOnError": false
        }
      ]
    }
  }
}
```

### Rate Limit Handling

Configure rate limit behavior:

```json
{
  "providers": {
    "routing": {
      "rateLimitHandling": {
        "strategy": "fallback",
        "retryDelay": 1000,
        "maxRetries": 3,
        "fallbackOnRateLimit": true
      }
    }
  }
}
```

### Quality Thresholds

Set minimum quality thresholds to prevent low-quality responses:

```json
{
  "providers": {
    "routing": {
      "qualityThresholds": {
        "minConfidence": 0.75,
        "fallbackOnLowQuality": true,
        "skipTier": ["zai"],
        "forceProvider": "anthropic"
      }
    }
  }
}
```

---

## Related Documentation

- **[Agent Profiles](core-concepts/agents.md)** - Learn about agent configuration
- **[Slash Commands](command-reference/cli-commands.md)** - Complete command reference
- **[Cost Optimization](cost-optimization/enterprise-cost-management.md)** - Advanced cost strategies
- **[Provider Configuration](core-concepts/architecture.md)** - Provider architecture details

---

**Last Updated:** 2025-10-03
**Version:** 1.5.22
