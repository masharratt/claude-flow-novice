# Claude Flow Novice - AI Agent Orchestration

## Core Orchestration Patterns

### Parallel Execution Protocol
ALL related operations MUST execute concurrently in single messages:
- **TodoWrite**: Batch 5-10+ todos in one call
- **File Operations**: Batch reads/writes/edits together
- **Agent Spawning**: Use Task tool for concurrent agent execution
- **Memory Operations**: Batch store/retrieve operations

### Agent Coordination Framework

#### Pre-Task Hooks (Setup & Validation)
```bash
# Validate safety and prepare resources
npx claude-flow-novice hooks pre-command --command "[command]" --validate-safety true --prepare-resources true

# Auto-assign agents and load context
npx claude-flow-novice hooks pre-edit --file "[file]" --auto-assign-agents true --load-context true
```

#### Post-Task Hooks (Validation & Quality)
```bash
# Track metrics and store results
npx claude-flow-novice hooks post-command --command "[command]" --track-metrics true --store-results true

# Comprehensive validation pipeline (runs automatically on file edits)
node config/hooks/post-edit-pipeline.js "[file]"

# Validates: formatting, linting, type checking, dependencies, security, tests
# Progressive validation: skips tests if dependencies missing (beginner-friendly)
```

**Post-Edit Pipeline Features:**
- **Multi-Language**: JS/TS, Python, Rust, Go, Java, C++, PHP, Ruby, C#
- **Formatting**: Prettier, Black, RustFmt, GoFmt (auto-formats code)
- **Linting**: ESLint, Flake8, Clippy, GoLint (finds code issues)
- **Type Checking**: TSC, MyPy, Cargo Check, Go Vet (catches type errors)
- **Dependency Analysis**: Checks imports/requires, suggests missing deps
- **Security Scanning**: NPM Audit, Bandit, Cargo Audit, GoSec
- **Test Execution**: NPM Test, PyTest, Cargo Test, Go Test (if deps satisfied)
- **Progressive Validation**: 4 tiers (syntax→interface→integration→full)
- **Smart Agent Spawning**: Auto-suggests agents for missing dependencies/tests

#### Session Management
```bash
# Generate summaries and persist state
npx claude-flow-novice hooks session-end --generate-summary true --persist-state true --export-metrics true
```
**Claude Code's Task tool is the PRIMARY way to spawn agents:**
```javascript
// ✅ CORRECT: Use Claude Code's Task tool for parallel agent execution
[Single Message]:
  Task("Research agent", "Analyze requirements and patterns...", "researcher")
  Task("Coder agent", "Implement core features...", "coder")
  Task("Tester agent", "Create comprehensive tests...", "tester")
  Task("Reviewer agent", "Review code quality...", "reviewer")
  Task("Architect agent", "Design system architecture...", "system-architect")
```

**MCP tools are ONLY for coordination setup:**
### MCP Integration
- **Coordination**: `mcp__claude-flow-novice__swarm_init`, `agent_spawn`, `task_orchestrate`
- **Monitoring**: `swarm_status`, `agent_metrics`, `task_results`
- **Memory**: `memory_usage`, `memory_search`

## File Organization
- `/src` - Source code
- `/tests` - Test files
- `/docs` - Documentation
- **Never save working files to root**

# Add MCP server
claude mcp add claude-flow-novice npx claude-flow-novice mcp start


## Essential Commands
- `npx claude-flow-novice status` - System health
- `npx claude-flow-novice --help` - Available commands
- `/swarm`, `/sparc`, `/hooks` - Slash commands (auto-discovered)