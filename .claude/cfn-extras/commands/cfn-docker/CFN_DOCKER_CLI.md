---
description: "Deploy production-ready container-based CFN Loop with CLI agent spawning and cost optimization"
argument-hint: "[task-description] --mode=standard --timeout=1800 --memory-limit=1g"
allowed-tools: ["Bash", "Read", "TodoWrite", "Task"]
---

# CFN Docker CLI - Production Container Deployment

Deploy production-ready container-based CFN Loop with CLI agent spawning, achieving 95%+ cost savings while maintaining enterprise-grade security and resource management.

**Task Description:** $ARGUMENTS

## Architecture Overview

```
Main Chat
    ↓ (Task tool)
cfn-docker-v3-coordinator
    ↓ (CLI spawning - 95% cost savings)
CLI Agent Containers (via npx claude-flow-novice)
    ↓ (Authenticated MCP access)
Skill-Selected MCP Servers
    ↓ (Specialized tool access)
Playwright, Redis, Security Scanner, etc.
```

## Key Benefits

### 💰 Massive Cost Savings
- **95% cost reduction** vs Task-based spawning
- **Z.ai routing** for CLI agents (when enabled)
- **Resource efficiency** through container isolation
- **Pay only for what you use** pricing model

### 🔒 Enterprise Security
- **Container isolation** for all agents
- **Token-based MCP authentication**
- **Skill-based access control**
- **Comprehensive audit logging**

### ⚡ Performance Optimization
- **50%+ memory savings** via skill-based MCP selection
- **Parallel container execution**
- **Local MCP networking** for minimal latency
- **Resource monitoring** and automatic scaling

### 🔄 Production Reliability
- **Swarm recovery** via Redis persistence
- **Automatic error handling** and retry logic
- **Health monitoring** and alerting
- **Graceful degradation** on failures

## Usage Examples

### Standard Production Execution
```bash
# Standard CFN Loop with CLI agents
/cfn-docker-loop-cli "Implement user authentication system" --mode=standard

# With resource constraints
/cfn-docker-loop-cli "Analyze security vulnerabilities" --mode=enterprise --memory-limit=2g

# With custom timeout for long-running tasks
/cfn-docker-loop-cli "Migrate production database" --mode=enterprise --timeout=3600

# With specific network configuration
/cfn-docker-loop-cli "Deploy microservices" --network=production-network
```

### Cost-Optimized Execution
```bash
# MVP mode for rapid prototyping
/cfn-docker-loop-cli "Proof of concept API" --mode=mvp --timeout=900

# Batch processing for multiple tasks
/cfn-docker-loop-cli "Process user data batch" --mode=standard --batch-size=100

# Resource-constrained execution
/cfn-docker-loop-cli "Optimize queries" --memory-limit=512m --cpu-limit=0.5
```

### Integration-Focused Execution
```bash
# CI/CD pipeline integration
/cfn-docker-loop-cli "Deploy to staging" --mode=standard --integration=github-actions

# Database migration with rollback
/cfn-docker-loop-cli "Schema migration" --mode=enterprise --rollback-enabled

# External API integration
/cfn-docker-loop-cli "Connect payment gateway" --context-file payment-config.json
```

## Command Options

### Core Options
```bash
# Task specification
/cfn-docker-loop-cli "Task description" \
  --mode=standard|mvp|enterprise \  # Execution mode
  --timeout=1800 \                    # Timeout in seconds
  --memory-limit=1g \                 # Per-agent memory limit
  --cpu-limit=1.0 \                   # Per-agent CPU limit
  --network=mcp-network               # Docker network
```

### Advanced Options
```bash
# Agent and skill configuration
/cfn-docker-loop-cli "Task description" \
  --agents=backend-developer,security-specialist \  # Specific agents
  --skills=api-development,security-auditing \     # Required skills
  --mcp-servers=redis,security-scanner \           # Specific MCP servers
  --context-file=task-context.json                 # Task context file

# Monitoring and debugging
/cfn-docker-loop-cli "Task description" \
  --verbose \                         # Detailed logging
  --monitor \                         # Real-time monitoring
  --debug \                           # Debug mode
  --dry-run                          # Show configuration without execution
```

### Recovery and Maintenance
```bash
# Swarm recovery
/cfn-docker-loop-cli "Task description" \
  --recover \                         # Recover interrupted task
  --task-id=previous-task-id \        # Specific task to recover
  --resume-iteration=3                # Resume from specific iteration
```

## Execution Modes Comparison

| Feature | MVP Mode | Standard Mode | Enterprise Mode |
|---------|----------|---------------|-----------------|
| **Iterations** | 3 | 10 | 15 |
| **Gate Threshold** | 0.70 | 0.75 | 0.85 |
| **Consensus Threshold** | 0.80 | 0.90 | 0.95 |
| **Validators** | 2 | 3 | 5 |
| **Timeout** | 15 min | 30 min | 60 min |
| **Memory per Agent** | 512MB | 1GB | 2GB |
| **Cost (per hour)** | $0.05 | $0.08 | $0.15 |
| **Use Case** | Prototyping | Production | Critical Systems |

## Production Deployment Workflow

### 1. Environment Setup
```bash
# Start Redis server
redis-server --daemonize yes

# Verify Redis connectivity
redis-cli ping

# Create Docker network for MCP communication
docker network create mcp-network --driver bridge

# Verify MCP server status
docker ps | grep -E "(playwright|redis|security)"
```

### 2. Agent Token Management
```bash
# Register agent tokens for authentication
node src/cli/agent-token-manager.js register backend-developer
node src/cli/agent-token-manager.js register security-specialist
node src/cli/agent-token-manager.js register frontend-engineer

# List registered tokens
node src/cli/agent-token-manager.js list

# Validate tokens
node src/cli/agent-token-manager.js validate <token>
```

### 3. Task Execution
```bash
# Execute standard CFN Loop
/cfn-docker-loop-cli "Implement secure authentication" \
  --mode=standard \
  --timeout=1800 \
  --memory-limit=1g

# Monitor progress in real-time
/cfn-docker-monitor --task-id <generated-task-id>
```

### 4. Results Collection
```bash
# Get task results
cfn-docker-results --task-id <generated-task-id> --output results/

# Performance metrics
cfn-docker-metrics --task-id <generated-task-id> --detailed

# Cost analysis
cfn-docker-cost-report --task-id <generated-task-id> --breakdown
```

## Resource Management

### Memory Optimization
```bash
# Memory-efficient execution
/cfn-docker-loop-cli "Lightweight task" \
  --mode=mvp \
  --memory-limit=512m \
  --mcp-servers=minimal

# High-memory task
/cfn-docker-loop-cli "Heavy data processing" \
  --mode=enterprise \
  --memory-limit=4g \
  --mcp-servers=redis,postgres,data-processor
```

### CPU Management
```bash
# CPU-constrained execution
/cfn-docker-loop-cli "Background processing" \
  --cpu-limit=0.5 \
  --priority=low

# CPU-intensive task
/cfn-docker-loop-cli "Complex computation" \
  --cpu-limit=2.0 \
  --priority=high
```

### Network Configuration
```bash
# Isolated network for security
/cfn-docker-loop-cli "Process sensitive data" \
  --network=secure-network \
  --isolate-network

# Multi-network setup
/cfn-docker-loop-cli "Integration with external APIs" \
  --networks=mcp-network,external-network \
  --network-policies=restrictive
```

## Monitoring and Observability

### Real-time Monitoring
```bash
# Monitor active task
/cfn-docker-monitor --task-id <task-id>

# System-wide monitoring
/cfn-docker-monitor --all-tasks --refresh=5

# Resource usage monitoring
/cfn-docker-monitor --resource-usage --threshold=80
```

### Performance Analytics
```bash
# Task performance report
cfn-docker-performance-report \
  --task-id <task-id> \
  --include-timing \
  --include-resources \
  --include-costs

# Agent efficiency analysis
cfn-docker-agent-efficiency \
  --agent-type backend-developer \
  --duration 24h \
  --compare-mode
```

### Health Checks
```bash
# System health check
cfn-docker-health-check --comprehensive

# MCP server health
cfn-docker-mcp-health --all-servers

# Network connectivity test
cfn-docker-network-test --all-networks
```

## Error Handling and Recovery

### Automatic Recovery
```bash
# Recover from interruption
/cfn-docker-recover --task-id <interrupted-task-id>

# Resume from specific iteration
/cfn-docker-resume \
  --task-id <task-id> \
  --iteration 3 \
  --preserve-state
```

### Manual Intervention
```bash
# Debug failed task
cfn-docker-debug --task-id <task-id> --component orchestration

# Inspect agent state
cfn-docker-agent-inspect --agent-id <agent-id> --detailed

# Manual task recovery
cfn-docker-manual-recovery \
  --task-id <task-id> \
  --backup-state \
  --new-configuration
```

## Security Configuration

### Authentication Setup
```bash
# Configure Redis authentication
redis-cli CONFIG SET requirepass <strong-password>

# Enable MCP authentication
export CFN_DOCKER_MCP_AUTH_REQUIRED=true
export CFN_DOCKER_MCP_TOKEN_EXPIRY=24h

# Configure network security
docker network create --driver bridge --opt encrypted mcp-network
```

### Access Control
```bash
# Agent whitelist configuration
cfn-docker-config agent-whitelist --config-file config/production-agents.json

# Skill-based access control
cfn-docker-config skill-requirements --strict-mode --audit-mode

# Rate limiting configuration
cfn-docker-config rate-limits --default 100 --agents 500
```

### Audit and Compliance
```bash
# Enable audit logging
cfn-docker-config audit-logging --level info --retain-days=90

# Compliance reporting
cfn-docker-compliance-report \
  --period 30d \
  --include-access-logs \
  --include-resource-usage
```

## Integration Examples

### CI/CD Pipeline Integration
```bash
# GitHub Actions integration
name: Deploy with CFN Docker
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy with CFN Docker
        run: |
          /cfn-docker-loop-cli "Deploy to production" \
            --mode=enterprise \
            --context-file deploy-config.json \
            --integration=github-actions
```

### Database Migration
```bash
# Safe database migration
/cfn-docker-loop-cli "Migrate user database to v2.0" \
  --mode=enterprise \
  --context-file migration-plan.json \
  --rollback-enabled \
  --validation-required \
  --backup-automated
```

### External API Integration
```bash
# Third-party service integration
/cfn-docker-loop-cli "Integrate Stripe payment processing" \
  --mode=standard \
  --mcp-servers=payment-api,webhook-processor \
  --context-file stripe-config.json \
  --security-scan
```

## Best Practices

### Production Deployment
1. **Use Standard or Enterprise mode** for production workloads
2. **Set appropriate timeouts** based on task complexity
3. **Monitor resource usage** to prevent resource exhaustion
4. **Enable comprehensive logging** for debugging and compliance
5. **Test in staging** before production deployment

### Cost Optimization
1. **Choose MVP mode** for prototyping and simple tasks
2. **Set realistic timeouts** to prevent runaway costs
3. **Monitor agent efficiency** and optimize resource usage
4. **Use batch processing** for similar tasks
5. **Leverage Z.ai routing** when available

### Security Best Practices
1. **Enable MCP authentication** for all production deployments
2. **Use isolated networks** for sensitive tasks
3. **Implement rate limiting** to prevent resource abuse
4. **Regular security audits** of agent and MCP configurations
5. **Encrypt sensitive data** in transit and at rest

### Performance Optimization
1. **Select appropriate agents** based on task requirements
2. **Optimize memory limits** for agent types
3. **Use local MCP networking** for minimal latency
4. **Monitor container performance** and adjust resources
5. **Implement caching** for repeated operations

## Troubleshooting Guide

### Common Issues
1. **Container Startup Failures**
   ```bash
   # Check Docker daemon
   docker info

   # Verify image availability
   docker images | grep claude-flow-novice

   # Check resource limits
   cfn-docker-resource-check --task-id <task-id>
   ```

2. **MCP Server Connection Issues**
   ```bash
   # Test MCP connectivity
   cfn-docker-mcp-test --server playwright --token <test-token>

   # Check network configuration
   docker network inspect mcp-network

   # Verify token validity
   node src/cli/agent-token-manager.js validate <token>
   ```

3. **Redis Coordination Issues**
   ```bash
   # Test Redis connectivity
   redis-cli ping

   # Check Redis memory usage
   redis-cli info memory

   # Verify coordination data
   redis-cli keys "cfn_docker:*"
   ```

### Performance Issues
1. **High Memory Usage**
   ```bash
   # Monitor memory usage
   cfn-docker-memory-monitor --task-id <task-id>

   # Optimize agent selection
   cfn-docker-optimize-agents --task-id <task-id> --memory-efficient
   ```

2. **Slow Execution**
   ```bash
   # Performance analysis
   cfn-docker-performance-analysis --task-id <task-id>

   # Optimize MCP selection
   cfn-docker-optimize-mcp --task-id <task-id>
   ```

## Configuration Reference

### Environment Variables
```bash
# Core Configuration
CFN_DOCKER_MODE=standard
CFN_DOCKER_TIMEOUT=1800
CFN_DOCKER_MEMORY_LIMIT=1g
CFN_DOCKER_CPU_LIMIT=1.0

# Redis Configuration
CFN_DOCKER_REDIS_HOST=localhost
CFN_DOCKER_REDIS_PORT=6379
CFN_DOCKER_REDIS_DB=0
CFN_DOCKER_REDIS_TTL=3600

# Docker Configuration
CFN_DOCKER_NETWORK=mcp-network
CFN_DOCKER_IMAGE=claude-flow-novice:agent
CFN_DOCKER_REGISTRY=local

# MCP Configuration
CFN_DOCKER_MCP_AUTH_REQUIRED=true
CFN_DOCKER_MCP_TOKEN_EXPIRY=24h
CFN_DOCKER_MCP_SERVER_TIMEOUT=30

# Security Configuration
CFN_DOCKER_ENABLE_AUDIT=true
CFN_DOCKER_RATE_LIMIT=100
CFN_DOCKER_MAX_CONCURRENT_AGENTS=10

# Monitoring Configuration
CFN_DOCKER_MONITORING_ENABLED=true
CFN_DOCKER_METRICS_RETENTION=7d
CFN_DOCKER_ALERT_THRESHOLDS=80
```

### Configuration Files
- **Agent Configuration**: `config/production-agents.json`
- **MCP Server Configuration**: `config/mcp-servers.json`
- **Network Configuration**: `config/networks.json`
- **Security Configuration**: `config/security.json`
- **Monitoring Configuration**: `config/monitoring.json`