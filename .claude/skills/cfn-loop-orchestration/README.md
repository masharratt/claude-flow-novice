# CFN Loop Orchestration Skill

Modular skill for orchestrating Complete Fail Never (CFN) Loop workflows with clean separation from Redis coordination primitives.

## Quick Start

```bash
# Execute a CFN Loop
./.claude/skills/cfn-loop-orchestration/orchestrate.sh \
  --task-id "my-task-001" \
  --mode standard \
  --loop3-agents "backend-dev,researcher,architect" \
  --loop2-agents "reviewer,tester,security" \
  --product-owner "product-owner" \
  --epic-context '{"epicGoal":"Build auth system","deliverables":["auth.js","tests.js"]}' \
  --max-iterations 10
```

## Architecture

This skill implements the CFN Loop workflow through modular components:

### Main Orchestrator
- **orchestrate.sh**: Main coordinator script that manages the entire CFN Loop lifecycle

### Helper Scripts
- **gate-check.sh**: Validates Loop 3 self-assessment against gate threshold
- **consensus.sh**: Collects and validates Loop 2 consensus scores
- **iteration-manager.sh**: Manages iteration cycles with feedback injection
- **deliverable-verifier.sh**: Verifies expected deliverables were created
- **timeout-calculator.sh**: Calculates phase-specific timeouts

## CFN Loop Flow

```
1. Store Context (Redis)
   ↓
2. Loop 3: Spawn Implementation Agents
   ↓
3. Verify Deliverables
   ├─ FAIL → Iterate Loop 3 (skip gate/Loop 2)
   └─ PASS → Continue
   ↓
4. Gate Check
   ├─ FAIL → Iterate Loop 3 (skip Loop 2)
   └─ PASS → Signal Loop 2
   ↓
5. Loop 2: Spawn Validation Agents
   ↓
6. Consensus Check
   ├─ FAIL → Iterate All Agents
   └─ PASS → Continue
   ↓
7. Product Owner Decision
   ├─ PROCEED → Success (exit 0)
   ├─ ITERATE → Next Iteration
   └─ ABORT → Failure (exit 1)
```

## Dependencies

This skill depends on:
- **redis-coordination**: Core Redis primitives (BLPOP, context storage, wake/report)
- **product-owner-decision**: Strategic decision execution
- **agent-output-processing**: Structured output parsing

## Testing

Run the comprehensive test suite:

```bash
./.claude/skills/cfn-loop-orchestration/test-cfn-orchestration.sh
```

Test coverage:
- Gate check pass/fail scenarios
- Consensus check pass/fail scenarios
- Deliverable verification (exists/missing)
- Timeout calculation (phase-specific)
- Iteration management (wake agents)
- Parameter validation
- Metadata validation

## Configuration

### Mode-Specific Thresholds

| Mode | Gate | Consensus | Max Iterations |
|------|------|-----------|----------------|
| MVP | 0.70 | 0.80 | 5 |
| Standard | 0.75 | 0.90 | 10 |
| Enterprise | 0.75 | 0.95 | 15 |

### Phase-Specific Timeouts

| Phase | Timeout | Use Case |
|-------|---------|----------|
| phase-1 | 15 min | Backend work |
| phase-2 | 60 min | React components |
| phase-3 | 60 min | Advanced components |
| phase-4 | 30 min | Testing/integration |
| default | 60 min | Unknown phases |

## Output Format

Success (exit 0):
```json
{
  "status": "success",
  "iterations_completed": 2,
  "final_decision": "PROCEED",
  "loop3_confidence": 0.92,
  "loop2_consensus": 0.94,
  "deliverables_verified": true,
  "execution_time_seconds": 1847
}
```

Failure (exit 1):
```json
{
  "status": "failed",
  "iterations_completed": 10,
  "final_decision": "ITERATE",
  "loop3_confidence": 0.68,
  "loop2_consensus": 0.72,
  "deliverables_verified": false,
  "execution_time_seconds": 3421
}
```

## Migration from Monolithic Orchestrator

This skill replaces `.claude/skills/redis-coordination/orchestrate-cfn-loop.sh` by:

1. **Extracting CFN-specific logic** into dedicated orchestrate.sh
2. **Delegating Redis operations** to redis-coordination skill
3. **Modularizing helpers** into standalone, testable scripts
4. **Simplifying maintenance** through clear interfaces

### Backward Compatibility

Existing slash commands (`/cfn-loop`, `/cfn-loop-single`, `/cfn-loop-epic`) will be updated to call this skill with no breaking changes.

## Error Handling

### Critical Failures
- Redis unavailable → Exit immediately with error
- Agent spawn failure → Retry with exponential backoff
- Timeout exceeded → Log state, graceful shutdown

### Recoverable Failures
- Gate check failure → Iterate Loop 3
- Consensus failure → Iterate all agents
- Missing deliverables → Force iteration with feedback

## Performance

- Average execution: 15-45 minutes (phase-dependent)
- Zero-token waiting: Redis BLPOP between iterations
- Agent spawn time: 5-15 seconds per agent
- Context operations: <100ms per Redis operation

## Design Principles

1. **Separation of Concerns**: CFN logic separate from Redis primitives
2. **Modular Helpers**: Each helper script has single responsibility
3. **Clean Interfaces**: Standard parameter structures across helpers
4. **Testability**: Comprehensive test suite for all components
5. **Reusability**: Helpers can be used in other workflow types

## Future Enhancements

- [ ] Containerization of orchestrator
- [ ] CI/CD integration for test suite
- [ ] Performance profiling and optimization
- [ ] Additional workflow modes (experimental, research)
- [ ] Enhanced feedback aggregation strategies
- [ ] Multi-task parallel orchestration

## License

MIT License - See project root for details

## Maintainer

Claude Flow Novice Team
Last Updated: 2025-10-23
Version: 1.0.0
