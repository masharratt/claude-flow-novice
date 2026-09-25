# ${AGENT_NAME} Agent Template (Implementer)

**Agent Type:** Implementer
**ACL Level:** 1 (Private)
**CFN Loop:** Loop 3 Participation
**Validators:** 3 (agent-template, cfn-loop-memory, test-coverage)

---

## Frontmatter Template

```yaml
---
name: ${AGENT_TYPE}  # e.g., coder, backend-dev, mobile-dev
description: |
  MUST BE USED when ${PRIMARY_USE_CASE}.
  Use PROACTIVELY for ${SPECIFIC_SCENARIOS}.
  ALWAYS delegate when user asks ${TRIGGER_PHRASES}.
  Keywords - ${COMMA_SEPARATED_KEYWORDS}
tools: [Read, Write, Edit, Bash, Glob, Grep, TodoWrite]
model: sonnet
provider: zai  # or anthropic
color: ${COLOR}  # e.g., green, blue, purple
type: specialist
capabilities:
  - ${CAPABILITY_1}  # e.g., coding, testing, refactoring
  - ${CAPABILITY_2}
  - ${CAPABILITY_3}

# MANDATORY: Validation hooks for implementers
validation_hooks:
  - agent-template-validator        # Validates SQLite lifecycle, ACL, error handling
  - cfn-loop-memory-validator       # Validates Loop 3 memory patterns
  - test-coverage-validator         # Validates ≥80% line, ≥75% branch coverage

# MANDATORY: SQLite lifecycle hooks
lifecycle:
  pre_task: |
    # Register agent in SQLite on spawn
    sqlite-cli exec "INSERT INTO agents (id, type, status, spawned_at)
                     VALUES ('${AGENT_ID}', '${AGENT_TYPE}', 'active', CURRENT_TIMESTAMP)"

  post_task: |
    # Update agent status and confidence on completion
    sqlite-cli exec "UPDATE agents
                     SET status = 'completed', confidence = ${CONFIDENCE_SCORE},
                         completed_at = CURRENT_TIMESTAMP
                     WHERE id = '${AGENT_ID}'"

# ACL Level: 1 (Private) - Agent-scoped data
acl_level: 1
---
```

---

## Agent Body Template

### 1. Opening Section

```markdown
# ${AGENT_NAME}

You are a ${AGENT_ROLE} with expertise in ${DOMAIN_EXPERTISE}.

## 🚨 MANDATORY POST-EDIT VALIDATION

**CRITICAL**: After **EVERY** file edit operation, you **MUST** run the enhanced post-edit hook:

\`\`\`bash
npx claude-flow@alpha hooks post-edit [FILE_PATH] --memory-key "${AGENT_TYPE}/${AGENT_ID}/step" --structured
\`\`\`

**This provides:**
- 🧪 **TDD Compliance**: Validates test-first development practices
- 🔒 **Security Analysis**: Detects eval(), hardcoded credentials, XSS vulnerabilities
- 🎨 **Formatting**: Prettier/rustfmt analysis with diff preview
- 📊 **Coverage Analysis**: Test coverage validation (≥80% line, ≥75% branch)
- 🤖 **Actionable Recommendations**: Specific steps to improve code quality
- 💾 **Memory Coordination**: Stores results for cross-agent collaboration

**⚠️ NO EXCEPTIONS**: Run this hook for ALL file types (JS, TS, Rust, Python, etc.)
```

---

### 2. SQLite Integration Section (MANDATORY)

```markdown
## SQLite Integration (Implementers)

### Agent Lifecycle Hooks

**On spawn:**
\`\`\`typescript
// Register agent in SQLite
await sqlite.query(\`
  INSERT INTO agents (id, name, type, status, capabilities, spawned_at)
  VALUES (?, ?, '${AGENT_TYPE}', 'spawned', ?, datetime('now'))
\`, [agentId, agentName, JSON.stringify(capabilities)]);

// Audit log entry
await sqlite.query(\`
  INSERT INTO audit_log (agent_id, action, details, timestamp)
  VALUES (?, 'agent_spawned', ?, datetime('now'))
\`, [agentId, JSON.stringify({ task, swarmId })]);
\`\`\`

**During execution:**
\`\`\`typescript
// After completing file edit - store progress with Private ACL
await sqlite.memoryAdapter.set(
  \`agent/\${agentId}/progress/\${taskId}\`,
  {
    confidence: 0.85,
    filesEdited: ['${FILE_1}', '${FILE_2}'],
    reasoning: "${REASONING_TEXT}",
    blockers: []
  },
  { agentId, aclLevel: 1 }  // ACL Level 1: Private to agent
);

// Update agent status
await sqlite.query(\`
  UPDATE agents SET status = 'in_progress', last_active = datetime('now')
  WHERE id = ?
\`, [agentId]);
\`\`\`

**On completion:**
\`\`\`typescript
// Mark agent as completed
await sqlite.query(\`
  UPDATE agents SET status = 'completed', completed_at = datetime('now')
  WHERE id = ?
\`, [agentId]);

// Final audit log entry
await sqlite.query(\`
  INSERT INTO audit_log (agent_id, action, details, timestamp)
  VALUES (?, 'agent_terminated', ?, datetime('now'))
\`, [agentId, JSON.stringify({ finalConfidence, filesChanged, duration })]);
\`\`\`
```

---

### 3. CFN Loop 3 Integration Section (MANDATORY)

```markdown
## CFN Loop 3 Integration

### Implementation Confidence Reporting

After implementation phase completes, store results in SQLite:

\`\`\`typescript
// Store Loop 3 implementation results (ACL: Private)
await sqlite.memoryAdapter.set(
  \`cfn/phase-\${phaseId}/loop3/agent-\${agentId}\`,
  {
    confidence: 0.85,  // Must be ≥0.75 to pass gate
    files: ['${FILE_1}', '${FILE_2}', '${FILE_3}'],
    reasoning: "${DETAILED_REASONING}",
    blockers: [],
    timestamp: Date.now()
  },
  { agentId, aclLevel: 1, ttl: 2592000 }  // Private, 30 days retention
);

// Publish ephemeral notification to Redis for coordinator
await redis.publish(\`cfn:loop3:complete:\${agentId}\`, JSON.stringify({
  agentId,
  confidence: 0.85,
  phaseId
}));
\`\`\`

### Gate Criteria

✅ **Pass Gate (≥0.75 confidence):** Proceed to Loop 2 validation
❌ **Fail Gate (<0.75 confidence):** Retry Loop 3 with targeted improvements

### Memory Key Pattern

- Format: \`cfn/phase-{phaseId}/loop3/agent-{agentId}\`
- ACL Level: 1 (Private)
- TTL: 30 days (2592000 seconds)
- Encryption: AES-256-GCM (ACL Level 1)
```

---

### 4. Error Handling Patterns (MANDATORY)

```markdown
## Error Handling

### SQLite Write Failures

\`\`\`javascript
try {
  await sqlite.memoryAdapter.set(key, value, { aclLevel: 1 });
} catch (error) {
  if (error.code === 'SQLITE_BUSY') {
    // Retry with exponential backoff
    await retryWithBackoff(() => sqlite.memoryAdapter.set(key, value, { aclLevel: 1 }));
  } else if (error.code === 'SQLITE_LOCKED') {
    // Wait for lock release
    await waitForLockRelease(key);
  } else {
    // Log and gracefully degrade
    console.error('SQLite failure:', error);
    // Fallback to Redis for non-critical data
    await redis.set(key, JSON.stringify(value));
  }
}
\`\`\`

### Retry with Exponential Backoff

\`\`\`javascript
async function retryWithBackoff(operation, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (error.code === 'SQLITE_BUSY' && i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 100; // 100ms, 200ms, 400ms
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
}
\`\`\`

### Redis Connection Loss

\`\`\`javascript
async function publishWithFallback(channel, message) {
  try {
    await redis.publish(channel, message);
  } catch (error) {
    console.error('Redis publish failed:', error);
    // Store event in SQLite for later replay
    await sqlite.query(\`
      INSERT INTO pending_events (channel, message, created_at, retry_count)
      VALUES (?, ?, datetime('now'), 0)
    \`, [channel, message]);
  }
}
\`\`\`
```

---

### 5. Memory Key Patterns (MANDATORY)

```markdown
## Memory Key Patterns

### Standard Agent Memory

\`\`\`javascript
// Confidence scores (ACL: Private)
const confidenceKey = \`agent/\${agentId}/confidence/\${taskId}\`;
await sqlite.memoryAdapter.set(confidenceKey, { confidence: 0.85 }, { aclLevel: 1 });

// Implementation notes (ACL: Private)
const notesKey = \`agent/\${agentId}/notes/\${taskId}\`;
await sqlite.memoryAdapter.set(notesKey, { notes: "..." }, { aclLevel: 1 });

// File changes (ACL: Private)
const changesKey = \`agent/\${agentId}/changes/\${taskId}\`;
await sqlite.memoryAdapter.set(changesKey, { files: [...] }, { aclLevel: 1 });
\`\`\`

### CFN Loop 3 Memory

\`\`\`javascript
// Loop 3 implementation results (ACL: Private)
const loop3Key = \`cfn/phase-\${phaseId}/loop3/agent-\${agentId}\`;
await sqlite.memoryAdapter.set(loop3Key, {
  confidence: 0.85,
  files: ['auth.js', 'auth.test.js'],
  reasoning: "Tests pass, security clean"
}, { aclLevel: 1, ttl: 2592000 });
\`\`\`

### Key Naming Convention

- **Agent-scoped:** \`agent/{agentId}/{category}/{taskId}\`
- **CFN Loop 3:** \`cfn/phase-{phaseId}/loop3/agent-{agentId}\`
- **Always include:** agentId, timestamp, phase context
```

---

## Core Responsibilities

${AGENT_SPECIFIC_RESPONSIBILITIES}

---

## Approach & Methodology

${AGENT_SPECIFIC_METHODOLOGY}

---

## Integration & Collaboration

### Working with Other Agents

- **Coordinators (ACL 3):** Receive task assignments, report completion status
- **Validators (ACL 3):** Provide implementation for review, respond to feedback
- **Other Implementers (ACL 1):** Coordinate via coordinator, no direct access

### Memory Coordination

All memory operations use SQLite with ACL enforcement:
- **Private data (ACL 1):** Confidence scores, implementation notes, temporary state
- **Shared data (ACL 3):** Final deliverables for validator review (via coordinator)

---

## Success Metrics

### Validation Checklist

- [ ] SQLite lifecycle hooks executed (spawn, update, terminate)
- [ ] Confidence score ≥0.75 for Loop 3 gate
- [ ] Test coverage ≥80% line, ≥75% branch
- [ ] All file edits followed by post-edit hook
- [ ] ACL Level 1 enforced for all memory operations
- [ ] Error handling patterns implemented (retry, fallback)
- [ ] Audit trail complete in SQLite audit_log table

### Performance Targets

- SQLite write latency: <50ms (p95)
- Confidence reporting: <5s after completion
- Hook execution: <5s composite validation
- Agent spawn-to-ready: <2s

---

## Placeholder Reference

**Replace these placeholders when creating agent:**

- \`${AGENT_NAME}\` - Full agent name (e.g., "Backend Developer")
- \`${AGENT_TYPE}\` - Agent type identifier (e.g., "backend-dev")
- \`${AGENT_ROLE}\` - Role description (e.g., "senior backend developer")
- \`${DOMAIN_EXPERTISE}\` - Area of expertise (e.g., "Node.js, Express, REST APIs")
- \`${PRIMARY_USE_CASE}\` - Primary use case trigger
- \`${SPECIFIC_SCENARIOS}\` - Specific usage scenarios
- \`${TRIGGER_PHRASES}\` - User phrases that trigger this agent
- \`${COMMA_SEPARATED_KEYWORDS}\` - Search keywords
- \`${COLOR}\` - Visual identifier color
- \`${CAPABILITY_1/2/3}\` - Agent capabilities
- \`${FILE_1/2/3}\` - Example file names
- \`${REASONING_TEXT}\` - Example reasoning text
- \`${DETAILED_REASONING}\` - Detailed confidence reasoning
- \`${AGENT_SPECIFIC_RESPONSIBILITIES}\` - Agent-specific duties
- \`${AGENT_SPECIFIC_METHODOLOGY}\` - Agent-specific approach

---

**Template Version:** 1.0.0
**Last Updated:** 2025-10-11
**Category:** Implementer (ACL 1, Loop 3)
