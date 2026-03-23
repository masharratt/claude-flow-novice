# Swarm Coordination Templates

## Initialization Strategy
```yaml
swarm_initialization:
  topology:
    2-7_agents: "mesh"
    8+_agents: "hierarchical"

  strategies:
    - balanced (predictable workflows)
    - adaptive (dynamic requirements)

  configuration:
    - maxAgents: match actual agent count
    - redis_channel: unique per swarm
    - persistence: phase-scoped
```

## Agent Spawning Protocol
```javascript
async function spawnSwarm(objective, agentTypes) {
  // Single message, all agents
  const agents = agentTypes.map(type =>
    Task(type, `
      - Specific deliverables
      - Coordination requirements
      - Self-validation (0.75+ confidence)
      - Post-edit hook compliance
    `, type)
  );

  // Track agents via SwarmMemory
  const swarmState = {
    objective,
    agents: agents.map(a => a.id),
    confidence: [],
    dependencies: []
  };
}
```

## Progress Tracking
```typescript
const trackingConfig = {
  metrics: {
    update_frequency: '5 minutes',
    confidence_threshold: 0.75,
    aggregation_method: 'weighted_average'
  },

  redis_key_pattern:
    'swarm:{swarmId}:{agentId}:{metric}',

  ttl: {
    active_phase: 3600,     // 1 hour
    completed_phase: 86400, // 24 hours
    archived: 604800        // 7 days
  }
};
```

## Consensus Validation
```javascript
async function validateConsensus(agents) {
  const confidenceScores = agents.map(a => a.confidence);

  return {
    overall_confidence: weightedAverage(confidenceScores),
    passed: confidenceScores.every(score => score >= 0.75),
    detailed_results: confidenceScores
  };
}
```

## Tool Usage Guidelines
```markdown
### Recommended Tools
- SlashCommand: Coordination commands
- Bash: CLI executions
- Task: Specialized agent spawning
- Redis: State tracking
- SQLite: Persistent memory

### Anti-Patterns
❌ Multiple message spawning
❌ Generic agent roles
❌ Vague task descriptions
❌ Skipping post-edit hooks
```

## Quality Assurance Checklist
```markdown
✅ Swarm initialized
✅ Agents spawned in single message
✅ Specific agent instructions
✅ Signal ACK protocol
✅ SwarmMemory configured
✅ Confidence tracking (≥0.75)
✅ Consensus validation (≥0.90)
✅ SQLite lifecycle hooks
✅ Post-edit hooks run
```