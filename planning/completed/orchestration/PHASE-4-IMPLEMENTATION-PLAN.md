# Phase 4: CFN Loop Integration - Implementation Plan

**Epic:** Redis Agent Coordination
**Phase:** 4 of 6
**Status:** 🟢 READY TO START
**Duration:** 5-7 days
**Dependencies:** ✅ Phase 3 Complete (Production-ready spawn-workers.js with Redis coordination)

---

## Objective

Integrate Redis coordination into CFN Loop execution (Loops 3→2→4) with mode-specific patterns for MVP, Standard, and Enterprise.

---

## Current State

**What Works:**
- ✅ spawn-workers.js supports 4 topologies with Redis coordination
- ✅ Coordinator manages worker synchronization via Redis
- ✅ Background mode, error recovery, monitoring all functional
- ✅ CFN Loop slash commands exist (`/cfn-loop`, `/cfn-loop-sprints`, `/cfn-loop-epic`)

**What's Missing:**
- ❌ CFN Loop coordinators don't use Redis for inter-loop coordination
- ❌ Loop 3 workers use file-based coordination (not Redis)
- ❌ Loop 2 validators don't wait for Loop 3 Redis signals
- ❌ Loop 4 Product Owner doesn't read Redis consensus state
- ❌ No mode-specific Redis channel patterns

---

## Architecture Overview

### Current CFN Loop Flow (File-Based):
```
Loop 0 (Epic) → Loop 1 (Phase) → Loop 3 (Workers) → Loop 2 (Validators) → Loop 4 (PO)
                                        ↓ (files)         ↓ (files)         ↓ (files)
                                    deliverables      validation.json   decision.json
```

### Target CFN Loop Flow (Redis-Based):
```
Loop 0 (Epic) → Loop 1 (Phase) → Loop 3 (Workers) → Loop 2 (Validators) → Loop 4 (PO)
                                        ↓ (Redis)         ↓ (Redis)         ↓ (Redis)
                                  lpush :complete   blpop :complete   blpop :consensus
```

### Redis Channel Pattern:
```
swarm:cfn:{mode}:{phaseId}:loop3:worker{N}:done     # Loop 3 worker completion
swarm:cfn:{mode}:{phaseId}:loop3:complete           # Loop 3 gate signal
swarm:cfn:{mode}:{phaseId}:loop2:validator{N}:done  # Loop 2 validator result
swarm:cfn:{mode}:{phaseId}:loop2:complete           # Loop 2 consensus signal
swarm:cfn:{mode}:{phaseId}:loop4:decision           # Loop 4 PO decision
```

---

## Deliverables

### Deliverable 1: Loop 3 Redis Integration

**Objective:** Replace file-based Loop 3 coordination with Redis LPUSH/BLPOP

**Files to Modify:**
- `.claude/agents/cfn-loop/cfn-coordinator-mvp.md`
- `.claude/agents/cfn-loop/cfn-coordinator-standard.md`
- `.claude/agents/cfn-loop/cfn-coordinator-enterprise.md`

**Changes Required:**

**1. Update Loop 3 worker spawn instructions:**

```markdown
## Loop 3: Primary Swarm Implementation

**Redis Coordination Pattern:**

1. **Spawn Workers via spawn-workers.js:**
\`\`\`bash
node src/cli/hybrid-routing/spawn-workers.js \\
  "Implement authentication features" \\
  --agents=coder,coder,tester \\
  --topology=sequential \\
  --redis-channel="swarm:cfn:${MODE}:${PHASE_ID}:loop3" \\
  --provider=zai
\`\`\`

2. **Each worker signals completion:**
Workers automatically signal via spawn-workers.js coordinator:
- Coordinator aggregates worker results
- Calculates average confidence
- Checks gate threshold (MVP: ≥0.65, Standard: ≥0.75, Enterprise: ≥0.85)

3. **Signal Loop 2 on gate pass:**
\`\`\`javascript
// After all workers complete and gate passes
const gateResult = {
  loop: 3,
  phase: PHASE_ID,
  mode: MODE,
  workers: workerResults,
  avgConfidence: 0.78,
  gateThreshold: 0.75,
  gatePassed: true,
  timestamp: Date.now()
};

bash_execute({
  command: `redis-cli lpush "swarm:cfn:${MODE}:${PHASE_ID}:loop3:complete" '${JSON.stringify(gateResult)}'`
});
\`\`\`

4. **Store results in SQLite:**
\`\`\`javascript
// Persistent audit trail (ACL Level 4: Project)
await memoryAdapter.set(\`cfn/phase:${PHASE_ID}/loop3/results\`, gateResult, {
  agentId: 'cfn-coordinator',
  aclLevel: 4,
  namespace: 'cfn-loop',
  ttl: 86400 * 30 // 30 days
});
\`\`\`
```

**2. Update gate threshold checks:**

```markdown
## Gate Threshold by Mode

| Mode | Gate Threshold | Max Iterations | Workers |
|------|----------------|----------------|---------|
| MVP | ≥0.65 | 5 | 2-3 |
| Standard | ≥0.75 | 10 | 3-5 |
| Enterprise | ≥0.85 | 15 | 5-8 |

**Gate Logic:**
\`\`\`javascript
const avgConfidence = workerResults.reduce((sum, r) => sum + r.confidence, 0) / workerResults.length;
const gatePassed = avgConfidence >= GATE_THRESHOLD[mode];

if (!gatePassed && iteration < MAX_ITERATIONS[mode]) {
  console.log(\`⚠️  Gate failed (${avgConfidence.toFixed(2)} < ${GATE_THRESHOLD[mode]})\`);
  console.log(\`🔄 Retrying iteration ${iteration + 1}/${MAX_ITERATIONS[mode]}\`);
  // Retry Loop 3 with feedback
} else if (!gatePassed) {
  console.log(\`❌ Gate failed after ${MAX_ITERATIONS[mode]} iterations\`);
  // Escalate to Loop 4 Product Owner
}
\`\`\`
```

**Acceptance Criteria:**
- ✅ Loop 3 workers spawned via spawn-workers.js with Redis channel
- ✅ Coordinator calculates average confidence
- ✅ Gate threshold checked per mode
- ✅ Success signals Loop 2 via Redis LPUSH
- ✅ Results stored in SQLite with ACL Level 4

**Estimated:** 1-2 days

---

### Deliverable 2: Loop 2 Redis Integration

**Objective:** Loop 2 validators wait for Loop 3 Redis signal, validate, and signal Loop 4

**Files to Modify:**
- `.claude/agents/cfn-loop/cfn-coordinator-mvp.md`
- `.claude/agents/cfn-loop/cfn-coordinator-standard.md`
- `.claude/agents/cfn-loop/cfn-coordinator-enterprise.md`

**Changes Required:**

**1. Wait for Loop 3 completion signal:**

```markdown
## Loop 2: Consensus Validation

**Redis Coordination Pattern:**

1. **Wait for Loop 3 completion (blocking):**
\`\`\`bash
# Block until Loop 3 signals completion (no timeout = wait forever)
loop3_result=$(redis-cli blpop "swarm:cfn:${MODE}:${PHASE_ID}:loop3:complete" 0)

# Parse JSON result
echo "Loop 3 complete: $loop3_result"
\`\`\`

2. **Spawn validators based on mode:**
\`\`\`bash
# MVP: 2 validators
# Standard: 4 validators
# Enterprise: 5 validators

node src/cli/hybrid-routing/spawn-workers.js \\
  "Validate authentication implementation" \\
  --agents=$(get_validator_types ${MODE}) \\
  --topology=sequential \\
  --redis-channel="swarm:cfn:${MODE}:${PHASE_ID}:loop2" \\
  --provider=zai
\`\`\`

3. **Each validator reviews Loop 3 deliverables:**
Validators read Loop 3 results from SQLite:
\`\`\`javascript
const loop3Results = await memoryAdapter.get(\`cfn/phase:${PHASE_ID}/loop3/results\`, {
  agentId: 'validator-1',
  aclLevel: 4
});

// Review code, tests, documentation
const validationResult = {
  validator: 'code-quality-validator',
  confidence: 0.92,
  issues: [],
  recommendations: ['Add integration tests'],
  timestamp: Date.now()
};

// Signal completion
bash_execute({
  command: \`redis-cli lpush "swarm:cfn:${MODE}:${PHASE_ID}:loop2:validator${N}:done" '${JSON.stringify(validationResult)}'\`
});
\`\`\`

4. **Coordinator aggregates consensus:**
\`\`\`javascript
// Wait for all validators
const validatorCount = VALIDATOR_COUNT[mode]; // 2, 4, or 5
const validatorResults = [];

for (let i = 1; i <= validatorCount; i++) {
  const result = await bash_execute({
    command: \`redis-cli blpop "swarm:cfn:${MODE}:${PHASE_ID}:loop2:validator${i}:done" 60\`
  });
  validatorResults.push(JSON.parse(result));
}

// Calculate consensus
const avgConsensus = validatorResults.reduce((sum, r) => sum + r.confidence, 0) / validatorResults.length;
const consensusPassed = avgConsensus >= CONSENSUS_THRESHOLD[mode];

// Signal Loop 4
const consensusResult = {
  loop: 2,
  phase: PHASE_ID,
  mode: MODE,
  validators: validatorResults,
  avgConsensus: 0.92,
  consensusThreshold: 0.90,
  consensusPassed: true,
  timestamp: Date.now()
};

bash_execute({
  command: \`redis-cli lpush "swarm:cfn:${MODE}:${PHASE_ID}:loop2:complete" '${JSON.stringify(consensusResult)}'\`
});
\`\`\`

5. **Store consensus in SQLite (immutable audit):**
\`\`\`javascript
await memoryAdapter.set(\`cfn/phase:${PHASE_ID}/loop2/consensus\`, consensusResult, {
  agentId: 'cfn-coordinator',
  aclLevel: 3, // Swarm-level (immutable)
  namespace: 'cfn-loop',
  ttl: 86400 * 365 // 1 year retention
});
\`\`\`
```

**2. Update consensus thresholds:**

```markdown
## Consensus Threshold by Mode

| Mode | Consensus Threshold | Max Iterations | Validators |
|------|---------------------|----------------|------------|
| MVP | ≥0.85 | 5 | 2 |
| Standard | ≥0.90 | 10 | 4 |
| Enterprise | ≥0.95 | 15 | 5 |

**Consensus Logic:**
\`\`\`javascript
const avgConsensus = validatorResults.reduce((sum, r) => sum + r.confidence, 0) / validatorResults.length;
const consensusPassed = avgConsensus >= CONSENSUS_THRESHOLD[mode];

if (!consensusPassed && iteration < MAX_ITERATIONS[mode]) {
  console.log(\`⚠️  Consensus failed (${avgConsensus.toFixed(2)} < ${CONSENSUS_THRESHOLD[mode]})\`);
  console.log(\`🔄 Retrying Loop 3 with validator feedback\`);
  // Return to Loop 3 with specific improvement requests
} else if (!consensusPassed) {
  console.log(\`❌ Consensus failed after ${MAX_ITERATIONS[mode]} iterations\`);
  // Escalate to Loop 4 Product Owner with DEFER recommendation
}
\`\`\`
```

**Acceptance Criteria:**
- ✅ Loop 2 waits for Loop 3 Redis signal (BLPOP)
- ✅ Validators spawned based on mode (2/4/5)
- ✅ Each validator signals completion via Redis LPUSH
- ✅ Coordinator aggregates consensus
- ✅ Consensus threshold checked per mode
- ✅ Success signals Loop 4 via Redis LPUSH
- ✅ Consensus stored in SQLite with ACL Level 3 (immutable)

**Estimated:** 1-2 days

---

### Deliverable 3: Loop 4 Redis Integration (Product Owner GOAP)

**Objective:** Loop 4 Product Owner reads Redis consensus, makes GOAP decision

**Files to Modify:**
- `.claude/agents/cfn-loop/product-owner.md` (or create if missing)

**Changes Required:**

**1. Wait for Loop 2 consensus signal:**

```markdown
## Loop 4: Product Owner Decision Gate (GOAP)

**Redis Coordination Pattern:**

1. **Wait for Loop 2 consensus (blocking):**
\`\`\`bash
# Block until Loop 2 signals consensus (no timeout)
loop2_result=$(redis-cli blpop "swarm:cfn:${MODE}:${PHASE_ID}:loop2:complete" 0)

echo "Loop 2 consensus: $loop2_result"
\`\`\`

2. **Read Loop 3 and Loop 2 results from SQLite:**
\`\`\`javascript
const loop3Results = await memoryAdapter.get(\`cfn/phase:${PHASE_ID}/loop3/results\`, {
  agentId: 'product-owner',
  aclLevel: 4
});

const loop2Consensus = await memoryAdapter.get(\`cfn/phase:${PHASE_ID}/loop2/consensus\`, {
  agentId: 'product-owner',
  aclLevel: 3
});

console.log('Loop 3 Gate:', loop3Results.gatePassed, loop3Results.avgConfidence);
console.log('Loop 2 Consensus:', loop2Consensus.consensusPassed, loop2Consensus.avgConsensus);
\`\`\`

3. **Execute GOAP Decision (A* search):**
\`\`\`javascript
// Product Owner analyzes state and makes decision
const decision = {
  loop: 4,
  phase: PHASE_ID,
  mode: MODE,

  analysis: {
    loop3Gate: loop3Results.gatePassed,
    loop3Confidence: loop3Results.avgConfidence,
    loop2Consensus: loop2Consensus.consensusPassed,
    loop2Confidence: loop2Consensus.avgConsensus,
    blockers: [],
    risks: []
  },

  decision: 'PROCEED', // or 'DEFER' or 'ESCALATE'
  reasoning: 'Gate and consensus both passed with high confidence',
  nextActions: [
    'Proceed to next phase',
    'Update sprint status',
    'Notify stakeholders'
  ],

  timestamp: Date.now()
};

// Signal decision via Redis
bash_execute({
  command: \`redis-cli lpush "swarm:cfn:${MODE}:${PHASE_ID}:loop4:decision" '${JSON.stringify(decision)}'\`
});
\`\`\`

4. **Store decision in SQLite:**
\`\`\`javascript
await memoryAdapter.set(\`cfn/phase:${PHASE_ID}/loop4/decision\`, decision, {
  agentId: 'product-owner',
  aclLevel: 4, // Project-level
  namespace: 'cfn-loop',
  ttl: 86400 * 365 // 1 year retention
});
\`\`\`

5. **Execute decision:**
- **PROCEED:** Auto-launch next phase (Loop 3 for next deliverable)
- **DEFER:** Store concerns, continue with reduced scope
- **ESCALATE:** Return to main chat with detailed analysis
```

**2. GOAP Decision Matrix:**

```markdown
## GOAP Decision Logic

**Decision Criteria:**

| Gate | Consensus | Blockers | Decision | Action |
|------|-----------|----------|----------|--------|
| ✅ Pass | ✅ Pass | None | PROCEED | Auto-launch next phase |
| ✅ Pass | ❌ Fail | None | DEFER | Continue with concerns logged |
| ❌ Fail | ✅ Pass | None | DEFER | Retry Loop 3 with feedback |
| ❌ Fail | ❌ Fail | None | DEFER | Retry both loops |
| * | * | Critical | ESCALATE | Return to main chat |

**ESCALATE Triggers:**
- Critical security vulnerabilities found
- Major architectural changes required
- Budget exceeded by >20%
- Timeline slippage >50%
- Stakeholder approval needed
- Technical blockers unresolved after 3 retries
```

**Acceptance Criteria:**
- ✅ Loop 4 waits for Loop 2 Redis signal (BLPOP)
- ✅ Reads Loop 3 and Loop 2 results from SQLite
- ✅ Executes GOAP decision logic
- ✅ Signals decision via Redis LPUSH
- ✅ Stores decision in SQLite with ACL Level 4
- ✅ PROCEED auto-launches next phase
- ✅ ESCALATE returns to main chat

**Estimated:** 1-2 days

---

### Deliverable 4: Mode-Specific Redis Channel Patterns

**Objective:** Implement distinct Redis channel patterns for MVP, Standard, Enterprise

**Files to Modify:**
- `.claude/agents/cfn-loop/cfn-coordinator-mvp.md`
- `.claude/agents/cfn-loop/cfn-coordinator-standard.md`
- `.claude/agents/cfn-loop/cfn-coordinator-enterprise.md`

**Changes Required:**

**1. MVP Mode Pattern (Cost-Optimized):**

```markdown
## MVP Mode: Redis Coordination

**Channel Pattern:** \`swarm:cfn:mvp:{phaseId}:loop{N}\`

**Characteristics:**
- 2-3 workers (Loop 3)
- 2 validators (Loop 2)
- Single Product Owner (Loop 4)
- Simple chain coordination (sequential topology)
- z.ai provider (cost optimization)
- 15-minute phase duration target

**Loop 3 Spawn:**
\`\`\`bash
node src/cli/hybrid-routing/spawn-workers.js \\
  "MVP task description" \\
  --agents=coder,tester \\
  --topology=sequential \\
  --redis-channel="swarm:cfn:mvp:${PHASE_ID}:loop3" \\
  --provider=zai \\
  --timeout=900000  # 15 minutes
\`\`\`

**Loop 2 Spawn:**
\`\`\`bash
node src/cli/hybrid-routing/spawn-workers.js \\
  "Validate MVP deliverables" \\
  --agents=code-quality-validator,security-specialist \\
  --topology=sequential \\
  --redis-channel="swarm:cfn:mvp:${PHASE_ID}:loop2" \\
  --provider=zai \\
  --timeout=600000  # 10 minutes
\`\`\`

**Cost Target:** <$1.00/phase
```

**2. Standard Mode Pattern (Balanced):**

```markdown
## Standard Mode: Redis Coordination

**Channel Pattern:** \`swarm:cfn:standard:{phaseId}:loop{N}\`

**Characteristics:**
- 3-5 workers (Loop 3)
- 4 validators (Loop 2)
- Single Product Owner (Loop 4)
- Mesh with coordinator (collaborative topology for complex tasks)
- z.ai provider (default)
- 30-minute phase duration target

**Loop 3 Spawn:**
\`\`\`bash
node src/cli/hybrid-routing/spawn-workers.js \\
  "Standard task description" \\
  --agents=architect,coder,coder,tester \\
  --topology=collaborative \\
  --redis-channel="swarm:cfn:standard:${PHASE_ID}:loop3" \\
  --provider=zai \\
  --timeout=1800000  # 30 minutes
\`\`\`

**Loop 2 Spawn:**
\`\`\`bash
node src/cli/hybrid-routing/spawn-workers.js \\
  "Validate standard deliverables" \\
  --agents=code-analyzer,security-specialist,perf-analyzer,architect \\
  --topology=sequential \\
  --redis-channel="swarm:cfn:standard:${PHASE_ID}:loop2" \\
  --provider=zai \\
  --timeout=1200000  # 20 minutes
\`\`\`

**Cost Target:** ~$2.00/phase
```

**3. Enterprise Mode Pattern (Full Quality Gates):**

```markdown
## Enterprise Mode: Redis Coordination

**Channel Pattern:** \`swarm:cfn:enterprise:{phaseId}:loop{N}\`

**Characteristics:**
- 5-8 workers (Loop 3)
- 5 validators (Loop 2)
- 4-person Product Owner board (Loop 4)
- Hierarchical broadcast (release-gate topology)
- Anthropic provider (quality over cost)
- 60-minute phase duration target
- Loop 0.5 planning consensus (≥0.85)

**Loop 3 Spawn:**
\`\`\`bash
node src/cli/hybrid-routing/spawn-workers.js \\
  "Enterprise task description" \\
  --agents=architect,architect,coder,coder,coder,tester,security-specialist,perf-analyzer \\
  --topology=release-gate \\
  --redis-channel="swarm:cfn:enterprise:${PHASE_ID}:loop3" \\
  --provider=anthropic \\
  --timeout=3600000  # 60 minutes
\`\`\`

**Loop 2 Spawn:**
\`\`\`bash
node src/cli/hybrid-routing/spawn-workers.js \\
  "Validate enterprise deliverables" \\
  --agents=code-analyzer,security-specialist,perf-analyzer,architect,compliance-validator \\
  --topology=sequential \\
  --redis-channel="swarm:cfn:enterprise:${PHASE_ID}:loop2" \\
  --provider=anthropic \\
  --timeout=2400000  # 40 minutes
\`\`\`

**Loop 4 (4-Person Board):**
\`\`\`bash
# Spawn 4 product owners for board decision
node src/cli/hybrid-routing/spawn-workers.js \\
  "Board decision on phase completion" \\
  --agents=product-owner,cto-agent,security-architect-persona,accessibility-advocate-persona \\
  --topology=collaborative \\
  --redis-channel="swarm:cfn:enterprise:${PHASE_ID}:loop4" \\
  --provider=anthropic \\
  --timeout=1200000  # 20 minutes
\`\`\`

**Cost Target:** ~$5.00/phase
```

**Acceptance Criteria:**
- ✅ MVP mode uses sequential topology, 2-3 workers, 2 validators
- ✅ Standard mode uses collaborative topology, 3-5 workers, 4 validators
- ✅ Enterprise mode uses release-gate topology, 5-8 workers, 5 validators
- ✅ Channel patterns include mode prefix
- ✅ Timeouts appropriate for each mode
- ✅ Cost targets documented

**Estimated:** 1 day

---

### Deliverable 5: End-to-End CFN Loop Test

**Objective:** Full CFN Loop execution test with Redis coordination for all 3 modes

**Files to Create:**
- `tests/manual/test-cfn-loop-redis-integration.md`

**Test Scenarios:**

**Test 1: MVP Mode End-to-End**
```bash
# Execute full CFN Loop in MVP mode
/cfn-loop "Build simple REST API" --mode=mvp --phase=api-mvp-001

# Expected flow:
# 1. Loop 3: 2 workers (coder, tester) via Redis coordination
#    - Workers signal completion: swarm:cfn:mvp:api-mvp-001:loop3:worker{N}:done
#    - Gate check: avgConfidence ≥ 0.65
#    - Signal Loop 2: swarm:cfn:mvp:api-mvp-001:loop3:complete
#
# 2. Loop 2: 2 validators wait for Loop 3 signal
#    - Validators review deliverables
#    - Signal completion: swarm:cfn:mvp:api-mvp-001:loop2:validator{N}:done
#    - Consensus check: avgConsensus ≥ 0.85
#    - Signal Loop 4: swarm:cfn:mvp:api-mvp-001:loop2:complete
#
# 3. Loop 4: Product Owner decision
#    - Waits for Loop 2 signal
#    - Reads Loop 3 gate results (SQLite)
#    - Reads Loop 2 consensus (SQLite)
#    - Makes GOAP decision (PROCEED/DEFER/ESCALATE)
#    - Signals decision: swarm:cfn:mvp:api-mvp-001:loop4:decision

# Verification:
redis-cli keys "swarm:cfn:mvp:api-mvp-001:*"
# Expected: loop3:complete, loop2:complete, loop4:decision keys

# SQLite verification:
/sqlite-memory get --key "cfn/phase:api-mvp-001/loop3/results"
/sqlite-memory get --key "cfn/phase:api-mvp-001/loop2/consensus"
/sqlite-memory get --key "cfn/phase:api-mvp-001/loop4/decision"
```

**Test 2: Standard Mode End-to-End**
```bash
# Execute full CFN Loop in Standard mode
/cfn-loop "Implement user authentication" --mode=standard --phase=auth-std-001

# Expected flow: Same as MVP but with:
# - Loop 3: 3-5 workers (collaborative topology)
# - Loop 2: 4 validators
# - Gate: ≥0.75, Consensus: ≥0.90

# Monitor in real-time:
./scripts/monitor-swarm-coordination.sh
# Watch Redis keys appear in sequence
```

**Test 3: Enterprise Mode End-to-End**
```bash
# Execute full CFN Loop in Enterprise mode
/cfn-loop "Deploy production infrastructure" --mode=enterprise --phase=infra-ent-001

# Expected flow: Same as Standard but with:
# - Loop 3: 5-8 workers (release-gate topology)
# - Loop 2: 5 validators
# - Loop 4: 4-person Product Owner board
# - Gate: ≥0.85, Consensus: ≥0.95

# Monitor coordination:
./scripts/monitor-swarm-coordination.sh
redis-cli monitor | grep "swarm:cfn:enterprise"
```

**Test 4: Failure Scenarios**
```bash
# Test gate failure (Loop 3 confidence too low)
# Expected: Retry Loop 3 with feedback, up to max iterations

# Test consensus failure (Loop 2 validators disagree)
# Expected: Return to Loop 3 with validator feedback

# Test ESCALATE decision (critical blocker)
# Expected: Return to main chat with detailed analysis
```

**Acceptance Criteria:**
- ✅ All 3 modes complete end-to-end CFN Loop
- ✅ Redis keys created in correct sequence
- ✅ SQLite stores results with proper ACL levels
- ✅ Gate and consensus thresholds enforced
- ✅ GOAP decisions execute correctly
- ✅ Monitoring dashboard shows real-time progress

**Estimated:** 2 days

---

## Success Criteria

### Functionality ✅
- ✅ Loop 3 workers coordinate via Redis (LPUSH/BLPOP)
- ✅ Loop 2 validators wait for Loop 3 signal
- ✅ Loop 4 Product Owner reads Redis consensus state
- ✅ Mode-specific patterns work (MVP/Standard/Enterprise)
- ✅ Inter-loop signaling functional (3→2→4)
- ✅ SQLite persistence with ACL (Levels 3, 4)

### Quality ✅
- ✅ All coordinator files updated consistently
- ✅ No breaking changes to existing CFN commands
- ✅ Backward compatible with file-based fallback
- ✅ Syntax validated

### Testing ✅
- ✅ End-to-end tests for all 3 modes
- ✅ Failure scenarios tested
- ✅ Monitoring dashboard integrated
- ✅ Redis key lifecycle verified

### Documentation ✅
- ✅ Coordinator files document Redis patterns
- ✅ Test documentation created
- ✅ Implementation roadmap updated

---

## Implementation Order

**Day 1-2:** Deliverable 1 (Loop 3 Redis Integration)
- Update cfn-coordinator-mvp.md
- Update cfn-coordinator-standard.md
- Update cfn-coordinator-enterprise.md
- Test Loop 3 Redis signaling

**Day 3-4:** Deliverable 2 (Loop 2 Redis Integration)
- Update Loop 2 coordination in all 3 coordinators
- Test Loop 2 waiting for Loop 3 signal
- Test validator consensus aggregation

**Day 5:** Deliverable 3 (Loop 4 GOAP Integration)
- Update product-owner.md (or create)
- Implement GOAP decision logic
- Test decision signals

**Day 6:** Deliverable 4 (Mode-Specific Patterns)
- Finalize channel naming conventions
- Document topology selection per mode
- Verify cost targets

**Day 7:** Deliverable 5 (End-to-End Testing)
- Run full CFN Loop tests for all 3 modes
- Test failure scenarios
- Create test documentation

**Total:** 5-7 days

---

## Risk Mitigation

### Risk 1: Breaking Existing CFN Commands
**Mitigation:** Keep file-based coordination as fallback, make Redis opt-in initially

### Risk 2: SQLite ACL Complexity
**Mitigation:** Use existing memoryAdapter.set() with well-defined ACL levels (3, 4)

### Risk 3: Mode-Specific Coordinator Conflicts
**Mitigation:** Clear channel naming with mode prefix prevents cross-mode interference

### Risk 4: GOAP Decision Logic Complexity
**Mitigation:** Start with simple decision matrix, enhance with A* search later

---

## Next Steps After Phase 4

**Phase 5 Options:**

**Option A: Validation & Monitoring** (3-4 days, from original roadmap)
- Create post-spawn validation hooks
- Enhanced monitoring scripts
- Stale key detection
- Message flow tracking

**Option B: Performance Optimization** (2-3 days)
- Redis connection pooling
- Batch operations for multi-agent spawns
- BLPOP timeout tuning
- SQLite query optimization

**Recommendation:** Complete Phase 4 first, then assess based on real-world CFN Loop usage patterns.

---

**Phase 4 Status:** 🟢 Ready to Start
**Estimated Duration:** 5-7 days
**Confidence:** 0.90 (based on Phases 2-3 learnings)
