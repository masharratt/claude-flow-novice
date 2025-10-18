# Redis Coordination Runbook: Swarm Agent Orchestration

## 1. Quick Start Guide

### 1.1 Prerequisites

**Software Requirements:**
- Redis Server (v6.2+)
- Node.js (v18+)
- redis-cli
- jq (JSON processor)

**Environment Setup:**
```bash
# Install dependencies
npm install -g redis-cli jq

# Verify installation
redis-cli ping  # Should return PONG
node --version  # Should return v18+
jq --version    # Should return version
```

### 1.2 Hello World: Basic Agent Coordination

**Redis List-based Coordination Pattern**
```bash
# Terminal 1: Agent A (Producer)
redis-cli lpush "swarm:hello-world:agent-a:complete" '{"status":"done","message":"Hello from Agent A"}'

# Terminal 2: Agent B (Consumer)
result=$(timeout 300 redis-cli --csv blpop "swarm:hello-world:agent-a:complete" 0)
echo "Agent A result: $result"
```

### 1.3 Common CLI Commands

```bash
# List Redis channels
redis-cli keys "swarm:*"

# Check queue length
redis-cli llen "swarm:my-task:agent:feedback"

# Monitor specific channel
redis-cli PSUBSCRIBE "swarm:task:*"

# Monitor script (built-in)
./scripts/monitor-swarm-redis.sh feedback
```

## 2. Debugging & Troubleshooting

### 2.1 Connection Issues

**Diagnosis Commands:**
```bash
# Redis server status
redis-cli ping
redis-cli INFO | grep redis_version

# Check network connectivity
telnet $REDIS_HOST $REDIS_PORT

# Verify credentials
redis-cli -h $REDIS_HOST -p $REDIS_PORT -a $REDIS_PASSWORD ping
```

**Common Solutions:**
1. Verify Redis server is running: `sudo systemctl status redis`
2. Check firewall settings: `sudo ufw status`
3. Verify network configuration
4. Check Redis logs: `/var/log/redis/redis-server.log`

### 2.2 Coordination Failures

**Symptoms:**
- Agents not receiving messages
- Stale queues
- Missing coordination events

**Diagnosis:**
```bash
# List all feedback channels
redis-cli keys "*:feedback"

# Check channel lengths
redis-cli keys "*:feedback" | xargs -I {} redis-cli LLEN {}

# Inspect oldest message in channel
redis-cli LINDEX "agent:coder-1:feedback" -1
```

**Troubleshooting Steps:**
1. Verify agent IDs match channel naming
2. Check if agents are still running
3. Clear stale queues: `redis-cli LTRIM agent:coder-1:feedback 0 0`
4. Restart monitoring service

### 2.3 Performance Bottlenecks

**Performance Monitoring:**
```bash
# Redis performance
redis-cli INFO | grep -E "used_memory|connected_clients|blocked_clients"

# Check slowest operations
redis-cli SLOWLOG GET 10
```

**Optimization Techniques:**
1. Use `maxmemory-policy allkeys-lru`
2. Disable persistence if not needed
3. Implement connection pooling
4. Use batching for high-volume scenarios

## 3. Coordination Patterns Reference

### 3.1 Sequential Workflow
```bash
# Researcher completes, signals next agent
redis-cli lpush "swarm:research:researcher:complete" '{"confidence":0.85}'

# Code Analyzer waits for researcher
result=$(timeout 300 redis-cli --csv blpop "swarm:research:researcher:complete" 0)
```

### 3.2 Parallel Coordination
```bash
# Multiple agents signal completion independently
redis-cli lpush "swarm:task:researcher:complete" '{"findings":"..."}'
redis-cli lpush "swarm:task:code-analyzer:complete" '{"insights":"..."}'

# Coordinator aggregates results
coordinator_script() {
  completed=0
  required_agents=2
  while [ $completed -lt $required_agents ]; do
    result=$(redis-cli --csv blpop "swarm:task:*:complete" 0)
    completed=$((completed + 1))
  done
}
```

### 3.3 Hierarchical Broadcast
```bash
# Coordinator receives and broadcasts
coordinator_broadcast() {
  # Wait for initial agent
  researcher_data=$(redis-cli --csv blpop "swarm:task:researcher:done" 0)

  # Broadcast to dependents
  redis-cli lpush "swarm:task:analyzer:inbox" "$researcher_data"
  redis-cli lpush "swarm:task:architect:inbox" "$researcher_data"
}
```

## 4. Operations Guide

### 4.1 Monitoring Tools

**Built-in CLI Monitor:**
```bash
# Monitor feedback channels
./scripts/monitor-swarm-redis.sh feedback

# Monitor CFN Loop coordination
./scripts/monitor-swarm-redis.sh coordination

# Monitor all queues
./scripts/monitor-swarm-redis.sh queues
```

**Real-time Dashboard:**
- URL: http://localhost:3001
- WebSocket: ws://localhost:3001/ws
- Shows live Redis coordination events

### 4.2 Logging & Auditing

**Log Locations:**
- Redis server logs: `/var/log/redis/redis-server.log`
- Coordination logs: `.artifacts/logs/redis-coordination.log`

**Logging Best Practices:**
1. Enable Redis slow log
2. Implement structured logging
3. Rotate logs to prevent disk space issues

## 5. Best Practices

### 5.1 Channel Naming Convention
```
swarm:{task-id}:{agent-role}:{event-type}

Examples:
- swarm:auth:researcher:complete
- swarm:auth:coder:progress
- swarm:auth:coordinator:status
```

### 5.2 Anti-Patterns to Avoid
- Using Pub/Sub for guaranteed delivery
- Not implementing timeouts
- Ignoring error handling
- Hardcoding Redis connection details

### 5.3 Performance Optimization
- Use connection pooling
- Implement exponential backoff for retries
- Keep message payloads small
- Use batching for high-volume scenarios

## 6. Escalation Procedures

### 6.1 Incident Response Levels
1. **Self-Service (5 mins)**: Restart services, check logs
2. **Operations (15 mins)**: Deep log analysis, resource investigation
3. **Engineering (30 mins)**: Code-level debugging, architecture review

## 7. Future Improvements
- Machine learning-based anomaly detection
- Enhanced real-time monitoring
- Automated recovery scripts

**Revision Date:** 2025-10-17
**Version:** 1.0.0