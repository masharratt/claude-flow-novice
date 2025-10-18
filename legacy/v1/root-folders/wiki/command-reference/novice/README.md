# Novice Commands Reference

Essential commands for beginners getting started with Claude Flow Novice. Master these fundamentals before progressing to multi-agent coordination.

## 🎯 Command Categories for Novices

### Project Setup Commands
Get your environment ready and projects initialized.

### Agent Basic Commands
Learn to spawn, monitor, and manage individual agents.

### SPARC Workflow Commands
Execute systematic development workflows.

### Configuration Commands
Set up and customize your development environment.

### Help and Documentation Commands
Access help, examples, and documentation.

---

## 📁 Project Setup Commands

### `init` - Initialize New Project
Create a new claude-flow-novice project with proper structure.

```bash
# Basic project initialization
npx claude-flow@alpha init

# Initialize with specific template
npx claude-flow@alpha init --template <template-name>

# Initialize with language preference
npx claude-flow@alpha init --language javascript
npx claude-flow@alpha init --language python
npx claude-flow@alpha init --language typescript
```

**Options:**
- `--template <name>` - Use specific project template
- `--language <lang>` - Set primary programming language
- `--features <list>` - Enable specific features
- `--agent-preferences <prefs>` - Set default agent preferences

**Examples:**
```bash
# JavaScript React project
npx claude-flow@alpha init --template react-app --language javascript

# Python ML project
npx claude-flow@alpha init --template ml-pipeline --language python

# TypeScript enterprise project
npx claude-flow@alpha init --template enterprise --language typescript
```

**Generated Structure:**
```
my-project/
├── .claude-flow/
│   ├── config.json
│   ├── agents/
│   └── logs/
├── src/
├── tests/
└── package.json
```

---

## 🎭 Agent Basic Commands

### `agents list` - Show Available Agents
Display all available agent types and their capabilities.

```bash
# List all available agents
npx claude-flow@alpha agents list

# List agents by category
npx claude-flow@alpha agents list --category development
npx claude-flow@alpha agents list --category quality
npx claude-flow@alpha agents list --category specialized

# List agents for specific language
npx claude-flow@alpha agents list --language javascript
npx claude-flow@alpha agents list --language python
```

**Output Example:**
```
Available Agents:
Development:
  coder           - General programming and implementation
  backend-dev     - Server-side development and APIs
  frontend-dev    - Client-side development and UI
  mobile-dev      - Mobile application development

Quality:
  reviewer        - Code review and quality assurance
  tester          - Test automation and coverage
  security-manager - Security analysis and hardening

Specialized:
  ml-developer    - Machine learning and data science
  api-docs        - API documentation generation
```

### `agents spawn` - Create New Agent
Spawn a new agent instance to work on specific tasks.

```bash
# Basic agent spawning
npx claude-flow@alpha agents spawn <agent-type> "<task-description>"

# Agent with specific configuration
npx claude-flow@alpha agents spawn <agent-type> \
  --config <config-file> \
  --timeout <seconds> \
  "<task-description>"
```

**Parameters:**
- `<agent-type>` - Type of agent (coder, reviewer, tester, etc.)
- `<task-description>` - Clear description of what the agent should do
- `--config <file>` - Custom configuration file
- `--timeout <seconds>` - Maximum execution time
- `--language <lang>` - Preferred programming language
- `--framework <name>` - Preferred framework/library

**Examples:**
```bash
# Spawn coder agent for implementation
npx claude-flow@alpha agents spawn coder "create a REST API with user authentication"

# Spawn reviewer for security analysis
npx claude-flow@alpha agents spawn reviewer \
  --focus security \
  "review authentication implementation for security vulnerabilities"

# Spawn tester with specific framework
npx claude-flow@alpha agents spawn tester \
  --framework jest \
  "create comprehensive unit tests for user service"

# Language-specific agent
npx claude-flow@alpha agents spawn backend-dev \
  --language python \
  --framework fastapi \
  "build FastAPI microservice with PostgreSQL"
```

### `agents status` - Monitor Agent Activity
Check the status and progress of active agents.

```bash
# Show all active agents
npx claude-flow@alpha agents status

# Show specific agent status
npx claude-flow@alpha agents status --agent <agent-id>

# Show detailed status with logs
npx claude-flow@alpha agents status --verbose

# Show status with performance metrics
npx claude-flow@alpha agents status --metrics
```

**Output Example:**
```
Active Agents:
┌──────────────┬─────────────┬────────────┬─────────────┬──────────────┐
│ Agent ID     │ Type        │ Status     │ Task        │ Progress     │
├──────────────┼─────────────┼────────────┼─────────────┼──────────────┤
│ coder-001    │ coder       │ Working    │ REST API    │ 65% (3/5)    │
│ reviewer-001 │ reviewer    │ Waiting    │ Code Review │ Queued       │
│ tester-001   │ tester      │ Completed  │ Unit Tests  │ 100% (15/15) │
└──────────────┴─────────────┴────────────┴─────────────┴──────────────┘
```

### `agents stop` - Terminate Agent
Stop a running agent gracefully or forcefully.

```bash
# Stop specific agent
npx claude-flow@alpha agents stop <agent-id>

# Stop all agents
npx claude-flow@alpha agents stop --all

# Force stop unresponsive agent
npx claude-flow@alpha agents stop <agent-id> --force

# Stop with cleanup
npx claude-flow@alpha agents stop <agent-id> --cleanup
```

### `agents logs` - View Agent Logs
Access detailed logs from agent execution.

```bash
# Show logs for specific agent
npx claude-flow@alpha agents logs <agent-id>

# Show recent logs
npx claude-flow@alpha agents logs <agent-id> --tail 50

# Follow logs in real-time
npx claude-flow@alpha agents logs <agent-id> --follow

# Filter logs by level
npx claude-flow@alpha agents logs <agent-id> --level error
```

---

## 🔄 SPARC Workflow Commands

### `sparc tdd` - Complete TDD Workflow
Execute the full SPARC Test-Driven Development cycle.

```bash
# Basic TDD workflow
npx claude-flow@alpha sparc tdd "<feature-description>"

# TDD with specific agent preferences
npx claude-flow@alpha sparc tdd \
  --agents coder,tester,reviewer \
  --coverage 90 \
  "<feature-description>"

# TDD with language and framework
npx claude-flow@alpha sparc tdd \
  --language typescript \
  --framework express \
  "user authentication system"
```

**Parameters:**
- `<feature-description>` - Clear description of feature to build
- `--agents <list>` - Preferred agents for workflow
- `--coverage <percent>` - Target test coverage percentage
- `--language <lang>` - Programming language preference
- `--framework <name>` - Framework preference
- `--timeout <minutes>` - Maximum workflow time

**SPARC Phases Executed:**
1. **Specification** - Requirements analysis
2. **Pseudocode** - Algorithm design
3. **Architecture** - System design
4. **Refinement** - TDD implementation
5. **Completion** - Integration testing

**Examples:**
```bash
# JavaScript API with testing
npx claude-flow@alpha sparc tdd \
  --language javascript \
  --framework express \
  --coverage 85 \
  "REST API for todo management"

# Python ML pipeline
npx claude-flow@alpha sparc tdd \
  --language python \
  --agents ml-developer,tester \
  "machine learning model for customer segmentation"
```

### `sparc run` - Execute Specific SPARC Phase
Run individual phases of the SPARC methodology.

```bash
# Run specific phase
npx claude-flow@alpha sparc run <phase> "<task-description>"

# Available phases:
npx claude-flow@alpha sparc run specification "<task>"
npx claude-flow@alpha sparc run pseudocode "<task>"
npx claude-flow@alpha sparc run architecture "<task>"
npx claude-flow@alpha sparc run refinement "<task>"
npx claude-flow@alpha sparc run completion "<task>"
```

**Phase Descriptions:**
- `specification` - Analyze requirements and define acceptance criteria
- `pseudocode` - Design algorithms and logic flow
- `architecture` - Create system design and component structure
- `refinement` - Implement with test-driven development
- `completion` - Integration testing and deployment prep

**Examples:**
```bash
# Just architecture design
npx claude-flow@alpha sparc run architecture \
  "microservices architecture for e-commerce platform"

# Only implementation phase
npx claude-flow@alpha sparc run refinement \
  "implement user authentication with JWT tokens"

# Requirements analysis only
npx claude-flow@alpha sparc run specification \
  "requirements for real-time chat application"
```

### `sparc status` - Monitor SPARC Progress
Check the progress of running SPARC workflows.

```bash
# Show current SPARC workflow status
npx claude-flow@alpha sparc status

# Show detailed progress with phase breakdown
npx claude-flow@alpha sparc status --detailed

# Show metrics and performance data
npx claude-flow@alpha sparc status --metrics
```

**Output Example:**
```
SPARC Workflow Status:
Task: "User authentication system"
Current Phase: Refinement (4/5)
Progress: 80% complete

Phase Breakdown:
✅ Specification  - Completed (5 min)
✅ Pseudocode     - Completed (3 min)
✅ Architecture   - Completed (8 min)
🔄 Refinement     - In Progress (65% complete)
⏳ Completion     - Pending

Estimated completion: 6 minutes remaining
```

---

## ⚙️ Configuration Commands

### `config init` - Initialize Configuration
Create initial configuration files for your project.

```bash
# Create default configuration
npx claude-flow@alpha config init

# Initialize with specific template
npx claude-flow@alpha config init --template <template-name>

# Interactive configuration setup
npx claude-flow@alpha config init --interactive
```

### `config show` - Display Current Configuration
View current configuration settings.

```bash
# Show all configuration
npx claude-flow@alpha config show

# Show specific section
npx claude-flow@alpha config show agents
npx claude-flow@alpha config show sparc
npx claude-flow@alpha config show project

# Show in different formats
npx claude-flow@alpha config show --format json
npx claude-flow@alpha config show --format yaml
```

### `config set` - Update Configuration Values
Modify configuration settings.

```bash
# Set individual values
npx claude-flow@alpha config set <key> <value>

# Set nested values
npx claude-flow@alpha config set agents.default coder
npx claude-flow@alpha config set sparc.coverage 90
npx claude-flow@alpha config set project.language javascript
```

**Common Configuration Keys:**
```bash
# Agent preferences
npx claude-flow@alpha config set agents.default coder
npx claude-flow@alpha config set agents.timeout 300

# SPARC settings
npx claude-flow@alpha config set sparc.mode tdd
npx claude-flow@alpha config set sparc.coverage 85

# Project settings
npx claude-flow@alpha config set project.language python
npx claude-flow@alpha config set project.framework fastapi
```

### `config reset` - Reset to Defaults
Reset configuration to default values.

```bash
# Reset all configuration
npx claude-flow@alpha config reset

# Reset specific section
npx claude-flow@alpha config reset agents
npx claude-flow@alpha config reset sparc

# Reset with confirmation
npx claude-flow@alpha config reset --confirm
```

---

## 📚 Help and Documentation Commands

### `--help` - Command Help
Get help for any command or the overall tool.

```bash
# General help
npx claude-flow@alpha --help

# Command-specific help
npx claude-flow@alpha agents --help
npx claude-flow@alpha sparc --help
npx claude-flow@alpha config --help

# Subcommand help
npx claude-flow@alpha agents spawn --help
npx claude-flow@alpha sparc tdd --help
```

### `--version` - Version Information
Display version and system information.

```bash
# Show version
npx claude-flow@alpha --version

# Show detailed version info
npx claude-flow@alpha --version --detailed
```

### `doctor` - System Diagnostics
Check system health and configuration.

```bash
# Basic health check
npx claude-flow@alpha doctor

# Comprehensive diagnostic
npx claude-flow@alpha doctor --comprehensive

# Check specific components
npx claude-flow@alpha doctor --check-agents
npx claude-flow@alpha doctor --check-config
npx claude-flow@alpha doctor --check-dependencies
```

**Output Example:**
```
Claude Flow Novice Diagnostic Report:
✅ Node.js version: 18.17.0 (supported)
✅ npm version: 9.6.7 (supported)
✅ Configuration: Valid
✅ Agent system: Operational
✅ Memory system: Healthy
⚠️  Network connectivity: Slow response (2.3s)
✅ Disk space: 45GB available

Overall Status: HEALTHY (1 warning)
```

### `examples` - Show Command Examples
Display examples for commands and workflows.

```bash
# Show examples for command
npx claude-flow@alpha examples agents spawn
npx claude-flow@alpha examples sparc tdd

# Show examples by category
npx claude-flow@alpha examples --category beginner
npx claude-flow@alpha examples --category javascript
npx claude-flow@alpha examples --category testing
```

---

## 🎮 Interactive Commands

### `interactive` - Interactive CLI
Launch interactive command-line interface.

```bash
# Start interactive mode
npx claude-flow@alpha interactive

# Interactive mode with specific focus
npx claude-flow@alpha interactive --mode beginner
npx claude-flow@alpha interactive --mode agent-management
```

**Interactive Features:**
- Guided command selection
- Parameter assistance
- Real-time help
- Command history
- Auto-completion

### `wizard` - Setup Wizards
Guided setup for various components.

```bash
# General setup wizard
npx claude-flow@alpha wizard

# Specific wizards
npx claude-flow@alpha wizard project-setup
npx claude-flow@alpha wizard agent-config
npx claude-flow@alpha wizard sparc-config
```

---

## 🔧 Utility Commands

### `logs` - View System Logs
Access system and workflow logs.

```bash
# Show recent logs
npx claude-flow@alpha logs

# Show logs with filtering
npx claude-flow@alpha logs --level error
npx claude-flow@alpha logs --component agents
npx claude-flow@alpha logs --since "1 hour ago"

# Export logs
npx claude-flow@alpha logs --export logs.txt
```

### `cache` - Cache Management
Manage system cache and temporary files.

```bash
# Show cache status
npx claude-flow@alpha cache status

# Clear cache
npx claude-flow@alpha cache clear

# Rebuild cache
npx claude-flow@alpha cache rebuild
```

---

## 📊 Basic Monitoring Commands

### `monitor` - Basic Monitoring
Monitor system activity and agent performance.

```bash
# Monitor current activity
npx claude-flow@alpha monitor

# Monitor specific agents
npx claude-flow@alpha monitor --agents coder-001,reviewer-001

# Monitor with specific interval
npx claude-flow@alpha monitor --interval 5s
```

### `metrics` - Basic Metrics
View basic performance and usage metrics.

```bash
# Show current metrics
npx claude-flow@alpha metrics

# Show metrics for specific time period
npx claude-flow@alpha metrics --since "1 hour ago"

# Export metrics
npx claude-flow@alpha metrics --export metrics.json
```

---

## 🚨 Common Troubleshooting

### Environment Issues
```bash
# Check environment
npx claude-flow@alpha doctor

# Fix common issues
npx claude-flow@alpha doctor --repair

# Reset environment
npx claude-flow@alpha config reset
npx claude-flow@alpha cache clear
```

### Agent Issues
```bash
# Check agent status
npx claude-flow@alpha agents status

# Restart unresponsive agents
npx claude-flow@alpha agents restart <agent-id>

# View agent logs for debugging
npx claude-flow@alpha agents logs <agent-id> --level error
```

### Configuration Issues
```bash
# Validate configuration
npx claude-flow@alpha config validate

# Reset to working defaults
npx claude-flow@alpha config reset

# Reconfigure interactively
npx claude-flow@alpha config init --interactive
```

---

## 🎯 Next Steps

### Ready for Intermediate?
Once you're comfortable with these novice commands:

1. **Master agent spawning** - Spawn different agent types confidently
2. **Complete SPARC workflows** - Successfully run full TDD cycles
3. **Configure environments** - Customize settings for your needs
4. **Troubleshoot issues** - Resolve common problems independently

**Then progress to:** [Intermediate Commands](../intermediate/README.md)

### Practice Suggestions
1. **Start simple**: Spawn a single coder agent for a small task
2. **Try SPARC**: Run a complete TDD workflow for a simple feature
3. **Experiment with configuration**: Customize agent preferences
4. **Practice troubleshooting**: Use `doctor` and `logs` commands

---

**Need help?** Use `npx claude-flow@alpha --help` or visit [Troubleshooting Guide](../../troubleshooting/README.md)