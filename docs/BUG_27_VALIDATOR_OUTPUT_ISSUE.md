# BUG #27: Validator Default Consensus Pattern

## Status
**OPEN** - Discovered during Phase 2 execution (2025-10-22)

## Severity
**HIGH** - Blocks iteration reduction testing, causes infinite loops

## Description
Loop 2 validator agents consistently report default consensus (0.70) with zero feedback items across all iterations, preventing consensus from reaching threshold and causing infinite iteration loops.

## Symptoms
- All validators (reviewer, tester, security-specialist) report 0.70 confidence
- No feedback items generated (0C/0W/0S pattern)
- Consensus never improves across iterations
- Orchestrator runs all max iterations (10) before stopping

## Evidence
```
Iteration 1: reviewer-1-1 complete (29751ms, confidence: 0.70 [default], feedback: 0C/0W/0S)
Iteration 1: tester-1-1 complete (58635ms, confidence: 0.70 [default], feedback: 0C/0W/0S)
Iteration 1: security-specialist-1-1 complete (21498ms, confidence: 0.70 [default], feedback: 0C/0W/0S)
Average consensus: .70 (from 3 validators)

Iteration 2: Same pattern (0.70, 0C/0W/0S)
Iteration 3: Same pattern (0.70, 0C/0W/0S)
Iteration 4: Same pattern (0.70, 0C/0W/0S)
```

## Root Cause Analysis

### Hypothesis 1: Agent Skills Missing Structured Output
Validator agent skills may not be generating required output format:
- Expected: Confidence score (0.0-1.0) + Feedback {CRITICAL: [...], WARNING: [...], SUGGESTION: [...]}
- Actual: No explicit output (falls back to default 0.70)

### Hypothesis 2: Output Processing Skill Parsing Failure
`.claude/skills/loop2-output-processing/process-validator-output.sh` may be failing to extract:
- Confidence scores from agent output
- Feedback items from agent output
- Falling back to defaults when parsing fails

### Hypothesis 3: Agent Context Insufficient
Validator agents may not be receiving enough context to perform validation:
- Missing Loop 3 agent outputs
- Missing deliverable list
- Missing acceptance criteria

## Impact

### Iteration Reduction Testing Blocked
Phase 2 could not validate 4 iteration-reduction improvements:
1. Deliverable pre-verification (executed but ineffective)
2. Explicit file checklist (provided but not utilized)
3. Iteration blocking fix (not reached)
4. Pre-edit backup mechanism (not reached)

### Infinite Iteration Loops
Without improving consensus, orchestrator runs all max iterations:
- Phase 2: 4+ iterations attempted (manually stopped)
- Expected: 1-2 iterations with proper feedback

### Cost Impact
Running unnecessary iterations increases costs:
- Loop 3: 1 agent × 10 iterations = 10 agent calls
- Loop 2: 3 validators × 10 iterations = 30 agent calls
- Product Owner: 1 × 10 iterations = 10 agent calls
- Total: 50 agent calls vs expected 6-12

## Investigation Steps

### Step 1: Manual Validator Agent Test
Spawn single validator agent with explicit task:
```bash
npx cfn-spawn agent reviewer \
  --task-id "test-validator-output" \
  --context "Review implementation: .claude/skills/redis-coordination/invoke-gate-ack.sh"
```

Expected: Agent generates structured output with confidence + feedback
Actual: TBD

### Step 2: Output Processing Debug
Enable debug logging in `process-validator-output.sh`:
```bash
DEBUG=1 ./.claude/skills/loop2-output-processing/process-validator-output.sh \
  --agent-type "reviewer" \
  --task-id "test" \
  --agent-id "reviewer-1-1"
```

Examine parsing logic for confidence and feedback extraction.

### Step 3: Agent Skill Review
Review validator agent skill implementations:
- `.claude/skills/reviewer/SKILL.md`
- `.claude/skills/tester/SKILL.md`
- `.claude/skills/security-specialist/SKILL.md`

Verify they specify structured output requirements.

## Fix Proposals

### Option 1: Update Validator Agent Skills (RECOMMENDED)
Add explicit structured output requirements to validator agent skills:

```markdown
## Output Format (REQUIRED)

### Confidence Score
Report validation confidence as decimal 0.0-1.0:
- 0.95-1.0: Excellent, production-ready
- 0.85-0.94: Good, minor improvements
- 0.75-0.84: Acceptable, moderate issues
- 0.60-0.74: Needs work, significant issues
- 0.0-0.59: Unacceptable, major issues

Example: "Confidence: 0.87"

### Feedback Items
Categorize issues by severity:
- CRITICAL: Blocking issues (security, correctness, functionality)
- WARNING: Important but non-blocking (performance, style, best practices)
- SUGGESTION: Optional improvements (refactoring, enhancements)

Example:
```
CRITICAL:
- Missing error handling in line 42

WARNING:
- Inefficient algorithm in process_data()

SUGGESTION:
- Consider adding JSDoc comments
```
```

### Option 2: Enhance Output Processing Fallback
Improve `process-validator-output.sh` to extract implicit signals:
- If agent mentions "looks good" → 0.85
- If agent lists issues → 0.70 - (0.05 × issue count)
- If agent says "unacceptable" → 0.50

### Option 3: Add Validator Output Validation
Add validation step after Loop 2 completion:
```bash
if [ "$CONSENSUS" = "0.70" ] && [ "$FEEDBACK_COUNT" = "0" ]; then
  echo "⚠️ Warning: Validators produced default output"
  echo "   Possible validator agent skill issue"
  echo "   Aborting iteration loop to prevent waste"
  exit 1
fi
```

## Related Issues
- **BUG #26:** CLI Agent Write Tool False Alarm (related to output processing)
- **BUG #28:** Missing Deliverable Extraction (similar parsing issue)

## Testing
Once fixed, re-run Phase 2 to validate:
1. Validators generate explicit confidence scores
2. Validators generate categorized feedback
3. Consensus improves across iterations
4. Iteration reduction improvements work as designed

## References
- Phase 2 Execution Report: `docs/PHASE_2_EXECUTION_REPORT.md`
- Output Processing Skill: `.claude/skills/loop2-output-processing/process-validator-output.sh`
- Orchestrator: `.claude/skills/redis-coordination/orchestrate-cfn-loop.sh` (lines 1026-1244)
