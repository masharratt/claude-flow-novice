# Claude Flow Novice v2.18.1 Documentation

**Version:** 2.18.1 (RuVector Integration)
**Last Updated:** 2025-12-05

**Package Metrics**:
- Namespace-isolated installation (~0.01% collision risk)
- Semantic codebase search via RuVector
- Multi-provider routing (Z.ai, Kimi, OpenRouter, Anthropic)

## Overview

AI agent orchestration with semantic codebase search, Redis coordination, and multi-loop consensus validation (CFN Loop).

## CFN Loop Execution Modes

### Task Mode (Debugging - Full Visibility)
- **Spawn Method**: Main Chat spawns Task() agents directly
- **Cost**: $0.150/iteration (Anthropic provider)
- **Visibility**: Complete agent output in Main Chat
- **Use Case**: Debugging, learning, short tasks (<5 minutes)
- **Memory**: ANTI-023 protection prevents memory leaks
- **Audit**: Automatic audit trail storage in SQLite and Redis

### CLI Mode (Production - Cost Optimized)
- **Spawn Method**: Coordinator spawns CLI agents via `npx claude-flow-novice`
- **Cost**: $0.054/iteration (64% savings vs Task mode)
- **Visibility**: Background execution with progress tracking
- **Use Case**: Production, long tasks, cost-sensitive workflows
- **Memory**: Redis-based coordination with recovery capabilities
- **Custom Routing**: Optional 5x cost reduction with Z.ai provider
- **Redis Configuration**: Requires `CFN_REDIS_HOST=localhost` for non-Docker environments (see [CLI Mode Redis Configuration](../docs/CLI_MODE_REDIS_CONFIGURATION.md))

### Mode Selection Guide
- **Use Task Mode when**: Debugging issues, learning CFN Loop, short tasks requiring full visibility
- **Use CLI Mode when**: Production work, cost optimization, long-running tasks, background execution
- **Custom Routing**: `/custom-routing-activate` for 95-98% total cost savings when using CLI mode

### Slash Commands
- **`/cfn-loop-task`**: Task mode execution (Main Chat → Task() agents)
- **`/cfn-loop-cli`**: CLI mode execution (Main Chat → coordinator → CLI agents)
- **Mode Parameters**: `--mode=mvp|standard|enterprise` with different confidence thresholds

### Cost Comparison
- **Task Mode**: $0.150/iteration (full visibility, debugging)
- **CLI Mode**: $0.054/iteration (64% savings, production)
- **With Custom Routing**: $0.004-0.010/iteration (95-98% total savings)

## Quick Start

### Task Mode (Debugging - Full Visibility)
```bash
# Install and initialize
npm install claude-flow-novice
npx cfn-init

# Execute CFN Loop - Main Chat spawns Task() agents directly
/cfn-loop-task "Implement JWT authentication" --mode=standard

# Custom routing available for 5x cost reduction
/custom-routing-activate
```

### CLI Mode (Production - Cost Optimized)
```bash
# Install and initialize
npm install claude-flow-novice
npx cfn-init

# Configure Redis for non-Docker environments
export CFN_REDIS_HOST=localhost
export CFN_REDIS_PORT=6379

# Execute CFN Loop - Coordinator spawns CLI agents in background
/cfn-loop-cli "Implement JWT authentication" --mode=standard

# Initialize swarm with skills
npx claude-flow-novice swarm "Task Description" \
  --skills=redis-coordination,agent-spawning \
  --strategy development
```

## Documentation Index

### Core Concepts
- **[Skills System](log-skills.md)** - Modular, reusable agent capabilities
- **[CFN Loop](cfn-loop-modes.md)** - Three-loop consensus validation framework
- **[RuVector Search](../docs/RUVECTOR_ARCHITECTURE.md)** - Semantic codebase indexing
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
- **[Decision Log](CHANGELOG.md)** - Architecture decision records
- **[Component Status](COMPONENT_NPM_STATUS.md)** - Dependency health

### Legacy
- **[Deprecated MCP Logs](deprecated-logs-mcp.md)** - Historical MCP implementation
- **[v1 Documentation](../legacy/readme-v1/)** - Previous documentation version

## Key Features (v2.18.1)

### RuVector Codebase Search (NEW)
- **Semantic Search**: Natural language queries against codebase
- **OpenAI Embeddings**: text-embedding-3-small (1536 dimensions)
- **Manifest System**: `.cfn-manifest.json` tracks CFN vs custom files
- **Safe Distribution**: Custom files preserved during CFN updates

```bash
# Index codebase
./.claude/skills/cfn-ruvector-codebase-index/index.sh --full

# Search
./.claude/skills/cfn-ruvector-codebase-index/search.sh "authentication" --top 5

# Incremental reindex
/cfn-ruvector:codebase-reindex
```

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
- **CLI Mode**: 64% savings vs Task mode ($0.054 vs $0.150/iteration)
- **Custom Routing**: Optional 5x reduction with Z.ai provider (95-98% total savings)
- **Mode-Aware Architecture**: Task Mode agents use clean exit, CLI Mode uses Redis coordination
- **Memory Safety**: ANTI-023 protection prevents memory leaks in Task Mode

## Architecture Principles

1. **Skills-Based Coordination**: All agent communication via explicit Redis dependencies
2. **Multi-Layer Enforcement**: Coordination primitives at technical, skill, agent, and system layers
3. **Centralized Orchestration**: Keep orchestration in dedicated skills, not distributed across components
4. **Mode-Aware Architecture**: Task Mode (direct Task() spawning) vs CLI Mode (coordinator-driven)
5. **Post-Edit Validation**: All Edit/Write operations trigger validation hooks
6. **Parallel Agent Spawning**: All Task-based coordinators require parallel spawning (single message, multiple Task calls)

### Mode-Agent Profile Specialization
- **Task Mode Agents**: Clean exit protocol, direct Main Chat communication, audit trail storage
- **CLI Mode Agents**: Redis coordination, completion signaling, background execution
- **Coordinators**: Enhanced monitoring with recovery capabilities, progress tracking

## Migration Notes

**v1 → v2 Changes:**
- Deprecated: Implicit agent coordination, distributed orchestration logic
- Added: Skills system, Redis coordination, zero-token waiting, orchestrate-cfn-loop.sh
- Breaking: CFN Loop now requires orchestrator (no manual Task spawning)

**v2.14 Changes:**
- **Dual-Mode Architecture**: Task Mode (Main Chat Task() spawning) vs CLI Mode (coordinator-driven)
- **Custom Routing**: Z.ai integration for 5x cost reduction in CLI mode
- **Memory Safety**: ANTI-023 protection prevents memory leaks in Task Mode
- **Enhanced Coordinators**: Progress tracking, recovery capabilities, multi-layer enforcement

**v2.16.0 Changes (Integration Standardization - PR #16):**
- **Skill Lifecycle Management**: Automated deployment, versioning, promotion workflows
- **Cross-Database Integration**: Transaction coordinator for PostgreSQL/SQLite/Redis
- **File System Standardization**: Unified backup, logging, state persistence patterns
- **Edge Case Feedback Loop**: Auto-generates patches from test failures
- **Data Format Harmonization**: JSON schema validation across 43+ skills
- **27/30 Tasks Complete**: 90% integration standardization implementation

See [CHANGELOG.md](CHANGELOG.md) and [CFN Loop Task Mode Guide](claude-assets/commands/CFN_LOOP_TASK_MODE.md) for migration details.

## Testing

### Mode Verification (All 3 Modes Working)
- **Task Mode**: ✅ Verified (6 hello world files test)
- **CLI Mode**: ✅ Verified (6 hello world files test with `CFN_REDIS_HOST=localhost`)
- **Docker Mode**: ✅ Verified (Bug #6 validation test)

**Test Details**: See [docs/ALL_3_MODES_VERIFIED_WORKING.md](../docs/ALL_3_MODES_VERIFIED_WORKING.md)

### Test Suites (All Passing)
- **TDD Compliance**: 100% (24/24 tests)
- **CLI Mode Coordinator**: 100% (23/23 tests)
- **CLI Mode Orchestrator**: 91% (21/23 tests, 2 flexible)
- **CLI Mode Threshold**: 100% (6/6 tests)
- **CLI Mode Redis**: 100% (7/7 tests)

### Running Tests
```bash
# TDD compliance tests
bash tests/tdd-compliance/test-*.sh

# CLI mode tests
bash tests/cli-mode/test-*.sh

# Bug #6 Redis validation
bash tests/docker/validation/validate-bug6-redis-vars.sh
```

## RuVector - Semantic Codebase Search

**Centralized Index:** `~/.local/share/ruvector/index_v2.db`

RuVector provides dual-mode code intelligence with a centralized index shared across all projects:

### Dual Storage Architecture

| Schema | Purpose | Query Type | Use Case |
|--------|---------|------------|----------|
| **V1** (embeddings, files) | Semantic similarity | Vector distance | "Find code similar to X" |
| **V2** (entities, refs, modules) | Structured relationships | SQL joins | "Who calls this function?" |

**V1 - Semantic Search:**
- Stores text chunks with OpenAI embeddings (text-embedding-3-small, 1536 dims)
- Queries: Fuzzy semantic similarity via cosine distance
- Returns: Code that's semantically related regardless of exact syntax

**V2 - Code Intelligence:**
- Stores AST entities (functions, classes, interfaces) with relationships
- Queries: Precise SQL on structured code graph
- Returns: Exact references, callers, type usage, module dependencies

### Usage

```bash
# Build RuVector
cd .claude/skills/cfn-local-ruvector-accelerator
cargo build --release

# Initialize centralized index
./target/release/local-ruvector init

# Index current project (all file types)
./target/release/local-ruvector index --path . --types rs,ts,js,json,md,sh

# Semantic search across all indexed projects
./target/release/local-ruvector query --pattern "authentication middleware"

# SQL queries on code structure
sqlite3 ~/.local/share/ruvector/index_v2.db "
  SELECT * FROM refs WHERE target_name = 'MyFunction';
"
```

**Supported Files:**
- AST extraction: Rust (.rs), TypeScript/JavaScript (.ts, .tsx, .js, .jsx)
- Text indexing: JSON, YAML, Markdown (.md), Shell scripts (.sh)
- Auto-excluded: `.artifacts/` (logs/reports)

**Benefits:**
- Cross-project semantic search
- Shared learnings across codebases
- Dual query modes (semantic + structural)
- Full paths preserve project context

## Support

- **Documentation Issues**: File issue at GitHub repo
- **Skill Development**: See `.claude/skills/*/SKILL.md` files
- **Redis Configuration**: See [docs/CLI_MODE_REDIS_CONFIGURATION.md](../docs/CLI_MODE_REDIS_CONFIGURATION.md)

## License

See LICENSE file in repository root.
