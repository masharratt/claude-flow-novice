# Imported Agents Collection

**Source:** [610ClaudeSubagents](https://github.com/ChrisRoyse/610ClaudeSubagents)
**Count:** 610 specialized AI agent prompts
**Format:** Markdown files with YAML frontmatter
**Import Date:** 2025-10-17

## Overview

This directory contains 610+ specialized AI agent prompts imported from the 610ClaudeSubagents repository. Each agent is a standalone markdown file with detailed expertise in specific domains.

## Agent Format

All imported agents follow this structure:

```yaml
---
name: agent-name
description: Expert description with specific capabilities
tools: Read, Write, Edit, MultiEdit, Grep, Glob, Bash
---

Principle 0: Radical Candor—Truth Above All
[Truthfulness principle...]

[Detailed agent expertise and capabilities...]
```

## Key Features

### ✅ Compatibility
- **Format:** Compatible with claude-flow-novice agent system
- **Tools:** Standard tool set (Read, Write, Edit, MultiEdit, Grep, Glob, Bash)
- **Frontmatter:** YAML frontmatter with name, description, tools
- **Content:** Extensive domain-specific expertise and examples

### 🎯 Principle 0: Radical Candor
All agents include a "Truth Above All" principle that enforces:
- Absolute truthfulness in responses
- No simulated or fake functionality
- Honest limitations and constraints
- Reality-based solutions only

## Agent Categories

### 1. Development & Engineering (150+ agents)
- Backend development
- Frontend frameworks (React, Angular, Vue)
- Mobile development
- DevOps and infrastructure
- API design and integration
- Database specialists
- Testing and QA

**Example agents:**
- `backend-api-code-writer-agent.md`
- `react-19-specialist.md`
- `typescript-specialist.md`
- `kubernetes-orchestration-specialist.md`

### 2. AI/ML & Automation (70+ agents)
- Machine learning specialists
- Deep learning frameworks
- Neural network development
- MLOps and deployment
- AI model optimization
- Automated analytics

**Example agents:**
- `ai-ml-engineering-specialist.md`
- `tensorflow-machine-learning-specialist.md`
- `pytorch-deep-learning-specialist.md`

### 3. Business & Operations (90+ agents)
- Business strategy
- Growth optimization
- Revenue management
- Customer experience
- Market analysis
- Competitive intelligence

**Example agents:**
- `business-growth-scaling-agent.md`
- `revenue-growth-manager.md`
- `customer-journey-orchestration-agent.md`

### 4. Security & Compliance (60+ agents)
- Cybersecurity
- Threat analysis
- Compliance and auditing
- Data privacy (GDPR, CCPA)
- Zero-trust architecture
- Security testing

**Example agents:**
- `cybersecurity-threat-prediction-agent.md`
- `zero-trust-enforcer.md`
- `data-privacy-gdpr-compliance-agent.md`

### 5. Data & Analytics (50+ agents)
- Business intelligence
- Data engineering
- Predictive analytics
- Real-time analytics
- ETL/ELT pipelines
- Time series forecasting

**Example agents:**
- `analytics-insights-engineer.md`
- `real-time-prediction-engine.md`
- `time-series-forecasting.md`

### 6. Personal & Professional Development (80+ agents)
- Career planning
- Leadership development
- Emotional intelligence
- Productivity optimization
- Learning strategies
- Work-life balance

**Example agents:**
- `career-planning-strategy-agent.md`
- `emotional-intelligence-master.md`
- `leadership-development.md`

### 7. Payment & Financial Integration (40+ agents)
- Payment gateway integration
- Buy-now-pay-later systems
- Financial transaction processing
- PCI compliance
- Payment security

**Example agents:**
- `afterpay-bnpl-integration-agent.md`
- `stripe-payment-integration-agent.md`
- `paypal-integration-agent.md`

### 8. Industry-Specific (60+ agents)
- Healthcare
- Finance
- E-commerce
- Education
- Legal
- Manufacturing

## Usage Examples

### Basic Usage
```bash
# List all agents
ls agents/*.md

# Find agents by keyword
grep -l "react" agents/*.md

# Search agent descriptions
grep -h "description:" agents/*.md
```

### With Claude Flow
```bash
# Use an agent in a task
/task "Use acceptance-test-specialist to create UAT plan"

# Spawn agent via CLI
node src/cli/hybrid-routing/spawn-workers.js \
  "Create REST API" \
  --agents=backend-api-code-writer-agent
```

## Comparison: Imported vs Native Agents

| Feature | Imported (610ClaudeSubagents) | Native (.claude/agents) |
|---------|-------------------------------|-------------------------|
| **Count** | 610 agents | 93 agents |
| **Format** | Simple YAML frontmatter | Extended YAML with metadata |
| **Tools** | Standard 7 tools | Extended toolset + TodoWrite |
| **Model** | Not specified | Haiku/Sonnet specified |
| **Type** | Not categorized | Specialist/Coordinator/Reviewer |
| **Capabilities** | Not structured | Structured capability lists |
| **Validation** | None | Validation hooks configured |
| **Lifecycle** | Not defined | Pre/post task hooks |
| **Focus** | Broad domain coverage | Engineering/dev-focused |
| **Depth** | Very detailed expertise | Optimized for task agents |

## Differences from Native Agents

### Imported Agents
- ✅ **More comprehensive** (610 vs 93)
- ✅ **Broader domains** (business, personal, security)
- ✅ **Very detailed** expertise and examples
- ✅ **"Principle 0"** truthfulness enforcement
- ❌ No model specification
- ❌ No validation hooks
- ❌ No lifecycle management
- ❌ No capability categorization

### Native Agents (.claude/agents)
- ✅ **Optimized** for claude-flow-novice coordination
- ✅ **Model-aware** (haiku vs sonnet)
- ✅ **Validation** built-in
- ✅ **Lifecycle hooks** (pre/post task)
- ✅ **Structured** capabilities and types
- ❌ Smaller collection (93)
- ❌ Engineering-focused only

## Integration Strategy

### Option 1: Use As-Is
```bash
# Reference imported agents directly
/task "Use ai-ml-engineering-specialist for ML pipeline"
```

### Option 2: Hybrid Approach
```bash
# Use native agents for coordination
# Use imported agents for specialized expertise
coordinator-hybrid → spawns → ai-ml-engineering-specialist
```

### Option 3: Migrate Selected Agents
Convert high-value imported agents to native format:
```yaml
---
name: ai-ml-engineering-specialist
description: |
  Ultra-specialized AI/ML engineering expert...
tools: [Read, Write, Edit, MultiEdit, Bash, Glob, Grep, TodoWrite]
model: sonnet  # Added
type: specialist  # Added
capabilities:  # Added
  - machine-learning
  - deep-learning
  - mlops
validation_hooks:  # Added
  - agent-template-validator
---
```

## Recommendations

### For General Use
✅ Use **imported agents** for:
- Business strategy and operations
- Security and compliance
- Personal development
- Payment integrations
- Industry-specific tasks

✅ Use **native agents** (.claude/agents) for:
- Core development workflows
- Multi-agent coordination
- CFN Loop consensus building
- Production engineering tasks

### For Power Users
1. **Browse** agents/ for specialized expertise
2. **Reference** by filename in Task tool prompts
3. **Migrate** frequently-used agents to native format
4. **Extend** with claude-flow-novice metadata

## File Locations

```
claude-flow-novice/
├── agents/                              # 610 imported agents (categorized)
│   ├── development-engineering/         # 156 agents - Backend, frontend, DevOps
│   │   └── INDEX.md                     # Category index
│   ├── ai-ml-automation/                # 63 agents - ML, neural networks, MLOps
│   │   └── INDEX.md
│   ├── business-operations/             # 62 agents - Strategy, growth, revenue
│   │   └── INDEX.md
│   ├── industry-specific/               # 225 agents - Healthcare, finance, etc.
│   │   └── INDEX.md
│   ├── data-analytics/                  # 35 agents - BI, ETL, forecasting
│   │   └── INDEX.md
│   ├── personal-professional/           # 33 agents - Career, leadership
│   │   └── INDEX.md
│   ├── security-compliance/             # 29 agents - Security, privacy, auditing
│   │   └── INDEX.md
│   ├── payment-financial/               # 12 agents - Payment gateways, BNPL
│   │   └── INDEX.md
│   ├── CATEGORIZATION_SUMMARY.md        # Category breakdown with statistics
│   ├── IMPORTED_AGENTS_README.md        # This file
│   ├── README.md                        # Original 610ClaudeSubagents README
│   └── CLAUDE.md                        # Agent usage guide
│
└── .claude/agents/                      # 93 native agents
    ├── cfn-loop/                        # CFN Loop coordinators
    ├── core-agents/                     # Base agents (coder, tester, etc)
    ├── consensus/                       # Consensus builders
    ├── development/                     # Development specialists
    ├── security/                        # Security specialists
    └── ...
```

## Discovery & Search

### Browse by Category
```bash
# List all categories
ls agents/

# View category index
cat agents/development-engineering/INDEX.md

# List agents in category
ls agents/ai-ml-automation/

# View category summary
cat agents/CATEGORIZATION_SUMMARY.md
```

### Find Agents by Category
```bash
# Development agents
ls agents/development-engineering/ | wc -l
# Output: 156 agents

# Business agents
ls agents/business-operations/ | wc -l
# Output: 62 agents

# Security agents
ls agents/security-compliance/ | wc -l
# Output: 29 agents
```

### Search by Capability
```bash
# Find React specialists
find agents -name "*react*"
# or
grep -l -i "react" agents/*/*.md

# Find payment integration agents
ls agents/payment-financial/*payment*.md

# Find ML/AI agents
ls agents/ai-ml-automation/
```

### Full-Text Search
```bash
# Search all agents
grep -r "keyword" agents/

# Search specific category
grep -r "keyword" agents/development-engineering/

# Search frontmatter only
grep -h "description:" agents/*/*.md | grep -i "keyword"
```

## Version History

- **v1.0** (2025-10-17): Initial import of 610 agents from 610ClaudeSubagents
- Source repository: https://github.com/ChrisRoyse/610ClaudeSubagents
- License: MIT (per source repository)

## Next Steps

1. ✅ **Browse** the agents directory to discover available expertise
2. ✅ **Test** imported agents with Task tool or spawn-workers.js
3. ⚠️ **Migrate** high-value agents to native format if needed
4. ⚠️ **Update** agent discovery/registry to include these agents
5. ⚠️ **Document** integration patterns in CLAUDE.md

## Credits

Original agents created by Chris Royse and contributors:
- Repository: https://github.com/ChrisRoyse/610ClaudeSubagents
- License: MIT
- Import performed: 2025-10-17

---

**Note:** These agents complement but do not replace the native `.claude/agents/` system. Use imported agents for specialized expertise and native agents for core development workflows.
