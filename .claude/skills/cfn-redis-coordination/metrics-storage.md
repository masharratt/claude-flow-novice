# CFN Loop Metrics Storage Strategy

## Redis Key Patterns

### Task-Level Metrics
- `swarm:{task_id}:metrics:metadata`
- `swarm:{task_id}:metrics:iteration`
- `swarm:{task_id}:metrics:agent`
- `swarm:{task_id}:metrics:consensus`

### Iteration-Specific Keys
- `swarm:{task_id}:iteration:{iteration_number}:duration`
- `swarm:{task_id}:iteration:{iteration_number}:gate_pass_rate`

### Agent-Level Keys
- `swarm:{task_id}:agent:{agent_id}:latency`
- `swarm:{task_id}:agent:{agent_id}:timeouts`

### Consensus Keys
- `swarm:{task_id}:consensus:loop3:confidence`
- `swarm:{task_id}:consensus:loop2:score`

## Storage Mechanisms
- Hash (HSET): Detailed metrics
- List (LPUSH): Time-series events
- Sorted Set (ZADD): Ranked metrics

## Retention Policy
- Default: 30 days
- Can be configured via environment variable
- Automatic pruning after task completion