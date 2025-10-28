# Iteration History Example

This document demonstrates the iteration history flow across 3 CFN Loop iterations.

## Scenario: Authentication Module Implementation

**Task:** Implement JWT authentication with error handling and tests

## Iteration 1

### Agent Spawn
```bash
npx cfn-spawn agent backend-dev --task-id auth-impl --iteration 1
```

### Agent Context (No History)
```markdown
## Current Iteration: 1

This is your first attempt at this task. No previous iteration history available.

## Task
Implement JWT authentication module with error handling and comprehensive tests
```

### Agent Work
- Implements JWT token generation
- Basic validation logic
- Some edge cases missed

### Result Storage
```bash
# Orchestrator stores result after iteration 1
redis-cli setex "swarm:auth-impl:backend-dev:result:iteration-1" 86400 '{
  "result": "Implemented JWT module with token generation and basic validation",
  "confidence": 0.72,
  "iteration": 1,
  "timestamp": "2025-10-20T10:00:00Z"
}'
```

### Validator Feedback
```bash
# Validators provide feedback
redis-cli setex "swarm:auth-impl:backend-dev:feedback:iteration-1" 86400 '{
  "feedback": "Add error handling for expired tokens,Add test coverage for edge cases,Improve validation logic for malformed tokens",
  "iteration": 1,
  "timestamp": "2025-10-20T10:05:00Z"
}'
```

### Gate Check
```
Loop 3 confidence: 0.72
Gate threshold: 0.75
Result: ❌ FAILED - Iteration 2 required
```

---

## Iteration 2

### Agent Spawn
```bash
npx cfn-spawn agent backend-dev --task-id auth-impl --iteration 2
```

### Agent Context (With History)
```markdown
## Iteration History

### Iteration 1
**Result:** Implemented JWT module with token generation and basic validation

**Feedback from Validators:**
- Add error handling for expired tokens
- Add test coverage for edge cases
- Improve validation logic for malformed tokens

**Confidence:** 0.72
**Timestamp:** 2025-10-20T10:00:00Z

---

## Current Iteration: 2

**Your Task:** Address the feedback from the previous iteration:
- Add error handling for expired tokens
- Add test coverage for edge cases
- Improve validation logic for malformed tokens

## Task
Implement JWT authentication module with error handling and comprehensive tests

## Execution Instructions
1. Read and understand the task requirements
2. Review iteration history and feedback from validators
3. Address specific feedback points from previous iteration
4. Execute your core responsibilities as defined above
5. Provide clear, concise output
6. Report confidence score if applicable
```

### Agent Work
- Adds error handling for expired tokens ✅
- Improves validation logic ✅
- Adds test coverage ✅
- Still missing some integration tests

### Result Storage
```bash
redis-cli setex "swarm:auth-impl:backend-dev:result:iteration-2" 86400 '{
  "result": "Added error handling for expired tokens, improved validation logic, and added test coverage for edge cases",
  "confidence": 0.81,
  "iteration": 2,
  "timestamp": "2025-10-20T10:15:00Z"
}'
```

### Validator Feedback
```bash
redis-cli setex "swarm:auth-impl:backend-dev:feedback:iteration-2" 86400 '{
  "feedback": "Add integration tests with real JWT library,Document error codes",
  "iteration": 2,
  "timestamp": "2025-10-20T10:20:00Z"
}'
```

### Gate Check
```
Loop 3 confidence: 0.81
Gate threshold: 0.75
Result: ✅ PASSED - Proceed to Loop 2 validators
```

### Loop 2 Consensus
```
Validators review iteration 2 work
Average consensus: 0.87
Consensus threshold: 0.90
Result: ❌ FAILED - Iteration 3 required
```

---

## Iteration 3

### Agent Spawn
```bash
npx cfn-spawn agent backend-dev --task-id auth-impl --iteration 3
```

### Agent Context (Full History)
```markdown
## Iteration History

### Iteration 1
**Result:** Implemented JWT module with token generation and basic validation

**Feedback from Validators:**
- Add error handling for expired tokens
- Add test coverage for edge cases
- Improve validation logic for malformed tokens

**Confidence:** 0.72
**Timestamp:** 2025-10-20T10:00:00Z

---

### Iteration 2
**Result:** Added error handling for expired tokens, improved validation logic, and added test coverage for edge cases

**Feedback from Validators:**
- Add integration tests with real JWT library
- Document error codes

**Confidence:** 0.81
**Timestamp:** 2025-10-20T10:15:00Z

---

## Current Iteration: 3

**Your Task:** Address the feedback from the previous iteration:
- Add integration tests with real JWT library
- Document error codes

## Task
Implement JWT authentication module with error handling and comprehensive tests

## Execution Instructions
1. Read and understand the task requirements
2. Review iteration history and feedback from validators
3. Address specific feedback points from previous iteration
4. Execute your core responsibilities as defined above
5. Provide clear, concise output
6. Report confidence score if applicable
```

### Agent Work
- Adds integration tests ✅
- Documents all error codes ✅
- Refactors based on learnings from iteration 1 and 2 ✅
- High quality implementation

### Result Storage
```bash
redis-cli setex "swarm:auth-impl:backend-dev:result:iteration-3" 86400 '{
  "result": "Added comprehensive integration tests with real JWT library, documented all error codes, and refactored based on previous feedback",
  "confidence": 0.94,
  "iteration": 3,
  "timestamp": "2025-10-20T10:30:00Z"
}'
```

### Gate Check
```
Loop 3 confidence: 0.94
Gate threshold: 0.75
Result: ✅ PASSED
```

### Loop 2 Consensus
```
Validators review iteration 3 work
Average consensus: 0.93
Consensus threshold: 0.90
Result: ✅ PASSED
```

### Product Owner Decision
```
PROCEED ✅

Task complete!
Final consensus: 0.93
Total iterations: 3
```

---

## Key Observations

### Learning Progression
1. **Iteration 1:** Basic implementation (0.72)
2. **Iteration 2:** Addressed major concerns (0.81)
3. **Iteration 3:** Polish and integration (0.94)

### Token Usage
```
Iteration 1: 6,000 tokens (no history)
Iteration 2: 9,000 tokens (+3,000 for 1 previous iteration)
Iteration 3: 12,000 tokens (+6,000 for 2 previous iterations)

Total: 27,000 tokens
```

### Without Iteration History
```
Iteration 1: 6,000 tokens - Same mistakes repeated
Iteration 2: 6,000 tokens - Partial improvements
Iteration 3: 6,000 tokens - Still missing context
Iteration 4: 6,000 tokens - Finally addresses all concerns
Iteration 5: 6,000 tokens - Refinement

Total: 30,000 tokens (more iterations needed)
```

### Cost Savings
- **With history:** 3 iterations = 27,000 tokens
- **Without history:** 5 iterations = 30,000 tokens
- **Savings:** 10% fewer tokens + faster delivery

### Quality Improvement
- **With history:** Targeted improvements each iteration
- **Without history:** Trial and error approach
- **Result:** Higher final quality (0.93 vs 0.85)

---

## Redis Storage View

After 3 iterations, Redis contains:

```bash
# Results
swarm:auth-impl:backend-dev:result:iteration-1
swarm:auth-impl:backend-dev:result:iteration-2
swarm:auth-impl:backend-dev:result:iteration-3

# Feedback
swarm:auth-impl:backend-dev:feedback:iteration-1
swarm:auth-impl:backend-dev:feedback:iteration-2

# All keys expire after 24 hours
```

## Manual Inspection

```bash
# View iteration 1 result
redis-cli get "swarm:auth-impl:backend-dev:result:iteration-1" | jq .

# View iteration 2 feedback
redis-cli get "swarm:auth-impl:backend-dev:feedback:iteration-2" | jq .

# List all iterations for this agent
redis-cli --scan --pattern "swarm:auth-impl:backend-dev:result:*"

# Check TTL
redis-cli ttl "swarm:auth-impl:backend-dev:result:iteration-1"
# Output: 86399 (seconds remaining)
```

---

## Comparison: With vs Without History

| Aspect | Without History | With History |
|--------|----------------|--------------|
| **Iterations** | 5 | 3 |
| **Total tokens** | 30,000 | 27,000 |
| **Final confidence** | 0.85 | 0.94 |
| **Time to completion** | 25 minutes | 15 minutes |
| **Validator feedback** | Generic | Specific |
| **Learning curve** | Flat | Steep |
| **Code quality** | Good | Excellent |

---

## Best Practices

### For Agents
1. **Review full history** - Don't just read the latest feedback
2. **Track confidence progression** - Understand what improved
3. **Address all feedback points** - Be systematic
4. **Build incrementally** - Don't rewrite everything

### For Validators
1. **Be specific** - Vague feedback wastes iterations
2. **Prioritize** - Focus on critical issues first
3. **Reference previous work** - Acknowledge improvements
4. **Suggest solutions** - Help agents learn faster

### For Orchestrators
1. **Store complete context** - Result + confidence + feedback
2. **Include timestamps** - Track iteration timing
3. **Set appropriate TTL** - Balance storage vs retention
4. **Monitor convergence** - Detect stuck iterations

---

## Troubleshooting

### Agent not seeing history
```bash
# Check if results are stored
redis-cli --scan --pattern "swarm:${TASK_ID}:${AGENT_ID}:result:*"

# Verify iteration parameter
echo $ITERATION  # Should be > 1

# Check agent logs
# Look for: "✓ Iteration history: included"
```

### History incomplete
```bash
# Check TTL (should be < 86400)
redis-cli ttl "swarm:auth-impl:backend-dev:result:iteration-1"

# If expired (-2), results were stored > 24 hours ago
# Need to re-run from iteration 1
```

### Feedback not stored
```bash
# Check orchestrator logs
# Look for: "[Coordinator] Storing iteration results for N agents"

# Verify feedback key exists
redis-cli get "swarm:auth-impl:backend-dev:feedback:iteration-1"

# Check validator output format
# Should include "feedback" field
```

---

## Further Reading

- **Implementation:** `docs/SPRINT_3_ITERATION_HISTORY.md`
- **Architecture:** `src/cli/iteration-history.ts`
- **Tests:** `tests/test-iteration-history.sh`
- **Gap Analysis:** `docs/ANTHROPIC_SDK_GAP_ANALYSIS.md` (Phase 2)
