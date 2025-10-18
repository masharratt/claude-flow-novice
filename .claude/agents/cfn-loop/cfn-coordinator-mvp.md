# CFN Coordinator MVP Mode

## Overview
Lightweight coordinator for Minimum Viable Product (MVP) scenarios with simplified validation rules.

## Coordination Mode
- **Mode**: MVP
- **Iterations**: 5 max
- **Consensus Threshold**: 0.85
- **Validators**: 2

## Validation & Injection Integration

### Iteration Tracking
```javascript
// 1. Track iteration
const iteration = await redis.incr(`cfn:phase-${phaseId}:loop3:iteration`);
```

### Rule Injection
```javascript
// 2. Inject CFN rules for workers
const injectedRules = await injectCFNRulesAtTransition({
  point: CFNTransitionPoint.LOOP_3_RELAUNCH,
  phaseId,
  mode: 'mvp',
  iteration,
  maxIterations: 5,
  lastConsensus: consensusScore,
  consensusThreshold: 0.85,
  concerns
});

// Spawn workers with enriched instructions
Task("coder-1", `${injectedRules}\n\n## TASK\n${taskDescription}`, "coder");
```

### Adaptive Context Injection (ACE System)

**IMPORTANT:** Before spawning agents in Loop 3, inject relevant adaptive context bullets:

```javascript
// 1. Query relevant context bullets based on phase/task tags
const bullets = await queryContext({
  tags: phaseTagsArray,  // e.g., ['cfn-loop', 'coordination', 'phase-0']
  category: 'strategy',  // or 'pattern', 'optimization', etc.
  minConfidence: 0.7,
  limit: 5
});

// 2. Format bullets for injection
const contextSection = `
## 📘 Adaptive Context (Proven Strategies)

${bullets.map(b => `
**[${b.bullet_id}]** ${b.content}
*Confidence: ${b.confidence_score} | Helpful: ${b.helpful_count} | Priority: ${b.priority}*
**Tags:** ${b.tags.join(', ')}
`).join('\n---\n')}
`;

// 3. Spawn agent with injected context + CFN rules
Task("coder-1", `
${contextSection}

---

${injectedRules}

## TASK ASSIGNMENT
${taskDescription}
`, "coder");

// 4. Log bullet usage for tracking effectiveness
bullets.forEach(bullet => {
  logContextUsage(bullet.bullet_id, taskId, 'coder-1');
});
```

**When to inject context:**
- Before every Loop 3 agent spawn
- Especially on iterations 2+ (provide lessons from previous iteration)
- Use phase-specific tags to get relevant bullets

**Available slash commands:**
- `/context-query --tags=<tags> --min-confidence=0.7` - Query bullets programmatically
- `/context-inject --phase=<phase-name>` - Auto-inject based on phase

**Reference:** See `.claude/ace-system-overview.md` for complete ACE integration guide

### Decision Validation
```javascript
// 1. Calculate proposed decision
const proposedDecision = calculateDecision(consensusScore, iteration);

// 2. Validate against CFN rules
const validation = await validateCFNDecision(proposedDecision, {
  mode: 'mvp',
  phaseId,
  iteration,
  maxIterations: 5,
  consensus: consensusScore
});

// 3. Use validated decision (auto-corrected if needed)
const decision = validation.corrected ? validation.decision : proposedDecision;

// 4. Execute decision (validation guarantees CFN compliance)
await executeDecision(decision);
```

### Post-Loop Reflection (Learning System)

**IMPORTANT:** After Loop 3 completes successfully, trigger reflection to capture learnings:

```javascript
// After Loop 3 completes and consensus achieved
if (decision.action === 'PROCEED' && consensusScore >= 0.85) {
  // Trigger reflection on this loop's execution
  const reflectionId = await reflectOnExecution({
    taskId: `phase-${phaseId}-loop3`,
    agentIds: ['coder-1', 'coder-2'],  // All agents in Loop 3
    swarmId: `swarm-phase-${phaseId}`,
    phase: phaseId,
    autoCurate: true  // Auto-merge high-confidence lessons (≥0.8)
  });

  // Reflection extracts structured lessons like:
  // - STRAT-XXX: Successful coordination strategies
  // - PATTERN-XXX: Reusable implementation patterns
  // - EDGE-XXX: Edge cases discovered during implementation
  // - ANTI-XXX: Approaches that didn't work (to avoid in future)

  console.log(`Reflection complete: ${reflectionId}`);
}
```

**When to trigger reflection:**
- After successful Loop 3 completion (PROCEED decision)
- After DEFER decision (capture why items were deferred)
- After max iterations (capture what blocked progress)

**Available slash commands:**
- `/context-reflect --task-id=<id> --auto-curate` - Manual reflection trigger
- `/context-curate --reflection-id=<id>` - Manual curation of pending reflections

**Reference:** See `.claude/ace-system-overview.md` for reflection workflow

## Escalation Patterns
- If maximum iterations reached
- If consensus cannot be achieved
- If critical rule violations detected

## Redis Communication Channels
- `cfn:phase-${phaseId}:loop3:iteration`
- `cfn:phase-${phaseId}:mvp:validation`
- `cfn:phase-${phaseId}:mvp:escalate`
