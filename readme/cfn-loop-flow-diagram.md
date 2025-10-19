# CFN Loop Flow Diagram (v2)

## Orchestration Flow Overview

```mermaid
graph TD
    A[Coordinator Starts] --> B[Initialize Task]
    B --> C{Cost Savings Mode?}
    C -->|Yes| D[CLI Spawning: cost-savings-cfn-loop-coordinator]
    C -->|No| E[Task Tool: cfn-loop-coordinator]
    
    D --> F[Spawn Loop 3 Agents]
    E --> F
    
    F --> G[Loop 3 Agents Work]
    G --> H[Agents Report Confidence]
    
    H --> I{Gate Threshold Met?}
    I -->|No| J[Enter Waiting Mode]
    J --> K[Coordinator Wakes Agents]
    K --> G
    
    I -->|Yes| L[Signal Loop 2 Validators]
    L --> M[Loop 2 Validators Review]
    M --> N[Validators Report Consensus]
    
    N --> O{Consensus Reached?}
    O -->|No| P[Retry Iteration]
    P --> G
    
    O -->|Yes| Q[Task Complete]
    Q --> R[Product Owner Notified]
```

## V2 Key Differences from V1

### Coordination Primitives
- **V1:** Polling-based coordination
- **V2:** Zero-token BLPOP waiting mode

### Agent Synchronization
- **V1:** Manual task signaling
- **V2:** Explicit Redis-based dependency management

### Iteration Management
- **V1:** Linear progression
- **V2:** Dynamic, context-aware iteration with adaptive thresholds

## Waiting Mode Protocol

```mermaid
sequenceDiagram
    participant A as Agent
    participant C as Coordinator
    
    A->>C: Complete Work
    A->>C: Report Confidence
    A->>C: Enter Waiting Mode
    C->>A: Wake Agent (if needed)
    A->>C: Continue Work
```

## Cost-Savings Mode Workflow

```mermaid
graph LR
    A[COST_SAVINGS_MODE=yes] --> B[Use CLI Spawning]
    B --> C[cost-savings-cfn-loop-coordinator]
    C --> D[Lower Overhead]
    D --> E[Sequential Agent Spawning OK]
```

## Best Practices

1. Use `orchestrate-cfn-loop.sh` for all multi-agent workflows
2. Implement comprehensive error handling
3. Validate consensus thresholds
4. Use parallel spawning for coordinator-based workflows

## References
- Redis Coordination Skill: `.claude/skills/redis-coordination/SKILL.md`
- CFN Loop Validation Skill: `.claude/skills/cfn-loop-validation/SKILL.md`
