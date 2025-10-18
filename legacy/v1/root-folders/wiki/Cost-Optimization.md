# Cost Optimization

Strategies and techniques for reducing AI API costs while maintaining output quality through intelligent provider routing and resource management.

---

## Overview

Claude Flow's cost optimization framework achieves significant savings through:

- **Tiered provider routing** - Free/budget tiers for non-critical work
- **Profile-based overrides** - Premium providers only where needed
- **Rate limit management** - Automatic failover to prevent API throttling
- **Usage monitoring** - Real-time cost tracking and alerts

**Typical Savings:** 60-85% reduction in API costs for mixed workloads

---

## Cost Model

### Provider Pricing Comparison

| Provider | Cost per 1K Tokens | Monthly Free Tier | Rate Limit | Quality |
|----------|-------------------|-------------------|------------|---------|
| **zai** | $0.00 | Unlimited | 60 req/min | Good |
| **deepseek** | $0.003 | None | 100 req/min | Very Good |
| **anthropic** | $0.015 | None | 1000 req/min | Excellent |

### Real-World Cost Examples

#### Example 1: Small Project (10 agents, 1000 requests)

**Without routing (all anthropic):**
```
10 agents × 1000 requests × $0.015 = $150.00/month
```

**With tiered routing:**
```
Tier 1 (zai):      7 agents × 1000 × $0.00  = $0.00
Tier 2 (deepseek): 2 agents × 1000 × $0.003 = $6.00
Tier 3 (anthropic): 1 agent × 1000 × $0.015 = $15.00

Total: $21.00/month
Savings: $129.00 (86% reduction)
```

#### Example 2: Medium Project (20 agents, 5000 requests)

**Without routing:**
```
20 agents × 5000 × $0.015 = $1,500.00/month
```

**With tiered routing:**
```
Tier 1 (zai):      14 agents × 5000 × $0.00  = $0.00
Tier 2 (deepseek):  4 agents × 5000 × $0.003 = $60.00
Tier 3 (anthropic):  2 agents × 5000 × $0.015 = $150.00

Total: $210.00/month
Savings: $1,290.00 (86% reduction)
```

#### Example 3: Enterprise Project (100 agents, 10000 requests)

**Without routing:**
```
100 agents × 10000 × $0.015 = $15,000.00/month
```

**With tiered routing:**
```
Tier 1 (zai):      70 agents × 10000 × $0.00  = $0.00
Tier 2 (deepseek): 20 agents × 10000 × $0.003 = $600.00
Tier 3 (anthropic): 10 agents × 10000 × $0.015 = $1,500.00

Total: $2,100.00/month
Savings: $12,900.00 (86% reduction)
```

---

## Optimization Strategies

### Strategy 1: Free Tier Maximization

**Goal:** Route as many non-critical tasks to zai (free) as possible

**Best for:**
- Research and exploration
- Documentation generation
- Code comments
- Test case brainstorming
- Non-critical bug fixes

**Configuration:**
```json
{
  "providers": {
    "routing": {
      "tiers": [
        {
          "name": "zai",
          "priority": 1,
          "maxUsage": "unlimited",
          "taskTypes": ["research", "documentation", "exploration"]
        }
      ]
    }
  }
}
```

**Expected savings:** 70-80% of requests at $0 cost

### Strategy 2: Budget Tier for Standard Work

**Goal:** Use deepseek for routine development tasks

**Best for:**
- Feature implementation
- Refactoring
- Integration testing
- API endpoint development
- Standard code reviews

**Configuration:**
```json
{
  "providers": {
    "routing": {
      "tiers": [
        {
          "name": "zai",
          "priority": 1
        },
        {
          "name": "deepseek",
          "priority": 2,
          "taskTypes": ["implementation", "refactoring", "testing"]
        }
      ]
    }
  }
}
```

**Expected savings:** 15-20% of requests at budget pricing (80% cheaper than premium)

### Strategy 3: Premium Tier Only for Critical Work

**Goal:** Reserve anthropic for high-stakes tasks requiring best quality

**Best for:**
- Security auditing
- Architecture decisions
- Production bug fixes
- Complex algorithms
- Final consensus validation

**Agent profile override:**
```markdown
---
name: security-specialist
provider: anthropic
reasoning: Security validation requires highest quality analysis
---
```

**Expected savings:** Only 5-10% of requests at premium pricing

---

## Cost Optimization Workflow

### Step 1: Enable Tiered Routing

```bash
# Activate custom routing system
/custom-routing-activate
```

**What happens:**
- Free tier (zai) becomes default for all agents
- Budget tier (deepseek) becomes first fallback
- Premium tier (anthropic) becomes last fallback

### Step 2: Identify Critical Agents

Review your agent roster and identify which agents MUST use premium quality:

**Typical critical agents:**
- `security-specialist` - Security validation
- `system-architect` - Architecture design
- `compliance-auditor` - Regulatory compliance
- `production-debugger` - Production incident response

### Step 3: Add Profile Overrides

Create `.claude/agents/[agent-name].md` for critical agents:

**Example: security-specialist.md**
```markdown
---
name: security-specialist
provider: anthropic
reasoning: Security validation requires highest quality analysis
---

# Security Specialist

Performs security auditing, vulnerability assessment, and compliance validation.
```

### Step 4: Monitor Cost Savings

```bash
# Check cost metrics
npx claude-flow-novice metrics --cost-analysis

# Expected output:
# Cost Analysis (Last 30 Days)
# Total Requests: 10,000
# Tier 1 (zai):      7,000 requests × $0.00  = $0.00
# Tier 2 (deepseek): 2,000 requests × $0.003 = $6.00
# Tier 3 (anthropic): 1,000 requests × $0.015 = $15.00
#
# Total Cost: $21.00
# Baseline Cost (all anthropic): $150.00
# Savings: $129.00 (86%)
```

### Step 5: Optimize Further

Based on usage patterns, adjust tier assignments:

**If free tier is rate-limited frequently:**
```json
{
  "providers": {
    "routing": {
      "tiers": [
        {
          "name": "zai",
          "rateLimit": 60,
          "maxConcurrent": 10,
          "queueOnLimit": true
        }
      ]
    }
  }
}
```

**If quality issues on free tier:**
```json
{
  "providers": {
    "routing": {
      "qualityThresholds": {
        "minConfidence": 0.75,
        "skipTier": ["zai"],
        "fallbackToTier": "deepseek"
      }
    }
  }
}
```

---

## Cost Calculation Examples

### Scenario 1: Research-Heavy Project

**Workload:**
- 10 researchers (non-critical)
- 2 architects (critical)
- 2 security specialists (critical)

**Routing:**
```
10 researchers → zai (free)
2 architects → anthropic (profile override)
2 security → anthropic (profile override)
```

**Monthly cost (5000 requests per agent):**
```
10 × 5000 × $0.00  = $0.00    (researchers on zai)
2 × 5000 × $0.015 = $150.00  (architects on anthropic)
2 × 5000 × $0.015 = $150.00  (security on anthropic)

Total: $300.00
Baseline (all anthropic): $1,050.00
Savings: $750.00 (71% reduction)
```

### Scenario 2: Development-Heavy Project

**Workload:**
- 15 coders (standard work)
- 5 testers (standard work)
- 2 reviewers (critical)

**Routing:**
```
15 coders → zai (free, fallback to deepseek)
5 testers → deepseek (budget tier)
2 reviewers → anthropic (profile override)
```

**Monthly cost (10,000 requests per agent):**
```
15 × 10000 × $0.00  = $0.00     (coders on zai)
5 × 10000 × $0.003 = $150.00   (testers on deepseek)
2 × 10000 × $0.015 = $300.00   (reviewers on anthropic)

Total: $450.00
Baseline (all anthropic): $3,300.00
Savings: $2,850.00 (86% reduction)
```

### Scenario 3: Security-Focused Project

**Workload:**
- 5 developers (standard work)
- 5 security specialists (critical)
- 2 compliance auditors (critical)

**Routing:**
```
5 developers → zai (free)
5 security → anthropic (profile override)
2 compliance → anthropic (profile override)
```

**Monthly cost (8000 requests per agent):**
```
5 × 8000 × $0.00  = $0.00     (developers on zai)
5 × 8000 × $0.015 = $600.00   (security on anthropic)
2 × 8000 × $0.015 = $240.00   (compliance on anthropic)

Total: $840.00
Baseline (all anthropic): $1,440.00
Savings: $600.00 (42% reduction)
```

**Note:** Security-focused projects have lower savings due to higher proportion of critical work requiring premium tier.

---

## Best Practices

### When to Enable Routing

**Enable tiered routing when:**
- ✅ Project has mixed criticality levels
- ✅ Budget constraints exist
- ✅ Non-critical tasks (research, docs) represent >50% of workload
- ✅ Quality tolerance allows good (not excellent) for routine work

**Disable tiered routing when:**
- ❌ All tasks are mission-critical
- ❌ Quality must be consistent across all agents
- ❌ Budget is not a constraint
- ❌ Debugging inconsistent outputs from different providers

### Agent Assignment Guidelines

**Free tier (zai):**
- `researcher` - Research tasks
- `documenter` - Documentation
- `explainer` - Code explanations
- `commenter` - Adding comments
- `drafter` - Initial drafts

**Budget tier (deepseek):**
- `coder` - Standard implementation
- `tester` - Test writing
- `refactorer` - Code refactoring
- `integrator` - API integration

**Premium tier (anthropic):**
- `security-specialist` - Security audits
- `system-architect` - Architecture
- `compliance-auditor` - Compliance
- `production-debugger` - Critical bugs
- `reviewer` - Final code review

### Quality vs Cost Tradeoffs

| Quality Requirement | Recommended Tier | Cost | Notes |
|-------------------|------------------|------|-------|
| **Excellent** (critical) | anthropic | $$$ | Security, architecture, production |
| **Very Good** (standard) | deepseek | $$ | Development, testing, integration |
| **Good** (non-critical) | zai | Free | Research, docs, exploration |

---

## Monitoring and Alerts

### Real-Time Cost Tracking

Enable cost monitoring dashboard:

```bash
# View real-time cost metrics
npx claude-flow-novice dashboard --cost-tracking

# Expected output:
# Cost Dashboard (Live)
# Current Hour: $2.40
# Today: $45.80
# This Week: $210.30
# This Month: $840.00
#
# Budget: $1,000.00
# Remaining: $160.00 (16%)
# Alert: ⚠️  Approaching monthly budget limit
```

### Budget Alerts

Configure budget alerts in `.claude-flow/settings.json`:

```json
{
  "costManagement": {
    "monthlyBudget": 1000.00,
    "alerts": [
      {
        "threshold": 0.50,
        "action": "notify",
        "message": "50% of monthly budget consumed"
      },
      {
        "threshold": 0.80,
        "action": "warn",
        "message": "80% of monthly budget consumed"
      },
      {
        "threshold": 0.95,
        "action": "restrict",
        "message": "95% of budget consumed, restricting to free tier only"
      }
    ]
  }
}
```

### Usage Reports

Generate monthly cost reports:

```bash
# Generate cost report
npx claude-flow-novice reports --cost-analysis --month 2025-10

# Expected output saved to:
# reports/cost-analysis-2025-10.json
```

**Report includes:**
- Total requests by tier
- Cost per agent
- Cost per project
- Savings vs baseline
- Optimization recommendations

---

## Related Documentation

- **[Provider Routing](Provider-Routing.md)** - Routing architecture and configuration
- **[Agent Profiles](core-concepts/agents.md)** - Agent configuration and overrides
- **[Slash Commands](command-reference/cli-commands.md)** - Routing activation commands
- **[Enterprise Cost Management](cost-optimization/enterprise-cost-management.md)** - Advanced strategies

---

**Last Updated:** 2025-10-03
**Version:** 1.5.22
