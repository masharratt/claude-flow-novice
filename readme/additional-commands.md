# Additional Claude Flow Commands (v2)

Specialized commands for advanced development workflows, complex system management, and enterprise-scale operations.

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