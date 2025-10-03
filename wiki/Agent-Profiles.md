# Agent Profiles

Agent profiles define specialized AI agents with custom capabilities, provider preferences, and behavioral patterns.

---

## Overview

Agent profiles are markdown files that configure agent behavior:

- **Location:** `.claude/agents/[agent-name].md`
- **Format:** Markdown with YAML frontmatter
- **Purpose:** Customize agent specialization, provider routing, and instructions

**Key features:**
- Provider override for cost optimization
- Custom instructions and expertise
- Model preferences (temperature, max tokens)
- Agent-specific memory namespaces

---

## Profile Structure

### Basic Profile Template

```markdown
---
name: agent-name
type: agent-type
provider: zai | anthropic | deepseek | custom
model: sonnet-4.5
temperature: 0.7
maxTokens: 4000
reasoning: "Why this agent needs specific provider"
---

# Agent Name

Agent description and expertise.

## Capabilities

- Capability 1
- Capability 2
- Capability 3

## Instructions

Specific instructions for this agent's behavior.
```

### Profile Fields

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `name` | ✅ | string | Unique agent identifier |
| `type` | ✅ | string | Agent type (coder, tester, reviewer, etc.) |
| `provider` | ❌ | string | Provider override (zai, anthropic, deepseek, custom) |
| `model` | ❌ | string | Model preference (sonnet-4.5, opus-3, etc.) |
| `temperature` | ❌ | number | Creativity level (0.0-1.0) |
| `maxTokens` | ❌ | number | Max response length |
| `reasoning` | ❌ | string | Justification for provider choice |

---

## Provider Field

### Overview

The `provider` field overrides global routing to force specific agents to use designated AI providers.

**Use cases:**
- Force premium provider for critical agents (security, architecture)
- Force free provider for non-critical agents (research, documentation)
- Test specific providers for quality comparison
- Optimize cost by routing agents strategically

### Provider Options

| Provider | Cost | Quality | Rate Limit | Best For |
|----------|------|---------|------------|----------|
| `zai` | Free | Good | 60 req/min | Research, docs, exploration |
| `deepseek` | Budget | Very Good | 100 req/min | Development, testing |
| `anthropic` | Premium | Excellent | 1000 req/min | Security, architecture, critical work |
| `custom` | Varies | Varies | Varies | Self-hosted models, custom endpoints |

### Example: Premium Provider for Security

**File:** `.claude/agents/security-specialist.md`

```markdown
---
name: security-specialist
type: security-specialist
provider: anthropic
model: sonnet-4.5
temperature: 0.3
reasoning: "Security validation requires highest quality analysis and accuracy"
---

# Security Specialist

Performs comprehensive security auditing, vulnerability assessment, and compliance validation.

## Capabilities

- Security vulnerability scanning
- Authentication/authorization review
- Input validation analysis
- Dependency security audits
- Compliance validation (OWASP, PCI-DSS)

## Instructions

Focus on identifying security risks with zero tolerance for false negatives.
Prioritize thoroughness over speed.
```

**Result:** This agent ALWAYS uses `anthropic` (premium), ignoring global tiered routing.

### Example: Free Provider for Research

**File:** `.claude/agents/researcher.md`

```markdown
---
name: researcher
type: researcher
provider: zai
model: glm-4.6
temperature: 0.8
reasoning: "Research tasks are exploratory and don't require premium quality"
---

# Researcher

Researches best practices, libraries, and implementation patterns.

## Capabilities

- Technology research
- Library evaluation
- Best practice identification
- Pattern discovery
- Documentation review

## Instructions

Explore multiple options and provide comprehensive analysis.
Creativity and breadth are more important than precision.
```

**Result:** This agent ALWAYS uses `zai` (free), reducing costs for exploratory work.

### Example: No Provider Override

**File:** `.claude/agents/coder.md`

```markdown
---
name: coder
type: coder
model: sonnet-4.5
temperature: 0.7
---

# Coder

General-purpose implementation agent for feature development.

## Capabilities

- Feature implementation
- Bug fixes
- Code refactoring
- API integration

## Instructions

Write clean, maintainable code following project conventions.
```

**Result:** This agent uses global tiered routing (zai → deepseek → anthropic based on availability).

---

## Profile-Based Routing Examples

### Scenario 1: Cost-Optimized Swarm

**Goal:** Minimize costs while maintaining quality for critical agents

**Agent profiles:**

```markdown
# researcher.md
---
name: researcher
provider: zai
---

# coder.md
---
name: coder
provider: zai
---

# tester.md
---
name: tester
provider: deepseek
---

# security-specialist.md
---
name: security-specialist
provider: anthropic
---

# reviewer.md
---
name: reviewer
provider: anthropic
---
```

**Swarm usage:**
```javascript
mcp__claude-flow-novice__swarm_init({ topology: "mesh", maxAgents: 5 })

Task("Researcher", "Research JWT libraries", "researcher")       // zai (free)
Task("Coder", "Implement auth endpoints", "coder")               // zai (free)
Task("Tester", "Write integration tests", "tester")              // deepseek (budget)
Task("Security Auditor", "Security review", "security-specialist") // anthropic (premium)
Task("Code Reviewer", "Final review", "reviewer")                 // anthropic (premium)
```

**Cost breakdown (1000 requests each):**
```
researcher:   1000 × $0.00  = $0.00    (zai)
coder:        1000 × $0.00  = $0.00    (zai)
tester:       1000 × $0.003 = $3.00    (deepseek)
security:     1000 × $0.015 = $15.00   (anthropic)
reviewer:     1000 × $0.015 = $15.00   (anthropic)

Total: $33.00
Baseline (all anthropic): $75.00
Savings: $42.00 (56% reduction)
```

### Scenario 2: Quality-First Swarm

**Goal:** Ensure consistent premium quality for all agents

**Agent profiles:**

```markdown
# All agents: researcher.md, coder.md, tester.md, etc.
---
provider: anthropic
---
```

**Result:** All agents use `anthropic` regardless of global routing settings.

### Scenario 3: Hybrid Testing

**Goal:** Compare free vs premium provider quality

**Test setup:**

```markdown
# coder-zai.md
---
name: coder-zai
provider: zai
---

# coder-anthropic.md
---
name: coder-anthropic
provider: anthropic
---
```

**Usage:**
```javascript
// Spawn two coders with different providers
Task("Coder (Zai)", "Implement feature X", "coder-zai")
Task("Coder (Anthropic)", "Implement feature X", "coder-anthropic")

// Compare outputs
```

---

## Agent Types Reference

### Core Development Agents

**coder**
```markdown
---
name: coder
type: coder
provider: zai
temperature: 0.7
---
```
- Feature implementation
- Bug fixes
- Code refactoring
- **Recommended provider:** zai or deepseek

**tester**
```markdown
---
name: tester
type: tester
provider: deepseek
temperature: 0.6
---
```
- Unit test writing
- Integration testing
- Test coverage analysis
- **Recommended provider:** deepseek

**reviewer**
```markdown
---
name: reviewer
type: reviewer
provider: anthropic
temperature: 0.5
---
```
- Code review
- Quality validation
- Architecture review
- **Recommended provider:** anthropic

### Specialized Agents

**security-specialist**
```markdown
---
name: security-specialist
type: security-specialist
provider: anthropic
temperature: 0.3
reasoning: "Security requires highest accuracy and zero tolerance for errors"
---
```
- Security auditing
- Vulnerability assessment
- Compliance validation
- **Required provider:** anthropic (critical work)

**system-architect**
```markdown
---
name: system-architect
type: system-architect
provider: anthropic
temperature: 0.6
reasoning: "Architecture decisions have long-term impact and require best reasoning"
---
```
- System design
- Architecture decisions
- Scalability planning
- **Required provider:** anthropic (strategic work)

**researcher**
```markdown
---
name: researcher
type: researcher
provider: zai
temperature: 0.8
---
```
- Technology research
- Best practice identification
- Library evaluation
- **Recommended provider:** zai (exploratory work)

**backend-dev**
```markdown
---
name: backend-dev
type: backend-dev
provider: deepseek
temperature: 0.7
---
```
- API development
- Database operations
- Server-side logic
- **Recommended provider:** deepseek

**devops-engineer**
```markdown
---
name: devops-engineer
type: devops-engineer
provider: deepseek
temperature: 0.6
---
```
- Infrastructure setup
- CI/CD configuration
- Deployment automation
- **Recommended provider:** deepseek

---

## Best Practices

### Provider Selection Guidelines

**Use `zai` (free) for:**
- ✅ Research and exploration
- ✅ Documentation generation
- ✅ Code comments and explanations
- ✅ Non-critical bug fixes
- ✅ Draft implementations
- ✅ Test case brainstorming

**Use `deepseek` (budget) for:**
- ✅ Feature implementation
- ✅ Refactoring
- ✅ Integration testing
- ✅ API endpoint development
- ✅ Standard code reviews
- ✅ Database operations

**Use `anthropic` (premium) for:**
- ✅ Security auditing
- ✅ Architecture design
- ✅ Production bug fixes
- ✅ Critical algorithm implementation
- ✅ Final consensus validation
- ✅ Compliance review

### Profile Naming Conventions

**Agent profile filenames:**
```
.claude/agents/
├── coder.md
├── tester.md
├── reviewer.md
├── security-specialist.md
├── system-architect.md
├── researcher.md
├── backend-dev.md
└── devops-engineer.md
```

**Naming rules:**
- Use lowercase with hyphens
- Match agent type field
- Descriptive and unique
- No spaces or special characters

### Temperature Guidelines

| Temperature | Use Case | Agent Types |
|-------------|----------|-------------|
| **0.0-0.3** | Deterministic, factual | security-specialist, compliance-auditor |
| **0.4-0.6** | Balanced, consistent | reviewer, tester, backend-dev |
| **0.7-0.9** | Creative, exploratory | researcher, coder, architect |
| **1.0** | Maximum creativity | brainstormer, innovator |

---

## Advanced Configuration

### Custom Provider Endpoints

**Example: Local LLaMA model**

```markdown
---
name: local-coder
type: coder
provider: custom
providerConfig:
  endpoint: "http://localhost:11434/api/generate"
  model: "llama3.2:70b"
  apiKey: ""
---
```

### Multi-Model Profiles

**Example: Different models for different tasks**

```markdown
---
name: adaptive-coder
type: coder
provider: anthropic
modelConfig:
  default: "sonnet-4.5"
  complex: "opus-3"
  simple: "haiku-3"
---
```

### Memory Namespace Configuration

**Example: Isolated memory per agent**

```markdown
---
name: security-specialist
provider: anthropic
memoryNamespace: "security/audits"
memoryRetention: 30
---
```

---

## Monitoring Agent Providers

### Check Agent Provider Assignments

```bash
# List agents with provider information
npx claude-flow-novice agents list --show-providers

# Expected output:
# Agent               | Type                | Provider   | Source
# --------------------|---------------------|------------|------------------
# researcher          | researcher          | zai        | profile override
# coder               | coder               | zai        | tiered (tier1)
# tester              | tester              | deepseek   | profile override
# security-specialist | security-specialist | anthropic  | profile override
# reviewer            | reviewer            | anthropic  | profile override
```

### Debug Provider Selection

```bash
# Enable routing debug logs
export CLAUDE_FLOW_DEBUG_ROUTING=1

# Spawn agent and check logs
npx claude-flow-novice agents spawn security-specialist

# Logs show:
# [ROUTING] Loading profile: .claude/agents/security-specialist.md
# [ROUTING] Profile provider: anthropic
# [ROUTING] Skipping tiered routing (profile override)
# [ROUTING] Final provider: anthropic (profile)
```

---

## Related Documentation

- **[Provider Routing](Provider-Routing.md)** - Provider routing architecture
- **[Cost Optimization](Cost-Optimization.md)** - Cost reduction strategies
- **[Agent Coordination](Agent-Coordination.md)** - Agent coordination patterns
- **[Slash Commands](Slash-Commands.md)** - Routing activation commands
- **[Agent System Architecture](core-concepts/agents.md)** - Complete agent system

---

**Last Updated:** 2025-10-03
**Version:** 1.5.22
