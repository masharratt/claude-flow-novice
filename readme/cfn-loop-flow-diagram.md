# CFN Loop Flow Diagram (v3)

## Orchestration Flow Overview

```mermaid
graph TD
    A[Coordinator Starts] --> B[Store Context in Redis]
    B --> C[Spawn Loop 3 Agents with Context]

    C --> D[Loop 3 Agents Work]
    D --> E[Agents Exit]
    E --> F[Collect Confidence Scores]

    F --> G{Gate Threshold Met?}
    G -->|No| H[Store Feedback in Redis]
    H --> I[Spawn Fresh Loop 3 Agents]
    I --> D

    G -->|Yes| J[Spawn Loop 2 Validators with Context]
    J --> K[Loop 2 Validators Review]
    K --> L[Validators Exit]
    L --> M[Collect Consensus Scores]

    M --> N{Consensus Reached?}
    N -->|No| O[Store Feedback in Redis]
    O --> I

    N -->|Yes| P[Spawn Product Owner]
    P --> Q[Product Owner Decision]
    Q --> R[Task Complete]
```

## V3 Key Differences from V2

### Agent Lifecycle
- **V2:** Stateful (agents enter waiting mode, woken for iterations)
- **V3:** Stateless (agents exit after work, fresh spawn per iteration)

### Context Management
- **V2:** Context passed during wake signal
- **V3:** Context stored in Redis, retrieved on spawn

### Coordination Primitives
- **V2:** BLPOP-based waiting mode (zero-token blocking)
- **V3:** Exit-based coordination (no blocking, fresh spawn)

### Iteration Management
- **V2:** Wake existing agents with feedback
- **V3:** Spawn fresh agents with feedback from Redis

## Stateless Agent Protocol (v3)

```mermaid
sequenceDiagram
    participant O as Orchestrator
    participant R as Redis
    participant A as Agent

    O->>R: Store Context + Feedback
    O->>A: Spawn with Context from Redis
    A->>A: Work
    A->>R: Store Confidence
    A->>A: Exit
    O->>R: Collect Confidence Scores

    Note over O: If iteration needed
    O->>R: Update Feedback
    O->>A: Spawn Fresh Agent
```

## Cost-Savings Mode Workflow

```mermaid
graph LR
    A[COST_SAVINGS_MODE=yes] --> B[Use CLI Spawning]
    B --> C[cost-savings-cfn-loop-coordinator]
    C --> D[Lower Overhead]
    D --> E[Sequential Agent Spawning OK]
```

## Redis Context Storage Steps (v3)

```mermaid
sequenceDiagram
    participant C as Coordinator
    participant R as Redis
    participant O as Orchestrator

    C->>R: HSET swarm:task_id:epic-context
    C->>R: HSET swarm:task_id:phase-context
    C->>R: HSET swarm:task_id:success-criteria
    C->>O: Invoke orchestrator
    O->>R: HGET swarm:task_id:epic-context
    O->>R: HGET swarm:task_id:phase-context
    Note over O: Spawn agents with retrieved context
```

## Best Practices

1. Use `.claude/skills/cfn-loop-orchestration/orchestrate.sh` for all multi-agent workflows
2. Store complete context in Redis before spawning agents
3. Use stateless agent spawning (exit after work)
4. Collect confidence using `collect-confidence-scores.sh`
5. Validate consensus thresholds

## References
- CFN Loop Orchestration: `.claude/skills/cfn-loop-orchestration/SKILL.md`
- Redis Coordination: `.claude/skills/redis-coordination/SKILL.md`
- CFN Loop Validation: `.claude/skills/cfn-loop-validation/SKILL.md`
