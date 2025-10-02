# Agent Coordination System V2 - Implementation Plan

**Version**: 2.0
**Date**: 2025-10-02
**Status**: Ready for Execution

---

## Executive Summary

This implementation plan provides detailed specifications for building the Agent Coordination System V2 with a unified architecture supporting three coordination modes: CLI (free), SDK (Anthropic direct), and Hybrid (multi-provider with cost optimization). The system enables seamless mode switching without code changes.

**Timeline**: 13 weeks total (Week 0 Foundation + Weeks 1-12 Implementation + Week 13 Production Hardening)
**Team Size**: 5 developers (includes coordination architect + provider integration specialist)
**Estimated Effort**: 650-980 hours (includes unified architecture + multi-provider integration)

**Coordination Modes**:
1. **CLI Mode**: Free tier using Claude Code subscription, zero API costs
2. **SDK Mode**: Anthropic direct API, full SDK features ($3-15/MTok)
3. **Hybrid Mode**: SDK coordination + multi-provider inference (~40% cost savings with Z.ai, validated)

**Dependencies**:
- TypeScript 5.0+
- Node.js 20+
- SQLite/PostgreSQL
- @anthropic-ai/claude-code ^2.0.1 (optional peer dependency for SDK/Hybrid modes)
- @anthropic-ai/sdk ^0.32.0 (optional peer dependency)
- Jest 29+ (testing framework)
- benchmark.js (performance validation)

**Performance by Mode**:

| Mode | Agent Spawn | Pause/Resume | Cost | Max Agents | Use Case |
|------|-------------|--------------|------|------------|----------|
| **CLI** | 50-100ms (pool) | SIGSTOP (instant) | $0 | 20-50 | Free tier, development |
| **SDK** | 50-100ms (fork) | SDK native (<50ms) | $3-15/MTok | 100+ | Production, full features |
| **Hybrid** | 50-100ms (fork) | SDK native (<50ms) | $0.30-3/MTok | 100+ | **Recommended** - best value |

**Cost Analysis (10-agent workload, 8 hours/day)**:
- CLI Mode: **$0/month** (free tier)
- SDK Mode (Anthropic): **$600-1000/month**
- Hybrid Mode (Z.ai): **$360-600/month** (~40% savings vs SDK) - VALIDATED
- Hybrid Mode (OpenRouter): **$100-300/month** (varies by provider)

**Unified Architecture Benefits**:
- Same TypeScript API for all modes (zero code changes to switch)
- Auto-detection of optimal mode based on available credentials
- Graceful fallback: SDK → CLI if API unavailable
- Provider flexibility: 200+ models via OpenRouter/Z.ai in Hybrid mode
- Progressive enhancement: start CLI (free) → upgrade SDK (features) → optimize Hybrid (cost)

---

## Table of Contents

1. [Unified Architecture Overview](#unified-architecture-overview)
2. [Cost Analysis by Mode](#cost-analysis-by-mode)
3. [File Structure](#file-structure)
4. [Implementation Order](#implementation-order)
5. [Developer Assignment](#developer-assignment)
6. [Testing Requirements](#testing-requirements)
7. [Integration Points](#integration-points)
8. [Performance Benchmarks](#performance-benchmarks)
9. [Provider Integration Strategy](#provider-integration-strategy)
10. [Documentation Updates](#documentation-updates)

---

## Unified Architecture Overview

### Three Coordination Modes

The V2 system supports three coordination modes that share the same TypeScript API but use different backends:

**1. CLI Mode (Free Tier)**
- Uses Claude Code CLI subscription
- Process pool for fast agent spawning (50-100ms)
- File-based state management (/dev/shm for performance)
- SIGSTOP/SIGCONT for pause/resume
- Zero API costs
- Best for: Development, prototyping, free tier users

**2. SDK Mode (Full Features)**
- Direct Anthropic API via @anthropic-ai/claude-code
- Session forking for parallel spawning
- Native pause/resume via query.interrupt()
- Message UUID checkpoints for instant recovery
- Artifact storage for efficient state
- Best for: Production, users with API credits

**3. Hybrid Mode (Cost-Optimized)**
- SDK coordination features (forking, pause/resume)
- Multi-provider routing for cost optimization
- Supports Z.ai (96% cheaper), OpenRouter (95% cheaper)
- Provider failover and load balancing
- Best for: Production with cost constraints

**Key Design Principle**: All three modes implement the same `ICoordinator` interface, allowing seamless switching via configuration without code changes.

### Auto-Detection Flow

```typescript
// Auto-detects best available mode
const coordinator = await CoordinatorFactory.create();

// Detection logic:
// 1. Check for Z_AI_API_KEY → Hybrid mode (recommended)
// 2. Check for ANTHROPIC_API_KEY → SDK mode
// 3. Check for Claude Code CLI → CLI mode
// 4. Error if none available
```

### Tiered Provider Routing Strategy

The Hybrid mode implements a 3-tier routing system that optimizes cost while maintaining quality for critical operations:

**Tier 1: Claude Code Subscription** (Preferred for Important Agents)
- **Cost**: $0 within subscription limits
- **Agent Types**: planners, reviewers, architects, coordinators
- **Reasoning**: High-stakes decision-making requires Claude's reasoning capabilities
- **Fallback**: Anthropic API when subscription limits reached

**Tier 2: Anthropic API** (SDK Features + Fallback)
- **Cost**: $5/$25 per MTok (input/output)
- **Use Cases**:
  1. SDK-required operations (session forking, checkpoints, artifacts)
  2. Fallback for important agents when Tier 1 unavailable/limited
  3. Critical coordination and validation tasks
- **Agent Types**: validators, security-specialist, system-architect
- **Reasoning**: Maximum reliability and full SDK feature set

**Tier 3: Z.ai** (Bulk Routine Work)
- **Cost**: $0.41/$1.65 per MTok (96% savings)
- **Agent Types**: coder, tester, researcher, documenter
- **Reasoning**: Routine work doesn't require premium models
- **Volume**: ~85% of all agent work

**Important Agents Definition**:
Agents that require strategic thinking, architectural decisions, code quality validation, or swarm coordination:
- `planner` - Strategic planning and decomposition
- `reviewer` - Code quality and architecture review
- `architect` - System design and technical decisions
- `coordinator` - Swarm orchestration and consensus
- `validator` - Byzantine consensus validation
- `security-specialist` - Security architecture review

**Routing Decision Flow**:
```typescript
async function routeAgent(agentType: string, task: Task): Promise<Provider> {
  // Tier 1: Important agents prefer subscription
  if (isImportantAgent(agentType)) {
    if (subscriptionAvailable() && !subscriptionLimited()) {
      return 'claude-code-subscription';
    }
    // Fallback to Tier 2 for important agents
    return 'anthropic-api';
  }

  // Tier 2: SDK operations require Anthropic
  if (requiresSDKFeatures(task)) {
    return 'anthropic-api';
  }

  // Tier 3: All routine work goes to Z.ai
  return 'z-ai';
}

function isImportantAgent(type: string): boolean {
  return ['planner', 'reviewer', 'architect', 'coordinator',
          'validator', 'security-specialist'].includes(type);
}
```

**Configuration Example**:
```json
{
  "coordination": {
    "mode": "hybrid",
    "tieredRouting": {
      "enabled": true,
      "tiers": {
        "tier1": {
          "provider": "claude-code-subscription",
          "agentTypes": ["planner", "reviewer", "architect", "coordinator"],
          "fallbackTo": "tier2",
          "limitMonitoring": true
        },
        "tier2": {
          "provider": "anthropic-api",
          "agentTypes": ["validator", "security-specialist", "system-architect"],
          "useCases": ["sdk-operations", "tier1-fallback"],
          "model": "claude-sonnet-4.1"
        },
        "tier3": {
          "provider": "z-ai",
          "agentTypes": ["coder", "tester", "researcher", "documenter"],
          "model": "glm-4.6",
          "subscription": "pro"
        }
      }
    }
  }
}
```

**Cost Analysis (10-agent swarm, 8 hours/day)**:

| Component | Provider | Monthly Cost | Work Volume |
|-----------|----------|--------------|-------------|
| Important agents (4) | Subscription | $0* | ~15% |
| SDK operations | Anthropic API | ~$30 | ~5% |
| Important agent fallback | Anthropic API | ~$20 | ~10% |
| Routine workers (6) | Z.ai Pro | $15 | ~70% |
| **Total** | **Mixed** | **~$65** | **100%** |

*Within Claude Code subscription limits

**Savings Comparison**:
- Pure Anthropic: $600-1000/month (baseline)
- Pure Z.ai: $150/month (75% savings, but lower quality for planning)
- **3-Tier Strategy: $65/month (89-93% savings with optimal quality distribution)**

**Decision Examples**:

| Agent Type | Task | Routed To | Reasoning |
|------------|------|-----------|-----------|
| `planner` | "Break down feature into tasks" | Tier 1 (Subscription) | Strategic thinking required |
| `planner` | Same task (limits reached) | Tier 2 (Anthropic) | Fallback maintains quality |
| `architect` | "Design database schema" | Tier 1 (Subscription) | Architecture decision critical |
| `reviewer` | "Review PR for quality" | Tier 1 (Subscription) | Quality validation critical |
| `validator` | "Byzantine consensus vote" | Tier 2 (Anthropic) | Requires SDK + determinism |
| `coder` | "Implement CRUD endpoints" | Tier 3 (Z.ai) | Routine implementation work |
| `tester` | "Write unit tests" | Tier 3 (Z.ai) | Routine testing work |
| `researcher` | "Find best practices" | Tier 3 (Z.ai) | Information gathering task |
| `coordinator` | "Orchestrate 10 agents" | Tier 2 (Anthropic)** | SDK session forking required |

**Requires Anthropic API (Tier 2) for SDK features

---

## Cost Analysis by Mode

### Monthly Cost Comparison

**Workload**: 10-agent swarm, 8 hours/day, 20 business days

| Mode | Monthly Cost* | Setup Complexity | Use Case |
|------|--------------|------------------|----------|
| **CLI Mode** | **$0** | Zero config | Free tier, development, learning |
| **SDK Mode (Anthropic)** | **$600-1000** | API key only | Production, maximum reliability |
| **Hybrid (Z.ai)** | **$150** | API key + subscription | **Recommended** - best value |
| **Hybrid (OpenRouter)** | **$100-300** | Proxy setup | Multi-model flexibility |

*Based on 850K tokens/day workload (typical 10-agent swarm)

### Cost Breakdown by Provider

**Z.ai GLM Models** (Recommended for Hybrid - VALIDATED):
- **GLM-4.6**: $3/$15 per MTok (200K context, thinking model) - **RECOMMENDED**
  - Default: 8,192 tokens (500 line guideline)
  - Minimum: 201 tokens (boundary requirement)
  - Maximum: 80,000 tokens (validated)
  - Status: Production-ready with comprehensive testing
- **GLM-4.5**: $3/$15 per MTok (128K context, standard model)
  - Stable fallback option
  - No token minimum issues
- **Savings**: ~40% vs Anthropic Sonnet ($5/$25 per MTok) - VALIDATED
- **Quality**: ~94% of Claude Sonnet quality
- **Compatibility**: 100% Anthropic API compatible via https://api.z.ai/api/anthropic
- **Note**: Previous 96% savings estimate was incorrect - actual validated savings is 40%

**OpenRouter** (Alternative Hybrid):
- Google Gemini 2.5 Pro: $1.25/$5 per MTok (75% savings)
- Claude Sonnet via OR: $3/$15 per MTok (40% savings)
- DeepSeek V3: $0.27/$1.10 per MTok (95% savings)
- **Benefit**: 200+ model choices

**Anthropic Direct** (SDK Mode):
- Claude Sonnet 4.1: $5/$25 per MTok (baseline)
- Claude Opus 4.1: $15/$75 per MTok (premium)
- **Benefit**: Maximum reliability, latest models

### Cost Optimization Strategy

**Recommended Hybrid Configuration**:
```json
{
  "providers": {
    "anthropic": {
      "models": {
        "coordinator": "claude-sonnet-4.1",
        "validator": "claude-sonnet-4.1"
      }
    },
    "z-ai": {
      "models": {
        "coder": "glm-4.6",
        "tester": "glm-4.5",
        "researcher": "glm-4.6"
      }
    }
  },
  "routing": {
    "strategy": "cost-optimized"
  }
}
```

**Expected Savings**: 73-85% reduction vs all-Anthropic

---

## SDK Integration Overview

### Claude Code SDK Benefits

The @anthropic-ai/claude-code SDK provides transformative capabilities for agent coordination:

**Performance Multipliers**:
- **10-20x Agent Spawning**: Session forking creates parallel agents in <2s vs 20s sequential
- **50-75% Cost Reduction**: Query control pauses idle agents with zero token usage
- **120x Recovery Speed**: Checkpoints restore state in <500ms vs 60s rebuild
- **3.7x Storage Speed**: Artifacts use binary format (12ms vs 45ms JSON)

**Core SDK Capabilities**:

1. **Session Forking** (`forkSession: true`)
   - Parallel agent spawning with shared parent context
   - Pointer-based context sharing (no duplication)
   - Nested hierarchy: agents spawn agents (10+ levels deep)
   - Level 0 = Claude Code chat, Level 1-N = SDK background processes

2. **Query Control** (`query.interrupt()`, `resumeSessionAt`)
   - Pause agents mid-execution with zero token cost
   - Resume from exact message UUID
   - Dynamic resource allocation (pause low-priority agents)
   - Graceful degradation under load

3. **Checkpoints** (Message UUID snapshots)
   - Git-like state snapshots at message boundaries
   - Sub-500ms recovery from any checkpoint
   - Auto-checkpoint on state transitions
   - Fault tolerance without full rebuild

4. **Artifacts** (Binary dependency storage)
   - Indexed binary format for fast lookups
   - 73% faster than JSON serialization
   - Efficient sharing across forked sessions
   - Automatic cache invalidation

5. **Nested Hierarchy** (Multi-level spawning)
   - Parent controls all child levels (pause/inject/resume)
   - Hierarchical resource management
   - Cascading shutdown for graceful termination
   - Background process orchestration via BashOutput monitoring

### Architecture Impact

**Pre-SDK Architecture** (Current V2):
- Sequential agent spawning via Task tool
- Polling-based completion detection
- No pause/resume capability
- JSON-based state storage

**Post-SDK Architecture** (Enhanced V2):
- Parallel agent forking (10-20 concurrent)
- Event-driven completion via SDK sessions
- Query control for dynamic resource allocation
- Artifact-based state storage with checkpoints

**Integration Requirements**:
- SDK installed: `npm install @anthropic-ai/claude-code`
- Level 0 coordinator in Claude Code chat (supervisor)
- Level 1-N agents in background processes
- BashOutput monitoring for child session status
- Checkpoint strategy for fault tolerance

**Breaking Changes**:
- Agent spawning API updated (add `forkSession` option)
- Completion detection uses SDK events (not polling)
- State storage migrated to Artifacts format
- Recovery logic uses checkpoints (not full rebuild)

---

---

## File Structure

### New V2 Directory Organization

```
src/coordination/v2/
├── interfaces/                       # 🆕 Unified Coordination Interfaces
│   ├── ICoordinator.ts               # Core coordinator interface (CLI/SDK/Hybrid)
│   ├── IAgent.ts                     # Agent abstraction
│   ├── ICheckpoint.ts                # Checkpoint interface
│   └── types.ts                      # Shared types
├── factory/                          # 🆕 Coordinator Factory & Auto-Detection
│   ├── CoordinatorFactory.ts         # Creates appropriate coordinator based on mode
│   ├── mode-detector.ts              # Auto-detects optimal mode from environment
│   └── config-loader.ts              # Loads/validates configuration
├── cli/                              # 🆕 CLI Coordination Implementation
│   ├── CLICoordinator.ts             # CLI-based coordinator
│   ├── agent-pool.ts                 # Process pool for fast spawning
│   ├── state-manager.ts              # File-based state persistence (/dev/shm)
│   ├── event-bus.ts                  # Named pipes IPC
│   ├── process-monitor.ts            # Health monitoring via PIDs
│   └── checkpoint-manager.ts         # SIGSTOP/SIGCONT checkpoint system
├── sdk/                              # 🆕 SDK Coordination Implementation (Anthropic direct)
│   ├── SDKCoordinator.ts             # SDK-based coordinator
│   ├── session-manager.ts            # SDK session lifecycle management (forkSession, create, close)
│   ├── query-controller.ts           # Pause/resume/interrupt query control (zero-cost agent pausing)
│   ├── checkpoint-manager.ts         # Git-like checkpointing with message UUIDs (<500ms recovery)
│   ├── session-forker.ts             # Parallel agent spawning via forkSession
│   ├── artifact-adapter.ts           # SDK artifacts for fast storage
│   └── sdk-config.ts                 # SDK configuration and initialization
├── hybrid/                           # 🆕 Hybrid Mode (SDK coordination + multi-provider)
│   ├── HybridCoordinator.ts          # Hybrid coordinator (SDK features + proxy)
│   ├── proxy-manager.ts              # Manages provider proxies
│   └── provider-router.ts            # Routes requests to optimal provider
├── providers/                        # 🆕 Multi-Provider Support
│   ├── interfaces/
│   │   ├── IProvider.ts              # Provider abstraction
│   │   └── provider-types.ts         # Provider capability definitions
│   ├── anthropic/
│   │   ├── AnthropicProvider.ts      # Official Anthropic provider
│   │   └── anthropic-config.ts       # Anthropic-specific config
│   ├── zai/
│   │   ├── ZaiProvider.ts            # Z.ai provider (extends AnthropicProvider)
│   │   └── zai-config.ts             # Z.ai-specific config
│   ├── openrouter/
│   │   ├── OpenRouterProvider.ts     # OpenRouter multi-model provider
│   │   └── openrouter-config.ts      # OpenRouter config
│   └── provider-factory.ts           # Creates provider instances
├── core/                             # State machine and core logic
│   ├── state-machine.ts              # Core state machine logic
│   ├── state-machine-config.ts       # State transition rules
│   ├── agent-state.ts                # Agent state definitions
│   └── state-transition.ts           # Transition event structures
├── dependency/                       # Dependency resolution (uses artifacts for storage)
│   ├── dependency-manager.ts         # Dependency resolution coordinator
│   ├── dependency-graph.ts           # DAG data structure
│   ├── dependency-request.ts         # Request/resolution types
│   ├── cycle-detector.ts             # Circular dependency detection
│   ├── topological-sort.ts           # Execution order calculation
│   └── artifact-storage.ts           # 🆕 Artifact-based dependency storage (binary format)
├── messaging/                        # Message bus (integrates with SDK query control)
│   ├── message-bus.ts                # V2 message bus with channels
│   ├── channel.ts                    # Channel implementation
│   ├── message-router.ts             # Priority routing logic (query control for dynamic routing)
│   ├── message-persistence.ts        # Message storage (uses artifacts)
│   └── channels/
│       ├── state-channel.ts          # Agent state changes
│       ├── dependency-channel.ts     # Dependency requests/resolutions
│       ├── task-channel.ts           # Task assignments
│       └── help-channel.ts           # Help requests
├── completion/                       # Completion detection (SDK event-driven)
│   ├── completion-detector.ts        # Base completion detection
│   ├── hierarchical-detector.ts      # PM-based detection
│   ├── mesh-detector.ts              # Distributed detection (Dijkstra-Scholten)
│   ├── consensus-protocol.ts         # Byzantine consensus
│   ├── swarm-shutdown.ts             # Graceful shutdown coordinator (cascading via SDK)
│   └── sdk-completion-detector.ts    # 🆕 SDK event-based detection (replaces polling)
├── deadlock/                         # Deadlock detection and resolution
│   ├── wait-for-graph.ts             # WFG cycle detection
│   ├── deadlock-detector.ts          # Deadlock detection coordinator
│   ├── deadlock-resolver.ts          # Resolution strategies
│   └── resource-ordering.ts          # Resource allocation ordering
├── coordinators/                     # Swarm coordination (SDK-enhanced sessions)
│   ├── swarm-coordinator-v2.ts       # Main V2 coordinator
│   ├── hierarchical-coordinator.ts   # PM/coordinator pattern
│   ├── mesh-coordinator.ts           # Peer-to-peer pattern
│   ├── hybrid-coordinator.ts         # Adaptive topology switching
│   ├── sdk-coordinator.ts            # 🆕 SDK-enhanced coordinator (session forking + query control)
│   └── sdk-session-coordinator.ts    # 🆕 SDK session state management
├── help-system/                      # Help request routing
│   ├── help-request.ts               # Help request types
│   ├── help-matcher.ts               # Capability matching
│   ├── waiting-agent-pool.ts         # Available helper agents
│   └── help-coordinator.ts           # Help request routing
├── memory/                           # Memory storage (artifacts + enhanced persistence)
│   ├── swarm-memory-v2.ts            # Enhanced memory schema
│   ├── state-storage.ts              # State transition storage (artifact-backed)
│   ├── dependency-storage.ts         # Dependency graph storage (artifact-backed)
│   ├── completion-storage.ts         # Completion probe storage (artifact-backed)
│   ├── artifact-adapter.ts           # 🆕 Artifact migration layer (SwarmMemory to SDK artifacts)
│   └── checkpoint-storage.ts         # 🆕 Checkpoint state storage (message UUID snapshots)
├── adapters/                         # 🆕 Integration layer (bridges existing tools to SDK)
│   ├── task-to-sdk-adapter.ts        # Bridge Task tool to SDK sessions (enables SDK features for existing Task calls)
│   └── memory-to-artifact-adapter.ts # Bridge SwarmMemory to SDK artifacts (transparent artifact storage)
└── utils/
    ├── agent-selector.ts             # Agent selection algorithms
    ├── priority-calculator.ts        # Message/task priority
    ├── topology-detector.ts          # Auto-topology selection
    ├── performance-monitor.ts        # V2-specific metrics
    └── sdk-helpers.ts                # 🆕 SDK utility functions (session helpers, checkpoint utilities)

src/coordination/
├── swarm-coordinator.ts              # V1 compatibility wrapper (temporary)
└── coordinator-factory.ts            # Factory for V1/V2 selection

src/mcp/
├── swarm-tools-v2.ts                 # New V2 MCP tools
└── tools/
    ├── agent-state-tools.ts          # State transition tools
    ├── dependency-tools.ts           # Dependency management tools
    ├── help-tools.ts                 # Help request tools
    └── completion-tools.ts           # Completion detection tools

test/coordination/v2/
├── unit/
│   ├── state-machine.test.ts
│   ├── dependency-manager.test.ts
│   ├── message-bus.ts
│   ├── completion-detector.test.ts
│   ├── deadlock-detector.test.ts
│   └── sdk/                          # 🆕 SDK unit tests
│       ├── session-manager.test.ts
│       ├── query-controller.test.ts
│       ├── checkpoint-manager.test.ts
│       └── artifact-storage.test.ts
├── integration/
│   ├── hierarchical-workflow.test.ts
│   ├── mesh-workflow.test.ts
│   ├── hybrid-workflow.test.ts
│   ├── full-coordination.test.ts
│   └── sdk/                          # 🆕 SDK integration tests
│       ├── parallel-spawning.test.ts
│       ├── pause-resume.test.ts
│       ├── nested-hierarchy.test.ts
│       └── checkpoint-recovery.test.ts
└── performance/
    ├── state-transitions.bench.ts
    ├── dependency-resolution.bench.ts
    ├── message-throughput.bench.ts
    ├── completion-detection.bench.ts
    └── sdk/                          # 🆕 SDK performance tests
        ├── session-forking.bench.ts
        ├── artifact-storage.bench.ts
        └── checkpoint-recovery.bench.ts
```

**Total Files**: ~95 new files (includes unified architecture + multi-provider support)
**Total Lines of Code (Estimated)**: ~19,000 LOC

**Unified Architecture Breakdown**:
- 4 interface files in `src/coordination/v2/interfaces/`
- 3 factory files in `src/coordination/v2/factory/`
- 6 CLI coordinator files in `src/coordination/v2/cli/`
- 7 SDK coordinator files in `src/coordination/v2/sdk/`
- 3 hybrid coordinator files in `src/coordination/v2/hybrid/`
- 12 provider files in `src/coordination/v2/providers/` (Anthropic, Z.ai, OpenRouter)
- 45 core coordination files (state machine, messaging, completion, etc.)
- 15 test files covering all three modes

---

## Implementation Order

### Dependency Tree Visualization

```
Phase 0: SDK Foundation (NEW)
  ├─ SDK Installation & Setup ─────────────┐
  ├─ SessionManager (forking) ─────────────┤
  ├─ QueryController (pause/resume) ───────┤
  ├─ CheckpointManager (snapshots) ────────┤
  └─ ArtifactStorage (binary format) ──────┴─→ Phase 1

Phase 1: Foundation + SDK Integration
  ├─ AgentState enum ──────────────────────┐
  ├─ StateTransition interface ────────────┤
  ├─ StateMachineManager ──────────────────┤
  └─ SDK session forking integration ──────┴─→ Phase 2

Phase 2: Dependencies + Artifacts
  ├─ DependencyRequest/Resolution types ───┐
  ├─ DependencyGraph ──────────────────────┤
  ├─ CycleDetector ────────────────────────┤
  ├─ DependencyManager ────────────────────┤
  └─ Artifact-based dependency storage ────┴─→ Phase 3

Phase 3: Messaging + Query Control
  ├─ Message types ────────────────────────┐
  ├─ Channel implementation ───────────────┤
  ├─ MessageRouter ────────────────────────┤
  ├─ MessageBusV2 ─────────────────────────┤
  └─ Query control for dynamic routing ────┴─→ Phase 4

Phase 4: Completion & Deadlock + Checkpoints
  ├─ CompletionDetector (base) ───┬────────┐
  ├─ HierarchicalDetector ────────┤        │
  ├─ MeshDetector ────────────────┤        │
  ├─ SDK event-based completion ──┤        │
  ├─ WaitForGraph ────────────────┤        │
  ├─ DeadlockDetector ────────────┤        │
  └─ Checkpoint-based recovery ───┴────────┴─→ Phase 5

Phase 5: Help System + Nested Hierarchy
  ├─ HelpRequest types ────────────────────┐
  ├─ HelpMatcher ──────────────────────────┤
  ├─ WaitingAgentPool ─────────────────────┤
  ├─ HelpCoordinator ──────────────────────┤
  └─ Multi-level agent spawning ───────────┴─→ Phase 6

Phase 6: Integration + Background Orchestration
  ├─ SwarmCoordinatorV2 ──────────────┬────┐
  ├─ SDKCoordinator (enhanced) ───────┤    │
  ├─ HierarchicalCoordinator ─────────┤    │
  ├─ MeshCoordinator ─────────────────┤    │
  ├─ Background process orchestration ┤    │
  ├─ SwarmMemoryV2 ───────────────────┤    │
  └─ MCP Tools V2 ────────────────────┴────┴─→ Production
```

### Week-by-Week Implementation Schedule

#### **Week 0: SDK Foundation Setup** 🆕

**SDK Specialist (NEW ROLE)**:
- [ ] Install @anthropic-ai/claude-code SDK
- [ ] `src/coordination/v2/sdk/session-manager.ts` (Session forking)
- [ ] `src/coordination/v2/sdk/query-controller.ts` (Pause/resume)
- [ ] `src/coordination/v2/sdk/checkpoint-manager.ts` (Snapshots)

**Developer 1 (Lead)**:
- [ ] `src/coordination/v2/sdk/artifact-storage.ts` (Binary storage)
- [ ] `src/coordination/v2/utils/sdk-helpers.ts` (Utility functions)
- [ ] SDK architecture documentation

**Developer 2**:
- [ ] Unit tests: `test/coordination/v2/unit/sdk/*.test.ts`
- [ ] Performance baseline: session forking vs Task tool
- [ ] BashOutput monitoring prototype

**Developer 3**:
- [ ] `src/coordination/v2/sdk/background-orchestrator.ts` (Level 1-N spawning)
- [ ] `src/coordination/v2/sdk/bash-output-monitor.ts` (Child monitoring)
- [ ] Integration with existing Orchestrator

**Deliverables**:
- ✅ SDK installed and configured
- ✅ SessionManager with parallel forking (10-20 agents)
- ✅ QueryController with pause/resume/interrupt
- ✅ CheckpointManager with <500ms recovery
- ✅ ArtifactStorage with binary format
- ✅ Background process orchestration working
- ✅ Performance baseline: 10x spawning improvement

**Acceptance Criteria**:
- [ ] Spawn 20 agents in <2s (vs 20s sequential)
- [ ] Pause/resume agent with zero token cost
- [ ] Recover from checkpoint in <500ms
- [ ] Store artifacts 3.7x faster than JSON

---

#### **Week 1: State Machine Foundation + SDK Session Integration**

**Developer 1 (Lead)**:
- [ ] `src/coordination/v2/core/agent-state.ts` (Enums, interfaces)
- [ ] `src/coordination/v2/core/state-transition.ts` (Transition types)
- [ ] `src/coordination/v2/core/state-machine-config.ts` (Transition rules)
- [ ] **SDK**: State machine event integration with SDK sessions

**Developer 2**:
- [ ] `src/coordination/v2/core/state-machine.ts` (Core logic)
- [ ] Unit tests: `test/coordination/v2/unit/state-machine.test.ts`
- [ ] **SDK**: Query controller integration for state broadcasts
- [ ] **SDK**: Pause agents during state transitions

**Developer 3**:
- [ ] `src/coordination/v2/memory/state-storage.ts` (Persistence layer)
- [ ] `src/coordination/v2/memory/artifact-adapter.ts` (Artifact migration)
- [ ] Integration with SwarmMemory + Artifacts
- [ ] **SDK**: Basic checkpoint system for state snapshots

**SDK Specialist**:
- [ ] SessionManager integration with state machine
- [ ] Checkpoint on state transitions (auto-snapshot)
- [ ] SDK event listeners for state changes
- [ ] **SDK**: Message UUID tracking for checkpoints

**Deliverables**:
- ✅ AgentState enum with 7 states
- ✅ StateMachineManager with transition validation
- ✅ State persistence to SwarmMemory + Artifacts
- ✅ Auto-checkpoint on state transitions
- ✅ SDK session manager creates checkpoints at state boundaries
- ✅ Query controller integrated for dynamic agent pausing
- ✅ 100% unit test coverage

**Acceptance Criteria**:
- [ ] State transitions trigger SDK checkpoints
- [ ] Artifacts store state 3.7x faster than JSON
- [ ] SDK sessions receive state change events
- [ ] **SDK**: Agents can be paused during state transitions with zero token cost
- [ ] **SDK**: State recovery from checkpoints completes in <500ms

---

#### **Week 2: Dependency Graph + SDK Artifact Storage**

**Developer 1 (Lead)**:
- [ ] `src/coordination/v2/dependency/dependency-request.ts` (Types)
- [ ] `src/coordination/v2/dependency/dependency-graph.ts` (DAG structure)
- [ ] `src/coordination/v2/dependency/cycle-detector.ts` (Circular detection)
- [ ] **SDK**: Artifact-based dependency storage design

**Developer 2**:
- [ ] `src/coordination/v2/dependency/topological-sort.ts` (Execution ordering)
- [ ] `src/coordination/v2/dependency/dependency-manager.ts` (Coordinator)
- [ ] Unit tests for dependency system
- [ ] **SDK**: Binary serialization testing (target: 73% faster than JSON)

**Developer 3**:
- [ ] `src/coordination/v2/memory/dependency-storage.ts` (Persistence)
- [ ] `src/coordination/v2/dependency/artifact-storage.ts` (Artifact backend)
- [ ] Dependency graph visualization tools
- [ ] **SDK**: Session forking for parallel dependency resolution

**SDK Specialist**:
- [ ] **SDK**: Artifact adapter for dependency storage
- [ ] **SDK**: Binary format optimization (indexed lookups)
- [ ] **SDK**: Pointer-based context sharing across forked sessions
- [ ] **SDK**: Cache invalidation strategy for dependencies

**Deliverables**:
- ✅ DependencyGraph with cycle detection
- ✅ Topological sort producing valid execution order
- ✅ DependencyManager routing requests
- ✅ **SDK**: Artifact-based storage 3.7x faster than JSON
- ✅ **SDK**: Session forking enables parallel dependency resolution
- ✅ **SDK**: Binary serialization operational
- ✅ 95% test coverage

**Acceptance Criteria**:
- [ ] Dependency graph handles 100+ nodes without performance degradation
- [ ] Cycle detection completes in <100ms
- [ ] **SDK**: Artifacts store dependencies in <12ms (vs 45ms JSON baseline)
- [ ] **SDK**: Forked sessions share dependency context via pointers
- [ ] **SDK**: Dependency cache invalidation works correctly

---

#### **Week 3: Message Bus + Query Control Integration**

**Developer 1 (Lead)**:
- [ ] `src/coordination/v2/messaging/message-bus.ts` (Core bus)
- [ ] `src/coordination/v2/messaging/channel.ts` (Channel abstraction)
- [ ] `src/coordination/v2/messaging/message-router.ts` (Routing logic)
- [ ] **SDK**: Query control for dynamic message routing

**Developer 2**:
- [ ] Channel implementations (state, dependency, task, help)
- [ ] `src/coordination/v2/messaging/channels/*.ts`
- [ ] Priority queue implementation
- [ ] **SDK**: Pause agents during message processing

**Developer 3**:
- [ ] `src/coordination/v2/messaging/message-persistence.ts` (Storage)
- [ ] Message retention policies with artifact backend
- [ ] Replay functionality
- [ ] **SDK**: Resume agents when messages arrive (event-driven)

**SDK Specialist**:
- [ ] **SDK**: Query controller integration for message routing
- [ ] **SDK**: Agent pause/resume on message events
- [ ] **SDK**: Zero-cost message queue monitoring (paused agents)
- [ ] **SDK**: Background process messaging coordination

**Deliverables**:
- ✅ 4 specialized channels operational
- ✅ Priority routing functional
- ✅ Message persistence with artifact-backed retention
- ✅ **SDK**: Query control routes messages dynamically
- ✅ **SDK**: Agents pause during idle periods (zero token cost)
- ✅ **SDK**: Agents resume on message arrival (event-driven)
- ✅ **SDK**: Background processes coordinate via BashOutput monitoring

**Acceptance Criteria**:
- [ ] Message bus handles >5000 messages/sec throughput
- [ ] Priority routing delivers high-priority messages first
- [ ] **SDK**: Agents can be paused during message processing
- [ ] **SDK**: Agent resume latency <50ms on message arrival
- [ ] **SDK**: Idle agents consume zero tokens while paused
- [ ] **SDK**: Background message orchestration works across 10+ levels

---

#### **Week 4: Completion Detection + Checkpoint Validation**

**Developer 1 (Lead)**:
- [ ] `src/coordination/v2/completion/completion-detector.ts` (Base)
- [ ] `src/coordination/v2/completion/hierarchical-detector.ts` (PM-based)
- [ ] `src/coordination/v2/completion/sdk-completion-detector.ts` (Event-driven)
- [ ] **SDK**: Checkpoint-based completion tracking

**Developer 2**:
- [ ] `src/coordination/v2/completion/mesh-detector.ts` (Dijkstra-Scholten)
- [ ] Distributed completion probes
- [ ] **SDK**: Nested agent hierarchy completion detection
- [ ] **SDK**: Background process completion monitoring

**Developer 3**:
- [ ] `src/coordination/v2/completion/swarm-shutdown.ts` (Graceful shutdown)
- [ ] `src/coordination/v2/memory/completion-storage.ts` (Artifact backend)
- [ ] **SDK**: Checkpoint recovery testing
- [ ] Integration tests: checkpoint-based recovery

**SDK Specialist**:
- [ ] **SDK**: Event-driven completion detection (replaces polling)
- [ ] **SDK**: Checkpoint validation at completion boundaries
- [ ] **SDK**: Multi-level hierarchy completion cascading
- [ ] **SDK**: Recovery from checkpoints during completion failures

**Deliverables**:
- ✅ Hierarchical completion detection operational
- ✅ Mesh completion detection (distributed algorithm)
- ✅ **SDK**: Event-driven completion (no polling overhead)
- ✅ **SDK**: Checkpoint-based recovery validated
- ✅ **SDK**: Nested agent hierarchy completion working (10+ levels)
- ✅ **SDK**: Background process monitoring integrated
- ✅ Graceful swarm shutdown with cascading termination

**Acceptance Criteria**:
- [ ] Hierarchical completion detection completes in <1000ms
- [ ] Mesh completion detection completes in <2000ms
- [ ] **SDK**: Event-driven completion has zero polling overhead
- [ ] **SDK**: Checkpoint recovery completes in <500ms
- [ ] **SDK**: Nested hierarchy completion works across 10+ levels
- [ ] **SDK**: Background processes shut down gracefully
- [ ] **SDK**: Recovery from mid-completion checkpoints succeeds

---

#### **Week 5: Hierarchical Coordination + Nested Agent Control**

**Developer 1 (Lead)**:
- [ ] `src/coordination/v2/coordinators/hierarchical-coordinator.ts` (PM-based coordination)
- [ ] Parent-child agent relationship management
- [ ] **SDK**: Level 0 coordinator in Claude Code chat (supervisor)
- [ ] **SDK**: Session forking for hierarchical agent spawning

**Developer 2**:
- [ ] Hierarchical completion detection integration
- [ ] Task delegation workflows (PM → workers)
- [ ] **SDK**: Background bash process orchestration for child agents
- [ ] **SDK**: BashOutput monitoring for all child levels (Level 1-N)

**Developer 3**:
- [ ] Hierarchical state propagation (parent → children)
- [ ] Resource allocation in hierarchical topology
- [ ] **SDK**: Pause/inject/resume from Level 0 (parent controls all children)
- [ ] **SDK**: Cascading shutdown for graceful hierarchical termination

**SDK Specialist**:
- [ ] **SDK**: Multi-level hierarchy coordinator (10+ depth support)
- [ ] **SDK**: Nested agent control via query interrupt and resume
- [ ] **SDK**: Parent checkpoint triggers child checkpoints
- [ ] **SDK**: Background process lifecycle management

**Deliverables**:
- ✅ Hierarchical coordinator operational (PM-based pattern)
- ✅ Parent-child task delegation working
- ✅ **SDK**: Level 0 parent coordinator controls all nested levels
- ✅ **SDK**: Background bash processes spawn and monitor child agents
- ✅ **SDK**: BashOutput monitoring tracks child session status
- ✅ **SDK**: Pause/inject/resume works from Level 0 to any child level
- ✅ **SDK**: Cascading shutdown gracefully terminates all levels
- ✅ Performance: <2s spawning for 10 hierarchical agents

**Acceptance Criteria**:
- [ ] Hierarchical coordinator manages 20+ agents across 10+ levels
- [ ] Parent can pause any child agent at any level
- [ ] Parent can inject messages into child sessions
- [ ] Parent can resume paused children from exact checkpoint
- [ ] **SDK**: Background processes terminate gracefully on shutdown
- [ ] **SDK**: BashOutput monitoring detects child failures within 500ms
- [ ] **SDK**: Nested hierarchy recovers from checkpoints in <500ms

---

#### **Week 6: Mesh Coordination + Distributed Query Control**

**Developer 1 (Lead)**:
- [ ] `src/coordination/v2/coordinators/mesh-coordinator.ts` (Peer-to-peer coordination)
- [ ] Peer discovery and capability matching
- [ ] **SDK**: Query control for peer-to-peer negotiation
- [ ] **SDK**: Session forking for parallel peer spawning

**Developer 2**:
- [ ] Distributed completion detection (Dijkstra-Scholten algorithm)
- [ ] Help request routing in mesh topology
- [ ] **SDK**: Distributed pause/resume across mesh peers
- [ ] **SDK**: Peer-to-peer query control coordination

**Developer 3**:
- [ ] Mesh state synchronization (eventual consistency)
- [ ] Load balancing across mesh peers
- [ ] **SDK**: Session forking for parallel peer spawning
- [ ] **SDK**: Artifact-based peer state sharing

**SDK Specialist**:
- [ ] **SDK**: Query control for mesh peer negotiation
- [ ] **SDK**: Pause idle peers (zero token cost during negotiation)
- [ ] **SDK**: Resume peers when work available
- [ ] **SDK**: Artifact sharing across forked peer sessions

**Deliverables**:
- ✅ Mesh coordinator operational (peer-to-peer pattern)
- ✅ Distributed completion detection working
- ✅ **SDK**: Query control enables peer-to-peer negotiation
- ✅ **SDK**: Distributed pause/resume across all mesh peers
- ✅ **SDK**: Session forking spawns peers in parallel (<2s for 10 peers)
- ✅ **SDK**: Artifact-based peer state sharing operational
- ✅ Performance: >8000 coordinated messages/sec

**Acceptance Criteria**:
- [ ] Mesh coordinator manages 10 peer agents efficiently
- [ ] Distributed completion detection completes in <2000ms
- [ ] **SDK**: Peers can be paused during idle periods (zero token cost)
- [ ] **SDK**: Peers resume within 50ms when work arrives
- [ ] **SDK**: Session forking creates 10 peers in <2s
- [ ] **SDK**: Artifact sharing enables efficient peer state transfer
- [ ] **SDK**: Query control reduces token usage by 50-75% during negotiation

---

#### **Week 7: Help System + Waiting Agent Pool with SDK Pause**

**Developer 1 (Lead)**:
- [ ] `src/coordination/v2/help-system/help-request.ts` (Help request types)
- [ ] `src/coordination/v2/help-system/help-matcher.ts` (Capability matching)
- [ ] `src/coordination/v2/help-system/help-coordinator.ts` (Request routing)
- [ ] **SDK**: Query control for help request lifecycle

**Developer 2**:
- [ ] `src/coordination/v2/help-system/waiting-agent-pool.ts` (Available helpers)
- [ ] Help request timeout and retry logic
- [ ] **SDK**: Paused agent pool (zero token cost while waiting)
- [ ] **SDK**: Resume helpers when dependency arrives

**Developer 3**:
- [ ] Integration with state machine (WAITING → HELPING transitions)
- [ ] Help request metrics and monitoring
- [ ] **SDK**: Checkpoint-based helper state preservation
- [ ] **SDK**: Resume from checkpoint when help needed

**SDK Specialist**:
- [ ] **SDK**: Query control for pausing agents in WAITING state
- [ ] **SDK**: Zero-cost agent pool (paused until needed)
- [ ] **SDK**: Resume agents on help request arrival (event-driven)
- [ ] **SDK**: Checkpoint helper state for instant recovery

**Deliverables**:
- ✅ Help request routing operational
- ✅ Capability matching selecting best helpers
- ✅ WAITING → HELPING state transitions automated
- ✅ **SDK**: Waiting agent pool with zero-cost pausing
- ✅ **SDK**: Agents resume when dependencies arrive
- ✅ **SDK**: Query control manages help request lifecycle
- ✅ **SDK**: Checkpoint-based state preservation for helpers
- ✅ Performance: Helper resume latency <50ms

**Acceptance Criteria**:
- [ ] Help matcher finds suitable helpers in <100ms
- [ ] Help requests route to best-match agent within 200ms
- [ ] **SDK**: Waiting agents consume zero tokens while paused
- [ ] **SDK**: Agents resume within 50ms on help request arrival
- [ ] **SDK**: Query control pauses/resumes across help lifecycle
- [ ] **SDK**: Checkpoint recovery restores helper state in <500ms
- [ ] **SDK**: Paused agent pool scales to 50+ agents with zero cost

---

#### **Week 8: Deadlock Detection + Recovery via Checkpoints**

**Developer 1 (Lead)**:
- [ ] `src/coordination/v2/deadlock/wait-for-graph.ts` (WFG structure)
- [ ] `src/coordination/v2/deadlock/deadlock-detector.ts` (Cycle detection)
- [ ] **SDK**: Multi-level deadlock detection (nested agents)
- [ ] **SDK**: Checkpoint rollback for deadlock recovery

**Developer 2**:
- [ ] `src/coordination/v2/deadlock/deadlock-resolver.ts` (Resolution strategies)
- [ ] Resource ordering implementation (prevention)
- [ ] **SDK**: Resume from pre-deadlock checkpoint state
- [ ] **SDK**: Priority-based pause/resume for resolution

**Developer 3**:
- [ ] `src/coordination/v2/deadlock/resource-ordering.ts` (Prevention)
- [ ] Deadlock metrics and alerting
- [ ] **SDK**: Checkpoint-based recovery testing
- [ ] Integration tests: deadlock scenarios with recovery

**SDK Specialist**:
- [ ] **SDK**: Checkpoint rollback mechanism for deadlock recovery
- [ ] **SDK**: Resume agents from pre-deadlock checkpoints
- [ ] **SDK**: Multi-level deadlock detection across nested hierarchies
- [ ] **SDK**: Priority-based query control for deadlock resolution

**Deliverables**:
- ✅ WFG cycle detection functional (<500ms detection time)
- ✅ Deadlock resolution strategies implemented
- ✅ Resource ordering preventing deadlocks proactively
- ✅ **SDK**: Checkpoint rollback recovers from deadlocks
- ✅ **SDK**: Resume from pre-deadlock state in <500ms
- ✅ **SDK**: Multi-level deadlock detection across 10+ nested levels
- ✅ **SDK**: Priority-based pause/resume resolves deadlocks
- ✅ Performance: Deadlock recovery in <1s total

**Acceptance Criteria**:
- [ ] WFG cycle detection completes in <500ms
- [ ] Deadlock detection works across 50+ agents
- [ ] **SDK**: Checkpoint rollback restores pre-deadlock state
- [ ] **SDK**: Recovery from checkpoint completes in <500ms
- [ ] **SDK**: Multi-level deadlock detection works across nested hierarchies
- [ ] **SDK**: Priority-based pause/resume resolves circular dependencies
- [ ] **SDK**: Deadlock recovery success rate >95%
- [ ] **SDK**: Zero data loss during checkpoint rollback

---

#### **Week 9: System Integration + SDK Performance Optimization**

**Developer 1 (Lead)**:
- [ ] Component integration across all V2 modules
- [ ] `src/coordination/v2/coordinators/swarm-coordinator-v2.ts` (Main coordinator)
- [ ] End-to-end workflow testing
- [ ] **SDK**: Session pool optimization for large swarms

**Developer 2**:
- [ ] `src/coordination/v2/coordinators/hierarchical-coordinator.ts` integration
- [ ] `src/coordination/v2/coordinators/mesh-coordinator.ts` integration
- [ ] State machine + dependency manager integration
- [ ] **SDK**: Artifact cache tuning (target: <12ms storage)

**Developer 3**:
- [ ] Message bus + completion detector integration
- [ ] Help system + deadlock resolver integration
- [ ] SwarmMemory + V2 storage layer integration
- [ ] **SDK**: Query control overhead analysis and optimization

**SDK Specialist**:
- [ ] **SDK**: Session pool management for 50+ agents
- [ ] **SDK**: Checkpoint compression strategies (reduce storage footprint)
- [ ] **SDK**: Artifact cache warming for hot paths
- [ ] **SDK**: Background process resource allocation tuning

**Deliverables**:
- ✅ All V2 components integrated into unified system
- ✅ Cross-component workflows operational
- ✅ **SDK**: Session pool handles 50+ concurrent agents efficiently
- ✅ **SDK**: Artifact cache achieves <12ms storage latency
- ✅ **SDK**: Query control overhead optimized (<5% token cost)
- ✅ **SDK**: Checkpoint compression reduces storage by 60%

**Acceptance Criteria**:
- [ ] End-to-end hierarchical workflow completes successfully
- [ ] End-to-end mesh workflow completes successfully
- [ ] **SDK**: Session pool scales to 50 agents without degradation
- [ ] **SDK**: Artifact storage consistently <12ms (p95)
- [ ] **SDK**: Query control adds <5% overhead to message routing
- [ ] **SDK**: Checkpoint storage reduced by 60% via compression
- [ ] No integration bugs across component boundaries

---

#### **Week 10: Performance Tuning + SDK Benchmarking**

**Developer 1 (Lead)**:
- [ ] Performance profiling across all components
- [ ] Hotspot identification and optimization
- [ ] Memory leak detection and fixes
- [ ] **SDK**: Session forking scalability tests (50+ parallel agents)

**Developer 2**:
- [ ] Message bus throughput optimization (target: >8000 msg/s)
- [ ] Dependency resolution latency reduction
- [ ] State transition performance tuning
- [ ] **SDK**: Pause/resume latency optimization (target: <50ms)

**Developer 3**:
- [ ] Database query optimization
- [ ] Indexing strategy refinement
- [ ] Cache hit rate optimization
- [ ] **SDK**: Artifact storage benchmarks (validate 3.7x speedup)

**SDK Specialist**:
- [ ] **SDK**: Session forking benchmark suite (measure 10-20x improvement)
- [ ] **SDK**: Checkpoint recovery benchmarks (validate <500ms)
- [ ] **SDK**: Nested hierarchy performance validation (10+ levels)
- [ ] **SDK**: Background process overhead analysis

**Deliverables**:
- ✅ All performance targets achieved or exceeded
- ✅ Bottlenecks identified and resolved
- ✅ **SDK**: Session forking validated at 10-20x faster than sequential
- ✅ **SDK**: Pause/resume latency consistently <50ms
- ✅ **SDK**: Artifact storage validated at 3.7x faster than JSON
- ✅ **SDK**: Nested hierarchy performance acceptable (10+ levels)
- ✅ Comprehensive performance report generated

**Acceptance Criteria**:
- [ ] State transition latency (p99) <100ms
- [ ] Dependency resolution time (avg) <500ms
- [ ] Message bus throughput >8000 msg/s (SDK-enhanced)
- [ ] Completion detection (hierarchical) <1000ms
- [ ] **SDK**: Session forking spawns 20 agents in <2s
- [ ] **SDK**: Pause/resume latency <50ms (p95)
- [ ] **SDK**: Artifact storage <12ms (p95)
- [ ] **SDK**: Checkpoint recovery <500ms (p99)
- [ ] **SDK**: Nested hierarchy handles 10+ levels efficiently

---

#### **Week 11: Testing + SDK Validation**

**Developer 1 (Lead)**:
- [ ] Integration test suite completion (all workflows)
- [ ] Load testing (50+ agents, 10,000+ messages)
- [ ] Stress testing (resource exhaustion scenarios)
- [ ] **SDK**: Pause/resume test suite validation

**Developer 2**:
- [ ] Chaos engineering (failure injection, recovery testing)
- [ ] Edge case testing (deadlocks, race conditions)
- [ ] Regression test suite automation
- [ ] **SDK**: Nested agent spawning tests (10+ levels deep)

**Developer 3**:
- [ ] Security testing (input validation, injection attacks)
- [ ] Compliance testing (data retention, audit logs)
- [ ] Performance regression testing
- [ ] **SDK**: Checkpoint recovery tests (validate instant restoration)

**SDK Specialist**:
- [ ] **SDK**: Session forking stress tests (100+ concurrent forks)
- [ ] **SDK**: Query control edge cases (pause during state transitions)
- [ ] **SDK**: Artifact corruption recovery tests
- [ ] **SDK**: Background process failure scenarios

**Deliverables**:
- ✅ 100% unit test coverage for critical paths
- ✅ 95% integration test coverage
- ✅ All edge cases handled gracefully
- ✅ **SDK**: Pause/resume validated across all agent states
- ✅ **SDK**: Nested spawning validated to 15+ levels
- ✅ **SDK**: Checkpoint recovery 100% reliable
- ✅ **SDK**: Background process failures handled gracefully
- ✅ Zero critical bugs in final testing phase

**Acceptance Criteria**:
- [ ] All integration tests pass consistently
- [ ] Load tests handle 50 agents without failures
- [ ] Chaos tests recover from all failure scenarios
- [ ] **SDK**: Pause/resume works across all agent states
- [ ] **SDK**: Nested spawning works reliably to 15+ levels
- [ ] **SDK**: Checkpoint recovery success rate 100%
- [ ] **SDK**: Background process failures trigger proper cleanup
- [ ] **SDK**: Session forking handles 100+ concurrent forks
- [ ] Security audit passes with zero critical vulnerabilities

---

#### **Week 12: Documentation + Production Deployment**

**Developer 1 (Lead)**:
- [ ] API reference documentation complete
- [ ] Architecture guide finalization
- [ ] Migration guide for V1 → V2 transition
- [ ] **SDK**: SDK integration guide for developers

**Developer 2**:
- [ ] User guide and tutorials
- [ ] Troubleshooting documentation
- [ ] Performance tuning guide
- [ ] **SDK**: Nested agent coordination examples

**Developer 3**:
- [ ] Production deployment runbook
- [ ] Monitoring and alerting setup
- [ ] Incident response procedures
- [ ] **SDK**: Background process monitoring dashboard

**SDK Specialist**:
- [ ] **SDK**: Query control best practices guide
- [ ] **SDK**: Checkpoint strategy recommendations
- [ ] **SDK**: Session forking patterns documentation
- [ ] **SDK**: Production configuration templates

**All Developers**:
- [ ] Production deployment to staging
- [ ] Smoke testing in staging environment
- [ ] Production deployment (gradual rollout)
- [ ] Post-deployment monitoring
- [ ] V1 code removal after successful deployment

**Deliverables**:
- ✅ Complete documentation suite published
- ✅ **SDK**: Integration guide with code examples
- ✅ **SDK**: Nested agent coordination patterns documented
- ✅ **SDK**: Background process monitoring operational
- ✅ **SDK**: Query control best practices documented
- ✅ Production deployment successful
- ✅ Zero critical issues in first 48 hours
- ✅ V1 code removed from codebase

**Acceptance Criteria**:
- [ ] All documentation reviewed and approved
- [ ] **SDK**: Integration guide tested by external developers
- [ ] **SDK**: Code examples validated and working
- [ ] **SDK**: Best practices guide covers all SDK features
- [ ] Staging deployment validated with production-like load
- [ ] Production rollout completes without incidents
- [ ] Monitoring dashboards operational and alerting configured
- [ ] V1 migration completed with zero regressions

---

#### **Week 13: SDK Production Hardening** 🆕

**Developer 1 (Lead)**:
- [ ] Production SDK configuration optimization
- [ ] Resource allocation tuning based on production metrics
- [ ] Performance monitoring dashboard refinement
- [ ] **SDK**: Level 0 coordinator operational playbook

**Developer 2**:
- [ ] **SDK**: Monitoring for nested hierarchies (real-time visibility)
- [ ] **SDK**: Alert rules for checkpoint failures
- [ ] **SDK**: Session pool health monitoring
- [ ] **SDK**: Background process failure detection and recovery

**Developer 3**:
- [ ] **SDK**: Checkpoint backup strategies (disaster recovery)
- [ ] **SDK**: Artifact storage capacity planning
- [ ] **SDK**: Query control metrics and optimization
- [ ] **SDK**: Session forking rate limiting and throttling

**SDK Specialist**:
- [ ] **SDK**: Background process health checks (automated monitoring)
- [ ] **SDK**: Checkpoint rotation and archival policies
- [ ] **SDK**: Session pool autoscaling configuration
- [ ] **SDK**: Production incident runbook for SDK-specific issues

**All Developers**:
- [ ] Production incident drills (checkpoint recovery, session failures)
- [ ] Capacity planning review (scale to 100+ agents)
- [ ] Cost optimization analysis (token usage reduction validation)
- [ ] Final security audit (SDK-specific vulnerabilities)

**Deliverables**:
- ✅ **SDK**: Production configuration tuned for optimal performance
- ✅ **SDK**: Nested hierarchy monitoring operational (10+ levels)
- ✅ **SDK**: Checkpoint backup and recovery system validated
- ✅ **SDK**: Background process health checks automated
- ✅ **SDK**: Level 0 coordinator operational playbook complete
- ✅ **SDK**: Session pool autoscaling configured
- ✅ **SDK**: Incident response validated through drills
- ✅ System ready for enterprise-scale production workloads

**Acceptance Criteria**:
- [ ] **SDK**: Session pool handles 100+ agents with autoscaling
- [ ] **SDK**: Checkpoint recovery tested with 100% success rate
- [ ] **SDK**: Nested hierarchy monitoring covers all 10+ levels
- [ ] **SDK**: Background process failures detected within 500ms
- [ ] **SDK**: Artifact storage scales to 10GB+ without degradation
- [ ] **SDK**: Query control reduces token costs by 50-75% in production
- [ ] **SDK**: Level 0 coordinator playbook tested in incident drills
- [ ] Cost reduction validated: 50-75% token savings in production
- [ ] Performance validated: 10-20x spawning improvement sustained
- [ ] Recovery validated: <500ms checkpoint restoration under load

---

## Developer Assignment

### Team Structure

**Lead Architect** (1 developer):
- Overall architecture coordination
- Code reviews for critical components
- Performance optimization
- Production deployment
- SDK integration strategy oversight

**SDK Specialist** (1 developer - CRITICAL):
- Claude Code SDK integration and optimization
- Session forking and parallel spawning implementation
- Query control (pause/resume/interrupt) system
- Checkpoint and recovery system
- Artifact storage and binary format optimization
- Background process orchestration via BashOutput
- Multi-level hierarchy coordination (Level 0-N)
- Performance benchmarking SDK features

**Core Developer 1** (State & Dependency):
- State machine implementation
- Dependency graph and manager
- Deadlock detection
- Help system
- Integration with SDK checkpoints

**Core Developer 2** (Messaging & Completion):
- Message bus implementation
- Channel specialization
- Completion detection
- Consensus protocols
- SDK event-driven completion detector

**Core Developer 3** (Integration & Testing):
- SwarmMemory integration
- MCP tools development
- Testing infrastructure
- Documentation
- SDK integration testing

**Optional: QA Engineer**:
- Test case development
- Integration test automation
- Performance benchmarking
- Bug triage
- SDK feature validation

### Skill Requirements

| Role | Required Skills | Nice to Have |
|------|----------------|--------------|
| **Lead Architect** | TypeScript, distributed systems, state machines | Multi-agent systems, consensus algorithms, SDK architecture |
| **SDK Specialist** | TypeScript, Claude Code SDK, session management, async patterns | Background process orchestration, checkpoint systems, binary formats |
| **Core Developer 1** | TypeScript, graph algorithms, DAG | Event-driven architecture, actor models |
| **Core Developer 2** | TypeScript, message queues, pub/sub | Distributed systems, Byzantine consensus |
| **Core Developer 3** | TypeScript, testing frameworks, SQL | Documentation, technical writing |
| **QA Engineer** | Jest, integration testing, performance testing | Load testing, chaos engineering |

### Team Collaboration Model

**Week 0 (SDK Foundation)**:
- SDK Specialist leads all developers through SDK onboarding
- Pair programming sessions on session forking and query control
- Shared responsibility for understanding checkpoint and artifact systems

**Weeks 1-12 (Parallel Development)**:
- SDK Specialist provides ongoing integration support to all developers
- Daily standups include SDK performance metrics review
- Code reviews require SDK Specialist approval for performance-critical paths

---

## Testing Requirements

### Unit Test Coverage Targets

| Component | Coverage Target | Critical Paths |
|-----------|----------------|----------------|
| **State Machine** | 100% | All transition paths, invalid transitions |
| **Dependency Manager** | 95% | Cycle detection, topological sort |
| **Message Bus** | 95% | Priority routing, delivery guarantees |
| **Completion Detector** | 100% | All completion scenarios, false positives |
| **Deadlock Detector** | 95% | Cycle detection, resolution strategies |
| **Help System** | 90% | Capability matching, help routing |
| **CoordinatorFactory** | 100% | Mode detection, fallback logic |
| **CLICoordinator** | 95% | Process pool, SIGSTOP/SIGCONT, file I/O |
| **SDKCoordinator** | 95% | Session forking, pause/resume, checkpoints |
| **HybridCoordinator** | 95% | Provider routing, failover, cost tracking |
| **Provider Adapters** | 90% | API translation, error handling |

### Mode-Specific Test Scenarios

**CLI Mode Tests**:
```typescript
describe('CLI Coordination Mode', () => {
  test('spawns agents from process pool in <100ms', async () => {
    const coordinator = await CoordinatorFactory.create({ mode: 'cli' });
    const start = Date.now();

    const agent = await coordinator.spawnAgent({
      agentType: 'coder',
      task: 'Test task'
    });

    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(100);
    expect(agent).toBeDefined();
  });

  test('pauses agent via SIGSTOP', async () => {
    const coordinator = await CoordinatorFactory.create({ mode: 'cli' });
    const agent = await coordinator.spawnAgent({
      agentType: 'coder',
      task: 'Test task'
    });

    await coordinator.pauseAgent(agent.id);

    const state = await coordinator.getAgentState(agent.id);
    expect(state.status).toBe('paused');
  });

  test('creates checkpoint to /dev/shm', async () => {
    const coordinator = await CoordinatorFactory.create({ mode: 'cli' });
    const agent = await coordinator.spawnAgent({
      agentType: 'coder',
      task: 'Test task'
    });

    const checkpoint = await coordinator.createCheckpoint(agent.id);

    expect(checkpoint.canResume).toBe(true);
    expect(fs.existsSync(checkpoint.filePath)).toBe(true);
    expect(checkpoint.filePath).toContain('/dev/shm');
  });
});
```

**SDK Mode Tests**:
```typescript
describe('SDK Coordination Mode', () => {
  test('spawns agents via session forking in <100ms', async () => {
    const coordinator = await CoordinatorFactory.create({ mode: 'sdk' });
    const start = Date.now();

    const agent = await coordinator.spawnAgent({
      agentType: 'coder',
      task: 'Test task'
    });

    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(100);
    expect(agent.sessionId).toBeDefined();
  });

  test('pauses agent via SDK interrupt()', async () => {
    const coordinator = await CoordinatorFactory.create({ mode: 'sdk' });
    const agent = await coordinator.spawnAgent({
      agentType: 'coder',
      task: 'Test task'
    });

    await coordinator.pauseAgent(agent.id);

    const state = await coordinator.getAgentState(agent.id);
    expect(state.status).toBe('paused');
    expect(state.checkpointUUID).toBeDefined();
  });

  test('resumes from message UUID checkpoint', async () => {
    const coordinator = await CoordinatorFactory.create({ mode: 'sdk' });
    const agent = await coordinator.spawnAgent({
      agentType: 'coder',
      task: 'Test task'
    });

    const checkpoint = await coordinator.createCheckpoint(agent.id);
    await coordinator.terminateAgent(agent.id);

    const restored = await coordinator.restoreCheckpoint(checkpoint.id);
    expect(restored.id).toBe(agent.id);
  });
});
```

**Hybrid Mode Tests**:
```typescript
describe('Hybrid Coordination Mode', () => {
  test('routes to cost-optimized provider', async () => {
    const coordinator = await CoordinatorFactory.create({
      mode: 'hybrid',
      providers: {
        'anthropic': { apiKey: process.env.ANTHROPIC_API_KEY },
        'z-ai': { apiKey: process.env.Z_AI_API_KEY }
      }
    });

    const coder = await coordinator.spawnAgent({
      agentType: 'coder',
      task: 'Write function'
    });

    expect(coder.provider).toBe('z-ai'); // Routed to cheaper provider
  });

  test('uses Anthropic for critical coordination', async () => {
    const coordinator = await CoordinatorFactory.create({ mode: 'hybrid' });

    const validator = await coordinator.spawnAgent({
      agentType: 'validator',
      task: 'Validate consensus'
    });

    expect(validator.provider).toBe('anthropic'); // Critical task uses reliable provider
  });

  test('fails over to backup provider on error', async () => {
    const coordinator = await CoordinatorFactory.create({
      mode: 'hybrid',
      fallback: {
        enabled: true,
        order: ['z-ai', 'anthropic']
      }
    });

    // Simulate Z.ai failure
    mockProvider('z-ai').mockImplementationOnce(() => {
      throw new Error('RATE_LIMIT');
    });

    const agent = await coordinator.spawnAgent({
      agentType: 'coder',
      task: 'Test failover'
    });

    expect(agent.provider).toBe('anthropic'); // Fell back to Anthropic
  });
});
```

### Provider-Specific Test Scenarios

**Z.ai Provider Tests**:
```typescript
describe('Z.ai Provider', () => {
  test('extends AnthropicProvider compatibility', () => {
    const provider = new ZaiProvider({ apiKey: 'test' });
    expect(provider).toBeInstanceOf(AnthropicProvider);
  });

  test('calculates 96% cost savings vs Anthropic', () => {
    const provider = new ZaiProvider({ apiKey: 'test' });
    const savings = provider.calculateCostSavings('glm-4.6');
    expect(parseInt(savings)).toBeGreaterThan(95);
  });

  test('uses correct GLM model pricing', async () => {
    const provider = new ZaiProvider({
      apiKey: 'test',
      model: 'glm-4.6'
    });

    const cost = await provider.estimateCost({
      messages: [{ role: 'user', content: 'test' }]
    });

    expect(cost.promptCostPer1k).toBe(0.00041);
    expect(cost.completionCostPer1k).toBe(0.00165);
  });
});
```

**OpenRouter Provider Tests**:
```typescript
describe('OpenRouter Provider', () => {
  test('supports multi-model routing', async () => {
    const provider = new OpenRouterProvider({ apiKey: 'test' });

    const models = await provider.listModels();
    expect(models.length).toBeGreaterThan(200);
  });

  test('translates Anthropic API format', async () => {
    const provider = new OpenRouterProvider({ apiKey: 'test' });

    const request = {
      model: 'google/gemini-2.5-pro',
      messages: [{ role: 'user', content: 'test' }]
    };

    const translated = provider.translateRequest(request);
    expect(translated.model).toBe('google/gemini-2.5-pro');
  });
});
```

### Integration Test Scenarios

**Scenario 1: Hierarchical Workflow**:
```typescript
test('hierarchical: 8 agents with dependencies', async () => {
  const coordinator = new SwarmCoordinatorV2({ topology: 'hierarchical', maxAgents: 8 });
  await coordinator.initialize();

  // Register 8 agents with different capabilities
  const agents = await Promise.all([
    coordinator.registerAgent('pm', ['coordination', 'planning']),
    coordinator.registerAgent('researcher', ['research', 'analysis']),
    coordinator.registerAgent('architect', ['architecture', 'design']),
    coordinator.registerAgent('coder-1', ['coding', 'typescript']),
    coordinator.registerAgent('coder-2', ['coding', 'python']),
    coordinator.registerAgent('tester', ['testing', 'qa']),
    coordinator.registerAgent('reviewer', ['code-review', 'quality']),
    coordinator.registerAgent('documenter', ['documentation', 'writing'])
  ]);

  // Create objective with tasks
  const objectiveId = await coordinator.createObjective({
    title: 'Build Authentication System',
    tasks: [
      { type: 'research', description: 'Research auth patterns', assignedTo: agents[1] },
      { type: 'architecture', description: 'Design auth architecture', assignedTo: agents[2], dependencies: ['research'] },
      { type: 'implementation', description: 'Implement JWT auth', assignedTo: agents[3], dependencies: ['architecture'] },
      { type: 'testing', description: 'Test auth system', assignedTo: agents[5], dependencies: ['implementation'] },
      { type: 'review', description: 'Code review', assignedTo: agents[6], dependencies: ['testing'] },
      { type: 'documentation', description: 'Create API docs', assignedTo: agents[7], dependencies: ['review'] }
    ]
  });

  // Execute and wait for completion
  await coordinator.executeObjective(objectiveId);

  const completed = await coordinator.waitForCompletion(120000); // 2 min timeout

  expect(completed).toBe(true);
  expect(coordinator.getObjectiveStatus(objectiveId).status).toBe('completed');
});
```

**Scenario 2: Mesh Workflow with Help Requests**:
```typescript
test('mesh: 5 agents with help requests', async () => {
  const coordinator = new SwarmCoordinatorV2({ topology: 'mesh', maxAgents: 5 });
  await coordinator.initialize();

  // Register agents
  const agents = await Promise.all([
    coordinator.registerAgent('coder-1', ['coding']),
    coordinator.registerAgent('coder-2', ['coding']),
    coordinator.registerAgent('researcher', ['research']),
    coordinator.registerAgent('tester', ['testing']),
    coordinator.registerAgent('reviewer', ['code-review'])
  ]);

  // Create tasks
  const tasks = [
    { id: 'task-1', type: 'code', assignedTo: agents[0] },
    { id: 'task-2', type: 'code', assignedTo: agents[1] }
  ];

  // Assign tasks
  for (const task of tasks) {
    await coordinator.assignTask(task);
  }

  // Wait for agents to finish and enter WAITING state
  await coordinator.waitForAllAgentsWaiting(60000);

  // Verify agents offered help
  const waitingAgents = coordinator.getWaitingAgents();
  expect(waitingAgents.length).toBeGreaterThan(0);

  // Verify completion
  const completed = await coordinator.checkSwarmCompletion();
  expect(completed).toBe(true);
});
```

### Performance Benchmarks

**State Machine Benchmarks**:
```typescript
describe('State Machine Performance', () => {
  test('1000 state transitions < 100ms avg', async () => {
    const sm = new StateMachineManager();
    const agents = createTestAgents(100);

    const start = Date.now();

    for (let i = 0; i < 1000; i++) {
      await sm.transition(agents[i % 100].id, AgentState.WORKING, 'test');
    }

    const duration = Date.now() - start;
    expect(duration / 1000).toBeLessThan(100); // <100ms avg
  });
});
```

**Dependency Resolution Benchmarks**:
```typescript
describe('Dependency Resolution Performance', () => {
  test('resolve 100 dependencies < 500ms avg', async () => {
    const dm = new DependencyManager();

    const requests = Array.from({ length: 100 }, (_, i) =>
      createDependencyRequest(`agent-${i}`, DependencyType.DATA)
    );

    const start = Date.now();

    for (const request of requests) {
      await dm.requestDependency(request);
      await dm.resolveDependency(request.id, createResolution(request.id));
    }

    const duration = Date.now() - start;
    expect(duration / 100).toBeLessThan(500); // <500ms avg
  });
});
```

**Message Bus Benchmarks**:
```typescript
describe('Message Bus Performance', () => {
  test('5000 messages/sec throughput', async () => {
    const bus = new MessageBusV2();
    await bus.createChannel(CHANNELS.STATE);

    const messageCount = 5000;
    const start = Date.now();

    for (let i = 0; i < messageCount; i++) {
      await bus.broadcast(CHANNELS.STATE.name, createTestMessage());
    }

    const duration = Date.now() - start;
    const throughput = (messageCount / duration) * 1000; // msgs/sec

    expect(throughput).toBeGreaterThan(5000);
  });
});
```

---

## Integration Points

### 1. SwarmCoordinator → StateMachineManager

```typescript
// src/coordination/swarm-coordinator.ts
export class SwarmCoordinator {
  private stateMachine: StateMachineManager;

  async registerAgent(name: string, type: string, capabilities: string[]): Promise<string> {
    const agentId = generateId('agent');

    // Register with state machine
    await this.stateMachine.registerAgent({
      id: agentId,
      name,
      type,
      state: AgentState.IDLE,
      capabilities
    });

    // Listen for state changes
    this.stateMachine.on('state-change', (transition) => {
      if (transition.agentId === agentId) {
        this.handleAgentStateChange(transition);
      }
    });

    return agentId;
  }

  private async handleAgentStateChange(transition: StateTransition) {
    switch (transition.toState) {
      case AgentState.WAITING:
        await this.offerHelp(transition.agentId);
        break;
      case AgentState.BLOCKED:
        await this.resolveDependencies(transition.agentId);
        break;
      case AgentState.COMPLETE:
        await this.checkSwarmCompletion();
        break;
    }
  }
}
```

### 2. DependencyManager → MessageBus

```typescript
// src/coordination/v2/dependency/dependency-manager.ts
export class DependencyManager {
  private messageBus: MessageBusV2;

  async requestDependency(request: DependencyRequest): Promise<string> {
    // Broadcast dependency request
    await this.messageBus.broadcast(
      CHANNELS.DEPENDENCY.name,
      {
        type: MessageType.DEPENDENCY_REQUEST,
        payload: request,
        sender: request.requesterId
      }
    );

    // Listen for resolutions
    this.messageBus.subscribe(
      CHANNELS.DEPENDENCY.name,
      request.requesterId,
      (message) => {
        if (message.type === MessageType.DEPENDENCY_RESOLUTION) {
          this.handleResolution(message.payload);
        }
      }
    );

    return request.id;
  }
}
```

### 3. Orchestrator → SwarmCoordinatorV2

```typescript
// src/core/orchestrator.ts
export class Orchestrator {
  private coordinatorV2: SwarmCoordinatorV2;

  async initialize() {
    // Initialize V2 coordinator
    this.coordinatorV2 = new SwarmCoordinatorV2({
      topology: 'mesh',
      maxAgents: this.config.orchestrator.maxConcurrentAgents,
      enableCompletionDetection: true
    });

    await this.coordinatorV2.initialize();

    // Bridge events
    this.coordinatorV2.on('swarm:complete', (result) => {
      this.eventBus.emit(SystemEvents.SWARM_COMPLETE, result);
    });
  }

  async spawnAgent(profile: AgentProfile): Promise<string> {
    // Use V2 coordinator
    const agentId = await this.coordinatorV2.registerAgent(
      profile.name,
      profile.type,
      profile.capabilities
    );

    return agentId;
  }
}
```

### 4. SwarmMemory → V2 Storage

```typescript
// src/memory/swarm-memory.ts
export class SwarmMemoryManager {
  async storeStateTransition(transition: StateTransition): Promise<void> {
    await this.remember(
      transition.agentId,
      'state',
      {
        agentState: transition.toState,
        stateTransition: transition
      },
      {
        tags: ['state-transition', transition.toState],
        shareLevel: 'team'
      }
    );
  }

  async storeDependencyRequest(request: DependencyRequest): Promise<void> {
    await this.remember(
      request.requesterId,
      'dependency',
      {
        dependencyRequest: request
      },
      {
        tags: ['dependency', request.type],
        shareLevel: 'team'
      }
    );
  }
}
```

---

## Provider Integration Strategy

### Three-Tier Provider Routing Architecture

The V2 system implements a sophisticated 3-tier routing strategy that optimizes cost while maintaining quality for critical operations. This approach leverages the strengths of each provider tier for maximum efficiency.

### Phase 1: Core Providers (Weeks 3-4)

**Tier 1: Claude Code Subscription Provider** (Important Agents - Preferred):
- **Cost**: $0 within subscription limits
- **Implementation**: Native Claude Code CLI integration
- **Agent Allocation**: Important agents only (planners, reviewers, architects, coordinators)
- **Reasoning**: Maximizes value from existing subscription for high-stakes decisions
- **Fallback Strategy**: Automatic failover to Tier 2 (Anthropic API) when limits reached
- **Limit Monitoring**: Real-time tracking of subscription usage with proactive fallback
- **Use Cases**: Strategic planning, code review, architecture decisions, swarm coordination
- **Volume**: ~15% of total agent work
- **Quality**: Maximum (native Claude reasoning)

**Tier 2: Anthropic API Provider** (SDK + Fallback):
- **Cost**: $5/$25 per MTok (input/output)
- Official Anthropic API via @anthropic-ai/sdk
- Full SDK feature support (session forking, checkpoints, artifacts)
- Serves as reference implementation
- **Dual Purpose**:
  1. Required for SDK operations (session forking, checkpoints, query control)
  2. Fallback for important agents when Tier 1 unavailable/limited
- **Agent Allocation**:
  - Direct: validators, security-specialist, system-architect
  - Fallback: planners, reviewers, architects, coordinators (when Tier 1 limited)
- **Volume**: ~15% of total agent work (5% SDK + 10% fallback)
- **Quality**: Maximum reliability and full SDK feature set

**Tier 3: Z.ai Provider** (Bulk Routine Work):
- **Cost**: $3/$15 per MTok (~40% savings vs Anthropic) - VALIDATED
- **Models**: GLM-4.6 (200K context, thinking model) or GLM-4.5 (128K context)
- **Configuration**:
  - Default: 8,192 tokens (optimized for 500 line per file)
  - Minimum: 201 tokens (GLM-4.6 boundary requirement)
  - Maximum: 80,000 tokens (validated for large tasks)
- Extends AnthropicProvider class for maximum compatibility
- 100% Anthropic API compatibility via https://api.z.ai/api/anthropic
- Subscription-based: Lite ($3/mo, 120 prompts/5h) or Pro ($15/mo, 600 prompts/5h)
- **Agent Allocation**: All routine workers (coders, testers, researchers, documenters)
- **Reasoning**: Routine implementation doesn't require premium models
- **Volume**: ~70% of total agent work
- **Quality**: ~94% of Claude quality, sufficient for routine tasks
- **Validated**: Production-ready with comprehensive testing (80K token capability confirmed)
- Best for: High-volume worker agents with well-defined tasks
- **Guideline**: 500 lines per file maximum for optimal token usage

**CLI Provider** (Free Tier - Development):
- Process pool management for fast spawning
- File-based state persistence
- SIGSTOP/SIGCONT for pause/resume
- Zero external dependencies
- Best for: Development, learning, free tier users
- **Note**: Not part of 3-tier production routing (separate development mode)

### Phase 2: Extended Providers (Weeks 5-6)

**OpenRouter Provider** (Multi-Model Access):
- Access to 200+ models (OpenAI, Anthropic, Google, Meta, etc.)
- ~95% SDK compatibility (some translation required)
- Pay-as-you-go pricing
- Best for: Model experimentation, multi-model workflows

**Custom Provider Adapter**:
- Template for adding new providers
- Adapter pattern for API translation
- Provider capability matrix
- Best for: Enterprise with custom LLM infrastructure

### Provider Selection Logic (3-Tier Routing)

```typescript
interface ProviderRoutingRule {
  tier: 1 | 2 | 3;
  condition: (agent: Agent, task: Task) => boolean;
  provider: 'claude-code-subscription' | 'anthropic-api' | 'z-ai';
  model: string;
  reason: string;
  fallbackTier?: number;
}

const IMPORTANT_AGENTS = [
  'planner',
  'reviewer',
  'architect',
  'coordinator'
] as const;

const SDK_REQUIRED_AGENTS = [
  'validator',
  'security-specialist',
  'system-architect'
] as const;

const ROUTINE_AGENTS = [
  'coder',
  'tester',
  'researcher',
  'documenter'
] as const;

const tieredRoutingRules: ProviderRoutingRule[] = [
  // Tier 1: Important agents prefer subscription (with fallback)
  {
    tier: 1,
    condition: (agent) => IMPORTANT_AGENTS.includes(agent.type as any),
    provider: 'claude-code-subscription',
    model: 'claude-sonnet-4.5',
    reason: 'Strategic decisions require Claude reasoning (use free subscription)',
    fallbackTier: 2
  },

  // Tier 2: SDK operations and important agent fallback
  {
    tier: 2,
    condition: (agent, task) =>
      SDK_REQUIRED_AGENTS.includes(agent.type as any) ||
      (IMPORTANT_AGENTS.includes(agent.type as any) && !subscriptionAvailable()),
    provider: 'anthropic-api',
    model: 'claude-sonnet-4.1',
    reason: 'SDK features required OR subscription exhausted for important agent'
  },

  // Tier 2: Complex tasks requiring SDK capabilities
  {
    tier: 2,
    condition: (agent, task) => task.requiresSDK === true,
    provider: 'anthropic-api',
    model: 'claude-sonnet-4.1',
    reason: 'Task requires session forking, checkpoints, or artifacts'
  },

  // Tier 3: All routine worker agents
  {
    tier: 3,
    condition: (agent) => ROUTINE_AGENTS.includes(agent.type as any),
    provider: 'z-ai',
    model: 'glm-4.6',
    reason: '96% cost savings on routine implementation work'
  },

  // Default: Route unknown agents to Tier 3 (cost-optimized)
  {
    tier: 3,
    condition: () => true,
    provider: 'z-ai',
    model: 'glm-4.5',
    reason: 'Default to cost-optimized provider for undefined agent types'
  }
];

// Router implementation
class TieredProviderRouter {
  private subscriptionMonitor: SubscriptionLimitMonitor;

  async routeAgent(agent: Agent, task: Task): Promise<ProviderConfig> {
    for (const rule of tieredRoutingRules) {
      if (rule.condition(agent, task)) {
        // Check if subscription is available for Tier 1
        if (rule.provider === 'claude-code-subscription') {
          if (await this.subscriptionMonitor.isAvailable()) {
            return {
              tier: rule.tier,
              provider: rule.provider,
              model: rule.model,
              reason: rule.reason
            };
          }

          // Fallback to Tier 2 if subscription limited
          if (rule.fallbackTier) {
            return {
              tier: rule.fallbackTier,
              provider: 'anthropic-api',
              model: 'claude-sonnet-4.1',
              reason: `${rule.reason} (fallback: subscription limit reached)`
            };
          }
        }

        return {
          tier: rule.tier,
          provider: rule.provider,
          model: rule.model,
          reason: rule.reason
        };
      }
    }

    throw new Error('No routing rule matched (should never happen)');
  }

  // Real-time subscription monitoring
  async checkSubscriptionStatus(): Promise<SubscriptionStatus> {
    return this.subscriptionMonitor.getStatus();
  }
}

// Subscription monitoring for proactive fallback
interface SubscriptionStatus {
  available: boolean;
  limited: boolean;
  usagePercent: number;
  resetTime?: Date;
  fallbackTriggered: boolean;
}

function subscriptionAvailable(): boolean {
  // Implementation checks Claude Code subscription limits
  // Returns false when approaching or at limits
  return true; // Placeholder
}
```

### Provider Failover Strategy (3-Tier Aware)

```typescript
interface TieredFallbackConfig {
  enabled: boolean;
  strategy: 'tier-cascade' | 'tier-aware-round-robin';
  tierFallbackRules: {
    tier1: {
      primary: 'claude-code-subscription';
      fallbackTo: 'tier2';
      conditions: ['SUBSCRIPTION_LIMIT', 'RATE_LIMIT'];
      monitoring: 'proactive'; // Fallback before hitting limits
      thresholds: {
        usagePercent: 90; // Trigger fallback at 90% usage
      };
    };
    tier2: {
      primary: 'anthropic-api';
      fallbackTo: 'tier3';
      conditions: ['RATE_LIMIT', 'SERVICE_UNAVAILABLE'];
      monitoring: 'reactive'; // Fallback on error
    };
    tier3: {
      primary: 'z-ai';
      fallbackTo: 'tier2'; // Escalate to more reliable if Z.ai fails
      conditions: ['SERVICE_UNAVAILABLE', 'AUTHENTICATION'];
      monitoring: 'reactive';
    };
  };
  retryAttempts: 3;
  conditions: {
    RATE_LIMIT: 'switch-provider';
    SUBSCRIPTION_LIMIT: 'switch-provider';
    SERVICE_UNAVAILABLE: 'switch-provider';
    TIMEOUT: 'retry-same';
    AUTHENTICATION: 'escalate';
    QUALITY_FAILURE: 'escalate-tier'; // Move important agent from Tier 3 to Tier 2
  };
}

const tieredFallbackConfig: TieredFallbackConfig = {
  enabled: true,
  strategy: 'tier-cascade',
  tierFallbackRules: {
    tier1: {
      primary: 'claude-code-subscription',
      fallbackTo: 'tier2',
      conditions: ['SUBSCRIPTION_LIMIT', 'RATE_LIMIT'],
      monitoring: 'proactive',
      thresholds: {
        usagePercent: 90 // Trigger fallback before hitting hard limits
      }
    },
    tier2: {
      primary: 'anthropic-api',
      fallbackTo: 'tier3',
      conditions: ['RATE_LIMIT', 'SERVICE_UNAVAILABLE'],
      monitoring: 'reactive'
    },
    tier3: {
      primary: 'z-ai',
      fallbackTo: 'tier2', // Escalate back up if Z.ai fails
      conditions: ['SERVICE_UNAVAILABLE', 'AUTHENTICATION'],
      monitoring: 'reactive'
    }
  },
  retryAttempts: 3,
  conditions: {
    RATE_LIMIT: 'switch-provider',
    SUBSCRIPTION_LIMIT: 'switch-provider',
    SERVICE_UNAVAILABLE: 'switch-provider',
    TIMEOUT: 'retry-same',
    AUTHENTICATION: 'escalate',
    QUALITY_FAILURE: 'escalate-tier'
  }
};

// Fallback orchestrator with tier awareness
class TieredFallbackOrchestrator {
  async executeWithFallback<T>(
    agentType: string,
    task: Task,
    operation: (provider: ProviderConfig) => Promise<T>
  ): Promise<T> {
    const initialRoute = await this.router.routeAgent({ type: agentType }, task);
    let currentTier = initialRoute.tier;
    let attempts = 0;

    while (attempts < this.config.retryAttempts) {
      try {
        const provider = await this.getProviderForTier(currentTier, agentType);
        return await operation(provider);
      } catch (error) {
        const failureType = this.classifyError(error);
        const action = this.config.conditions[failureType];

        if (action === 'switch-provider' || action === 'escalate-tier') {
          // Get fallback tier
          const fallbackTier = this.getFallbackTier(currentTier, failureType);
          if (!fallbackTier) {
            throw new Error(`All provider tiers exhausted for ${agentType}`);
          }

          this.logger.warn(
            `Tier ${currentTier} failed (${failureType}), falling back to Tier ${fallbackTier}`
          );
          currentTier = fallbackTier;
          attempts++;
        } else if (action === 'retry-same') {
          attempts++;
        } else {
          throw error; // Escalate to human
        }
      }
    }

    throw new Error(`Operation failed after ${attempts} attempts across tiers`);
  }

  private getFallbackTier(
    currentTier: number,
    failureType: string
  ): number | null {
    const rules = this.config.tierFallbackRules;

    switch (currentTier) {
      case 1:
        // Tier 1 → Tier 2 (maintain quality for important agents)
        return 2;
      case 2:
        // Tier 2 → Tier 3 (cost optimization under load)
        return 3;
      case 3:
        // Tier 3 → Tier 2 (escalate on failure for reliability)
        return 2;
      default:
        return null;
    }
  }

  private classifyError(error: any): string {
    if (error.status === 429) return 'RATE_LIMIT';
    if (error.message?.includes('subscription limit')) return 'SUBSCRIPTION_LIMIT';
    if (error.status === 503) return 'SERVICE_UNAVAILABLE';
    if (error.code === 'ETIMEDOUT') return 'TIMEOUT';
    if (error.status === 401 || error.status === 403) return 'AUTHENTICATION';
    return 'UNKNOWN';
  }
}

// Proactive subscription monitoring (prevents Tier 1 failures)
class SubscriptionLimitMonitor {
  private usageCache: Map<string, SubscriptionStatus> = new Map();

  async monitorSubscriptionLimits(): Promise<void> {
    setInterval(async () => {
      const status = await this.checkClaudeCodeSubscription();

      if (status.usagePercent >= 90) {
        this.logger.warn(
          `Subscription usage at ${status.usagePercent}%, triggering proactive fallback to Tier 2`
        );
        this.eventBus.emit('subscription:limit-approaching', status);
      }

      this.usageCache.set('claude-code-subscription', status);
    }, 60000); // Check every minute
  }

  async isAvailable(): Promise<boolean> {
    const status = this.usageCache.get('claude-code-subscription');
    return status ? !status.limited && status.usagePercent < 90 : true;
  }

  private async checkClaudeCodeSubscription(): Promise<SubscriptionStatus> {
    // Implementation queries Claude Code subscription API
    // Returns current usage, limits, and reset time
    return {
      available: true,
      limited: false,
      usagePercent: 0,
      resetTime: new Date(),
      fallbackTriggered: false
    };
  }
}
```

### Provider Compatibility Matrix (3-Tier System)

| Feature | Tier 1 (Subscription) | Tier 2 (Anthropic) | Tier 3 (Z.ai) | CLI (Dev) | OpenRouter (Alt) |
|---------|----------------------|--------------------|---------------|-----------|------------------|
| **Agent Types** | Important agents | SDK + fallback | Routine workers | Development | Experimental |
| **Session Forking** | ✅ Native | ✅ Native | ✅ Native | ❌ Process spawn | ⚠️ Limited |
| **Pause/Resume** | ✅ Native | ✅ Native | ✅ Native | ⚠️ SIGSTOP | ❌ Not supported |
| **Checkpoints** | ✅ Message UUID | ✅ Message UUID | ✅ Message UUID | ✅ File-based | ⚠️ Custom |
| **Streaming** | ✅ SSE | ✅ SSE | ✅ SSE | ✅ stdout | ✅ SSE |
| **Context Window** | 200K | 200K | 200K | N/A | Varies |
| **Cost** | **$0** (within limits) | $5/$25 MTok | $0.41/$1.65 MTok | $0 | $0.27-5 MTok |
| **Rate Limits** | Subscription-based | Tier-based | 60-200 req/min | Local only | Varies |
| **Model Choice** | Claude Sonnet 4.5 | Claude Sonnet 4.1 | GLM-4.5/4.6 | Claude only | 200+ models |
| **Fallback Strategy** | → Tier 2 at 90% | → Tier 3 on load | → Tier 2 on fail | N/A | → Anthropic |
| **Use Cases** | Strategic decisions | SDK + coordination | Bulk work | Development | Multi-model |
| **Work Volume** | ~15% | ~15% (5% + 10%) | ~70% | N/A | Optional |
| **Quality Tier** | Maximum | Maximum | ~94% of Claude | Development | Varies |

### Three-Tier Cost Optimization Summary

**Monthly Cost Breakdown (10-agent swarm, 8 hours/day, 20 business days)**:

```
┌─────────────────────────────────────────────────────────────────────┐
│ TIER 1: CLAUDE CODE SUBSCRIPTION (Important Agents)                 │
├─────────────────────────────────────────────────────────────────────┤
│ Agents: planner, reviewer, architect, coordinator (4 agents)        │
│ Work Volume: ~15% of total workload                                 │
│ Cost: $0 (within subscription limits)                               │
│ Fallback: Tier 2 when limits reached (~10% of work)                 │
│ Quality: Maximum (native Claude reasoning)                          │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ TIER 2: ANTHROPIC API (SDK Operations + Fallback)                   │
├─────────────────────────────────────────────────────────────────────┤
│ Direct Usage:                                                        │
│   - SDK operations (session forking, checkpoints): ~5%              │
│   - validators, security-specialist: ~5%                            │
│ Fallback Usage:                                                      │
│   - Important agents when Tier 1 limited: ~10%                      │
│ Total Volume: ~15%                                                   │
│ Cost: ~$50/month                                                     │
│ Quality: Maximum reliability + full SDK features                    │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ TIER 3: Z.AI (Routine Bulk Work)                                    │
├─────────────────────────────────────────────────────────────────────┤
│ Agents: coder, tester, researcher, documenter (6 agents)            │
│ Work Volume: ~70% of total workload                                 │
│ Subscription: Pro ($15/mo, 200 req/min)                             │
│ API Cost: ~$30/month (usage-based)                                  │
│ Total Cost: ~$15/month (subscription covers most usage)             │
│ Savings vs Anthropic: 96% per token                                 │
│ Quality: ~94% of Claude, sufficient for routine tasks               │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ TOTAL MONTHLY COST: ~$65                                            │
├─────────────────────────────────────────────────────────────────────┤
│ vs Pure Anthropic ($600-1000): 89-93% SAVINGS                       │
│ vs Pure Z.ai ($150): Better quality for critical work               │
│ vs 2-Tier Hybrid ($200): 67% savings with subscription leverage     │
└─────────────────────────────────────────────────────────────────────┘
```

**Cost Per Agent Type (Monthly)**:

| Agent Type | Tier | Count | Monthly Cost | Reasoning |
|------------|------|-------|--------------|-----------|
| `planner` | 1 → 2 | 1 | $0-10 | Free unless subscription limited |
| `reviewer` | 1 → 2 | 1 | $0-10 | Free unless subscription limited |
| `architect` | 1 → 2 | 1 | $0-10 | Free unless subscription limited |
| `coordinator` | 2 | 1 | $15 | SDK session forking required |
| `validator` | 2 | 1 | $10 | Byzantine consensus + SDK |
| `security-specialist` | 2 | 1 | $5 | Security validation critical |
| `coder` | 3 | 2 | $6 | 96% cheaper routine work |
| `tester` | 3 | 1 | $3 | 96% cheaper routine work |
| `researcher` | 3 | 1 | $3 | 96% cheaper routine work |
| `documenter` | 3 | 1 | $3 | 96% cheaper routine work |
| **Total** | Mixed | 10 | **~$65** | Optimal cost-quality balance |

**Tiered Routing Benefits**:
1. **89-93% cost savings** vs all-Anthropic approach
2. **Maximum quality** for strategic decisions (Tier 1 free, Tier 2 fallback)
3. **SDK features** available where needed (Tier 2)
4. **Bulk optimization** for routine work (Tier 3 at 96% savings)
5. **Proactive fallback** prevents Tier 1 limit failures
6. **Graceful degradation** under load with tier cascading

---

## Performance Benchmarks

### Target Metrics

| Metric | Target | Measured | Status |
|--------|--------|----------|--------|
| State transition latency (p99) | <100ms | TBD | ⏳ |
| Dependency resolution time (avg) | <500ms | TBD | ⏳ |
| Message bus throughput | >8000 msg/s (SDK) | TBD | ⏳ |
| Completion detection (hierarchical) | <1000ms | TBD | ⏳ |
| Completion detection (mesh) | <2000ms | TBD | ⏳ |
| Deadlock detection | <500ms | TBD | ⏳ |
| Memory usage per agent | <5MB (hierarchical) | TBD | ⏳ |
| Memory usage per agent | <8MB (mesh) | TBD | ⏳ |
| Max agents (hierarchical) | 50 | TBD | ⏳ |
| Max agents (mesh) | 10 | TBD | ⏳ |
| **Agent spawning (CLI mode)** | 50-100ms (pool) | TBD | ⏳ |
| **Agent spawning (SDK mode)** | 50-100ms (fork) | TBD | ⏳ |
| **Agent spawning (Hybrid mode)** | 50-100ms (fork) | TBD | ⏳ |
| **Pause/resume (CLI)** | <10ms (SIGSTOP) | TBD | ⏳ |
| **Pause/resume (SDK)** | <50ms (native) | TBD | ⏳ |
| **Checkpoint recovery (CLI)** | <200ms (file) | TBD | ⏳ |
| **Checkpoint recovery (SDK)** | <500ms (UUID) | TBD | ⏳ |
| **Provider switching latency** | <100ms | TBD | ⏳ |
| **Z.ai vs Anthropic latency delta** | <100ms | TBD | ⏳ |
| **OpenRouter latency overhead** | <200ms | TBD | ⏳ |
| **Cost per 1M tokens (CLI)** | $0 | $0 | ✅ |
| **Cost per 1M tokens (Anthropic)** | $5/$25 | $5/$25 | ✅ |
| **Cost per 1M tokens (Z.ai GLM)** | $0.41/$1.65 | $0.41/$1.65 | ✅ |
| **Cost savings (Hybrid vs SDK)** | 75-85% | TBD | ⏳ |

### Benchmarking Tools

**Setup**:
```bash
npm install --save-dev benchmark autocannon clinic
```

**Run Benchmarks**:
```bash
# Core V2 benchmarks
npm run bench:state-machine
npm run bench:dependencies
npm run bench:message-bus
npm run bench:system

# Mode-specific benchmarks
npm run bench:cli          # CLI mode performance
npm run bench:sdk          # SDK mode performance
npm run bench:hybrid       # Hybrid mode performance

# Provider benchmarks
npm run bench:provider:anthropic
npm run bench:provider:zai
npm run bench:provider:openrouter

# Cost analysis
npm run bench:cost-comparison  # Compare costs across modes/providers
```

**Mode Performance Validation**:
```bash
# Validate CLI mode spawning (50-100ms)
npm run bench:validate:cli-spawning

# Validate SDK mode features
npm run bench:validate:sdk-features

# Validate Hybrid mode cost savings (75-85%)
npm run bench:validate:hybrid-savings

# Validate provider failover (<100ms switching)
npm run bench:validate:provider-failover
```

**Generate Reports**:
```bash
# Mode comparison report
npm run bench:report:modes -- --output=./reports/mode-comparison-$(date +%Y%m%d).html

# Provider comparison report
npm run bench:report:providers -- --output=./reports/provider-comparison-$(date +%Y%m%d).html

# Cost optimization report
npm run bench:report:costs -- --output=./reports/cost-analysis-$(date +%Y%m%d).html
```

---

## Documentation Updates

### Unified Architecture Documentation

**Location**: `docs/architecture/unified-coordination.md`

**Sections**:
- Three coordination modes overview
- Mode selection criteria
- Auto-detection logic
- Configuration options
- Migration path (CLI → SDK → Hybrid)

**Reference Documents**:
- `/planning/agent-coordination-v2/cli-analysis/UNIFIED_COORDINATION_DESIGN.md`
- `/planning/agent-coordination-v2/cli-analysis/CLI_COORDINATION_ARCHITECTURE.md`
- `/planning/agent-coordination-v2/cli-analysis/SDK_ARCHITECTURE_ANALYSIS.md`

### Provider Integration Guide

**Location**: `docs/providers/integration-guide.md`

**Sections**:
- Provider abstraction layer
- Adding new providers
- Provider routing strategies
- Cost optimization patterns
- Failover configuration

**Reference Documents**:
- `/planning/agent-coordination-v2/cli-analysis/Z_AI_INTEGRATION.md`
- `/planning/agent-coordination-v2/cli-analysis/SDK_PROVIDER_SEPARATION.md`

### Quick Start Guide

**Location**: `docs/quick-start/README.md`

**Sections**:
- CLI mode setup (zero config)
- SDK mode setup (add API key)
- Hybrid mode setup (configure providers)
- Single code example for all modes
- Troubleshooting

**Reference Document**:
- `/planning/agent-coordination-v2/cli-analysis/QUICK_START_GUIDE.md`

### API Reference

**Location**: `docs/api/coordination-v2.md`

**Sections**:
- ICoordinator interface (unified API)
- CLICoordinator API
- SDKCoordinator API
- HybridCoordinator API
- CoordinatorFactory API
- Provider API
- StateMachineManager API
- DependencyManager API
- MessageBusV2 API
- CompletionDetector API
- DeadlockDetector API

**Example**:
```markdown
# ICoordinator Interface

Unified coordination interface - works with CLI, SDK, and Hybrid modes.

## Methods

### `spawnAgent(config: AgentSpawnConfig): Promise<Agent>`

Spawns a new agent. Implementation varies by mode:
- **CLI Mode**: Creates process from pool (50-100ms)
- **SDK Mode**: Forks session (50-100ms)
- **Hybrid Mode**: Forks session + routes to optimal provider (50-100ms)

**Parameters**:
- `config.agentType` - Agent type (coder, tester, etc.)
- `config.task` - Task description
- `config.provider` - (Optional) Override default provider
- `config.model` - (Optional) Override default model

**Returns**: Agent instance

**Example**:
```typescript
// Works in all modes
const agent = await coordinator.spawnAgent({
  agentType: 'coder',
  task: 'Implement authentication system'
});
```

### Migration Guide

**Location**: `docs/migration/v1-to-v2.md`

**Sections**:
- Breaking changes
- Migration timeline
- Unified architecture benefits
- Mode switching (no code changes)
- Configuration updates
- Testing strategy
- Rollback procedures

### Cost Optimization Guide

**Location**: `docs/cost-optimization/README.md`

**Sections**:
- Cost comparison by mode
- Provider cost analysis
- Routing strategies for cost optimization
- Budget enforcement
- Cost tracking and reporting

**Reference Documents**:
- Cost analysis from UNIFIED_COORDINATION_DESIGN.md
- Z.ai cost optimization from Z_AI_INTEGRATION.md

### User Guide

**Location**: `docs/user-guide/coordination-v2.md`

**Sections**:
- Getting started (mode selection)
- CLI mode guide
- SDK mode guide
- Hybrid mode guide
- Provider configuration
- Creating swarms
- Managing agents
- Cost optimization
- Troubleshooting

---

## Next Steps

After 13-week implementation completion:

1. **Production Deployment**:
   - Start with CLI mode (free tier validation)
   - Gradual rollout to SDK mode (API-enabled users)
   - Hybrid mode for cost-sensitive production workloads

2. **Provider Ecosystem Expansion**:
   - Add Z.ai as primary Hybrid provider (Week 14)
   - Integrate OpenRouter for multi-model access (Week 15)
   - Community provider templates (Week 16+)

3. **Cost Optimization Validation**:
   - Validate 75-85% cost savings with Hybrid mode
   - A/B testing across providers
   - Cost tracking and reporting dashboards

4. **User Feedback & Iteration**:
   - Gather feedback on mode selection UX
   - Provider preference patterns
   - Cost optimization effectiveness
   - Migration experience (CLI → SDK → Hybrid)

5. **Feature Expansion**:
   - Advanced provider routing (ML-based)
   - Dynamic mode switching at runtime
   - Provider cost forecasting
   - Multi-region provider support

6. **Training & Documentation**:
   - Mode selection workshops
   - Provider integration tutorials
   - Cost optimization best practices
   - Migration guides for existing users

7. **Performance Validation**:
   - Continuous monitoring across all modes
   - Provider latency tracking
   - Cost efficiency metrics
   - Quality comparison across providers

8. **Enterprise Features**:
   - Custom provider integration
   - Private LLM support (on-premise)
   - Advanced cost controls and budgets
   - Multi-tenant provider isolation

**Production Readiness Checklist** (Post-Week 13):
- [ ] All three modes operational and tested
- [ ] Auto-detection working reliably
- [ ] CLI mode works with zero configuration
- [ ] SDK mode validated with Anthropic API
- [ ] Hybrid mode cost savings validated (75-85%)
- [ ] Z.ai provider integration complete
- [ ] OpenRouter provider integration complete
- [ ] Provider failover tested and working
- [ ] Cost tracking and reporting operational
- [ ] Documentation complete for all modes
- [ ] Migration path tested (CLI → SDK → Hybrid)
- [ ] Performance targets met for all modes
- [ ] Security audit passed for all providers

**Support**:
- File issues at https://github.com/your-repo/issues
- Labels: `mode:cli`, `mode:sdk`, `mode:hybrid`, `provider:anthropic`, `provider:zai`, `provider:openrouter`
- Reference docs: `/planning/agent-coordination-v2/cli-analysis/`

---

## Z.ai GLM-4.6 Validation Summary (October 2025)

**Validation Status**: ✅ COMPLETED - Production-ready for coding agents

**Research Branch**: `feature/tiered-routing` (worktree at `../claude-flow-novice-tiered-routing`)

**Key Findings**:
1. **Token Threshold Bug**: GLM-4.6 returns empty responses when `max_tokens ≤ 200`
   - Solution: Enforced minimum of 201 tokens in provider
   - Applied via: `Math.max(201, request.maxTokens ?? 8192)`

2. **Optimal Configuration**:
   - Default: 8,192 tokens (aligns with 500 line per file guideline)
   - Context: 200K tokens (GLM-4.6) vs 128K tokens (GLM-4.5)
   - Max validated: 80,000 tokens

3. **Cost Savings**: ~40% vs Anthropic (not 96% as initially estimated)
   - Z.ai: $3/$15 per MTok
   - Anthropic: $5/$25 per MTok
   - Validated through production testing

4. **Performance**:
   - Small tasks (5K): 27s generation time
   - Medium tasks (20K): 86s generation time
   - Large tasks (80K): 100s generation time
   - All tests produced valid, compilable code

**Documentation**:
- `CODING_GUIDELINES.md`: 500 line per file guideline with token estimates
- `RESEARCH_SUMMARY.md`: Complete investigation findings
- `80k-validation-results.txt`: Test results for all scales

**Implementation Files**:
- `src/providers/zai-provider.ts`: GLM-4.5/4.6 support with bug fixes
- `src/providers/types.ts`: Added glm-4.6 model type
- `tests/providers/zai-real-api.test.ts`: Comprehensive API validation

**Production Status**: Ready for deployment to Tier 3 routing

---

**Last Updated**: 2025-10-02 (Z.ai validation completed)
**Maintained By**: Architecture Team
**Implementation Status**: 13-week roadmap finalized (Week 0-13 complete specifications)
