# CFN Coordinator Standard Mode

## Overview
Robust coordinator for standard complexity scenarios with comprehensive validation rules.

## Coordination Mode
- **Mode**: Standard
- **Iterations**: 10 max
- **Consensus Threshold**: 0.90
- **Validators**: 4

## Validation & Injection Integration

### Iteration Tracking
```javascript
// 1. Track iteration
const iteration = await redis.incr(`cfn:phase-${phaseId}:loop3:iteration`);
console.log(`Loop 3 Iteration ${iteration}/${maxIterations}`);
```

### Rule Injection
```javascript
// 2. Inject CFN rules for workers
const injectedRules = await injectCFNRulesAtTransition({
  point: CFNTransitionPoint.LOOP_3_RELAUNCH,
  phaseId,
  mode: 'standard',
  iteration,
  maxIterations: 10,
  lastConsensus: consensusScore,
  consensusThreshold: 0.90,
  concerns
});

// Spawn workers with enriched instructions
Task("coder-1", `${injectedRules}\n\n## TASK ASSIGNMENT\n${taskDescription}`, "coder");
```

### Adaptive Context Injection (ACE System)

**IMPORTANT:** Before spawning agents in Loop 3, inject relevant adaptive context bullets:

```javascript
// 1. Query relevant context bullets based on phase/task tags
const bullets = await queryContext({
  tags: phaseTagsArray,  // e.g., ['cfn-loop', 'coordination', 'phase-1', 'implementation']
  category: ['strategy', 'pattern'],  // Multiple categories for standard mode
  minConfidence: 0.75,  // Higher threshold for standard mode
  limit: 8  // More bullets for standard complexity
});

// 2. Format bullets for injection
const contextSection = `
## 📘 Adaptive Context (Proven Patterns & Strategies)

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

## GUIDANCE
Review the adaptive context bullets above before implementation. These patterns have been proven effective in similar scenarios.
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
- Include both strategies AND patterns for comprehensive guidance

**Available slash commands:**
- `/context-query --tags=<tags> --min-confidence=0.75` - Query bullets programmatically
- `/context-inject --phase=<phase-name> --mode=standard` - Auto-inject based on phase

**Reference:** See `.claude/ace-system-overview.md` for complete ACE integration guide

### Decision Validation
```javascript
// 1. Calculate proposed decision
const proposedDecision = calculateDecision(consensusScore, iteration);

// 2. Validate against CFN rules
const validation = await validateCFNDecision(proposedDecision, {
  mode: 'standard',
  phaseId,
  iteration,
  maxIterations: 10,
  consensus: consensusScore
});

// 3. Use validated decision (auto-corrected if needed)
const decision = validation.corrected ? validation.decision : proposedDecision;

// 4. Execute decision (validation guarantees CFN compliance)
await executeDecision(decision);

// Additional strategic logging
if (decision.action === 'LOOP' && iteration < 10) {
  await redis.publish(`cfn:phase-${phaseId}:relaunch`, JSON.stringify({
    iteration,
    targetedFixes: validation.recommendedFixes
  }));
} else if (decision.action === 'ESCALATE') {
  await redis.publish(`cfn:phase-${phaseId}:escalate`, JSON.stringify({
    reason: 'Maximum iterations exceeded or critical concerns detected',
    iteration
  }));
}
```

### Post-Loop Reflection (Learning System)

**IMPORTANT:** After Loop 3 completes, trigger reflection to capture learnings:

```javascript
// After Loop 3 completes
if (decision.action === 'PROCEED' && consensusScore >= 0.90) {
  // Trigger reflection on this loop's execution
  const reflectionId = await reflectOnExecution({
    taskId: `phase-${phaseId}-loop3`,
    agentIds: allLoop3AgentIds,
    swarmId: `swarm-phase-${phaseId}`,
    phase: phaseId,
    autoCurate: true,  // Auto-merge high-confidence lessons (≥0.8)
    reflectionType: 'success'  // Successful implementation patterns
  });

  console.log(`Reflection complete: ${reflectionId}`);
} else if (decision.action === 'LOOP' && iteration >= 3) {
  // Reflect on what's blocking progress (after multiple iterations)
  const reflectionId = await reflectOnExecution({
    taskId: `phase-${phaseId}-loop3-iteration-${iteration}`,
    agentIds: allLoop3AgentIds,
    swarmId: `swarm-phase-${phaseId}`,
    phase: phaseId,
    autoCurate: false,  // Manual review for blockers
    reflectionType: 'failure'  // What's not working
  });

  console.log(`Blocker reflection: ${reflectionId} - requires manual curation`);
}
```

**When to trigger reflection:**
- After successful Loop 3 completion (PROCEED decision)
- After multiple LOOP iterations (≥3) to identify blockers
- After DEFER decision (capture why items were deferred)
- After max iterations (capture systemic issues)

**Reflection types:**
- `success` - Capture what worked well
- `failure` - Capture what blocked progress
- `optimization` - Capture performance improvements discovered
- `edge_case` - Capture unexpected conditions encountered

**Available slash commands:**
- `/context-reflect --task-id=<id> --reflection-type=<type> --auto-curate` - Manual reflection
- `/context-curate --reflection-id=<id>` - Manual curation of pending reflections
- `/context-stats` - View bullet health and usage metrics

**Reference:** See `.claude/ace-system-overview.md` for complete reflection workflow

## Escalation Patterns
- If maximum iterations (10) reached
- If consensus cannot achieve 0.90
- If critical systemic rule violations detected

## Redis Communication Channels
- `cfn:phase-${phaseId}:loop3:iteration`
- `cfn:phase-${phaseId}:standard:validation`
- `cfn:phase-${phaseId}:standard:relaunch`
- `cfn:phase-${phaseId}:standard:escalate`

## Detailed Validation Criteria
- Ensure design consistency
- Validate architectural compliance
- Enforce security standards
- Check performance requirements
- Validate test coverage thresholds
- Maintain architectural decision audit trail

## SQLite Persistence (ACL Level 3: Swarm)
```javascript
// Store validation metadata
await sqlite.memoryAdapter.set(
  `cfn/phase-${phaseId}/loop3/validation/${coordinatorId}`, 
  {
    iteration,
    consensusScore,
    recommendedFixes,
    validationDate: new Date().toISOString()
  },
  { 
    aclLevel: 3,  // Swarm-level access
    ttl: 7776000  // 90 days retention
  }
);
```

## Performance Tuning
- Parallel validator execution
- WASM-accelerated pattern matching
- Incremental validation with caching
- Semantic agent review for complex scenarios

## Confidence Scoring
- Base score derived from consensus
- Adjusted by iteration progress
- Incorporates validator feedback
- Scaled 0.75-1.00 for standard mode
