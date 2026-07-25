# CFN Loop Test Implementation Guide

**Goal:** Provide step-by-step guidance for implementing the 10 test scenarios using synthetic agents and existing infrastructure.

---

## Architecture Overview

### What We're Testing

```
Main Chat
    │
    └─→ Orchestrator (orchestrate-cfn-loop.sh)
            │
            ├─→ Loop 3 Agents (Synthetic)
            │       │
            │       └─→ Report confidence → Enter waiting mode
            │
            ├─→ Gate Check (orchestrator)
            │       │
            │       ├─→ PASS: Signal Loop 2 to start
            │       └─→ FAIL: Wake Loop 3 for iteration N+1
            │
            ├─→ Loop 2 Validators (Synthetic, BLPOP until gate passes)
            │       │
            │       └─→ Report consensus → Enter waiting mode
            │
            ├─→ Consensus Check (orchestrator)
            │       │
            │       ├─→ PASS: Signal Product Owner
            │       └─→ FAIL: Wake all agents for iteration N+1
            │
            └─→ Product Owner (Synthetic, BLPOP until consensus)
                    │
                    └─→ Decision: approve/reject
```

### Key Infrastructure Components

1. **Orchestrator:** `.claude/skills/redis-coordination/orchestrate-cfn-loop.sh`
   - Spawns agents via CLI
   - Manages gate checks
   - Collects consensus
   - Handles iterations

2. **Waiting Mode:** `.claude/skills/redis-coordination/invoke-waiting-mode.sh`
   - `enter` - Agent enters BLPOP wait
   - `wake` - Coordinator wakes agent
   - `report` - Agent reports confidence
   - `collect` - Coordinator collects results

3. **Redis Keys:**
   - `swarm:{taskId}:{agentId}:done` - Completion signal
   - `swarm:{taskId}:confidence` - Confidence scores (hash)
   - `swarm:{taskId}:gate-passed` - Gate pass signal (list, BLPOP)
   - `swarm:{taskId}:wake:{agentId}` - Wake signals (list, BLPOP)

---

## Synthetic Agent Design

### Base Synthetic Agent

```javascript
#!/usr/bin/env node

import Redis from 'ioredis';
import { execSync } from 'child_process';

class SyntheticAgent {
  constructor(config) {
    this.agentId = config.agentId;
    this.taskId = config.taskId;
    this.role = config.role;  // 'loop3', 'loop2', or 'product-owner'
    this.confidencePattern = config.confidencePattern;  // Array: [iter1, iter2, ...]
    this.redis = new Redis();
  }

  async execute() {
    let iteration = 1;
    let shouldContinue = true;

    while (shouldContinue) {
      console.log(`[${this.agentId}] Starting iteration ${iteration}`);

      // Simulate work (no actual LLM calls)
      await this.simulateWork(iteration);

      // Report confidence
      const confidence = this.getConfidence(iteration);
      await this.reportConfidence(confidence, iteration);

      // Signal completion
      await this.redis.lpush(`swarm:${this.taskId}:${this.agentId}:done`, 'complete');

      // Enter waiting mode
      shouldContinue = await this.waitForWakeSignal(iteration);

      iteration++;
    }

    await this.redis.disconnect();
  }

  async simulateWork(iteration) {
    // Synthetic work - just delay
    console.log(`[${this.agentId}] Simulating work for iteration ${iteration}...`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  getConfidence(iteration) {
    // Return pre-configured confidence for this iteration
    const index = iteration - 1;
    if (index < this.confidencePattern.length) {
      return this.confidencePattern[index];
    }
    // Default to high confidence if pattern exhausted
    return 0.95;
  }

  async reportConfidence(confidence, iteration) {
    console.log(`[${this.agentId}] Reporting confidence: ${confidence} (iteration ${iteration})`);

    // Use invoke-waiting-mode.sh report
    execSync(
      `./.claude/skills/redis-coordination/invoke-waiting-mode.sh report ` +
      `--task-id "${this.taskId}" ` +
      `--agent-id "${this.agentId}" ` +
      `--confidence ${confidence} ` +
      `--iteration ${iteration}`,
      { stdio: 'inherit' }
    );
  }

  async waitForWakeSignal(iteration) {
    console.log(`[${this.agentId}] Entering waiting mode (iteration ${iteration})...`);

    try {
      // Use invoke-waiting-mode.sh enter (BLPOP)
      execSync(
        `./.claude/skills/redis-coordination/invoke-waiting-mode.sh enter ` +
        `--task-id "${this.taskId}" ` +
        `--agent-id "${this.agentId}" ` +
        `--context "iteration-${iteration}"`,
        { stdio: 'inherit', timeout: 300000 }  // 5 min timeout
      );

      console.log(`[${this.agentId}] Woke up! Continuing to next iteration.`);
      return true;  // Continue to next iteration
    } catch (err) {
      if (err.message.includes('timeout')) {
        console.log(`[${this.agentId}] Timeout - task complete (no wake signal)`);
        return false;  // Task complete
      }
      throw err;
    }
  }
}

// CLI entry point
const config = JSON.parse(process.argv[2]);
const agent = new SyntheticAgent(config);
agent.execute().catch(console.error);
```

### Loop 2 Validator (Waits for Gate Pass)

```javascript
class SyntheticLoop2Validator extends SyntheticAgent {
  async waitForGatePass() {
    console.log(`[${this.agentId}] Waiting for gate to pass (BLPOP)...`);

    // BLPOP on gate-passed signal
    const result = await this.redis.blpop(`swarm:${this.taskId}:gate-passed`, 300);

    if (!result) {
      throw new Error('Gate pass timeout');
    }

    console.log(`[${this.agentId}] Gate passed! Starting review.`);
  }

  async execute() {
    // Wait for gate to pass before starting
    await this.waitForGatePass();

    // Then execute normal iteration loop
    await super.execute();
  }
}
```

### Product Owner (Waits for Consensus)

```javascript
class SyntheticProductOwner extends SyntheticAgent {
  async waitForConsensus() {
    console.log(`[${this.agentId}] Waiting for consensus (BLPOP)...`);

    const result = await this.redis.blpop(`swarm:${this.taskId}:consensus-reached`, 300);

    if (!result) {
      throw new Error('Consensus timeout');
    }

    console.log(`[${this.agentId}] Consensus reached! Making decision.`);
  }

  async makeDecision(iteration) {
    // Synthetic decision logic
    const decision = this.decisionPattern[iteration - 1] || 'approve';

    console.log(`[${this.agentId}] Decision: ${decision}`);

    await this.redis.hset(
      `swarm:${this.taskId}:product-owner`,
      'decision',
      decision
    );

    return decision;
  }

  async execute() {
    await this.waitForConsensus();

    const decision = await this.makeDecision(1);

    if (decision === 'approve') {
      console.log(`[${this.agentId}] Task approved. Complete.`);
    } else {
      // Veto - continue to iteration loop
      await super.execute();
    }
  }
}
```

---

## Test Scenario Implementation Pattern

### Example: Scenario 1 (Perfect Storm)

```javascript
#!/usr/bin/env node

import { spawn } from 'child_process';
import Redis from 'ioredis';

const TASK_ID = `test-perfect-storm-${Date.now()}`;

async function runScenario() {
  const redis = new Redis();

  console.log('🧪 Scenario 1: Perfect Storm (Zero Iterations)');
  console.log(`Task ID: ${TASK_ID}\n`);

  // Define synthetic agents
  const agents = [
    {
      agentId: 'coder',
      role: 'loop3',
      confidencePattern: [0.95]  // High confidence iteration 1
    },
    {
      agentId: 'researcher',
      role: 'loop3',
      confidencePattern: [0.92]
    },
    {
      agentId: 'reviewer',
      role: 'loop2',
      confidencePattern: [0.95]
    },
    {
      agentId: 'tester',
      role: 'loop2',
      confidencePattern: [0.93]
    },
    {
      agentId: 'product-owner',
      role: 'product-owner',
      decisionPattern: ['approve']
    }
  ];

  // Spawn orchestrator
  console.log('🚀 Spawning orchestrator...\n');

  const orchestrator = spawn(
    './.claude/skills/redis-coordination/orchestrate-cfn-loop.sh',
    [
      '--task-id', TASK_ID,
      '--mode', 'standard',
      '--loop3-agents', 'coder,researcher',
      '--loop2-agents', 'reviewer,tester',
      '--product-owner', 'product-owner',
      '--max-iterations', '5',
      '--synthetic'  // Flag for synthetic mode
    ],
    { stdio: 'inherit' }
  );

  // Wait for orchestrator to spawn agents
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Spawn synthetic agents
  console.log('🤖 Spawning synthetic agents...\n');

  const agentProcesses = agents.map(agentConfig => {
    return spawn(
      'node',
      [
        './test-harness/lib/synthetic-agent.js',
        JSON.stringify({ ...agentConfig, taskId: TASK_ID })
      ],
      { stdio: 'inherit' }
    );
  });

  // Wait for orchestrator to complete
  await new Promise((resolve, reject) => {
    orchestrator.on('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(`Orchestrator failed with code ${code}`));
    });
  });

  // Kill agent processes (they should have exited already)
  agentProcesses.forEach(p => p.kill());

  // Validate results
  console.log('\n✅ Validating results...\n');

  const confidence = await redis.hgetall(`swarm:${TASK_ID}:confidence`);
  const decision = await redis.hget(`swarm:${TASK_ID}:product-owner`, 'decision');

  console.log('Confidence scores:', confidence);
  console.log('Product Owner decision:', decision);

  // Success criteria
  const passed =
    parseFloat(confidence.coder) === 0.95 &&
    parseFloat(confidence.researcher) === 0.92 &&
    parseFloat(confidence.reviewer) === 0.95 &&
    parseFloat(confidence.tester) === 0.93 &&
    decision === 'approve';

  if (passed) {
    console.log('\n🎉 Scenario 1 PASSED');
  } else {
    console.log('\n❌ Scenario 1 FAILED');
    process.exit(1);
  }

  await redis.disconnect();
}

runScenario().catch(console.error);
```

---

## Orchestrator Modifications for Synthetic Mode

### Add `--synthetic` Flag

Modify `orchestrate-cfn-loop.sh` to support synthetic mode:

```bash
# Parse arguments
SYNTHETIC=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --synthetic)
      SYNTHETIC=true
      shift
      ;;
    # ... other args
  esac
done

# Agent spawning logic
if [ "$SYNTHETIC" = true ]; then
  echo "⚠️  Synthetic mode: Skipping agent spawning (test harness handles it)"
else
  # Normal CLI spawning
  npx claude-flow-novice agent "$AGENT_ID" --task-id "$TASK_ID"
fi
```

**Why:** Test scenarios spawn synthetic agents directly, orchestrator just manages coordination.

---

## Redis Validation Utilities

### Validate BLPOP Blocking

```javascript
async function validateBLPOPBlocking(redis, taskId, agentId, expectedBlockDuration) {
  const startTime = Date.now();

  // Check agent didn't wake prematurely
  const wakeKey = `swarm:${taskId}:wake:${agentId}`;
  const wakeSignal = await redis.lpop(wakeKey);

  const actualDuration = Date.now() - startTime;

  if (wakeSignal && actualDuration < expectedBlockDuration) {
    throw new Error(
      `Agent ${agentId} woke prematurely (${actualDuration}ms < ${expectedBlockDuration}ms)`
    );
  }

  console.log(`✅ ${agentId} blocked correctly for ${actualDuration}ms`);
}
```

### Validate Gate Enforcement

```javascript
async function validateGateEnforcement(redis, taskId, expectedIterations) {
  const gatePassKey = `swarm:${taskId}:gate-passed`;
  const gatePassCount = await redis.llen(gatePassKey);

  if (gatePassCount !== 1) {
    throw new Error(`Expected 1 gate pass, got ${gatePassCount}`);
  }

  console.log(`✅ Gate passed exactly once (after ${expectedIterations} iterations)`);
}
```

### Validate Consensus Calculation

```javascript
async function validateConsensus(redis, taskId, expectedConsensus) {
  const confidenceHash = await redis.hgetall(`swarm:${taskId}:confidence`);
  const scores = Object.values(confidenceHash).map(parseFloat);

  const avgConfidence = scores.reduce((a, b) => a + b, 0) / scores.length;

  if (Math.abs(avgConfidence - expectedConsensus) > 0.01) {
    throw new Error(
      `Consensus mismatch: expected ${expectedConsensus}, got ${avgConfidence}`
    );
  }

  console.log(`✅ Consensus: ${avgConfidence.toFixed(3)} (expected: ${expectedConsensus})`);
}
```

---

## Test Execution Workflow

### 1. Setup

```bash
# Ensure Redis is running
redis-cli ping

# Clean Redis keys
redis-cli --scan --pattern "swarm:test-*" | xargs -r redis-cli del

# Create output directory
mkdir -p planning/cfn-testing/results
```

### 2. Run Single Scenario

```bash
node planning/cfn-testing/test-harness/scenarios/01-perfect-storm.js
```

### 3. Run All Scenarios

```bash
./planning/cfn-testing/test-harness/run-all-scenarios.sh
```

### 4. Validate Results

```bash
node planning/cfn-testing/test-harness/validate-results.js --all
```

---

## Metrics Collection

### Per-Scenario Metrics

```javascript
{
  "scenarioId": "01-perfect-storm",
  "timestamp": 1728737271000,
  "taskId": "test-perfect-storm-1728737271000",
  "success": true,
  "duration": 12500,  // ms
  "iterations": 1,
  "agentCount": 5,
  "loop3Confidence": {
    "coder": 0.95,
    "researcher": 0.92,
    "avg": 0.935
  },
  "loop2Confidence": {
    "reviewer": 0.95,
    "tester": 0.93,
    "avg": 0.94
  },
  "productOwnerDecision": "approve",
  "redisOps": {
    "blpopCount": 5,
    "avgBlpopDuration": 2500
  },
  "checks": {
    "gateEnforced": true,
    "consensusEnforced": true,
    "blpopBlocking": true,
    "zeroTokenWaiting": true
  }
}
```

### Aggregate Metrics

```javascript
{
  "totalScenarios": 10,
  "passed": 10,
  "failed": 0,
  "totalDuration": 125000,  // ms
  "avgScenarioDuration": 12500,
  "avgIterations": 2.5,
  "redisPerformance": {
    "avgBlpopLatency": 50,  // ms
    "maxBlpopLatency": 100
  }
}
```

---

## Debugging Tips

### 1. Redis Key Inspection

```bash
# List all keys for task
redis-cli keys "swarm:test-*"

# Inspect confidence scores
redis-cli hgetall "swarm:test-123:confidence"

# Check wake signals
redis-cli lrange "swarm:test-123:wake:coder" 0 -1

# Monitor pub/sub
redis-cli MONITOR
```

### 2. Agent Logs

```bash
# Tail orchestrator logs
tail -f /tmp/orchestrator-test-123.log

# Tail agent logs
tail -f /tmp/agent-coder-test-123.log
```

### 3. Timeout Issues

If agents timeout:
- Check orchestrator is sending wake signals
- Verify BLPOP key names match
- Ensure Redis is accessible
- Check timeout values (default 300s)

---

## Next Steps

1. **Build Synthetic Agent Library**
   - `synthetic-agent.js` (base class)
   - `loop2-validator.js` (extends base)
   - `product-owner.js` (extends base)

2. **Implement Scenario 1**
   - Create `scenarios/01-perfect-storm.js`
   - Test with orchestrator
   - Validate results

3. **Iterate Through Scenarios 2-10**
   - Build incrementally
   - Reuse synthetic agent library
   - Document lessons learned

4. **Create Run Script**
   - `run-all-scenarios.sh`
   - Sequential execution
   - Result aggregation

5. **Integrate with CI**
   - Add to GitHub Actions
   - Run on PRs
   - Block merges on failure
