# Claude Flow Novice v2.16.0 - AI Agent Orchestration Framework

[![npm version](https://badge.fury.io/js/claude-flow-novice.svg)](https://badge.fury.io/js/claude-flow-novice)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![CI Pipeline](https://github.com/yourusername/claude-flow-novice/actions/workflows/ci.yml/badge.svg)](https://github.com/yourusername/claude-flow-novice/actions/workflows/ci.yml)
[![Coverage Report](https://img.shields.io/badge/coverage-dynamic-blue)](docs/CI_CD_PIPELINE.md)

Autonomous self-correcting AI agent orchestration with multi-domain support and intelligent learning capabilities.

## Quick Start

```bash
# 1. Install package (automatically initializes CFN files)
npm install claude-flow-novice

# 2. Activate CFN instructions for CLI agents
cp CFN-CLAUDE.md CLAUDE.md

# 3. Execute CFN Loop for complex features
npx cfn-loop "Implement JWT authentication system" --mode=standard

# Or spawn agents directly
npx cfn-spawn backend-developer --task-id auth-task
```

**Package Details:**
- 573 KB tarball, 2.4 MB unpacked, 303 files
- 23 agents in `.claude/agents/cfn-dev-team/`
- 43 skills in `.claude/skills/cfn-*/`
- 7 hooks in `.claude/hooks/cfn-*`
- 45+ commands in `.claude/commands/cfn/`
- Collision risk: ~0.01% (user custom files preserved)

**Important**: CLI-spawned agents read instructions from `CLAUDE.md` in your project root. Copy `CFN-CLAUDE.md` → `CLAUDE.md` to activate CFN workflows.

## What You Get

**Self-Correcting Workflows** - Automatic iteration until quality gates met
- MVP mode: Gate ≥0.70, Consensus ≥0.80, max 5 iterations
- Standard mode: Gate ≥0.75, Consensus ≥0.90, max 10 iterations
- Enterprise mode: Gate ≥0.85, Consensus ≥0.95, max 15 iterations

**Cost Optimization** - CLI mode with custom routing
- Z.ai routing: $0.50/1M tokens (vs $3-15/1M Anthropic)
- 95-98% savings with CLI mode
- Zero-token coordination via Redis BLPOP

**Intelligent Learning** - SQLite playbook system
- Pattern storage with similarity matching
- Agent performance tracking per domain
- Reduces iterations after repeated similar tasks

**Multi-Domain Support** - Works across software, content, infrastructure, design, research, and data engineering tasks with domain-specific validation

**Zero-Token Coordination** - Redis BLPOP for infinite waiting without API costs

---

## CFN Loop Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       CFN Loop v2.16.0 Flow                     │
└─────────────────────────────────────────────────────────────────┘

User Task Description
    ↓
┌───────────────────────────────────────┐
│ cfn-v3-coordinator                    │
│ • Classify task type                  │
│ • Query playbook for similar tasks    │
│ • Select Loop 3 + Loop 2 agents       │
│ • Load validation templates           │
│ • Estimate complexity & iterations    │
└───────────────┬───────────────────────┘
                ↓
┌───────────────────────────────────────┐
│ CFN Loop Orchestrator                 │
│ (orchestrate.sh)                      │
└───────────────┬───────────────────────┘
                ↓
┌───────────────────────────────────────────────────────────┐
│ ITERATION N                                               │
├───────────────────────────────────────────────────────────┤
│                                                           │
│  ┌─────────────────────────────────────────────┐        │
│  │ Loop 3: Implementation (parallel agents)    │        │
│  │ • backend-developer, coder, devops-engineer │        │
│  │ • Each reports confidence score (0.0-1.0)   │        │
│  └─────────────────┬───────────────────────────┘        │
│                    ↓                                      │
│  ┌─────────────────────────────────────────────┐        │
│  │ Gate Check: Self-Validation                 │        │
│  │ • Check Loop 3 confidence ≥ threshold       │        │
│  │ • MVP: 0.70 | Standard: 0.75 | Enterprise: 0.85 │   │
│  └─────────────────┬───────────────────────────┘        │
│                    ↓                                      │
│         ┌──────────┴──────────┐                         │
│         │ Gate PASS?          │                         │
│         └──┬────────────────┬─┘                         │
│           NO                YES                          │
│            ↓                 ↓                           │
│    ┌───────────┐    ┌───────────────────────────┐     │
│    │ ITERATE   │    │ Deliverable Verification  │     │
│    │ N+1       │    │ • git diff for file changes│     │
│    │ (retry)   │    │ • Force ITERATE if no files│     │
│    └───────────┘    └──────────┬────────────────┘     │
│                                  ↓                       │
│                    ┌─────────────────────────────────┐ │
│                    │ Loop 2: Validation (parallel)   │ │
│                    │ • reviewer, tester, security    │ │
│                    │ • Each reports consensus score  │ │
│                    └──────────┬──────────────────────┘ │
│                                ↓                        │
│                    ┌─────────────────────────────────┐ │
│                    │ Consensus Check                 │ │
│                    │ • Aggregate validator scores    │ │
│                    │ • MVP: 0.80 | Std: 0.90 | Ent: 0.95 │ │
│                    └──────────┬──────────────────────┘ │
│                                ↓                        │
│                    ┌─────────────────────────────────┐ │
│                    │ Loop 4: Product Owner Decision  │ │
│                    │ • PROCEED: Accept deliverables  │ │
│                    │ • ITERATE: Retry with feedback  │ │
│                    │ • ABORT: Stop execution         │ │
│                    └──────────┬──────────────────────┘ │
│                                ↓                        │
│                     ┌──────────┴─────────┐            │
│                     │ Decision?           │            │
│                     └──┬──────────────┬──┘            │
│                       ITERATE        PROCEED           │
│                        ↓                ↓              │
└────────────────────────┼────────────────┼──────────────┘
                         │                │
                 ┌───────┘                └────────┐
                 ↓                                  ↓
          (Next Iteration)                  ┌──────────────┐
          Max iterations:                   │ Loop 5:      │
          • MVP: 5                          │ Retrospective│
          • Standard: 10                    │ • Extract    │
          • Enterprise: 15                  │   patterns   │
                                            │ • Update     │
                                            │   playbook   │
                                            │ • Rank agents│
                                            └──────────────┘
```

### Dual-Mode Execution

**CLI Mode (Default)** - Production cost optimization
- 95-98% cost reduction via Z.ai routing
- Redis context storage for swarm recovery
- Zero-token waiting (BLPOP)
- Scalable to 10+ agents

**Task Mode** - Development & debugging
- Full visibility in Main Chat
- Direct context injection
- Anthropic routing
- Easier troubleshooting

```bash
# CLI mode (default)
/cfn-loop "Task description" --mode=standard

# Task mode (debugging)
/cfn-loop "Task description" --spawn-mode=task
```

### Custom Routing (Z.ai Provider Integration)

**Provider Routing Model:**
- Task() agents → Use Main Chat provider (Anthropic)
- CLI-spawned agents → Use custom routing (Z.ai when enabled)

**Enable Custom Routing:**
```bash
/custom-routing-activate
/switch-api zai  # or max for Claude subscription
```

**Cost Impact:**
- Without custom routing: CLI agents use Anthropic ($3-15/1M tokens)
- With custom routing: CLI agents use Z.ai ($0.50/1M tokens)
- Combined with CLI spawning: 95-98% total savings vs Task tool

---

## Core Skills & Capabilities

### 12 Key Skills (31 More Available)

| Skill | Purpose | Impact |
|-------|---------|--------|
| `cfn-task-classifier` | Detect domain (software/content/research/design/infra/data) | Automatic agent selection |
| `cfn-validation-templates` | Domain-specific quality criteria | Relevant validation gates |
| `cfn-playbook` | SQLite pattern storage with similarity matching | Reduces iterations over time |
| `cfn-complexity-estimator` | Predict iterations from task analysis | Accurate effort estimates |
| `cfn-epic-decomposer` | Break epics into focused sprints | Manageable scope |
| `cfn-intervention-detector` | Identify stuck loops | Automatic recovery |
| `cfn-specialist-injection` | Add domain experts mid-loop | Adaptive team optimization |
| `cfn-playbook-auto-update` | Store successful strategies and patterns | Continuous learning |
| `cfn-redis-coordination` | Zero-token agent communication | Infinite BLPOP waiting |
| `cfn-agent-spawning` | Dynamic agent deployment | Skill-based selection |
| `cfn-loop-orchestration` | Multi-loop workflow execution | Self-correcting validation |
| `cfn-hybrid-routing` | Custom provider routing | 95-98% cost savings |

**Additional Skills**: Redis coordination, agent spawning, CFN loop orchestration, validation processing, hook pipeline, hybrid routing, SQLite memory, transparency middleware, and 23 more. See `.claude/skills/` for complete list.

---

## Agent Library

### Top Agents by Category

**Coordinators (3)**
- `cfn-v3-coordinator` - Main CFN Loop analyzer and configuration generator
- `multi-sprint-coordinator` - Epic-level orchestration across sprints
- `retrospective-analyst` - Automatic learning and pattern extraction

**Implementation (12)**
- `coder` - General-purpose code implementation
- `backend-developer` - Backend services and APIs
- `frontend-dev` - Frontend applications
- `mobile-dev` - React Native and cross-platform
- `rust-developer` - Rust language specialist
- `devops-engineer` - DevOps and deployment
- `database-engineer` - Database design and optimization
- `api-designer` - API architecture and REST design
- `terraform-engineer` - Infrastructure as code
- `kubernetes-architect` - Container orchestration
- `data-engineer` - Data pipelines and ETL
- `pipeline-builder` - CI/CD and automation

**Quality Assurance (8)**
- `reviewer` - Code review and quality validation
- `tester` - Test writing and execution
- `security-specialist` - Security analysis and hardening
- `architect` - System design and architecture
- `performance-benchmarker` - Performance testing
- `accessibility-advocate` - Accessibility compliance
- `security-auditor` - Security auditing
- `compliance-checker` - Standards compliance

**Full agent library (81 agents)**: See `.claude/agents/cfn-dev-team/` for complete list including content creation, design, research, and domain specialists.

---

## CLI & Slash Commands

### CFN Loop Commands

```bash
# Single task execution
/cfn-loop "Implement JWT authentication" --mode=standard

# Quick single-iteration task
/cfn-loop-single "Fix security bug in auth module"

# Large multi-phase epic
/cfn-loop-epic "Build complete authentication system"

# Phase with multiple sprints
/cfn-loop-sprints "Implement payment processing"

# Documentation generation
/cfn-loop-document --sprint=auth --epic=user-mgmt

# Toggle spawning mode
/cfn-mode # Switch between CLI and Task spawning
```

### Binary Commands

```bash
cfn-spawn          # Spawn individual agents
cfn-loop           # Execute CFN Loop workflow
cfn-swarm          # Multi-agent coordination
cfn-portal         # Web monitoring dashboard
cfn-context        # Context management
cfn-metrics        # Performance tracking
cfn-redis          # Redis coordination utilities
```

---

## Redis Coordination

### Zero-Token Waiting Mode

**BLPOP-Based Blocking** - Infinite wait, zero API cost
- Agents block with `redis-cli blpop "queue" 0`
- Coordinator wakes agents with `redis-cli lpush "queue" "signal"`
- <100ms latency wake-up
- Context preserved across iterations

**Swarm Recovery** - Redis persistence enables crash recovery
- Task context stored in Redis with TTL
- Agents resume from last known state
- Critical for long-running CFN Loops

### Coordination Patterns

| Pattern | Use Case | Agent Count |
|---------|----------|-------------|
| **Simple Chain** | Sequential dependencies | 2-3 |
| **Hierarchical Broadcast** | Coordinator → Workers | 4-10 |
| **Mesh Hybrid** | Complex collaboration | 5-15 |

---

## Performance & Cost Metrics

| Metric | Value | Details |
|--------|-------|---------|
| **CLI Mode Cost Savings** | 95-98% | Z.ai routing ($0.50/1M vs Anthropic $3-15/1M) |
| **Zero-Token Coordination** | 100% savings during waits | BLPOP blocking costs nothing |
| **Context Pruning** | 88% token reduction | Summarization at iteration 10 |
| **Average Iterations** | 3.5-4.0 vs 5.2 baseline | 33% improvement with playbook |
| **Context Size (iter 10)** | 15-20 KB vs 120 KB baseline | 88% reduction |
| **Time to Converge** | 30-35 min vs 45 min baseline | 33% faster |
| **Playbook Hit Rate** | 60%+ after learning | Improves with repeated task types |

---

## Developer Experience

### Skills-Based Architecture

43 total skills (20 CFN-specific + 23 core infrastructure) with modular design, clear interfaces, comprehensive documentation, and easy extensibility.

### Hooks & Automation

```bash
# Automatic post-edit validation (39 hooks)
./.claude/hooks/invoke-post-edit.sh "$FILE" --agent-id "$AGENT_ID"
```

### Complexity Analysis Tools

**Built-in Code Quality Monitoring**
- Simple complexity analyzer (~23ms bash script)
- Per-function analyzer with detailed breakdown
- Lizard (professional multi-language support)
- Automated monitoring (triggers on files >200 lines)
- Critical threshold ≥40 auto-spawns refactor agent

```bash
./tools/simple-complexity.sh script.sh
./tools/calculate-complexity.sh script.sh
lizard src/module.ts --CCN 30
```

See `readme/logs-tools.md` for complete documentation.

---

## Security & Quality

### Built-in Security

**ACL System** - 5 levels of access control
1. Private - Agent's own data only
2. Swarm - Shared across team of agents
3. Project - Strategic decisions, audit logs
4. Strategic - Cross-project patterns
5. System - Infrastructure only

**Security Features**
- Secret detection and prevention
- Path traversal protection
- Input sanitization
- Envelope encryption for sensitive data

### Quality Gates

- **Deliverable Verification** - Prevents "consensus on vapor"
- **Multi-Layer Context Injection** - Validation at coordinator → orchestrator → agent layers
- **Agent Completion Protocol** - Mandatory confidence reporting
- **Mandatory Iteration** - Forced retry if zero files created

---

## System Requirements

### Required Dependencies

```json
{
  "node": ">=18.0.0",
  "redis": ">=6.0",
  "sqlite3": ">=5.1.0"
}
```

### Core Dependencies

```json
{
  "@anthropic-ai/sdk": "^0.67.0",
  "redis": "^5.8.3",
  "better-sqlite3": "^12.4.1",
  "commander": "^11.1.0",
  "dotenv": "^17.2.3"
}
```

### Optional

- Z.ai provider account (for cost savings)
- Web portal dependencies (Socket.io for real-time monitoring)

---

## Learning & Adaptation

### Playbook System

**SQLite-Based Pattern Storage**
- Similarity matching for task queries
- Agent performance tracking per domain
- Historical confidence data
- Expected iterations prediction
- 60%+ hit rate after repeated similar tasks

### Continuous Improvement

**Automatic After Each Sprint**
1. Extract patterns from execution logs
2. Identify bottlenecks and failures
3. Rank agent performance
4. Generate improvement recommendations
5. Update playbook with successful strategies

---

## Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:e2e

# CFN Loop end-to-end tests
./tests/cfn-v3/test-e2e-cfn-loop.sh
./tests/cfn-v3/test-coordinator-handoffs.sh
```

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Setup

```bash
# Clone repository
git clone https://github.com/masharratt/claude-flow-novice.git
cd claude-flow-novice

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build
```

### CI/CD Pipeline

Comprehensive GitHub Actions automation with unit testing, integration testing, coverage gates (80%+ lines/statements/functions), security scanning, and deployment workflows. See [CI/CD Pipeline Documentation](docs/CI_CD_PIPELINE.md) for details.

---

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

## Support

- **Documentation**: [Wiki](https://github.com/masharratt/claude-flow-novice/wiki)
- **Issues**: [GitHub Issues](https://github.com/masharratt/claude-flow-novice/issues)
- **Discussions**: [GitHub Discussions](https://github.com/masharratt/claude-flow-novice/discussions)

---

## Roadmap

### v2.17.0 (Q1 2026)
- [ ] Semantic playbook similarity (embeddings)
- [ ] Parallel sprint execution
- [ ] Natural language epic parsing

### v2.18.0 (Q2 2026)
- [ ] Dynamic sprint adjustment (merge/split)
- [ ] Cross-sprint learning
- [ ] Confidence prediction before execution

### v2.19.0 (Q3 2026)
- [ ] Sprint rollback capability
- [ ] Epic-level re-planning
- [ ] Advanced monitoring dashboard

### v3.0.0 (Q4 2026)
- [ ] Breaking changes: New coordination protocol
- [ ] Multi-cloud provider support
- [ ] Enhanced playbook with vector embeddings
