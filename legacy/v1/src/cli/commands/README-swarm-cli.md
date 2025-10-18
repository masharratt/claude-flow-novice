# CLI Swarm Execution Interface

Direct CLI interface for swarm execution without MCP dependency.

## Quick Start

```bash
# Execute a swarm
npx claude-flow-novice swarm-exec "Build a REST API with authentication"

# Check status
npx claude-flow-novice swarm-exec status

# Recover interrupted swarm
npx claude-flow-novice swarm-exec recover --list
```

## Features

- ✅ Direct CLI execution without MCP dependency
- ✅ Support for up to 50 concurrent agents
- ✅ Redis persistence for state management
- ✅ Multiple output formats (json, text, stream)
- ✅ Swarm recovery and status monitoring
- ✅ Comprehensive error handling and validation

## Commands

### Execute Swarm
```bash
npx claude-flow-novice swarm-exec execute <objective> [options]
```

### Recover Swarm
```bash
npx claude-flow-novice swarm-exec recover [swarmId] [options]
```

### Check Status
```bash
npx claude-flow-novice swarm-exec status [swarmId] [options]
```

## Main Options

- `-s, --strategy <type>` - Execution strategy (auto, development, research, testing, analysis, optimization, maintenance)
- `-m, --mode <type>` - Coordination mode (centralized, distributed, hierarchical, mesh, hybrid)
- `-a, --max-agents <number>` - Maximum agents (1-50)
- `-f, --output-format <format>` - Output format (json, text, stream)
- `--persist` - Enable Redis persistence
- `--verbose` - Enable verbose logging

## Examples

```bash
# Development task with JSON output
npx claude-flow-novice swarm-exec "Create user authentication system" \
  --strategy development \
  --max-agents 8 \
  --output-format json

# Research with monitoring
npx claude-flow-novice swarm-exec "Research AI trends" \
  --strategy research \
  --monitor \
  --verbose

# List and recover swarms
npx claude-flow-novice swarm-exec recover --list
npx claude-flow-novice swarm-exec recover swarm_1697844234_abc123def
```

## Documentation

See [swarm-cli-guide.md](docs/swarm-cli-guide.md) for comprehensive documentation.