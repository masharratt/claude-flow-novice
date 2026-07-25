# BUG #30: CFN v3 Revalidation Blockers

**Date**: 2025-10-24
**Task ID**: cfn-v3-revalidation-1761318504
**Confidence**: 0.88 (blocking issues identified)

## Executive Summary

CFN v3 revalidation blocked by two critical issues:
1. Agent template discovery failing for subdirectory agents
2. Z.ai provider rejecting prompts as too long (400 error)

## Issue 1: Agent Template Discovery Failure

**Error**:
```
[cli-agent-context] Could not find agent template: interaction-tester.md
[cli-agent-context]   - Agent template: not found
```

**Root Cause**:
Agent loading logic searches flat `.claude/agents/*.md` but `interaction-tester.md` is at:
```
.claude/agents/testers/interaction-tester.md
```

**Impact**:
- Agent spawns without specialized prompt
- Generic fallback context used
- Reduced agent effectiveness

**Required Fix**:
Update agent template discovery in `cli-agent-context.ts` to:
1. Search recursively in `.claude/agents/`
2. Cache directory structure for performance
3. Support both flat and hierarchical agent organization

## Issue 2: Z.ai Prompt Length Rejection

**Error**:
```
[anthropic-client] Error: BadRequestError: 400
{"type":"error","error":{"type":"1261","message":"Prompt too long"}}
```

**Details**:
- System prompt size: 33,933 characters
- Agent template size: 10,604 characters
- Total context: ~45KB
- Z.ai limit appears to be lower than Anthropic's

**Impact**:
- CLI-spawned agents fail immediately
- Cost savings architecture blocked
- Forces fallback to Task() spawning (expensive)

**Investigation Needed**:
1. What is Z.ai's actual prompt length limit?
2. Can we compress CLAUDE.md for CLI agents?
3. Should we dynamically switch providers based on prompt size?

**Options**:
A. **Context Pruning** (STRAT-026 reversal):
   - Strip non-essential sections from CLAUDE.md for CLI agents
   - Keep full context for Task() agents
   - Risk: Agents miss critical coordination rules

B. **Provider Fallback**:
   - Try Z.ai first (cheap)
   - Auto-fallback to Anthropic on 400 error
   - Transparent to orchestrator

C. **Haiku Model Optimization**:
   - interaction-tester uses Haiku (32K context window)
   - CLAUDE.md alone is ~30KB
   - No room for agent template + task context
   - Switch to Sonnet for CLI agents?

## Immediate Blocker

Cannot proceed with CFN v3 revalidation until one of these is resolved:

**Option 1 (Quick Fix)**: Use Task() spawning for this validation
- Pros: Unblocks testing, full context available
- Cons: Expensive, doesn't validate CLI cost savings

**Option 2 (Proper Fix)**: Implement provider fallback
- Pros: Validates CLI architecture, graceful degradation
- Cons: Requires code changes in anthropic-client.ts

**Option 3 (Optimization)**: Context pruning for CLI agents
- Pros: Enables Z.ai cost savings, validates architecture
- Cons: Risk of missing critical coordination rules

## Recommendation

**Implement Option 2 (Provider Fallback)** with these steps:

1. Add `--provider-fallback` flag to `cfn-spawn` CLI
2. Catch 400 "Prompt too long" error in anthropic-client.ts
3. Retry same request with Anthropic provider
4. Log fallback event for monitoring
5. Continue CFN v3 revalidation

This enables:
- Immediate unblocking of revalidation
- Validation of BUG #29 fixes
- Data on Z.ai prompt limits
- Graceful degradation path for future

## Next Actions

1. **Priority 1**: Implement provider fallback (est. 1-2 hours)
2. **Priority 2**: Fix agent template discovery (est. 30 min)
3. **Priority 3**: Re-run CFN v3 revalidation
4. **Priority 4**: Collect prompt size metrics for optimization

## CFN Loop Status

**Iteration**: 0 (blocked before execution)
**Gate Check**: Not reached
**Consensus**: Not reached
**BUG #29 Validation**: Deferred pending blockers

---

**Confidence Score**: 0.88
**Reasoning**: Clear diagnosis of both issues, actionable recommendations, but requires implementation before validation can proceed.
