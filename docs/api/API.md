# API Reference 📚

**Complete Guide to Claude Flow Novice Commands and Options**

This reference covers all available commands, options, and configurations for Claude Flow Novice. Perfect for beginners who want to understand what each command does.

---

## 🚀 Core Commands

### `claude-flow-novice`
The main command for interacting with Claude Flow Novice.

#### Syntax
```bash
claude-flow-novice [command] [options] [arguments]
```

#### Global Options
| Option | Description | Example |
|--------|-------------|---------|
| `--help` | Show help information | `claude-flow-novice --help` |
| `--version` | Show version number | `claude-flow-novice --version` |
| `--verbose` | Show detailed output | `claude-flow-novice --verbose` |
| `--quiet` | Minimal output | `claude-flow-novice --quiet` |
| `--config <path>` | Use custom config file | `claude-flow-novice --config ./custom.json` |

---

## 📁 Project Management Commands

### `init`
Create a new project with the proper structure.

#### Syntax
```bash
claude-flow-novice init <project-name> [options]
```

#### Options
| Option | Description | Default |
|--------|-------------|---------|
| `--template <name>` | Use a specific template | `default` |
| `--features <list>` | Include specific features | `all` |
| `--force` | Overwrite existing directory | `false` |
| `--no-install` | Skip npm install | `false` |

#### Templates Available
- `default` - Basic project structure
- `web-app` - Web application template
- `api-only` - API backend only
- `mobile-app` - Mobile application
- `desktop-app` - Desktop application

#### Examples
```bash
# Create basic project
claude-flow-novice init my-project

# Create web app with specific features
claude-flow-novice init my-app --template web-app --features auth,api,dashboard

# Force overwrite existing project
claude-flow-novice init my-project --force

# Create project without installing dependencies
claude-flow-novice init quick-start --no-install
```

### `start`
Start the development server.

#### Syntax
```bash
claude-flow-novice start [options]
```

#### Options
| Option | Description | Default |
|--------|-------------|---------|
| `--port <number>` | Specify port number | `3000` |
| `--host <address>` | Specify host address | `localhost` |
| `--dashboard` | Include monitoring dashboard | `false` |
| `--performance` | Enable performance mode | `false` |
| `--watch` | Watch for file changes | `true` |

#### Examples
```bash
# Start development server
claude-flow-novice start

# Start on different port
claude-flow-novice start --port 8080

# Start with monitoring dashboard
claude-flow-novice start --dashboard

# Start in performance mode
claude-flow-novice start --performance
```

### `build`
Build the project for production.

#### Syntax
```bash
claude-flow-novice build [options]
```

#### Options
| Option | Description | Default |
|--------|-------------|---------|
| `--output <dir>` | Output directory | `dist` |
| `--minify` | Minify code | `true` |
| `--analyze` | Analyze bundle size | `false` |
| `--target <env>` | Target environment | `production` |

#### Examples
```bash
# Standard build
claude-flow-novice build

# Build with analysis
claude-flow-novice build --analyze

# Build to custom directory
claude-flow-novice build --output build
```

### `status`
Check project and system status.

#### Syntax
```bash
claude-flow-novice status [options]
```

#### Options
| Option | Description | Default |
|--------|-------------|---------|
| `--detailed` | Show detailed information | `false` |
| `--json` | Output in JSON format | `false` |
| `--swarm-only` | Show swarm status only | `false` |

#### Examples
```bash
# Basic status
claude-flow-novice status

# Detailed status
claude-flow-novice status --detailed

# JSON output
claude-flow-novice status --json
```

---

## 🤖 Agent Swarm Commands

### `swarm`
Launch AI agents to work on a task.

#### Syntax
```bash
claude-flow-novice swarm <objective> [options]
```

#### Options
| Option | Description | Default |
|--------|-------------|---------|
| `--agents <list>` | Specify agent types | `auto` |
| `--max-agents <number>` | Maximum number of agents | `5` |
| `--strategy <type>` | Coordination strategy | `development` |
| `--mode <type>` | Swarm mode | `mesh` |
| `--timeout <minutes>` | Maximum execution time | `60` |
| `--save` | Save swarm configuration | `false` |

#### Agent Types
- `backend-dev` - Backend development specialist
- `frontend-dev` - Frontend development specialist
- `fullstack-dev` - Full-stack developer
- `tester` - Quality assurance specialist
- `security-specialist` - Security expert
- `api-docs` - API documentation expert
- `researcher` - Research and analysis specialist
- `designer` - UI/UX designer
- `devops-engineer` - DevOps and deployment specialist

#### Strategies
- `development` - Standard development workflow
- `research` - Research and analysis focused
- `testing` - Testing and validation focused
- `optimization` - Performance optimization
- `refactoring` - Code refactoring and cleanup

#### Modes
- `mesh` - All agents coordinate equally
- `hierarchical` - Coordinator with specialized teams
- `sequential` - Agents work in sequence
- `parallel` - Agents work independently

#### Examples
```bash
# Simple swarm
claude-flow-novice swarm "Create a todo app with authentication"

# Specify agent types
claude-flow-novice swarm "Build REST API" --agents backend-dev,api-docs,tester

# Full-stack with custom strategy
claude-flow-novice swarm "Build e-commerce site" --strategy development --mode hierarchical

# Research swarm
claude-flow-novice swarm "Analyze market trends" --strategy research --agents researcher

# Testing swarm
claude-flow-novice swarm "Test user authentication" --strategy testing --agents tester,security-specialist
```

### `/fullstack`
Launch a complete full-stack development swarm.

#### Syntax
```bash
/fullstack <feature-description> [options]
```

#### Options
| Option | Description | Default |
|--------|-------------|---------|
| `--framework <name>` | Specify framework | `auto` |
| `--database <type>` | Database type | `auto` |
| `--auth <type>` | Authentication type | `jwt` |
| `--ui <library>` | UI library | `auto` |

#### Examples
```bash
# Full-stack web app
/fullstack "Build a blog with user accounts and comments"

# Specify technology stack
/fullstack "Create API dashboard" --framework react --database postgres --auth oauth

# E-commerce application
/fullstack "Build online store with products and checkout" --ui material-ui
```

### `research`
Launch research-focused agents.

#### Syntax
```bash
claude-flow-novice research <topic> [options]
```

#### Options
| Option | Description | Default |
|--------|-------------|---------|
| `--depth <level>` | Research depth | `standard` |
| `--sources <number>` | Number of sources | `10` |
| `--format <type>` | Output format | `markdown` |

#### Examples
```bash
# Basic research
claude-flow-novice research "Best JavaScript frameworks for 2024"

# Deep research with custom format
claude-flow-novice research "Cloud computing trends" --depth comprehensive --format pdf
```

---

## 📊 Monitoring Commands

### `monitor`
Open the real-time monitoring dashboard.

#### Syntax
```bash
claude-flow-novice monitor [options]
```

#### Options
| Option | Description | Default |
|--------|-------------|---------|
| `--port <number>` | Dashboard port | `3001` |
| `--refresh <seconds>` | Refresh interval | `2` |
| `--detailed` | Show detailed metrics | `false` |
| `--no-browser` | Don't open browser automatically | `false` |

#### Examples
```bash
# Open monitoring dashboard
claude-flow-novice monitor

# Custom port and refresh rate
claude-flow-novice monitor --port 4000 --refresh 5

# Detailed monitoring
claude-flow-novice monitor --detailed
```

### `metrics`
View performance and system metrics.

#### Syntax
```bash
claude-flow-novice metrics [options]
```

#### Options
| Option | Description | Default |
|--------|-------------|---------|
| `--type <category>` | Metrics type | `all` |
| `--format <type>` | Output format | `table` |
| `--export <file>` | Export to file | `none` |
| `--real-time` | Show real-time metrics | `false` |

#### Metric Types
- `all` - All available metrics
- `performance` - Performance metrics
- `agents` - Agent-related metrics
- `system` - System resource metrics
- `swarm` - Swarm coordination metrics

#### Examples
```bash
# Show all metrics
claude-flow-novice metrics

# Performance metrics only
claude-flow-novice metrics --type performance

# Export metrics to JSON
claude-flow-novice metrics --format json --export metrics.json

# Real-time metrics
claude-flow-novice metrics --real-time
```

### `logs`
View application and agent logs.

#### Syntax
```bash
claude-flow-novice logs [options] [component]`
```

#### Options
| Option | Description | Default |
|--------|-------------|---------|
| `--level <type>` | Log level | `info` |
| `--follow` | Follow log output | `false` |
| `--tail <number>` | Show last N lines | `50` |
| `--since <time>` | Show logs since time | `all` |

#### Log Levels
- `error` - Error messages only
- `warn` - Warnings and errors
- `info` - General information
- `debug` - Debug information
- `trace` - Detailed tracing

#### Examples
```bash
# Show recent logs
claude-flow-novice logs

# Follow logs in real-time
claude-flow-novice logs --follow

# Show error logs only
claude-flow-novice logs --level error

# Show last 100 lines
claude-flow-novice logs --tail 100

# Logs for specific component
claude-flow-novice logs backend-dev
```

---

## ⚙️ Configuration Commands

### `config`
Manage project configuration.

#### Syntax
```bash
claude-flow-novice config <action> [options]
```

#### Actions

##### `show` - Display current configuration
```bash
claude-flow-novice config show [options]
```

**Options:**
- `--format <type>` - Output format (`json`, `yaml`, `table`)
- `--section <name>` - Show specific section only

**Examples:**
```bash
# Show all configuration
claude-flow-novice config show

# Show as JSON
claude-flow-novice config show --format json

# Show agents section only
claude-flow-novice config show --section agents
```

##### `set` - Set configuration value
```bash
claude-flow-novice config set <key> <value>
```

**Examples:**
```bash
# Set maximum agents
claude-flow-novice config set maxAgents 10

# Set Redis host
claude-flow-novice config set redis.host localhost

# Set default strategy
claude-flow-novice config set defaultStrategy development
```

##### `get` - Get configuration value
```bash
claude-flow-novice config get <key>
```

**Examples:**
```bash
# Get max agents setting
claude-flow-novice config get maxAgents

# Get Redis configuration
claude-flow-novice config get redis
```

##### `reset` - Reset configuration to defaults
```bash
claude-flow-novice config reset [section]
```

**Examples:**
```bash
# Reset all configuration
claude-flow-novice config reset

# Reset agents section
claude-flow-novice config reset agents
```

##### `save` - Save configuration as template
```bash
claude-flow-novice config save --name <template-name>
```

**Examples:**
```bash
# Save current config as template
claude-flow-novice config save --name my-template

# Save with description
claude-flow-novice config save --name blog-template --description "Blog setup with auth"
```

##### `load` - Load configuration from template
```bash
claude-flow-novice config load --name <template-name>
```

**Examples:**
```bash
# Load saved template
claude-flow-novice config load --name my-template
```

### `agents`
Manage agent configurations and status.

#### Syntax
```bash
claude-flow-novice agents <action> [options]
```

#### Actions

##### `list` - List available agents
```bash
claude-flow-novice agents list [options]
```

**Options:**
- `--type <category>` - Filter by agent type
- `--enabled-only` - Show enabled agents only

**Examples:**
```bash
# List all agents
claude-flow-novice agents list

# List backend agents
claude-flow-novice agents list --type backend

# List enabled agents only
claude-flow-novice agents list --enabled-only
```

##### `status` - Show agent status
```bash
claude-flow-novice agents status [agent-name]
```

**Examples:**
```bash
# Status of all agents
claude-flow-novice agents status

# Status of specific agent
claude-flow-novice agents status backend-dev
```

##### `enable` / `disable` - Enable/disable agents
```bash
claude-flow-novice agents enable <agent-name>
claude-flow-novice agents disable <agent-name>
```

**Examples:**
```bash
# Enable security specialist
claude-flow-novice agents enable security-specialist

# Disable researcher
claude-flow-novice agents disable researcher
```

---

## 🔧 Utility Commands

### `test`
Run tests for the project.

#### Syntax
```bash
claude-flow-novice test [options] [test-pattern]
```

#### Options
| Option | Description | Default |
|--------|-------------|---------|
| `--type <category>` | Test type | `all` |
| `--coverage` | Generate coverage report | `false` |
| `--watch` | Watch mode | `false` |
| `--verbose` | Detailed test output | `false` |

#### Test Types
- `unit` - Unit tests only
- `integration` - Integration tests only
- `e2e` - End-to-end tests only
- `performance` - Performance tests only
- `all` - All tests

#### Examples
```bash
# Run all tests
claude-flow-novice test

# Run unit tests only
claude-flow-novice test --type unit

# Run tests with coverage
claude-flow-novice test --coverage

# Watch mode
claude-flow-novice test --watch

# Run specific test pattern
claude-flow-novice test "*auth*"
```

### `clean`
Clean build artifacts and temporary files.

#### Syntax
```bash
claude-flow-novice clean [options]
```

#### Options
| Option | Description | Default |
|--------|-------------|---------|
| `--all` | Clean all files | `false` |
| `--cache` | Clean cache only | `false` |
| `--logs` | Clean logs only | `false` |
| `--build` | Clean build files only | `false` |

#### Examples
```bash
# Clean build files
claude-flow-novice clean

# Clean everything
claude-flow-novice clean --all

# Clean cache only
claude-flow-novice clean --cache
```

### `doctor`
Check system health and configuration.

#### Syntax
```bash
claude-flow-novice doctor [options]
```

#### Options
| Option | Description | Default |
|--------|-------------|---------|
| `--fix` | Attempt to fix issues | `false` |
| `--detailed` | Detailed health check | `false` |

#### Examples
```bash
# Basic health check
claude-flow-novice doctor

# Detailed check with auto-fix
claude-flow-novice doctor --detailed --fix
```

---

## 🔌 Plugin and Extension Commands

### `plugins`
Manage plugins and extensions.

#### Syntax
```bash
claude-flow-novice plugins <action> [options]
```

#### Actions

##### `list` - List installed plugins
```bash
claude-flow-novice plugins list
```

##### `install` - Install a plugin
```bash
claude-flow-novice plugins install <plugin-name>
```

##### `uninstall` - Uninstall a plugin
```bash
claude-flow-novice plugins uninstall <plugin-name>
```

##### `enable` / `disable` - Enable/disable plugins
```bash
claude-flow-novice plugins enable <plugin-name>
claude-flow-novice plugins disable <plugin-name>
```

---

## 🚀 Advanced Commands

### `fleet` - Enterprise fleet management (Advanced)
Manage large-scale agent fleets for enterprise deployments.

#### Syntax
```bash
claude-flow-novice fleet <action> [options]
```

#### Actions
- `init` - Initialize fleet
- `scale` - Scale fleet size
- `status` - Fleet status
- `optimize` - Optimize fleet performance

**Examples:**
```bash
# Initialize enterprise fleet
claude-flow-novice fleet init --max-agents 100

# Scale fleet
claude-flow-novice fleet scale --target 200

# Check fleet status
claude-flow-novice fleet status
```

### `eventbus` - Event management (Advanced)
Manage high-performance event coordination.

#### Syntax
```bash
claude-flow-novice eventbus <action> [options]
```

#### Actions
- `init` - Initialize event bus
- `publish` - Publish events
- `subscribe` - Subscribe to events
- `monitor` - Monitor event flow

**Examples:**
```bash
# Initialize event bus
claude-flow-novice eventbus init --throughput 10000

# Monitor events
claude-flow-novice eventbus monitor
```

### `compliance` - Compliance management (Advanced)
Manage compliance and security requirements.

#### Syntax
```bash
claude-flow-novice compliance <action> [options]
```

#### Actions
- `validate` - Validate compliance
- `audit` - Generate audit reports
- `report` - Create compliance reports

**Examples:**
```bash
# Validate GDPR compliance
claude-flow-novice compliance validate --standard GDPR

# Generate audit report
claude-flow-novice compliance audit --format pdf
```

---

## 📝 Environment Variables

### Core Configuration
```bash
# Redis configuration
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=your-password
REDIS_DB=0

# Application settings
NODE_ENV=development
LOG_LEVEL=info
LOG_FORMAT=text

# Performance settings
MAX_AGENTS=10
SWARM_TIMEOUT=3600
MEMORY_LIMIT=2048
```

### API Keys (Optional)
```bash
# AI service keys (if using external services)
ANTHROPIC_API_KEY=your-key
OPENAI_API_KEY=your-key
GOOGLE_AI_API_KEY=your-key

# External services
STRIPE_API_KEY=your-key
TWILIO_API_KEY=your-key
SENDGRID_API_KEY=your-key
```

### Development Settings
```bash
# Development options
DEBUG=claude-flow:*
HOT_RELOAD=true
MONITOR_PORT=3001
```

---

## 🔧 Configuration Files

### claude-flow.config.json
Main project configuration file.

```json
{
  "name": "my-project",
  "version": "1.0.0",
  "claude-flow": {
    "maxAgents": 10,
    "defaultStrategy": "development",
    "defaultMode": "mesh",
    "timeout": 3600,
    "redis": {
      "host": "localhost",
      "port": 6379,
      "db": 0
    },
    "agents": {
      "backend-dev": {
        "enabled": true,
        "maxInstances": 3,
        "capabilities": ["api", "database", "authentication"]
      },
      "frontend-dev": {
        "enabled": true,
        "maxInstances": 2,
        "capabilities": ["react", "vue", "styling"]
      }
    },
    "monitoring": {
      "enabled": true,
      "port": 3001,
      "refreshInterval": 2000
    }
  }
}
```

### .env.local
Local environment variables (don't commit to Git).

```bash
# API Keys
ANTHROPIC_API_KEY=your-secret-key
REDIS_PASSWORD=your-redis-password

# Development Settings
DEBUG=true
LOG_LEVEL=debug
```

---

## 📊 Exit Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 0 | Success | Command completed successfully |
| 1 | General Error | General error occurred |
| 2 | Invalid Usage | Invalid command or arguments |
| 3 | Configuration Error | Configuration issue |
| 4 | Network Error | Network or connection issue |
| 5 | Permission Error | Insufficient permissions |
| 6 | Timeout | Operation timed out |
| 7 | Agent Error | Agent-related error |
| 8 | Swarm Error | Swarm coordination error |

---

## 🆘 Common Error Messages

### Configuration Errors
```
Error: Configuration file not found
Solution: Run 'claude-flow-novice init' or create claude-flow.config.json
```

### Redis Connection Errors
```
Error: Redis connection failed
Solution: Ensure Redis is running and accessible
```

### Agent Errors
```
Error: Failed to spawn agent 'backend-dev'
Solution: Check agent configuration and system resources
```

### Permission Errors
```
Error: Permission denied
Solution: Check file permissions or run with appropriate privileges
```

---

## 💡 Best Practices

### 1. Command Usage
- Use `--help` with any command to see options
- Start with simple commands and add options as needed
- Use verbose mode for debugging: `--verbose`

### 2. Configuration Management
- Save successful configurations as templates
- Use environment variables for sensitive data
- Keep configuration files in version control

### 3. Agent Coordination
- Start with smaller swarms (3-5 agents)
- Use appropriate strategies for different tasks
- Monitor agent performance regularly

### 4. Performance Optimization
- Use performance mode for large projects
- Monitor resource usage with metrics
- Clean up regularly with the clean command

---

<div align="center">

**Need more help?**

[← Examples](./EXAMPLES.md) • [Configuration →](./CONFIGURATION.md) • [Troubleshooting →](./TROUBLESHOOTING.md)

</div>