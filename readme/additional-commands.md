# Additional Claude Flow Commands (v2)

Specialized commands for advanced development workflows, complex system management, and enterprise-scale operations.

## CFN-* CLI Commands (v2.0.0)

Complete CLI suite for claude-flow-novice operations.

### cfn-spawn - Agent Spawning

**Purpose**: Spawn agents with task context

**Signature**: `cfn-spawn agent <type> [options]`

**Options**:
- `--task-id` - Task identifier
- `--iteration` - Iteration number
- `--context` - Context description
- `--mode` - Execution mode (mvp/standard/enterprise)

**Example**:
```bash
cfn-spawn agent coder --task-id auth-impl --iteration 1
cfn-spawn researcher --context "API performance"
```

### cfn-loop - CFN Loop Orchestration

**Purpose**: Execute CFN Loop workflows

**Subcommands**: single, epic, sprints

**Examples**:
```bash
cfn-loop single "Implement JWT authentication" --mode=standard
cfn-loop epic "Build complete auth system"
cfn-loop sprints "Phase 1: Core implementation" --phase=phase-1
```

### cfn-swarm - Swarm Coordination

**Purpose**: Initialize and manage agent swarms

**Subcommands**: init, status, shutdown

**Examples**:
```bash
cfn-swarm init mesh --max-agents 5 --strategy balanced
cfn-swarm status
cfn-swarm shutdown --task-id task-123
```

### cfn-portal - Web Portal Management

**Purpose**: Manage web portal for swarm visibility

**Subcommands**: start, stop, status, agents, metrics, events

**Examples**:
```bash
cfn-portal start --port 3000
cfn-portal agents --status active
cfn-portal events --limit 100
```

### cfn-context - ACE Context Operations

**Purpose**: Adaptive Context Engine operations

**Subcommands**: reflect, curate, inject, query, stats

**Examples**:
```bash
cfn-context query "redis coordination" --category technical
cfn-context stats
cfn-context inject --phase implementation
```

### cfn-metrics - Monitoring and Analytics

**Purpose**: Monitor agent and system performance

**Subcommands**: agent, consensus, fleet

**Examples**:
```bash
cfn-metrics agent --agent-id coder-1 --period 1h
cfn-metrics consensus --task-id task-123
cfn-metrics fleet
```

### cfn-redis - Redis Coordination Helpers

**Purpose**: Redis coordination patterns and waiting mode

**Subcommands**: pattern, waiting-mode, event

**Examples**:
```bash
cfn-redis pattern mesh-hybrid --task-id task-123
cfn-redis waiting-mode --task-id task-123 --agent-id coder-1 --action enter
cfn-redis event
```

## Skills-First Coordination Commands

### `/swarm`
**Purpose**: Spawn and coordinate multi-agent workflows with Redis integration

**Parameters:**
- `--skills`: Redis coordination skills to activate
- `--strategy`: Agent coordination strategy
- `--mode`: Swarm execution mode

**Example:**
```bash
npx claude-flow-novice swarm "Implement authentication" \
  --skills=redis-coordination,agent-spawning \
  --strategy development
```

### `/sparc`
**Purpose**: Execute systematic specification, architecture, refinement, and completion workflows

**Phases:**
- `analysis`
- `design`
- `refine`
- `complete`

**Example:**
```bash
# SPARC workflow for database performance
/sparc analysis "Database performance issues"
/sparc design "Microservices architecture"
/sparc refine "API optimization"
```

## Cost-Optimized Agent Spawning

### Hybrid Routing Modes

1. **Automatic Selection**
```bash
# Keyword-based agent matching
node src/cli/hybrid-routing/spawn-workers.js "Build auth system" --max-agents=3
```

2. **Coordinator Override**
```bash
# Manual agent type specification
node src/cli/hybrid-routing/spawn-workers.js "Refactor API" \
  --agents=architect,coder,reviewer
```

3. **Full Override**
```bash
# Complete agent and subtask control
node src/cli/hybrid-routing/spawn-workers.js "OAuth2 security" \
  --agents=coder,security-specialist \
  --subtasks="Implement OAuth2,Audit token security"
```

## Performance and Optimization

### WASM Performance Commands

```bash
# 40x Performance Optimization
/wasm initialize --memory-size 1GB --target 40x
/wasm optimize --code "./src/app.js"
/wasm benchmark --tests standard

# Validate performance improvements
claude-flow-novice validate:wasm-performance --target 40x
```

## Enterprise Coordination

### Fleet Management

```bash
# Initialize enterprise fleet
/fleet init --max-agents 1500 \
  --regions us-east-1,eu-west-1 \
  --efficiency-target 0.40

# Scale fleet dynamically
/fleet scale --fleet-id fleet-123 \
  --target-size 2000 \
  --strategy predictive
```

### Event Bus (10,000+ events/sec)

```bash
# High-throughput event management
/eventbus init --throughput-target 10000
/eventbus publish --type agent.lifecycle
/eventbus subscribe --pattern "agent.*"
```

## Compliance and Security

### Regulatory Validation

```bash
# Validate compliance standards
/compliance validate --standard GDPR \
  --scope data-privacy,user-rights \
  --detailed

# Generate audit reports
/compliance audit --period quarterly \
  --format pdf \
  --include-recommendations
```

## Monitoring and Diagnostics

### System Health

```bash
# Comprehensive system status
claude-flow-novice status --verbose

# Health check and validation
claude-flow-novice test:health
claude-flow-novice validate:phase-completion
```

### Debugging Tools

```bash
# Agent and hook debugging
claude-flow-novice debug agent_123 --verbose
claude-flow-novice debug:hooks --trace
```

## Testing and Quality Assurance

```bash
# Comprehensive test suite
claude-flow-novice test:comprehensive
claude-flow-novice test:coverage
claude-flow-novice validate:agents
```

## SDK and Integration

```bash
# SDK lifecycle management
claude-flow-novice sdk:enable
claude-flow-novice sdk:validate
claude-flow-novice sdk:test
```

## Best Practices

1. Use skills-first coordination
2. Leverage cost-optimized agent spawning
3. Monitor system performance
4. Validate compliance and security
5. Maintain comprehensive test coverage

Note: Always refer to the latest documentation for most up-to-date command syntax and capabilities.