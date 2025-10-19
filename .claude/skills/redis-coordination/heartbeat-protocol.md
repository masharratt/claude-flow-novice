# Heartbeat Protocol Specification

## Overview
The heartbeat protocol provides a mechanism for detecting hung or unresponsive agents in distributed agent swarms using Redis as a coordination mechanism.

## Key Design Components

### 1. Heartbeat Key Pattern
```
swarm:{task_id}:{agent_id}:heartbeat
```

### 2. Heartbeat Message Structure
```json
{
    "timestamp": 1760898665,
    "status": "working|idle|error",
    "iteration": 2,
    "progress": 0.75,
    "agent_details": {
        "agent_id": "architect-5",
        "task_id": "redis-phase5-1760898665",
        "environment": {
            "cpu_usage": 0.65,
            "memory_usage": 0.42,
            "system_load": 0.3
        }
    }
}
```

### 3. Heartbeat Configuration
- **Update Frequency**: Every 30 seconds
- **Default TTL**: 60 seconds
- **Miss Threshold**: 2 consecutive missed heartbeats
- **Quorum Threshold**: 70% of agents must be responsive

### 4. Heartbeat Workflow
1. Agent periodically sends heartbeat via Redis SET
2. Orchestrator monitors heartbeats in background process
3. On missed heartbeats, trigger progressive recovery mechanisms

### 5. Recovery Stages
- **Stage 1 (Miss 1)**: Log warning, continue monitoring
- **Stage 2 (Miss 2)**:
  - Check if remaining agents meet quorum
  - Log to Dead Letter Queue (DLQ)
  - Attempt soft restart of agent
- **Stage 3 (Miss 3)**:
  - Hard restart agent
  - Potentially replace with standby agent

### 6. Implementation Pseudo-code
```bash
# Send Heartbeat
redis-cli set "swarm:${TASK_ID}:${AGENT_ID}:heartbeat" \
    "$(generate_heartbeat_payload)" \
    EX 60  # 60-second expiry

# Check Heartbeats
check_agent_heartbeats() {
    for agent in ${AGENTS[@]}; do
        heartbeat=$(redis-cli get "swarm:${TASK_ID}:${agent}:heartbeat")
        if [[ -z "$heartbeat" ]]; then
            handle_missed_heartbeat "$agent"
        fi
    done
}

handle_missed_heartbeat() {
    local agent="$1"
    local miss_count=$(get_miss_count "$agent")

    case "$miss_count" in
        1) log_warning "$agent missed first heartbeat" ;;
        2)
            log_dlq "$agent"
            attempt_soft_restart "$agent"
            check_quorum
            ;;
        3)
            hard_restart_agent "$agent"
            ;;
    esac
}
```

### 7. Monitoring and Logging
- Comprehensive logging to `/var/log/claude-flow/heartbeat.log`
- Prometheus metrics for heartbeat health
- Grafana dashboard tracking agent responsiveness

### 8. Security Considerations
- Cryptographically sign heartbeat messages
- Rate limit heartbeat submissions
- Validate heartbeat payload schema

## Integration Points
- Redis Coordination Skill
- CFN Loop Validation
- Agent Spawning Mechanism

## Test Coverage
- Unit tests for heartbeat generation
- Integration tests for recovery mechanisms
- Chaos testing (intentional agent hanging)