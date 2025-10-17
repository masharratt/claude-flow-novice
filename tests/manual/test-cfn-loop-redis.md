# CFN Loop Redis Integration - Manual Test Documentation

## 1. Test Overview

### Purpose
Comprehensive manual testing of the CFN Loop Redis coordination system across MVP, Standard, and Enterprise modes to validate:
- Redis pub/sub coordination
- SQLite persistence
- Agent coordination patterns
- Gate and consensus thresholds
- Product Owner decision-making

### Scope
- Test coordination across Loop 3 (Workers), Loop 2 (Validators), and Loop 4 (Product Owner)
- Validate mode-specific thresholds and behaviors
- Verify Redis channel management
- Test edge cases and error scenarios

### Prerequisites
1. **Infrastructure Ready**
   - Redis server running
   - SQLite memory system initialized
   - Node.js 18+ installed
   - Claude Flow Novice CLI available

2. **Tools Needed**
   ```bash
   # Verify prerequisites
   redis-cli ping
   node --version
   which npx
   ```

3. **Environment Setup**
   ```bash
   # Configure test environment
   export CFN_TEST_MODE="all"  # Run all modes
   export PROVIDER="zai"
   ```

## 2. Test Scenarios

### 2.1 MVP Mode Tests
- **Objective:** Validate rapid, cost-optimized coordination
- **Key Parameters**:
  - Gate Threshold: ≥0.65
  - Consensus Threshold: ≥0.85
  - Max Iterations: 5
  - Cost Limit: $1.50
  - Timeout: 15 minutes

### 2.2 Standard Mode Tests
- **Objective:** Validate balanced quality and speed coordination
- **Key Parameters**:
  - Gate Threshold: ≥0.75
  - Consensus Threshold: ≥0.90
  - Max Iterations: 10
  - Cost Limit: $2.50
  - Timeout: 30 minutes

### 2.3 Enterprise Mode Tests
- **Objective:** Validate high-rigor, compliance-first coordination
- **Key Parameters**:
  - Gate Threshold: ≥0.85
  - Consensus Threshold: ≥0.95
  - Max Iterations: 15
  - Cost Limit: $5.00
  - Timeout: 60 minutes

## 3. Step-by-Step Procedures

### 3.1 Common Test Setup
```bash
# Clean previous test data
redis-cli flushall
rm -f data/swarm-memory-*.db
```

### 3.2 MVP Mode Test Procedure
```bash
# Test Phase ID
export PHASE_ID="mvp-test-$(date +%Y%m%d%H%M%S)"

# Step 1: Spawn Workers (Loop 3)
npx claude-flow-novice swarm \
  "Implement user registration endpoint - MVP" \
  --mode=mvp \
  --agents=coder,tester \
  --topology=sequential

# Verify Redis Channel
redis-cli llen "swarm:cfn:mvp:${PHASE_ID}:loop3:complete"
# Expected: 1 message

# Step 2: Spawn Validators (Loop 2)
npx claude-flow-novice swarm \
  "Validate user registration MVP implementation" \
  --mode=mvp \
  --agents=code-quality-validator,security-specialist \
  --topology=sequential

# Verify Redis Channel
redis-cli llen "swarm:cfn:mvp:${PHASE_ID}:loop2:complete"
# Expected: 1 message

# Step 3: Product Owner Decision (Loop 4)
npx claude-flow-novice swarm \
  "Product Owner MVP decision" \
  --mode=mvp \
  --agents=product-owner

# Check Decision Channel
redis-cli llen "swarm:cfn:mvp:${PHASE_ID}:loop4:decision"
# Expected: 1 message with PROCEED/DEFER/ESCALATE
```

### 3.3 Standard Mode Test Procedure
```bash
# Test Phase ID
export PHASE_ID="standard-test-$(date +%Y%m%d%H%M%S)"

# Step 1: Spawn Workers (Loop 3)
npx claude-flow-novice swarm \
  "Implement payment processing system" \
  --mode=standard \
  --agents=architect,coder,coder,tester \
  --topology=collaborative

# Verify Redis Channel
redis-cli llen "swarm:cfn:standard:${PHASE_ID}:loop3:complete"
# Expected: 1 message

# Step 2: Spawn Validators (Loop 2)
npx claude-flow-novice swarm \
  "Validate payment processing implementation" \
  --mode=standard \
  --agents=code-quality-validator,security-specialist,perf-analyzer,interaction-tester \
  --topology=collaborative

# Verify Redis Channel
redis-cli llen "swarm:cfn:standard:${PHASE_ID}:loop2:complete"
# Expected: 1 message

# Step 3: Product Owner Decision (Loop 4)
npx claude-flow-novice swarm \
  "Product Owner Standard decision" \
  --mode=standard \
  --agents=product-owner

# Check Decision Channel
redis-cli llen "swarm:cfn:standard:${PHASE_ID}:loop4:decision"
# Expected: 1 message with PROCEED/DEFER/ESCALATE
```

### 3.4 Enterprise Mode Test Procedure
```bash
# Test Phase ID
export PHASE_ID="enterprise-test-$(date +%Y%m%d%H%M%S)"

# Step 1: Spawn Workers (Loop 3)
npx claude-flow-novice swarm \
  "Implement HIPAA-compliant patient data API" \
  --mode=enterprise \
  --agents=architect,architect,coder,coder,coder,tester,security-specialist,perf-analyzer \
  --topology=release-gate

# Verify Redis Channel
redis-cli llen "swarm:cfn:enterprise:${PHASE_ID}:loop3:complete"
# Expected: 1 message

# Step 2: Spawn Validators (Loop 2)
npx claude-flow-novice swarm \
  "Validate patient data API implementation" \
  --mode=enterprise \
  --agents=code-quality-validator,security-specialist,perf-analyzer,interaction-tester,compliance-auditor \
  --topology=release-gate

# Verify Redis Channel
redis-cli llen "swarm:cfn:enterprise:${PHASE_ID}:loop2:complete"
# Expected: 1 message

# Step 3: Product Owner Decision (Loop 4)
npx claude-flow-novice swarm \
  "Product Owner Enterprise decision" \
  --mode=enterprise \
  --agents=product-owner

# Check Decision Channel
redis-cli llen "swarm:cfn:enterprise:${PHASE_ID}:loop4:decision"
# Expected: 1 message with PROCEED/DEFER/ESCALATE
```

## 4. Validation Checkpoints

### 4.1 Loop 3 (Workers) Validation
- **Check Gate Thresholds**:
  - MVP: ≥0.65
  - Standard: ≥0.75
  - Enterprise: ≥0.85

### 4.2 Loop 2 (Validators) Validation
- **Check Consensus Thresholds**:
  - MVP: ≥0.85
  - Standard: ≥0.90
  - Enterprise: ≥0.95

### 4.3 Loop 4 (Product Owner) Validation
- **Decision Verification**:
  - Gate and consensus threshold checks
  - Critical blocker detection
  - PROCEED/DEFER/ESCALATE logic validation

## 5. Expected Redis Channels

### 5.1 MVP Mode Channels
- `swarm:cfn:mvp:{phaseId}:loop3:complete`
- `swarm:cfn:mvp:{phaseId}:loop2:complete`
- `swarm:cfn:mvp:{phaseId}:loop4:decision`
- `swarm:cfn:mvp:{phaseId}:escalate` (optional)

### 5.2 Standard Mode Channels
- `swarm:cfn:standard:{phaseId}:loop3:complete`
- `swarm:cfn:standard:{phaseId}:loop2:complete`
- `swarm:cfn:standard:{phaseId}:loop4:decision`
- `swarm:cfn:standard:{phaseId}:escalate` (optional)

### 5.3 Enterprise Mode Channels
- `swarm:cfn:enterprise:{phaseId}:loop3:complete`
- `swarm:cfn:enterprise:{phaseId}:loop2:complete`
- `swarm:cfn:enterprise:{phaseId}:loop4:decision`
- `swarm:cfn:enterprise:{phaseId}:escalate` (critical blockers)

## 6. Troubleshooting

### 6.1 Redis Connection Issues
```bash
# Check Redis connectivity
redis-cli ping
# Expected: PONG

# Check Redis channels
redis-cli keys "swarm:cfn:*"
# Should list active channels
```

### 6.2 Agent Coordination Failures
```bash
# Check worker logs
tail -f logs/spawn-workers-*.log

# Identify hanging processes
ps aux | grep spawn-workers.js
```

### 6.3 SQLite Persistence Check
```bash
# Verify SQLite memory writes
node -e "
const {SQLiteMemorySystem} = require('./src/sqlite/SwarmMemoryManager.cjs');
const mem = new SQLiteMemorySystem({swarmId: '${PHASE_ID}', agentId: 'test'});
mem.initialize().then(async () => {
  const keys = await mem.memoryAdapter.listKeys({agentId: 'test'});
  console.log('SQLite Keys:', keys);
  process.exit(0);
});
"
```

## 7. Success Criteria Checklist

### Execution Checklist
- [ ] MVP mode test completed successfully
- [ ] Standard mode test completed successfully
- [ ] Enterprise mode test completed successfully
- [ ] All Redis channels populated
- [ ] SQLite persistence verified
- [ ] Thresholds met for each mode
- [ ] Decision logic validated

### Performance Checklist
- [ ] Redis BLPOP latency <10ms
- [ ] Message throughput >1000 msg/sec
- [ ] Memory usage <500MB
- [ ] CPU usage <30%

### Validation Metrics
- **Mode Compliance**
  - MVP: Gate ≥0.65, Consensus ≥0.85
  - Standard: Gate ≥0.75, Consensus ≥0.90
  - Enterprise: Gate ≥0.85, Consensus ≥0.95

## 8. Monitoring Commands

```bash
# Real-time Redis monitoring
redis-cli monitor

# Track CFN Loop channels
./scripts/monitor-swarm-redis.sh cfn-loop

# Launch coordination dashboard
npx claude-flow-novice dashboard --watch
```

## Appendix: Test Execution Log

Create a timestamp-based log file after each test run:
```bash
# Redirect test output
./test-cfn-loop-redis.sh > logs/test-cfn-loop-redis-$(date +%Y%m%d%H%M%S).log
```
