---
description: "Run comprehensive hello-world test suite validating agent tooling, mesh coordination, review handoff, and SQLite storage"
argument-hint: "[--layer=0|1|2|3|all] [--skip-validation]"
allowed-tools: ["Bash", "Read", "TodoWrite", "Write"]
---

# Hello World Tests - CFN Coordination Validation

Run comprehensive 4-layer test suite validating core CFN coordination capabilities.

**Test Scope**: $ARGUMENTS

## Test Layers

### Layer 0: Agent Tool Validation
- ✅ **15 agent types** (coder, architect, tester, analyst, reviewer, backend-dev, code-analyzer, code-quality-validator, security-specialist, devops-engineer, api-docs, mobile-dev, base-template-generator, perf-analyzer, pseudocode)
- ✅ **7 tools per agent** (Read, Write, Edit, Bash, Grep, Glob, TodoWrite)
- ✅ **Success criteria**: All agents spawn, ≥5/7 tools working, 6 critical tools at 100%

### Layer 1: Mesh Coordination
- ✅ **2 peer coordinators** managing 35 combos each
- ✅ **70 Hello World files** (7 languages × 10 translations)
- ✅ **Redis pub/sub coordination** with claim negotiation
- ✅ **SQLite persistence** for agent state and coordination history
- ✅ **Success criteria**: 72 agents, 70 unique files, 0 conflicts, balanced distribution

### Layer 2: Review Coordination
- ✅ **Dynamic reviewer pool** (3-10 reviewers)
- ✅ **Queue-driven spawning/despawning**
- ✅ **Review handoff from implementers to reviewers**
- ✅ **Success criteria**: All 70 files reviewed, queue depth ≤15, dynamic scaling observed

### Layer 3: Error Handling
- ✅ **50% error injection** with 4 error types
- ✅ **Fresh agent spawning for retries**
- ✅ **Exponential backoff** (100ms, 200ms, 400ms)
- ✅ **Success criteria**: 50% initial failures, ≤10 retries per file, 100% final pass rate

## Command Options

```bash
# Run all layers sequentially (default)
/hello-world-tests

# Run specific layer
/hello-world-tests --layer=0    # Agent tooling only
/hello-world-tests --layer=1    # Mesh coordination only
/hello-world-tests --layer=2    # Review coordination only
/hello-world-tests --layer=3    # Error handling only

# Run multiple layers
/hello-world-tests --layer=0,1  # Tooling + mesh

# Skip validation (run tests without checking results)
/hello-world-tests --skip-validation
```

## Execution Strategy

You MUST execute the tests using the following autonomous workflow:

### 1. Initialize Test Environment

```bash
# Verify Redis is running
redis-cli ping  # Must return "PONG"

# Create output directories
mkdir -p test-results/layer0-tool-validation
mkdir -p test-results/hello-world

# Initialize SQLite database for coordination
node tests/hello-world/lib/init-sqlite.js
```

### 2. Execute Test Layers Sequentially

Parse the `--layer` argument to determine which layers to run:

**Layer 0: Agent Tool Validation**
```bash
node tests/hello-world/layer0-tool-validation.js 2>&1 | tee test-results/layer0-output.log
```
- **Validates**: Agent tooling works (15 agents × 7 tools)
- **Reports to**: `test-results/layer0-tool-validation/layer0-results.json`
- **Must pass before**: Layer 1 mesh coordination

**Layer 1: Mesh Coordination**
```bash
node tests/hello-world/layer1-mesh-coordination.js 2>&1 | tee test-results/layer1-output.log
```
- **Validates**: Peer-to-peer claim negotiation, SQLite state persistence
- **Reports to**: `test-results/hello-world/layer1-results.json`
- **Must pass before**: Layer 2 review coordination

**Layer 2: Review Coordination** (if implemented)
```bash
node tests/hello-world/layer2-review-coordination.js 2>&1 | tee test-results/layer2-output.log
```
- **Validates**: Dynamic reviewer pool, review handoff
- **Reports to**: `test-results/hello-world/layer2-results.json`
- **Must pass before**: Layer 3 error handling

**Layer 3: Error Handling** (if implemented)
```bash
node tests/hello-world/layer3-error-retry.js 2>&1 | tee test-results/layer3-output.log
```
- **Validates**: Error injection, retry coordination, SQLite retry history
- **Reports to**: `test-results/hello-world/layer3-results.json`

### 3. Validate Results (unless --skip-validation)

After each layer completes, validate success criteria:

```javascript
const layerResults = JSON.parse(fs.readFileSync('test-results/layer0-tool-validation/layer0-results.json'));

// Layer 0 validation
if (!layerResults.summary.layerPassed) {
  console.error('❌ Layer 0 FAILED:', layerResults.summary);
  process.exit(1);
}

// Layer 1 validation
if (!layer1Results.successCriteria.allMet) {
  console.error('❌ Layer 1 FAILED:', layer1Results.successCriteria);
  process.exit(1);
}

// Continue for Layer 2, 3...
```

### 4. Generate Combined Report

After all layers complete:

```javascript
{
  "testSuite": "Hello World CFN Coordination Tests",
  "timestamp": "2025-10-13T18:45:00Z",
  "layers": [
    {
      "layer": 0,
      "name": "Agent Tool Validation",
      "status": "PASSED",
      "duration": "10.3 minutes",
      "agents": 15,
      "toolsValidated": 7,
      "reportPath": "test-results/layer0-tool-validation/layer0-results.json"
    },
    {
      "layer": 1,
      "name": "Mesh Coordination",
      "status": "PASSED",
      "duration": "15.2 minutes",
      "agents": 72,
      "filesCreated": 70,
      "conflicts": 0,
      "sqliteWrites": 145,
      "reportPath": "test-results/hello-world/layer1-results.json"
    },
    {
      "layer": 2,
      "name": "Review Coordination",
      "status": "PASSED",
      "duration": "12.1 minutes",
      "reviewers": 7,
      "reviewsCompleted": 70,
      "reportPath": "test-results/hello-world/layer2-results.json"
    },
    {
      "layer": 3,
      "name": "Error Handling",
      "status": "PASSED",
      "duration": "18.4 minutes",
      "initialFailures": 35,
      "retries": 52,
      "finalPassRate": "100%",
      "reportPath": "test-results/hello-world/layer3-results.json"
    }
  ],
  "summary": {
    "totalDuration": "56.0 minutes",
    "totalAgents": 170,
    "totalLayers": 4,
    "layersPassed": 4,
    "layersFailed": 0,
    "overallStatus": "✅ ALL TESTS PASSED"
  },
  "sqliteValidation": {
    "databasePath": "./swarm-memory.db",
    "totalWrites": 312,
    "totalReads": 847,
    "aclViolations": 0,
    "encryptionVerified": true,
    "performanceMs": {
      "avgWrite": 45,
      "avgRead": 12
    }
  }
}
```

Save to: `test-results/hello-world/combined-report.json`

### 5. SQLite Validation Requirements

**Critical**: Each layer MUST validate SQLite storage is working:

**Layer 0**: No SQLite validation (tooling-only)

**Layer 1**: Validate SQLite coordinator state persistence
```javascript
// Store coordinator claims
await memory.memoryAdapter.set(
  `coordination:coordinator:${coordinatorId}:claimed`,
  claimedCombos,
  { agentId: coordinatorId, aclLevel: 2 } // Team level
);

// Verify storage worked
const stored = await memory.memoryAdapter.get(
  `coordination:coordinator:${coordinatorId}:claimed`,
  { agentId: coordinatorId }
);

console.log(`✅ SQLite validation: ${stored.length} claims persisted`);
```

**Layer 2**: Validate SQLite review queue persistence
```javascript
// Store review assignments
await memory.memoryAdapter.set(
  `review:assignments:${reviewerId}`,
  assignedFiles,
  { agentId: reviewerId, aclLevel: 2 }
);

// Verify ACL enforcement
try {
  await memory.memoryAdapter.get(
    `review:assignments:${reviewerId}`,
    { agentId: 'wrong-agent' } // Should fail
  );
  throw new Error('ACL violation: unauthorized access succeeded');
} catch (e) {
  console.log('✅ SQLite ACL working: unauthorized access blocked');
}
```

**Layer 3**: Validate SQLite retry history
```javascript
// Store retry attempts with encryption
await memory.memoryAdapter.set(
  `retry:history:${combo}`,
  { attempts: retries, errors: errorLog },
  { agentId: coordinatorId, aclLevel: 1, encrypted: true } // Private, encrypted
);

// Verify encryption
const encrypted = await memory.memoryAdapter.getRaw(`retry:history:${combo}`);
if (!encrypted.includes('encrypted:')) {
  throw new Error('SQLite encryption failed');
}

console.log('✅ SQLite encryption verified');
```

## Final Report

Print comprehensive summary:

```
══════════════════════════════════════════════════════════════════════
HELLO WORLD CFN COORDINATION TEST SUITE - COMPLETE
══════════════════════════════════════════════════════════════════════

📊 Overall Results:
  Total Duration: 56.0 minutes
  Total Agents: 170
  Layers Passed: 4/4
  Overall Status: ✅ ALL TESTS PASSED

🔧 Layer 0: Agent Tool Validation
  Status: ✅ PASSED
  Agents: 15
  Tools Validated: 7
  Success Rate: 100%

🤝 Layer 1: Mesh Coordination
  Status: ✅ PASSED
  Coordinators: 2
  Files Created: 70
  Conflicts: 0
  SQLite Writes: 145

👥 Layer 2: Review Coordination
  Status: ✅ PASSED
  Reviewers: 7
  Reviews Completed: 70
  Queue Depth Max: 12

🔄 Layer 3: Error Handling
  Status: ✅ PASSED
  Initial Failures: 35 (50%)
  Retries: 52
  Final Pass Rate: 100%

💾 SQLite Validation:
  Total Writes: 312
  Total Reads: 847
  ACL Violations: 0
  Encryption: ✅ Verified
  Avg Write: 45ms
  Avg Read: 12ms

📄 Detailed Reports:
  - test-results/layer0-tool-validation/layer0-results.json
  - test-results/hello-world/layer1-results.json
  - test-results/hello-world/layer2-results.json
  - test-results/hello-world/layer3-results.json
  - test-results/hello-world/combined-report.json

══════════════════════════════════════════════════════════════════════
✅ CFN COORDINATION VALIDATION COMPLETE
══════════════════════════════════════════════════════════════════════
```

## Error Handling

If any layer fails:

1. **Stop execution** (don't proceed to next layer)
2. **Print failure details** from JSON report
3. **Save partial combined report** with failed layer marked
4. **Exit with code 1**

Example failure output:
```
❌ Layer 1 FAILED: Mesh Coordination

Failure Reason: Conflict resolution failed
  Expected: 0 conflicts
  Actual: 3 conflicts
  Details: Coordinators coord-a and coord-b claimed same combo 3 times

📄 Full Report: test-results/hello-world/layer1-results.json

⚠️  Cannot proceed to Layer 2 until Layer 1 passes.
```

## TodoWrite Tracking

Use TodoWrite to track test progress:

```javascript
[
  { "content": "Initialize test environment (Redis, SQLite, dirs)", "status": "in_progress" },
  { "content": "Run Layer 0: Agent Tool Validation", "status": "pending" },
  { "content": "Validate Layer 0 results", "status": "pending" },
  { "content": "Run Layer 1: Mesh Coordination", "status": "pending" },
  { "content": "Validate Layer 1 results + SQLite", "status": "pending" },
  { "content": "Run Layer 2: Review Coordination", "status": "pending" },
  { "content": "Validate Layer 2 results + SQLite ACL", "status": "pending" },
  { "content": "Run Layer 3: Error Handling", "status": "pending" },
  { "content": "Validate Layer 3 results + SQLite encryption", "status": "pending" },
  { "content": "Generate combined report", "status": "pending" },
  { "content": "Print final summary", "status": "pending" }
]
```

Update status as each layer completes.

## References

- **Test Suite**: `tests/hello-world/README.md`
- **Architecture**: `tests/hello-world/ARCHITECTURE.md`
- **Layer 0 Test**: `tests/hello-world/layer0-tool-validation.js`
- **Layer 1 Test**: `tests/hello-world/layer1-mesh-coordination.js`
- **SQLite Memory**: `src/sqlite/MemoryStoreAdapter.cjs`
- **CFN Loop Guide**: `docs/cfn-loop/CFN_LOOP_COMPLETE_GUIDE.md`
