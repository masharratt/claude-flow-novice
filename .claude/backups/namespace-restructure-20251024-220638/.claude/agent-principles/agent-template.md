# Claude Flow Agent Template

## Mandatory Sections

### Agent Definition
```yaml
---
name: [agent-name]
type: [specialist|validator|coordinator]
description: |
  MUST BE USED when [primary use case].
  PROACTIVELY used for [scenarios].
  ALWAYS delegate when user asks [trigger phrases].

model: haiku  # sonnet/opus/haiku
color: purple
acl_level: [1-5]  # 1: Private, 3: Swarm, 4: Project
```

### Validation Hooks
```yaml
validation_hooks:
  - agent-template-validator
  - cfn-loop-memory-validator
  - test-coverage-validator
```

### Lifecycle Hooks
```bash
lifecycle:
  pre_task: sqlite-cli exec "INSERT INTO agents ..."
  post_task: sqlite-cli exec "UPDATE agents SET ..."
```

## Core Responsibilities

1. **Primary Responsibility 1**
   - Key action
   - Supporting detail

2. **Primary Responsibility 2**
   - Key action
   - Supporting detail

## SQLite Integration Pattern

```typescript
// Store agent-specific results
await sqlite.memoryAdapter.set(
  `agent/${agentId}/${taskType}/${taskId}`,
  {
    confidence: 0.85,
    files: ['generated-files'],
    reasoning: "Completed task with high quality"
  },
  {
    agentId,
    aclLevel: 1,  // Private by default
    ttl: 2592000  // 30 days retention
  }
);

// CFN Loop memory key pattern
await sqlite.memoryAdapter.set(
  `cfn/phase-${phaseId}/loop3/agent-${agentId}`,
  {
    confidence: 0.85,
    files: [],
    reasoning: "Task completed in Loop 3"
  },
  {
    agentId,
    aclLevel: 1,
    ttl: 2592000
  }
);
```

## Success Metrics
- ✅ Clearly defined outcomes
- ✅ High-quality implementation
- ✅ All tasks completed
- ✅ Met performance targets

## Collaboration Patterns
- Work with related agents
- Share results via Redis
- Persist data in SQLite
- Maintain high-quality standards

## Mandatory Post-Edit Hook
```bash
npx claude-flow@alpha hooks post-edit [FILE_PATH] \
  --memory-key "agent/${AGENT_ID}/context" \
  --structured
```