# CFN v3 Data Flow Map

Complete map of all **data connection points** where information transfers between functions in the CFN v3 pipeline.

## Data Transfer Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│                     CFN v3 Data Flow Pipeline                       │
└─────────────────────────────────────────────────────────────────────┘

[1] Coordinator → Worker
    ├─ Task Context (description, requirements, priority)
    ├─ Agent Instructions
    └─ Prompt Injection: Task context into worker prompt
         Data: taskId, description, requirements[], priority
         Storage: Redis → task:{taskId}:assignment

[2] Worker → Redis
    ├─ Worker Output (code, files, tests)
    ├─ Confidence Score (0.0 - 1.0)
    └─ Execution Metadata
         Data: workerId, output, confidence, completedAt
         Storage: Redis → task:{taskId}:output

[3] Redis → Loop2 (Feedback Extraction)
    ├─ Reads Worker Output
    ├─ Extracts Feedback (critical, warnings, suggestions)
    └─ Preserves Confidence Score
         Data: extractedFrom, feedback{}, extractedConfidence
         Storage: Redis → task:{taskId}:loop2

[4] Loop2 → Loop3 (Confidence Aggregation)
    ├─ Reads Extracted Feedback
    ├─ Aggregates Confidence from Multiple Sources
    └─ Calculates Consensus
         Data: aggregatedConfidence, consensusReached, reviewerCount
         Storage: Redis → task:{taskId}:loop3

[5] Loop3 → Gate Check
    ├─ Reads Aggregated Confidence
    ├─ Compares Against Threshold (default 0.85)
    └─ Determines Pass/Fail
         Data: passed, threshold, actualConfidence
         Storage: Redis → gate:{taskId}

[6] Worker → Reviewer (Handoff)
    ├─ Code to Review
    ├─ Feedback from Loop2
    ├─ Original Confidence Score
    └─ Prompt Injection: Full context into reviewer prompt
         Data: taskId, code, feedback[], originalConfidence
         Storage: Redis → handoff:{taskId}:reviewer

[7] Reviewer → Final Storage
    ├─ Review Approval
    ├─ Updated Confidence
    └─ Merge Status
         Data: approved, reviewerConfidence, mergedToMain
         Storage: Redis/SQLite → task:{taskId}:final
```

## Data Connection Points (Tested)

### Test 03: Confidence Scores

**Metrics Tracked:**
- `cfnConfidenceScoresPassed` - Confidence scores successfully stored
- `cfnConfidenceScoresRetrieved` - Confidence scores successfully retrieved
- `cfnGateCheckPassed` - Tasks passing gate check (confidence >= threshold)
- `cfnGateCheckFailed` - Tasks failing gate check (confidence < threshold)
- `cfnAverageConfidence` - Average confidence across all tasks

**Data Points:**
1. Worker stores confidence → Redis
2. Loop2 retrieves and preserves confidence
3. Loop3 aggregates multiple confidence scores
4. Gate check validates against threshold
5. Final storage includes confidence history

### Test 05: Data Flow Through Pipeline

**Metrics Tracked:**
- `cfnDataTransferPoints` - Successful data transfers between functions
- `cfnDataLossPoints` - Points where data was lost/corrupted
- `cfnContextPreserved` - Context successfully maintained through pipeline
- `cfnPromptInjections` - Prompts successfully injected with context

**7 Critical Transfer Points:**

#### Transfer Point 1: Coordinator → Worker
```javascript
{
  taskId: "task-001",
  description: "Implement user authentication",
  requirements: ["JWT tokens", "Password hashing"],
  priority: "high"
}
```
**Test:** Verify context arrives intact at worker
**Validation:** All fields preserved, no data corruption

#### Transfer Point 2: Worker → Redis
```javascript
{
  workerId: "worker-001",
  output: {
    code: "function authenticate() {...}",
    files: ["auth.js", "session.js"],
    confidence: 0.92
  }
}
```
**Test:** Verify output stored with confidence
**Validation:** Code, files, confidence all stored correctly

#### Transfer Point 3: Redis → Loop2
```javascript
{
  feedback: {
    critical: ["Add input validation"],
    warnings: ["Consider rate limiting"],
    extractedConfidence: 0.92
  }
}
```
**Test:** Verify feedback extraction preserves confidence
**Validation:** Confidence score maintained through extraction

#### Transfer Point 4: Loop2 → Loop3
```javascript
{
  aggregatedConfidence: 0.92,
  consensusReached: true,
  reviewerCount: 3
}
```
**Test:** Verify confidence aggregation
**Validation:** Aggregated confidence matches input confidence

#### Transfer Point 5: Loop3 → Gate Check
```javascript
{
  passed: true,
  threshold: 0.85,
  actualConfidence: 0.92
}
```
**Test:** Verify gate check logic
**Validation:** Pass/fail correctly determined from confidence

#### Transfer Point 6: Worker → Reviewer (Handoff)
```javascript
{
  taskId: "task-001",
  code: "function authenticate() {...}",
  feedback: ["Add input validation"],
  originalConfidence: 0.92
}
```
**Test:** Verify handoff preserves full context
**Validation:** Task ID, code, feedback, confidence all transferred
**Prompt Injection:** Context injected into reviewer's system prompt

#### Transfer Point 7: Reviewer → Final Storage
```javascript
{
  approved: true,
  reviewerConfidence: 0.95,
  mergedToMain: true
}
```
**Test:** Verify final output includes review results
**Validation:** Approval status, updated confidence, merge status stored

## Prompt Injection Points

### 1. Worker Context Injection
```
System Prompt:
You are implementing: {taskContext.description}

Requirements:
{taskContext.requirements.map(r => `- ${r}`).join('\n')}

Priority: {taskContext.priority}
```

**Test:** Verify task context injected into worker prompt
**Validation:** `cfnPromptInjections++`

### 2. Reviewer Context Injection
```
System Prompt:
You are reviewing code for: {taskId}

Original Code:
{handoffContext.code}

Feedback to Address:
{handoffContext.feedback.map(f => `- ${f}`).join('\n')}

Original Confidence: {handoffContext.originalConfidence}
```

**Test:** Verify handoff context injected into reviewer prompt
**Validation:** `cfnPromptInjections++`, `cfnContextPreserved++`

## Data Persistence Validation

### Redis Keys Created

```
# Task Assignment
task:{taskId}:assignment
  └─ Fields: workerId, context, assignedAt

# Worker Output
task:{taskId}:output
  └─ Fields: workerId, output, confidence, completedAt

# Loop2 Feedback
task:{taskId}:loop2
  └─ Fields: feedback, extractedFrom, extractedAt

# Loop3 Aggregation
task:{taskId}:loop3
  └─ Fields: aggregation, aggregatedAt

# Gate Check
gate:{taskId}
  └─ Fields: result, checkedAt

# Handoff
handoff:{taskId}:reviewer
  └─ Fields: reviewerId, context, handoffAt

# Final Output
task:{taskId}:final
  └─ Fields: output, reviewedBy, finalizedAt
```

### SQLite Tables (Future)

```sql
-- Task execution history
CREATE TABLE task_executions (
  task_id TEXT PRIMARY KEY,
  context TEXT,
  worker_output TEXT,
  confidence REAL,
  gate_passed INTEGER,
  final_output TEXT,
  created_at INTEGER,
  updated_at INTEGER
);

-- Confidence score history
CREATE TABLE confidence_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT,
  source TEXT, -- 'worker', 'loop2', 'loop3', 'reviewer'
  confidence REAL,
  timestamp INTEGER,
  FOREIGN KEY (task_id) REFERENCES task_executions(task_id)
);

-- Handoff log
CREATE TABLE handoff_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT,
  from_agent TEXT,
  to_agent TEXT,
  context TEXT,
  handoff_at INTEGER,
  FOREIGN KEY (task_id) REFERENCES task_executions(task_id)
);
```

## Test Validation Criteria

### Data Transfer Success Criteria
- ✅ All 7 transfer points complete successfully
- ✅ `cfnDataTransferPoints` = 7
- ✅ `cfnDataLossPoints` = 0
- ✅ No data corruption at any point
- ✅ No missing fields in transferred data

### Context Preservation Criteria
- ✅ Task context preserved: Coordinator → Worker
- ✅ Handoff context preserved: Worker → Reviewer
- ✅ `cfnContextPreserved` >= 2
- ✅ All required fields present in context

### Confidence Score Criteria
- ✅ Confidence stored correctly in Worker output
- ✅ Confidence preserved through Loop2 extraction
- ✅ Confidence maintained in Loop3 aggregation
- ✅ Confidence used correctly in Gate check
- ✅ `cfnConfidenceScoresPassed` = total tasks
- ✅ `cfnConfidenceScoresRetrieved` = total tasks

### Prompt Injection Criteria
- ✅ Task context injected into Worker prompt
- ✅ Handoff context injected into Reviewer prompt
- ✅ `cfnPromptInjections` >= 1
- ✅ Context accessible in agent prompts

## Running Data Flow Tests

```bash
# Test confidence score passing/retrieval
npm run test:cfn-v3:confidence

# Test complete data flow pipeline
npm run test:cfn-v3:dataflow

# Run all tests including data flow
npm run test:cfn-v3
```

## Expected Test Output

### Test 03: Confidence Scores
```
═══════════════════════════════════════════════════════════════════
CFN v3 Confidence Score Test
═══════════════════════════════════════════════════════════════════

[3/6] Storing confidence scores in Redis...
✅ Stored 10/10 confidence scores

[4/6] Retrieving confidence scores from Redis...
✅ Retrieved 10/10 confidence scores

[5/6] Validating gate-check logic...
✅ Gate checks: 5 passed, 5 failed

Confidence Score Metrics:
  cfnConfidenceScoresPassed:    10
  cfnConfidenceScoresRetrieved: 10
  cfnGateCheckPassed:           5
  cfnGateCheckFailed:           5
  cfnAverageConfidence:         0.844

✅ ALL CONFIDENCE SCORE TESTS PASSED
```

### Test 05: Data Flow
```
═══════════════════════════════════════════════════════════════════
CFN v3 Data Flow Test - Tracking Data Transfer Points
═══════════════════════════════════════════════════════════════════

[2/8] Transfer Point 1: Coordinator → Worker
  ✅ Task context transferred to worker
     Context preserved: 4 fields

[3/8] Transfer Point 2: Worker → Redis (output storage)
  ✅ Worker output stored in Redis
     Files: auth.js, session.js
     Confidence: 0.92

[4/8] Transfer Point 3: Redis → Loop2 (feedback extraction)
  ✅ Feedback extracted by Loop2
     Critical: 1 items
     Confidence preserved: 0.92

[5/8] Transfer Point 4: Loop2 → Loop3 (confidence aggregation)
  ✅ Confidence aggregated by Loop3
     Aggregated confidence: 0.92
     Consensus: true

[6/8] Transfer Point 5: Loop3 → Gate Check (validation)
  ✅ Gate check validated
     Result: PASS
     Confidence: 0.92 (threshold: 0.85)

[7/8] Transfer Point 6: Worker → Reviewer (handoff with context)
  ✅ Handoff context transferred to reviewer
     Task ID preserved: data-flow-task-123
     Code transferred: function authenticate(user, password) { ...
     Feedback items: 1
     Context injected into reviewer prompt: YES

[8/8] Transfer Point 7: Reviewer → Final Storage
  ✅ Final output stored
     Approved: true
     Reviewer confidence: 0.95
     Confidence improved: 0.92 → 0.95

Data Flow Metrics:
  cfnDataTransferPoints:  7/7
  cfnDataLossPoints:      0
  cfnContextPreserved:    2/2
  cfnPromptInjections:    1/1

Data Flow Success Rate: 100.0%

✅ ALL DATA FLOW TESTS PASSED
```

## Debugging Data Flow Issues

### Check Data at Each Transfer Point

```bash
# Transfer Point 1: Task assignment
redis-cli HGETALL task:task-001:assignment

# Transfer Point 2: Worker output
redis-cli HGETALL task:task-001:output

# Transfer Point 3: Loop2 feedback
redis-cli HGETALL task:task-001:loop2

# Transfer Point 4: Loop3 aggregation
redis-cli HGETALL task:task-001:loop3

# Transfer Point 5: Gate check
redis-cli HGETALL gate:task-001

# Transfer Point 6: Reviewer handoff
redis-cli HGETALL handoff:task-001:reviewer

# Transfer Point 7: Final output
redis-cli HGETALL task:task-001:final
```

### Trace Data Through Pipeline

```bash
# Enable debug mode to see all data transfers
CFN_TEST_DEBUG=true npm run test:cfn-v3:dataflow

# Monitor Redis in real-time
redis-cli MONITOR | grep "task-001"
```

## Summary

The CFN v3 test suite now validates **all data connection points** where information transfers between functions:

- ✅ **7 Data Transfer Points** validated
- ✅ **Confidence Scores** tracked through entire pipeline
- ✅ **Prompt Injections** verified (context injected into agent prompts)
- ✅ **Data Retrieval** tested (Redis read/write operations)
- ✅ **Context Preservation** validated (no data loss)
- ✅ **Gate Checks** tested (threshold validation)

Every piece of data that moves between functions is now tracked, validated, and tested! 🎯
