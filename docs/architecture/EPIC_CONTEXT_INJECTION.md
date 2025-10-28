# Epic Context Injection for CLI Agents

## Overview

Epic context injection provides CLI-spawned agents with rich, structured context about the epic, phase, and success criteria they're working within. This ensures agents produce specific, targeted implementations instead of generic solutions.

## Architecture

```
Coordinator
    |
    v
Orchestrator (orchestrate-cfn-loop.sh)
    |
    |--> Store epic context in Redis
    |    - swarm:{task-id}:epic-context
    |    - swarm:{task-id}:phase-context
    |    - swarm:{task-id}:success-criteria
    |
    |--> Spawn agents via CLI
    |
    v
CLI Spawner (cfn-spawn)
    |
    |--> Load context from Redis
    |
    v
Agent Executor (agent-executor.ts)
    |
    |--> Build system prompt with context
    |    (cli-agent-context.ts)
    |
    v
Agent receives comprehensive prompt with:
    - CLAUDE.md (project rules)
    - Agent markdown template
    - Epic context (formatted)
    - Phase context (formatted)
    - Success criteria (formatted)
```

## Redis Key Structure

### Epic Context
**Key:** `swarm:{task-id}:epic-context`
**TTL:** 7 days (604800 seconds)
**Format:** JSON

```json
{
  "epicName": "React Portal Integration",
  "epicGoal": "Build web portal for real-time agent monitoring",
  "currentPhase": "Phase 1 - Backend API & WebSocket Foundation",
  "inScope": [
    "REST API endpoints for agent management",
    "WebSocket events for real-time updates",
    "Integration with existing Redis coordination"
  ],
  "outOfScope": [
    "Frontend React components",
    "User authentication",
    "Production deployment"
  ],
  "references": [
    "planning/portal-improvements/phase-0/backend-api-audit.md",
    "docs/WEB_PORTAL_HANDOFF.md"
  ]
}
```

### Phase Context
**Key:** `swarm:{task-id}:phase-context`
**TTL:** 7 days
**Format:** JSON

```json
{
  "phaseName": "Phase 1 - Backend API & WebSocket Foundation",
  "phaseNumber": 1,
  "deliverables": [
    "11 REST endpoints (GET/POST/DELETE for agents/interventions/decisions)",
    "WebSocket event emitters (agent-update, message, decision-point)",
    "Integration tests for all endpoints"
  ],
  "dependencies": [
    "Redis coordination skill (existing)",
    "scripts/simple-portal-server.cjs (existing)"
  ]
}
```

### Success Criteria
**Key:** `swarm:{task-id}:success-criteria`
**TTL:** 7 days
**Format:** JSON

```json
{
  "acceptanceCriteria": [
    "All 11 REST endpoints implemented and tested",
    "WebSocket events emit on agent state changes",
    "Integration with existing Redis coordination verified",
    "Backward compatibility maintained with existing scripts"
  ],
  "gateThreshold": 0.75,
  "consensusThreshold": 0.90,
  "qualityGates": {
    "testCoverage": 80,
    "securityScore": 0.90
  },
  "definitionOfDone": [
    "Code reviewed and approved",
    "All tests passing",
    "Documentation updated"
  ]
}
```

## Usage

### 1. From Orchestrator (Bash)

```bash
# Pass context as JSON strings when invoking orchestrator
./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh \
  --task-id "portal-phase-1" \
  --mode standard \
  --loop3-agents "backend-dev,devops" \
  --loop2-agents "reviewer,tester" \
  --product-owner "product-owner" \
  --epic-context '{
    "epicName": "React Portal Integration",
    "epicGoal": "Build web portal for real-time agent monitoring",
    "currentPhase": "Phase 1 - Backend API",
    "inScope": ["REST endpoints", "WebSocket events"],
    "outOfScope": ["Frontend components", "Auth"],
    "references": ["docs/WEB_PORTAL_HANDOFF.md"]
  }' \
  --phase-context '{
    "phaseName": "Phase 1 - Backend API & WebSocket Foundation",
    "phaseNumber": 1,
    "deliverables": ["11 REST endpoints", "WebSocket events"]
  }' \
  --success-criteria '{
    "acceptanceCriteria": ["All endpoints implemented", "Tests passing"],
    "gateThreshold": 0.75,
    "consensusThreshold": 0.90
  }'
```

### 2. From TypeScript/Node.js (Coordinator Agent)

```typescript
import { storeEpicContext, storePhaseContext, storeSuccessCriteria } from './cfn-context.js';

const taskId = 'portal-phase-1';

// Store epic context
await storeEpicContext(taskId, {
  epicName: 'React Portal Integration',
  epicGoal: 'Build web portal for real-time agent monitoring',
  currentPhase: 'Phase 1 - Backend API & WebSocket Foundation',
  inScope: [
    'REST API endpoints for agent management',
    'WebSocket events for real-time updates'
  ],
  outOfScope: [
    'Frontend React components',
    'User authentication'
  ],
  references: [
    'planning/portal-improvements/phase-0/backend-api-audit.md',
    'docs/WEB_PORTAL_HANDOFF.md'
  ]
});

// Store phase context
await storePhaseContext(taskId, {
  phaseName: 'Phase 1 - Backend API & WebSocket Foundation',
  phaseNumber: 1,
  deliverables: [
    '11 REST endpoints',
    'WebSocket event emitters',
    'Integration tests'
  ]
});

// Store success criteria
await storeSuccessCriteria(taskId, {
  acceptanceCriteria: [
    'All 11 REST endpoints implemented and tested',
    'WebSocket events emit on agent state changes'
  ],
  gateThreshold: 0.75,
  consensusThreshold: 0.90,
  qualityGates: {
    testCoverage: 80,
    securityScore: 0.90
  }
});

// Then invoke orchestrator
const { execSync } = require('child_process');
execSync(`
  ./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh \
    --task-id "${taskId}" \
    --mode standard \
    --loop3-agents "backend-dev,devops" \
    --loop2-agents "reviewer,tester" \
    --product-owner "product-owner"
`, { stdio: 'inherit' });
```

### 3. Direct Redis Storage (Manual Testing)

```bash
# Store epic context directly
redis-cli setex "swarm:test-task:epic-context" 604800 '{
  "epicName": "Test Epic",
  "epicGoal": "Test goal",
  "inScope": ["Item 1", "Item 2"],
  "references": ["docs/test.md"]
}'

# Verify storage
redis-cli get "swarm:test-task:epic-context"

# Spawn agent with this context
npx cfn-spawn agent backend-dev --task-id test-task
```

## Agent System Prompt Format

When agents receive context, their system prompt includes:

```markdown
# Project Rules (CLAUDE.md)
[Full CLAUDE.md content]

---

# Agent Definition: backend-dev
[Agent markdown template]

---

## Epic Context

**Epic:** React Portal Integration

**Goal:**
Build web portal for real-time agent monitoring

**Current Phase:** Phase 1 - Backend API & WebSocket Foundation

**In Scope:**
- REST API endpoints for agent management
- WebSocket events for real-time updates
- Integration with existing Redis coordination

**Out of Scope:**
- Frontend React components
- User authentication
- Production deployment

**References:**
- planning/portal-improvements/phase-0/backend-api-audit.md
- docs/WEB_PORTAL_HANDOFF.md

---

## Current Phase

**Phase:** Phase 1 - Backend API & WebSocket Foundation
**Phase Number:** 1

**Deliverables:**
- 11 REST endpoints (GET/POST/DELETE for agents/interventions/decisions)
- WebSocket event emitters (agent-update, message, decision-point)
- Integration tests for all endpoints

**Dependencies:**
- Redis coordination skill (existing)
- scripts/simple-portal-server.cjs (existing)

---

## Success Criteria

**Acceptance Criteria:**
- All 11 REST endpoints implemented and tested
- WebSocket events emit on agent state changes
- Integration with existing Redis coordination verified
- Backward compatibility maintained with existing scripts

**Quality Gates:**
- Gate Threshold (Loop 3): 75%
- Consensus Threshold (Loop 2): 90%

**Quality Metrics:**
- Test Coverage: 80%
- Security Score: 90%

**Definition of Done:**
- [ ] Code reviewed and approved
- [ ] All tests passing
- [ ] Documentation updated

---

## Execution Instructions

You are executing as a CLI-spawned agent with full project context.
Follow the agent definition, project rules, and success criteria exactly.

**Remember:**
- Respect scope boundaries (in-scope vs out-of-scope)
- Meet acceptance criteria and quality gates
- Follow CFN Loop protocol if task-id is provided
- Report confidence score when complete
```

## Benefits

1. **Specific Implementations**: Agents know exactly what to build
2. **Scope Enforcement**: Clear in-scope/out-of-scope boundaries
3. **Quality Gates**: Agents understand success criteria
4. **Context Preservation**: Full epic context across iterations
5. **Reference Tracking**: Agents know which documents to reference

## Implementation Files

- **cfn-context.ts** (`/mnt/c/Users/masha/Documents/claude-flow-novice/src/cli/cfn-context.ts`)
  - Epic context interfaces
  - Redis load/store functions
  - Formatting utilities

- **cli-agent-context.ts** (`/mnt/c/Users/masha/Documents/claude-flow-novice/src/cli/cli-agent-context.ts`)
  - System prompt builder
  - Context loader from env vars
  - Markdown formatting

- **agent-spawn.ts** (`/mnt/c/Users/masha/Documents/claude-flow-novice/src/cli/agent-spawn.ts`)
  - Loads context from Redis
  - Passes to agent via env vars

- **orchestrate-cfn-loop.sh** (`/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/redis-coordination/orchestrate-cfn-loop.sh`)
  - Accepts epic context parameters
  - Stores in Redis before spawning agents

## Testing

### Unit Test Example

```typescript
// tests/cfn-context.test.ts
import { storeEpicContext, loadEpicContext } from '../src/cli/cfn-context.js';

describe('Epic Context Storage', () => {
  it('should store and retrieve epic context', async () => {
    const taskId = 'test-task-123';
    const context = {
      epicName: 'Test Epic',
      epicGoal: 'Test goal',
      inScope: ['Item 1', 'Item 2']
    };

    await storeEpicContext(taskId, context);
    const retrieved = await loadEpicContext(taskId);

    expect(retrieved).toEqual(context);
  });
});
```

### Integration Test Example

```bash
# Test full flow
TASK_ID="test-$(date +%s)"

# Store context
redis-cli setex "swarm:${TASK_ID}:epic-context" 604800 '{
  "epicName": "Test Epic",
  "epicGoal": "Verify context injection",
  "inScope": ["Test item"]
}'

# Spawn agent
npx cfn-spawn agent backend-dev --task-id "$TASK_ID"

# Agent should receive context in system prompt
# Verify by checking agent output
```

## Troubleshooting

### Context Not Loading

**Problem:** Agent doesn't receive epic context

**Solutions:**
1. Verify Redis is running: `redis-cli ping`
2. Check Redis key exists: `redis-cli get "swarm:{task-id}:epic-context"`
3. Verify TTL hasn't expired: `redis-cli ttl "swarm:{task-id}:epic-context"`
4. Check agent logs for context loading messages

### JSON Parsing Errors

**Problem:** Invalid JSON in Redis

**Solutions:**
1. Validate JSON before storing: `echo "$JSON" | jq .`
2. Escape special characters properly
3. Use `storeEpicContext()` function instead of direct Redis commands

### Agent Ignores Context

**Problem:** Agent produces generic implementation despite context

**Solutions:**
1. Verify system prompt includes formatted context
2. Check agent markdown template emphasizes context adherence
3. Increase gate/consensus thresholds to enforce quality
4. Add specific acceptance criteria mentioning deliverables

## Future Enhancements

1. **Context Versioning**: Track changes to epic context over iterations
2. **Context Inheritance**: Child tasks inherit parent epic context
3. **Context Validation**: Schema validation for stored context
4. **Context Analytics**: Track which context fields improve agent quality
5. **Web Portal Integration**: View/edit epic context via web UI
