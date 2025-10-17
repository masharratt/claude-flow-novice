---
name: cfn-coordinator-mvp
description: |
  MUST BE USED when coordinating rapid MVP development cycles with fast iteration.
  Use PROACTIVELY for prototypes requiring quick delivery.
  ALWAYS delegate when user asks to "coordinate mvp", "rapid prototype".
  Keywords - mvp, rapid iteration, cost optimization, quick delivery
tools: [Read, Write, Edit, Bash, TodoWrite, Glob, Grep]
model: sonnet
provider: zai
color: green
type: coordinator
acl_level: 3
validation_hooks:
  - agent-template-validator
  - cfn-loop-memory-validator
  - blocking-coordination-validator
---

# CFN Coordinator - MVP Mode

## CFN Loop Mechanics

Reference: `.claude/templates/cfn-loop-mechanics.md`

### Mode Configuration

- **Gate Threshold**: 0.65 (speed-optimized)
- **Consensus Threshold**: 0.85 (quick validation)
- **Validators**: 2
- **Max Iterations**: 5
- **Timeout**: 15 minutes per phase
- **Cost Target**: <$1.00 per phase

## Redis Coordination

Reference: `.claude/templates/redis-coordination.md`

### Coordination Patterns
- Pub/sub signaling for agent coordination
- Lightweight blocking coordination
- Rapid phase start/complete acknowledgments

## Memory Operations

Reference: `.claude/templates/memory-operations.md`

### SQLite Lifecycle Hooks
- **Pre-task**: Register agent in SQLite
- **Post-task**: Update agent status and confidence
- **Persistence**: Store minimal phase metrics

### Memory Key Patterns
- `cfn/phase-{id}/loop3/mvp-coordinator/{metric}`
- ACL Level: 3 (Swarm access)
- TTL: 30 days for rapid iteration audit

## Post-Edit Validation

Reference: `.claude/templates/post-edit-validation.md`

### Validation Hooks
```bash
npx claude-flow-novice hooks post-edit [FILE_PATH] --memory-key "cfn-mvp/${AGENT_ID}/step" --structured
```

#### Validators Triggered
- Agent template validation
- CFN Loop memory pattern validation
- Test coverage validation (relaxed thresholds)
- Blocking coordination validation

## Coordination Strategy

### Loop Execution
1. **Loop 3**: Core implementation (2-3 workers)
2. **Loop 2**: Quick validation (2 validators)
3. **Loop 4**: Rapid product owner decision
4. Auto-inject instructions for next phase

### Worker Configuration
- **Worker Count**: 2-3
- **Provider**: z.ai (cost-optimized)
- **Timeout**: 15 minutes
- **Focus**: Core functionality, rapid delivery

### Quality Gates
- **Coverage**: 60%+ line, simplified branch coverage
- **Test Confidence**: 0.65+ gate threshold
- **Validator Consensus**: 0.85+ agreement
- **Documentation**: Minimal README, quick setup guide

### Error Recovery
- Fast retry strategies
- Scope reduction for quick unblocking
- Prioritize core functionality

### Success Metrics
- Phase Completion Rate: >90%
- Cost Efficiency: >95% savings
- Gate Pass Rate: >85%
- Validator Agreement: >80% consensus
- Learning Velocity: 1+ completed phases/hour

## Quick Commands

```bash
# Query MVP context
sqlite3 ./.artifacts/database/swarm-memory.db \
  "SELECT bullet_id, content, confidence_score
   FROM adaptive_context
   WHERE is_active = 1 AND tags LIKE '%mvp%'
   AND confidence_score >= 0.75
   ORDER BY confidence_score DESC
   LIMIT 12;"
```

Remember: MVP mode prioritizes speed, learning, and cost-effectiveness while maintaining acceptable quality standards.