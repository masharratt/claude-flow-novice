# Claude Flow Novice v2.9.1 Documentation

**Version:** 2.9.1 (Skills-First Architecture)
**Last Updated:** 2025-10-25

**Package Metrics**:
- 2.4 MB unpacked
- 303 files
- Namespace-isolated installation

## Overview

Claude Flow Novice is a production-ready AI agent orchestration framework built on a skills-first architecture with Redis-based coordination, zero-token waiting mechanisms, and multi-loop consensus validation (CFN Loop).

## Quick Start

```bash
# Install and initialize
npm install claude-flow-novice
npx cfn-init

# Initialize a swarm with skills
npx claude-flow-novice swarm "Task Description" \
  --skills=redis-coordination,agent-spawning \
  --strategy development

# Execute CFN Loop with orchestration
./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh \
  --task-id "unique-task-id" \
  --mode standard \
  --loop3-agents "researcher,backend-dev" \
  --loop2-agents "reviewer,tester"
```

## Documentation Index

### Core Concepts
- **[Skills System](log-skills.md)** - Modular, reusable agent capabilities
- **[CFN Loop](cfn-loop-modes.md)** - Three-loop consensus validation framework
- **[Redis Coordination](logs-cli-redis.md)** - Zero-token agent coordination

### User Guides
- **[Slash Commands](logs-slash-commands.md)** - CLI command reference
- **[Hooks System](logs-hooks.md)** - Event-driven automation
- **[Post-Edit Pipeline](logs-post-edit-pipeline.md)** - Automatic validation after edits

### Technical Reference
- **[API Documentation](logs-api.md)** - JavaScript/TypeScript API
- **[Features Matrix](logs-features.md)** - Feature availability by mode
- **[Functions Reference](logs-functions.md)** - Core function library

### Workflows
- **[CFN Loop Flow](cfn-loop-flow-diagram.md)** - Visual workflow diagrams
- **[CFN Loop Cheatsheet](CFN_LOOP_CHEATSHEET.md)** - Quick reference guide

### Maintenance
- **[Changelog](CHANGELOG.md)** - Version history and breaking changes
- **[Decision Log](log-descions.md)** - Architecture decision records
- **[Component Status](COMPONENT_NPM_STATUS.md)** - Dependency health

### Legacy
- **[Deprecated MCP Logs](deprecated-logs-mcp.md)** - Historical MCP implementation
- **[v1 Documentation](../legacy/readme-v1/)** - Previous documentation version

## Key Features (v2)

### Skills-First Architecture
- **Modular Skills**: Independently maintainable, testable capabilities
- **Explicit Dependencies**: Redis pub/sub coordination, no implicit coupling
- **Thin Orchestration**: Main chat delegates to skills, minimal coordination logic
- **Namespace-Isolated Installation**: ~0.01% collision risk
- **Preserves User Custom Agents/Skills/Hooks**

### Zero-Token Coordination
- **Redis BLPOP**: Agents wait without API calls (0 tokens while idle)
- **Instant Wake-Up**: <100ms latency for agent activation
- **Scalable**: 23 agents in cfn-dev-team

### CFN Loop (Consensus Framework)
- **Loop 3**: Implementation agents (coders, researchers)
- **Loop 2**: Validation agents (reviewers, testers)
- **Loop 1**: Product owner (strategic oversight)
- **Adaptive Modes**: MVP (fast), Standard (balanced), Enterprise (rigorous)

### Cost Optimization
- **CLI Spawning Mode**: 95-98% cost savings vs Task tool
- **Configurable**: `COST_SAVINGS_MODE=yes` in CLAUDE.md
- **Safe Default**: Task tool spawning when disabled

## Architecture Principles

1. **Skills-Based Coordination**: All agent communication via explicit Redis dependencies
2. **Multi-Layer Enforcement**: Coordination primitives at technical, skill, agent, and system layers
3. **Centralized Orchestration**: Keep orchestration in dedicated skills, not distributed across components
4. **Post-Edit Validation**: All Edit/Write operations trigger validation hooks
5. **Parallel Agent Spawning**: All Task-based coordinators require parallel spawning (single message, multiple Task calls)

## Migration Notes

**v1 → v2 Changes:**
- Deprecated: Implicit agent coordination, distributed orchestration logic
- Added: Skills system, Redis coordination, zero-token waiting, orchestrate-cfn-loop.sh
- Breaking: CFN Loop now requires orchestrator (no manual Task spawning)

See [CHANGELOG.md](CHANGELOG.md) for full migration guide.

## Support

- **Documentation Issues**: File issue at GitHub repo
- **Skill Development**: See `.claude/skills/*/SKILL.md` files
- **Testing**: Run `.claude/skills/redis-coordination/test-orchestrator.sh`

## License

See LICENSE file in repository root.
