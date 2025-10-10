# CLI Swarm Execution Interface Guide

## Overview

The CLI Swarm Execution Interface provides direct command-line access to swarm execution without requiring MCP dependencies. This interface supports up to 50 concurrent agents with Redis persistence for state management and recovery.

## Installation

```bash
# Install required dependencies
npm install commander redis

# Ensure the CLI tools are available
npx claude-flow-novice swarm-exec --help
```

## Quick Start

```bash
# Execute a simple swarm
npx claude-flow-novice swarm-exec "Build a REST API with authentication"

# Execute with custom configuration
npx claude-flow-novice swarm-exec "Research cloud architecture patterns" \
  --strategy research \
  --max-agents 8 \
  --mode mesh \
  --output-format json \
  --persist
```

## Commands

### swarm-exec execute (exec)

Execute a new swarm with the given objective.

```bash
npx claude-flow-novice swarm-exec execute <objective> [options]
```

**Arguments:**
- `<objective>` - The task or objective for the swarm to accomplish

**Options:**
- `-s, --strategy <type>` - Execution strategy (auto, development, research, testing, analysis, optimization, maintenance) [default: auto]
- `-m, --mode <type>` - Coordination mode (centralized, distributed, hierarchical, mesh, hybrid) [default: centralized]
- `-a, --max-agents <number>` - Maximum number of agents (1-50) [default: 5]
- `-t, --timeout <minutes>` - Swarm timeout in minutes [default: 60]
- `-f, --output-format <format>` - Output format (json, text, stream) [default: text]
- `-o, --output-file <path>` - Save output to file
- `--redis-host <host>` - Redis server host [default: localhost]
- `--redis-port <port>` - Redis server port [default: 6379]
- `--redis-password <password>` - Redis password
- `--persist` - Enable Redis persistence [default: true]
- `--monitor` - Enable real-time monitoring
- `--verbose` - Enable verbose logging

**Examples:**

```bash
# Basic execution
npx claude-flow-novice swarm-exec "Create a user authentication system"

# Development strategy with more agents
npx claude-flow-novice swarm-exec "Build microservices architecture" \
  --strategy development \
  --max-agents 12 \
  --mode hierarchical

# Research with JSON output
npx claude-flow-novice swarm-exec "Analyze AI trends in 2024" \
  --strategy research \
  --output-format json \
  --output-file research-results.json

# With Redis persistence and monitoring
npx claude-flow-novice swarm-exec "Optimize database queries" \
  --strategy optimization \
  --persist \
  --monitor \
  --verbose
```

### swarm-exec recover

Recover and resume a swarm from Redis persistence.

```bash
npx claude-flow-novice swarm-exec recover [swarmId] [options]
```

**Arguments:**
- `[swarmId]` - ID of the swarm to recover (optional if using --list)

**Options:**
- `--redis-host <host>` - Redis server host [default: localhost]
- `--redis-port <port>` - Redis server port [default: 6379]
- `--redis-password <password>` - Redis password
- `--list` - List all recoverable swarms

**Examples:**

```bash
# List all recoverable swarms
npx claude-flow-novice swarm-exec recover --list

# Recover a specific swarm
npx claude-flow-novice swarm-exec recover swarm_1697844234_abc123def

# Recover with custom Redis configuration
npx claude-flow-novice swarm-exec recover swarm_1697844234_abc123def \
  --redis-host redis.example.com \
  --redis-port 6380
```

### swarm-exec status

Check status of active or completed swarms.

```bash
npx claude-flow-novice swarm-exec status [swarmId] [options]
```

**Arguments:**
- `[swarmId]` - ID of the swarm to check (optional)

**Options:**
- `--redis-host <host>` - Redis server host [default: localhost]
- `--redis-port <port>` - Redis server port [default: 6379]
- `--redis-password <password>` - Redis password
- `--all` - Show all swarms (active and completed)
- `--format <format>` - Output format (text, json) [default: text]

**Examples:**

```bash
# Show status of all active swarms
npx claude-flow-novice swarm-exec status

# Show specific swarm status
npx claude-flow-novice swarm-exec status swarm_1697844234_abc123def

# Show all swarms in JSON format
npx claude-flow-novice swarm-exec status --all --format json

# Status with custom Redis config
npx claude-flow-novice swarm-exec status --redis-host localhost --redis-port 6379
```

## Strategies

### Auto (default)
Automatically determines the best approach based on the objective analysis.

**Use cases:**
- General purpose tasks
- When unsure of the optimal strategy
- Mixed requirements

### Development
Optimized for software development and coding tasks.

**Use cases:**
- Building applications
- Implementing features
- API development
- System architecture

**Typical agents:**
- System Architect
- Backend Developers
- Frontend Developers
- QA Engineers
- Code Reviewers

### Research
Optimized for information gathering and analysis.

**Use cases:**
- Market research
- Literature review
- Data analysis
- Competitive analysis

**Typical agents:**
- Lead Researcher
- Data Analysts
- Research Assistants
- Insights Compilers

### Testing
Optimized for quality assurance and testing workflows.

**Use cases:**
- Test suite creation
- Quality validation
- Performance testing
- Security auditing

**Typical agents:**
- Test Lead
- Unit Testers
- Integration Testers
- Performance Testers
- Security Auditors

### Analysis
Optimized for data examination and insights generation.

**Use cases:**
- Data analysis
- Performance review
- Pattern identification
- Business intelligence

**Typical agents:**
- Analysis Lead
- Data Engineers
- Statistical Experts
- Visualization Developers
- Business Analysts

### Optimization
Optimized for performance improvement and tuning.

**Use cases:**
- Performance optimization
- Code refactoring
- Resource tuning
- Efficiency improvements

**Typical agents:**
- Optimization Lead
- Performance Profilers
- Algorithm Experts
- Database Optimizers
- Systems Tuners

### Maintenance
Optimized for system upkeep and updates.

**Use cases:**
- System maintenance
- Bug fixes
- Updates and patches
- Documentation updates

**Typical agents:**
- Maintenance Lead
- System Auditors
- Patch Developers
- Regression Testers
- Documentation Updaters

## Coordination Modes

### Centralized (default)
Single coordinator manages all agents and decisions.

**Characteristics:**
- Clear chain of command
- Consistent decision making
- Simple communication flow
- Easy progress tracking

**Best for:**
- Small to medium projects
- Well-defined objectives
- Clear task dependencies

### Distributed
Multiple coordinators share responsibility by domain.

**Characteristics:**
- Fault tolerance
- Parallel decision making
- Domain expertise
- Scalability

**Best for:**
- Large projects
- Multiple workstreams
- Complex systems
- High availability needs

### Hierarchical
Tree structure with team leads and management layers.

**Characteristics:**
- Clear reporting structure
- Efficient for large teams
- Natural work breakdown
- Manageable span of control

**Best for:**
- Enterprise projects
- Multi-team efforts
- Complex hierarchies
- Phased deliveries

### Mesh
Peer-to-peer coordination without central authority.

**Characteristics:**
- Maximum flexibility
- Fast local decisions
- Resilient to failures
- Creative solutions

**Best for:**
- Research projects
- Exploratory work
- Innovation tasks
- Small expert teams

### Hybrid
Combines different coordination patterns as needed.

**Characteristics:**
- Adaptability
- Best of all modes
- Task-appropriate structure
- Evolution over time

**Best for:**
- Complex projects
- Uncertain requirements
- Long-term efforts
- Diverse objectives

## Output Formats

### Text (default)
Human-readable formatted text output.

**Features:**
- Easy to read
- Progress indicators
- Detailed status messages
- Error descriptions

**Example:**
```
🚀 Swarm Started
  🆔 ID: swarm_1697844234_abc123def
  📋 Objective: Build a REST API
  🎯 Strategy: development
  🏗️  Mode: centralized
  🤖 Max Agents: 5

✅ Swarm Completed
  🆔 ID: swarm_1697844234_abc123def
  🤖 Agents: 5
  📋 Tasks: 12/12
  ⏱️  Duration: 45s
```

### JSON
Machine-readable JSON output.

**Features:**
- Structured data
- Easy parsing
- Complete metadata
- Integration-friendly

**Example:**
```json
{
  "timestamp": "2024-10-08T20:30:45.123Z",
  "type": "swarm_completed",
  "swarmId": "swarm_1697844234_abc123def",
  "objective": "Build a REST API",
  "success": true,
  "summary": {
    "agents": 5,
    "tasks": {
      "completed": 12,
      "total": 12
    },
    "runtime": 45
  },
  "config": {
    "strategy": "development",
    "mode": "centralized",
    "maxAgents": 5,
    "timeout": 60
  }
}
```

### Stream
Real-time streaming JSON output for monitoring.

**Features:**
- Real-time updates
- Event-driven format
- Monitoring integration
- Live progress tracking

**Example:**
```json
{"type":"swarm_update","timestamp":"2024-10-08T20:30:45.123Z","data":{"type":"agent_spawned","agentId":"agent_123","type":"developer","name":"Backend Dev"}}
{"type":"swarm_update","timestamp":"2024-10-08T20:30:46.234Z","data":{"type":"task_started","taskId":"task_456","description":"Create API endpoints","assignedTo":"Backend Dev"}}
{"type":"swarm_update","timestamp":"2024-10-08T20:31:15.567Z","data":{"type":"task_completed","taskId":"task_456","description":"Create API endpoints","duration":29333,"success":true}}
```

## Redis Persistence

### Configuration

The CLI swarm interface uses Redis for state persistence and recovery. Configure Redis connection using:

```bash
# Default configuration (localhost:6379)
npx claude-flow-novice swarm-exec "My task" --persist

# Custom Redis server
npx claude-flow-novice swarm-exec "My task" \
  --redis-host redis.example.com \
  --redis-port 6380 \
  --redis-password mypassword
```

### Features

- **State Persistence**: Swarm state is automatically saved to Redis
- **Recovery**: Interrupted swarms can be resumed
- **Monitoring**: Real-time status tracking
- **Cleanup**: Automatic cleanup of old/expired swarms
- **Backup/Restore**: Support for backing up and restoring swarm states

### Data Structure

```
swarm:{swarmId}          - Individual swarm state
swarms:active           - Set of active swarm IDs
swarms:index            - Hash of swarm metadata
```

## Error Handling

### Common Errors

1. **Redis Connection Failed**
   ```
   ❌ Failed to connect to Redis: Connection refused
   ```
   - Check Redis server is running
   - Verify host and port configuration
   - Check network connectivity

2. **Invalid Arguments**
   ```
   ❌ Validation errors:
     • max-agents must be a number between 1 and 50
   ```
   - Check argument values are within valid ranges
   - Ensure required arguments are provided

3. **Swarm Not Found**
   ```
   ❌ Swarm 'swarm_123' not found
   ```
   - Verify swarm ID is correct
   - Check if swarm has expired (24-hour TTL)
   - Use --list to see available swarms

### Recovery Strategies

1. **Connection Issues**: Check Redis server status and configuration
2. **Invalid Configuration**: Use --help to see valid options
3. **Lost Swarms**: Use recover --list to find available swarms
4. **Permission Issues**: Check file permissions for output files

## Best Practices

### Performance Optimization

1. **Agent Count**: Use appropriate number of agents for task complexity
2. **Strategy Selection**: Choose the right strategy for your objective
3. **Mode Selection**: Select coordination mode based on project needs
4. **Timeout Configuration**: Set appropriate timeouts for task complexity

### Resource Management

1. **Redis Memory**: Monitor Redis memory usage with large numbers of swarms
2. **File Output**: Use file output for large swarms to avoid console overflow
3. **Cleanup**: Regular cleanup of completed swarms to save space
4. **Monitoring**: Use monitoring flag for long-running swarms

### Security Considerations

1. **Redis Authentication**: Use password protection for Redis
2. **Network Security**: Ensure Redis is not exposed to public networks
3. **Data Sensitivity**: Be aware that swarm objectives are stored in Redis
4. **File Permissions**: Secure output files containing sensitive information

## Integration Examples

### CI/CD Pipeline

```bash
#!/bin/bash
# Execute swarm in CI/CD pipeline
npx claude-flow-novice swarm-exec "Run security analysis" \
  --strategy testing \
  --max-agents 8 \
  --output-format json \
  --output-file security-report.json \
  --persist

# Check results
if [ $? -eq 0 ]; then
  echo "✅ Security analysis completed successfully"
  # Process results from security-report.json
else
  echo "❌ Security analysis failed"
  exit 1
fi
```

### Monitoring Integration

```bash
#!/bin/bash
# Monitor active swarms
npx claude-flow-novice swarm-exec status --all --format json > swarm-status.json

# Process with monitoring tools
jq '.[] | select(.status == "running")' swarm-status.json
```

### Backup and Restore

```bash
#!/bin/bash
# Backup swarm states
npx claude-flow-novice swarm-exec status --all --format json > backup-$(date +%Y%m%d).json

# Restore from backup (conceptual - requires Redis operations)
# This would typically be done through Redis CLI or client
```

## Troubleshooting

### Debug Mode

Use the `--verbose` flag for detailed logging:

```bash
npx claude-flow-novice swarm-exec "My task" --verbose
```

### Health Checks

Check Redis health and swarm status:

```bash
# Check Redis connection
redis-cli ping

# List active swarms
npx claude-flow-novice swarm-exec status

# Check specific swarm
npx claude-flow-novice swarm-exec status swarm_123
```

### Common Issues and Solutions

1. **Command not found**
   - Ensure Node.js and npm are installed
   - Check if claude-flow-novice is installed globally or locally

2. **Permission denied**
   - Check file permissions for output directories
   - Ensure Redis server has appropriate permissions

3. **Memory issues**
   - Increase Redis memory limit
   - Reduce number of concurrent swarms
   - Clean up old swarm states

4. **Network issues**
   - Check Redis server connectivity
   - Verify firewall settings
   - Test with basic Redis commands

## API Reference

### Exit Codes

- `0` - Success
- `1` - General error
- `2` - Invalid arguments
- `3` - Redis connection failed
- `4` - Swarm execution failed

### Environment Variables

- `REDIS_HOST` - Default Redis host
- `REDIS_PORT` - Default Redis port
- `REDIS_PASSWORD` - Default Redis password
- `SWARM_OUTPUT_DIR` - Default output directory
- `SWARM_LOG_LEVEL` - Default log level

### Configuration Files

Configuration can be provided via JSON files:

```json
{
  "strategy": "development",
  "mode": "centralized",
  "maxAgents": 10,
  "timeout": 120,
  "redis": {
    "host": "localhost",
    "port": 6379,
    "password": null
  },
  "persist": true,
  "monitor": true,
  "verbose": false
}
```

Use with: `npx claude-flow-novice swarm-exec "Task" --config config.json`