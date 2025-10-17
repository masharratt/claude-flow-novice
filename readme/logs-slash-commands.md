# Claude Flow Slash Commands Documentation

## Overview

Claude Flow provides comprehensive slash commands for AI agent orchestration, CFN Loop execution, swarm coordination, and system management. These commands enable developers to interact with AI capabilities directly from the CLI.

## API Provider Commands

### `/switch-api`

**Purpose**: Switch between API providers with Redis transparency and CFN Loop integration

**Usage**: `/switch-api <provider> [options]`

**Providers**:
- `max`: Claude Max (subscription-based)
- `zai`: z.ai provider (cost-optimized)
- `auto`: Automatic selection based on task requirements

**Options**:
- `--verbose`: Show detailed switching information
- `--dry-run`: Preview switch without execution
- `--migrate`: Migrate current state to new provider

**Examples**:
```bash
# Switch to z.ai for cost optimization
/switch-api zai --verbose

# Dry run to preview changes
/switch-api max --dry-run

# Auto-select best provider
/switch-api auto --task "lightweight code review"

# Switch with CFN Loop state migration
/switch-api zai --migrate
```

**Integration**: Updates Redis provider state, triggers CFN Loop coordinator adjustments

### `/cost-savings-on`

**Purpose**: Enable CLI-based coordination for cost optimization

**Usage**: `/cost-savings-on`

**What it does**:
- Activates CLI-based agent spawning via spawn-workers.js
- Injects CLI coordinator sections into CLAUDE.md
- Routes workers through z.ai provider
- Coordinator runs on Claude Max subscription

**Example**:
```bash
/cost-savings-on
```

**Output**: Mode configuration status, CLAUDE.md updates, active coordinators

### `/cost-savings-off`

**Purpose**: Disable CLI mode, use Task-tool coordination

**Usage**: `/cost-savings-off`

**What it does**:
- Deactivates CLI spawning patterns
- Injects Task-tool coordinator sections into CLAUDE.md
- Uses main provider for all agents
- Removes CLI-specific coordination

**Example**:
```bash
/cost-savings-off
```

**Output**: Mode configuration status, CLAUDE.md updates, active coordinators

### `/cost-savings-status`

**Purpose**: Display current cost-savings mode configuration

**Usage**: `/cost-savings-status`

**What it displays**:
- Current mode (CLI or Task-tool)
- Active coordinator patterns
- CLAUDE.md section state
- Configuration file location

**Example**:
```bash
/cost-savings-status
```

**Output**: Mode status, coordinator configuration, CLAUDE.md sections

### `/github-commit`

**Purpose**: Create git commits with CFN Loop integration and automated messaging

**Usage**: `/github-commit [options]`

**Options**:
- `--chat`: Create commit from chat conversation
- `--message <text>`: Custom commit message
- `--files <list>`: Specific files to include
- `--components <list>`: CFN Loop components to include
- `--type <type>`: Commit type (feat, fix, docs, test)

**Examples**:
```bash
# Create commit from chat conversation
/github-commit --chat

# Create custom commit message
/github-commit --message "feat: Add authentication system"

# Include specific CFN Loop components
/github-commit --components="CFN Loop,agent optimization"

# Create specific type commit
/github-commit --type feat --files "src/auth.js,tests/auth.test.js"
```

**Integration**: Automatically includes CFN Loop metadata, agent confidence scores, and validation results

## Core Development Commands

### CFN Loop Commands

#### `/cfn-loop`

**Purpose**: Self-correcting development loop with consensus validation

**Usage**: `/cfn-loop <task-description> [options]`

**Parameters**:
- `task-description`: Description of development task
- `--mode`: CFN Loop mode (mvp, standard, enterprise) - default: standard
- `--phase`: Specific phase to execute (epic, sprint, phase, consensus, swarm)
- `--threshold`: Consensus threshold (overrides mode default)
- `--max-iterations`: Maximum iterations (overrides mode default)
- `--agents`: Agent types to include

**Modes**:
- `mvp`: Speed-focused (Gate: 0.70, Consensus: 0.80, 2 validators, 5 iterations)
- `standard`: Balanced (Gate: 0.75, Consensus: 0.90, 4 validators, 10 iterations) - default
- `enterprise`: Quality-focused (Gate: 0.75, Consensus: 0.95, 4 validators, 15 iterations, Loop 0.5 planning, 4-person board)

**Examples**:
```bash
# Basic CFN loop execution (standard mode)
/cfn-loop "Implement user authentication system"

# MVP mode for fast prototyping
/cfn-loop "Build MVP prototype" --mode=mvp

# Enterprise mode with full quality gates
/cfn-loop "Production API system" --mode=enterprise

# Execute specific phase with mode
/cfn-loop "Add payment processing" --phase swarm --mode=standard

# Custom threshold overrides mode default
/cfn-loop "Create API documentation" --mode=enterprise --threshold 0.93
```

#### `/cfn-loop-sprints`

**Purpose**: Execute multi-sprint project with automatic phase transitions

**Usage**: `/cfn-loop-sprints <phase-description> [options]`

**Parameters**:
- `phase-description`: Phase description
- `--sprints`: Number of sprints (default: 3)
- `--duration`: Sprint duration
- `parallel`: Run sprints in parallel (default: false)

**Examples**:
```bash
# Execute three sprints for authentication
/cfn-loop-sprints "User authentication system" --sprints 3

# Sprint with custom duration
/cfn-loop-sprints "Payment processing" --duration 30m

# Parallel sprints for rapid development
/cfn-loop-sprints "Microservice architecture" --sprints 5 --parallel
```

#### `/cfn-loop-single`

**Purpose**: Execute single task through CFN Loop with validation

**Usage**: `/cfn-loop-single <task-description> [options]`

**Parameters**:
- `task-description`: Single task description
- `--agents`: Specific agent types
- `--mode`: CFN Loop mode

**Examples**:
```bash
# Single task with specific agents
/cfn-loop-single "Write unit tests" --agents coder,tester

# Quick MVP implementation
/cfn-loop-single "Create login form" --mode=mvp
```

#### `/cfn-optimize-agents`

**Purpose**: Parallel optimization of agent library with performance metrics

**Usage**: `/cfn-optimize-agents [options]`

**Options**:
- `--agents`: Number of optimization agents (default: 4)
- `--rounds`: Optimization rounds per agent (default: 3)
- `--metrics`: Performance metrics collection

**Examples**:
```bash
# Standard optimization with 4 agents
/cfn-optimize-agents

# High-performance optimization
/cfn-optimize-agents --agents 8 --rounds 5

# Performance-focused optimization
/cfn-optimize-agents --metrics performance
```

#### `/cfn-loop-document`

**Purpose**: Auto-update documentation based on completed work

**Usage**: `/cfn-loop-document [options]`

**Options**:
- `--sprint <name>`: Document specific sprint
- `--epic <name>`: Document entire epic
- `--phase <name>`: Document single phase

**Examples**:
```bash
# Auto-document from git history
/cfn-loop-document

# Document specific sprint
/cfn-loop-document --sprint=auth-system

# Document entire epic
/cfn-loop-document --epic=e-commerce-v1
```

#### `/cfn-claude-sync`

**Purpose**: Synchronize CLAUDE.md configuration across agents

**Usage**: `/cfn-claude-sync [options]`

**Options**:
- `--validate`: Check configuration consistency
- `--fix`: Auto-fix inconsistencies
- `--backup`: Create backup before sync

**Examples**:
```bash
# Sync CLAUDE.md across all agents
/cfn-claude-sync

# Validate without changes
/cfn-claude-sync --validate

# Auto-fix with backup
/cfn-claude-sync --fix --backup
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
## Agent Selection Commands

### `/recommend-agents`

**Purpose**: Test intelligent agent selection based on use cases

**Usage**: `/recommend-agents "task description"`

**Examples**:
```bash
# Get agent recommendations for authentication system
/recommend-agents "Build user authentication system"

# Test different scenarios
/recommend-agents "Conduct security audit"
/recommend-agents "Design microservices architecture"
/recommend-agents "Optimize database performance"
```

**Output**: 
- Primary agents (recommended)
- Secondary agents (optional)
- Reasoning for selection
- Spawn command example

### `/list-agents`

**Purpose**: List all available specialized agents with capabilities

**Usage**: `/list-agents [options]`

**Options**:
- `--by-category`: Group agents by category
- `--category <name>`: Show agents from specific category
- `--search <term>`: Search agents by name or capability

**Examples**:
```bash
# List all agents
/list-agents

# Group by category
/list-agents --by-category

# Show security agents
/list-agents --category security

# Search for testing capabilities
/list-agents --search "test"
```

### `/list-agents-rebuild`

**Purpose**: Rebuild AVAILABLE-AGENTS.md from .claude/agents/ folder

**Usage**: `/list-agents-rebuild`

**Output**: Regenerates agent documentation with current capabilities

## Fleet Management Commands

### `/fleet`

**Purpose**: Enterprise fleet management for 1000+ concurrent agents

**Usage**: `/fleet <action> [options]`

**Actions**:
- `init`: Initialize fleet manager
- `scale`: Auto-scale fleet with efficiency optimization
- `optimize`: Optimize resource allocation
- `metrics`: Get fleet performance metrics
- `regions`: Configure multi-region deployment
- `health`: Monitor fleet health and availability

**Examples**:
```bash
# Initialize enterprise fleet
/fleet init --max-agents 1500 --regions us-east-1,eu-west-1 --efficiency-target 0.40

# Scale fleet with auto-optimization
/fleet scale --fleet-id fleet-123 --target-size 2000 --strategy predictive

# Optimize resources for efficiency
/fleet optimize --fleet-id fleet-123 --efficiency-target 0.45 --cost-optimization

# Get comprehensive metrics
/fleet metrics --fleet-id fleet-123 --timeframe 24h --detailed

# Configure multi-region deployment
/fleet regions --fleet-id fleet-123 --regions us-east-1,eu-west-1,ap-southeast-1 --failover

# Monitor fleet health
/fleet health --fleet-id fleet-123 --deep-check
```

### Event Bus Commands

### `/eventbus`

**Purpose**: High-performance event bus management (10,000+ events/second)

**Usage**: `/eventbus <action> [options]`

**Actions**:
- `init`: Initialize event bus
- `publish`: Publish events with routing
- `subscribe`: Subscribe to event patterns
- `metrics`: Get performance metrics
- `monitor`: Real-time event monitoring

**Examples**:
```bash
# Initialize high-performance event bus
/eventbus init --throughput-target 10000 --latency-target 50 --worker-threads 4

# Publish event with advanced routing
/eventbus publish --type agent.lifecycle --data '{"agent": "coder-1", "status": "spawned"}' --strategy weighted

# Subscribe to event patterns
/eventbus subscribe --pattern "agent.*" --handler process-agent-events --batch-size 100

# Get event bus metrics
/eventbus metrics --timeframe 1h --detailed

# Monitor real-time events
/eventbus monitor --filter "agent.*" --format table
```

### Compliance Commands

### `/compliance`

**Purpose**: Multi-national regulatory compliance management

**Usage**: `/compliance <action> [options]`

**Actions**:
- `validate`: Validate compliance standards
- `audit`: Generate compliance reports
- `residency`: Configure data residency
- `monitor`: Monitor ongoing compliance
- `report`: Generate compliance documentation

**Examples**:
```bash
# Validate GDPR compliance
/compliance validate --standard GDPR --scope data-privacy,user-rights --detailed

# Generate comprehensive audit report
/compliance audit --period quarterly --format pdf --include-recommendations

# Configure data residency
/compliance residency --region eu-west-1 --standards GDPR,CCPA --encryption

# Monitor ongoing compliance
/compliance monitor --standards GDPR,CCPA,SOC2 --alert-threshold 0.95

# Generate compliance documentation
/compliance report --type certification --standards SOC2,ISO27001
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

#### `/memory-monitor`

**Purpose**: Intelligent memory monitoring with leak detection and process-specific thresholds

**Usage**: `/memory-monitor [options]`

**Options**:
- `--pid <number>`: Monitor specific process ID
- `--interval <ms>`: Monitoring interval (default: 2000ms)
- `--duration <ms>`: Maximum monitoring duration (default: 300000ms)
- `--log-file <path>`: Custom log file path
- `--disable-leak-detection`: Disable memory leak detection
- `--disable-growth-analysis`: Disable growth pattern analysis

**Examples**:
```bash
# Start unified memory monitoring
/memory-monitor

# Monitor specific process
/memory-monitor --pid 12345

# Custom monitoring settings
/memory-monitor --interval 5000 --duration 600000 --log-file ./custom-monitor.log
```

**Output**: Real-time memory usage reports, leak detection alerts, growth pattern analysis

#### `/memory-validate`

**Purpose**: Validate memory monitoring configuration synchronization across CFN projects

**Usage**: `/memory-validate`

**Output**: Configuration validation report, cross-project synchronization status

**Examples**:
```bash
# Validate memory monitoring setup
/memory-validate
```

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

#### `/launch-web-dashboard`

**Purpose**: Launch web portal development server with hot-reload

**Usage**: `/launch-web-dashboard [options]`

**Options**:
- `--port <port>`: Custom client port (default: 3001)
- `--production`: Build and run production mode
- `--debug`: Enable verbose logging
- `--kill-only`: Kill existing processes without starting

**Behavior**:
- Kills conflicting processes on ports 3000-3003
- Starts Vite client (port 3001) and Express server (port 3000)
- Auto-selects next available port on conflict
- Hot-reload enabled in development mode

**Examples**:
```bash
# Standard development mode
/launch-web-dashboard

# Custom port
/launch-web-dashboard --port 4000

# Production build
/launch-web-dashboard --production

# Cleanup only
/launch-web-dashboard --kill-only
```

**Access Points**:
- Main UI: `http://localhost:3001`
- API Server: `http://localhost:3000`
- WebSocket: `ws://localhost:3000`

**Features**: Agent monitoring, CFN Loop visualization, metrics dashboard, hybrid routing control, SQLite memory browser, Redis coordination monitor

## Transparency Commands

### Agent Transparency System

#### `/transparency`

**Purpose**: Launch Redis transparency dashboard for real-time agent monitoring

**Usage**: `/transparency [options]`

**Options**:
- `--port`: Dashboard port (default: 3001)
- `--level`: Transparency level (minimal|standard|detailed)
- `--agents`: Comma-separated list of agent IDs to monitor
- `--redis`: Redis connection string (default: redis://localhost:6379)

**Examples**:
```bash
# Launch dashboard with standard transparency
/transparency --level=standard

# Monitor specific agents
/transparency --agents=coder-1,security-1 --port=3002
```

**Output**: Launches web dashboard at http://localhost:3001

#### `/agent-observe`

**Purpose**: Query agent state and activity via command line

**Usage**: `/agent-observe <agentId> [query]`

**Queries**:
- `state`: Current agent state and transitions
- `activity`: Recent activity and tool usage
- `progress`: Progress metrics and predictions
- `performance`: Performance analytics

**Examples**:
```bash
# Check agent state
/agent-observe coder-1 state

# Get progress information
/agent-observe coder-1 progress

# Monitor activity
/agent-observe security-1 activity
```

**Output**: JSON-formatted agent data

#### `/agent-intervene`

**Purpose**: Intervene in agent execution (pause, resume, redirect)

**Usage**: `/agent-intervene <agentId> <action> [options]`

**Actions**:
- `pause`: Pause agent execution
- `resume`: Resume paused agent
- `redirect`: Redirect to new task
- `terminate`: Stop agent execution

**Options**:
- `--reason`: Intervention reason
- `--task`: New task for redirect action
- `--force`: Force intervention without confirmation

**Examples**:
```bash
# Pause agent for review
/agent-intervene coder-1 pause --reason="Code review required"

# Resume agent
/agent-intervene coder-1 resume

# Redirect to new task
/agent-intervene security-1 redirect --task="Review security patches"
```

**Output**: Confirmation of intervention action

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

### WASM Performance Optimization

#### `/wasm`

**Purpose**: WebAssembly 40x performance optimization and management

**Usage**: `/wasm <action> [options]`

**Actions**:
- `initialize`: Initialize WASM runtime
- `optimize`: Optimize code with 40x boost
- `parse`: Parse AST with sub-millisecond performance
- `batch`: Batch process files
- `benchmark`: Run 40x performance benchmarks
- `status`: Show WASM performance status

**Examples**:
```bash
# Initialize WASM runtime with 40x performance
/wasm initialize --memory-size 1GB --enable-simd --target 40x

# Optimize code for maximum performance
/wasm optimize --code "./src/app.js" --enable-vectorization --unroll-loops

# Parse AST with sub-millisecond performance
/wasm parse --code "function test() { return 42; }" --include-tokens

# Batch process files with high throughput
/wasm batch --files "./src/**/*.js" --batch-size 10 --parallel

# Run comprehensive 40x performance benchmarks
/wasm benchmark --tests standard --verbose

# Check WASM performance status
/wasm status --detailed --format json
```

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

**Purpose**: Parse and validate epic configuration files with CFN Loop mode selection

**Usage**: `/parse-epic <file-path> [options]`

**Options**:
- `--cfn-mode`: CFN Loop mode (mvp, standard, enterprise, auto) - default: auto
- `--validate`: Validate epic configuration
- `--output`: Output format
- `--strict`: Strict validation mode

**Auto-Detection**: Infers mode from filename patterns:
- Files ending in `-mvp` → MVP mode
- Files ending in `-enterprise` → Enterprise mode
- Other files → Standard mode

**Examples**:
```bash
# Auto-detect mode from filename
/parse-epic ./epics/auth-mvp.json --cfn-mode=auto  # Detects MVP mode

# Explicit enterprise mode
/parse-epic ./epics/platform.json --cfn-mode=enterprise

# Parse with validation
/parse-epic ./epics/ecommerce-platform.md --validate --output json

# Strict validation with mode
/parse-epic ./epics/user-auth-enterprise.md --strict --cfn-mode=auto
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

### Context Management

#### `/context-reflect`

**Purpose**: Extract lessons from task execution, store in adaptive context

**Usage**: `/context-reflect [options]`

**Options**:
- `--task-id`: Task to analyze (default: last completed)
- `--agent-id`: Filter by agent
- `--auto-curate`: Auto-merge extracted lessons
- `--output`: Output format (json|markdown)

**Example**:
```bash
/context-reflect --task-id=task-123 --auto-curate
```

**Output**: Reflection with 3-7 extracted bullet lessons

#### `/context-curate`

**Purpose**: Merge reflection deltas into adaptive context with deduplication

**Usage**: `/context-curate [options]`

**Options**:
- `--reflection-id`: Reflection to process (default: all pending)
- `--auto-merge`: Skip human review (confidence ≥0.8)
- `--similarity-threshold`: Merge threshold (default: 0.85)
- `--maintenance`: Run periodic deduplication

**Example**:
```bash
/context-curate --reflection-id=ref-123 --auto-merge
```

**Output**: Merge actions (new/incremented/merged/archived bullets)

#### `/context-query`

**Purpose**: Search adaptive context bullets by category, tags, confidence

**Usage**: `/context-query [options]`

**Options**:
- `--category`: Filter by type (strategy|pattern|edge_case|domain_insight|anti_pattern|optimization)
- `--tags`: Comma-separated tags
- `--min-confidence`: Minimum score (default: 0.6)
- `--limit`: Max results (default: 20)
- `--output`: Format (json|markdown|claude-md)

**Example**:
```bash
/context-query --category=strategy --min-confidence=0.8
```

**Output**: Relevant bullets sorted by priority

#### `/context-inject`

**Purpose**: Inject adaptive context bullets into CLAUDE.md dynamically

**Usage**: `/context-inject [options]`

**Options**:
- `--target`: Target file (default: ./CLAUDE.md)
- `--phase`: Filter by CFN Loop phase
- `--agent-type`: Filter for specific agent type
- `--mode`: Injection mode (append|replace|merge)
- `--min-confidence`: Minimum score (default: 0.7)

**Example**:
```bash
/context-inject --phase=phase-0 --limit=15
```

**Output**: Injects bullets into CLAUDE.md adaptive context section

#### `/context-stats`

**Purpose**: View adaptive context statistics and health metrics

**Usage**: `/context-stats [options]`

**Options**:
- `--period`: Analysis period in days (default: 30)
- `--category`: Filter by category
- `--detail-level`: Summary|detailed|comprehensive
- `--format`: Output format (text|json|chart)

**Example**:
```bash
/context-stats --period=30 --detail-level=summary
```

**Output**: Health report with recommendations

## Related Documentation

- [API](./logs-api.md) - Complete API reference
- [Features](./logs-features.md) - Available logging features
- [Functions](./logs-functions.md) - Utility functions
- [Hooks](./logs-hooks.md) - System integration points
- [MCP](./logs-mcp.md) - Model Context Protocol