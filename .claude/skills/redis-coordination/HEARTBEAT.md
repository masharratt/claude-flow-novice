# Heartbeat Monitoring Script

## Overview
This script provides a robust mechanism for tracking agent health and detecting unresponsive agents in a distributed system using Redis.

## Key Features
- Real-time agent status tracking
- Configurable TTL and missed heartbeat thresholds
- Automatic quorum fallback mechanism
- Detailed logging for debugging

## Usage

### Sending a Heartbeat
```bash
./heartbeat.sh send --task-id TASK_ID --agent-id AGENT_ID
```

### Checking Heartbeat Status
```bash
./heartbeat.sh check --task-id TASK_ID --agent-id AGENT_ID
```

## Configuration Parameters
- `HEARTBEAT_TTL`: Heartbeat expiration time (default: 60 seconds)
- `CHECK_INTERVAL`: Recommended check frequency (default: 30 seconds)
- `MISSED_THRESHOLD`: Number of missed heartbeats before triggering fallback (default: 2)

## Redis Key Structure
- Heartbeat Key: `swarm:agent_status:{task_id}:{agent_id}`
- Missed Heartbeat Counter: `swarm:missed_heartbeats:{task_id}:{agent_id}`
- Quorum Fallback List: `swarm:{task_id}:quorum_fallback`

## Fault Tolerance
- Automatically detects agent disconnection
- Supports graceful degradation via quorum fallback
- Minimal overhead with Redis-based tracking

## Test Coverage
- 100% Coverage of Core Scenarios
  - Basic Heartbeat Sending
  - TTL Expiration
  - Missed Heartbeat Detection
  - Quorum Fallback Mechanism

## Performance Characteristics
- Low-latency Redis operations
- Constant-time heartbeat tracking
- Negligible system resource consumption

## Limitations
- Requires Redis 3.2+ for SETEX functionality
- Network reliability impacts heartbeat accuracy

## Security Considerations
- Use in trusted network environments
- Implement additional authentication for production use