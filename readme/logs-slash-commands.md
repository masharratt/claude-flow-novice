# Claude Flow Slash Commands (v2)

Claude Flow provides comprehensive slash commands for AI agent orchestration, CFN Loop execution, swarm coordination, and system management. These commands enable developers to interact with AI capabilities directly from the CLI.

## CFN Loop Commands

### `/cfn-loop`
**Purpose**: Execute single task through CFN Loop with advanced orchestration

**Parameters:**
- `--mode`: CFN Loop mode (default: "standard")
  - Options: "mvp", "standard", "enterprise"
- `--skills`: Redis coordination skills to activate
- `--max-iterations`: Maximum loop iterations (default varies by mode)
- `--confidence-gate`: Confidence threshold for loop progression
- `--consensus-threshold`: Consensus percentage required

**Example:**
```bash
# Basic usage
/cfn-loop "Implement user authentication"

# Advanced configuration
/cfn-loop "Design payment gateway" \
  --mode enterprise \
  --skills="redis-coordination,agent-spawning" \
  --max-iterations 15 \
  --confidence-gate 0.85 \
  --consensus-threshold 0.95
```

### `/cfn-loop-single`
**Purpose**: Execute a single, focused task with minimal overhead

**Parameters:**
- `--mode`: CFN Loop mode (default: "mvp")
- `--agent`: Specify primary agent type

**Example:**
```bash
/cfn-loop-single "Update database schema" --agent backend-dev
```

### `/cfn-loop-epic`
**Purpose**: Manage complex, multi-phase epic development with comprehensive orchestration

**Parameters:**
- `--cfn-mode`: CFN Loop mode (default: "auto")
- `--config`: Path to epic configuration file
- `--skills`: Additional skills for coordination
- `--dry-run`: Validate configuration without execution

**Example:**
```bash
/cfn-loop-epic "Build e-commerce platform" \
  --config ./epic-config.json \
  --skills="redis-coordination,monitoring" \
  --cfn-mode standard
```

### `/cfn-loop-sprints`
**Purpose**: Manage sprint-based development with automated iteration tracking

**Parameters:**
- `--sprint-config`: Sprint planning configuration
- `--mode`: CFN Loop mode
- `--output`: Detailed sprint report format

**Example:**
```bash
/cfn-loop-sprints "Q4 Product Roadmap" \
  --sprint-config ./q4-sprints.yaml \
  --mode enterprise \
  --output markdown
```

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

## Best Practices

1. **Start Simple**: Begin with basic commands and add options as needed
2. **Use Skills**: Leverage Redis coordination skills for complex workflows
3. **Monitor Progress**: Use monitoring commands to track execution
4. **Configure Carefully**: Adjust parameters for optimal performance and cost-efficiency

Note: Always refer to the latest documentation for most up-to-date command syntax and capabilities.