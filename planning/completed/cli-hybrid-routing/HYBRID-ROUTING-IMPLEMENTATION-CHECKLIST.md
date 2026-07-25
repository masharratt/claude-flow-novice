# Hybrid Routing Implementation Checklist

**Date:** October 12, 2025
**Purpose:** Complete guide for implementing hybrid CLI routing across codebase
**Status:** Ready for implementation after security fixes

---

## What Was Already Done ✅

1. **`scripts/switch-api.sh`** - Updated to enable hybrid routing on `/switch-api max`
2. **`CLAUDE.md`** - Added hybrid CLI patterns (lines 190-265)
3. **`.claude/commands/advanced-routing-activate.md`** - Command documentation created

---

## What Needs To Be Updated

### 1. CFN Loop Instruction Files

**Files to update:**
- `config/cfn-loop/instructions/mvp-instructions.md`
- `config/cfn-loop/instructions/standard-instructions.md`
- `config/cfn-loop/instructions/enterprise-instructions.md`

**Changes needed in each:**

**Section: Loop 3 Implementation**

**Add before existing Loop 3 content:**
```markdown
### Loop 3 Hybrid Spawning (Claude Max Mode)

**When hybrid routing enabled (default with Claude Max):**

1. Spawn coordinator via Task tool (uses Claude Max subscription):

Task("CFN-Loop3-Coordinator",
  `Lead implementation for [PHASE_NAME].

   **Your Mission:**
   Orchestrate [N] worker agents via CLI with intelligent monitoring.

   **Spawning Command:**
   node tests/manual/test-swarm-direct.js \\
     "[TASK_DESCRIPTION]" \\
     --executor --max-agents [N] --strategy development --mode mesh

   **Redis Monitoring:**
   Subscribe to: swarm:[phase]:*:complete
   Parse confidence scores from worker completion events.

   **Your Responsibilities:**
   1. Task decomposition (break into [N] focused subtasks)
   2. Progress monitoring (track worker completion)
   3. Error detection (catch failures, low confidence)
   4. Recovery actions (relaunch failed workers)
   5. Result aggregation (combine worker outputs)
   6. Quality assessment (check confidence ≥0.75)
   7. Structured reporting (summary to main chat)

   **Reporting Format:**
   {
     "phase": "[PHASE_NAME]",
     "workers": [N],
     "completed": [X],
     "avgConfidence": 0.XX,
     "filesModified": [count],
     "issues": ["list"],
     "status": "READY_FOR_LOOP2" | "NEEDS_RETRY"
   }

   **Cost Tracking:**
   You: $0 (subscription)
   Workers: ~$0.50/1M tokens (z.ai)
   Total: ~$0.50 for this phase`,
  "coordinator"
)

2. Coordinator spawns workers automatically
3. Workers use z.ai (cost-optimized)
4. Coordinator reports back to main chat
```

**Add after existing Loop 3 content:**
```markdown
### Loop 3 Pure CLI (Z.ai Mode)

**When hybrid routing disabled (pure z.ai provider):**

Execute directly via CLI without coordinator:

```bash
node tests/manual/test-swarm-direct.js \\
  "[TASK_DESCRIPTION]" \\
  --executor --max-agents [N] --strategy development --mode mesh
```

All workers use z.ai. No coordinator orchestration.
You must manually monitor Redis and interpret results.
```

---

### 2. Agent Profile Templates

**Location:** `.claude/agents/`

**Files to update (coordinator types):**
- `coordinator.md`
- `architect.md` (if used as coordinator)
- `system-architect.md` (if used as coordinator)
- `product-owner.md` (Loop 4 coordinator)

**Add to each coordinator profile:**

```markdown
## Hybrid Routing Behavior

**When spawned via Task tool with Claude Max subscription:**

You are a **Coordinator Agent** in hybrid CLI architecture.

**Your Role:**
- Orchestrate worker agents via CLI commands
- Monitor execution via Redis pub/sub
- Provide intelligent progress interpretation
- Handle errors and recovery
- Aggregate results and report to main chat

**Key Capabilities:**
1. **CLI Spawning:**
   Execute: node tests/manual/test-swarm-direct.js "[task]" --max-agents N
   Workers will use z.ai provider (cost-optimized)

2. **Redis Monitoring:**
   Subscribe: swarm:*:complete
   Parse: Worker confidence scores and file outputs

3. **Error Recovery:**
   Detect failures from Redis events
   Analyze root cause
   Relaunch failed workers with adjusted prompts

4. **Result Aggregation:**
   Combine worker outputs
   Calculate aggregate confidence
   Identify blocking issues
   Provide structured summary

5. **Natural Language Reporting:**
   Translate Redis events → human-readable updates
   Explain decisions and reasoning
   Recommend next actions

**Example Workflow:**

```
1. Receive task: "Implement authentication"

2. Decompose:
   - JWT validation (coder-1)
   - Session management (coder-2)
   - Rate limiting (security-1)
   - Password hashing (coder-3)
   - OAuth integration (coder-4)

3. Spawn via CLI:
   node swarm.js "Implement auth: [subtasks]" --max-agents 5

4. Monitor Redis:
   - swarm:auth:coder-1:complete → confidence 0.85 ✅
   - swarm:auth:coder-2:complete → confidence 0.82 ✅
   - swarm:auth:security-1:complete → confidence 0.68 ⚠️
   - swarm:auth:coder-3:complete → confidence 0.88 ✅
   - swarm:auth:coder-4:complete → confidence 0.81 ✅

5. Detect issue: security-1 below threshold (0.68 < 0.75)

6. Analyze: Check security-1 output → missing test coverage

7. Recover: Relaunch security-1 with testing emphasis

8. Re-monitor: security-1 complete → confidence 0.86 ✅

9. Aggregate:
   Average confidence: 0.84
   All workers ≥0.75 ✅
   Files: 8 modified
   Coverage: 85%

10. Report to main chat:
    "Authentication implementation complete.
     5 workers executed successfully.
     Average confidence: 0.84 (target: 0.75)
     1 worker required retry (security-1, resolved)
     Ready for Loop 2 validation.

     Cost: $0.50 (workers only, you free via subscription)"
```

**Cost Structure:**
- You: $0 (Claude Max subscription)
- Workers you spawn: $0.10-2/1M tokens (z.ai)
- Your orchestration adds ZERO cost but massive value
```

---

### 3. Worker Agent Profiles

**Files to update (all worker types):**
- `coder.md`
- `tester.md`
- `reviewer.md`
- `security-specialist.md`
- (and all other 70+ agent types)

**Add to each worker profile:**

```markdown
## Hybrid Routing Behavior

**When spawned via CLI in hybrid mode:**

You are a **Worker Agent** executing via z.ai provider.

**Your Execution Context:**
- Spawned by coordinator agent
- Coordinate via Redis pub/sub channels
- Focus on single, specific subtask
- Report completion with confidence score

**Redis Communication:**

**On completion, publish:**
```javascript
redis.publish('swarm:[phase]:[agent-id]:complete', JSON.stringify({
  agent: '[agent-id]',
  confidence: 0.85,  // Your self-assessed confidence (0-1)
  filesModified: ['file1.ts', 'file2.ts'],
  linesOfCode: 450,
  testsWritten: 12,
  testsPassing: 12,
  reasoning: 'Implementation complete, tests passing, security reviewed',
  issues: [],  // Or list of blockers
  recommendations: ['Add edge case tests in Loop 2']
}));
```

**Confidence Scoring:**
- 0.90-1.00: Excellent (production-ready)
- 0.80-0.89: Good (minor polish needed)
- 0.75-0.79: Acceptable (meets threshold)
- 0.70-0.74: Needs review (below ideal)
- 0.00-0.69: Incomplete (must retry)

**What coordinator expects:**
- Focused execution on your subtask only
- Completion event published to Redis
- Honest confidence assessment
- Clear identification of any blockers

**Example:**
```
Task: "Implement JWT validation logic"

Your Execution:
1. Create src/auth/jwt.ts
2. Implement validateToken(), signToken(), refreshToken()
3. Write comprehensive tests (test/auth/jwt.test.ts)
4. Verify all tests passing
5. Self-assess confidence: 0.85
6. Publish completion event to Redis
7. Exit

Coordinator will:
- Receive your completion event
- Aggregate with other workers
- Report overall progress to main chat
```

**Cost Impact:**
You execute on z.ai: $0.10-2/1M tokens (97% savings vs Claude)
```

---

### 4. Swarm Execution Script

**File:** `tests/manual/test-swarm-direct.js`

**Add provider detection:**

```javascript
// Check if hybrid routing is enabled
const settingsPath = join(homedir(), '.claude', 'settings.json');
let provider = 'zai';  // Default for CLI spawning

if (existsSync(settingsPath)) {
  const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
  if (settings.hybridRouting?.enabled && settings.hybridRouting?.workers) {
    provider = settings.hybridRouting.workers;
    console.log(`[Hybrid Mode] Workers using: ${provider}`);
  }
}

// Use detected provider for all spawned agents
const agentConfig = {
  provider: provider,  // 'zai' in hybrid mode
  model: provider === 'zai' ? 'glm-4.6' : 'haiku'
};
```

---

### 5. Redis Coordination

**File:** `src/coordination/swarm-coordinator.ts` (or similar)

**Add hybrid mode detection:**

```typescript
// Check if running in hybrid mode
const isHybridMode = process.env.HYBRID_ROUTING === 'true'
  || (globalThis as any).__HYBRID_ROUTING_ENABLED;

if (isHybridMode) {
  // Workers use z.ai, expect coordinator to aggregate results
  console.log('[Hybrid Mode] Worker agents using z.ai provider');
  console.log('[Hybrid Mode] Coordinator will aggregate via Redis pub/sub');
}

// Publish completion with provider info
await redis.publish(`swarm:${phase}:${agentId}:complete`, JSON.stringify({
  agent: agentId,
  provider: 'zai',  // Worker provider
  confidence: confidenceScore,
  // ... rest of completion data
}));
```

---

### 6. CFN Loop Slash Commands

**Files:**
- `src/slash-commands/cfn-loop.js`
- `src/slash-commands/cfn-loop-sprints.js`
- `src/slash-commands/cfn-loop-epic.js`

**Add hybrid routing check:**

```javascript
// Check if hybrid routing is enabled
const settings = loadSettings();
const hybridEnabled = settings.hybridRouting?.enabled === true;

if (hybridEnabled) {
  console.log('\n🔀 Hybrid Routing ENABLED');
  console.log('   Coordinators: Claude Max (Task tool)');
  console.log('   Workers: Z.ai (CLI spawning)');
  console.log('   Cost: ~$0.50/phase (workers only)\n');

  // Use coordinator-based spawning
  executeWithCoordinator(phase, objective);
} else {
  console.log('\n⚪ Pure Provider Mode');
  console.log('   All agents use main provider');

  // Use direct CLI spawning
  executeDirectCLI(phase, objective);
}
```

---

### 7. Documentation Files

**Files to update:**
- `readme/README.md` - Add hybrid routing section
- `readme/development/AGENT-SPAWNING.md` - Document hybrid patterns
- `readme/cost-optimization/COST-OPTIMIZATION.md` - Add hybrid cost analysis

**Section to add in each:**

```markdown
## Hybrid CLI Routing (Cost-Optimized)

**Enabled by default with Claude Max (`/switch-api max`)**

**Architecture:**
- Main chat: Claude Max subscription ($0)
- Coordinators: Claude Max via Task tool ($0)
- Workers: Z.ai via CLI spawning ($0.10-2/1M)

**Benefits:**
- 97% cost savings on worker execution
- Best coordinator quality (Claude 3.5 Sonnet)
- Intelligent progress monitoring
- Automatic error recovery
- Structured result aggregation

**When to use:**
- Multi-agent coordination
- Quality gates important
- Using Claude Max subscription
- Production deployments

**Example:**
```bash
# Enable (automatic with Claude Max)
/switch-api max

# Run CFN Loop (uses hybrid routing automatically)
/cfn-loop "Implement authentication system"

# Coordinator spawns workers via CLI
# Workers use z.ai for cost optimization
# Coordinator aggregates results and reports to main chat
```

**Cost calculation:**
- Coordinator: $0 (subscription)
- 5 workers × 200K tokens × $0.50/1M = $0.50
- Total: $0.50/phase
- vs Pure Claude: $15/phase
- Savings: 97%
```

---

## Testing Checklist

Before deployment, verify:

- [ ] `/switch-api max` enables hybrid routing in settings.json
- [ ] Coordinator agents spawn via Task tool
- [ ] Coordinator can execute CLI commands
- [ ] Workers spawn via test-swarm-direct.js
- [ ] Workers publish to Redis completion channels
- [ ] Coordinator monitors Redis successfully
- [ ] Coordinator aggregates confidence scores
- [ ] Coordinator reports structured summary
- [ ] Cost tracking shows $0 for coordinator
- [ ] Cost tracking shows z.ai pricing for workers
- [ ] All CFN Loop commands respect hybrid mode
- [ ] Pure CLI mode works when hybrid disabled

---

## Security Requirements (MUST DO FIRST)

**Timeline: 26 hours**

Before enabling hybrid routing in production:

1. **Redis Authentication** (8 hours)
   - Implement password-based auth
   - Update all Redis clients
   - Test auth failures

2. **JSON Schema Validation** (12 hours)
   - Validate all Redis pub/sub messages
   - Prevent injection attacks
   - Test malformed payloads

3. **HMAC-SHA256 Signing** (6 hours)
   - Sign all worker completion events
   - Verify signatures in coordinator
   - Test signature tampering

**Without these fixes:**
- VULN-001: Unauthorized Redis access (CVSS 8.5)
- VULN-002: Message injection (CVSS 7.8)
- VULN-003: Message spoofing (CVSS 6.5)

---

## Rollout Plan

**Phase 1: Security (26 hours)**
- Implement Redis auth
- Add JSON validation
- Add message signing
- Test security measures

**Phase 2: Documentation (2 hours)**
- Update all instruction files
- Update agent profiles
- Update documentation

**Phase 3: Testing (4 hours)**
- Test with CFN Loop
- Verify cost tracking
- Validate error recovery
- Confirm visibility improvements

**Phase 4: Production (1 hour)**
- Enable by default with Claude Max
- Monitor first production runs
- Gather feedback
- Adjust as needed

**Total Timeline: 33 hours**

---

## Verification Commands

**Check if hybrid routing is active:**
```bash
cat ~/.claude/settings.json | jq .hybridRouting
```

**Test coordinator spawning:**
```bash
# Should spawn coordinator via Task tool
/cfn-loop "Test task"
```

**Test worker spawning:**
```bash
# Should spawn workers via CLI with z.ai
node tests/manual/test-swarm-direct.js "Test" --max-agents 3
```

**Monitor Redis:**
```bash
# Should see worker completion events
redis-cli SUBSCRIBE "swarm:*:complete"
```

---

## Rollback Plan

**If hybrid routing causes issues:**

1. Disable routing:
   ```bash
   /switch-api max  # Reconfigure
   # Edit ~/.claude/settings.json
   # Set hybridRouting.enabled = false
   ```

2. Use pure provider mode:
   - All agents use main provider
   - No coordinator overhead
   - Higher cost but simpler

3. Or switch to pure z.ai:
   ```bash
   /switch-api zai
   # All agents use z.ai
   # No hybrid complexity
   ```

---

## Summary

**Files requiring updates:**
1. CFN Loop instruction files (3 files)
2. Coordinator agent profiles (4 files)
3. Worker agent profiles (70+ files)
4. Swarm execution script (1 file)
5. Redis coordination (1 file)
6. CFN Loop commands (3 files)
7. Documentation (3 files)

**Total files: ~85 files**
**Estimated time: 6-8 hours** (after security fixes)
**Security fixes first: 26 hours**
**Total implementation: 33-35 hours**

**Priority:**
1. Security fixes (CRITICAL - 26 hours)
2. Core functionality (coordinator patterns - 4 hours)
3. Documentation (nice to have - 2 hours)
