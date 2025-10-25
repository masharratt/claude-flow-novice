# Priority Queue Wake-Up Mechanism

## Design Overview

### Motivation
Replace traditional LPUSH/BLPOP with ZADD/BZPOPMIN to enable priority-ordered wake-ups across distributed agent swarms.

### Priority Scoring Algorithm

#### Score Calculation
```
SCORE = TIMESTAMP + (PRIORITY * PRIORITY_MULTIPLIER)

Where:
- TIMESTAMP: Unix epoch seconds
- PRIORITY: Assigned agent/task priority level
- PRIORITY_MULTIPLIER: 1,000,000 (ensures timestamp remains primary sorting factor)
```

### Priority Levels

| Level    | Range   | Example Agents                      |
|----------|---------|-------------------------------------|
| Critical | 0-10    | Product Owner, System Coordinators  |
| High     | 11-30   | Loop 2 Validators                   |
| Medium   | 31-60   | Loop 3 Implementers                 |
| Low      | 61-100  | Background Tasks, Monitoring Agents |

### Redis Command Translations

#### Old Method (FIFO)
```bash
# LPUSH: Adds to end of list
redis-cli lpush "swarm:{task}:{agent}:wake" "$WAKE_MSG"
# BLPOP: Blocks and removes from start of list
redis-cli blpop "swarm:{task}:{agent}:wake" 0
```

#### New Method (Priority Queue)
```bash
# ZADD: Adds to sorted set with score
redis-cli zadd "swarm:{task}:wake-queue" $SCORE "$WAKE_MSG"
# BZPOPMIN: Blocks and removes lowest-score item
redis-cli bzpopmin "swarm:{task}:wake-queue" 0
```

### Configuration Flag
```json
{
  "features": {
    "enablePriorityWake": {
      "default": false,
      "description": "Enable priority-based wake mechanism",
      "version": "4.0.0"
    }
  }
}
```

## Migration Strategy

1. Dual Support Phase
   - Maintain both LPUSH and ZADD mechanisms
   - Gradual rollout with feature flag
   - Monitor performance and compatibility

2. Transition Steps
   - Update Redis Coordination skill
   - Modify waiting mode invocation scripts
   - Add compatibility layer
   - Implement feature flag checks

3. Rollback Capabilities
   - Preserve original LPUSH mechanism
   - Configurable fallback options