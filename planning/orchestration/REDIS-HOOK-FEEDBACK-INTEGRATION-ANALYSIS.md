# Redis Hook Feedback Integration Analysis

**Status:** Investigation Complete - Ready for Implementation Decision
**Date:** 2025-10-17
**Analysis Type:** Technical Feasibility & Trade-offs

---

## Executive Summary

**Question:** Can we integrate the post-edit pipeline's ROOT_WARNING into the Redis system to pass messages back to agents?

**Answer:** ✅ **YES** - Infrastructure exists and pattern is proven. Implementation is straightforward.

**Recommendation:** Implement Redis feedback channel for hook-to-agent communication using existing SwarmMessenger patterns.

---

## Current State Analysis

### 1. Existing Hook System

**File:** `.claude/hooks.json`
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [{
          "type": "command",
          "command": "node src/hooks/enhanced-hooks-cli.js post-edit \"$FILE_PATH\" --memory-key \"swarm/$AGENT_ID/$STEP\" --structured"
        }]
      }
    ]
  }
}
```

**Environment Variables Available:**
- `$CLAUDE_PROJECT_DIR` - Project root
- `$FILE_PATH` - Edited file path
- `$AGENT_ID` - Currently executing agent ID (from memory-key pattern)
- `$STEP` - Task step identifier
- `$SWARM_ID` - Swarm identifier (could be extracted from memory-key)

**Current Behavior:**
- Hook runs automatically after Edit/Write/MultiEdit
- Outputs JSON with `--structured` flag
- **Output goes to stdout** (not captured by agent)
- Logs to `.artifacts/logs/post-edit-pipeline.log`

**Root Warning Detection:**
```javascript
// post-edit-pipeline.js:1781-1836
if (isRootDirectory && !allowedRootFiles.includes(fileName)) {
  return {
    status: 'ROOT_WARNING',
    rootWarning: {
      fileName,
      suggestions: [
        {location: 'src/example.js', reason: 'Source code directory'},
        {location: 'docs/example.md', reason: 'Documentation directory'}
      ]
    }
  };
}
```

---

### 2. Existing Redis Infrastructure

**SwarmMessenger** (`src/redis/swarm-messenger.js`)

**Available Channels:**
- `swarm:global` - Broadcast to all swarms
- `swarm:coordination` - Coordinator messages
- `swarm:agents` - Agent-specific messages
- `swarm:tasks` - Task coordination
- `swarm:events` - Event bus

**Message Methods:**
```javascript
// Send to specific swarm
await messenger.sendToSwarm(targetSwarmId, message);

// Broadcast to all
await messenger.broadcast(message);

// Send coordination message
await messenger.sendCoordinationMessage(message);

// Send to specific agent (NEW - for hook feedback)
await messenger.sendToAgent(agentId, message);
```

**Performance:**
- WASM-powered JSON serialization (50x faster)
- 10,000+ messages/sec throughput
- 6μs per message

**Connection:**
- Separate pub/sub clients (Redis best practice)
- Auto-retry with exponential backoff
- Connection loss handling

---

### 3. Proven Agent Feedback Pattern

**Agent Feedback Hook** (`config/hooks/agent-feedback-hook.cjs`)

**Already implements:**
- Dependency analysis with structured feedback
- Memory storage at `.claude-flow/agent-memory.json`
- Agent-readable output format
- Self-execution pattern (agent acts on feedback)

**Example Output:**
```json
{
  "file": "src/checkout.js",
  "dependencies": {
    "missing": ["UserService", "PaymentGateway", "EmailService"],
    "usage": {
      "UserService": ["getUser(id)", "validateUser(token)"],
      "PaymentGateway": ["processPayment(amount)", "refund(id)"]
    }
  },
  "agentTasks": [
    {
      "action": "create_file",
      "target": "src/services/UserService.js",
      "template": "class UserService {...}"
    }
  ]
}
```

**Key Insight:** This pattern works WITHOUT Redis - agent reads from file. Redis would make it **real-time** instead of polling.

---

## Integration Design

### Option 1: Redis Pub/Sub Feedback Channel (RECOMMENDED)

**Architecture:**
```
┌─────────────────┐
│  Agent (Task)   │
│  Edits File     │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Hook Execution                 │
│  - post-edit-pipeline.js        │
│  - Detects ROOT_WARNING         │
│  - Has: $AGENT_ID, $FILE_PATH   │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Redis Publish                  │
│  Channel: "agent:{agentId}"     │
│  Payload: {                     │
│    type: 'ROOT_WARNING',        │
│    file: 'test.txt',            │
│    suggestions: [...]           │
│  }                              │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Agent Subscription             │
│  - Subscribed to agent:{id}     │
│  - Receives message             │
│  - Acts on ROOT_WARNING         │
└─────────────────────────────────┘
```

**Implementation Steps:**

1. **Enhance post-edit-pipeline.js**
```javascript
// Add Redis client initialization
import Redis from 'ioredis';

class UnifiedPostEditPipeline {
  constructor(options = {}) {
    // ... existing code ...

    // Initialize Redis for hook feedback
    this.redis = options.redis || new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      db: 0,
      lazyConnect: true  // Only connect if needed
    });

    this.agentId = options.agentId || this.extractAgentId(options);
  }

  extractAgentId(options) {
    // Extract from memory-key: "swarm/{agentId}/{step}"
    const memoryKey = options.memoryKey || process.env.MEMORY_KEY;
    if (memoryKey) {
      const parts = memoryKey.split('/');
      return parts[1]; // Returns agentId
    }
    return null;
  }

  async sendAgentFeedback(message) {
    if (!this.agentId) {
      return; // No agent to notify
    }

    try {
      await this.redis.connect();

      const channel = `agent:${this.agentId}:feedback`;
      const payload = JSON.stringify({
        timestamp: new Date().toISOString(),
        source: 'post-edit-pipeline',
        ...message
      });

      await this.redis.publish(channel, payload);
      console.log(`✅ Feedback sent to agent ${this.agentId}`);

    } catch (error) {
      // Graceful degradation - log still works
      console.warn('⚠️  Redis feedback failed (non-blocking):', error.message);
    } finally {
      await this.redis.disconnect();
    }
  }

  async run(filePath, options = {}) {
    // ... existing validation code ...

    // After detecting ROOT_WARNING
    if (results.status === 'ROOT_WARNING') {
      await this.sendAgentFeedback({
        type: 'ROOT_WARNING',
        file: filePath,
        fileName: path.basename(filePath),
        suggestions: results.rootWarning.suggestions,
        message: 'File created in root directory - should be moved'
      });
    }

    // After detecting other issues
    if (results.rustQuality && !results.rustQuality.passed) {
      await this.sendAgentFeedback({
        type: 'RUST_QUALITY',
        file: filePath,
        issues: results.rustQuality.issues,
        severity: 'warning'
      });
    }

    if (results.coverage && results.coverage.lines.percentage < this.minimumCoverage) {
      await this.sendAgentFeedback({
        type: 'LOW_COVERAGE',
        file: filePath,
        current: results.coverage.lines.percentage,
        required: this.minimumCoverage,
        severity: 'warning'
      });
    }

    return results;
  }
}
```

2. **Update CLAUDE.md with subscription pattern**
```markdown
### Agent Redis Subscription (Auto-enabled)

Agents automatically subscribe to `agent:{agentId}:feedback` for real-time hook feedback.

**Messages you'll receive:**
- `ROOT_WARNING` - File in root directory, move to suggested location
- `RUST_QUALITY` - Code quality issues detected
- `LOW_COVERAGE` - Test coverage below threshold
- `TDD_VIOLATION` - Missing tests

**Example handler:**
\`\`\`javascript
// Auto-subscribed by spawn-workers.js
redis.on('message', (channel, message) => {
  if (channel === `agent:${agentId}:feedback`) {
    const feedback = JSON.parse(message);

    if (feedback.type === 'ROOT_WARNING') {
      console.log(`⚠️  File ${feedback.fileName} in root!`);
      console.log(`💡 Suggested: ${feedback.suggestions[0].location}`);

      // Agent should move file
      await moveFile(feedback.file, feedback.suggestions[0].location);
    }
  }
});
\`\`\`
```

3. **Update spawn-workers.js to auto-subscribe**
```javascript
// src/cli/hybrid-routing/spawn-workers.js

async function subscribeAgentToFeedback(agentId) {
  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  });

  const channel = `agent:${agentId}:feedback`;
  await redis.subscribe(channel);

  redis.on('message', (ch, msg) => {
    if (ch === channel) {
      const feedback = JSON.parse(msg);
      console.log(`\n📬 HOOK FEEDBACK for ${agentId}:`);
      console.log(JSON.stringify(feedback, null, 2));

      // Agent instructions in prompt would handle this
      // Could also store in .artifacts/feedback/{agentId}.json
    }
  });

  return redis;
}
```

**Advantages:**
- ✅ Real-time feedback (no polling)
- ✅ Uses existing Redis infrastructure
- ✅ Non-blocking (graceful degradation)
- ✅ Scales to multiple agents
- ✅ WASM-powered performance (50x faster)
- ✅ Already proven pattern (SwarmMessenger)

**Trade-offs:**
- Requires Redis running (already required for swarm)
- Adds Redis dependency to hooks (but non-blocking)
- Agent must subscribe to channel (can auto-subscribe on spawn)

---

### Option 2: Enhanced Log File Pattern (CURRENT + IMPROVE)

**Keep current log file approach but add structured agent-readable format:**

```javascript
// .artifacts/hooks/agent-{agentId}-feedback.json
{
  "agentId": "coder-1",
  "lastUpdate": "2025-10-17T14:39:31.776Z",
  "feedback": [
    {
      "timestamp": "2025-10-17T14:39:31.776Z",
      "type": "ROOT_WARNING",
      "file": "test.txt",
      "suggestions": [...]
    }
  ]
}
```

**Advantages:**
- ✅ No Redis dependency
- ✅ Persistent record
- ✅ Easy to debug

**Trade-offs:**
- ❌ Requires polling (agent checks file)
- ❌ File I/O overhead
- ❌ Race conditions possible
- ❌ Not real-time

---

### Option 3: Hybrid Approach (BEST OF BOTH)

**Use Redis for real-time + Log for persistence:**

```javascript
async sendAgentFeedback(message) {
  // 1. Send via Redis (real-time)
  try {
    await this.redis.publish(`agent:${this.agentId}:feedback`, JSON.stringify(message));
  } catch (error) {
    console.warn('Redis unavailable, using log fallback');
  }

  // 2. Always write to log file (persistence)
  const feedbackFile = path.join(
    '.artifacts/hooks',
    `agent-${this.agentId}-feedback.json`
  );

  const existing = fs.existsSync(feedbackFile)
    ? JSON.parse(fs.readFileSync(feedbackFile))
    : { agentId: this.agentId, feedback: [] };

  existing.feedback.unshift(message);
  existing.feedback = existing.feedback.slice(0, 50); // Keep last 50
  existing.lastUpdate = new Date().toISOString();

  fs.writeFileSync(feedbackFile, JSON.stringify(existing, null, 2));
}
```

**Advantages:**
- ✅ Real-time when Redis available
- ✅ Persistent record for debugging
- ✅ Works offline (degrades to log)
- ✅ Best of both worlds

---

## Performance Analysis

### Redis Option
- **Latency:** 6μs per message (WASM-powered)
- **Throughput:** 10,000+ messages/sec
- **Overhead:** Negligible (<1ms connection)
- **Memory:** ~50KB per agent (subscription)

### Log File Option
- **Latency:** ~5-10ms (file I/O)
- **Throughput:** ~100-200 ops/sec
- **Overhead:** File system polling
- **Memory:** Minimal

### Hybrid Option
- **Latency:** 6μs (Redis) + 5-10ms (log)
- **Throughput:** Limited by slower operation (log)
- **Overhead:** Both combined
- **Memory:** ~50KB + file storage

---

## Security Considerations

### Redis Channel Security
- Use agent-specific channels: `agent:{agentId}:feedback`
- No authentication needed (same network)
- Message validation on receive
- HMAC optional for critical feedback

### Log File Security
- Restrict to `.artifacts/hooks/` directory
- Agent-specific files prevent cross-contamination
- No sensitive data in feedback messages
- Standard file permissions (644)

---

## Implementation Complexity

### Redis Option
- **Effort:** 4-6 hours
- **Files Modified:**
  - `config/hooks/post-edit-pipeline.js` (+50 lines)
  - `src/cli/hybrid-routing/spawn-workers.js` (+30 lines)
  - `CLAUDE.md` (+20 lines docs)
- **Testing:** Redis connection, graceful degradation
- **Dependencies:** Already have ioredis

### Log File Enhancement
- **Effort:** 2-3 hours
- **Files Modified:**
  - `config/hooks/post-edit-pipeline.js` (+30 lines)
  - `CLAUDE.md` (+15 lines docs)
- **Testing:** File I/O, race conditions
- **Dependencies:** None (uses fs)

### Hybrid Option
- **Effort:** 6-8 hours
- **Files Modified:** All above
- **Testing:** Both paths + fallback behavior
- **Dependencies:** ioredis

---

## Recommendations

### Primary Recommendation: **Hybrid Approach**

**Rationale:**
1. **Real-time feedback** when Redis available (normal case)
2. **Persistence** for debugging and offline development
3. **Graceful degradation** when Redis unavailable
4. **Minimal risk** - both channels independent
5. **Future-proof** - foundation for other hook feedback types

### Implementation Priority

**Phase 1: Redis Channel (Week 1)**
- Add Redis publish to post-edit-pipeline.js
- Add agent subscription to spawn-workers.js
- Update CLAUDE.md with subscription pattern
- Test with ROOT_WARNING only

**Phase 2: Log File Persistence (Week 2)**
- Add structured feedback log
- Implement LRU cleanup (keep last 50)
- Add fallback when Redis unavailable
- Test offline mode

**Phase 3: Expand Feedback Types (Week 3)**
- Add RUST_QUALITY feedback
- Add LOW_COVERAGE feedback
- Add TDD_VIOLATION feedback
- Add LINT_ISSUES feedback

### Success Metrics

- ✅ Agent receives ROOT_WARNING within 100ms
- ✅ 99.9% delivery rate (Redis + log fallback)
- ✅ Zero false negatives (every warning delivered)
- ✅ <2% overhead on hook execution time
- ✅ Agents act on 80%+ of ROOT_WARNINGS

---

## Conclusion

**YES, we can and should integrate Redis feedback.**

The infrastructure exists, the pattern is proven (agent-feedback-hook.cjs), and the implementation is straightforward. The hybrid approach provides the best balance of real-time performance, persistence, and fault tolerance.

**Next Steps:**
1. Get approval for hybrid approach
2. Implement Phase 1 (Redis channel)
3. Test with ROOT_WARNING scenario
4. Expand to other feedback types
5. Monitor adoption and effectiveness

---

**Document Version:** 1.0.0
**Analysis By:** Claude Code Investigation
**Reviewed By:** Pending
**Status:** Ready for Implementation Decision
