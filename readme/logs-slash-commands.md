# Claude Flow Slash Commands (v2)

Claude Flow provides comprehensive slash commands for AI agent orchestration, CFN Loop execution, swarm coordination, and system management. These commands enable developers to interact with AI capabilities directly from the CLI.

## CFN Loop Commands

### `/cfn-loop-task [options]`

**Purpose**: Execute CFN Loop in Task mode with full visibility

**Usage**:
```bash
/cfn-loop-task "Task description" --mode=standard
```

**Flags**:
- `--mode`: CFN Loop mode - mvp|standard|enterprise (default: standard)
- `--max-iterations`: Maximum loop iterations (default: varies by mode)
- `--ace-reflect`: Enable adaptive context reflection

**Output**: Task execution with real-time agent visibility

**Example**:
```bash
/cfn-loop-task "Implement user authentication" --mode=standard
# Output: Loop 3/Loop 2/Product Owner execution with full visibility
```

**Use Cases**: Debugging, learning, short tasks (<5 minutes)

### `/cfn-docker-loop [options]`

**Purpose**: Execute container-based CFN Loop with skill-based MCP isolation and resource management

**Usage**:
```bash
/cfn-docker-loop "Task description" --mode=standard
```

**Flags**:
- `--mode`: CFN Loop mode - mvp|standard|enterprise (default: standard)
- `--memory-limit`: Per-agent memory limit (default: 1g)
- `--network`: Docker network for MCP communication (default: mcp-network)
- `--timeout`: Execution timeout in seconds (default: varies by mode)

**Key Benefits**:
- Container isolation for all agents
- MCP authentication and access control
- Redis-based swarm recovery
- 95% cost reduction with CLI mode

**Use Cases**: Production deployment, secure execution, resource management

### `/cfn-docker-task [options]`

**Purpose**: Execute container-based CFN Loop in Task mode for development and debugging

**Usage**:
```bash
/cfn-docker-task "Debug authentication issue" --mode=standard --debug
```

**Flags**:
- `--mode`: CFN Loop mode - mvp|standard|enterprise (default: standard)
- `--debug`: Enable debug mode with detailed logging
- `--verbose`: Show all agent output and decision-making
- `--dry-run`: Show configuration without execution

**Output**: Full agent visibility with complete execution transparency

**Use Cases**: Development, debugging, learning, algorithm testing

### `/cfn-docker-cli [options]`

**Purpose**: Execute container-based CFN Loop in CLI mode for production workloads

**Usage**:
```bash
/cfn-docker-cli "Deploy microservices" --mode=enterprise --timeout=3600
```

**Flags**:
- `--mode`: CFN Loop mode - mvp|standard|enterprise (default: standard)
- `--timeout`: Execution timeout in seconds (default: varies by mode)
- `--memory-limit`: Per-agent memory limit (default: 1g)
- `--cpu-limit`: Per-agent CPU limit (default: 1.0)
- `--recover`: Recover interrupted task with task-id
- `--monitor`: Enable real-time monitoring

**Output**: Production deployment with provider routing

**Use Cases**: Production deployment, cost-sensitive workloads, long-running tasks

### `/cfn-loop-cli [options]`

**Purpose**: Execute CFN Loop in simplified 2-layer CLI mode for production workloads

**Usage**:
```bash
/cfn-loop-cli "Task description" --mode=standard --provider=kimi
```

**Flags**:
- `--mode`: CFN Loop mode - mvp|standard|enterprise (default: standard)
- `--provider`: AI provider - zai|kimi|openrouter|max (default: zai)
- `--max-iterations`: Maximum loop iterations (default: varies by mode)
- `--timeout`: Execution timeout in seconds (default: varies by mode)
- `--ace-reflect`: Enable adaptive context reflection

**Architecture**: Main Chat → CLI Agents (direct Redis BLPOP coordination)

**Provider Options**:
- `zai`: glm-4.6 model
- `kimi`: kimi-k2-turbo-preview model
- `openrouter`: anthropic/claude-sonnet-4.5 model
- `max`: claude-sonnet-4.5 model

**Example**:
```bash
/cfn-loop-cli "Build payment system" --mode=standard --provider=kimi
# Output: Direct Main Chat coordination with CLI agents
```

**Use Cases**: Production deployment, provider routing, simplified coordination

**Protocol**: CLI Mode Redis Completion Protocol (simplified from CFN Loop protocol)

### `/switch-api [provider]`

**Purpose**: Switch Main Chat and Task tool API provider

**Usage**:
```bash
/switch-api kimi
```

**Parameters**:
- `provider`: Target provider - zai|kimi|openrouter|max

**Example**:
```bash
/switch-api zai
# Output: Main Chat now uses Z.ai provider for all API calls
```

**Use Cases**: Provider switching, cost management, quality control

### `/cfn-loop-frontend [options]`

**Purpose**: Execute frontend CFN Loop with visual iteration and mockup validation

**Usage**:
```bash
/cfn-loop-frontend "Build login UI" --mockup=/path/to/mockup.png --mode=standard
```

**Flags**:
- `--mockup`: Path to UI mockup for visual validation (PNG/JPG)
- `--brand-guidelines`: Path to brand guidelines JSON (optional)
- `--mode`: Quality mode - mvp|standard|enterprise (default: standard)
- `--spawn-mode`: Agent spawning method - cli|task (default: cli)
- `--max-iterations`: Max visual iteration cycles (default: 5)

**Output**: Frontend implementation with visual validation artifacts

**Example**:
```bash
/cfn-loop-frontend "Build dashboard" --mockup=/mockups/dashboard.png --mode=standard
# Output: Screenshots, videos, component documentation
```

**Artifacts**:
- Screenshots: `tests/screenshots/*.png`
- Videos: `test-results/**/video.webm`
- Component docs: `docs/*_IMPLEMENTATION.md`

### `/cfn-loop-document [options]`

**Purpose**: Generate documentation for completed sprints/epics/phases

**Usage**:
```bash
/cfn-loop-document --sprint=name --epic=name --phase=name
```

**Flags**:
- `--sprint`: Generate documentation for specific sprint
- `--epic`: Generate documentation for specific epic
- `--phase`: Generate documentation for specific phase

**Output**: Updated documentation files in `/readme` directory

**Example**:
```bash
/cfn-loop-document --sprint="P1 Authentication" --epic="User Management"
# Output: Updated sprint and epic documentation
```


### `/cfn-expert-update`

**Purpose**: Update CFN system expert agent with relevant git commits since last scan

**Parameters**:
- `--dry-run`: Show updates without applying changes
- `--since=commit_hash`: Force scan from specific commit
- `--force`: Ignore last commit tracking and re-scan

**Usage**:
```bash
# Standard update (scans since last run)
/cfn-expert-update

# Preview changes without applying
/cfn-expert-update --dry-run

# Force scan from specific commit
/cfn-expert-update --since=abc123def

# Complete re-scan
/cfn-expert-update --force
```

**Functionality**:
- Scans git commits since last tracked update
- Detects CFN-relevant changes (CLAUDE.md, commands, skills, agents)
- Extracts knowledge from relevant commits
- Updates `.claude/agents/custom/cfn-system-expert.md` agent
- Creates automatic backups before updates
- Tracks last scanned commit to prevent duplicates

**Relevance Detection**:
- **High Priority**: `CLAUDE.md`, `/cfn-loop-*` commands, CFN Loop methodology
- **Medium Priority**: `.claude/skills/cfn-*` patterns, coordination, cost optimization
- **Low Priority**: Performance improvements, documentation updates

**State Tracking**: `.claude/state/cfn-expert-last-commit`

**Backup Location**: `.claude/backups/cfn-expert/`

## CFN Docker Commands

### `/cfn-docker-loop [options]`

**Purpose**: Execute container-based CFN Loop with skill-based MCP isolation and resource management

**Usage**:
```bash
/cfn-docker-loop "Task description" --mode=standard
```

**Execution Modes**:
- **Task Mode**: `/cfn-docker-loop-task` - Development, debugging, full visibility
- **CLI Mode**: `/cfn-docker-loop-cli` - Production, cost optimization (95% savings)

**Flags**:
- `--mode`: CFN Loop mode - mvp|standard|enterprise (default: standard)
- `--memory-limit`: Per-agent memory limit (default: 1g)
- `--network`: Docker network for MCP communication (default: mcp-network)
- `--timeout`: Execution timeout in seconds (default: varies by mode)

**Key Benefits**:
- Container isolation for all agents
- MCP authentication and access control
- Redis-based swarm recovery
- 95% cost reduction with CLI mode

**Use Cases**: Production deployment, secure execution, resource management

### `/cfn-docker-loop-task [options]`

**Purpose**: Execute container-based CFN Loop in Task mode for development and debugging

**Usage**:
```bash
/cfn-docker-loop-task "Debug authentication issue" --mode=standard --verbose
```

**Flags**:
- `--mode`: CFN Loop mode - mvp|standard|enterprise (default: standard)
- `--debug`: Enable debug mode with detailed logging
- `--verbose`: Show all agent output and decision-making
- `--dry-run`: Show configuration without execution

**Output**: Full agent visibility with complete execution transparency

**Example**:
```bash
/cfn-docker-loop-task "Implement new feature" --mode=standard --debug
# Output: Complete agent execution logs, decision-making process, results
```

**Use Cases**: Development, debugging, learning, algorithm testing

### `/cfn-docker-loop-cli [options]`

**Purpose**: Execute container-based CFN Loop in CLI mode for production workloads

**Usage**:
```bash
/cfn-docker-loop-cli "Deploy microservices" --mode=enterprise --timeout=3600
```

**Flags**:
- `--mode`: CFN Loop mode - mvp|standard|enterprise (default: standard)
- `--timeout`: Execution timeout in seconds (default: varies by mode)
- `--memory-limit`: Per-agent memory limit (default: 1g)
- `--cpu-limit`: Per-agent CPU limit (default: 1.0)
- `--recover`: Recover interrupted task with task-id
- `--monitor`: Enable real-time monitoring

**Output**: Production deployment with provider routing

**Example**:
```bash
/cfn-docker-loop-cli "Process data migration" --mode=enterprise --memory-limit=2g
# Output: Task ID for monitoring, efficient CLI execution
```

**Use Cases**: Production deployment, cost-sensitive workloads, long-running tasks

## Cost-Savings Mode Commands

### `/cost-savings`
**Purpose**: Toggle cost-savings mode for CLI-based agent spawning

**Subcommands:**
- `enable`: Activate cost-savings mode
- `disable`: Deactivate cost-savings mode
- `status`: Show current mode

**Example:**
```bash
/cost-savings enable  # Switch to cheap CLI spawning
/cost-savings status  # Check current configuration
```

## Swarm Coordination Commands

### `/swarm`
**Purpose**: Spawn and coordinate multi-agent workflows with Redis integration

**Parameters:**
- `--skills`: List of skills to activate
- `--strategy`: Agent coordination strategy
- `--mode`: Swarm execution mode

**Example:**
```bash
npx claude-flow-novice swarm "Task description" \
  --skills=redis-coordination,agent-spawning \
  --strategy development
```

## Monitoring and Management

### `/agent-status`
**Purpose**: Query agent state, activity, and performance metrics

**Parameters:**
- `--filter`: Filter by agent type or status
- `--phase`: Filter by CFN Loop phase
- `--format`: Output format (json, table, markdown)

**Example:**
```bash
/agent-status --filter backend-dev --phase loop3
```

### `/cfn-mode`

**Purpose**: Toggle CFN Loop v3 spawning mode between CLI and Task execution

**Subcommands**:
- `cli`: CLI spawning (cost-optimized, Z.ai routing)
- `task`: Task spawning (simplified, full visibility)
- `status`: Show current mode

**Example:**
```bash
/cfn-mode cli      # Switch to CLI spawning
/cfn-mode task     # Switch to Task mode
/cfn-mode status   # Check current mode
```

**Mode Characteristics**:
- `cli`: Coordinator → orchestrator → CLI agents (default)
- `task`: Coordinator → JSON → Main Chat spawns Task() agents

**Persistence**: Mode saved to `.cfn-mode.json`

**Integration**: Affects `/cfn-loop-cli`, `/cfn-loop-task`, `/cfn-loop-frontend`

## Testing Commands

### `/cfn-docker-core-test-suite [options]`

**Purpose**: Run comprehensive Docker CFN Loop core test suite validating coordinator v3, infrastructure, and Redis coordination

**Flags**:
- `--category`: Run specific test category
  - Options: coordinator|infrastructure|redis|cfn-loop|integration|all (default: all)
- `--test`: Run single test file (e.g., redis-coordination-tests.sh)
- `--verbose`: Show detailed test output
- `--quick`: Skip long-running tests (~100 min → ~70 min)

**Example:**
```bash
# Full regression suite
/cfn-docker-core-test-suite

# Specific category
/cfn-docker-core-test-suite --category coordinator

# Single test with verbose output
/cfn-docker-core-test-suite --test redis-coordination-tests.sh --verbose

# Quick validation
/cfn-docker-core-test-suite --quick
```

**Test Coverage:**
- Coordinator v3: 6 tests (planning, spawning, validation, iteration, fault tolerance)
- Docker Infrastructure: 2 tests (hello-world parity, agent lifecycle)
- Redis Coordination: 1 test (Node.js client connectivity, heartbeat, pub/sub)
- Resource Management: 1 test (wave spawning, memory limits, tier allocation)
- CFN Loop Patterns: 1 test (gate, consensus, decision)
- Environment Management: 1 test (environment variable handling)
- Integration: 1 test (end-to-end coordinator workflow)
- **Total: 13 test files, 44+ test cases, 100% coverage**

**Prerequisites**: Automatically validates and setups Docker daemon, mcp-network, Redis container, required images

**Bug Fix Validation**: Validates Bug #4 (agent task assignment) and Bug #6 (Redis environment variables)

### `/run-tests`

**Purpose**: Execute CFN test suites with automatic benchmarking and regression detection

**Parameters:**
- `--suite`: Test suite to run (default: "all")
  - Options: "all", "hello-world", "cfn-e2e"
- `--benchmark`: Store results in SQLite benchmark database
- `--detect-regressions`: Compare against baseline (10-run average)
- `--threshold`: Regression threshold percentage (default: 10)

**Example:**
```bash
# Run all tests with benchmarking
/run-tests --benchmark --detect-regressions

# Run specific suite
/run-tests --suite hello-world

# Custom regression threshold
/run-tests --benchmark --threshold 5
```

**Test Coverage:**
- Hello World: 7 layers (tool validation, coordinator spawning, review handoff, error retry)
- CFN E2E: 9 tests (coordinator handoff, gate checks, Loop 2/3 validation, Product Owner decision)
- Total: 13 automated tests

**Benchmarking:**
- SQLite storage: `.test-benchmarks.db`
- Metrics: success rate, duration, test counts
- Regression detection: 10% threshold (configurable)

## Best Practices

1. **Start Simple**: Begin with basic commands and add options as needed
2. **Use Skills**: Leverage Redis coordination skills for complex workflows
3. **Monitor Progress**: Use monitoring commands to track execution
4. **Configure Carefully**: Adjust parameters for optimal performance and cost-efficiency

Note: Always refer to the latest documentation for most up-to-date command syntax and capabilities.

### `/cfn-init`

Initialize CFN files in project with namespace isolation.

**Purpose**: Copy namespace-isolated CFN files from node_modules to project root

**Usage**:
```bash
npm install claude-flow-novice
npx cfn-init
```

**What it does**:
- Copies 23 agents to `.claude/agents/cfn-dev-team/`
- Copies 43 skills to `.claude/skills/cfn-*/`
- Copies 7 hooks to `.claude/hooks/cfn-*`
- Copies 45+ commands to `.claude/commands/cfn/`

**Namespace isolation**:
- Only `cfn-*` prefixed files copied/overwritten
- User custom files preserved (~0.01% collision risk)
- Safe to run multiple times

**Example**:
```bash
cd my-project
npm install claude-flow-novice
npx cfn-init
# ✅ .claude/agents/cfn-dev-team/ created
# ⚠️  .claude/agents/my-team/ preserved
```

### `/list-agents`

List available agents in the CFN dev team namespace.

**Purpose**: Discover and display agents within the namespace-isolated structure

**Usage**:
```bash
/list-agents
```

**What it returns**:
- Total agents: 23 in cfn-dev-team
- Namespace-isolated agent list
- Detailed agent metadata

**Example**:
```bash
/list-agents
# 23 agents in .claude/agents/cfn-dev-team/
# Agents: backend-dev, frontend-dev, fullstack, ...
```

### `/list-agents-rebuild`

Dynamically discover and regenerate agent list from directory structure.

**Purpose**: Rebuild agent inventory by recursively scanning `.claude/agents/**/*.md`

**Usage**:
```bash
/list-agents-rebuild
```

**What it does**:
- Scans `.claude/agents/**/*.md`
- Discovers agents in subfolder structures (e.g., cfn-dev-team)
- Regenerates comprehensive agent index
- Validates agent metadata

**Example**:
```bash
/list-agents-rebuild
# ✅ Discovered 23 agents in cfn-dev-team
# ✅ Indexed 43 skills
# ✅ Agent catalog updated
```

## Deprecated Commands (Removed 2025-10-31)

⚠️ **DEPRECATED COMMANDS MOVED**: See [`.claude/commands/deprecated/`](../../../.claude/commands/deprecated/) for archived command documentation and migration guidance.

### Quick Migration Reference

| Old Command | New Command | Use Case |
|-------------|-------------|----------|
| `/cfn-loop` | `/cfn-loop-cli` or `/cfn-loop-task` | General execution |
| `/cfn-loop-single` | `/cfn-loop-cli --mode=mvp` | Single tasks |
| `/cfn-loop-epic` | Multiple `/cfn-loop-cli` calls | Multi-phase work |
| `/cfn-loop-sprints` | Multiple `/cfn-loop-cli` calls | Sprint development |

### Migration Examples

**Basic Migration**:
```bash
# Old: /cfn-loop "Implement feature"
# New: /cfn-loop-cli "Implement feature" --mode=standard
```

**Epic Migration**:
```bash
# Old: /cfn-loop-epic "Build platform"
# New: Execute individual phases
/cfn-loop-cli "Phase 1: Core architecture"
/cfn-loop-cli "Phase 2: User management"
/cfn-loop-cli "Phase 3: Payment system"
```

**Sprint Migration**:
```bash
# Old: /cfn-loop-sprints "Q4 Roadmap"
# New: Execute individual sprints
/cfn-loop-cli "Sprint 1: Authentication"
/cfn-loop-cli "Sprint 2: User profiles"
```

### Detailed Documentation

For complete deprecated command documentation, see:
- [Deprecated Commands README](../../../.claude/commands/deprecated/README.md)
- [Individual deprecated command files](../../../.claude/commands/deprecated/)