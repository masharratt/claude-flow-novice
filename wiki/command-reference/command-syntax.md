# Command Syntax Reference

> **Complete technical reference for all Claude Flow CLI commands**

## 📋 Syntax Conventions

### Standard Format
```bash
claude-flow <command> [subcommand] [arguments] [options]
```

### Option Formats
- **Short options**: `-h`, `-v`, `-d`
- **Long options**: `--help`, `--version`, `--detailed`
- **Value options**: `--format json`, `--timeout 30`
- **Boolean flags**: `--dry-run`, `--verbose`, `--force`

### Argument Types
- **Required**: `<argument>` - Must be provided
- **Optional**: `[argument]` - Can be omitted
- **Multiple**: `<arg1> <arg2> ...` - Multiple values accepted
- **Choice**: `<choice1|choice2>` - One of the specified values

---

## 🌱 Novice Tier Commands

### `claude-flow init`

```bash
claude-flow init [project-type] [options]
```

**Arguments:**
- `[project-type]` - Type of project to initialize
  - Valid values: `web`, `api`, `mobile`, `desktop`, `ml`
  - Natural language also accepted: `"react app"`, `"REST API"`

**Options:**
- `--template <name>` - Use specific project template
- `--interactive, -i` - Interactive setup wizard
- `--skip-git` - Skip Git repository initialization
- `--skip-deps` - Skip dependency installation
- `--dry-run` - Show what would be created without creating
- `--help, -h` - Show command help

**Examples:**
```bash
claude-flow init
claude-flow init web --interactive
claude-flow init "todo application" --template react
claude-flow init api --skip-git --dry-run
```

### `claude-flow build`

```bash
claude-flow build [feature-description] [options]
```

**Arguments:**
- `[feature-description]` - Natural language description of what to build
  - If omitted, interactive mode starts
  - Supports complex descriptions

**Options:**
- `--agent <type>` - Prefer specific agent type
  - Valid types: `researcher`, `coder`, `tester`, `reviewer`
- `--parallel` - Enable parallel agent execution
- `--dry-run` - Show execution plan without running
- `--interactive, -i` - Interactive feature planning
- `--fix` - Focus on fixing existing issues
- `--optimize` - Focus on optimization
- `--timeout <seconds>` - Maximum execution time (default: 1800)
- `--help, -h` - Show command help

**Examples:**
```bash
claude-flow build "add user authentication"
claude-flow build "create REST API" --agent coder
claude-flow build --interactive --parallel
claude-flow build "fix login bug" --fix --dry-run
```

### `claude-flow status`

```bash
claude-flow status [options]
```

**Arguments:**
- None

**Options:**
- `--detailed, -d` - Show comprehensive information
- `--watch, -w` - Monitor status in real-time (Ctrl+C to exit)
- `--format <type>` - Output format
  - Valid formats: `table`, `json`, `summary`, `yaml`
- `--filter <category>` - Filter by category
  - Valid filters: `project`, `agents`, `system`, `performance`
- `--refresh <seconds>` - Refresh interval for watch mode (default: 2)
- `--help, -h` - Show command help

**Examples:**
```bash
claude-flow status
claude-flow status --detailed --format json
claude-flow status --watch --refresh 5
claude-flow status --filter agents
```

### `claude-flow help`

```bash
claude-flow help [command] [options]
```

**Arguments:**
- `[command]` - Specific command to get help for
  - If omitted, shows general help

**Options:**
- `--interactive, -i` - Interactive help system
- `--examples` - Show practical examples
- `--new-features` - Show recently unlocked features
- `--search <term>` - Search help content
- `--format <type>` - Help output format
  - Valid formats: `text`, `markdown`, `html`
- `--help, -h` - Meta help (help about help)

**Examples:**
```bash
claude-flow help
claude-flow help build --examples
claude-flow help --interactive
claude-flow help --search "authentication"
```

### `claude-flow learn`

```bash
claude-flow learn [topic] [options]
```

**Arguments:**
- `[topic]` - Specific learning topic
  - Valid topics: `agents`, `testing`, `deployment`, `optimization`
  - If omitted, shows learning dashboard

**Options:**
- `--level <level>` - Learning level
  - Valid levels: `beginner`, `intermediate`, `advanced`
- `--interactive, -i` - Interactive learning modules
- `--progress` - Show detailed progress metrics
- `--exercises` - Show hands-on exercises
- `--challenges` - Show learning challenges
- `--help, -h` - Show command help

**Examples:**
```bash
claude-flow learn
claude-flow learn agents --level beginner
claude-flow learn --interactive --exercises
claude-flow learn testing --challenges
```

---

## ⚡ Intermediate Tier Commands

### `claude-flow agents`

```bash
claude-flow agents <action> [target] [options]
```

**Actions:**
- `list` - Show available and active agents
- `spawn <type>` - Create a specific agent
- `status [id]` - Check agent health and activity
- `metrics [id]` - View agent performance data
- `stop <id>` - Stop a specific agent
- `restart <id>` - Restart an agent
- `optimize` - Optimize agent allocation

**Agent Types:**
- Core: `researcher`, `coder`, `tester`, `reviewer`, `optimizer`
- Specialized: `architect`, `documenter`, `security`, `ui-designer`, `devops`
- Framework: `react-specialist`, `api-expert`, `database-expert`

**Options:**
- `--type <agent-type>` - Filter by agent type
- `--active` - Show only active agents
- `--detailed, -d` - Include detailed metrics
- `--watch, -w` - Monitor in real-time
- `--memory <mb>` - Set memory limit for new agents
- `--priority <level>` - Set agent priority (low, normal, high)
- `--help, -h` - Show command help

**Examples:**
```bash
claude-flow agents list --type coder
claude-flow agents spawn researcher --priority high
claude-flow agents status --detailed --watch
claude-flow agents metrics coder-a1b2c3
```

### `claude-flow test`

```bash
claude-flow test [test-type] [options]
```

**Test Types:**
- `unit` - Unit tests for individual functions
- `integration` - Integration tests for components
- `e2e` - End-to-end user workflow tests
- `performance` - Performance and load tests
- `security` - Security vulnerability tests
- `api` - API endpoint tests
- `visual` - Visual regression tests

**Options:**
- `--generate` - Generate new tests
- `--run` - Execute existing tests
- `--coverage` - Generate coverage report
- `--fix` - Automatically fix failing tests
- `--watch, -w` - Continuous testing mode
- `--parallel` - Run tests in parallel
- `--pattern <glob>` - Test file pattern
- `--timeout <seconds>` - Test timeout (default: 300)
- `--reporter <type>` - Test reporter
  - Valid reporters: `spec`, `json`, `junit`, `html`
- `--help, -h` - Show command help

**Examples:**
```bash
claude-flow test unit --generate --coverage
claude-flow test e2e --watch --parallel
claude-flow test security --reporter json
claude-flow test --pattern "**/*.test.js" --fix
```

### `claude-flow deploy`

```bash
claude-flow deploy [environment] [options]
```

**Environments:**
- `development` - Local development deployment
- `staging` - Staging environment for testing
- `production` - Production deployment
- `preview` - Preview deployment for reviews

**Options:**
- `--auto-setup` - Automatically configure CI/CD
- `--rollback [version]` - Rollback to previous or specific version
- `--dry-run` - Show deployment plan without executing
- `--monitor` - Enable monitoring after deployment
- `--zero-downtime` - Use blue-green deployment
- `--force` - Force deployment even with warnings
- `--config <file>` - Use specific deployment configuration
- `--env-file <file>` - Environment variables file
- `--timeout <seconds>` - Deployment timeout (default: 3600)
- `--help, -h` - Show command help

**Examples:**
```bash
claude-flow deploy production --auto-setup --monitor
claude-flow deploy staging --dry-run --config staging.yml
claude-flow deploy --rollback v1.2.2 --zero-downtime
claude-flow deploy preview --env-file .env.preview
```

### `claude-flow optimize`

```bash
claude-flow optimize [target] [options]
```

**Optimization Targets:**
- `code` - Code-level optimizations
- `bundle` - Bundle size optimization
- `database` - Database query optimization
- `images` - Image compression and optimization
- `api` - API response time optimization
- `memory` - Memory usage optimization
- `startup` - Application startup time

**Options:**
- `--analyze` - Analyze without making changes
- `--apply` - Apply suggested optimizations
- `--benchmark` - Run performance benchmarks
- `--report` - Generate optimization report
- `--aggressive` - Use aggressive optimization strategies
- `--safe-only` - Apply only safe optimizations
- `--threshold <percentage>` - Minimum improvement threshold
- `--help, -h` - Show command help

**Examples:**
```bash
claude-flow optimize bundle --analyze --report
claude-flow optimize database --apply --benchmark
claude-flow optimize --aggressive --threshold 20
claude-flow optimize memory --safe-only
```

### `claude-flow review`

```bash
claude-flow review [scope] [options]
```

**Review Scopes:**
- `all` - Complete codebase review
- `changes` - Review recent changes only
- `security` - Security-focused review
- `performance` - Performance analysis
- `style` - Code style and conventions
- `architecture` - System design review

**Options:**
- `--fix` - Automatically fix issues where possible
- `--report` - Generate detailed review report
- `--severity <level>` - Filter by issue severity
  - Valid levels: `low`, `medium`, `high`, `critical`
- `--interactive, -i` - Interactive review mode
- `--format <type>` - Report format
  - Valid formats: `text`, `json`, `html`, `pdf`
- `--exclude <patterns>` - Exclude file patterns
- `--since <date>` - Review changes since date
- `--help, -h` - Show command help

**Examples:**
```bash
claude-flow review security --severity high --report
claude-flow review changes --since "2024-01-01" --fix
claude-flow review --interactive --format html
claude-flow review all --exclude "test/**,docs/**"
```

---

## 🚀 Expert Tier Commands

### `claude-flow mcp`

```bash
claude-flow mcp <server> <tool> [options]
```

**MCP Servers:**
- `claude-flow` - Main Claude Flow MCP tools
- `ruv-swarm` - Enhanced swarm coordination
- `flow-nexus` - Cloud features (requires authentication)

**Common Tools:**
- `swarm_init`, `swarm_status`, `swarm_monitor`
- `agent_spawn`, `agent_list`, `agent_metrics`
- `task_orchestrate`, `task_status`, `task_results`
- `neural_train`, `neural_predict`, `neural_patterns`

**Options:**
- Tool-specific options vary by tool
- `--help, -h` - Show tool-specific help
- `--dry-run` - Show planned execution
- `--timeout <seconds>` - Tool execution timeout
- `--format <type>` - Output format

**Examples:**
```bash
claude-flow mcp claude-flow swarm_init --topology mesh
claude-flow mcp ruv-swarm neural_train --pattern optimization
claude-flow mcp flow-nexus sandbox_create --runtime nodejs
```

### `claude-flow workflow`

```bash
claude-flow workflow <action> [name] [options]
```

**Actions:**
- `create <name>` - Create new workflow
- `execute <name>` - Execute existing workflow
- `list` - List available workflows
- `delete <name>` - Delete workflow
- `export <name>` - Export workflow definition
- `import <file>` - Import workflow from file

**Options:**
- `--steps <json>` - Workflow steps definition
- `--triggers <list>` - Workflow triggers
- `--parallel` - Enable parallel execution
- `--timeout <seconds>` - Workflow timeout
- `--dry-run` - Show execution plan
- `--help, -h` - Show command help

**Examples:**
```bash
claude-flow workflow create "full-stack-feature" --steps steps.json
claude-flow workflow execute "security-audit" --dry-run
claude-flow workflow list --format table
claude-flow workflow export "my-workflow" --format yaml
```

### `claude-flow enterprise`

```bash
claude-flow enterprise <action> [options]
```

**Actions:**
- `setup` - Initialize enterprise features
- `team-create` - Create development team
- `role-assign` - Assign user roles
- `audit-log` - View audit trail
- `compliance-report` - Generate compliance report
- `security-policy` - Manage security policies

**Options:**
- `--name <name>` - Team or resource name
- `--members <list>` - Team member list
- `--permissions <list>` - Permission assignments
- `--standard <type>` - Compliance standard
- `--timeframe <period>` - Reporting period
- `--help, -h` - Show command help

**Examples:**
```bash
claude-flow enterprise setup --compliance SOC2
claude-flow enterprise team-create --name "frontend-team"
claude-flow enterprise audit-log --timeframe 30d
```

---

## 🔧 Global Options

### Available for All Commands

**Common Options:**
- `--help, -h` - Show command help
- `--version, -v` - Show version information
- `--verbose` - Enable verbose output
- `--quiet, -q` - Suppress non-essential output
- `--dry-run` - Show what would happen without executing
- `--config <file>` - Use specific configuration file
- `--no-color` - Disable colored output
- `--json` - Output in JSON format where supported

**Configuration Options:**
- `--profile <name>` - Use specific user profile
- `--workspace <path>` - Set workspace directory
- `--log-level <level>` - Set logging level
  - Valid levels: `error`, `warn`, `info`, `debug`, `trace`

**Performance Options:**
- `--timeout <seconds>` - Command timeout
- `--parallel-limit <number>` - Maximum parallel operations
- `--memory-limit <mb>` - Memory usage limit

---

## 🔍 Pattern Matching & Filtering

### File Patterns
```bash
# Glob patterns
--pattern "src/**/*.js"
--exclude "test/**,docs/**"
--include "*.ts,*.tsx"

# Regex patterns
--regex "\.test\.(js|ts)$"
--exclude-regex "node_modules|dist"
```

### Time Patterns
```bash
# Relative time
--since "2 hours ago"
--since "last week"
--since "yesterday"

# Absolute time
--since "2024-01-01"
--since "2024-01-01T10:00:00Z"

# Duration
--timeout 30s
--timeout 5m
--timeout 2h
```

### Size Patterns
```bash
# Memory limits
--memory-limit 512mb
--memory-limit 2gb

# File sizes
--max-size 10mb
--min-size 1kb
```

---

## 🎯 Advanced Syntax Features

### Command Chaining
```bash
# Sequential execution
claude-flow status && claude-flow build "feature" && claude-flow test

# Conditional execution
claude-flow test || claude-flow review --fix

# Piping output
claude-flow status --format json | jq '.agents'
```

### Environment Variables
```bash
# Configuration via environment
export CLAUDE_FLOW_LOG_LEVEL=debug
export CLAUDE_FLOW_PARALLEL_LIMIT=10
export CLAUDE_FLOW_DEFAULT_TIMEOUT=3600

claude-flow build "feature"  # Uses environment settings
```

### Configuration Files
```bash
# YAML configuration
claude-flow --config .claude-flow.yml build "feature"

# JSON configuration
claude-flow --config claude-flow.json deploy production
```

### Batch Operations
```bash
# Multiple targets
claude-flow test unit integration e2e

# Multiple environments
claude-flow deploy staging production --parallel

# Multiple repositories
claude-flow mcp claude-flow github_sync_coord --repos "repo1,repo2,repo3"
```

---

## 🔒 Security & Authentication

### Authentication Patterns
```bash
# API key authentication
export CLAUDE_FLOW_API_KEY=your_api_key

# Token-based authentication
claude-flow auth login --token your_token

# Interactive authentication
claude-flow auth login --interactive
```

### Secure Options
```bash
# Credential management
--credentials-file ~/.claude-flow/credentials
--no-save-credentials
--expire-after 24h

# Secure transmission
--tls-verify
--ca-cert /path/to/ca.pem
--client-cert /path/to/client.pem
```

---

## 📊 Output Formats

### Supported Formats
```bash
# Text formats
--format text      # Human-readable text (default)
--format table     # Tabular output
--format yaml      # YAML format
--format json      # JSON format
--format xml       # XML format

# Report formats
--format html      # HTML report
--format pdf       # PDF document
--format csv       # CSV data
--format markdown  # Markdown format
```

### Output Customization
```bash
# Filtering output
--fields "name,status,uptime"
--exclude-fields "internal_id"

# Sorting
--sort-by "name"
--sort-order "desc"

# Pagination
--limit 50
--offset 100
--page 3
```

---

## ⚠️ Error Handling

### Error Exit Codes
- `0` - Success
- `1` - General error
- `2` - Command syntax error
- `3` - Authentication error
- `4` - Permission denied
- `5` - Resource not found
- `6` - Timeout error
- `7` - Network error
- `8` - Configuration error

### Error Output
```bash
# Detailed error information
--verbose          # Show detailed error traces
--debug           # Enable debug mode
--error-format json  # Machine-readable errors

# Error handling
--continue-on-error  # Don't stop on first error
--retry-count 3     # Retry failed operations
--retry-delay 5s    # Delay between retries
```

---

## 🎨 Output Customization

### Color & Styling
```bash
# Color control
--color always     # Force color output
--color never      # Disable color output
--color auto       # Auto-detect color support (default)

# Progress indicators
--progress         # Show progress bars
--no-progress      # Hide progress indicators
--spinner-style dots  # Spinner animation style
```

### Verbosity Levels
```bash
--quiet, -q        # Minimal output
                   # Normal output (default)
--verbose, -v      # Detailed output
--debug           # Debug information
--trace           # Maximum verbosity
```

---

This syntax reference covers all available commands, options, and patterns. Use `claude-flow help <command>` for command-specific syntax details and examples.