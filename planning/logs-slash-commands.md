# Claude Flow Slash Commands Documentation

## Overview

Claude Flow provides comprehensive slash commands for AI agent orchestration, swarm coordination, development workflows, and system management. These commands enable developers to interact with powerful AI capabilities directly from the CLI.

## Core Development Commands

### CFN Loop Commands

#### `/cfn-loop`

**Purpose**: Self-correcting development loop with consensus validation

**Usage**: `/cfn-loop <task-description> [options]`

**Parameters**:
- `task-description`: Description of development task
- `--phase`: Specific phase to execute (epic, sprint, phase, consensus, swarm)
- `--threshold`: Consensus threshold (default: 0.90)
- `--max-iterations`: Maximum iterations (default: 10)
- `--agents`: Agent types to include

**Examples**:
```bash
# Basic CFN loop execution
/cfn-loop "Implement user authentication system"

# Execute specific phase
/cfn-loop "Add payment processing" --phase swarm

# Custom threshold and iterations
/cfn-loop "Create API documentation" --threshold 0.85 --max-iterations 5
```

#### `/cfn-loop-epic`

**Purpose**: Multi-phase project orchestration with cross-phase dependencies

**Usage**: `/cfn-loop-epic <epic-description> [options]`

**Parameters**:
- `epic-description`: Epic description
- `--phases`: Number of phases (default: auto)
- `--dependencies`: Phase dependencies
- `--validation`: Validation strategy

**Examples**:
```bash
# Execute epic with auto-phases
/cfn-loop-epic "Build e-commerce platform"

# Custom phase configuration
/cfn-loop-epic "Migrate legacy system" --phases 4 --dependencies "1->2->3->4"
```

#### `/cfn-loop-sprints`

**Purpose**: Single phase with multiple coordinated sprints

**Usage**: `/cfn-loop-sprints <phase-description> [options]`

**Parameters**:
- `phase-description`: Phase description
- `--sprints`: Number of sprints (default: 3)
- `--duration`: Sprint duration
- `--parallel`: Run sprints in parallel (default: false)

#### `/fullstack`

**Purpose**: Launch full-stack development team with complete coverage

**Usage**: `/fullstack <project-description> [options]`

**Parameters**:
- `project-description`: Project description
- `--stack`: Technology stack (react, vue, angular, etc.)
- `--database`: Database type
- `--deployment`: Deployment target

**Examples**:
```bash
# Full-stack React application
/fullstack "Social media dashboard" --stack react --database postgres

# Vue.js project with TypeScript
/fullstack "Admin panel" --stack vue --database mysql --deployment aws
```

## Swarm Management Commands

### Swarm Coordination

#### `/swarm`

**Purpose**: Initialize and manage agent swarms

**Usage**: `/swarm <action> [options]`

**Actions**:
- `init`: Initialize new swarm
- `status`: Show swarm status
- `spawn`: Create new agents
- `orchestrate`: Coordinate task execution
- `monitor`: Real-time monitoring
- `scale`: Scale swarm size
- `destroy`: Shutdown swarm

**Examples**:
```bash
# Initialize mesh swarm
/swarm init --topology mesh --agents 6 --strategy balanced

# Check swarm status
/swarm status --swarm-id swarm-123

# Spawn specialized agents
/swarm spawn --type coder --capabilities "react,typescript" --count 2

# Orchestrate complex task
/swarm orchestrate --task "Implement authentication" --strategy adaptive

# Monitor swarm activity
/swarm monitor --swarm-id swarm-123 --real-time

# Scale swarm
/swarm scale --swarm-id swarm-123 --target-size 8

# Graceful shutdown
/swarm destroy --swarm-id swarm-123
```

### Agent Management

#### `/agent`

**Purpose**: Agent lifecycle management

**Usage**: `/agent <action> [options]`

**Actions**:
- `list`: List available agents
- `info`: Show agent details
- `metrics`: Agent performance metrics
- `rerun`: Rerun agent task
- `terminate`: Terminate agent

**Examples**:
```bash
# List all agents
/agent list --type coder --status active

# Show agent details
/agent info --agent-id coder-456

# Get performance metrics
/agent metrics --agent-id coder-456 --timeframe 24h

# Rerun failed agent
/agent rerun --agent-id coder-456 --task-id task-789

# Terminate agent
/agent terminate --agent-id coder-456
```

## Development Methodology Commands

### SPARC Development

#### `/sparc`

**Purpose**: Execute SPARC methodology phases

**Usage**: `/sparc <phase> <task-description> [options]`

**Phases**:
- `spec`: Specification phase
- `pseudo`: Pseudocode phase
- `arch`: Architecture phase
- `refine`: Refinement phase
- `complete`: Completion phase

**Examples**:
```bash
# SPARC specification phase
/sparc spec "Define API endpoints for user management"

# SPARC architecture phase
/sparc arch "Design database schema for e-commerce"

# SPARC refinement phase
/sparc refine "Optimize authentication flow" --iterations 3
```

### Workflow Management

#### `/workflow`

**Purpose**: Workflow management and execution

**Usage**: `/workflow <action> [options]`

**Actions**:
- `create`: Create new workflow
- `execute`: Execute workflow
- `status`: Check workflow status
- `list`: List available workflows

**Examples**:
```bash
# Create workflow
/workflow create --name "CI/CD Pipeline" --steps "build,test,deploy"

# Execute workflow
/workflow execute --name "CI/CD Pipeline" --input project-123
```

## System Management Commands

### Memory Management

#### `/memory`

**Purpose**: Memory management operations

**Usage**: `/memory <action> [options]`

**Actions**:
- `store`: Store data in memory
- `retrieve`: Retrieve from memory
- `search`: Search memory
- `list`: List memory contents
- `backup`: Backup memory
- `restore`: Restore memory

**Examples**:
```bash
# Store project context
/memory store --key "project-context" --value "E-commerce platform" --namespace project-123

# Search memory
/memory search --pattern "e-commerce" --namespace project-123

# Backup memory
/memory backup --namespace project-123 --destination ./backups/
```

### Configuration Management

#### `/config`

**Purpose**: Configuration management

**Usage**: `/config <action> [options]`

**Actions**:
- `show`: Show current configuration
- `set`: Set configuration value
- `get`: Get configuration value
- `reset`: Reset configuration
- `validate`: Validate configuration

**Examples**:
```bash
# Show current configuration
/config show

# Set configuration value
/config set --key "swarm.max-agents" --value 10

# Validate configuration
/config validate --strict
```

### Status and Monitoring

#### `/status`

**Purpose**: System status reporting

**Usage**: `/status [options]`

**Options**:
- `--component`: Specific component status
- `--verbose`: Detailed status
- `--format`: Output format (table, json)

**Examples**:
```bash
# Overall system status
/status

# Component-specific status
/status --component swarm-coordinator

# Detailed status in JSON format
/status --verbose --format json
```

#### `/monitor`

**Purpose**: System monitoring

**Usage**: `/monitor <target> [options]`

**Targets**:
- `swarm`: Monitor swarm activity
- `agents`: Monitor agent performance
- `tasks`: Monitor task execution
- `system`: Monitor system resources

**Examples**:
```bash
# Monitor swarm activity
/monitor swarm --real-time

# Monitor agent performance
/monitor agents --timeframe 1h

# Monitor task execution
/monitor tasks --status running
```

## Utility Commands

### Hooks Management

#### `/hooks`

**Purpose**: Automation hooks management

**Usage**: `/hooks <action> [options]`

**Actions**:
- `enable`: Enable hooks
- `disable`: Disable hooks
- `list`: List available hooks
- `status`: Show hook status
- `test`: Test hook execution

**Examples**:
```bash
# Enable all hooks
/hooks enable --all

# List available hooks
/hooks list --type pre-commit

# Test hook execution
/hooks test --hook post-edit
```

### Neural Network Management

#### `/neural`

**Purpose**: Neural network training and management

**Usage**: `/neural <action> [options]`

**Actions**:
- `train`: Train neural network
- `predict`: Make predictions
- `evaluate`: Evaluate model performance
- `save`: Save model
- `load`: Load model

**Examples**:
```bash
# Train neural network
/neural train --data ./training-data.csv --epochs 100

# Make predictions
/neural predict --model model-123 --input "test data"

# Evaluate model
/neural evaluate --model model-123 --test-data ./test-data.csv
```

### Performance Optimization

#### `/performance`

**Purpose**: Performance monitoring and optimization

**Usage**: `/performance <action> [options]`

**Actions**:
- `analyze`: Analyze performance
- `optimize`: Optimize performance
- `benchmark`: Run benchmarks
- `report`: Generate performance report

**Examples**:
```bash
# Analyze system performance
/performance analyze --component swarm-coordinator --timeframe 24h

# Optimize performance
/performance optimize --target memory-usage --aggressive

# Generate performance report
/performance report --format detailed --output ./perf-report.md
```

## GitHub Integration Commands

### GitHub Workflow Automation

#### `/github`

**Purpose**: GitHub workflow automation

**Usage**: `/github <action> [options]`

**Actions**:
- `workflow`: Manage workflows
- `pr`: Pull request management
- `issue`: Issue management
- `repo`: Repository management

**Examples**:
```bash
# Create workflow
/github workflow create --name "CI Pipeline" --trigger push

# Create pull request
/github pr create --title "Feature: Add authentication" --source feature/auth

# List issues
/github issue list --status open --label bug
```

## Advanced Commands

### Cost Optimization

#### `/custom-routing-activate`

**Purpose**: Enable tiered provider routing for cost optimization

**Usage**: `/custom-routing-activate [options]`

**Options**:
- `--provider`: Primary provider
- `--fallback`: Fallback provider
- `--threshold`: Cost threshold

#### `/custom-routing-deactivate`

**Purpose**: Disable tiered routing and revert to default provider

**Usage**: `/custom-routing-deactivate`

### Configuration Parsing

#### `/parse-epic`

**Purpose**: Parse and validate epic configuration files

**Usage**: `/parse-epic <file-path> [options]`

**Options**:
- `--validate`: Validate epic configuration
- `--output`: Output format
- `--strict`: Strict validation mode

**Examples**:
```bash
# Parse epic configuration
/parse-epic ./epics/ecommerce-platform.md --validate --output json

# Strict validation
/parse-epic ./epics/user-auth.md --strict
```

## Command Configuration

### Global Configuration

Commands can be configured globally via environment variables or config files:

```bash
# Environment variables
export CFN_DEFAULT_THRESHOLD=0.90
export SWARM_DEFAULT_TOPOLOGY=mesh
export MEMORY_DEFAULT_NAMESPACE=default

# Config file (~/.claude-flow/config.json)
{
  "cfn": {
    "defaultThreshold": 0.90,
    "maxIterations": 10,
    "agentTypes": ["coder", "tester", "researcher"]
  },
  "swarm": {
    "defaultTopology": "mesh",
    "maxAgents": 8,
    "strategy": "balanced"
  },
  "memory": {
    "defaultNamespace": "default",
    "ttl": 3600
  }
}
```

### Command Aliases

Create shortcuts for common commands:

```bash
# Quick swarm initialization
alias si="/swarm init --topology mesh --agents 6"

# Quick CFN loop
alias cf="/cfn-loop"

# Quick status check
alias st="/status --component swarm"
```

## Integration Examples

### Development Workflow

```bash
#!/bin/bash
# dev-workflow.sh

# 1. Initialize swarm for project
/swarm init --topology hierarchical --agents 8

# 2. Execute CFN loop for main feature
/cfn-loop "Implement user authentication system" --threshold 0.95

# 3. Monitor progress
/monitor swarm --real-time

# 4. Generate performance report
/performance report --component agents --timeframe 1h

# 5. Backup memory state
/memory backup --namespace project-$(date +%Y%m%d)
```

### CI/CD Integration

```bash
#!/bin/bash
# ci-pipeline.sh

# 1. Validate epic configuration
/parse-epic ./epics/current-epic.md --validate --strict

# 2. Run automated tests with swarm coordination
/swarm spawn --type tester --capabilities "unit,integration,e2e" --count 3
/swarm orchestrate --task "Execute test suite" --strategy parallel

# 3. Performance analysis
/performance analyze --component system --timeframe 1h

# 4. Generate deployment report
/status --verbose --format json > deployment-status.json
```

## Best Practices

### Command Usage Guidelines

1. **Start Simple**: Begin with basic commands and add options as needed
2. **Use Defaults**: Leverage sensible defaults for common operations
3. **Monitor Progress**: Use monitoring commands to track execution
4. **Backup State**: Regularly backup memory and configuration
5. **Validate Inputs**: Use validation options for critical operations

### Performance Tips

1. **Batch Operations**: Combine multiple operations when possible
2. **Parallel Execution**: Use parallel strategies for independent tasks
3. **Resource Management**: Monitor resource usage during execution
4. **Caching**: Enable caching for repeated operations

### Security Considerations

1. **Access Control**: Use appropriate permissions for sensitive operations
2. **Data Protection**: Secure sensitive data in memory and configurations
3. **Audit Logging**: Enable audit logging for compliance requirements
4. **Token Management**: Secure API tokens and credentials

## Error Handling

### Common Error Scenarios

1. **Invalid Parameters**: Commands provide helpful error messages with suggestions
2. **Resource Limits**: System provides guidance on resource constraints
3. **Network Issues**: Commands include retry logic and fallback mechanisms
4. **Permission Errors**: Clear guidance on required permissions

### Recovery Strategies

1. **Graceful Degradation**: Commands fallback to safer modes when possible
2. **State Recovery**: Memory and state can be restored from backups
3. **Retry Mechanisms**: Built-in retry logic for transient failures
4. **Rollback Support**: Ability to rollback problematic changes

## Related Documentation

- [API](./logs-api.md) - Complete API reference
- [Features](./logs-features.md) - Available logging features
- [Functions](./logs-functions.md) - Utility functions
- [Hooks](./logs-hooks.md) - System integration points
- [MCP](./logs-mcp.md) - Model Context Protocol