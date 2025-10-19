# Claude Flow Novice - API Reference (v2)

## API Overview
Claude Flow Novice v2 introduces a skills-first, CLI-driven API with Redis coordination primitives.

## Deprecation Notice
⚠️ MCP Server API (v1) is DEPRECATED. Use CLI and skills-based approach.

## Core API Categories

### 1. CLI API (Recommended)
```bash
npx claude-flow-novice [command] [options]
```

#### Primary Commands
- `swarm`: Launch multi-agent workflows
- `skill`: Invoke specific skills
- `cfn-loop`: Execute CFN Loop iterations
- `coordination`: Manage agent synchronization

### 2. Skills API
Invoke skills via standardized bash scripts:
```bash
./.claude/skills/[skill-name]/[action].sh [options]
```

#### Supported Skills
1. Redis Coordination
2. Agent Spawning
3. CFN Loop Validation
4. Transparency Middleware
5. Event Bus
6. Fleet Manager
7. Web Portal Skills
8. ACE System
9. Hook Pipeline

### 3. Redis Coordination API

#### Waiting Mode Protocol
```bash
# Enter waiting mode
./.claude/skills/redis-coordination/invoke-waiting-mode.sh enter \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --context "iteration-context"

# Wake agent
./.claude/skills/redis-coordination/invoke-waiting-mode.sh wake \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --reason "improvement_needed" \
  --iteration 2

# Report agent status
./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --confidence 0.85

# Collect consensus
CONSENSUS=$(./.claude/skills/redis-coordination/invoke-waiting-mode.sh collect \
  --task-id "$TASK_ID" \
  --agent-ids "coder,reviewer,tester")
```

### 4. Orchestration API
```bash
./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh \
  --task-id "task-unique-id" \
  --mode standard \
  --loop3-agents "researcher,backend-dev" \
  --loop2-agents "reviewer,architect" \
  --max-iterations 10
```

### 5. Cost-Savings Mode
```bash
# CLI-based spawning (95-98% cost reduction)
npx claude-flow-novice swarm "Task Description" \
  --cost-savings \
  --skills redis-coordination,agent-spawning
```

## Error Handling & Validation

### Exit Codes
- `0`: Successful execution
- `1-10`: Skill-specific errors
- `11-20`: Coordination failures
- `21-30`: Configuration issues

### Consensus Validation
```bash
# Consensus check example
if (( $(echo "$CONSENSUS >= 0.90" | bc -l) )); then
  echo "✅ Consensus reached: $CONSENSUS"
  # Proceed with next steps
else
  echo "❌ Consensus failed: $CONSENSUS"
  # Trigger iteration or escalation
fi
```

## Performance Characteristics
- **Latency**: <50ms for agent coordination
- **Scalability**: 10+ parallel agents
- **Cost Efficiency**: 95-98% reduction in token usage

## Future API Expansion
- Enhanced machine learning integration
- Dynamic skill composition
- Advanced consensus algorithms

## Security Considerations
- Multi-layer enforcement
- Centralized orchestration
- Comprehensive test coverage

## Version
**Current API Version**: 2.2.0
**Last Updated**: 2025-10-19