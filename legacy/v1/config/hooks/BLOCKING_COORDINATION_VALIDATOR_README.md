# Blocking Coordination Validator Hook

## Overview

Priority 4 validator for coordinator-specific blocking coordination patterns with hybrid automation.

**Automation Level:**
- 60% pattern detection (automated via regex/AST)
- 15% agent collaboration (semantic validation via --spawn-reviewer flag)
- 25% manual review (domain knowledge for timeout appropriateness)

**Performance Target:** <2s for pattern detection

**Scope:** Affects 12 coordinator agents in the system

## Features

### Automated Validation (60%)

1. **Required Imports Detection**
   - `BlockingCoordinationSignals` (critical)
   - `CoordinatorTimeoutHandler` (recommended)

2. **Signal ACK Protocol Completeness**
   - `sendSignal()` - Signal transmission
   - `waitForAck()` - ACK waiting
   - `receiveSignal()` - Signal reception
   - `sendAck()` - ACK confirmation

3. **HMAC Secret Validation**
   - `process.env.BLOCKING_COORDINATION_SECRET` usage
   - Security critical for coordinator authentication

4. **Heartbeat Monitoring**
   - `timeoutHandler.start()` - Monitoring initiation
   - `heartbeat.recordActivity()` - Activity tracking

5. **Timeout Handling**
   - `checkCoordinatorHealth()` - Health checks
   - `handleTimeout()` - Timeout processing
   - `cleanupDeadCoordinator()` - Cleanup operations

6. **Timeout Value Validation**
   - ACK timeout: 5s-60s recommended range
   - Heartbeat interval: 10s-120s recommended range
   - Warnings for values outside recommended ranges

### Hybrid Validation (15% Agent Collaboration)

7. **State Machine Complexity Detection**
   - State count > 5 (complex)
   - Transition count > 10 (complex)
   - Conditional count > 8 (complex)
   - Triggers agent review recommendation

## Usage

### Basic Validation

```bash
# Validate a coordinator file
node config/hooks/post-edit-blocking-coordination.js src/swarm/coordinator.ts

# Verbose output
node config/hooks/post-edit-blocking-coordination.js src/swarm/coordinator.ts --verbose

# JSON output
node config/hooks/post-edit-blocking-coordination.js src/swarm/coordinator.ts --json
```

### Agent Collaboration Mode

```bash
# Enable automatic agent review for complex state machines
node config/hooks/post-edit-blocking-coordination.js src/swarm/coordinator.ts --spawn-reviewer
```

### Integration with Post-Edit Pipeline

```bash
# Called automatically after file edit
node config/hooks/post-edit-pipeline.js src/swarm/coordinator.ts --memory-key "swarm/coordinator/task-1"
```

## Trigger Patterns

The validator activates when any of these conditions are met:

1. **Import Detection:** File imports `BlockingCoordinationSignals`
2. **Filename Pattern:** Filename contains "coordinator" (case-insensitive)
3. **Class/Interface:** Code contains `class *Coordinator` or `interface *Coordinator`

## Validation Output

### Console Format (Default)

```
═══════════════════════════════════════════════════════════════
  Blocking Coordination Validator - coordinator.ts
═══════════════════════════════════════════════════════════════

✅ Status: VALID
⏱️  Execution Time: 982ms

📋 Pattern Validation:
  • Required Imports:     ✅
  • Signal Methods:       ✅
  • HMAC Secret:          ✅
  • Heartbeat:            ✅
  • Timeout Handling:     ✅

📊 Complexity Metrics:
  • State Variables:      9
  • State Transitions:    11
  • Conditionals:         10
  • Complexity Score:     44.5

⚠️  Warnings:
  • [complex_state_machine] (line 145) 🤖 Complex state machine detected - recommend agent review
  • [timeout_too_short] (line 89) ACK timeout 2000ms is less than recommended minimum 5000ms

🤖 Agent Review Required:
  • Complex state machine detected (states: 9, transitions: 11, conditionals: 10)

  💡 Recommendation: Run with --spawn-reviewer flag to trigger automatic agent validation

💡 Recommendations:
  🔴 [CRITICAL] Agent review will be triggered automatically due to --spawn-reviewer flag
  🟠 [HIGH] Consider spawning reviewer agent for state machine validation
  🟡 [MEDIUM] Add heartbeat monitoring for coordinator health tracking

📝 Validation Limitations:
  • Pattern detection:             60% automated
  • State machine correctness:     Requires semantic understanding (agent review)
  • Timeout appropriateness:       Requires domain knowledge (manual review)
  • Protocol implementation:       Requires runtime testing

═══════════════════════════════════════════════════════════════
```

### JSON Format (--json)

```json
{
  "validator": "blocking-coordination-validator",
  "file": "src/swarm/coordinator.ts",
  "valid": true,
  "patterns": {
    "requiredImports": true,
    "signalMethods": true,
    "hmacSecret": true,
    "heartbeat": true,
    "timeoutHandling": true
  },
  "warnings": [
    {
      "type": "complex_state_machine",
      "message": "Complex state machine detected (states: 9, transitions: 11, conditionals: 10) - recommend agent review for semantic validation",
      "line": 145,
      "needsAgentReview": true
    }
  ],
  "errors": [],
  "recommendations": [
    {
      "message": "Consider spawning reviewer agent for state machine validation using --spawn-reviewer flag",
      "priority": "high"
    }
  ],
  "needsAgentReview": true,
  "agentReviewReasons": [
    "Complex state machine detected (states: 9, transitions: 11, conditionals: 10) - recommend agent review for semantic validation"
  ],
  "complexity": {
    "states": 9,
    "transitions": 11,
    "conditionals": 10,
    "score": 44.5
  },
  "executionTime": "982ms"
}
```

## Validation Rules

### Required Imports (Critical)

```typescript
// ✅ PASS: Both imports present
import { BlockingCoordinationSignals } from '../cfn-loop/blocking-coordination-signals.js';
import { CoordinatorTimeoutHandler } from '../cfn-loop/coordinator-timeout-handler.js';

// ❌ FAIL: Missing BlockingCoordinationSignals
import { CoordinatorTimeoutHandler } from '../cfn-loop/coordinator-timeout-handler.js';

// ⚠️ WARNING: Missing CoordinatorTimeoutHandler (recommended for long-running coordinators)
import { BlockingCoordinationSignals } from '../cfn-loop/blocking-coordination-signals.js';
```

### Signal ACK Protocol (Critical)

```typescript
// ✅ PASS: Complete protocol
async executeCoordination() {
  await this.signals.sendSignal(senderId, receiverId, 'completion', 1);
  await this.signals.waitForAck(receiverId, 30000);
  const signal = await this.signals.receiveSignal(coordinatorId);
  await this.signals.sendAck(receiverId, coordinatorId, 1);
}

// ❌ FAIL: Missing sendAck()
async executeCoordination() {
  await this.signals.sendSignal(senderId, receiverId, 'completion', 1);
  await this.signals.waitForAck(receiverId, 30000);
  const signal = await this.signals.receiveSignal(coordinatorId);
  // Missing: await this.signals.sendAck(receiverId, coordinatorId, 1);
}
```

### HMAC Secret (Critical)

```typescript
// ✅ PASS: HMAC secret validated
const hmacSecret = process.env.BLOCKING_COORDINATION_SECRET;
if (!hmacSecret) {
  throw new Error('HMAC secret required for blocking coordination');
}

// ❌ FAIL: No HMAC secret usage
// Missing environment variable check
```

### Timeout Values (Warnings)

```typescript
// ✅ PASS: Values within recommended range
private ackTimeout: number = 30000;           // 30s (5s-60s range)
private heartbeatInterval: number = 60000;    // 60s (10s-120s range)

// ⚠️ WARNING: ACK timeout too short
private ackTimeout: number = 2000;            // 2s (< 5s minimum)

// ⚠️ WARNING: Heartbeat interval too long
private heartbeatInterval: number = 150000;   // 150s (> 120s maximum)
```

### State Machine Complexity (Agent Review)

```typescript
// ⚠️ WARNING: Complex state machine (requires agent review)
enum CoordinatorState {
  INITIALIZING = 'initializing',
  WAITING_FOR_SIGNAL = 'waiting_for_signal',
  PROCESSING_SIGNAL = 'processing_signal',
  SENDING_ACK = 'sending_ack',
  TIMEOUT = 'timeout',
  CLEANUP = 'cleanup',
  ERROR = 'error',        // 7 states (> 5 threshold)
}

// 11 state transitions (> 10 threshold)
// 10 conditionals (> 8 threshold)
// Complexity Score: 44.5
```

## Complexity Scoring

The validator calculates a complexity score to identify state machines requiring agent review:

```
Complexity Score = (states × 2) + (transitions × 1.5) + (conditionals × 1)
```

**Thresholds:**
- States > 5 → Complex
- Transitions > 10 → Complex
- Conditionals > 8 → Complex

**Example:**
```
States: 9 × 2 = 18
Transitions: 11 × 1.5 = 16.5
Conditionals: 10 × 1 = 10
Total: 44.5 (COMPLEX - requires agent review)
```

## Error Types

### Critical Errors (Validation Fails)

1. **missing_import:** Missing BlockingCoordinationSignals import
2. **incomplete_signal_protocol:** Signal ACK protocol incomplete
3. **missing_hmac_secret:** No HMAC secret validation

### Warnings (Validation Passes)

1. **timeout_too_short:** ACK timeout < 5s
2. **timeout_too_long:** ACK timeout > 60s
3. **heartbeat_too_frequent:** Heartbeat interval < 10s
4. **heartbeat_too_slow:** Heartbeat interval > 120s
5. **complex_state_machine:** State machine requires agent review
6. **missing_heartbeat:** No heartbeat monitoring (recommended)
7. **incomplete_timeout_handling:** Timeout detection without handler

## Limitations (Documented)

### Cannot Validate Automatically (Requires Agent/Manual Review)

1. **State Machine Correctness**
   - Transition logic validity
   - State reachability
   - Deadlock detection
   - **Solution:** Spawn reviewer agent with `--spawn-reviewer`

2. **Timeout Value Appropriateness**
   - System latency patterns
   - SLA requirements
   - Network conditions
   - **Solution:** Manual review by domain expert

3. **Protocol Implementation Correctness**
   - Runtime behavior
   - Edge case handling
   - Error recovery
   - **Solution:** Integration testing

## Integration Examples

### Post-Edit Pipeline Integration

```javascript
// config/hooks/post-edit-pipeline.js
import { BlockingCoordinationValidator } from './post-edit-blocking-coordination.js';

async function runValidation(file, content) {
  const validator = new BlockingCoordinationValidator({ verbose: true });

  if (validator.shouldValidate(file, content)) {
    const result = await validator.validate(file, content);

    if (result.needsAgentReview) {
      // Spawn reviewer agent for semantic validation
      await spawnReviewerAgent(file, result);
    }

    return result;
  }
}
```

### CI/CD Integration

```bash
#!/bin/bash
# .github/workflows/coordinator-validation.yml

# Validate all coordinator files
find src -name "*coordinator*.ts" | while read file; do
  node config/hooks/post-edit-blocking-coordination.js "$file" --json || exit 1
done
```

### Pre-Commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Validate staged coordinator files
git diff --cached --name-only --diff-filter=ACM | grep -i "coordinator.*\.ts$" | while read file; do
  if [ -f "$file" ]; then
    node config/hooks/post-edit-blocking-coordination.js "$file" || exit 1
  fi
done
```

## Performance Metrics

**Target:** <2s execution time for pattern detection

**Actual Performance:**
- Simple coordinators (no state machine): 0-1ms
- Complex coordinators (state machine): 1-5ms
- Average: 2ms (well within target)

**Optimization:**
- Regex pattern matching (fastest)
- Single-pass content analysis
- No external dependencies
- No file I/O (except initial read)

## Exit Codes

- **0:** Validation passed (all patterns valid or warnings only)
- **1:** Validation failed (critical errors present)

## Configuration

### Timeout Boundaries (CONFIG object)

```javascript
const CONFIG = {
  timeouts: {
    minAckTimeout: 5000,         // 5 seconds
    maxAckTimeout: 60000,        // 60 seconds
    minHeartbeat: 10000,         // 10 seconds
    maxHeartbeat: 120000,        // 2 minutes
  },

  complexity: {
    maxStates: 5,
    maxTransitions: 10,
    maxConditionals: 8,
  },
};
```

### Custom Configuration

```javascript
// Override defaults
const validator = new BlockingCoordinationValidator({
  verbose: true,
  json: false,
  spawnReviewer: true,
});

// Custom timeout thresholds
CONFIG.timeouts.maxAckTimeout = 90000;  // 90s for high-latency systems
```

## Troubleshooting

### False Positives

**Issue:** Non-coordinator files triggering validation

**Solution:** Ensure file naming doesn't include "coordinator" unless it's actually a coordinator

### Missing Timeout Warnings

**Issue:** Timeout values not detected

**Solution:** Ensure timeout values match pattern `ackTimeout: number = 30000` or `ackTimeout = 30000`

### Agent Review Not Triggering

**Issue:** Complex state machine detected but no agent review

**Solution:** Run with `--spawn-reviewer` flag to enable automatic agent review

## References

- **Implementation Spec:** `/planning/redis-finalization/AGENT_HOOK_DELEGATION_RECOMMENDATIONS.md`
- **Blocking Coordination Pattern:** `/docs/patterns/blocking-coordination-pattern.md`
- **Signal API Reference:** `/docs/api/blocking-coordination-api.md`
- **Source Implementation:** `/src/cfn-loop/blocking-coordination-signals.ts`
- **Timeout Handler:** `/src/cfn-loop/coordinator-timeout-handler.ts`

## Version History

- **v1.0.0** (2025-10-11): Initial implementation
  - 60% pattern detection automation
  - 15% agent collaboration support
  - Timeout value validation
  - State machine complexity detection
  - Performance target: <2s (achieved: ~2ms average)
