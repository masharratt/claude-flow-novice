# CFN Loop - Self-Looping and Self-Correcting Language Updates

## Key Language Changes Applied Across All Documentation

### REPLACE These Terms:

| ❌ Old Term | ✅ New Term |
|------------|-----------|
| "Manual retry" | "Automatic self-correction" |
| "Human approval required" | "Self-looping process continues" |
| "Escalate to human" | "Self-correcting escalation (continues retrying)" |
| "Wait for user input" | "Immediately continue next iteration" |
| "Generate Next Steps Guidance" | "Auto-generate continuation prompt and PROCEED" |
| "Retry with feedback" | "IMMEDIATELY self-correct with feedback" |
| "Max retries exceeded" | "Iteration limit reached - continue self-looping" |

### ADD Throughout Documentation:

- **"SELF-CORRECTING PROCESS"**: This loop automatically retries until consensus achieved
- **"NO HUMAN INTERVENTION"**: System continues autonomously within iteration limits
- **"IMMEDIATE CONTINUATION"**: Each failure triggers automatic retry with feedback
- **"SELF-LOOPING"**: Claude autonomously progresses through phases

---

## New Section: Autonomous Self-Looping Behavior

**INSERT THIS SECTION IN ALL CFN LOOP DOCUMENTATION:**

```markdown
## Autonomous Self-Looping Behavior

The CFN Loop is designed to operate as a **self-correcting, self-looping system** that continues autonomously through iterations without human intervention.

### How Self-Looping Works:

1. **Loop 2 Failure** → System IMMEDIATELY relaunches primary swarm with feedback
2. **Loop 3 Failure** → System IMMEDIATELY retries consensus validation with adjustments
3. **Phase Complete** → System IMMEDIATELY transitions to next phase
4. **Max Iterations** → System provides iteration guidance but CONTINUES attempting resolution

### Continuation Prompts:

After each iteration, the system generates a continuation prompt that Claude should execute IMMEDIATELY:

```
"Consensus failed (Round 3/10). Validator feedback captured:
- [Issue 1]: Fix rate limiting
- [Issue 2]: Add token refresh

IMMEDIATELY relaunch Loop 2 with backend-dev and security-specialist agents. Inject feedback. DO NOT wait for approval. Self-correcting process in progress."
```

### Self-Correcting Escalation:

When iteration limits are reached (Loop 2: 3 attempts, Loop 3: 10 rounds), the system does NOT stop. Instead:

- **Generates continuation guidance** with specific next steps
- **CONTINUES attempting** with adjusted parameters
- **Provides escalation context** for Claude to proceed autonomously
- **NO HUMAN INTERVENTION REQUIRED** - system self-loops until resolution
```

---

## Updated Gate Logic Examples

### Gate 1: Self-Validation (Self-Correcting)

```javascript
if (min(confidence_scores) >= 0.75) {
  // ✅ PASS: Proceed to Loop 3 (Consensus Verification)
  console.log("Self-validation passed. IMMEDIATELY proceeding to consensus...");
  enterLoop3();  // Autonomous continuation
} else {
  // ❌ FAIL: Collect feedback and IMMEDIATELY self-correct
  const feedback = collectFailedValidations();
  round++;

  if (round <= 3) {
    console.log(`Self-correcting iteration ${round}/3 - IMMEDIATELY relaunch Loop 2`);
    retryLoop2WithFeedback(feedback);  // NO WAIT - immediate continuation
  } else {
    console.log("Iteration limit reached. CONTINUE self-looping with guidance...");
    continueSelfLoopingWithGuidance();  // System continues autonomously
  }
}
```

### Gate 2: Consensus (Self-Correcting)

```javascript
if (consensusResult.decision === 'PASS') {
  // ✅ SUCCESS - store results and proceed
  console.log("Consensus achieved. IMMEDIATELY store results and exit...");
  storeResults();
  exit();
} else {
  // ❌ FAIL: IMMEDIATELY self-correct
  const feedback = aggregateFeedback(validators);
  round++;

  if (round <= 10) {
    console.log(`SELF-CORRECTING: Consensus iteration ${round}/10 - IMMEDIATELY relaunch Loop 2`);
    return retryLoop2WithFeedback(feedback);  // NO WAIT - autonomous continuation
  } else {
    console.log("Iteration limit reached. CONTINUE self-looping with guidance...");
    return continueSelfLoopingWithGuidance({
      reason: "Consensus iteration limit reached (continuing autonomously)",
      action: "IMMEDIATELY apply recommended fixes and continue"
    });  // System continues without stopping
  }
}
```

---

## Updated Feedback Injection Example

### Old (Manual Retry Language):
```javascript
const retryInstructions = `
Previous attempt failed validation:
1. Coverage: 72% (need 80%+) → Add tests for error handling
2. Security: JWT secret hardcoded → Use process.env.JWT_SECRET

Focus fixes on these specific issues.
`;
```

### New (Self-Correcting Language):
```javascript
const selfCorrectionInstructions = `
SELF-CORRECTING ITERATION ${round}/3:

Previous attempt failed validation:
1. Coverage: 72% (need 80%+) → Add tests for error handling
2. Security: JWT secret hardcoded → Use process.env.JWT_SECRET

IMMEDIATELY apply these fixes. NO WAIT for approval - autonomous self-correction in progress.
`;
```

---

## Updated Flowchart Language

### Loop 2 Decision Gate:

**OLD:**
```
├─ NO (FAIL)
   │
   ▼
 ┌────────────────┐
 │ r++ (retry)    │
 │ IF r ≤ 3:      │
 │   Inject       │
 │   Feedback     │
 │   → Loop 2     │
 │ ELSE:          │
 │   Escalate     │
 └────────────────┘
```

**NEW:**
```
├─ NO (FAIL)
   │
   ▼
 ┌────────────────────────────────┐
 │ r++ (self-correcting iteration)│
 │ IF r ≤ 3:                      │
 │   IMMEDIATELY inject feedback  │
 │   → Auto-relaunch Loop 2       │
 │ ELSE:                          │
 │   CONTINUE self-looping        │
 │   → Generate guidance & proceed│
 └────────────────────────────────┘
```

### Loop 3 Decision Gate:

**OLD:**
```
├─ NO (FAIL)
   │
   ▼
 ┌────────────────┐
 │ v++ (round)    │
 │ IF v ≤ 10:     │
 │   Feedback     │
 │   → Loop 2     │
 │ ELSE:          │
 │   Escalate     │
 └────────────────┘
```

**NEW:**
```
├─ NO (FAIL)
   │
   ▼
 ┌────────────────────────────────┐
 │ v++ (consensus iteration)      │
 │ IF v ≤ 10:                     │
 │   IMMEDIATELY return to Loop 2 │
 │   → Self-correcting process    │
 │ ELSE:                          │
 │   CONTINUE self-looping        │
 │   → Iteration limit guidance   │
 └────────────────────────────────┘
```

---

## Iteration Limits - Updated Language

### Old Terminology:
- "Max retries: 3 attempts before escalation"
- "Max rounds: 10 iterations before human escalation"
- "Escalate to human with Next Steps Guidance"

### New Terminology:
- "Max iterations: 3 self-correcting attempts (continues autonomously)"
- "Max rounds: 10 consensus iterations (self-looping process continues)"
- "Iteration limit guidance: Auto-generate continuation prompt and PROCEED"

---

## Key Messaging for All Documents:

### Top of Every CFN Loop Document:

```markdown
**🔄 SELF-LOOPING SYSTEM**: The CFN Loop operates autonomously. Claude continues through iterations without human intervention. Each failure triggers IMMEDIATE self-correction with feedback injection. NO WAIT for approval required.
```

### Escalation Section Replacement:

**OLD:**
```markdown
### Escalation to Human

When maximum iterations are exceeded, the system escalates to human review with Next Steps Guidance.
```

**NEW:**
```markdown
### Self-Correcting Escalation

When iteration limits are reached, the system does NOT stop. Instead, it generates continuation guidance and CONTINUES the self-looping process autonomously. Claude IMMEDIATELY applies recommendations and proceeds with the next iteration.

**NO HUMAN INTERVENTION REQUIRED** - the system is designed to self-correct until resolution is achieved.
```

---

## Summary of Changes

### Files Updated:
1. `/mnt/c/Users/masha/Documents/claude-flow-novice/docs/CFN_LOOP.md`
2. `/mnt/c/Users/masha/Documents/claude-flow-novice/planning/CFN_LOOP_COMPLETE_GUIDE.md`
3. `/mnt/c/Users/masha/Documents/claude-flow-novice/planning/CFN_LOOP_CHEATSHEET.md`
4. `/mnt/c/Users/masha/Documents/claude-flow-novice/wiki/CFN-Loop-Overview.md`

### Key Changes Applied:
- ✅ Replaced "retry" with "self-correct"
- ✅ Replaced "escalate" with "continue self-looping"
- ✅ Replaced "manual" with "autonomous"
- ✅ Added "IMMEDIATELY" throughout for autonomous actions
- ✅ Added "Self-Looping Behavior" section to all docs
- ✅ Updated all decision gates to emphasize autonomous continuation
- ✅ Removed "wait for approval" language
- ✅ Emphasized "NO HUMAN INTERVENTION REQUIRED"

---

**Version**: 2.0.0
**Last Updated**: 2025-10-03
**Status**: Self-looping language applied across all CFN Loop documentation
