# Redis Coordination Patterns

## Communication Channels

### Standard Channel Formats
- `swarm:{swarmId}:*` - Swarm-level communication
- `agent:{agentId}:*` - Agent-specific channels
- `phase:{phaseId}:*` - CFN Loop phase coordination

### Message Types
- `start`: Task initialization
- `progress`: Ongoing work updates
- `complete`: Task completion
- `error`: Error reporting
- `consensus`: Decision-making signals
- `question`: Clarification requests

## Coordination Functions

### Signal Progress
```bash
redis-cli publish "swarm:${SWARM_ID}:${AGENT_ID}:progress" '{
  "status": "in_progress",
  "milestone": "Authentication module implementation",
  "confidence": 0.75,
  "eta_seconds": 600
}'
```

### Report Completion
```bash
redis-cli publish "swarm:${SWARM_ID}:${AGENT_ID}:complete" '{
  "agent": "'${AGENT_ID}'",
  "confidence": 0.85,
  "files_modified": ["src/auth.js", "src/auth.test.js"],
  "tests_written": 12,
  "coverage": { "line": 0.92, "branch": 0.88 }
}'
```

### Request Consensus
```bash
redis-cli publish "swarm:${SWARM_ID}:consensus" '{
  "type": "design_review",
  "question": "Authentication strategy?",
  "options": ["JWT", "Session", "OAuth"],
  "voting_timeout": 300
}'
```

## Best Practices
- Always use structured JSON
- Include timestamp in messages
- Provide confidence scores
- Signal progress regularly
- Handle connection failures gracefully