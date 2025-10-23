# Redis Context Storage Pattern for CFN V3

## 1. Context Structure (JSON Schema)

```json
{
  "swarm_context": {
    "task_id": "unique-task-identifier",
    "epic_goal": "High-level objective",
    "phase": {
      "current": "phase-2",
      "total_phases": 3
    },
    "agents": {
      "loop3": ["researcher", "backend-dev"],
      "loop2": ["reviewer", "architect"],
      "product_owner": "product-owner"
    },
    "deliverables": {
      "required": [
        "/path/to/file1.sh",
        "/path/to/file2.md"
      ],
      "completed": []
    },
    "success_criteria": {
      "gate_threshold": 0.75,
      "consensus_threshold": 0.90,
      "acceptance_criteria": []
    },
    "iteration": {
      "current": 1,
      "max_iterations": 10
    }
  }
}
```

## 2. Redis Key Naming Convention

### Base Keys
- `swarm:{task_id}:context` - Full swarm context
- `swarm:{task_id}:epic-context` - Epic-level details
- `swarm:{task_id}:phase-context` - Current phase specifics
- `swarm:{task_id}:agent:{agent_type}:context` - Agent-specific context

### Example Key Generation
```bash
# Store swarm context
redis-cli hmset "swarm:auth-system-v1:context" \
  task_id "auth-system-v1" \
  epic_goal "Implement JWT authentication" \
  current_phase "phase-2"

# Store phase-specific context
redis-cli hmset "swarm:auth-system-v1:phase-context" \
  phase_name "Backend Implementation" \
  deliverables "/src/auth/jwt.ts,/tests/jwt.test.ts"
```

## 3. Context Storage Flow

### Coordinator Workflow
```bash
# Coordinator extracts and stores initial context
./.claude/skills/redis-coordination/store-context.sh \
  --task-id "$TASK_ID" \
  --context-file "/tmp/epic-context.json" \
  --storage-level full
```

### Orchestrator Context Injection
```bash
# Retrieve and inject context for agent spawning
AGENT_CONTEXT=$(
  ./.claude/skills/redis-coordination/retrieve-context.sh \
    --task-id "$TASK_ID" \
    --agent-type "backend-dev" \
    --iteration 1
)

# Spawn agent with extracted context
npx cfn-spawn agent backend-dev \
  --task-id "$TASK_ID" \
  --context "$AGENT_CONTEXT"
```

## 4. Context Retrieval Methods

### Direct Redis Retrieval
```bash
# Retrieve full context
CONTEXT=$(redis-cli hgetall "swarm:task-id:context")

# Retrieve specific field
EPIC_GOAL=$(redis-cli hget "swarm:task-id:context" "epic_goal")
```

### Bash Retrieval Script
```bash
# Flexible context extraction
./.claude/skills/redis-coordination/extract-context.sh \
  --task-id "$TASK_ID" \
  --extract-type "deliverables" \
  --format "json"
```

## 5. Swarm Recovery Mechanism

### Crash Recovery Workflow
```bash
# Check if task context exists
if redis-cli exists "swarm:$TASK_ID:context"; then
  # Recover last known state
  LAST_ITERATION=$(redis-cli hget "swarm:$TASK_ID:context" "current_iteration")

  # Restart from last known good state
  ./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh \
    --task-id "$TASK_ID" \
    --resume-iteration "$LAST_ITERATION"
fi
```

## 6. Context Evolution Tracking

### Iteration Context Updates
```bash
# Update context after each iteration
redis-cli hmset "swarm:$TASK_ID:context" \
  current_iteration "$((ITERATION + 1))" \
  last_agent_confidence "0.85" \
  status "in_progress"
```

## 7. CLI vs Task Mode Context Injection

### CLI Mode (Recommended)
- Explicit context via orchestrator
- Zero-token waiting between iterations
- Automatic context inheritance

### Task Mode (Legacy)
- Manual context management
- Potential token overhead
- Less predictable context propagation

## Best Practices

1. Always use orchestrator for context management
2. Keep context JSON lightweight
3. Use Redis for stateless, ephemeral storage
4. Implement timeout and expiry for contexts
5. Validate context before agent spawning

## Security Considerations

- Never store sensitive credentials
- Use Redis ACL for context access control
- Implement context encryption for sensitive epics