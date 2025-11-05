# CFN Docker Redis Coordination Skill

**Purpose:** Provide Redis-based coordination, state management, and communication for container-based CFN Loop execution with swarm recovery capabilities.

## Overview

This skill manages all Redis-based coordination activities for docker-based agents, including task context storage, agent state management, completion signaling, consensus collection, and swarm recovery.

## Architecture

```bash
CFN Docker Coordinator
    ↓ (context storage)
Redis (State Management)
    ↓ (pub/sub messaging)
Agent Containers
    ↓ (completion signals)
Consensus Collection
    ↓ (decision flow)
Product Owner Decision
```

## Core Functions

### 1. Task Context Management
Store and retrieve task context for swarm recovery:

```bash
# Store task context
cfn-docker-redis-coordination store-context \
  --task-id task-authentication \
  --context-file task-context.json \
  --ttl 3600

# Retrieve task context
cfn-docker-redis-coordination get-context \
  --task-id task-authentication \
  --agent-id agent-frontend-001
```

### 2. Agent Registration and Status
Track agent lifecycle and status:

```bash
# Register agent
cfn-docker-redis-coordination register-agent \
  --agent-id agent-frontend-001 \
  --agent-type react-frontend-engineer \
  --container-id abc123 \
  --task-id task-authentication

# Update agent status
cfn-docker-redis-coordination update-status \
  --agent-id agent-frontend-001 \
  --status running \
  --iteration 1
```

### 3. Completion Signaling
Handle agent completion and confidence reporting:

```bash
# Signal completion
cfn-docker-redis-coordination signal-complete \
  --agent-id agent-frontend-001 \
  --task-id task-authentication \
  --confidence 0.85 \
  --iteration 1
```

### 4. Consensus Collection
Collect and analyze consensus from validators:

```bash
# Collect Loop 2 consensus
cfn-docker-redis-coordination collect-consensus \
  --task-id task-authentication \
  --loop-number 2 \
  --required-consensus 0.90 \
  --timeout 300
```

### 5. Swarm Recovery
Enable recovery from interruptions with state persistence:

```bash
# Recover swarm state
cfn-docker-redis-coordination recover-swarm \
  --task-id task-authentication \
  --restart-failed-agents
```

## Redis Data Structure

### Task Context Storage
```redis
# Task context (JSON)
HSET "cfn_docker:task:{task_id}:context" \
  "epic_goal" "Implement user authentication" \
  "deliverables" '["auth-service.js","login-form.html"]' \
  "acceptance_criteria" '["Users can register","Login works","Passwords encrypted"]' \
  "in_scope" '["authentication","security"]' \
  "out_of_scope" '["user profiles","social login"]'

# Context metadata
HSET "cfn_docker:task:{task_id}:meta" \
  "created_at" "2025-01-15T10:00:00Z" \
  "ttl" "3600" \
  "created_by" "cfn-docker-v3-coordinator"
```

### Agent State Management
```redis
# Agent registration
HSET "cfn_docker:agent:{agent_id}" \
  "agent_type" "react-frontend-engineer" \
  "container_id" "abc123" \
  "task_id" "task-authentication" \
  "status" "running" \
  "iteration" "1" \
  "created_at" "2025-01-15T10:05:00Z"

# Agent status history
LPUSH "cfn_docker:agent:{agent_id}:status_history" \
  '{"status":"spawning","timestamp":"2025-01-15T10:05:00Z"}' \
  '{"status":"running","timestamp":"2025-01-15T10:06:00Z"}'
```

### Completion Signaling
```redis
# Agent completion signal
LPUSH "cfn_docker:task:{task_id}:agent:{agent_id}:done" "complete"

# Confidence reporting
HSET "cfn_docker:task:{task_id}:confidence:{agent_id}" \
  "confidence" "0.85" \
  "iteration" "1" \
  "reported_at" "2025-01-15T10:30:00Z" \
  "agent_type" "react-frontend-engineer"
```

### Consensus Tracking
```redis
# Loop 2 consensus collection
HSET "cfn_docker:task:{task_id}:loop2:consensus" \
  "total_validators" "3" \
  "responses_received" "3" \
  "average_confidence" "0.92" \
  "consensus_reached" "true" \
  "decision" "PROCEED"

# Individual validator responses
HSET "cfn_docker:task:{task_id}:loop2:validator:{validator_id}" \
  "confidence" "0.90" \
  "feedback" "Implementation meets requirements" \
  "suggested_changes" "None" \
  "iteration" "1"
```

## Usage Patterns

### Task Initialization
```bash
# Initialize coordination for new task
cfn-docker-redis-coordination init-task \
  --task-id task-authentication \
  --context-file task-context.json \
  --loop-count 5 \
  --consensus-threshold 0.90
```

### Agent Lifecycle Management
```bash
# Register multiple agents
for agent in frontend backend security; do
  cfn-docker-redis-coordination register-agent \
    --agent-id "agent-${agent}-001" \
    --agent-type "${agent}-developer" \
    --task-id task-authentication
done

# Monitor agent status
cfn-docker-redis-coordination monitor-agents \
  --task-id task-authentication \
  --wait-for-complete
```

### Loop Orchestration Support
```bash
# Wait for Loop 3 completion
cfn-docker-redis-coordination wait-loop \
  --task-id task-authentication \
  --loop-number 3 \
  --agent-count 3 \
  --timeout 600

# Collect Loop 2 consensus
cfn-docker-redis-coordination collect-consensus \
  --task-id task-authentication \
  --loop-number 2 \
  --required-consensus 0.90
```

### Swarm Recovery
```bash
# Check for recoverable tasks
cfn-docker-redis-coordination list-recoverable-tasks

# Recover specific task
cfn-docker-redis-coordination recover-task \
  --task-id task-authentication \
  --restart-incomplete-agents
```

## Integration Points

### With CFN Docker Agent Spawning
```bash
# Agent spawning calls coordination
AGENT_ID=$(cfn-docker-agent-spawn --agent-type ${AGENT_TYPE} --task-id ${TASK_ID})
cfn-docker-redis-coordination register-agent \
  --agent-id ${AGENT_ID} \
  --agent-type ${AGENT_TYPE} \
  --task-id ${TASK_ID}
```

### With CFN Docker Loop Orchestration
```bash
# Loop orchestration uses coordination for state
cfn-docker-loop-orchestration execute-loop3 \
  --task-id ${TASK_ID} \
  --agent-count 3 \
  --coordination redis
```

### With CFN Docker Skill Selection
```bash
# Store MCP selection in Redis
MCP_CONFIG=$(cfn-docker-skill-mcp-selector select --agent-type ${AGENT_TYPE})
cfn-docker-redis-coordination store \
  --key "agent:${AGENT_ID}:mcp-config" \
  --value "${MCP_CONFIG}"
```

## Error Handling and Recovery

### Connection Resilience
```bash
# Redis connection retry
cfn-docker-redis-coordination connect \
  --host redis \
  --port 6379 \
  --retry-attempts 5 \
  --retry-delay 5
```

### Data Integrity
```bash
# Validate stored data
cfn-docker-redis-coordination validate \
  --task-id task-authentication \
  --repair-corrupted
```

### Timeout Management
```bash
# Handle operation timeouts
cfn-docker-redis-coordination timeout-handler \
  --task-id task-authentication \
  --agent-timeout 600 \
  --consensus-timeout 300
```

## Performance Optimization

### Connection Pooling
- Use Redis connection pools for high-frequency operations
- Implement connection reuse across operations
- Configure appropriate pool sizes based on load

### Data Expiration
- Set TTLs on all temporary data
- Use automatic cleanup for expired data
- Implement manual cleanup for large datasets

### Memory Management
- Use Redis memory optimization techniques
- Compress large JSON objects
- Implement data partitioning for large tasks

### Batch Operations
```bash
# Batch agent registration
cfn-docker-redis-coordination batch-register \
  --agent-list agents.json \
  --task-id task-authentication

# Batch status updates
cfn-docker-redis-coordination batch-update-status \
  --status-list status-updates.json
```

## Monitoring and Observability

### Health Checks
```bash
# Redis health check
cfn-docker-redis-coordination health-check \
  --test-connection \
  --test-memory \
  --test-latency

# Task health monitoring
cfn-docker-redis-coordination monitor-task \
  --task-id task-authentication \
  --alert-stalled-agents
```

### Metrics Collection
```bash
# Performance metrics
cfn-docker-redis-coordination metrics \
  --task-id task-authentication \
  --include-memory \
  --include-latency \
  --include-throughput

# Agent performance tracking
cfn-docker-redis-coordination agent-metrics \
  --task-id task-authentication \
  --agent-id agent-frontend-001
```

### Audit Logging
```bash
# Enable audit logging
cfn-docker-redis-coordination audit-enable \
  --log-level info \
  --include-operations \
  --include-data-changes
```

## Security Considerations

### Access Control
- Implement Redis authentication (AUTH command)
- Use ACLs for fine-grained access control
- Network isolation with Redis in private networks

### Data Encryption
- Enable Redis TLS for encrypted communication
- Encrypt sensitive data at rest
- Use secure key management for tokens

### Data Sanitization
- Sanitize all data before storage
- Validate data formats and sizes
- Prevent Redis injection attacks

## Best Practices

### Data Structure Design
- Use consistent key naming conventions
- Implement proper data versioning
- Use appropriate Redis data types for different use cases

### Performance Optimization
- Monitor Redis memory usage
- Implement appropriate eviction policies
- Use Redis clustering for large-scale deployments

### Operational Excellence
- Implement comprehensive monitoring
- Set up automated alerts for anomalies
- Regular backup and recovery testing

## Troubleshooting

### Common Issues
1. **Connection Failures**: Check Redis server status and network connectivity
2. **Memory Issues**: Monitor Redis memory usage and implement proper eviction policies
3. **Data Corruption**: Implement data validation and repair mechanisms
4. **Performance Issues**: Optimize queries and use appropriate indexing

### Debug Commands
```bash
# Debug connection issues
cfn-docker-redis-coordination debug-connection \
  --host redis \
  --port 6379 \
  --verbose

# Debug data issues
cfn-docker-redis-coordination debug-data \
  --task-id task-authentication \
  --check-integrity \
  --show-structure

# Debug performance
cfn-docker-redis-coordination debug-performance \
  --task-id task-authentication \
  --monitor-latency \
  --show-memory-usage
```

## Configuration

### Environment Variables
```bash
# Redis connection
CFN_DOCKER_REDIS_HOST=localhost
CFN_DOCKER_REDIS_PORT=6379
CFN_DOCKER_REDIS_PASSWORD=
CFN_DOCKER_REDIS_DB=0

# Timeouts and limits
CFN_DOCKER_REDIS_TIMEOUT=30
CFN_DOCKER_REDIS_MAX_RETRIES=5
CFN_DOCKER_REDIS_POOL_SIZE=10

# Data management
CFN_DOCKER_REDIS_DEFAULT_TTL=3600
CFN_DOCKER_REDIS_MAX_MEMORY=1gb
CFN_DOCKER_REDIS_EVICTION_POLICY=allkeys-lru
```

### Redis Configuration
```conf
# redis.conf recommendations for CFN Docker
maxmemory 1gb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
```