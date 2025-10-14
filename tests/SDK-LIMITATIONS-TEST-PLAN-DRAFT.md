# SDK Limitations & Provider Testing Plan (DRAFT)

**Status:** Test plan for definitive answers on SDK limitations and z.ai compatibility

**Critical Questions to Answer:**
1. Does SDK require Anthropic API keys or work with Claude Max subscription?
2. Is extended caching limitation specific to API keys?
3. Can coordinators use subscription vs API?
4. Can we use purely z.ai and still gain SDK benefits?
5. Which SDK features work with which providers?

---

## Research Findings (Pre-Test)

### Key Finding from `SDK_ARCHITECTURE_ANALYSIS.md`

```typescript
// ✅ WORKS with CLI subscription (no API needed)

const result = await claude()
    .allowTools('Read', 'Write', 'Bash')
    .skipPermissions()
    .query('Perform analysis')
    .asText();

// Uses your CLI subscription (not API credits)
// - ✅ $0 cost (uses CLI subscription)
```

**CRITICAL INSIGHT:** Task tool CAN work with Claude Max subscription!

### SDK Feature Matrix (Hypothesis)

| Feature | Anthropic API | Claude Max Sub | z.ai Router | Needs Testing |
|---------|---------------|----------------|-------------|---------------|
| **Basic Task tool** | ✅ Yes | ✅ Yes (per docs) | ❓ Unknown | ✅ Test 1 |
| **Session forking** | ✅ Yes | ❓ Unknown | ❓ Unknown | ✅ Test 2 |
| **Extended caching** | ✅ Yes | ❓ Unknown | ❌ Likely No | ✅ Test 3 |
| **Context editing** | ✅ Yes | ✅ Yes (SDK feature) | ❓ Unknown | ✅ Test 4 |
| **Memory tool** | ✅ Yes | ✅ Yes (file-based) | ✅ Yes (file-based) | ✅ Test 5 |
| **Artifacts** | ✅ Yes | ❓ Unknown | ❓ Unknown | ✅ Test 6 |
| **Query control** | ✅ Yes | ❓ Unknown | ❓ Unknown | ✅ Test 7 |
| **Checkpointing** | ✅ Yes | ✅ Yes (file-based) | ✅ Yes (file-based) | ✅ Test 8 |
| **Hooks (pre/post)** | ✅ Yes | ✅ Yes (file-based) | ✅ Yes (file-based) | ✅ Test 9 |

**Key Hypothesis:**
- **File-based features** (memory, checkpointing, hooks) work with ALL providers
- **API-dependent features** (extended caching) require Anthropic API
- **Session features** (forking, query control) might require Anthropic (unknown)

---

## Test Suite Design

### Test 1: Basic Task Tool with Subscription vs API

**Goal:** Confirm Task tool works with Claude Max subscription

**Setup:**
```javascript
// Test 1a: Claude Max subscription (current session)
Task("TestAgent",
  "Echo 'Hello from Claude Max subscription'",
  "coder"
)

// Test 1b: Anthropic API (separate test)
// Requires ANTHROPIC_API_KEY env var
// ... API-based spawn
```

**Success Criteria:**
- ✅ Test 1a succeeds with Claude Max subscription
- ✅ Test 1b succeeds with Anthropic API key
- ✅ Both produce same output

**What We Learn:**
- Whether Task tool requires API keys or works with subscription
- Cost: subscription ($0) vs API ($15/1M tokens)

---

### Test 2: Session Forking with Different Providers

**Goal:** Determine which providers support session forking

**Setup:**
```javascript
// Test 2a: Anthropic API + Session Forking
Task("ForkCoordinator-Anthropic",
  `Test SDK session forking with Anthropic API.

   Fork 3 sessions in parallel:
   - worker-1: Echo "Hello from fork 1"
   - worker-2: Echo "Hello from fork 2"
   - worker-3: Echo "Hello from fork 3"

   Measure spawn time. Report success/failure.`,
  "coordinator"
)

// Test 2b: Claude Max Subscription + Session Forking
// (Same test, but using subscription account)

// Test 2c: Z.ai Provider + Session Forking
Task("ForkCoordinator-Zai",
  `Test SDK session forking with z.ai provider.

   Configure workers to use z.ai:
   - API endpoint: https://api.z.ai/api/anthropic/v1
   - Model: glm-4.6

   Fork 3 sessions. Report success/failure.`,
  "coordinator"
)
```

**Success Criteria:**
- Measure: Spawn time (<500ms target)
- Measure: Context isolation (workers don't see each other)
- Measure: Coordinator context usage (should stay <20%)

**What We Learn:**
- Whether session forking is API-only or works with subscription
- Whether z.ai supports session forking API
- Performance comparison across providers

**Expected Results:**
- ✅ Anthropic API: Likely works (SDK designed for it)
- ❓ Claude Max: Unknown (needs test)
- ❌ Z.ai: Likely fails (not true Anthropic API, might not support forking endpoint)

---

### Test 3: Extended Caching with Different Providers

**Goal:** Determine which providers support 1-hour extended caching

**Setup:**
```javascript
// Test 3a: Anthropic API + Extended Caching
Task("CachingTest-Anthropic",
  `Test extended caching with Anthropic API.

   Step 1: Make request with large system prompt (100K tokens)
   Step 2: Wait 10 minutes
   Step 3: Make identical request

   Measure: Cache hit (should be 90% cheaper)
   Report token costs for both requests.`,
  "coder"
)

// Test 3b: Claude Max Subscription + Extended Caching
// (Same test, subscription account)

// Test 3c: Z.ai + Extended Caching
// (Same test, z.ai provider)
```

**Success Criteria:**
- Request 1: Full cost ($15/1M for Anthropic, $0.50/1M for z.ai)
- Request 2: 90% discount if caching works ($1.50/1M for Anthropic)
- Cache hit reported in response metadata

**What We Learn:**
- Whether extended caching requires Anthropic API keys
- Whether Claude Max subscription supports extended caching
- Whether z.ai supports extended caching (unlikely)

**Expected Results:**
- ✅ Anthropic API: Works (documented feature)
- ❓ Claude Max: Unknown (might not support API-level caching)
- ❌ Z.ai: Likely fails (GLM models may not support Anthropic caching protocol)

---

### Test 4: Context Editing with Different Providers

**Goal:** Test automatic context editing (84% token reduction)

**Setup:**
```javascript
// Test 4a: Long conversation with context editing
Task("ContextEditingTest",
  `Perform 20 sequential file reads.

   Read 20 different files in sequence.
   After each read, report current context usage.

   Expected: Context editing kicks in around 70% full
   Result: Context should drop back to ~40% full

   Report:
   - Context usage before/after editing
   - Files still in context after editing
   - Whether summaries replace full content`,
  "coder"
)
```

**Success Criteria:**
- Context usage peaks at ~70%
- Automatic editing reduces to ~40%
- Stale tool results removed
- Recent context preserved

**What We Learn:**
- Whether context editing is provider-agnostic (likely yes - it's client-side SDK logic)
- Effectiveness across providers

**Expected Results:**
- ✅ All providers: Should work (SDK-side feature, not API-dependent)

---

### Test 5: Memory Tool with Different Providers

**Goal:** Confirm memory tool is provider-agnostic (file-based)

**Setup:**
```javascript
// Test with any provider
Task("MemoryTest",
  `Test SDK memory tool.

   Step 1: Create memory entry (decisions/test.md)
   Step 2: Write "Test decision: Use JWT tokens"
   Step 3: Read memory entry
   Step 4: Report success/failure`,
  "coder"
)
```

**Success Criteria:**
- File created in `.memory/` directory
- Content readable across sessions
- Works regardless of provider

**What We Learn:**
- Confirm memory tool is file-based (provider-agnostic)

**Expected Results:**
- ✅ All providers: Should work (file-based storage, no API dependency)

---

### Test 6: Artifacts with Different Providers

**Goal:** Test SDK artifact storage for fast state sharing

**Setup:**
```javascript
// Test 6a: Artifact creation and sharing
Task("ArtifactTest",
  `Test SDK artifacts.

   Step 1: Create artifact "test-data.json" with {"foo":"bar"}
   Step 2: Read artifact back
   Step 3: Report whether binary storage works
   Step 4: Measure read/write speed (<10ms target)`,
  "coder"
)
```

**Success Criteria:**
- Artifact created successfully
- Read/write <10ms
- Binary format (not text JSON)

**What We Learn:**
- Whether artifacts require specific API support
- Performance across providers

**Expected Results:**
- ✅ Anthropic API: Likely works (SDK feature)
- ❓ Claude Max: Unknown
- ❓ Z.ai: Unknown (might not support artifact API endpoint)

---

### Test 7: Query Control (Pause/Resume) with Different Providers

**Goal:** Test zero-cost agent pausing

**Setup:**
```javascript
// Test 7a: Pause/resume mechanics
Task("QueryControlTest",
  `Test SDK query control.

   Step 1: Start long task (simulate with sleep 10s)
   Step 2: Pause after 2s
   Step 3: Wait 5s (agent should consume zero tokens)
   Step 4: Resume
   Step 5: Report token usage during pause (should be 0)`,
  "coder"
)
```

**Success Criteria:**
- Agent pauses successfully
- Token usage = 0 during pause
- Agent resumes exactly where it left off

**What We Learn:**
- Whether query control is API-specific or works universally

**Expected Results:**
- ✅ Anthropic API: Likely works (SDK feature)
- ❓ Claude Max: Unknown (might not support pause API)
- ❌ Z.ai: Likely fails (non-standard endpoint)

---

### Test 8: Checkpointing with Different Providers

**Goal:** Confirm checkpointing is file-based (provider-agnostic)

**Setup:**
```javascript
// Test with any provider
Task("CheckpointTest",
  `Test SDK checkpointing.

   Step 1: Create checkpoint "pre-edit"
   Step 2: Edit file (modify src/test.js)
   Step 3: Create checkpoint "post-edit"
   Step 4: Rollback to "pre-edit"
   Step 5: Verify file reverted
   Step 6: Report success/failure`,
  "coder"
)
```

**Success Criteria:**
- Checkpoints created successfully
- Rollback restores previous state
- Works regardless of provider

**What We Learn:**
- Confirm checkpointing is file-based (Git-like)

**Expected Results:**
- ✅ All providers: Should work (file-based, no API dependency)

---

### Test 9: Hooks (Pre/Post Tool) with Different Providers

**Goal:** Confirm hooks are file-based (provider-agnostic)

**Setup:**
```javascript
// Configure hook in .claude/settings.json
{
  "hooks": {
    "postToolUse": {
      "Edit": "echo 'Post-edit hook triggered'"
    }
  }
}

// Test with any provider
Task("HookTest",
  `Test SDK hooks.

   Step 1: Edit file src/test.js
   Step 2: Hook should trigger automatically
   Step 3: Report whether hook executed
   Step 4: Report hook output`,
  "coder"
)
```

**Success Criteria:**
- Hook triggers after Edit tool
- Output logged
- Works regardless of provider

**What We Learn:**
- Confirm hooks are file-based (provider-agnostic)

**Expected Results:**
- ✅ All providers: Should work (file-based config, local execution)

---

## Pure Z.ai Testing: What Can We Gain?

**Hypothesis:** Even without SDK, z.ai provides cost savings. With SDK-compatible features, we gain more.

### Test 10: Pure Z.ai Coordinator (No SDK Features)

**Goal:** Baseline test of z.ai without any SDK enhancements

**Setup:**
```bash
# Direct CLI spawn (no Task tool, no SDK)
node tests/manual/test-swarm-direct.js \
  "Generate 5 files" \
  --executor \
  --max-agents 5 \
  --provider zai \
  --model glm-4.6
```

**Measure:**
- Spawn time
- File generation success rate
- Cost (should be $0.10-2/1M tokens)

**What We Gain:**
- ✅ Cost savings (87-99% vs Anthropic)
- ✅ Redis coordination (production-proven)
- ❌ No context editing
- ❌ No extended caching
- ❌ No session forking
- ❌ No query control

### Test 11: Z.ai + File-Based SDK Features

**Goal:** Test which SDK features work with z.ai

**Setup:**
```javascript
// Coordinator uses Anthropic API/subscription (has SDK)
// Workers use z.ai (cheap)
// File-based features should work

Task("HybridTest",
  `Spawn 5 z.ai workers via CLI.

   Use SDK memory tool to track worker progress.
   Use SDK checkpointing before spawning.
   Use SDK hooks to validate worker outputs.

   Report which features work with z.ai workers.`,
  "coordinator"
)
```

**What We Gain:**
- ✅ Cost savings on workers (z.ai pricing)
- ✅ Memory tool (coordinator stores worker state)
- ✅ Checkpointing (coordinator can rollback)
- ✅ Hooks (coordinator validates worker outputs)
- ❌ Session forking (z.ai workers spawned via CLI, not SDK forks)
- ❌ Extended caching (z.ai doesn't support)
- ❌ Query control (z.ai workers can't pause)

---

## Test Execution Plan

### Phase 1: Basic Validation (1 hour)

**Goal:** Confirm fundamental assumptions

```bash
# Test 1: Task tool with subscription
# (Already in this session - we know it works!)

# Test 5: Memory tool (file-based)
# Test 8: Checkpointing (file-based)
# Test 9: Hooks (file-based)
```

**Expected: All pass (file-based features are provider-agnostic)**

### Phase 2: API-Dependent Features (2 hours)

**Goal:** Identify API-only limitations

```bash
# Test 3: Extended caching
# Test 6: Artifacts
# Test 7: Query control
```

**Expected:**
- Anthropic API: All pass
- Claude Max: Some failures (extended caching might not work)
- Z.ai: Most failures (non-standard API)

### Phase 3: Session Forking (Critical Test - 2 hours)

**Goal:** Determine if session forking works with subscription/z.ai

```bash
# Test 2a: Anthropic API + Session Forking
# Test 2b: Claude Max + Session Forking
# Test 2c: Z.ai + Session Forking
```

**Expected:**
- Anthropic API: Pass
- Claude Max: Unknown (50/50 chance)
- Z.ai: Fail (non-standard endpoint)

### Phase 4: Hybrid Testing (2 hours)

**Goal:** Validate hybrid coordinator (subscription) + workers (z.ai)

```bash
# Test 10: Pure z.ai baseline
# Test 11: Hybrid (SDK coordinator + z.ai workers)
```

**Expected:**
- Pure z.ai: Works, but no SDK benefits
- Hybrid: Coordinator gets SDK features, workers get cost savings

---

## Decision Matrix Based on Test Results

### Scenario 1: Session Forking Requires Anthropic API

**If Test 2a passes, Test 2b/2c fail:**

```
Options:
1. Coordinator uses Anthropic API ($15/1M tokens)
   Workers use z.ai CLI ($0.10-2/1M)
   Result: Session forking works, 80-95% cost savings

2. All agents use z.ai CLI (no session forking)
   Result: No session forking, 87-99% cost savings, slower spawning

Trade-off: Pay $0.15-0.45 for coordinator API usage, gain 10-20x faster spawning
```

### Scenario 2: Session Forking Works with Claude Max

**If Test 2b passes:**

```
Options:
1. Coordinator uses Claude Max subscription ($0 cost!)
   Workers use z.ai CLI ($0.10-2/1M)
   Result: Session forking works, 95-99% cost savings!

2. All agents use Claude Max subscription
   Result: $0 cost, but limited by subscription quota

Trade-off: None! Subscription coordinator + z.ai workers = optimal
```

### Scenario 3: Extended Caching Requires API

**If Test 3a passes, Test 3b/3c fail:**

```
Implication:
- 90% cost reduction on cached content ONLY available with Anthropic API
- Coordinator should use API if repetitive operations common
- Workers don't benefit from caching (task-specific, short-lived)

Recommendation:
- Coordinator uses Anthropic API (benefits from caching)
- Workers use z.ai CLI (no caching benefit anyway)
```

---

## Minimal Test Script (Quick Validation)

### Quick Test 1: Subscription vs API (5 minutes)

```javascript
// Run in current Claude Code session
Task("QuickTest1",
  "Echo 'Task tool works with subscription'. Report success.",
  "coder"
)

// Result: If this works, subscription supports Task tool ✅
```

### Quick Test 2: Session Forking (10 minutes)

```javascript
Task("QuickTest2",
  `Attempt SDK session forking:

   Try: await sessionManager.forkSession('test')
   Report: Success or error message

   If error contains "API key" → Requires API
   If error contains "not supported" → Feature unavailable
   If success → Works with subscription!`,
  "coordinator"
)
```

### Quick Test 3: Z.ai Compatibility (5 minutes)

```bash
# Test z.ai API directly
curl -X POST https://api.z.ai/api/anthropic/v1/messages \
  -H "x-api-key: $Z_AI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "glm-4.6",
    "max_tokens": 100,
    "messages": [{"role":"user","content":"Hello"}]
  }'

# If response successful → z.ai works
# Check response headers for caching support
# Check API docs for session forking endpoint
```

---

## Expected Outcomes & Recommendations

### Most Likely Outcome

Based on research and API patterns:

**Subscription Features:**
- ✅ Task tool
- ✅ Memory tool
- ✅ Checkpointing
- ✅ Hooks
- ❌ Extended caching (API-only)
- ❓ Session forking (unknown)
- ❌ Query control (API-only)

**Z.ai Features:**
- ✅ Basic model access
- ✅ Cost savings (87-99%)
- ✅ Redis coordination
- ❌ Extended caching
- ❌ Session forking
- ❌ Query control
- ❌ Artifacts

**Optimal Configuration:**
```
Coordinator: Claude Max subscription (if session forking works)
          OR Anthropic API (if session forking requires it)
Workers: Z.ai CLI (cost savings)
File Features: All providers (memory, checkpoints, hooks)
```

### Recommendation Priority

**If session forking works with subscription:**
→ **Use hybrid: Subscription coordinator + z.ai workers**
- Cost: ~$0.70 (just workers)
- Benefits: Session forking, memory, checkpoints, hooks
- Savings: 95-99% vs pure Anthropic

**If session forking requires API:**
→ **Use hybrid: API coordinator + z.ai workers**
- Cost: ~$1.16 (coordinator $0.46 + workers $0.70)
- Benefits: All SDK features including extended caching
- Savings: 85-95% vs pure Anthropic

**If session forking doesn't work anywhere:**
→ **Use pure router: z.ai CLI for all**
- Cost: ~$0.70 (just workers)
- Benefits: Cost savings, Redis coordination (production-proven)
- Savings: 87-99% vs pure Anthropic
- Trade-off: Slower spawning (sequential instead of parallel)

---

## Next Steps

1. **Run Quick Tests** (20 minutes)
   - Validate subscription supports Task tool
   - Test session forking availability
   - Test z.ai API compatibility

2. **Run Full Test Suite** (4-6 hours)
   - Tests 1-9: Feature availability
   - Tests 10-11: Hybrid validation

3. **Document Results** (1 hour)
   - Update cost optimization docs with findings
   - Update hybrid approach docs with limitations
   - Create provider compatibility matrix

4. **Update Strategy** (30 minutes)
   - Choose optimal configuration based on results
   - Update implementation roadmap
   - Adjust cost projections

---

## Test Results Template

```markdown
# SDK Limitations Test Results

**Date:** [DATE]
**Tester:** [NAME]
**Environment:** [Claude Max / API / Z.ai]

## Test Results Summary

| Test | Anthropic API | Claude Max | Z.ai | Notes |
|------|---------------|------------|------|-------|
| Task tool | ✅ / ❌ | ✅ / ❌ | ✅ / ❌ | |
| Session forking | ✅ / ❌ | ✅ / ❌ | ✅ / ❌ | |
| Extended caching | ✅ / ❌ | ✅ / ❌ | ✅ / ❌ | |
| Context editing | ✅ / ❌ | ✅ / ❌ | ✅ / ❌ | |
| Memory tool | ✅ / ❌ | ✅ / ❌ | ✅ / ❌ | |
| Artifacts | ✅ / ❌ | ✅ / ❌ | ✅ / ❌ | |
| Query control | ✅ / ❌ | ✅ / ❌ | ✅ / ❌ | |
| Checkpointing | ✅ / ❌ | ✅ / ❌ | ✅ / ❌ | |
| Hooks | ✅ / ❌ | ✅ / ❌ | ✅ / ❌ | |

## Detailed Findings

[Test-by-test analysis]

## Recommendations

[Based on results, which configuration to use]
```

---

## Conclusion

**The tests above will definitively answer:**
1. ✅ Does SDK require API keys? → Test 1 answers this
2. ✅ Is caching API-only? → Test 3 answers this
3. ✅ Can coordinators use subscription? → Test 2 answers this
4. ✅ Can z.ai gain SDK benefits? → Tests 10-11 answer this
5. ✅ Which features work where? → Full matrix filled in

**Time investment:** 6-8 hours for comprehensive validation

**ROI:** Definitive answers prevent months of wasted effort on wrong approach!
