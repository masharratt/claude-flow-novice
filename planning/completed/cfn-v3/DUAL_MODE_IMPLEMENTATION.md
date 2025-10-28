# Dual-Mode System Implementation: CLI and Task Modes

## Mode Comparison

| Feature | CLI Mode | Task Mode |
|---------|----------|-----------|
| Provider | Z.ai | Anthropic |
| Cost per 1M tokens | $0.50 | $3-15 |
| Cost Savings | 95-98% | Baseline |
| Agent Spawning | CLI-based | Task-based |
| Context Routing | Redis-injected | Direct |
| Swarm Recovery | Full support | Partial |
| Coordination | Orchestrator-driven | Main Chat-driven |

## Redis Context Flow Mechanism

```
                  ┌─────────────────┐
                  │   Redis Store   │
                  └────────┬────────┘
                           │
  ┌────────────────────────▼─────────────────────────┐
  │           Context Injection Pipeline            │
  │  1. Store epic context                          │
  │  2. Store phase-specific details                │
  │  3. Inject into agent spawn parameters          │
  │  4. Track agent progress                        │
  └────────────────────────────────────────────────┘

  Modes:
  - CLI: Orchestrator retrieves from Redis
  - Task: Main Chat reads directly
```

## CLI Mode Implementation (v2.5)

### Coordinator Flow
```bash
# Coordinator script pseudo-code
./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh \
  --task-id "$UNIQUE_TASK_ID" \
  --mode cli \
  --provider z.ai \
  --loop3-agents "researcher,backend-dev" \
  --context-source redis
```

### Key CLI Components
- Routing via `.claude/skills/redis-coordination/route-agent.sh`
- Provider selection in `npx cfn-spawn`
- Context injection from Redis

## Task Mode Implementation

### Coordinator Flow
```bash
# Main Chat spawns single coordinator
Task("cost-savings-coordinator", `
  Execute task using Anthropic provider
  Manage agent spawning via Task tool
`)
```

### Configuration Toggles

#### Slash Commands
```bash
# Enable custom routing
/custom-routing-activate

# Check current routing status
/switch-api status

# Disable custom routing
/custom-routing-disable
```

#### Config File
```json
{
  "routing_provider": "z.ai",
  "cost_optimization": true,
  "default_mode": "cli",
  "fallback_provider": "anthropic"
}
```

## Swarm Recovery Mechanism

1. Redis stores:
   - Task context
   - Agent states
   - Progress markers
   - Iteration details

2. Recovery Steps:
   - Read task ID from Redis
   - Retrieve last known state
   - Continue from interrupt point
   - Zero token cost during wait

## Migration Path

1. Update Coordination Skills
   - `.claude/skills/redis-coordination/route-agent.sh`
   - `.claude/skills/agent-spawning/spawn-cli-agent.sh`

2. Create Provider Selection Script
   - `./provider-selector.sh`
   - Handle Z.ai and Anthropic routing

3. Modify Orchestrator
   - Add `--provider` flag
   - Implement provider-specific logic

4. Update CLI Spawn Command
   ```bash
   npx claude-flow-novice swarm "Task" \
     --mode cli \
     --provider z.ai
   ```

## Success Criteria

- ✅ 95-98% cost reduction
- ✅ Seamless provider switching
- ✅ Full context preservation
- ✅ Zero-downtime agent coordination

## Edge Cases & Fallbacks

- If Z.ai unavailable: Auto-switch to Anthropic
- Timeout protection in provider selection
- Explicit error handling for routing failures

**Generated with Claude Code**