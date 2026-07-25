# Consensus on Vapor Detection - Examples

Comprehensive examples of vapor detection in action.

---

## Example 1: Simple Vapor Detection

### Scenario
Agent completes task but key files are missing.

### Agent Output
```
Task completed successfully!

Created the following files:
- src/user-auth.ts
- src/user-auth.spec.ts

All tests passed. Ready for review.
```

### Expected Deliverables
```typescript
const expected = [
  'src/user-auth.ts',
  'src/user-auth.spec.ts',
  'dist/user-auth.js'
];
```

### Detection
```typescript
const validator = new CFNValidator({ mode: 'standard', taskId: 'task-1' });

const vapor = await validator.detectConsensusOnVapor(agentOutput, expected);

// Result
console.log(vapor);
// {
//   detected: true,
//   claimsCompletion: true,      // ✓ Claims "completed"
//   deliverablesMissing: true,   // ✓ dist/user-auth.js missing
//   missingDeliverables: ['dist/user-auth.js'],
//   confidence: 0.33,             // 1 of 3 files missing
//   agentOutput: '...truncated...'
// }
```

### Action
```
Status: VAPOR DETECTED
Confidence: 33%
Feedback: Create dist/user-auth.js and retry
Decision: ITERATE (don't proceed to Loop 2)
```

---

## Example 2: High Confidence Vapor

### Scenario
Agent claims to have created 4 key files but only 1 exists.

### Agent Output
```
Implementation complete!

Summary of work:
✓ Created api/auth.ts
✓ Created api/database.ts
✓ Created tests/auth.test.ts
✓ Created tests/database.test.ts

All systems ready for deployment.
```

### Expected Deliverables
```typescript
const expected = [
  'src/api/auth.ts',
  'src/api/database.ts',
  'src/tests/auth.test.ts',
  'src/tests/database.test.ts'
];
```

### Detection
```typescript
const vapor = await validator.detectConsensusOnVapor(agentOutput, expected);

console.log(vapor);
// {
//   detected: true,
//   claimsCompletion: true,      // ✓ Claims "complete"
//   deliverablesMissing: true,   // ✓ 3 of 4 missing
//   missingDeliverables: [
//     'src/api/database.ts',
//     'src/tests/auth.test.ts',
//     'src/tests/database.test.ts'
//   ],
//   confidence: 0.75,             // 3 of 4 missing = 75% confidence
//   agentOutput: '...truncated...'
// }
```

### Action
```
Status: VAPOR DETECTED (HIGH CONFIDENCE)
Confidence: 75%
Missing Count: 3 of 4 files
Feedback: Create these files and retry:
  - src/api/database.ts
  - src/tests/auth.test.ts
  - src/tests/database.test.ts
Decision: ITERATE (must complete work before Loop 2 review)
```

---

## Example 3: No Vapor - All Files Present

### Scenario
Agent completes task and all files actually exist.

### Agent Output
```
Feature implementation finished successfully.

Created files:
- middleware/auth.ts
- tests/middleware-auth.test.ts

All tests passing. Ready for validator review.
```

### Expected Deliverables
```typescript
const expected = [
  'src/middleware/auth.ts',
  'tests/middleware-auth.test.ts'
];

// Files actually exist in filesystem
fs.existsSync('src/middleware/auth.ts');      // ✓ true
fs.existsSync('tests/middleware-auth.test.ts'); // ✓ true
```

### Detection
```typescript
const vapor = await validator.detectConsensusOnVapor(agentOutput, expected);

console.log(vapor);
// {
//   detected: false,             // ✓ No vapor detected
//   claimsCompletion: true,      // Agent claims completion
//   deliverablesMissing: false,  // But files DO exist
//   missingDeliverables: [],     // No missing files
//   confidence: 0.0,              // 0% confidence (no vapor)
//   agentOutput: '...truncated...'
// }
```

### Action
```
Status: OK - NO VAPOR
Agent claims: Verified ✓
Deliverables: All present ✓
Next: Proceed to Loop 2 (validators can review)
Decision: PROCEED
```

---

## Example 4: No Completion Claim - No Vapor

### Scenario
Agent doesn't claim completion, so no vapor possible.

### Agent Output
```
Working on user authentication...

Completed so far:
- Analyzed requirements
- Started implementation in progress-auth.ts
- Tests pending

Status: In Progress (50%)
```

### Expected Deliverables
```typescript
const expected = [
  'src/auth.ts',
  'tests/auth.test.ts',
  'dist/auth.js'
];
```

### Detection
```typescript
const vapor = await validator.detectConsensusOnVapor(agentOutput, expected);

console.log(vapor);
// {
//   detected: false,              // No vapor
//   claimsCompletion: false,      // ✓ Agent doesn't claim completion
//   deliverablesMissing: true,    // Files missing, but...
//   missingDeliverables: [
//     'src/auth.ts',
//     'tests/auth.test.ts',
//     'dist/auth.js'
//   ],
//   confidence: 0.0,              // 0% confidence (no vapor because no claims)
//   agentOutput: '...truncated...'
// }
```

### Action
```
Status: OK - IN PROGRESS
Agent hasn't claimed completion, so no vapor
Missing files are expected (work not done yet)
Next: Loop 3 retries until completion claimed
Decision: ITERATE (normal retry, not vapor)
```

---

## Example 5: Partial Vapor - Some Keywords, Some Files

### Scenario
Agent uses completion keywords but only partially completed task.

### Agent Output
```
Feature finished!

Summary:
- Main authentication logic: ✓ Done
- Database integration: ✓ Done
- API endpoints: ✗ Not started
- Tests: ✗ Not started
- Documentation: ✗ Incomplete

Status: Partially done but marked as finished
```

### Expected Deliverables
```typescript
const expected = [
  'src/auth.ts',        // ✓ Created
  'src/db.ts',          // ✓ Created
  'src/api.ts',         // ✗ Missing
  'tests/auth.test.ts', // ✗ Missing
  'tests/db.test.ts',   // ✗ Missing
  'README.md'           // ✗ Missing
];
```

### Detection
```typescript
const vapor = await validator.detectConsensusOnVapor(agentOutput, expected);

console.log(vapor);
// {
//   detected: true,              // Vapor detected
//   claimsCompletion: true,      // ✓ Claims "finished"
//   deliverablesMissing: true,   // ✓ 4 of 6 missing
//   missingDeliverables: [
//     'src/api.ts',
//     'tests/auth.test.ts',
//     'tests/db.test.ts',
//     'README.md'
//   ],
//   confidence: 0.67,            // 4 of 6 = 67% confidence
//   agentOutput: '...truncated...'
// }
```

### Action
```
Status: VAPOR DETECTED (PARTIAL)
Confidence: 67%
Claimed: All features done
Reality: 33% incomplete
Feedback: Complete these missing deliverables:
  - src/api.ts
  - tests/auth.test.ts
  - tests/db.test.ts
  - README.md
Decision: ITERATE (correct course, don't proceed to Loop 2)
```

---

## Example 6: Integration with Loop 3 Validation

### Scenario
Complete Loop 3 validation including vapor detection.

### Code
```typescript
// Loop 3 Agent Completion
async function completeLoop3Task(taskId: string) {
  const validator = new CFNValidator({
    mode: 'standard',
    taskId,
    agentId: process.env.AGENT_ID
  });

  // Perform comprehensive validation
  const result = await validator.performValidation({
    deliverables: [
      'src/feature.ts',
      'tests/feature.test.ts',
      'dist/feature.js'
    ],
    passRate: calculateTestPassRate(),
    agentOutput: getAgentExecutionLog(),
    successCriteria: [
      {
        type: 'file_exists',
        paths: ['src/feature.ts'],
        description: 'Main feature file'
      }
    ]
  });

  // Check for vapor
  if (result.vapor?.detected) {
    console.error('VAPOR DETECTED!');
    console.error(`Missing: ${result.vapor.missingDeliverables.join(', ')}`);
    console.error(`Confidence: ${(result.vapor.confidence * 100).toFixed(0)}%`);

    // Provide feedback
    const feedback = {
      issue: 'Incomplete deliverables',
      missingFiles: result.vapor.missingDeliverables,
      requiredActions: [
        `Create ${result.vapor.missingDeliverables.length} missing files`,
        'Re-run tests to verify',
        'Retry Loop 3 execution'
      ]
    };

    reportConfidence(0.40, 'ITERATE', feedback);
    return;
  }

  // Check gate
  if (result.gate && !result.gate.passed) {
    console.error(`Gate failed: ${result.gate.gap.toFixed(2)}% below threshold`);
    reportConfidence(result.gate.passRate, 'ITERATE', {
      issue: 'Insufficient test pass rate',
      currentRate: `${(result.gate.passRate * 100).toFixed(1)}%`,
      threshold: `${(result.gate.threshold * 100).toFixed(1)}%`,
      gap: `${(result.gate.gap * 100).toFixed(2)}%`
    });
    return;
  }

  // All validations passed
  reportConfidence(0.95, 'PROCEED');
}
```

### Execution Flow
```
1. Perform comprehensive validation
   ├─ Deliverables: Check file existence
   ├─ Success criteria: Verify conditions
   ├─ Gate: Check pass rate threshold
   └─ Vapor: Detect claims vs reality

2. Check vapor first (highest priority)
   ├─ If detected → ITERATE (missing files)
   └─ If not → Continue

3. Check gate
   ├─ If failed → ITERATE (low pass rate)
   └─ If passed → Continue

4. Report result
   ├─ ITERATE with feedback
   └─ PROCEED to Loop 2
```

---

## Example 7: Orchestrator Integration

### Scenario
Orchestrator checks vapor after Loop 3 completes.

### Bash Code
```bash
#!/bin/bash

# After Loop 3 execution
LOOP3_OUTPUT=$(get_agent_output "$AGENT_ID")
EXPECTED_FILES=(
  "src/auth.ts"
  "tests/auth.test.ts"
  "dist/auth.js"
)

# Run vapor detection
VAPOR_RESULT=$(./.claude/skills/cfn-loop-validation/detect-vapor.sh \
  --output "$LOOP3_OUTPUT" \
  --deliverables "$(echo "${EXPECTED_FILES[@]}" | tr ' ' ',')" \
  --json)

# Parse result
VAPOR_DETECTED=$(echo "$VAPOR_RESULT" | jq '.detected')
CONFIDENCE=$(echo "$VAPOR_RESULT" | jq '.confidence')
MISSING_FILES=$(echo "$VAPOR_RESULT" | jq '.missingDeliverables[]')

if [ "$VAPOR_DETECTED" = "true" ]; then
  # CRITICAL: Vapor detected, don't proceed to Loop 2
  echo "ERROR: Consensus on Vapor detected"
  echo "Confidence: $(echo "$CONFIDENCE * 100" | bc)%"
  echo "Missing files:"
  echo "$MISSING_FILES" | while read file; do
    echo "  - $file"
  done

  # Send feedback to agent
  FEEDBACK="Please create these missing files:
$(echo "$MISSING_FILES" | sed 's/^/  - /')"

  # Trigger iteration
  redis-cli lpush "swarm:${TASK_ID}:proceed" "false"
  redis-cli lpush "swarm:${TASK_ID}:feedback" "$FEEDBACK"
else
  # No vapor, proceed to Loop 2
  echo "OK: No vapor detected"
  echo "Proceeding to Loop 2 (validators)"

  # Signal Loop 2
  redis-cli lpush "swarm:${TASK_ID}:gate-passed" "true"
fi
```

---

## Example 8: False Negatives (No Vapor When Should Be)

### Scenario (Prevented by Detector)
Agent claims completion using subtle language.

### Agent Output
```
Finished the initial implementation.

Files created:
- src/index.ts
- src/utils.ts

Note: Still need to create tests and build artifacts.

The core functionality is ready.
```

### Detection
```typescript
const vapor = await validator.detectConsensusOnVapor(agentOutput, expected);

// Result:
// {
//   detected: true,  // ✓ Correctly detected
//   claimsCompletion: true,  // Picked up "finished"
//   deliverablesMissing: true,
//   ...
// }
```

### Why It Works
The detector recognizes `finished` even though it's subtle, and catches the mismatch between claimed completion and missing files.

---

## Example 9: False Positives Prevention

### Scenario
Agent mentions missing features but doesn't claim completion.

### Agent Output
```
Current progress report:

Completed:
✓ Basic authentication
✓ User database model
✗ API endpoints (still in progress)
✗ Testing (not started)
✗ Documentation (not started)

Next steps: Continue with API implementation
```

### Detection
```typescript
const vapor = await validator.detectConsensusOnVapor(agentOutput, expected);

// Result:
// {
//   detected: false,  // ✓ Correctly NOT detected as vapor
//   claimsCompletion: false,  // No completion claim
//   deliverablesMissing: true,  // Files missing but...
//   missingDeliverables: [...],
//   confidence: 0.0,  // 0% confidence because no completion claim
// }
```

### Why It Works
Without a completion claim, missing files are not considered vapor - they're just work-in-progress.

---

## Summary Table

| Scenario | Claims Completion | Files Exist | Detected | Confidence |
|----------|------------------|-------------|----------|------------|
| Example 1 | Yes | Partial (2/3) | Yes | 33% |
| Example 2 | Yes | Partial (1/4) | Yes | 75% |
| Example 3 | Yes | All (2/2) | No | 0% |
| Example 4 | No | Partial (0/3) | No | 0% |
| Example 5 | Yes | Partial (2/6) | Yes | 67% |
| Example 8 | Yes (subtle) | Partial | Yes | 60% |
| Example 9 | No | Partial | No | 0% |

---

## Key Insights

### 1. Vapor = Claims + Missing
Vapor is **only** detected when:
- Agent claims completion, **AND**
- Some deliverables are missing

### 2. Confidence is Ratio-Based
- 0 missing = 0% confidence (no vapor)
- 1 of 3 missing = 33% confidence
- 3 of 3 missing = 100% confidence

### 3. Keywords Matter
The detector recognizes:
- complete, completed
- done, finished
- success, successful
- delivered
- implemented, created
- generated

### 4. Integration Point
Vapor detection should happen:
1. **After** Loop 3 completes
2. **Before** Loop 2 validators review
3. **Preventing** consensus on non-existent work

### 5. Feedback Loop
When vapor detected:
- Don't proceed to Loop 2
- Provide list of missing files
- Request iteration with clear requirements
- Re-enter Loop 3 with feedback

---

## Testing Your Own Cases

```typescript
// Test with your agent output
const myOutput = 'Your agent output here...';
const myFiles = ['file1.ts', 'file2.ts'];

const validator = new CFNValidator({
  mode: 'standard',
  taskId: 'test'
});

const result = await validator.detectConsensusOnVapor(myOutput, myFiles);

console.log('Vapor Detected:', result.detected);
console.log('Confidence:', (result.confidence * 100).toFixed(0) + '%');
console.log('Missing:', result.missingDeliverables);
```

---

## Additional Resources

- **Complete API Docs:** `SKILL_TYPESCRIPT.md`
- **Implementation Details:** `IMPLEMENTATION_SUMMARY.md`
- **Test Suite:** `tests/validator.test.ts`
- **Type Definitions:** `src/types.ts`
