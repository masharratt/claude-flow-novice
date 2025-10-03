# Troubleshooting Guide

Common issues, debugging commands, and solutions for the CFN Loop system.

---

## Common Issues

### Issue 1: Agents Not Coordinating

**Symptom:** Agents produce conflicting solutions (e.g., 3 different authentication methods)

**Cause:** `swarm_init` not called before spawning agents

**Diagnosis:**
```javascript
// Check if swarm was initialized
npx claude-flow-novice swarm status --swarm-id your-swarm-id

// Output if NOT initialized:
// Error: Swarm 'your-swarm-id' not found
```

**Solution:**
```javascript
// ❌ BAD: No swarm initialization
Task("Agent 1", "Fix auth", "coder")
Task("Agent 2", "Fix auth", "coder")

// ✅ GOOD: Initialize swarm first
mcp__claude-flow-novice__swarm_init({
  topology: "mesh",
  maxAgents: 2,
  strategy: "balanced"
})
Task("Agent 1", "Fix auth", "coder")
Task("Agent 2", "Fix auth", "coder")
```

---

### Issue 2: Post-Edit Hook Failures

**Symptom:** `enhanced-hooks` command fails or returns errors

**Cause:** Missing dependencies (prettier, eslint, jest, etc.)

**Diagnosis:**
```bash
# Run hook with verbose output
npx enhanced-hooks post-edit "file.js" --structured

# Check for dependency errors
# Example output:
# {
#   "success": false,
#   "error": "prettier not found",
#   "validation": { "coverage": "missing" }
# }
```

**Solution:**
```bash
# Install missing dependencies
npm install --save-dev prettier eslint jest

# Re-run hook
npx enhanced-hooks post-edit "file.js" --structured
```

**Alternative:** Enable graceful degradation (hook warns but doesn't block)
```javascript
// config/cfn-loop-config.js
export const CFN_CONFIG = {
  selfValidation: {
    blockOnCritical: false,  // Don't block on missing tools
    gracefulDegradation: true
  }
};
```

---

### Issue 3: Low Confidence Scores (Always Below Threshold)

**Symptom:** Self-validation always fails, confidence < 0.75

**Cause:** Unrealistic coverage requirements or missing tests

**Diagnosis:**
```bash
# Check detailed validation results
npx enhanced-hooks post-edit "file.js" --structured

# Example output showing root cause:
# {
#   "validation": {
#     "testsPassed": false,    // ← MISSING TESTS
#     "coverage": 0,
#     "noSyntaxErrors": true,
#     "securityIssues": []
#   },
#   "confidence": 0.45          // ← 30% penalty for missing tests
# }
```

**Solutions:**

**1. Add Missing Tests:**
```javascript
// Add tests FIRST (TDD approach)
// Then re-run validation
```

**2. Lower Coverage Threshold Temporarily:**
```bash
npx enhanced-hooks post-edit "file.js" \
  --minimum-coverage 60 \
  --structured
```

**3. Adjust Confidence Weights:**
```javascript
// config/cfn-loop-config.js
export const CFN_CONFIG = {
  selfValidation: {
    weights: {
      testsPassed: 0.30,
      coverage: 0.15,      // Reduced from 0.25
      syntax: 0.15,
      security: 0.30,      // Increased for security focus
      formatting: 0.10
    }
  }
};
```

---

### Issue 4: Consensus Never Reached

**Symptom:** Validators disagree after 5+ rounds

**Cause:** Contradictory validator feedback or ambiguous requirements

**Diagnosis:**
```bash
# View consensus history
npx claude-flow-novice memory search "swarm/consensus/*/round-*"

# Example output showing conflict:
# Round 3:
#   Validator 1 (security): "Use Redis for rate limiting"
#   Validator 2 (architect): "Use in-memory rate limiting"
# → Contradiction! Clarify requirements
```

**Solutions:**

**1. Review Validator Feedback for Conflicts:**
```javascript
// Analyze feedback patterns
const rounds = await memory.search('swarm/consensus/*/round-*');
const conflicts = rounds.filter(r => r.disagreement > 0.3);

// Common conflicts:
// - Technology choice (Redis vs in-memory)
// - Architecture pattern (microservices vs monolith)
// - Testing approach (unit vs integration)
```

**2. Manually Resolve Ambiguity:**
```markdown
**Clarification:**
- Use Redis for production rate limiting (scalable across instances)
- Use in-memory for development/testing (simpler setup)

**Re-initialize swarm with updated context**
```

**3. Re-initialize Swarm:**
```javascript
mcp__claude-flow-novice__swarm_init({
  topology: "mesh",
  maxAgents: 3,
  strategy: "balanced"
})
// Spawn agents with clarified requirements
```

---

### Issue 5: Memory Storage Failures

**Symptom:** SwarmMemory operations fail or return null

**Cause:** SQLite database initialization issues

**Diagnosis:**
```bash
# Check if .swarm directory exists
ls -la .swarm

# Expected output:
# drwxr-xr-x  .swarm/
# -rw-r--r--  .swarm/swarm-memory.db

# If missing, SQLite failed to initialize
```

**Solution:**
```bash
# Create directory manually
mkdir -p .swarm

# Re-initialize SwarmMemory
npx claude-flow-novice swarm init

# Verify database
sqlite3 .swarm/swarm-memory.db "SELECT * FROM memory LIMIT 5;"
```

**Alternative:** Clear corrupted database
```bash
# Backup existing data
cp .swarm/swarm-memory.db .swarm/swarm-memory.db.backup

# Remove corrupted database
rm .swarm/swarm-memory.db

# Re-initialize
npx claude-flow-novice swarm init
```

---

### Issue 6: Task Timeout (Exceeds Time Budget)

**Symptom:** CFN Loop aborts with "timeout exceeded"

**Cause:** Task too complex for single iteration or agent count too low

**Diagnosis:**
```bash
# Check circuit breaker status
npx claude-flow-novice circuit-breaker status

# Example output:
# {
#   "state": "OPEN",
#   "timeoutCount": 3,
#   "nextAttemptTime": "2025-10-02T10:30:00Z"
# }
```

**Solutions:**

**1. Break Into Smaller Tasks:**
```markdown
# Instead of:
"Build complete authentication system"

# Use:
Task 1: "Implement JWT token generation"
Task 2: "Implement JWT token validation"
Task 3: "Implement password hashing with bcrypt"
Task 4: "Add authentication middleware"
```

**2. Increase Agent Count:**
```javascript
// If stuck with 3 agents, try 6
mcp__claude-flow-novice__swarm_init({
  topology: "mesh",
  maxAgents: 6  // Was 3
})
```

**3. Extend Timeout:**
```javascript
// config/cfn-loop-config.js
export const CFN_CONFIG = {
  timeout: {
    taskTimeout: 600000,      // 10 minutes (was 5)
    consensusTimeout: 300000  // 5 minutes (was 3)
  },
  circuitBreakerOptions: {
    timeoutMs: 60 * 60 * 1000  // 1 hour (was 30 minutes)
  }
};
```

---

### Issue 7: Agent Self-Validation Stuck at Low Confidence

**Symptom:** Agent confidence stuck at 0.45-0.70 after multiple retries

**Cause:** Missing critical validation component (usually tests)

**Diagnosis:**
```bash
# Check validation breakdown
npx enhanced-hooks post-edit "file.js" --structured

# Example output showing root cause:
# {
#   "validation": {
#     "testsPassed": false,    // ← 30% penalty
#     "coverage": 0,           // ← 25% penalty
#     "syntax": true,          // ✅
#     "security": true         // ✅
#   },
#   "confidence": 0.45         // 0.15 + 0.20 + 0.10 = 0.45
# }
```

**Solution:** Add tests FIRST, then re-validate
```bash
# 1. Write tests
# 2. Re-run validation
npx enhanced-hooks post-edit "file.js" --structured

# Expected: confidence jumps to 0.75+ with tests
```

---

### Issue 8: Circuit Breaker Stuck in OPEN State

**Symptom:** Requests rejected with "Circuit breaker is OPEN"

**Cause:** Cooldown period not elapsed after failures

**Diagnosis:**
```bash
# Check circuit breaker state
npx claude-flow-novice circuit-breaker status --breaker-id your-task

# Output:
# {
#   "state": "OPEN",
#   "failureCount": 3,
#   "nextAttemptTime": "2025-10-02T10:35:00Z"  // 5 minutes from now
# }
```

**Solutions:**

**1. Wait for Cooldown:**
```bash
# Wait until nextAttemptTime
# Circuit automatically transitions to HALF_OPEN
```

**2. Manually Reset:**
```bash
# Force reset (use cautiously)
npx claude-flow-novice circuit-breaker reset --breaker-id your-task
```

**3. Fix Underlying Issue:**
```bash
# Address root cause of failures
# Then circuit will naturally close on success
```

---

### Issue 9: Iteration Limit Exceeded

**Symptom:** "Max iterations exceeded" error after 10 rounds

**Cause:** Validators never reach consensus or critical issues not fixed

**Diagnosis:**
```bash
# View iteration history
npx claude-flow-novice memory search "swarm/iterations/round-*"

# Example showing pattern:
# Round 1-5: Coverage issues
# Round 6-8: Security issues
# Round 9-10: Architecture concerns
# → Issues not being addressed properly
```

**Solutions:**

**1. Review Feedback Quality:**
```javascript
// Check if feedback is actionable
const feedback = await memory.retrieve('swarm/iterations/round-10/feedback');

// Good feedback: Specific, actionable
// Bad feedback: Vague, generic
```

**2. Manually Intervene:**
```markdown
**Manual fixes:**
1. Fix critical security issue (JWT secret)
2. Increase test coverage to 85%
3. Refactor architecture per architect feedback

**Then re-run CFN loop**
```

**3. Adjust Requirements:**
```javascript
// Lower thresholds temporarily to unblock
export const CFN_CONFIG = {
  consensus: {
    agreementThreshold: 0.85,  // Was 0.90
    maxRounds: 15              // Was 10
  }
};
```

---

## Debugging Commands

### System Status
```bash
# Check overall system health
npx claude-flow-novice status

# Check swarm status
npx claude-flow-novice swarm status --swarm-id your-swarm-id

# Check agent metrics
npx claude-flow-novice agent-metrics --agent-id backend-dev
```

### Memory Operations
```bash
# View memory contents
sqlite3 .swarm/swarm-memory.db "SELECT key, value FROM memory WHERE key LIKE 'swarm/%';"

# Search memory
npx claude-flow-novice memory search "swarm/*/confidence"

# Clear memory (use cautiously)
npx claude-flow-novice memory clear --pattern "swarm/test-*"
```

### Circuit Breaker
```bash
# Check circuit breaker state
npx claude-flow-novice circuit-breaker status

# Reset specific breaker
npx claude-flow-novice circuit-breaker reset --breaker-id auth-implementation

# View statistics
npx claude-flow-novice circuit-breaker stats
```

### Performance Monitoring
```bash
# Trace agent execution
DEBUG=* npx claude-flow-novice swarm execute --task jwt-auth

# Export metrics for analysis
npx claude-flow-novice metrics export --format json > cfn-metrics.json

# Performance report
npx claude-flow-novice performance report
```

### Configuration Validation
```bash
# Validate configuration
npx claude-flow-novice config validate

# Show current config
npx claude-flow-novice config show

# Test specific module
npx claude-flow-novice config test --module feedback-injection
```

---

## Recovery Procedures

### Procedure 1: Restart Stuck CFN Loop

```bash
# 1. Check current state
npx claude-flow-novice swarm status --swarm-id stuck-swarm

# 2. Save current progress
npx claude-flow-novice memory export --swarm-id stuck-swarm > backup.json

# 3. Reset circuit breaker
npx claude-flow-novice circuit-breaker reset --breaker-id stuck-swarm

# 4. Re-initialize swarm
mcp__claude-flow-novice__swarm_init({
  topology: "mesh",
  maxAgents: 3,
  strategy: "balanced"
})

# 5. Resume with saved context
npx claude-flow-novice memory import backup.json
```

### Procedure 2: Fix Corrupted Memory

```bash
# 1. Backup current database
cp .swarm/swarm-memory.db .swarm/swarm-memory.db.backup

# 2. Check for corruption
sqlite3 .swarm/swarm-memory.db "PRAGMA integrity_check;"

# 3. If corrupted, recover from backup
cp .swarm/swarm-memory.db.backup .swarm/swarm-memory.db

# 4. Re-index
sqlite3 .swarm/swarm-memory.db "REINDEX;"
```

### Procedure 3: Clear All State

```bash
# WARNING: This deletes all CFN loop state

# 1. Stop all active loops
npx claude-flow-novice swarm terminate --all

# 2. Clear memory
rm -rf .swarm/swarm-memory.db

# 3. Reset circuit breakers
npx claude-flow-novice circuit-breaker reset --all

# 4. Re-initialize
npx claude-flow-novice swarm init
```

---

## Performance Troubleshooting

### Slow Confidence Collection

**Symptom:** Taking 10+ minutes to collect confidence scores

**Cause:** Sequential agent queries (not parallelized)

**Solution:** Verify parallel collection is enabled
```javascript
// src/coordination/confidence-score-system.ts
// Should use Promise.allSettled (parallel), not sequential await

// ✅ CORRECT:
const results = await Promise.allSettled(
  agents.map(id => this.fetchAgentConfidence(id, timeout))
);

// ❌ WRONG:
for (const agentId of agents) {
  const score = await this.fetchAgentConfidence(agentId, timeout);
}
```

### High Memory Usage

**Symptom:** Memory usage grows continuously

**Cause:** Feedback history not being cleaned up

**Solution:**
```bash
# Check memory usage
node -e "console.log(process.memoryUsage())"

# Manual cleanup
npx claude-flow-novice memory cleanup --threshold 100

# Enable automatic cleanup
# (Should be enabled by default in v1.5.22+)
```

### Excessive I/O Operations

**Symptom:** Disk I/O at 100% during CFN loop

**Cause:** State persisted on every counter increment

**Solution:** Verify batched persistence
```javascript
// config/cfn-loop-config.js
export const CFN_CONFIG = {
  persistence: {
    batchSize: 10,        // Persist every 10 iterations
    debounceMs: 1000      // Or every 1 second
  }
};
```

---

## Error Messages Reference

### "Swarm not initialized"
**Meaning:** `swarm_init` not called
**Fix:** Call `swarm_init` before spawning agents

### "Circuit breaker is OPEN"
**Meaning:** Too many failures, in cooldown
**Fix:** Wait for cooldown or manually reset

### "Max iterations exceeded"
**Meaning:** Reached iteration limit (10 rounds)
**Fix:** Review feedback, fix issues, or increase limit

### "Invalid iteration limit"
**Meaning:** Limit outside 1-100 range
**Fix:** Use valid limit (1-100)

### "Confidence below threshold"
**Meaning:** Score < 0.75
**Fix:** Add tests, increase coverage, fix security issues

### "Consensus not achieved"
**Meaning:** Agreement < 90%
**Fix:** Review validator feedback for contradictions

---

## FAQ

### Q: How do I increase iteration limits?
**A:** Configure in `cfn-loop-config.js`:
```javascript
export const CFN_CONFIG = {
  selfValidation: { maxRetries: 5 },  // Was 3
  consensus: { maxRounds: 15 }        // Was 10
};
```

### Q: Can I disable post-edit hooks?
**A:** Not recommended, but possible:
```javascript
export const CFN_CONFIG = {
  selfValidation: {
    enablePostEditHooks: false  // NOT RECOMMENDED
  }
};
```

### Q: How do I reset everything?
**A:** See [Procedure 3: Clear All State](#procedure-3-clear-all-state)

### Q: What if agents keep disagreeing?
**A:** Review feedback for contradictions, clarify requirements, re-initialize swarm

### Q: How do I speed up consensus?
**A:** Use parallel collection (default in v1.5.22+), increase timeout scaling

---

## Next Steps

- **[Security](Security.md)** - Security troubleshooting
- **[API Reference](API-Reference.md)** - Deep dive into internals
- **[Confidence Scores](Confidence-Scores.md)** - Understand scoring issues

---

**Last Updated:** 2025-10-02
**Version:** 1.5.22
