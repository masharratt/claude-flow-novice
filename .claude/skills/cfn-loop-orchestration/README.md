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

## Monitoring Capabilities

### Monitoring Script: `monitor-execution.sh`

#### Key Features
- Real-time Progress Tracking
- Performance Metrics Collection
- Error Detection
- Flexible Monitoring Configuration

#### Basic Usage
```bash
./monitor-execution.sh --task-id <unique_task_id>
```

#### Metrics Tracked
- Iteration Progression
- Agent Completion Signals
- Gate Check Results
- Consensus Validation
- Execution Performance

[Rest of the previous README content remains the same]