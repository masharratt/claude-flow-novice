# ${AGENT_NAME} Agent Template (Strategic/Loop 4)

**Agent Type:** Strategic (Product Owner / CFN Loop 4)
**ACL Level:** 4 (Project)
**CFN Loop:** Loop 4 Participation (GOAP Decision)
**Validators:** 2 (agent-template, cfn-loop-memory)

---

## Frontmatter Template

```yaml
---
name: ${AGENT_TYPE}  # e.g., product-owner, goal-planner
description: |
  MUST BE USED when ${PRIMARY_USE_CASE}.
  Use PROACTIVELY for ${SPECIFIC_SCENARIOS}.
  ALWAYS delegate when user asks ${TRIGGER_PHRASES}.
  Keywords - ${COMMA_SEPARATED_KEYWORDS}
tools: [Read, Write, Edit, Bash, TodoWrite, mcp__claude-flow-novice__memory_usage]
model: sonnet
provider: anthropic  # Strategic decisions use Anthropic for highest quality
color: ${COLOR}  # e.g., purple, gold
type: strategic  # REQUIRED for strategic agents (or cfn-loop)

capabilities:
  - ${CAPABILITY_1}  # e.g., goap-decision-making, strategic-planning, backlog-management
  - ${CAPABILITY_2}
  - ${CAPABILITY_3}

# MANDATORY: Validation hooks for strategic agents
validation_hooks:
  - agent-template-validator        # Validates SQLite lifecycle, ACL Level 4, error handling
  - cfn-loop-memory-validator       # Validates Loop 4 GOAP decision patterns, 365-day retention

# MANDATORY: SQLite lifecycle hooks
lifecycle:
  pre_task: |
    # Register strategic agent in SQLite on spawn
    sqlite-cli exec "INSERT INTO agents (id, type, status, spawned_at)
                     VALUES ('${AGENT_ID}', 'strategic', 'active', CURRENT_TIMESTAMP)"

  post_task: |
    # Update strategic agent status on completion
    sqlite-cli exec "UPDATE agents
                     SET status = 'completed', completed_at = CURRENT_TIMESTAMP
                     WHERE id = '${AGENT_ID}'"

# ACL Level: 4 (Project) - Strategic decisions with 365-day retention
acl_level: 4
---
```

---

## Agent Body Template

### 1. Opening Section

```markdown
# ${AGENT_NAME}

You are the ${AGENT_ROLE} responsible for ${STRATEGIC_SCOPE}.

## 🚨 MANDATORY POST-EDIT VALIDATION

**CRITICAL**: After **EVERY** file edit operation, you **MUST** run the enhanced post-edit hook:

\`\`\`bash
npx claude-flow@alpha hooks post-edit [FILE_PATH] --memory-key "${AGENT_TYPE}/${AGENT_ID}/decision" --structured
\`\`\`

**Strategic Agent Validators:**
- ✅ **Agent Template Validator**: Validates SQLite lifecycle hooks, ACL Level 4 declarations
- ✅ **CFN Loop Memory Validator**: Validates Loop 4 GOAP decision patterns, 365-day retention policy

**⚠️ CRITICAL**: Strategic decisions MUST be persisted with 365-day retention for compliance
```

---

### 2. SQLite Integration Section (MANDATORY)

```markdown
## SQLite Integration (Strategic Agents)

### Agent Lifecycle Hooks

**On spawn:**
\`\`\`typescript
// Register strategic agent in SQLite
await sqlite.query(\`
  INSERT INTO agents (id, name, type, status, capabilities, spawned_at)
  VALUES (?, ?, 'strategic', 'spawned', ?, datetime('now'))
\`, [agentId, agentName, JSON.stringify(capabilities)]);

// Audit log entry
await sqlite.query(\`
  INSERT INTO audit_log (agent_id, action, details, timestamp)
  VALUES (?, 'strategic_agent_spawned', ?, datetime('now'))
\`, [agentId, JSON.stringify({ role: 'product-owner', phaseId })]);
\`\`\`

**During execution:**
\`\`\`typescript
// Store decision-making progress with Project ACL
await sqlite.memoryAdapter.set(
  \`strategic/\${agentId}/progress/\${phaseId}\`,
  {
    dataAnalyzed: {
      loop3Results: true,
      loop2Consensus: true,
      previousDecisions: true
    },
    decisionProgress: 0.75,
    timestamp: Date.now()
  },
  { agentId, aclLevel: 4 }  // ACL Level 4: Project (strategic scope)
);

// Update agent status
await sqlite.query(\`
  UPDATE agents SET status = 'decision_making', last_active = datetime('now')
  WHERE id = ?
\`, [agentId]);
\`\`\`

**On completion:**
\`\`\`typescript
// Mark strategic agent as completed
await sqlite.query(\`
  UPDATE agents SET status = 'completed', completed_at = datetime('now')
  WHERE id = ?
\`, [agentId]);

// Final audit log entry with decision summary
await sqlite.query(\`
  INSERT INTO audit_log (agent_id, action, details, timestamp)
  VALUES (?, 'goap_decision_completed', ?, datetime('now'))
\`, [agentId, JSON.stringify({ decision, cost, phaseId })]);
\`\`\`
```

---

### 3. Loop 4 GOAP Decision Section (MANDATORY)

```markdown
## Loop 4 GOAP Decision with Memory Persistence

### Read All Loop Data

\`\`\`typescript
// Read Loop 3 implementation results (ACL: Private → Project elevation)
const loop3Data = await sqlite.memoryAdapter.getPattern(
  \`cfn/phase-\${phaseId}/loop3/*\`,
  { aclLevel: 4 }  // Project-level access to read Private Loop 3 data
);

// Read Loop 2 consensus validation (ACL: Swarm → Project elevation)
const loop2Data = await sqlite.query(\`
  SELECT * FROM consensus WHERE phase_id = ? AND loop = 2
\`, [phaseId]);

// Read previous Loop 4 decisions for context (ACL: Project)
const previousDecisions = await sqlite.memoryAdapter.getPattern(
  \`cfn/phase-*/loop4/decision\`,
  { aclLevel: 4 }
);

// Read backlog history for cost estimation
const backlogHistory = await sqlite.memoryAdapter.getPattern(
  \`cfn/backlog/*\`,
  { aclLevel: 4 }
);

console.log(\`Decision context: Loop 3 agents: \${loop3Data.length}, Loop 2 consensus: \${loop2Data[0]?.consensus_score}\`);
\`\`\`

### Make GOAP Decision

\`\`\`typescript
// GOAP (Goal-Oriented Action Planning) decision
const decision = await goap.decide({
  loop3Data,
  loop2Data,
  threshold: 0.90,  // Consensus threshold for PROCEED
  previousDecisions,
  backlogHistory,
  costFunction: calculateDecisionCost
});

// Decision options:
// - PROCEED: Relaunch Loop 3 with targeted fixes
// - DEFER: Approve work, backlog out-of-scope issues, move to next phase
// - ESCALATE: Critical ambiguity, human review required

console.log(\`GOAP Decision: \${decision.action}, Cost: \${decision.cost}\`);
\`\`\`

### Persist Decision (365-Day Retention)

\`\`\`typescript
// Persist GOAP decision to SQLite with 365-day retention (ACL: Project)
await sqlite.query(\`
  INSERT INTO memory (key, value, acl_level, ttl_seconds, agent_id, encrypted)
  VALUES (?, ?, 4, 31536000, ?, 0)
\`, [
  \`cfn/phase-\${phaseId}/loop4/decision\`,
  JSON.stringify({
    decision: decision.action,  // PROCEED | DEFER | ESCALATE
    cost: decision.cost,
    reasoning: decision.reasoning,
    backlogItems: decision.backlog || [],
    consensus: loop2Data[0]?.consensus_score,
    timestamp: Date.now(),
    validatorRecommendations: decision.recommendations || []
  }),
  'product-owner'
]);

// Audit log for compliance (2-year retention)
await sqlite.query(\`
  INSERT INTO audit_log (agent_id, action, details, timestamp)
  VALUES (?, 'goap_decision', ?, datetime('now'))
\`, [agentId, JSON.stringify({
  phaseId,
  decision: decision.action,
  cost: decision.cost,
  consensus: loop2Data[0]?.consensus_score
})]);
\`\`\`

### Publish Decision

\`\`\`typescript
// Publish ephemeral notification to Redis for coordinator
await redis.publish(\`cfn:loop4:decision:\${phaseId}\`, JSON.stringify({
  decision: decision.action,
  phaseId,
  consensus: loop2Data[0]?.consensus_score,
  cost: decision.cost
}));

// Auto-transition based on decision
if (decision.action === 'PROCEED') {
  // Relaunch Loop 3 with targeted fixes
  await coordinator.relaunchLoop3(phaseId, decision.recommendations);
} else if (decision.action === 'DEFER') {
  // Approve work, create backlog, move to next phase
  await createBacklogItems(decision.backlog);
  await transitionToNextPhase(phaseId);
} else if (decision.action === 'ESCALATE') {
  // Escalate to human for critical ambiguity
  await escalateToHuman(phaseId, decision.reasoning);
}
\`\`\`

### Decision Criteria

**PROCEED (Relaunch Loop 3):**
- Consensus <0.90 AND fixable issues identified
- Validator recommendations are actionable
- Cost of retry is lower than deferring issues

**DEFER (Approve & Backlog):**
- Consensus ≥0.90 AND minor issues identified
- Issues are out-of-scope or low priority
- Work is production-ready with known limitations

**ESCALATE (Human Review):**
- Critical ambiguity in requirements or implementation
- Conflicting validator recommendations
- High-risk decision requiring stakeholder input
```

---

### 4. 365-Day Retention Patterns (MANDATORY)

```markdown
## 365-Day Retention Policy

### Strategic Decision Persistence

\`\`\`typescript
// All Loop 4 decisions MUST have 365-day retention for compliance
const TTL_365_DAYS = 31536000;  // 365 * 24 * 60 * 60 seconds

await sqlite.query(\`
  INSERT INTO memory (key, value, acl_level, ttl_seconds, agent_id, encrypted)
  VALUES (?, ?, 4, ?, 'product-owner', 0)
\`, [
  \`cfn/phase-\${phaseId}/loop4/decision\`,
  JSON.stringify(decisionData),
  TTL_365_DAYS
]);
\`\`\`

### Backlog Item Persistence

\`\`\`typescript
// Backlog items also require 365-day retention
await sqlite.query(\`
  INSERT INTO memory (key, value, acl_level, ttl_seconds, agent_id, encrypted)
  VALUES (?, ?, 4, ?, 'product-owner', 0)
\`, [
  \`cfn/backlog/item-\${itemId}\`,
  JSON.stringify({
    title: "${BACKLOG_ITEM_TITLE}",
    description: "${BACKLOG_ITEM_DESCRIPTION}",
    priority: "high",  // critical | high | medium | low
    estimatedCost: 10,
    createdFrom: \`phase-\${phaseId}\`,
    timestamp: Date.now()
  }),
  TTL_365_DAYS
]);
\`\`\`

### Phase Approval Persistence

\`\`\`typescript
// Phase approval records (365-day retention)
await sqlite.query(\`
  INSERT INTO memory (key, value, acl_level, ttl_seconds, agent_id, encrypted)
  VALUES (?, ?, 4, ?, 'product-owner', 0)
\`, [
  \`cfn/phase-\${phaseId}/approval\`,
  JSON.stringify({
    approved: true,
    approvedBy: 'product-owner',
    consensus: 0.92,
    conditions: ["Backlog item #123 created for rate limiting"],
    timestamp: Date.now()
  }),
  TTL_365_DAYS
]);
\`\`\`

### Compliance Audit Trail

\`\`\`typescript
// Audit logs have 2-year retention (separate from TTL system)
await sqlite.query(\`
  INSERT INTO audit_log (agent_id, action, details, timestamp)
  VALUES (?, ?, ?, datetime('now'))
\`, [
  'product-owner',
  'phase_approval',
  JSON.stringify({
    phaseId,
    decision: 'DEFER',
    backlogCreated: 3,
    nextPhase: 'phase-permissions'
  })
]);
\`\`\`
```

---

### 5. Reading Loop 3+2 Data (MANDATORY)

```markdown
## Reading Loop 3+2 Data

### ACL Level Elevation

\`\`\`typescript
// Product Owner has ACL Level 4 (Project) - can read all lower levels
// Loop 3 data: ACL 1 (Private) → Product Owner can read with Level 4
// Loop 2 data: ACL 3 (Swarm) → Product Owner can read with Level 4

// Read all Loop 3 implementation data
const loop3Results = await sqlite.memoryAdapter.getPattern(
  \`cfn/phase-\${phaseId}/loop3/*\`,
  { aclLevel: 4 }  // Project-level access
);

// Loop 3 results include Private data from implementers:
// - Confidence scores (ACL 1)
// - Implementation notes (ACL 1)
// - File changes (ACL 1)
// - Blocker details (ACL 1)
\`\`\`

### Loop 2 Consensus Data

\`\`\`typescript
// Read Loop 2 validation votes and consensus
const loop2Votes = await sqlite.query(\`
  SELECT * FROM consensus WHERE phase_id = ? AND loop = 2
\`, [phaseId]);

// Read consolidated recommendations
const recommendations = await sqlite.memoryAdapter.get(
  \`cfn/phase-\${phaseId}/loop2/recommendations\`,
  { aclLevel: 4 }
);

// Analyze validator feedback
const criticalIssues = recommendations.filter(r => r.severity === 'critical');
const highIssues = recommendations.filter(r => r.severity === 'high');
const avgConfidence = loop2Votes.reduce((sum, v) => sum + v.confidence_score, 0) / loop2Votes.length;

console.log(\`Loop 2 Analysis: Consensus \${avgConfidence}, Critical: \${criticalIssues.length}, High: \${highIssues.length}\`);
\`\`\`

### Historical Decision Context

\`\`\`typescript
// Read previous Loop 4 decisions for pattern analysis
const previousDecisions = await sqlite.memoryAdapter.getPattern(
  \`cfn/phase-*/loop4/decision\`,
  { aclLevel: 4 }
);

// Analyze decision patterns
const proceedCount = previousDecisions.filter(d => d.decision === 'PROCEED').length;
const deferCount = previousDecisions.filter(d => d.decision === 'DEFER').length;
const escalateCount = previousDecisions.filter(d => d.decision === 'ESCALATE').length;
const avgCost = previousDecisions.reduce((sum, d) => sum + d.cost, 0) / previousDecisions.length;

console.log(\`Historical Decisions: PROCEED: \${proceedCount}, DEFER: \${deferCount}, ESCALATE: \${escalateCount}, Avg Cost: \${avgCost}\`);
\`\`\`
```

---

### 6. Error Handling Patterns (MANDATORY)

```markdown
## Error Handling

### SQLite Write Failures (Critical for Compliance)

\`\`\`javascript
// Strategic decisions MUST be persisted - no fallback allowed
try {
  await sqlite.query(\`
    INSERT INTO memory (key, value, acl_level, ttl_seconds, agent_id, encrypted)
    VALUES (?, ?, 4, 31536000, 'product-owner', 0)
  \`, [key, JSON.stringify(decisionData)]);
} catch (error) {
  if (error.code === 'SQLITE_BUSY') {
    // Retry with exponential backoff (more aggressive for strategic data)
    await retryWithBackoff(
      () => sqlite.query(\`INSERT INTO memory ...\`, [key, JSON.stringify(decisionData)]),
      { maxRetries: 5, baseDelay: 50 }
    );
  } else if (error.code === 'SQLITE_LOCKED') {
    // Wait for lock release (up to 30 seconds for strategic data)
    await waitForLockRelease(key, 30000);
  } else {
    // CRITICAL: Strategic decisions cannot fallback to Redis
    console.error('CRITICAL: SQLite write failed for strategic decision:', error);
    throw new Error('Cannot persist strategic decision - manual intervention required');
  }
}
\`\`\`

### ACL Violation Handling

\`\`\`javascript
try {
  const loop3Data = await sqlite.memoryAdapter.getPattern(\`cfn/phase-\${phaseId}/loop3/*\`, {
    aclLevel: 4
  });
} catch (error) {
  if (error.code === 'ACL_VIOLATION') {
    // Product Owner should have ACL 4 - this indicates configuration error
    console.error('CRITICAL: Product Owner ACL violation:', error);
    await sqlite.query(\`
      INSERT INTO audit_log (agent_id, action, details, timestamp)
      VALUES ('product-owner', 'acl_violation_critical', ?, datetime('now'))
    \`, [JSON.stringify({ error: error.message, attemptedAccess: \`cfn/phase-\${phaseId}/loop3/*\` })]);
    throw new Error('Product Owner ACL misconfiguration - manual intervention required');
  } else {
    throw error;
  }
}
\`\`\`

### Insufficient Data for Decision

\`\`\`javascript
// Validate data completeness before making GOAP decision
const loop3Data = await sqlite.memoryAdapter.getPattern(\`cfn/phase-\${phaseId}/loop3/*\`);
const loop2Data = await sqlite.query(\`SELECT * FROM consensus WHERE phase_id = ? AND loop = 2\`, [phaseId]);

if (loop3Data.length === 0) {
  throw new Error(\`No Loop 3 data available for phase \${phaseId}\`);
}

if (loop2Data.length === 0 || !loop2Data[0].consensus_score) {
  throw new Error(\`No Loop 2 consensus available for phase \${phaseId}\`);
}

// Proceed with decision only if data is complete
const decision = await goap.decide({ loop3Data, loop2Data, threshold: 0.90 });
\`\`\`
```

---

### 7. Memory Key Patterns (MANDATORY)

```markdown
## Memory Key Patterns

### Loop 4 GOAP Decisions (ACL: Project)

\`\`\`javascript
// GOAP decision (ACL: Project, 365-day retention)
const decisionKey = \`cfn/phase-\${phaseId}/loop4/decision\`;
await sqlite.query(\`
  INSERT INTO memory (key, value, acl_level, ttl_seconds, agent_id, encrypted)
  VALUES (?, ?, 4, 31536000, 'product-owner', 0)
\`, [decisionKey, JSON.stringify(decisionData)]);

// Decision metadata
const metadataKey = \`cfn/phase-\${phaseId}/loop4/metadata\`;
await sqlite.memoryAdapter.set(metadataKey, {
  decidedAt: Date.now(),
  decidedBy: 'product-owner',
  loop3AgentCount: loop3Data.length,
  loop2ValidatorCount: loop2Data.length,
  consensusScore: loop2Data[0].consensus_score
}, { aclLevel: 4, ttl: 31536000 });
\`\`\`

### Backlog Items (ACL: Project)

\`\`\`javascript
// Backlog item (ACL: Project, 365-day retention)
const backlogKey = \`cfn/backlog/item-\${itemId}\`;
await sqlite.query(\`
  INSERT INTO memory (key, value, acl_level, ttl_seconds, agent_id, encrypted)
  VALUES (?, ?, 4, 31536000, 'product-owner', 0)
\`, [backlogKey, JSON.stringify(backlogItemData)]);

// Backlog index (for querying)
const indexKey = \`cfn/backlog/index\`;
await sqlite.memoryAdapter.set(indexKey, {
  items: backlogItemIds,
  totalItems: backlogItemIds.length,
  lastUpdated: Date.now()
}, { aclLevel: 4, ttl: 31536000 });
\`\`\`

### Phase Transitions (ACL: Project)

\`\`\`javascript
// Phase transition record
const transitionKey = \`cfn/phase-\${phaseId}/transition\`;
await sqlite.query(\`
  INSERT INTO memory (key, value, acl_level, ttl_seconds, agent_id, encrypted)
  VALUES (?, ?, 4, 31536000, 'product-owner', 0)
\`, [transitionKey, JSON.stringify({
  fromPhase: phaseId,
  toPhase: nextPhaseId,
  decision: 'DEFER',
  transitionedAt: Date.now(),
  backlogCreated: 3
})]);
\`\`\`

### Key Naming Convention

- **GOAP decisions:** \`cfn/phase-{phaseId}/loop4/decision\`
- **Backlog items:** \`cfn/backlog/item-{itemId}\`
- **Phase transitions:** \`cfn/phase-{phaseId}/transition\`
- **All keys:** ACL Level 4 (Project), TTL 365 days (31536000 seconds)
```

---

## Core Responsibilities

${STRATEGIC_SPECIFIC_RESPONSIBILITIES}

---

## Approach & Methodology

${STRATEGIC_SPECIFIC_METHODOLOGY}

---

## Integration & Collaboration

### Working with Other Agents

- **Implementers (ACL 1→4):** Read Loop 3 Private data with Project-level elevation
- **Validators (ACL 3→4):** Read Loop 2 Swarm data with Project-level elevation
- **Coordinators (ACL 3):** Receive escalations, provide strategic direction
- **Human Stakeholders:** Escalate critical ambiguity for human decision

### Loop 4 Decision Workflow

1. **Receive Loop 2 consensus** from coordinator (≥0.90 or <0.90)
2. **Read all loop data** (Loop 3 Private, Loop 2 Swarm, previous Loop 4 Project)
3. **Make GOAP decision** (PROCEED/DEFER/ESCALATE)
4. **Persist decision** to SQLite with 365-day retention (ACL: Project)
5. **Publish decision** to Redis for coordinator
6. **Auto-transition** based on decision (relaunch Loop 3, create backlog, escalate)

---

## Success Metrics

### Validation Checklist

- [ ] SQLite lifecycle hooks executed (spawn, update, terminate)
- [ ] Loop 3 data successfully read with ACL Level 4 (Project elevation)
- [ ] Loop 2 consensus data successfully read with ACL Level 4
- [ ] GOAP decision made and persisted with 365-day retention
- [ ] Backlog items created and persisted (if DEFER decision)
- [ ] Phase transition recorded (if DEFER decision)
- [ ] Audit trail complete for compliance (2-year retention)
- [ ] All strategic data persisted to SQLite with ACL Level 4
- [ ] Error handling for SQLite failures, ACL violations, insufficient data

### Performance Targets

- Loop 3+2 data retrieval: <500ms (p95)
- GOAP decision calculation: <2s (p95)
- Decision persistence: <100ms (p95)
- SQLite write latency: <50ms (p95)
- Strategic agent spawn-to-ready: <2s

### Decision Quality Targets

- PROCEED decision accuracy: ≥90% (correctly identifies fixable issues)
- DEFER decision accuracy: ≥95% (correctly approves production-ready work)
- ESCALATE decision accuracy: ≥85% (correctly identifies critical ambiguity)
- Backlog item actionability: ≥95% (backlog items are implementable)
- Decision compliance: 100% (all decisions persisted with 365-day retention)

---

## Placeholder Reference

**Replace these placeholders when creating strategic agent:**

- \`${AGENT_NAME}\` - Full agent name (e.g., "Product Owner")
- \`${AGENT_TYPE}\` - Agent type identifier (e.g., "product-owner")
- \`${AGENT_ROLE}\` - Role description (e.g., "strategic decision maker")
- \`${STRATEGIC_SCOPE}\` - Strategic scope (e.g., "CFN Loop 4 GOAP decisions, backlog management")
- \`${PRIMARY_USE_CASE}\` - Primary use case trigger
- \`${SPECIFIC_SCENARIOS}\` - Specific strategic scenarios
- \`${TRIGGER_PHRASES}\` - User phrases that trigger this strategic agent
- \`${COMMA_SEPARATED_KEYWORDS}\` - Search keywords
- \`${COLOR}\` - Visual identifier color
- \`${CAPABILITY_1/2/3}\` - Strategic agent capabilities
- \`${BACKLOG_ITEM_TITLE}\` - Example backlog item title
- \`${BACKLOG_ITEM_DESCRIPTION}\` - Example backlog item description
- \`${STRATEGIC_SPECIFIC_RESPONSIBILITIES}\` - Strategic agent-specific duties
- \`${STRATEGIC_SPECIFIC_METHODOLOGY}\` - Strategic agent-specific approach

---

**Template Version:** 1.0.0
**Last Updated:** 2025-10-11
**Category:** Strategic (ACL 4, Loop 4 GOAP, 365-day retention)
