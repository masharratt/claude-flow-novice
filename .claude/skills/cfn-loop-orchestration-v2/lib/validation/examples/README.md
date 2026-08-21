# CFN Loop Validation - Coordinator Integration Examples

This directory contains practical examples demonstrating how coordinators can integrate the CFN Loop Validation skill into their workflows.

## Overview

Each example script demonstrates a different integration pattern:

1. **Loop 3 Confidence Gate** - Validate agent confidence before spawning validators
2. **Loop 2 Consensus** - Validate Byzantine consensus from validator swarm
3. **Full CFN Loop** - Complete workflow with all validation gates
4. **Redis Integration** - Async validation with Redis pub/sub

## Examples

### 1. coordinator-loop3-gate.sh

**Purpose:** Validate Loop 3 confidence gate before proceeding to consensus validation

**Scenario:**
- Primary swarm (coder + tester) completes work
- Coordinator validates agent's self-assessed confidence
- Decision: Proceed to validators OR retry with feedback

**Usage:**
```bash
./coordinator-loop3-gate.sh
```

**Expected Output:**
```
=== Loop 3: Primary Swarm Execution ===
Task: feature-user-authentication
Mode: standard

Executing primary swarm (coder + tester)...
Agent reported confidence: 0.85

=== Validating Loop 3 Confidence Gate ===

Validation Result:
  Status: PASS
  Passed: true
  Confidence: 0.85
  Threshold: 0.80
  Exit Code: 0

✓ Confidence gate PASSED
  → Proceeding to Loop 2 (spawning validators)
```

**Key Concepts:**
- Confidence gate threshold validation
- Automatic retry logic for low confidence
- Escalation path for max iterations

---

### 2. coordinator-loop2-consensus.sh

**Purpose:** Validate Byzantine consensus from validator swarm

**Scenario:**
- Validator swarm completes review (reviewer, security, tester, analyst, architect)
- Coordinator calculates consensus score
- Decision: Proceed to product owner OR retry validators

**Usage:**
```bash
./coordinator-loop2-consensus.sh
```

**Expected Output:**
```
=== Loop 2: Consensus Validation ===
Task: compliance-gdpr-implementation
Mode: enterprise

Spawning validator swarm...
  - Validator 1: reviewer (confidence: 0.92)
  - Validator 2: security-specialist (confidence: 0.95)
  - Validator 3: tester (confidence: 0.88)
  - Validator 4: analyst (confidence: 0.91)
  - Validator 5: architect (confidence: 0.93)

Consensus Results:
  Average Confidence: 0.918
  Consensus Score: 0.952

=== Validating Loop 2 Consensus Threshold ===

Validation Result:
  Type: consensus
  Status: PASS
  Passed: true
  Consensus: 0.952
  Threshold: 0.95
  Exit Code: 0

✓ Consensus ACHIEVED
  → Proceeding to Loop 4 (Product Owner Decision Gate)
```

**Key Concepts:**
- Byzantine consensus validation
- Multiple validator coordination
- Enterprise mode threshold requirements

---

### 3. coordinator-full-cfn-loop.sh

**Purpose:** Complete CFN loop workflow with validation at each gate

**Scenario:**
- Full orchestration: Loop 3 → Loop 2 → Loop 4
- Iterative retry logic with feedback injection
- Product owner decision gate (GOAP)

**Usage:**
```bash
./coordinator-full-cfn-loop.sh
```

**Expected Output:**
```
╔════════════════════════════════════════════════════════════╗
║           CFN LOOP ORCHESTRATION - Full Example            ║
╚════════════════════════════════════════════════════════════╝

Task: feature-payment-processing
Mode: standard
Max Loop 3 Retries: 3
Max Loop 2 Retries: 2

┌────────────────────────────────────────────────────────────┐
│ LOOP 3: Primary Swarm Execution (Confidence Gate)         │
└────────────────────────────────────────────────────────────┘

--- Loop 3 Iteration 1 ---
Executing primary swarm (coder + tester)...
Agent self-assessed confidence: 0.75
Validation: FAIL (threshold: 0.80)
✗ Loop 3 gate FAILED
  → Injecting feedback and retrying...

--- Loop 3 Iteration 2 ---
Executing primary swarm (coder + tester)...
Agent self-assessed confidence: 0.82
Validation: PASS (threshold: 0.80)
✓ Loop 3 gate PASSED

┌────────────────────────────────────────────────────────────┐
│ LOOP 2: Validator Consensus (Byzantine Agreement)         │
└────────────────────────────────────────────────────────────┘

--- Loop 2 Iteration 1 ---
Spawning validator swarm...
  - reviewer
  - security-specialist
  - tester
  - analyst

Byzantine consensus result: 0.88
Validation: FAIL (threshold: 0.90)
✗ Loop 2 consensus FAILED
  → Analyzing validator feedback and retrying...

--- Loop 2 Iteration 2 ---
Spawning validator swarm...
Byzantine consensus result: 0.92
Validation: PASS (threshold: 0.90)
✓ Loop 2 consensus ACHIEVED

┌────────────────────────────────────────────────────────────┐
│ LOOP 4: Product Owner Decision Gate (GOAP)                │
└────────────────────────────────────────────────────────────┘

Invoking product owner decision...
Product Owner Decision:
  Decision: PROCEED
  Confidence: 0.92
  Reasoning: Payment processing implementation meets security and compliance standards. Ready for deployment.

✓ Product Owner APPROVED
  → Phase complete, proceeding to next phase

╔════════════════════════════════════════════════════════════╗
║                  PHASE COMPLETE - SUCCESS                  ║
╚════════════════════════════════════════════════════════════╝

Summary:
  Task: feature-payment-processing
  Mode: standard
  Loop 3 Iterations: 2
  Loop 2 Iterations: 2
  Final Confidence: 0.82
  Final Consensus: 0.92
  Product Owner: PROCEED (0.92 confidence)

Next Action: Proceed to next phase or deployment
```

**Key Concepts:**
- Complete CFN loop orchestration
- Iterative retry with feedback injection
- Loop 3 → Loop 2 → Loop 4 flow
- Product owner decision types (PROCEED, LOOP, DEFER, ESCALATE)

---

### 4. coordinator-redis-integration.sh

**Purpose:** Async validation with Redis pub/sub for distributed coordination

**Scenario:**
- Coordinator runs validation
- Results published to Redis for other agents
- Event-driven workflow coordination

**Usage:**
```bash
# Ensure Redis is running
docker run -d -p 6379:6379 redis:latest

# Run example
./coordinator-redis-integration.sh
```

**Expected Output:**
```
═══════════════════════════════════════════════════════════
  CFN Loop Validation with Redis Integration
═══════════════════════════════════════════════════════════

Task: distributed-task-microservices
Mode: enterprise
Iteration: 2
Redis: localhost:6379

Checking Redis connectivity...
✓ Redis connection successful

Running CFN Loop validation...
Validation Result:
  Status: PASS
  Passed: true
  Code: 0

Publishing validation result to Redis...
✓ Stored in list: cfn:validation:distributed-task-microservices
✓ Set status key (TTL: 1 hour)
✓ Published event: validation_passed
✓ Updated task metadata

Redis Integration Summary:
  List: cfn:validation:distributed-task-microservices (validation history)
  Key: cfn:validation:distributed-task-microservices:status (current status)
  Channel: cfn:events (event stream)
  Hash: cfn:task:distributed-task-microservices:metadata (task metadata)

Other agents can subscribe to events:
  redis-cli -h localhost -p 6379 subscribe cfn:events

Query validation history:
  redis-cli -h localhost -p 6379 lrange cfn:validation:distributed-task-microservices 0 -1

✓ VALIDATION PASSED
  → Proceeding to next phase
```

**Key Concepts:**
- Redis list storage for validation history
- Redis key-value with TTL for current status
- Redis pub/sub for event distribution
- Redis hash for task metadata
- Event-driven agent coordination

**Redis Event Format:**
```json
{
  "type": "validation_passed",
  "taskId": "distributed-task-microservices",
  "mode": "enterprise",
  "iteration": 2,
  "confidence": 0.88,
  "consensus": 0.94,
  "timestamp": 1760818560
}
```

---

## Testing the Examples

### Quick Test

Run all examples in sequence:
```bash
# Test Loop 3 gate
./coordinator-loop3-gate.sh

# Test Loop 2 consensus
./coordinator-loop2-consensus.sh

# Test full CFN loop
./coordinator-full-cfn-loop.sh

# Test Redis integration (requires Redis)
./coordinator-redis-integration.sh
```

### Customizing Examples

Each script can be modified to test different scenarios:

**Adjust confidence scores:**
```bash
# In any script, modify:
AGENT_CONFIDENCE=0.75  # Change to test different thresholds
```

**Change validation mode:**
```bash
MODE="mvp"        # Fast iteration
MODE="standard"   # Balanced validation
MODE="enterprise" # Maximum security
```

**Test failure scenarios:**
```bash
# Set confidence below threshold
AGENT_CONFIDENCE=0.60

# Set iteration above max
ITERATION=11
```

---

## Integration Patterns

### Pattern 1: Coordinator with Spawned Agents

```bash
# Coordinator spawns agents and validates results
npx claude-flow-novice swarm "implement feature" --agents coder,tester

# Get agent confidence from results
AGENT_CONFIDENCE=$(parse_agent_response)

# Validate
./validate-iteration.sh --mode standard --iteration 1 --confidence $AGENT_CONFIDENCE
```

### Pattern 2: Event-Driven Coordination

```bash
# Agent 1: Publish validation result to Redis
./coordinator-redis-integration.sh

# Agent 2: Subscribe to events
redis-cli subscribe cfn:events

# Agent 2 receives event and acts accordingly
```

### Pattern 3: Multi-Phase Orchestration

```bash
# Phase 1: Authentication
./coordinator-full-cfn-loop.sh  # Task: auth-system

# Phase 2: Authorization (depends on Phase 1)
if validation_passed("auth-system"); then
  ./coordinator-full-cfn-loop.sh  # Task: authz-system
fi
```

---

## Exit Codes

All examples follow the standard CFN Loop validation exit codes:

| Code | Meaning | Action |
|------|---------|--------|
| 0 | Validation passed | Continue to next phase |
| 1 | Validation failed | Inject feedback, retry |
| 2 | Max iterations exceeded | Escalate to human |
| 3 | Invalid arguments | Fix script parameters |
| 4 | Configuration error | Check config.json |

---

## Dependencies

**Required:**
- `bash` (version 4.0+)
- `jq` (JSON processor)

**Optional:**
- `redis-cli` (for Redis integration example)
- `bc` (basic calculator, usually pre-installed)

**Installation:**
```bash
# Ubuntu/Debian
sudo apt-get install jq redis-tools bc

# macOS
brew install jq redis bc
```

---

## Troubleshooting

### Issue: "Permission denied"
```bash
chmod +x *.sh
```

### Issue: "jq: command not found"
```bash
sudo apt-get install jq
```

### Issue: "Redis connection failed"
```bash
# Start Redis
docker run -d -p 6379:6379 redis:latest

# Or install locally
sudo apt-get install redis-server
sudo systemctl start redis
```

### Issue: Line ending errors (Windows/WSL)
```bash
sed -i 's/\r$//' *.sh
```

---

## Next Steps

1. **Customize:** Modify examples for your specific use case
2. **Integrate:** Use patterns in your coordinator implementations
3. **Extend:** Add custom validation logic or Redis event handlers
4. **Monitor:** Track validation metrics in Redis or SQLite

For more information, see `.claude/skills/cfn-loop-orchestration-v2/lib/validation/SKILL.md`
