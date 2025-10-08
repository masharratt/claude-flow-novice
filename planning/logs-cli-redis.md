# Claude Flow CLI/Redis Coordination System Documentation

## Overview

The Claude Flow CLI/Redis coordination system provides a complete MCP-less alternative for AI agent orchestration. This system uses Redis for state persistence and command-line interfaces for swarm execution, eliminating the dependency on MCP tools while maintaining full functionality.

## Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CLI/REDIS ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐ │
│  │   CLI Commands   │  │   Redis Store    │  │  Swarm Engine   │ │
│  │                 │  │                 │  │                │ │
│  │ • Swarm init     │  │ • State persist  │  • Agent spawning │ │
│  │ • Task execution │  │ • Recovery data  │  • Coordination │ │
│  │ • Status monitor  │  │ • Message queue  │  • Progress tracking│ │
│  │ • Recovery ops    │  │ • Checkpoints   │  • Result aggregation│ │
│  └─────────────────┘  └─────────────────┘  └────────────────┘ │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                 PROMPT-BASED INITIALIZATION                    │  │
│  │                                                             │  │
│  │  • Natural language input  • Bash command execution          │  │
│  │  • JSON/CLI parsing       • File generation              │  │
│  │  • Strategy selection      • Agent role assignment         │  │
│  │  • Progress tracking      • Status reporting           │  │
│  └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

## CLI Commands Reference

### Swarm Management Commands

#### Direct Swarm Execution

```bash
# Basic swarm execution
node test-swarm-direct.js "Create REST API with authentication" \
  --executor --max-agents 3

# Development strategy
node test-swarm-direct.js "Build authentication system" \
  --strategy development --mode centralized --verbose

# Research strategy
node test-swarm-direct.js "Research cloud architecture patterns" \
  --strategy research --output-format json

# Multi-agent coordination
node test-swarm-direct.js "Develop user registration feature" \
  --strategy development --mode distributed --max-agents 5

# Full mesh topology
node test-swarm-direct.js "Analyze system performance" \
  --topology mesh --strategy analysis --max-agents 8
```

#### CLI Wrapper Commands

```bash
# Using the CLI wrapper
node src/cli/simple-commands/swarm.js "Build REST API" \
  --strategy development --mode mesh --verbose

# Claude Code CLI integration
claude-flow-novice swarm "Research cloud patterns" \
  --strategy research --output-format json --max-agents 3

# Team coordination
claude-flow-novice team:backend --objective "Build API services"
```

#### Swarm Status and Monitoring

```bash
# Check all active swarms
redis-cli keys "swarm:*"

# Get specific swarm details
redis-cli get "swarm:swarm_abc123" | jq .

# Real-time monitoring
redis-cli monitor | grep "swarm:"

# Swarm health check
claude-flow-novice status --component swarm
```

### Recovery Operations

#### Automatic Recovery

```bash
# Execute recovery for all interrupted swarms
node test-swarm-recovery.js

# Recovery with specific swarm ID
node test-swarm-recovery.js --swarm-id swarm_abc123

# Recovery monitoring
monitor-recovery() {
  local swarm_id=$1
  while true; do
    state=$(redis-cli get "swarm:$swarm_id" 2>/dev/null)
    if [ $? -eq 0 ]; then
      status=$(echo $state | jq -r .status 2>/dev/null)
      echo "[$(date '+%H:%M:%S')] Status: $status"
      [ "$status" = "active" ] && break
    fi
    sleep 5
  done
}
```

#### Manual Recovery Scripts

```bash
#!/bin/bash
# recover-swarm.sh
SWARM_ID=$1

echo "🔄 Recovering swarm: $SWARM_ID"

# Create recovery checkpoint
CHECKPOINT=$(cat << EOF
{
  "recoveryId": "$(date +%s)",
  "timestamp": "$(date -Iseconds)",
  "action": "manual_recovery",
  "previousState": "$(redis-cli get "swarm:$SWARM_ID")"
}
EOF
)

redis-cli setex "swarm:$SWARM_ID:recovery" 3600 "$CHECKPOINT"

# Update status to recovering
UPDATED_STATE=$(redis-cli get "swarm:$SWARM_ID" | jq '.status = "recovering" | .recoveredAt = "'$(date -Iseconds)'"')
redis-cli setex "swarm:$SWARM_ID" 3600 "$UPDATED_STATE"

echo "✅ Recovery checkpoint created"
```

### Development Workflow Commands

#### CFN Loop Execution

```bash
# Basic CFN loop
/cfn-loop "Implement authentication system" --threshold 0.85 --max-iterations 5

# Specific phase execution
/cfn-loop "Add payment processing" --phase swarm

# Epic orchestration
/cfn-loop-epic "Build e-commerce platform" --phases 4 --dependencies "1->2->3->4"

# Sprint-based execution
/cfn-loop-sprints "Frontend development" --sprints 3 --max-iterations 3
```

#### SPARC Methodology

```bash
# SPARC specification phase
/sparc spec "Define API endpoints for user management"

# SPARC architecture phase
/sparc arch "Design database schema for e-commerce"

# SPARC refinement phase
/sparc refine "Optimize authentication flow" --iterations 3

# SPARC completion
/sparc complete "Final system integration"
```

#### Fullstack Development

```bash
# Fullstack team coordination
/fullstack "Build e-commerce platform" --stack react --database postgres

# Development-specific commands
/fullstack:develop "Add user authentication"
/fullstack:status
/fullstack:terminate

# Agent-specific operations
/fullstack:spawn "backend developer" --capabilities "nodejs,express"
/fullstack:spawn "frontend developer" --capabilities "react,typescript"
```

### Memory and State Management

#### Redis State Operations

```bash
# Store swarm state
redis-cli setex "swarm:state" 3600 "$(cat swarm-state.json)"

# Retrieve and parse state
redis-cli get "swarm:state" | jq .

# Find all memory entries
redis-cli --scan --pattern "memory:*"

# Clear specific namespace
redis-cli --scan --pattern "memory:swarm:*" | xargs redis-cli del
```

#### Memory Safety Commands

```bash
# Memory safety validation
/check:memory
/memory-safety --validate

# Memory operations via CLI
claude-flow-novice memory list --namespace=swarm
claude-flow-novice memory clear --namespace=swarm
claude-flow-nvce memory backup --namespace=swarm --destination ./backups/
```

### Performance and Optimization

#### Performance Monitoring

```bash
# Start performance monitoring
/performance monitor

# Generate performance report
/performance report --format=json --output ./perf-report.md

# Analyze specific component
/performance analyze --component swarm --timeframe 1h

# Enable optimization
claude-flow-novice optimize:activate
claude-flow-novice optimize:status
```

#### Benchmarking

```bash
# Performance testing
claude-flow-novice test:performance:basic
claude-flow-novice test:performance:load --concurrency 10
claude-flow-novice performance:baseline:create

# Load testing with specific patterns
node scripts/test/load-test.js --pattern "swarm-coordination" --duration 300
```

### Testing and Quality Assurance

#### Test Execution

```bash
# Comprehensive test suite
claude-flow-novice test:comprehensive

# Specific test types
claude-flow-novice test:unit
claude-flow-novice test:integration
claude-novice test:e2e

# Coverage analysis
claude-flow-novice test:coverage --threshold 80
claude-flow-novice validate:agents
claude-flow-nice optimize:validate
```

### Build and Deployment

#### Build Operations

```bash
# Standard build
claude-flow-novice build

# SWC compilation
claude-flow-nice build:swc

# TypeScript compilation
claude-flow-nice build:types

# Watch mode
claude-flow-nice build:watch

# Force rebuild
claude-flow-nice build:force
```

#### Deployment Workflows

```bash
# Environment deployment
claude-flow-nice deploy --environment=staging
claude-flow-nice deploy:rollback --version=previous

# Workflow deployment
claude-flow-novice workflow deploy --pipeline=production
claude-flow-nice workflow execute --name="CI/CD" --parameters='{"env":"production"}'
```

### Configuration Management

#### Project Configuration

```bash
# Show current configuration
claude-flow-novice config show

# Set configuration values
claude-flow-novice config set redis.timeout 5000
claude-flow-nice config set swarm.default-topology mesh
claude-flow-nice config set recovery.auto-recovery true

# Validate configuration
claude-flow-nice config validate --strict

# Initialize project with coordination template
claude-flow-novice init --template=coordination
```

#### Team and Role Management

```bash
# Team operations
claude-flow-novice team create --name="Backend Team"
claude-flow-nice team list
claude-flow-nice team info --team="Backend Team"

# Role management
claude-flow-nice team role-create backend-dev "Backend development specialist"
claude-flow-nice team role-create frontend-dev "Frontend development specialist"

# Member assignment
claude-flow-novice team assign john.doe backend-dev
claude-flow-novice team assign jane.smith frontend-dev
```

### Neural and AI Operations

#### Neural Network Management

```bash
# Neural network training
/neural train --model=classifier --data=training_data.csv --epochs 100

# Prediction and analysis
/neural predict --model=classifier --input=test_data.csv
/neural optimize --model=classifier --iterations=1000

# Neural status monitoring
/neural status --model-id=model_12345
/neural list --type active
```

#### Consciousness Operations

```bash
# Consciousness analysis
/claude-soul "Analyze system consciousness patterns"
/claude-soul --mode=deep --analysis-type=meta-cognitive

# Self-awareness monitoring
/claude-soul --monitor --real-time
/claude-soul --report --format=json
```

### GitHub Integration

#### Repository Operations

```bash
# Repository status
/github status --repository=org/repo

# Pull request management
/github pr create --title="Feature implementation" --body="Description"
/github pr merge --pr-number=123 --strategy=squash
/github pr list --status=open

# Issue management
/github issue create --title="Bug report" --labels=bug,high-priority
/github issue list --status=open --label=bug
```

#### Workflow Automation

```bash
# Workflow creation and execution
/workflow create --name="Deployment pipeline" --trigger=push
/workflow execute --name="Testing workflow" --parameters='{"env":"staging"}'
/workflow status --workflow-id=workflow_12345
/workflow list --status=active

# Automation features
/workflow automation --enable-auto-scaling
/workflow schedule --name="nightly-build" --schedule="0 2 * * *"
```

### Security and Monitoring

#### Security Operations

```bash
# Security audit and validation
claude-flow-nice security:audit
claude-flow-nice security:validate
claude-flow-nice logs export --format=csv --output=security_logs.csv

# Security monitoring
claude-flow-novice logs tail --component=security
claude-flow-nice monitor --component=auth
```

#### System Monitoring

```bash
# Log management
claude-flow-novice logs tail --component=swarm
claude-flow-nice logs search --pattern="error" --timeframe=1h

# Health checks
claude-flow-novice health-check
claude-flow-nice metrics export --prometheus

# Resource monitoring
redis-cli info server
redis-cli info memory
redis-cli info persistence
```

### Utilities and Maintenance

#### Cleanup Operations

```bash
# Build artifact cleanup
claude-flow-novice utils:cleanup
claude-flow-novice clean:test

# Database cleanup (development only)
redis-cli flushall

# Process cleanup
pkill -f vitest
pkill -f "npm test"
```

#### File and Project Utilities

```bash
# Import fixing
claude-flow-novice utils:fix-imports
claude-flow-novice utils:organize-projects

# Code quality
claude-flow-novice typecheck
claude-flow-nice lint
claude-flow-nice format

# Validation utilities
claude-flow-novice validate:imports
claude-flow-novice validate:dependencies
claude-flow-nice validate:configuration
```

### Debugging and Diagnostics

#### Debug Operations

```bash
# Agent debugging
claude-flow-novice debug agent_123 --verbose
claude-flow-nice debug:hooks --trace

# Test debugging
claude-flow-nice test:debug
node --inspect-brk scripts/test/debug.js

# System diagnostics
claude-flow-nice status --verbose
claude-flow-nice test:health
claude-flow-nice validate:phase1-completion
```

#### Diagnostic Commands

```bash
# Comprehensive system check
claude-flow-novice diagnostic:run --components=swarm,redis,cli

# Performance diagnostics
claude-flow-novice diagnostic:performance --benchmark=true
claude-flow-nice diagnostic:memory --leak-detection=true

# Recovery diagnostics
claude-flow-nice diagnostic:recovery --test-scenarios=interruption,timeout,corruption
```

### SDK and Integration

#### SDK Operations

```bash
# SDK integration
claude-flow-novice sdk:enable
claude-flow-nice sdk:monitor
claude-flow-nice sdk:validate
claude-flow-novice sdk:test

# SDK management
claude-flow-novice sdk:version
claude-flow-nice sdk:rollback
claude-flow-nice sdk:configure --options='{"timeout":60000}'
```

## Redis Configuration

### Production Redis Configuration

```redis
# redis.conf for production coordination
port 6379
bind 127.0.0.1  # Local access only
protected-mode yes
requirepass ${REDIS_PASSWORD}

# Memory management for swarms
maxmemory 4gb
maxmemory-policy volatile-lru

# Persistence settings
save 900 1
save 300 10
save 60 10000

# Coordination-specific settings
timeout 300  # Client timeout
tcp-keepalive 60
tcp-backlog 511

# Security settings
rename-command CONFIG ""
rename-command FLUSHDB ""
rename-command FLUSHALL ""
rename-command KEYS ""
rename-command DEBUG ""

# Monitoring
slowlog-log-slower-than 10000
slowlog-max-len 128
```

### Redis Keyspace Design

#### Swarm State Keys

```
swarm:{swarmId}                    # Main swarm state
swarm:{swarmId}:recovery           # Recovery checkpoints
swarm:{swarmId}:checkpoint          # Progress checkpoints
swarm:{swarmId}:agents              # Agent assignments
swarm:{swarmId}:tasks               # Task tracking
```

#### Memory Keys

```
memory:{namespace}:{key}              # General memory storage
memory:swarm:{swarmId}:{agentId}    # Agent-specific memory
memory:task:{taskId}                # Task-specific memory
memory:session:{sessionId}         # Session persistence
```

#### Coordination Keys

```
coord:{swarmId}:messages           # Inter-agent messages
coord:{swarmId}:events             # System events
coord:{swarmId}:heartbeat          # Health monitoring
coord:{swarmId}:queue              # Task queue
```

## Performance Optimization

### Redis Performance Tuning

#### Memory Optimization

```redis
# Memory optimization for high-performance coordination
maxmemory 8gb
maxmemory-policy allkeys-lru

# Coordination-specific optimizations
hash-max-ziplist-entries 512
hash-max-ziplist-value 64
```

#### Connection Pooling

```javascript
// Redis connection pool for CLI coordination
const redis = require('redis');
const pool = redis.createPool({
  host: 'localhost',
  port: 6379,
  max: 20,  // Maximum connections
  min: 5,   // Minimum connections
  idleTimeoutMillis: 30000,
  acquireTimeoutMillis: 60000
});
```

### Batch Operations

```javascript
// Batch state updates
const pipeline = redis.pipeline();
swarmStates.forEach(state => {
  pipeline.setex(`swarm:${state.id}`, 3600, JSON.stringify(state));
});
await pipeline.exec();
```

## Error Handling and Recovery

### Error Recovery Patterns

#### Automatic Retry Logic

```javascript
async function executeWithRetry(command, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await executeCommand(command);
    } catch (error) {
      if (attempt === maxRetries) throw error;
      console.warn(`Attempt ${attempt} failed, retrying...`);
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}
```

#### Graceful Degradation

```javascript
// Fallback when Redis is unavailable
const fallbackState = {
  status: 'degraded',
  reason: 'Redis unavailable',
  timestamp: new Date().toISOString(),
  localState: localStateCopy
};
```

## Security Considerations

### Redis Security

#### Authentication

```redis
# Redis ACL configuration
acllogfile /var/log/redis/acl.log
acllog-default all off
acllog-logon admin on
acllog-setkey $REDIS_PASSWORD on ~* +@all +@config
acl-log-key $REDIS_PASSWORD on ~* +@read +@write +@delete
```

#### Data Encryption

```javascript
// Encrypt sensitive swarm data
const crypto = require('crypto');
const algorithm = 'aes-256-gcm';

function encryptState(data, key) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipher(algorithm, key, iv);
  let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
  encrypted = cipher.final('hex');
  return {
    encrypted,
    iv: iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex')
  };
}
```

### Access Control

#### Role-Based Permissions

```javascript
const permissions = {
  admin: ['*'],  // Full access
  developer: ['swarm:*', 'memory:*', 'coord:*'],
  viewer: ['swarm:*:read', 'memory:*:read'],
  agent: ['memory:agent:*:read', 'coord:messages:*:write']
};
```

## Migration from MCP

### Migration Strategy

#### Phase 1: Parallel Operation
- Deploy Redis alongside existing MCP system
- Enable dual persistence (MCP + Redis)
- Validate state consistency

#### Phase 2: Redis Primary
- Make Redis primary state store
- Use MCP as backup/fallback
- Test recovery procedures

#### Phase 3: MCP Phase-out
- Disable MCP persistence
- Use Redis for all state management
- Remove MCP dependencies

### Migration Commands

```bash
# Phase 1: Enable Redis persistence
claude-flow-novice config set redis.primary true
claude-flow-novice config set mcp.fallback true

# Phase 2: Redis primary configuration
claude-flow-nice config set redis.timeout 30000
claude-flow-novice config set mcp.disabled true

# Phase 3: Complete MCP removal
claude-flow-nice config remove mcp.*
```

## Best Practices

### Development Workflow

#### 1. Swarm Initialization

```bash
# Always initialize with clear objectives
node test-swarm-direct.js "Build user authentication system" \
  --strategy development \
  --mode mesh \
  --max-agents 5 \
  --verbose

# Monitor progress
redis-cli monitor | grep "swarm:"
```

#### 2. State Management

```bash
# Regular checkpoints
redis-cli setex "swarm:${swarmId}:checkpoint" 3600 "$(cat swarm-state.json)"

# Progress tracking
redis-cli get "swarm:${swarmId}" | jq '.progress'
```

#### 3. Recovery Planning

```bash
# Always enable auto-recovery
claude-flow-novice config set recovery.auto-recovery true
claude-flow-novice config set recovery.check-interval 30000
```

### Production Deployment

#### 1. Redis Cluster Setup

```bash
# Redis cluster for high availability
redis-cli --cluster create \
  127.0.0.1:7000,127.0.0.1:7001,127.0.0.1:7002 \
  127.0.0.1:7003,127.0.0.1:7004 \
  --cluster-replicas 1
```

#### 2. Monitoring Setup

```bash
# Redis monitoring
redis-cli monitor
redis-cli info stats
redis-cli info memory
```

#### 3. Backup Strategy

```bash
# Automated backups
redis-cli BGSAVE
redis-cli --rdb /backup/redis-$(date +%Y%m%d).rdb
```

## Integration Examples

### Microservices Development

```bash
# Initialize backend team swarm
claude-flow-novice team create --name="Backend Team"
claude-flow-nice team spawn --objective="Build microservices" \
  --agents 5 --strategy development

# Execute microservice development
node test-swarm-direct.js "Create user service with JWT auth" \
  --strategy development --mode hierarchical

# Monitor swarm progress
/monitor swarm --real-time
```

### Research Workflows

```bash
# Research team initialization
claude-flow-novice team create --name="Research Team"
claude-flow-nice team spawn --objective="Analyze system patterns" \
  --agents 3 --strategy research

# Execute research
node test-swarm-direct.js "Research cloud architecture patterns" \
  --strategy research --output-format json

# Consolidate results
redis-cli get "swarm:research-swarm-123" | jq '.results'
```

### Code Review Automation

```bash
# Code review swarm
node test-swarm-direct.js "Review authentication implementation" \
  --strategy testing --mode peer-review --agents 4

# Security review
node test-swarm-direct.js "Security audit of payment system" \
  --strategy security --max-agents 6
```

## Troubleshooting

### Common Issues

#### 1. Redis Connection Issues

```bash
# Test Redis connectivity
redis-cli ping

# Check Redis configuration
redis-cli config get save
redis-cli config get maxmemory
```

#### 2. Swarm Recovery Issues

```bash
# Check swarm state
redis-cli keys "swarm:*"

# Manual recovery
node test-swarm-recovery.js --swarm-id swarm_abc123

# Check recovery logs
tail -f logs/recovery.log
```

#### 3. Performance Issues

```bash
# Monitor Redis performance
redis-cli info stats
redis-cli info memory

# Check swarm metrics
claude-flow-novice metrics --component=swarm
claude-flow-novice performance analyze --component=swarm
```

### Diagnostic Commands

```bash
# System health check
claude-flow-novice diagnostic:run --components=all

# Performance diagnostics
claude-flow-novice diagnostic:performance --benchmark=true

# Recovery diagnostics
claude-flow-nice diagnostic:recovery --test-scenarios=all
```

## Related Documentation

- [API](./logs-api.md) - Complete API reference
- [Features](./logs-features.md) - Available features
- [Functions](./logs-functions.md) - Utility functions
- [Hooks](./logs-hooks.md) - System integration points
- [MCP](./logs-mcp.md) - Model Context Protocol
- [Slash Commands](./logs-slash-commands.md) - CLI operations
- [Redis Guide](./REDIS_CLI_COORDINATION_GUIDE.md) - Comprehensive Redis setup guide