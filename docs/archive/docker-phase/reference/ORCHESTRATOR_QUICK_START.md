# CFN Loop Orchestrator - Quick Start Guide

## Build & Deploy

```bash
# Build TypeScript
cd .claude/skills/cfn-loop-orchestration
npm run build

# Run orchestrator CLI
node dist/cli/orchestrator-cli.js \
  --task-id my-task \
  --mode standard \
  --max-iterations 10
```

## Command Examples

### MVP Mode (Quick Testing)
```bash
node dist/cli/orchestrator-cli.js \
  --task-id test-mvp \
  --mode mvp \
  --max-iterations 5 \
  --loop3-agents "backend-dev,coder" \
  --loop2-agents "reviewer"
```

### Standard Mode (Production)
```bash
node dist/cli/orchestrator-cli.js \
  --task-id feature-auth \
  --mode standard \
  --max-iterations 10 \
  --loop3-agents "backend-dev,frontend-dev" \
  --loop2-agents "code-reviewer,security-specialist,tester" \
  --product-owner "cto-agent"
```

### Enterprise Mode (Critical Systems)
```bash
node dist/cli/orchestrator-cli.js \
  --task-id critical-system \
  --mode enterprise \
  --max-iterations 15 \
  --loop3-agents "arch-specialist,backend-dev,database-expert" \
  --loop2-agents "code-reviewer,security-specialist,tester,perf-analyzer" \
  --product-owner "vp-engineering"
```

## Execution Flow

### Phase 1: Loop 3 (Implementers)
1. Spawn implementer agents
2. Collect test results
3. Check gate (mode-specific threshold)
4. If fails → iterate, if passes → continue

### Phase 2: Loop 2 (Validators)
1. Spawn validator agents
2. Collect consensus scores
3. Validate consensus (mode-specific threshold)
4. If fails → iterate, if passes → continue

### Phase 3: Product Owner Decision
1. Consult Product Owner agent
2. Get decision: PROCEED | ITERATE | ABORT
3. Handle decision:
   - **PROCEED:** Task complete (exit 0)
   - **ITERATE:** Reset and start new iteration
   - **ABORT:** Exit immediately (exit 1)

## Exit Codes

| Code | Meaning | Next Action |
|------|---------|------------|
| 0 | PROCEED (success) | Task complete |
| 1 | ABORT/ITERATE max reached | Investigate failures |
| 130 | User interrupt (SIGINT) | Cleanup and retry |

## Mode Thresholds

| Mode | Gate Threshold | Consensus | Max Iterations |
|------|---|---|---|
| MVP | 70% | 80% | 5 |
| Standard | 95% | 90% | 10 |
| Enterprise | 98% | 95% | 15 |

## Output Format

```json
{
  "taskId": "my-task",
  "mode": "standard",
  "iteration": 3,
  "totalAgentsCompleted": 5,
  "totalAgentsFailed": 0,
  "decision": "PROCEED",
  "duration": 45000
}
```

## Integration with Scripts

### Via Bash
```bash
#!/bin/bash
NODE_PATH=/path/to/node

TASK_ID="my-task-$(date +%s)"
MODE="standard"
MAX_ITER=10

$NODE_PATH dist/cli/orchestrator-cli.js \
  --task-id "$TASK_ID" \
  --mode "$MODE" \
  --max-iterations "$MAX_ITER" || {
  echo "Orchestration failed"
  exit 1
}

echo "Orchestration succeeded"
```

### Via Docker
```dockerfile
FROM node:18-alpine
COPY .claude/skills/cfn-loop-orchestration /orchestrator
WORKDIR /orchestrator
RUN npm install && npm run build

ENTRYPOINT ["node", "dist/cli/orchestrator-cli.js"]
```

## Testing

### Run All Tests
```bash
npm test
```

### Run Orchestration Tests Only
```bash
npm test -- tests/orchestrate.test.ts
```

### Run E2E Tests
```bash
npm test -- tests/north-star-e2e.test.ts
```

## Debugging

### Enable Debug Logging
The orchestrator outputs detailed logs for each phase. Capture output:
```bash
node dist/cli/orchestrator-cli.js ... 2>&1 | tee orchestrator.log
```

### Check Phases in Output
Look for these markers in output:
- `Phase: Loop 3 (Implementers)` - Starting agent work
- `Gate Check: PASSED` - Agents passed quality gate
- `Phase: Loop 2 (Validators)` - Starting validation
- `Loop 2 Consensus:` - Validator agreement rate
- `Phase: Product Owner Decision` - Final decision
- `Product Owner Decision: PROCEED` - Success

### Common Issues

**Gate Failed (Loop 3)**
- Test pass rate below threshold
- Solution: Implement fixes and iterate

**Consensus Failed (Loop 2)**
- Validators lack confidence in implementation
- Solution: Address reviewer feedback and iterate

**Max Iterations Reached**
- Task not approved within iteration limit
- Solution: Review all feedback and escalate to team

## Performance Notes

- Orchestrator I/O: < 1ms per iteration (no external calls)
- Test simulation: < 10ms per agent
- Full mock execution: ~50ms per iteration
- Real execution: Depends on actual agent runtime

## Security

- All task IDs sanitized (alphanumeric, hyphens, underscores, colons)
- Agent IDs sanitized (alphanumeric, hyphens, underscores)
- No hardcoded secrets in CLI
- Configuration validated before execution
- Process signals handled gracefully (SIGINT/SIGTERM)

## Troubleshooting

### "Missing required parameter: --task-id"
Provide required parameters:
```bash
node dist/cli/orchestrator-cli.js \
  --task-id MY_TASK \
  --mode standard \
  --max-iterations 10
```

### "Invalid mode: ..."
Mode must be one of: `mvp`, `standard`, `enterprise`

### "Invalid max-iterations: ..."
Max iterations must be 1-100

### "Agent ID contains no valid characters"
Agent IDs must contain alphanumeric characters

## Getting Help

```bash
node dist/cli/orchestrator-cli.js --help
node dist/cli/orchestrator-cli.js --version
```

---

**Last Updated:** 2025-11-20
**Version:** 3.0.0
