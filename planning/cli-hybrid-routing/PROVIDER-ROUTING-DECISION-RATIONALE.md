# Provider Routing Architecture Decision

**Date:** October 12, 2025
**Question:** How to maximize cost savings while spawning agent workers?
**Decision:** Use CLI-based hybrid approach (coordinator: subscription, workers: z.ai)

---

## Summary

**Three viable options tested:**

1. **CLI Hybrid** → Coordinator (subscription $0) + Workers (z.ai $0.50/1M)
2. **Pure Z.ai** → All sessions via z.ai ($0.50/1M)
3. **Proxy Method** → All sessions route through API proxy to z.ai ($0.50/1M)

**Chosen:** CLI Hybrid (Option 1)

**Rationale:** Same cost as alternatives, better quality coordinator, production-proven (350+ API calls), acceptable 10s spawning delay.

---

## Test Results

### Test 1: Session Forking with Provider Override

**Goal:** Fork sessions from Claude Max to z.ai via environment variable injection.

**Method:**
```javascript
query({
  options: {
    forkSession: true,
    env: { ANTHROPIC_BASE_URL: "https://api.z.ai/..." }
  }
})
```

**Result:** ❌ Failed - Process exit code 1
**Cause:** SDK subprocess ignores parent-injected `ANTHROPIC_BASE_URL`

---

### Test 2: Session Forking with Z.ai as Primary

**Goal:** Test if session forking works when z.ai is main provider.

**Method:**
```bash
bash scripts/switch-api.sh zai
node test-fork-zai-as-provider.js
```

**Result:** ✅ Success
- Basic forking: Works
- Parallel forking: Works (3 concurrent)
- Provider switching: Not supported

**Key Finding:** Session forking works, but all sessions use same provider. Cannot mix providers via forking.

---

### Test 3: Agentic-Flow Proxy Architecture

**Goal:** Understand how agentic-flow achieves provider switching with SDK features.

**Discovery:** API proxy intercepts Claude Code SDK calls.

**Architecture:**
```
Claude Code SDK → ANTHROPIC_BASE_URL=localhost:3000 → Proxy → OpenRouter/Z.ai
```

**Method:**
```bash
export ANTHROPIC_BASE_URL=http://localhost:3000
claude  # All sessions (including forks) use proxy
```

**Result:** ✅ Works
- All SDK features preserved (tools, streaming, memory)
- Session forking inherits proxy config
- Format translation: Anthropic ↔ OpenRouter/Gemini/Z.ai

**Critical Difference:** Environment set in parent shell (not per-fork override).

---

## Architecture Comparison

### Option 1: CLI Hybrid (CHOSEN)

**Architecture:**
```
Main Session (Claude Max subscription)
  ↓
  Task("Coordinator", "spawn workers via CLI")
  ↓
  Bash: node swarm.js --max-agents 5
  ↓
  Workers (z.ai API)
```

**Spawning:** Sequential (~10s for 5 agents)
**Coordination:** Redis pub/sub
**Production Status:** Proven (350+ API calls, 100% success)

**Costs (1M tokens):**
- Coordinator: $0 (subscription)
- Workers: 5 × 200K × $0.50/1M = $0.50
- Total: $0.50

**Quality:**
- Coordinator: Claude 3.5 Sonnet (highest)
- Workers: GLM-4.6 (good)

**Tradeoffs:**
- ✅ Best coordinator quality
- ✅ Production-proven
- ✅ No proxy complexity
- ⚠️ Sequential spawning (10s slower)
- ⚠️ Redis coordination required

---

### Option 2: Pure Z.ai with Session Forking

**Architecture:**
```
Main Session (z.ai)
  ↓
  query({ forkSession: true }) × 5
  ↓
  Workers (all z.ai)
```

**Spawning:** Parallel (<500ms for 5 agents)
**Coordination:** SDK session management
**Production Status:** Validated in tests

**Costs (1M tokens):**
- All sessions: $0.50
- Total: $0.50

**Quality:**
- All: GLM-4.6 (good, not excellent)

**Tradeoffs:**
- ✅ Parallel spawning (9.5s faster)
- ✅ No Redis needed
- ✅ Simpler implementation
- ⚠️ Lower coordinator quality
- ⚠️ No subscription benefit

---

### Option 3: Proxy-Based Routing

**Architecture:**
```
Proxy Server (localhost:3000)
  ↓
Main Session (ANTHROPIC_BASE_URL=proxy)
  ↓
  query({ forkSession: true }) × 5
  ↓
  Proxy routes to z.ai
```

**Spawning:** Parallel (<500ms)
**Coordination:** SDK session management
**Production Status:** Agentic-flow proven, not tested in our codebase

**Costs (1M tokens):**
- All sessions: $0.50
- Total: $0.50

**Quality:**
- All: GLM-4.6 (good)

**Setup:**
- Proxy server: 4-6 hours implementation
- Format translation: Minimal (z.ai Anthropic-compatible)

**Tradeoffs:**
- ✅ Parallel spawning
- ✅ Provider flexibility
- ✅ All SDK features preserved
- ⚠️ Proxy complexity
- ⚠️ Additional infrastructure
- ⚠️ No subscription benefit

---

## Cost Analysis

**All options cost $0.50/1M tokens** (same).

**Spawning Time Impact:**
- Sequential (CLI): 10s for 5 agents
- Parallel (SDK): 0.5s for 5 agents
- Difference: 9.5 seconds

**Real-World Impact:**
- 5-minute task: 10s / 300s = 3% overhead
- 30-minute task: 10s / 1800s = 0.5% overhead
- Negligible for production use

---

## Quality Comparison

| Component | CLI Hybrid | Pure Z.ai | Proxy |
|-----------|-----------|-----------|-------|
| Coordinator | Claude 3.5 Sonnet | GLM-4.6 | GLM-4.6 |
| Workers | GLM-4.6 | GLM-4.6 | GLM-4.6 |
| Overall | Best | Good | Good |

**Coordinator Quality Matters:** Makes architectural decisions, aggregates results, handles errors.

---

## Production Readiness

| Aspect | CLI Hybrid | Pure Z.ai | Proxy |
|--------|-----------|-----------|-------|
| Validation | 350+ API calls | Test suite only | Agentic-flow only |
| Success Rate | 100% | Not measured | Not tested |
| Security Fixes | 26 hours required | 26 hours required | 26 hours + proxy |
| Infrastructure | Redis | None | Redis + Proxy |

**CLI Hybrid** is production-proven. Others require validation.

---

## Decision Factors

### Why Not Pure Z.ai (Option 2)?

**Pros:**
- Parallel spawning (9.5s faster)
- Simpler (no Redis)

**Cons:**
- Lower coordinator quality (GLM-4.6 vs Claude)
- Not production-tested at scale
- Loses subscription benefit

**Verdict:** 9.5s savings not worth quality loss.

---

### Why Not Proxy (Option 3)?

**Pros:**
- Parallel spawning
- Provider flexibility
- All SDK features

**Cons:**
- 4-6 hours setup
- Additional infrastructure
- Not tested in our codebase
- Same cost as CLI hybrid
- No subscription benefit

**Verdict:** Added complexity without cost/quality benefit.

---

## Final Recommendation: CLI Hybrid

**Configuration:**
```javascript
// Main session: Claude Max subscription
Task("Coordinator",
  "Spawn workers: node swarm.js --max-agents 5",
  "coordinator"
)

// Workers use z.ai via CLI
// Coordinator uses Claude Max (subscription)
```

**Reasoning:**

1. **Same cost** as alternatives ($0.50/1M)
2. **Best coordinator quality** (Claude vs GLM-4.6)
3. **Production-proven** (350+ API calls, 100% success)
4. **10s spawning delay acceptable** (0.5-3% overhead)
5. **No additional infrastructure** (proxy not needed)
6. **Retains subscription benefit** (coordinator free)

**Tradeoffs Accepted:**
- Sequential spawning (10s vs 0.5s)
- Redis coordination required

**When to Reconsider:**

1. **Proxy approach** if:
   - Need provider flexibility
   - Spawning speed critical (rapid iteration)
   - Multiple provider routing desired

2. **Pure z.ai** if:
   - Subscription has usage limits
   - Coordinator quality sufficient
   - Redis coordination unwanted

---

## Implementation Requirements

**For CLI Hybrid (Chosen):**
1. Redis coordination (existing)
2. Security fixes: 26 hours
   - Redis authentication (8h)
   - JSON validation (12h)
   - HMAC signing (6h)
3. Update CLAUDE.md with hybrid patterns
4. Coordinator prompt template

**Timeline:** 26 hours security + 2 hours documentation = 28 hours

---

## Key Technical Insights

### Session Forking Limitations

**Cannot override provider per-fork:**
```javascript
// This does NOT work
query({
  options: {
    env: { ANTHROPIC_BASE_URL: "..." }  // Ignored
  }
})
```

**Why:** SDK spawns subprocess with parent env, but subprocess ignores injected overrides.

---

### Proxy Method Works

**Must configure before launching Claude Code:**
```bash
export ANTHROPIC_BASE_URL=http://localhost:3000
claude  # Now all sessions use proxy
```

**Why:** Main process inherits env, all subprocesses (forks) inherit from parent.

**Difference:** Parent env (works) vs. child env injection (doesn't work).

---

### Z.ai API Compatibility

**Validation:**
- 350+ successful API calls
- 100% success rate
- Proven reliability

**Provider Details:**
- Endpoint: https://api.z.ai/api/anthropic/v1
- Format: Anthropic-compatible
- Cost: $0.10-2/1M tokens (97% savings vs Claude)

---

## Reference Documents

**Created during investigation:**
1. `tests/SDK-LIMITATIONS-VALIDATION-RESULTS.md` - Initial SDK tests
2. `tests/SESSION-FORKING-ZAI-TEST-RESULTS.md` - Session forking with z.ai
3. `tests/SESSION-FORKING-COMPARISON-RESULTS.md` - Claude Max vs z.ai comparison
4. `analysis-reports/AGENTIC-FLOW-ROUTING-ANALYSIS.md` - Proxy architecture analysis

**Production validation:**
- `ENTERPRISE_COORDINATION_FINAL_REPORT.md` - 350+ API calls, Layers 1-3

**Cost documentation:**
- `CLAUDE-DRAFT-COST-OPTIMIZATION.md` - Three strategy comparison

---

## Conclusion

**Decision:** CLI-based hybrid approach.

**Primary Reasons:**
1. Best coordinator quality (Claude vs GLM-4.6)
2. Production-proven reliability (350+ calls)
3. Same cost as alternatives ($0.50/1M)
4. 10s spawning overhead negligible (<3%)

**Alternative Valid If:**
- Spawning speed critical → Use proxy
- Coordinator quality sufficient → Use pure z.ai
- Multiple providers needed → Use proxy

**Status:** Ready for production after 26 hours security fixes.
