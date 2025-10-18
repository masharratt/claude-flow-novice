# Redis Coordination Skill

## Metadata
```yaml
name: redis-coordination
description: Advanced Redis-based agent coordination and communication
version: 1.1
complexity: advanced
allowed-tools:
  - Redis
  - SQLite
  - Bash
  - TypeScript
constraints:
  - Low-latency communication
  - Persistent state management
  - Distributed consensus
```

## Overview
Redis Coordination is a sophisticated communication and state management skill for multi-agent systems, enabling real-time, fault-tolerant interactions across distributed environments.

## 1. When to Use

### Topology Selection
- **Mesh Network (2-7 agents)**:
  - Peer-to-peer communication
  - Low-complexity tasks
  - Direct channel subscriptions

- **Hierarchical Network (8+ agents)**:
  - Centralized coordination
  - Complex, multi-stage workflows
  - Coordinator-mediated communication

### Decision Criteria
✅ Use Redis Coordination when:
- Task requires real-time agent interactions
- Agents need persistent state tracking
- Work involves multiple independent/dependent steps
- Fault tolerance is critical
- Low-latency communication is required

❌ Avoid when:
- Single-agent, linear tasks
- Extremely low-compute environments
- No persistent storage needed

## 2. Channel Naming Convention

### Fundamental Patterns
```bash
# Swarm-level coordination
swarm:{swarm_id}:coordination

# Agent-specific channels
agent:{agent_id}:feedback
agent:{agent_id}:status

# Task-specific channels
task:{task_id}:progress
task:{task_id}:results
```

### Advanced Namespacing
```bash
# Complex task routing
swarm:{project}:{phase}:{task_type}:coordination
```

## 3. Timeout & Resilience Handling

### Timeout Template
```bash
# Basic timeout pattern
timeout 300 redis-cli --csv blpop "channel:name" 0

# Advanced timeout with fallback
function redis_robust_pop() {
  local channel="$1"
  local timeout="${2:-300}"
  local fallback_action="${3:-continue}"

  result=$(timeout "$timeout" redis-cli --csv blpop "$channel" 0)

  if [ $? -ne 0 ]; then
    echo "TIMEOUT: Channel $channel unresponsive"
    case "$fallback_action" in
      "continue") return 0 ;;
      "retry") redis_robust_pop "$channel" "$timeout" ;;
      "abort") exit 1 ;;
    esac
  fi
}
```

## 4. Consensus & Validation

### Confidence Thresholds
- MVP Mode: Gate ≥0.65, Consensus ≥0.85
- Standard Mode: Gate ≥0.75, Consensus ≥0.90
- Enterprise Mode: Gate ≥0.85, Consensus ≥0.95

### Validation Workflow
1. Publish coordination message
2. Collect agent responses
3. Calculate consensus
4. Decide: Continue/Retry/Abort

## 5. Best Practices

### Performance Optimization
- Use `LPUSH`/`RPOP` for queues
- Implement short TTLs
- Minimize payload size
- Use pipeline for batch operations

### Security Considerations
- Use Redis ACLs
- Encrypt sensitive payloads
- Validate all incoming messages
- Implement rate limiting

## 6. Error Handling

### Common Failure Modes
- Network interruption
- Redis connection loss
- Timeout scenarios
- Partial task completion

### Recommended Mitigation
```bash
# Resilient Redis interaction
function safe_redis_publish() {
  local channel="$1"
  local message="$2"

  max_retries=3
  retry_delay=1

  for ((i=1; i<=max_retries; i++)); do
    redis-cli PUBLISH "$channel" "$message"
    if [ $? -eq 0 ]; then
      return 0
    fi

    echo "Publish attempt $i failed. Retrying in $retry_delay seconds..."
    sleep "$retry_delay"
    retry_delay=$((retry_delay * 2))
  done

  echo "Fatal: Unable to publish message after $max_retries attempts"
  return 1
}
```

## 7. Monitoring & Metrics

### Key Performance Indicators
- Message latency
- Successful publish rate
- Consensus achievement time
- Error rate

### Recommended Logging
```json
{
  "timestamp": "2025-10-18T12:34:56Z",
  "swarm_id": "skills-sprint-1.1",
  "event_type": "coordination",
  "status": "success",
  "latency_ms": 42,
  "consensus_score": 0.92
}
```

## Resources
- Redis Documentation
- Distributed Systems Design Patterns
- High Performance Redis Techniques

---

✅ Skill Status: Active
📅 Last Updated: 2025-10-18
🔬 Complexity Level: Advanced