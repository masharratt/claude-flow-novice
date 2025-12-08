# CFN System Architecture

## Core Components

### 3-Loop Structure
- **Loop 1**: Product Owner → Task Definition → Success Criteria
- **Loop 2**: Validators (2-7 agents) → Consensus Building → Quality Gates
- **Loop 3**: Implementers (3-5 agents) → Task Execution → Test Results

### Agent Types
- **Coordinator**: Orchestrates workflow, manages Redis signals
- **Product Owner**: Defines requirements, makes PROCEED/ITERATE/ABORT decisions
- **Implementer**: Executes tasks (backend-dev, frontend-dev, testing)
- **Validator**: Reviews work, provides confidence scores

### Orchestration Layer
```
orchestrate.ts (696 lines) - Core logic
├── orchestrate.sh (172 lines) - ❌ REDUNDANT
├── orchestrate-wrapper.sh (268 lines) - ❌ REDUNDANT
└── helpers/orchestrate-ts.sh (172 lines) - ❌ REDUNDANT
```

## Modes of Operation

### MVP Mode
- Gate threshold: ≥0.70
- Consensus threshold: ≥0.80
- Max iterations: 5
- Validators: 2

### Standard Mode (default)
- Gate threshold: ≥0.95
- Consensus threshold: ≥0.90
- Max iterations: 10
- Validators: 3-5

### Enterprise Mode
- Gate threshold: ≥0.98
- Consensus threshold: ≥0.95
- Max iterations: 15
- Validators: 5-7

## Data Flow

### Task Execution Flow
1. Task definition → Product Owner validation
2. Agent spawning → Redis coordination
3. Implementation → Test execution
4. Gate check → Validator review
5. Consensus → Product Owner decision

### Redis Key Patterns
- `task:{taskId}:total` - Expected agent count
- `task:{taskId}:completed` - Completion counter
- `swarm:{taskId}:{agentId}:done` - Agent completion signal
- `consensus:{taskId}` - Validator consensus data

## Performance Optimization

### Agent Spawning
- **CLI Mode**: Main chat spawns directly, Redis BLPOP coordination
- **Task Mode**: Direct Task() spawning, full visibility
- **Container Mode**: Docker isolation, MCP networking

### Timeout Management
- Base timeout by phase: Loop 1 (300s), Loop 2 (600s), Loop 3 (900s)
- Memory adjustment: +50% when <1GB available
- Bounds: 60s minimum, 1800s maximum

### Memory Management
- CLI mode: 1GB limit per agent
- Task mode: 2GB limit per agent
- Node heap limiter for memory-constrained environments

## Architecture Decisions

### TypeScript Migration Path
1. **Phase 1**: Orchestration CLI consolidation
2. **Phase 2**: Critical TypeScript conversions
3. **Phase 3**: Output processing consolidation
4. **Phase 4**: Coordinator simplification
5. **Phase 5**: Cleanup and documentation

### Multi-Provider Routing
- Default: Z.ai glm-4.6
- Cost-sensitive: Z.ai, low-tier OpenRouter
- Balanced: Kimi
- Premium: Max, Anthropic
- Ecosystem-specific: Gemini, XAI

### Container Orchestration
- Worktree isolation via COMPOSE_PROJECT_NAME
- Port auto-offset calculation
- Service names in Docker networks (redis, postgres, orchestrator)
- PID-based process monitoring

## Integration Points

### CLI Entry Points
- `/cfn-loop-cli` - Production CLI mode
- `/cfn-loop-task` - Debug Task mode
- `/cfn-docker:*` - Container variants

### Skill Distribution
- 73 total CFN skills
- 7 TypeScript skills (with package.json/tests)
- 66 Bash-only skills
- 612 lines of redundant bash wrappers

### Monitoring & Observability
- SQLite persistence for audit trails
- Redis coordination for real-time signaling
- Checkpoint/restart capabilities
- Performance metrics collection (daa approach)