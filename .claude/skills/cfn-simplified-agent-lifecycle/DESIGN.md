# Simplified Agent Lifecycle Design

## Overview
Current CFN Loop agent lifecycle requires agents to enter a complex waiting mode after completing work. This design proposes a simplified re-spawning pattern that removes the waiting mode requirement.

## Current Lifecycle (Problematic)
1. Agent spawns
2. Agent completes work
3. Agent enters waiting mode via `invoke-waiting-mode.sh enter`
4. Coordinator wakes agent
5. Agent performs next iteration
6. Repeat steps 3-5

## Proposed Lifecycle (Simplified)
1. Agent spawns with iteration context
2. Agent completes work
3. Agent exits
4. Orchestrator re-spawns agent for next iteration if needed
   - Uses Redis to store iteration context
   - Passes iteration number as parameter

## Key Design Principles
- Agents have clean, straightforward exit paths
- No risk of agents getting stuck in waiting mode
- Context preservation via Redis
- Lower complexity in agent implementation

## Redis Context Preservation
```bash
# Redis key for iteration context
REDIS_KEY="swarm:${TASK_ID}:${AGENT_ID}:context"

# Store iteration context before agent exit
redis-cli hset "$REDIS_KEY" iteration "$CURRENT_ITERATION"
redis-cli hset "$REDIS_KEY" last_result "$AGENT_RESULT"
```

## Orchestrator Re-Spawn Logic
```bash
# Pseudo-code for orchestrator re-spawn
if consensus_not_reached && max_iterations_not_exceeded; then
    next_iteration=$((current_iteration + 1))

    # Re-spawn agent with previous context
    npx cfn-spawn agent "$AGENT_TYPE" \
        --task-id "$TASK_ID" \
        --iteration "$next_iteration" \
        --previous-context "$(redis-cli hgetall "$REDIS_KEY")"
fi
```

## Migration Strategy
1. Update orchestrator scripts
2. Modify agent templates
3. Update Redis coordination scripts
4. Add backward compatibility layer
5. Comprehensive test suite

## Trade-offs
### Advantages
- Simpler agent logic
- No waiting mode complexity
- Clean agent lifecycle
- Easier to debug and maintain

### Disadvantages
- Slight overhead in re-spawning
- Potential cold-start performance impact
- More complex orchestrator logic

## Cost Analysis
- Waiting Mode: Minimal token usage, potential blocking
- Re-Spawn Mode: Slightly higher token cost
  - Estimated 10-15% increase in agent lifecycle cost
  - Mitigated by cost-savings CLI spawning (95-98% savings)

## Backward Compatibility
- Optional flag to use old waiting mode
- Gradual migration path
- Comprehensive test coverage for both modes

## Open Questions
1. How to handle agent state across iterations?
2. Performance impact of repeated spawns?
3. Complexity of context preservation?

## Recommended Next Steps
1. Prototype implementation
2. Performance benchmarking
3. Comprehensive test suite
4. Gradual rollout strategy

## Validation Criteria
- ✅ Agents can complete work without waiting mode
- ✅ Orchestrator can re-spawn agents correctly
- ✅ Iteration context preserved
- ✅ Minimal performance overhead
- ✅ Backward compatibility maintained