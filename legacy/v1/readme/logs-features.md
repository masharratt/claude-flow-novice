# Claude Flow Features Documentation

## Core System Features

### CFN Loop (Confidence-Feedback-Next)

**Purpose**: Self-correcting development loop with autonomous iteration

**Key Components**:
- **5-loop architecture**: Epic/Sprint → Planning (Enterprise) → Phase → Consensus → Primary Swarm
- **Mode-adaptive thresholds**: MVP (0.70/0.80) • Standard (0.75/0.90) • Enterprise (0.75/0.95)
- **Byzantine consensus**: Mode-specific validation (2-4 validators)
- **Product Owner GOAP**: Single or 4-person board (Enterprise)
- **Automatic feedback**: Iteration-based improvement with mode-specific limits

**Configuration**: Mode selection, iteration limits, thresholds, timeout settings
**Usage**: Multi-phase project execution with quality validation

### CFN Loop Modes

**Purpose**: Adapt CFN Loop quality gates to project needs

**Implementation**: Three modes with different thresholds and team structures

**Modes**:
1. **MVP**: Ship fast (Gate: 0.70, Consensus: 0.80, 2 validators, 5 iterations, single PO, skip A11y/perf)
2. **Standard**: Balanced (Gate: 0.75, Consensus: 0.90, 4 validators, 10 iterations, single PO) - default
3. **Enterprise**: Production quality (Gate: 0.75, Consensus: 0.95, 4 validators, 15 iterations, 4-person board, Loop 0.5)

**Usage**:
```bash
/cfn-loop "Task" --mode=mvp          # Fast iteration
/cfn-loop "Task" --mode=standard     # Balanced (default)
/cfn-loop "Task" --mode=enterprise   # Full quality gates
```

**Integration**: Mode stored in Redis (`cfn:mode:{phaseId}`) for swarm coordination

### TypeScript Error Prevention System

**Purpose**: Early detection and prevention of TypeScript type errors

**Key Components**:
- **Post-Edit Type Checking**: Single-file validation on every `.ts` edit
- **Pre-Commit Hook**: Block commits with TypeScript errors
- **Enhanced Strictness**: `noUnusedLocals`, `noUncheckedIndexedAccess`, `noImplicitOverride`
- **Import Path Enforcement**: ESLint rules prevent module resolution errors
- **Type Coverage**: Measure and enforce type safety thresholds
- **Component Templates**: Generate components with proper types

**Implementation**:
```bash
# Automatic on file edit (post-edit-pipeline.js)
# Runs: tsc --noEmit --skipLibCheck <file>

# Pre-commit validation
git commit  # Runs npm run typecheck

# Manual checks
npm run typecheck            # Full project type check
npm run type-coverage        # Detailed coverage report
npm run type-coverage:ci     # CI mode (80% threshold)
```

**Agent Feedback**: TYPE_ERROR notifications sent via Redis with error count and lines

**Impact**: 73% error reduction (prevents accumulation at edit time vs commit time)

### ACE (Adaptive Context Extension)

**Purpose**: Stanford-inspired pattern for context management with adaptive learning

**Key Components**:
- **Generator**: Create and refine context from agent interactions
- **Reflector**: Meta-cognitive analysis of context quality
- **Curator**: Merge, deduplicate, and prioritize insights
- **SQLite Memory**: Persistent adaptive context with 30-365 day retention

**Features**:
- **Semantic Deduplication**: Avoid redundant insights
- **Confidence Evolution**: Track helpful/harmful content patterns
- **Agent-Type Mapping**: Context injection based on agent roles
- **CLI Commands**: `ace-reflect`, `ace-accurate`, `ace-query`, `ace-inject`, `ace-stats`

**Configuration**: Context retention policies, confidence thresholds, agent preferences

**Usage**: Long-term learning across sessions with automatic context injection

### Unified Memory Monitoring System

**Purpose**: Intelligent memory management across CFN distributed projects with leak detection vs legitimate workload differentiation

**Key Components**:
- **Shared Configuration**: Centralized thresholds and analysis parameters
- **Process-Specific Detection**: Different limits for coordinators, Rust, cargo builds
- **Growth Pattern Analysis**: Distinguishes leaks from temporary spikes
- **Graceful Shutdown**: 30-second SIGTERM to SIGKILL transition

**Features**:
- **Intelligent Leak Detection**: Requires 70% consistent growth over multiple samples
- **Context-Aware Thresholds**: CFN coordinators (2-3GB), Rust (2GB), cargo (3GB)
- **Process History Tracking**: 30-sample rolling window for growth analysis
- **Cross-Project Synchronization**: Identical behavior across all distributed systems

**Configuration**: Shared configuration in `config/memory-monitoring-config.js`

**Memory Thresholds**:
- CFN Coordinators: 2000-3000MB (60-120 minute timeouts)
- Spawn Workers: 1500MB (30 minute timeout)
- Rust Processes: 2000MB (60 minute timeout)
- Cargo Builds: 3000MB (120 minute timeout)
- Default Fallback: 1500MB (30 minute timeout)

**Usage**:
```bash
# Start unified memory monitoring
node scripts/unified-memory-monitor.js

# Monitor specific process
node scripts/unified-memory-monitor.js --pid 12345

# Enhanced process management
./scripts/enhanced-memory-spiral-killer.sh

# Validate synchronization
./scripts/validate-memory-monitoring.sh
```

**Integration**: Ready for CFN npm distribution with identical configuration across projects

### CFN Loop Coordinators

**Purpose**: Mode-specific coordinators with autonomous phase execution and intelligent return-to-chat triggers

**Implementation**: Specialized coordinators handle entire sprints with mode expertise and cost optimization

**Coordinators**:
1. **cfn-coordinator-mvp**: Rapid iteration (cost target <$1/phase, 15min duration)
2. **cfn-coordinator-standard**: Balanced quality/speed (cost target $2/phase, 30min duration)
3. **cfn-coordinator-enterprise**: Full quality gates (cost target $5/phase, 60min duration)

**Key Features**:
- **Autonomous execution**: Loop 3→2→4 without human intervention
- **Auto-phase-launch**: Coordinators manage entire sprint lifecycle
- **Mode-specific parameter enforcement**: Gate thresholds, validator counts, iteration limits
- **Return-to-chat triggers**: Only for human decisions or sprint completion
- **Auto-injection**: Mode-specific instructions for next phase
- **Telemetry tracking**: Phase metrics (confidence, cost, duration, savings vs pure Claude)

**Spawn Pattern**:
```bash
# Auto-spawn coordinator based on mode
node src/cli/hybrid-routing/spawn-coordinator.js "Execute sprint: User Authentication" --mode=mvp --sprint-id=auth-001
```

**Return-to-Chat Criteria**:
- Human decision required (architecture changes, budget adjustments, critical blockers)
- Sprint complete (all phases executed, deliverables ready)

**Cost Optimization**:
- MVP: 2-3 workers max, z.ai provider, <$1 total
- Standard: 4-5 workers, mixed providers, ~$2 total
- Enterprise: 5-7 workers, quality focus, ~$5 total

**Telemetry Format**:
```json
{
  "phaseId": "user-auth-mvp",
  "mode": "mvp",
  "coordinator": "cfn-coordinator-mvp",
  "loop3": {"workers": 2, "avgConfidence": 0.75, "cost": 0.27, "duration": 720000},
  "loop2": {"validators": 2, "consensus": 0.85, "cost": 0.08, "duration": 300000},
  "totalCost": 0.35,
  "savingsVsPureClaude": 0.96
}
```

### Loop 0.5 Planning Consensus

**Purpose**: Architect team votes on design BEFORE Loop 3 implementation (Enterprise mode only)

**Implementation**: 3 architects (system, security, API) vote on ADRs and system diagrams

**Threshold**: 0.85 consensus required

**Output**: Design specification stored in SQLite with ACL Level 3 (1-year retention)

**Benefit**: Reduces Loop 3 rework by 30-40% (clear design constraints upfront)

### Agent Tool Validation

**Purpose**: Validate all specialized agents have functional tooling before coordination

**Implementation**: 4-layer hello-world test suite

**Layers**:
1. **Layer 0**: Agent tooling (15 agents × 7 tools) - validates Read, Write, Edit, Bash, Grep, Glob, TodoWrite
2. **Layer 1**: Mesh coordination (2 coordinators, 70 files) - Redis pub/sub + SQLite persistence
3. **Layer 2**: Review handoff (dynamic reviewer pool) - SQLite ACL enforcement
4. **Layer 3**: Error handling (50% error injection) - encrypted retry history

**Success Criteria**:
- Layer 0: All agents spawn, ≥5/7 tools working, 6 critical tools at 100%
- Layer 1: 72 agents, 70 unique files, 0 conflicts, SQLite persistence validated
- Layer 2: All 70 files reviewed, queue depth ≤15, dynamic scaling observed
- Layer 3: 50% initial failures, ≤10 retries per file, 100% final pass rate

**Integration**: Run via `/hello-world-tests` slash command, generates JSON report with SQLite metrics

**CLI Fix History**: Session fixed CLI argument parsing bugs that prevented coordinators from delegating work (now validated in Layer 0)

**Usage**: Automatic when `--mode=enterprise`

**Flow**:
1. Spawn 3 architects (system, security, API)
2. Design debate via Redis pub/sub (10-15 min)
3. Vote on proposals (≥0.85 consensus)
4. Store design spec in SQLite at `cfn/phase-{id}/loop0.5/design`
5. Loop 3 implementers follow approved design

**Personas**: `.claude/agents/planning-team/` (system-architect-persona, security-architect-persona, api-designer-persona)

**Memory Pattern**:
```bash
# Store Loop 0.5 results
/sqlite-memory store --key "cfn/phase-{id}/loop0.5/design" --level project --data '{"adr":"...","diagram":"..."}'

# Loop 3 reads planning results
/sqlite-memory retrieve --key "cfn/phase-{id}/loop0.5/design" --level project
```

### Multi-Stakeholder Product Owner Board

**Purpose**: Replace single product owner with 4-person board for balanced decisions (Enterprise mode only)

**Implementation**: 4 personas with weighted voting (CTO 30%, PO 30%, Power User 20%, Accessibility 20%)

**Decision Algorithm**: Weighted confidence voting from `/planning/parallelization/DESIGN_CONSENSUS_MULTI_STAKEHOLDER_ARCHITECTURE.md:776-820`

**Deliberation**: Triggered when disagreement >0.15 (facilitator agent negotiates compromise)

**Output**: PROCEED/DEFER/ESCALATE decision with dissenting opinions documented

**Usage**: Automatic when `--mode=enterprise`

**Personas**: `.claude/agents/product-owner-team/` (cto-agent, product-owner-agent, power-user-persona, accessibility-advocate-persona)

**Voting Formula**:
```
Final Decision = (CTO * 0.30) + (PO * 0.30) + (PowerUser * 0.20) + (A11y * 0.20)
```

**Deliberation Trigger**:
```
If max_vote - min_vote > 0.15:
  Spawn facilitator agent for compromise negotiation
```

### Agent Lifecycle Management

**Purpose**: Complete agent lifecycle from initialization to completion

**Key Components**:
- **Agent registry**: Capabilities tracking and validation
- **Dependency-aware completion**: Prevent premature termination
- **State management**: Transitions and persistence
- **Rerun handling**: Request-based re-execution
- **Memory safety**: Protection against memory leaks

**Configuration**: Lifecycle hooks, retry policies, memory settings

## Swarm Coordination Features

### Fleet Manager Coordination

**Purpose**: Enterprise-grade fleet management supporting 1000+ concurrent agents

**Key Components**:
- **Agent Lifecycle Management**: Spawn, terminate, monitor 1000+ agents
- **Resource Allocation**: Dynamic resource assignment with real-time optimization
- **Performance Monitoring**: Real-time fleet metrics with <100ms task assignment latency
- **Load Balancing**: Intelligent task distribution with multiple strategies
- **Cross-functional Dependency Resolution**: Automated dependency management
- **Multi-region Support**: Geographic distribution and failover capabilities

**Configuration**: Fleet size (1000+ agents), resource pools, scaling policies, regional distribution
**Usage**: Large-scale agent coordination, enterprise resource management, multi-region deployments

**Performance Targets**:
- **Concurrent Agents**: 1000+ agents supported
- **Task Assignment Latency**: <100ms with event-driven architecture
- **System Availability**: 99.9% with Byzantine fault tolerance
- **Auto-scaling Efficiency**: 40%+ efficiency gains

### Event Bus Architecture (QEEventBus)

**Purpose**: High-performance event-driven communication supporting 10,000+ events/second

**Key Components**:
- **Event Router**: Advanced message routing with multiple protocols (WebSocket, HTTP/2, gRPC)
- **Event Dispatcher**: Load-balanced event distribution with worker thread pools
- **Agent Lifecycle Events**: Comprehensive event system (spawn, terminate, error, task)
- **Message Serialization**: WASM-accelerated JSON validation for 40x performance
- **Performance Monitoring**: Real-time event throughput and latency tracking
- **Circuit Breaker**: Three-state resilience pattern (CLOSED/OPEN/HALF-OPEN) with priority bypass

**Configuration**: Throughput targets (398,373 events/sec achieved), latency (2.5μs average), worker threads (4), buffer size (10,000)
**Usage**: Real-time agent coordination, high-frequency event processing, system communication

**Performance Metrics** (Sprint 1.2-1.4 WASM Acceleration Epic):
- **Throughput**: 398,373 events/sec (40x over 10,000 target)
- **Latency**: 2.5 microseconds average (0.0025ms)
- **Concurrent Load**: 7,083,543 events/sec with 100 agents (708x target)
- **Cache Hit Rate**: 99.87% (LRU routing cache)

**Load Balancing Strategies**:
- **Round-robin**: Even distribution across available workers
- **Least-connections**: Route to workers with fewest active connections
- **Weighted**: Priority-based routing for critical events

**Circuit Breaker Pattern** (Sprint 1.4):
- **States**: CLOSED (normal) → OPEN (failure) → HALF-OPEN (testing) → CLOSED
- **Failure Threshold**: 5 consecutive failures trigger OPEN state
- **Recovery Timeout**: 30 seconds before HALF-OPEN testing
- **Half-Open Threshold**: 3 successful events restore to CLOSED
- **Priority Bypass**: Priority 8-9 events always bypass circuit breaker (critical coordination)
- **Metrics**: Circuit state transitions, rejection count, bypass events, recovery attempts
- **Overhead**: <0.5% performance impact with priority bypass optimization

### SQLite Memory Management

**Purpose**: Dual-layer persistent memory with CQRS pattern and 5-level ACL system

**Key Components**:
- **Dual-Write Pattern**: Redis (active coordination) + SQLite (persistent storage)
- **CQRS Architecture**: Commands via Redis (<10ms), Queries via SQLite (<50ms)
- **5-Level ACL System**: Granular access control (PRIVATE, AGENT, SWARM, PROJECT, SYSTEM)
- **AES-256-GCM Encryption**: Automatic encryption for sensitive levels (1, 2, 5)
- **Cross-Session Recovery**: State restoration from SQLite after Redis loss
- **Agent Lifecycle Tracking**: Complete spawn/update/terminate audit trail
- **Blocking Coordination Audit**: Signal ACK, timeout, dead coordinator event logging

**Configuration**: Database path, encryption keys, ACL policies, TTL settings
**Usage**: CFN Loop state persistence, agent coordination, audit compliance

**Performance Metrics** (Sprint 1.7):
- **Dual-Write Latency**: p95 55ms (target <60ms) ✅
- **SQLite-Only Latency**: p95 48ms (target <50ms) ✅
- **Throughput**: 10,000+ writes/sec sustained
- **Concurrent Agents**: 100 agents without degradation
- **Data Preservation**: 100% during Redis failure
- **Recovery Time**: <10 seconds after crash

**ACL Levels**:
1. **PRIVATE**: Agent-only access (encrypted)
2. **AGENT**: Agent coordination within swarm (encrypted)
3. **SWARM**: Swarm-wide access (plaintext)
4. **PROJECT**: Product Owner, CI/CD access (plaintext)
5. **SYSTEM**: System-level monitoring (encrypted)

**Testing** (Sprint 1.7):
- **Test Coverage**: 56 tests across 7 suites (100% pass rate)
- **Unit Tests**: Dual-write, ACL, encryption, TTL, concurrency (44 tests)
- **Integration Tests**: CFN Loop 3→2→4 workflow, cross-session recovery (5 tests)
- **Chaos Tests**: Redis/SQLite failures, coordinator death (7 tests)
- **Framework**: Jest (converted from Vitest)

### Mesh Coordinator

**Purpose**: Mesh topology coordination with dependency tracking

**Key Components**:
- **Dynamic connections**: Automatic mesh management
- **Load-based distribution**: Intelligent task allocation
- **Dependency resolution**: Inter-agent relationship handling
- **Automatic rebalancing**: Performance optimization

**Configuration**: Max agents, connections, task strategies
**Usage**: Flat coordination for collaborative tasks

### Hierarchical Coordinator

**Purpose**: Tree-structured coordination with parent-child relationships

**Key Components**:
- **Multi-level hierarchy**: Nested agent management
- **Task delegation**: Subtask creation and assignment
- **Agent promotion**: Dynamic hierarchy adjustment
- **Dependency tracking**: Hierarchy-aware coordination

**Configuration**: Max depth, children per node, delegation strategies
**Usage**: Complex project breakdown and structured coordination

### CFN Loop Orchestrator

**Purpose**: Unified orchestration of all CFN loop components

**Key Components**:
- **Parallel confidence**: Concurrent score collection
- **Iteration tracking**: Loop state management
- **Circuit breaker**: Fault tolerance mechanisms
- **Memory persistence**: Cross-session state

**Configuration**: Loop limits, thresholds, timeout settings
**Usage**: Complete phase execution with autonomous retry

### Blocking Coordination Cleanup

**Purpose**: Atomic cleanup of stale coordinator state with production-safe performance

**Key Components**:
- **Redis Lua Script**: Atomic server-side execution for zero network latency
- **Batch Operations**: Single SCAN → batch MGET → in-memory filter → batched DEL
- **TTL-Based Staleness**: Automatic detection of coordinators inactive >10 minutes
- **Related Key Cleanup**: Comprehensive removal of heartbeat, signal, ACK, idempotency keys
- **Graceful Degradation**: Automatic fallback to bash sequential on Lua failure

**Performance Metrics** (Sprint 1.7):
- **Speedup**: Sequential bash: 300s → Lua-optimized: 2.5s (10K coordinators)
- **Architecture**: 1-2 SCAN iterations + 1 MGET + 4-5 batched DEL commands
- **Throughput**: 4,000-8,000 coordinators/sec cleaned
- **Safety**: SCAN-based discovery (non-blocking), atomic execution
- **Production Ready**: Dry-run mode, fallback support, comprehensive logging

**Cleanup Targets**:
- Heartbeat keys: `swarm:*:blocking:heartbeat:*`
- Signal keys: `blocking:signal:*`
- ACK keys: `blocking:ack:*`
- Idempotency keys: `blocking:idempotency:*`
- Activity keys: `swarm:*:agent:*:activity`

**Configuration**: Staleness threshold (600s default), dry-run mode, Redis connection
**Usage**: Production coordinator cleanup via systemd timer (5-minute intervals)

## Agent Management Features

### Agent Registry and Validation

**Purpose**: Centralized agent management with capability tracking

**Key Components**:
- **Agent type system**: coder, tester, researcher, specialist roles
- **Capability matching**: Task-appropriate agent selection
- **Performance metrics**: Quality and speed tracking
- **Health monitoring**: Agent status verification

**Configuration**: Agent types, capability definitions, validation rules
**Usage**: Agent selection, spawning, coordination

### Agent Optimization System

**Purpose**: Automated agent description optimization and formatting standardization

**Key Components**:
- **Description Optimization**: Standardize agent descriptions to 24-50 word limit
- **YAML Frontmatter Standardization**: Normalize YAML metadata structure
- **File Cleanup**: Consistent file naming conventions across agent library
- **Quality Validation**: Ensure all agents meet minimum capability standards

**Implementation**:
- **Agent Scanner**: Recursively scan `.claude/agents/` folder for optimization candidates
- **Description Parser**: Extract and analyze current description lengths
- **Format Enforcer**: Apply consistent formatting patterns
- **Quality Gate**: Reject descriptions below 24 words or above 50 words

**Usage**:
```bash
# Optimize all agents in library
node src/cli/hybrid-routing/optimize-agents.js --parallel 4

# Optimize specific agent category
node src/cli/hybrid-routing/optimize-agents.js --category development

# Validate formatting standards
node src/cli/hybrid-routing/optimize-agents.js --validate-only
```

**Configuration**: Word limits (24-50), parallel optimization workers, category filters
**Integration**: Integrated into agent spawning workflow, hybrid routing CLI

### Agent Use Case Registry

**Purpose**: Intelligent agent selection based on use cases rather than keyword matching

**Implementation**: Centralized registry mapping 85+ agents to use cases and domains with transparent reasoning

**Key Components**:
- **Use Case Mapping**: Pre-defined scenarios (feature-development, security-audit, performance-optimization)
- **Domain Classification**: Agent categorization (security, architecture, development, testing)
- **Intelligent Selection**: Context-aware agent recommendation with reasoning
- **Coordinator Access**: Programmatic API for coordinators to query recommendations
- **CLI Testing**: Interactive testing tool for validating agent selections

**Use Cases Supported**:
- **feature-development**: architect, coder, tester, code-analyzer
- **security-audit**: security-specialist, code-analyzer, tester, production-validator  
- **performance-optimization**: perf-analyzer, code-booster, tester
- **system-architecture**: system-architect, architect, devops-engineer
- **api-development**: api-designer-persona, backend-dev, api-docs, security-specialist
- **mobile-development**: mobile-dev, react-frontend-engineer, tester
- **infrastructure-setup**: devops-engineer, system-architect, security-specialist
- **cfn-loop-mvp/standard/enterprise**: Mode-specific CFN coordinators

**Coordinator Integration**:
```javascript
// Load registry
const registry = await AgentUseCaseRegistry.load();

// Get recommendations
const recommendations = registry.recommendAgents("Build authentication system");

// Output structure
{
  primary: ['coordinator-hybrid', 'architect', 'coder'],
  secondary: ['security-specialist', 'tester'],
  reasoning: [
    'Matched use case: feature-development',
    'Matched domain: security',
    'Complex task requires coordination'
  ]
}
```

**CLI Testing**:
```bash
# Test agent recommendations
node src/cli/hybrid-routing/recommend-agents.js "Build authentication system"

# Shows:
# - Primary agents with reasoning
# - Secondary agents (optional)
# - Spawn command for immediate use
```

**Configuration**: AVAILABLE-AGENTS.md documentation, agent definition parsing, fallback mappings

**Benefits**:
- ✅ **Intelligent Selection**: Based on use cases, not brittle keywords
- ✅ **Transparent Reasoning**: See why agents were selected  
- ✅ **Coordinator Control**: Can customize selections as needed
- ✅ **Fallback Support**: Graceful degradation to basic mappings
- ✅ **Extensible**: Easy to add new use cases and domains

### Hybrid Routing (Enhanced with Use Case Intelligence)

**Purpose**: Cost-optimized agent spawning with intelligent use case-based selection

**Implementation**:
- **85+ dynamically discovered agents** from `.claude/agents/` folder across 12 categories
- **Use Case Registry Integration**: Automatic intelligent selection via AgentUseCaseRegistry
- **Coordinator Override**: Manual agent type specification via `--agents` flag (REQUIRED)
- **Full Override**: Custom agents + subtasks via `--agents` + `--subtasks`
- **Graceful Fallback**: Automatic selection if override fails

**Key Components**:
- **Agent Definition Loading**: Parse YAML frontmatter, extract keywords from descriptions
- **Use Case Matching**: Score agents based on task domain and complexity
- **Intelligent Selection**: Use case registry provides primary/secondary agent recommendations
- **System Prompt Integration**: Append tool integration (bash, file ops) to specialized prompts
- **Provider Integration**: z.ai provider support for worker agents
- **Dynamic Discovery**: Recursive scanning with category preservation, in-memory caching, lazy loading

**Categories** (12 total): core-agents, validation, security, architecture, infrastructure, coordination, specialized-domains, cfn-loop, analysis, development-patterns, testing, context

**Usage**:
```bash
# List available agents
node src/cli/hybrid-routing/spawn-workers.js --list-agents

# List by category  
node src/cli/hybrid-routing/spawn-workers.js --agents-by-category

# Automatic (use case-based selection)
node src/cli/hybrid-routing/spawn-workers.js "Build auth" --agents=architect,coder,tester

# Coordinator override (agent types)
node src/cli/hybrid-routing/spawn-workers.js "Refactor API" \
  --agents=architect,coder,reviewer

# Full override (agents + custom subtasks)
node src/cli/hybrid-routing/spawn-workers.js "OAuth2" \
  --agents=coder,security-specialist \
  --subtasks="Implement PKCE|Audit tokens"
```

**Error Recovery**:
- **502 Auto-Retry**: Exponential backoff (1s, 2s, 4s max) for transient API errors
- **Timeout Handling**: 30-minute limit with partial result recovery via Redis/SQLite
- **Fallback Coordination**: Redis keys preserved for interrupted swarm recovery

**Performance**:
- **Parallel execution**: Workers spawn concurrently
- **Token tracking**: Real-time usage monitoring
- **Cost reporting**: Per-provider breakdown (z.ai vs Claude Max)
- **Retry telemetry**: `⚠️ Worker N 502 error, retry M/3 in Ns`

**Integration**: Redis coordination, SQLite memory, web portal (Socket.IO), CLI spawning, use case registry

**Coordinator Access Guide**: See `src/cli/hybrid-routing/COORDINATOR-ACCESS-GUIDE.md` for complete integration patterns

**Integration**: Redis coordination, SQLite memory, web portal (Socket.IO), CLI spawning

### Cost-Savings Mode Toggle System

**Purpose**: Switch between CLI-based and Task-tool coordination patterns

**Implementation**: Dynamic CLAUDE.md section injection with coordinator file management

**Key Components**:
- **Mode persistence**: `.claude-flow/cost-savings-mode.json` stores active mode
- **CLAUDE.md injection**: HTML comment markers for dynamic section management
- **CLI coordination**: spawn-workers.js with z.ai provider routing
- **Task-tool coordination**: Main provider for all agent spawning

**Modes**:
1. **CLI Mode (cost-savings ON)**:
   - Coordinators spawn workers via spawn-workers.js
   - z.ai provider for worker agents
   - Claude Max coordinator in main chat
   - Redis pub/sub coordination
   - SQLite persistence with ACL

2. **Task-tool Mode (cost-savings OFF)**:
   - Coordinators spawn workers via Task tool
   - Main provider for all agents
   - No CLI-specific patterns
   - Standard swarm coordination

**Toggle Commands**:
```bash
/cost-savings-on     # Enable CLI mode
/cost-savings-off    # Enable Task-tool mode
/cost-savings-status # Display current configuration
```

**CLAUDE.md Sections**:
- `<!-- CLI_COORDINATORS_START -->` to `<!-- CLI_COORDINATORS_END -->`
- `<!-- TASK_COORDINATORS_START -->` to `<!-- TASK_COORDINATORS_END -->`

**Toggle Script**: `scripts/toggle-cost-savings.cjs`

**Configuration**: Mode detection via coordinator file locations and CLAUDE.md content

**Usage**: Project-level coordination mode switching without manual file edits

**Integration**: CFN Loop coordinators, hybrid routing, mode-aware agent spawning

### Dependency Tracker

**Purpose**: Track and resolve inter-agent dependencies

**Key Components**:
- **Dependency types**: coordination, completion, data dependencies
- **Circular detection**: Prevent deadlock scenarios
- **Completion blocking**: Ensure proper task ordering
- **Automatic resolution**: Dependency-based scheduling

**Configuration**: Timeout settings, dependency policies
**Usage**: Prevent premature completion, ensure task ordering

## Monitoring and Observability Features

### Distributed Tracing

**Purpose**: End-to-end tracing across microservices and agent swarms

**Key Components**:
- **Trace context**: Request propagation
- **Span tracking**: Operation lifecycle
- **Cross-service propagation**: System-wide tracing
- **APM integration**: DataDog, New Relic support

**Configuration**: Sampling rates, collector endpoints
**Usage**: Performance analysis, bottleneck identification

### Real-time Monitoring

**Purpose**: Live system health and performance tracking

**Key Components**:
- **Health checks**: System status verification
- **Metrics collection**: Performance aggregation
- **Performance monitoring**: Resource usage tracking
- **Agent health**: Swarm state monitoring

**Configuration**: Monitoring intervals, alert thresholds
**Usage**: System observability, performance optimization

### Web Portal Monitoring

**Purpose**: Real-time visualization of agent coordination and swarm performance

**Implementation**: React SPA with 7 consolidated views, WebSocket updates, Chart.js visualizations

**Views**:
1. **Dashboard**: System health, metrics cards, hierarchy tree, performance charts
2. **Agents**: List/grid view, search, spawn/terminate operations
3. **Hierarchy**: Tree visualization, expand/collapse, agent relationships
4. **Performance**: CPU/memory/agents charts with dual Y-axis
5. **Events**: Virtual scrolling (10K+ events), full-text search, severity filters
6. **Fleet**: Aggregation metrics, pie chart distribution, virtual scrolling
7. **CFN Loop**: Phase timeline, progress bars, validator results

**Technology Stack**:
- Frontend: React 18.3.1, Material-UI v6, React Router v6
- State: Zustand 5.0.1 with Immer middleware
- Real-time: Socket.IO 4.8.1, WebSocket subscriptions
- Charts: Chart.js 4.4.7, react-chartjs-2 5.2.0
- Virtual Scrolling: react-window 1.8.10
- Testing: Vitest 2.1.5 (121 unit), Playwright 1.49.0 (32 E2E)

**Legacy Portals Consolidated**: 8 (dashboard, monitoring, consensus-monitoring, feature-flags-monitoring, fleet-manager-monitoring, gossip-monitoring, sovereignty-monitoring)

**Usage**:
```bash
npm run portal:install  # One-time setup
npm run portal:dev      # Development mode (http://localhost:3002)
npm run portal:build    # Production build
```

**Documentation**: WEB_PORTAL_INSTALL.md, packages/web-portal/docs/

### Phase 4 Analytics

**Purpose**: Advanced analytics for swarm coordination

**Key Components**:
- **Consensus tracking**: Agreement metrics
- **Performance assessment**: Quality measurement
- **Truth score analysis**: Accuracy validation
- **Rollout decisions**: Release management

**Configuration**: Analytics parameters, decision thresholds
**Usage**: Coordination optimization, quality assessment

## CLI and Slash Commands Features

### Swarm Management Commands

**Purpose**: Interactive swarm coordination via CLI

**Key Components**:
- **`/swarm init`**: Initialize swarm topologies
- **`/swarm spawn`**: Create specialized agents
- **`/swarm orchestrate`**: Coordinate complex workflows
- **`/swarm monitor`**: Real-time swarm monitoring

**Configuration**: Topology types, agent counts, strategies
**Usage**: Manual swarm control and monitoring

### SPARC Development Commands

**Purpose**: Structured development methodology

**Key Components**:
- **`/sparc`**: SPARC methodology execution
- **Task breakdown**: Structured problem solving
- **Progress tracking**: Phase completion monitoring
- **Validation**: Quality assurance

**Configuration**: SPARC parameters, validation rules
**Usage**: Structured development workflows

### CFN Loop Commands

**Purpose**: Autonomous development loop management

**Key Components**:
- **`/cfn-loop`**: Self-correcting development
- **`/cfn-loop-epic`**: Multi-phase orchestration
- **`/cfn-loop-sprints`**: Sprint-based execution
- **`/fullstack`**: Complete team deployment

**Configuration**: Loop parameters, consensus thresholds
**Usage**: Autonomous project execution

## MCP Integration Features

### MCP Server SDK

**Purpose**: Model Context Protocol server with 30+ essential tools

**Key Components**:
- **Tool discovery**: Dynamic capability exposure
- **Session management**: 8-hour timeout prevention
- **Resource management**: MCP resource handling
- **Cross-service communication**: Protocol integration

**Configuration**: Tool definitions, session settings
**Usage**: Claude Code integration with external tool access

### Tool Categories

**Swarm Coordination** (8 tools): init, spawn, orchestrate, status, scale, destroy
**Memory Management** (7 tools): usage, search, persist, backup, restore
**Task Management** (3 tools): status, results, metrics
**Performance Monitoring** (5 tools): reports, analysis, health checks
**Project Analysis** (7 tools): language detection, framework analysis

## Testing and Validation Features

### Automated Test Pipeline

**Purpose**: Comprehensive testing automation

**Key Components**:
- **E2E test generation**: End-to-end test creation
- **Performance monitoring**: Test execution tracking
- **Pipeline validation**: Quality gate enforcement
- **Regression testing**: Change impact assessment
- **Swarm test coordination**: Multi-agent testing

**Configuration**: Test types, validation thresholds
**Usage**: Continuous testing and quality assurance

### Progressive Validation System

**Purpose**: Multi-tier validation with progressive strictness

**Key Components**:
- **Syntax validation**: Formatters, linters (0% dependencies)
- **Interface validation**: Type checking (30% dependencies)
- **Integration validation**: Dependency checking (70% dependencies)
- **Full validation**: Security, testing (90% dependencies)

**Configuration**: Validation tiers, thresholds
**Usage**: Quality gates with progressive requirements

### Comprehensive Testing Framework

**Purpose**: Multi-language testing support

**Key Components**:
- **Load testing**: Swarm coordination performance
- **Byzantine resolution**: Consensus mechanism testing
- **Fallback system**: Error recovery validation
- **CLI integration**: Command-line testing

**Configuration**: Test parameters, load settings
**Usage**: System validation and performance testing

## Configuration and Deployment Features

### Kubernetes Deployment

**Purpose**: Production-ready container orchestration

**Key Components**:
- **Production manifests**: Complete deployment configuration
- **Service configuration**: Microservice networking
- **Security contexts**: Pod and container security
- **Resource management**: CPU, memory allocation

**Configuration**: Replicas, resources, security policies
**Usage**: Production deployment and scaling

### Configuration Management

**Purpose**: Centralized configuration with environment support

**Key Components**:
- **Multi-environment ConfigMaps**: Environment-specific settings
- **Secret management**: Secure credential handling
- **TypeScript configuration**: Type-safe configuration
- **Performance optimization**: Runtime tuning

**Configuration**: Environment-specific settings
**Usage**: Environment management and deployment configuration

### Hook Pipeline Configuration

**Purpose**: Automated development workflow

**Key Components**:
- **Multi-language formatters**: Code formatting support
- **Linter configurations**: Code quality enforcement
- **Type checker settings**: Type safety validation
- **Security scanner integration**: Vulnerability detection

**Configuration**: Tool settings, validation rules
**Usage**: Automated code quality and security checking

## Security Features

### XSS Protection

**Purpose**: Cross-site scripting prevention

**Key Components**:
- **HTML sanitization**: Safe content rendering
- **Input validation**: Malicious input detection
- **Safe URL handling**: Security-focused URL processing
- **Content integrity**: Tamper detection

**Configuration**: Allowed tags, attributes, policies
**Usage**: Web application security

### Security Middleware

**Purpose**: Application-level security protection

**Key Components**:
- **Request validation**: Input sanitization
- **Authentication and authorization**: Access control
- **Security headers**: HTTP security enforcement
- **Rate limiting**: Abuse prevention

**Configuration**: Security policies, validation rules
**Usage**: Web application security

### Security Scanning Integration

**Purpose**: Automated security vulnerability detection

**Key Components**:
- **Multi-language scanners**: Language-specific security analysis
- **Dependency vulnerability checking**: Supply chain security
- **Security audit integration**: Compliance validation
- **CI/CD security gates**: Automated security enforcement

**Configuration**: Scanner settings, vulnerability thresholds
**Usage**: Continuous security monitoring and validation

## Compliance and Security Features

### Multi-National Regulatory Compliance

**Purpose**: Enterprise-grade compliance for GDPR, CCPA, SOC2 Type II, and ISO27001

**Key Components**:
- **GDPR Compliance**: EU data protection regulation adherence
- **CCPA Data Privacy**: California consumer privacy act implementation
- **SOC2 Type II**: Service organization control reporting
- **ISO27001**: Information security management system
- **Audit Logging**: Comprehensive compliance audit trails
- **Data Residency**: Geographic data storage compliance

**Configuration**: Compliance standards, audit policies, data residency rules, reporting schedules
**Usage**: Enterprise deployments, regulated industries, international operations

**Compliance Features**:
- **Automated Compliance Checks**: Real-time validation against regulatory requirements
- **Consent Management**: User consent tracking and management
- **Data Subject Rights**: Access, correction, and deletion requests
- **Breach Notification**: Automated incident reporting workflows
- **Documentation Generation**: Compliance reports and certification support

### Auto-Scaling Algorithms

**Purpose**: Dynamic resource optimization with 40%+ efficiency gains

**Key Components**:
- **Predictive Scaling**: AI-driven resource demand forecasting
- **Reactive Scaling**: Real-time load-based adjustments
- **Resource Optimization**: Dynamic agent pool management
- **Efficiency Monitoring**: Real-time performance metrics
- **Cost Optimization**: Resource usage optimization strategies

**Configuration**: Scaling thresholds, efficiency targets, resource limits, optimization policies
**Usage**: Variable workload management, cost control, performance optimization

**Scaling Strategies**:
- **Horizontal Scaling**: Add/remove agents based on load
- **Vertical Scaling**: Resource allocation adjustments
- **Geographic Scaling**: Multi-region resource distribution
- **Predictive Scaling**: ML-based demand forecasting

## UI Dashboard and Visualization

### Fleet Management Dashboard

**Purpose**: Real-time fleet visualization and control with high-ROI insights

**Key Components**:
- **Swarm Visibility**: Real-time agent status and coordination visualization
- **Performance Metrics**: Interactive charts and analytics
- **Resource Management**: Visual resource allocation and optimization
- **Control Interface**: Direct fleet manipulation capabilities
- **Insights Engine**: AI-powered optimization recommendations

**Configuration**: Dashboard layouts, metric displays, alert thresholds, refresh intervals
**Usage**: Fleet monitoring, performance optimization, system administration

**Dashboard Features**:
- **Real-time Monitoring**: Live fleet status and performance metrics
- **Interactive Visualizations**: Drag-and-drop resource management
- **Alert System**: Proactive issue detection and notification
- **Historical Analysis**: Trend analysis and performance history
- **Custom Views**: Role-based dashboard configurations

## Performance Optimization Features

### WASM 40x Performance Engine

**Purpose**: WebAssembly-based high-performance code optimization and execution

**Key Components**:
- **40x performance multiplier**: Sub-millisecond code processing
- **SIMD vectorization**: 128-bit vector operations for array processing
- **Advanced optimization templates**: Vectorization, memoization, parallel processing
- **Enhanced memory pool**: 1GB allocation with priority-based segments
- **Real-time performance monitoring**: Auto-optimization with 100ms intervals
- **JavaScript fallback**: Robust performance when WASM compilation fails
- **Rust Drop trait**: Automatic memory cleanup prevents 33.9% memory leak

**Configuration**: Performance targets (40x), optimization thresholds, memory allocation
**Usage**: High-throughput AST processing, code optimization, file processing, coordination system serialization

**Performance Metrics** (WASM Acceleration Epic - Sprints 1.2-1.4):
- **Event Bus**: 398,373 events/sec (40x over 10,000 target)
  - Latency: 2.5 microseconds average
  - Concurrent load: 7,083,543 events/sec with 100 agents
  - WASM acceleration with JSON validation
- **Swarm Messenger**: 21,894 messages/sec (2.2x over 10,000 target)
  - Marshaling: 26 microseconds average
  - Speedup: 11.5x over native JSON
  - Message size: 1-10KB typical
- **State Manager**: 0.28ms snapshots (native JSON chosen over WASM)
  - Throughput: 3,560 snapshots/sec
  - State size: 50-200KB typical (100 agents)
  - V8 JIT optimization chosen for large state management
- **AST Processing**: 0.011ms parse time (sub-millisecond target achieved)
- **File Throughput**: 2,597 files/sec (5 MB/s target exceeded)
- **Code Optimization**: 48.0x performance multiplier (exceeded 40x target)
- **Concurrent Agents**: 75+ agents supported
- **Benchmark Success**: 100% success rate across all operations

**Architecture Decisions** (ADRs):
- **ADR-001**: Hybrid WASM/native JSON strategy (WASM <10KB, native JSON >100KB)
- **ADR-002**: Dual-layer Redis architecture (Event Bus + Messenger separation)
- **ADR-003**: Native JSON for state serialization (V8 JIT 1.86x faster for 50-200KB states)

**Memory Management** (Sprint 1.3.1):
- Rust Drop trait implementation for MessageSerializer and StateSerializer
- Prevents 33.9% memory leak in WASM bindings
- Automatic buffer cleanup on instance drop
- Production-safe WASM with guaranteed resource cleanup

### Error Recovery System

**Purpose**: Advanced error detection and automated recovery workflows

**Key Components**:
- **92.5% recovery effectiveness**: Exceeded 90% target
- **Automated detection algorithms**: Real-time error identification
- **Resilience architecture**: Circuit breakers and failover mechanisms
- **Comprehensive monitoring**: Recovery process tracking and analytics

**Configuration**: Recovery thresholds, retry policies, monitoring settings
**Usage**: System resilience and fault tolerance

### Performance Optimizer

**Purpose**: System performance optimization and monitoring

**Key Components**:
- **Performance metrics collection**: Real-time monitoring
- **Bottleneck identification**: Performance analysis
- **Optimization recommendations**: Automated suggestions
- **Performance regression detection**: Change impact analysis

**Configuration**: Optimization parameters, monitoring settings
**Usage**: System performance tuning and monitoring

### Memory Safety Protection

**Purpose**: Memory leak prevention and optimization

**Key Components**:
- **Memory usage monitoring**: Real-time tracking
- **Leak detection**: Automatic identification
- **WSL/Windows compatibility**: Cross-platform support
- **Automatic cleanup**: Resource management

**Configuration**: Memory limits, cleanup policies
**Usage**: Memory management and optimization

### Build Optimization

**Purpose**: Build performance and optimization

**Key Components**:
- **Build optimization scripts**: Performance enhancement
- **Configuration validation**: Build correctness
- **Performance testing**: Build speed measurement
- **Optimization activation**: Feature toggling

**Configuration**: Build settings, optimization parameters
**Usage**: Build performance improvement and validation

## Logging Features (Legacy)

### Multi-Destination Logging

**Purpose**: Route logs to multiple destinations simultaneously

**Configuration**: Configure in LoggingConfig.destination
- `console`: stdout/stderr output
- `file`: File-based logging
- `both`: Simultaneous console and file logging

### Log Level Filtering

**Purpose**: Control log verbosity by severity

**Levels** (in order of severity):
- `DEBUG`: Detailed debugging information
- `INFO`: General information messages
- `WARN`: Warning conditions
- `ERROR`: Error conditions

### Structured Logging

**Purpose**: Add structured context to log messages

**Features**:
- JSON and text output formats
- Context inheritance
- Arbitrary metadata attachment
- Error serialization

### Child Loggers

**Purpose**: Create contextual loggers with inherited configuration

**Benefits**:
- Automatic context injection
- Configuration inheritance
- Independent context management
- Clean separation of concerns

## Adaptive Context Extension (ACE)

**Purpose**: Learn from execution patterns without context collapse

**Implementation**: SQLite-backed bullet system with incremental delta updates. Avoids full CLAUDE.md rewrites that lose accumulated knowledge.

**Components**:
- 4 SQLite tables (adaptive_context, context_reflections, context_usage_log, context_merge_log)
- 5 slash commands (reflect, curate, query, inject, stats)
- 3 automatic hooks (post-task, pre-agent-spawn, post-cfn-loop)
- 2 specialized agents (reflector, curator)

**Usage**:
```bash
# Extract lessons after task
/context-reflect --task-id=task-123 --auto-curate

# Query before spawning agents
/context-query --tags=cfn-loop,redis --min-confidence=0.8

# Inject into CLAUDE.md
/context-inject --phase=phase-0 --limit=15
```

**Integration**: Coordinators automatically extract and inject context during CFN Loop execution

**Metrics**: +10.6% performance improvement, -86.9% adaptation latency (Stanford ACE research)

## Redis Transparency System

**Purpose**: Real-time agent observation and interactive intervention

**Implementation**: Redis pub/sub messaging with React dashboard and WebSocket communication

**Components**:
- **Transparency Middleware**: Configurable visibility levels (minimal, standard, detailed)
- **Agent State APIs**: GET /api/agents/{id}/state, /activity, /progress
- **Real-time Dashboard**: React components for live monitoring
- **Predictive Modeling**: ML algorithms for progress estimation
- **Anomaly Detection**: Intelligent alerting for unusual behavior

**Key Features**:
- **Live Agent Monitoring**: Track state, progress, and performance in real-time
- **Interactive Intervention**: Pause, resume, or redirect agents during execution
- **Progress Prediction**: Estimate completion times based on historical patterns
- **Collaboration Tracking**: Monitor agent-to-agent communication patterns
- **Performance Analytics**: Token usage, execution time, error rates

**Usage**:
```bash
# Launch transparency dashboard
claude-flow-transparency-dashboard

# Query agent state
curl -X GET http://localhost:3001/api/v1/agents/coder-1/state

# Monitor real-time updates
redis-cli subscribe "swarm:transparency:*"
```

**Configuration**: Set transparency level in system configuration
- `minimal`: Basic state information only
- `standard`: State + progress + performance metrics
- `detailed`: Full visibility including internal reasoning

**Integration**: Automatically enabled for CFN Loop coordinators, manual launch available for other operations

## Related Documentation

- [API](./logs-api.md) - Complete API reference
- [Functions](./logs-functions.md) - Utility functions
- [Hooks](./logs-hooks.md) - System integration points
- [MCP](./logs-mcp.md) - Model Context Protocol
- [Slash Commands](./logs-slash-commands.md) - CLI operations