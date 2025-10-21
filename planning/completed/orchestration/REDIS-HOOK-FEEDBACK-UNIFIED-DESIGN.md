# Redis Hook Feedback - Unified Architecture Design

**Status:** Design Complete - Ready for Implementation
**Date:** 2025-10-17
**Integration:** Phase 4.5 - Full Hybrid with Coordinator Pattern

---

## Executive Summary

**Objective:** Unified hook feedback system that works for both CLI-spawned and Task-spawned agents.

**Key Insight:** Task-spawned agents can't subscribe to Redis directly (no persistent connection). Solution: **Coordinator-mediated feedback pattern** where coordinator acts as Redis-to-Task bridge.

**Architecture:** Dual-mode feedback with automatic detection:
- **CLI Mode:** Direct Redis subscription (`agent:{agentId}:feedback`)
- **Task Mode:** Coordinator polls Redis, wakes agents via system reminders

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Hook Execution (Universal)                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  post-edit-pipeline.js                                      │ │
│  │  - Detects ROOT_WARNING, LOW_COVERAGE, etc.                │ │
│  │  - Has: $AGENT_ID, $FILE_PATH, $SPAWN_MODE                 │ │
│  └─────────────────────┬───────────────────────────────────────┘ │
│                        │                                          │
│                        ▼                                          │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Hybrid Feedback Publisher                                  │ │
│  │  1. Redis: PUBLISH agent:{agentId}:feedback                │ │
│  │  2. Log: .artifacts/hooks/agent-{agentId}-feedback.json    │ │
│  │  3. Coordinator: LPUSH coordinator:feedback (if Task mode) │ │
│  └─────────────────────┬───────────────────────────────────────┘ │
└─────────────────────────┼───────────────────────────────────────┘
                          │
            ┌─────────────┴──────────────┐
            │                            │
            ▼                            ▼
┌──────────────────────┐    ┌──────────────────────────┐
│   CLI Mode (Direct)  │    │   Task Mode (Mediated)   │
│                      │    │                          │
│  Agent Process       │    │  Coordinator Process     │
│  - Redis client      │    │  - Polls coordinator:    │
│  - Subscribes to     │    │    feedback every 5s     │
│    agent:{id}:       │    │  - Reads pending msgs    │
│    feedback          │    │                          │
│  - Receives msg      │    │  Coordinator Wakes Agent │
│  - Acts immediately  │    │  - Task tool with        │
│                      │    │    system reminder       │
│                      │    │  - Agent receives        │
│                      │    │    feedback in prompt    │
│                      │    │  - Acts on feedback      │
└──────────────────────┘    └──────────────────────────┘
```

---

## Mode Detection

### How to Determine Spawn Mode

**Environment Variables Available in Hook:**
```bash
$AGENT_ID         # e.g., "coder-1" or "task_abc123"
$SPAWN_MODE       # NEW: "cli" | "task" (set by spawner)
$COORDINATOR_ID   # Only set for Task mode
$FILE_PATH        # File that triggered hook
$MEMORY_KEY       # e.g., "swarm/coder-1/step-3"
```

**Auto-detection Logic:**
```javascript
function detectSpawnMode(agentId) {
  // CLI agents: spawned by spawn-workers.js
  // Pattern: {role}-{number} (e.g., "coder-1", "tester-2")
  const cliPattern = /^(coder|tester|architect|security)-\d+$/;

  // Task agents: spawned by Task tool
  // Pattern: task_{uuid} (e.g., "task_abc123")
  const taskPattern = /^task_[a-f0-9]+$/;

  if (cliPattern.test(agentId)) {
    return 'cli';
  } else if (taskPattern.test(agentId)) {
    return 'task';
  }

  // Fallback: check if $SPAWN_MODE env var set
  return process.env.SPAWN_MODE || 'unknown';
}
```

---

## CLI Mode: Direct Redis Subscription

### Agent Spawning (spawn-workers.js)

```javascript
// src/cli/hybrid-routing/spawn-workers.js

async function spawnWorker(agentType, agentId, task, options) {
  // Set spawn mode in environment
  const env = {
    ...process.env,
    AGENT_ID: agentId,
    SPAWN_MODE: 'cli',
    REDIS_HOST: options.redisHost || 'localhost',
    REDIS_PORT: options.redisPort || 6379
  };

  // Subscribe agent to feedback channel
  const feedbackSubscription = await subscribeAgentToFeedback(agentId);

  // Spawn agent process
  const agentProcess = spawn('node', [
    'src/cli/agent-executor.js',
    '--agent-type', agentType,
    '--agent-id', agentId,
    '--task', task,
    '--redis-feedback', 'enabled'  // NEW FLAG
  ], { env });

  // Monitor feedback and inject into agent prompt
  feedbackSubscription.on('message', async (channel, message) => {
    if (channel === `agent:${agentId}:feedback`) {
      const feedback = JSON.parse(message);
      console.log(`\n📬 HOOK FEEDBACK for ${agentId}:`);
      console.log(JSON.stringify(feedback, null, 2));

      // Inject into agent's next prompt via system reminder
      await injectFeedbackIntoAgent(agentId, feedback);
    }
  });

  return { agentProcess, feedbackSubscription };
}

async function subscribeAgentToFeedback(agentId) {
  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  });

  const channel = `agent:${agentId}:feedback`;
  await redis.subscribe(channel);

  console.log(`✅ Agent ${agentId} subscribed to ${channel}`);

  return redis;
}

async function injectFeedbackIntoAgent(agentId, feedback) {
  // Option 1: Write to agent's memory (agent reads on next iteration)
  const feedbackFile = path.join(
    '.artifacts/agents',
    agentId,
    'pending-feedback.json'
  );

  const pending = fs.existsSync(feedbackFile)
    ? JSON.parse(fs.readFileSync(feedbackFile))
    : { agentId, feedback: [] };

  pending.feedback.push(feedback);
  fs.writeFileSync(feedbackFile, JSON.stringify(pending, null, 2));

  // Option 2: If agent supports hot-reload, trigger refresh
  // (Future enhancement)
}
```

### Agent Prompt Instructions (CLAUDE.md)

```markdown
## CLI Agent: Redis Feedback Subscription

**Auto-enabled:** All CLI-spawned agents subscribe to `agent:{agentId}:feedback`.

**Feedback Types:**
- `ROOT_WARNING` - File created in root directory
- `LOW_COVERAGE` - Test coverage below threshold
- `RUST_QUALITY` - Code quality issues detected
- `TDD_VIOLATION` - Missing tests for implementation

**How to Handle Feedback:**

1. **ROOT_WARNING**
   ```javascript
   // Feedback received:
   {
     type: 'ROOT_WARNING',
     file: '/project/test.txt',
     fileName: 'test.txt',
     suggestions: [
       { location: 'src/test.txt', reason: 'Source code directory' },
       { location: 'docs/test.txt', reason: 'Documentation directory' }
     ]
   }

   // Agent action:
   await moveFile('/project/test.txt', 'src/test.txt');
   console.log('✅ Moved test.txt to src/ per hook feedback');
   ```

2. **LOW_COVERAGE**
   ```javascript
   // Feedback received:
   {
     type: 'LOW_COVERAGE',
     file: 'src/checkout.js',
     current: 45.2,
     required: 80.0,
     severity: 'warning'
   }

   // Agent action:
   await writeTests('src/checkout.test.js');
   console.log('✅ Added tests to meet 80% coverage requirement');
   ```

**Check for Pending Feedback:**
At the start of each iteration, check for pending feedback:

```bash
cat .artifacts/agents/${AGENT_ID}/pending-feedback.json
```

If feedback exists, handle it before continuing with primary task.
```

---

## Task Mode: Coordinator-Mediated Feedback

### Hook Publishing (post-edit-pipeline.js)

```javascript
// config/hooks/post-edit-pipeline.js

async sendAgentFeedback(message) {
  const spawnMode = detectSpawnMode(this.agentId);

  // 1. ALWAYS publish to Redis (CLI mode reads directly)
  try {
    await this.redis.connect();
    await this.redis.publish(`agent:${this.agentId}:feedback`, JSON.stringify(message));
    console.log(`✅ Redis feedback sent to ${this.agentId}`);
  } catch (error) {
    console.warn('⚠️  Redis unavailable (non-blocking)');
  }

  // 2. ALWAYS write to log file (persistence)
  const feedbackFile = path.join('.artifacts/hooks', `agent-${this.agentId}-feedback.json`);
  const existing = fs.existsSync(feedbackFile)
    ? JSON.parse(fs.readFileSync(feedbackFile))
    : { agentId: this.agentId, feedback: [] };

  existing.feedback.unshift({
    ...message,
    timestamp: new Date().toISOString(),
    delivered: false  // Marked true when agent acknowledges
  });
  existing.feedback = existing.feedback.slice(0, 50);
  existing.lastUpdate = new Date().toISOString();

  fs.writeFileSync(feedbackFile, JSON.stringify(existing, null, 2));

  // 3. IF Task mode, notify coordinator via Redis list
  if (spawnMode === 'task') {
    const coordinatorId = process.env.COORDINATOR_ID || 'coordinator-hybrid';
    await this.redis.lpush(`coordinator:${coordinatorId}:feedback`, JSON.stringify({
      agentId: this.agentId,
      message,
      timestamp: new Date().toISOString()
    }));
    console.log(`✅ Coordinator notified for Task agent ${this.agentId}`);
  }

  await this.redis.disconnect();
}
```

### Coordinator Feedback Polling

```javascript
// .claude/agents/coordinator-hybrid.md - Add new section

## Task Agent Feedback Monitoring (Loop 3.5)

**Pattern:** Coordinator polls `coordinator:{coordinatorId}:feedback` every 5 seconds during Loop 3 execution.

**Implementation:**

\`\`\`bash
# Start feedback monitor in background
(while true; do
  feedback=$(redis-cli brpop "coordinator:coordinator-hybrid:feedback" 5 2>/dev/null)

  if [ -n "$feedback" ]; then
    echo "$feedback" >> .artifacts/coordinator/pending-feedback.log
    echo "📬 Hook feedback received for agent"
  fi

  sleep 5
done) &

FEEDBACK_MONITOR_PID=$!
echo "✅ Feedback monitor started (PID: $FEEDBACK_MONITOR_PID)"
\`\`\`

**Wake Agent with Feedback:**

When feedback received, use Task tool to wake agent with system reminder:

\`\`\`javascript
// Parse feedback from Redis
const feedbackData = JSON.parse(redisMessage);
const { agentId, message } = feedbackData;

// Wake agent via Task tool
Task({
  subagent_type: getAgentType(agentId),  // Extract from agentId
  description: "Process hook feedback",
  prompt: \`
You received feedback from the post-edit hook:

<system-reminder>
Hook Feedback (Priority: High):
Type: \${message.type}
File: \${message.file}

\${message.type === 'ROOT_WARNING' ? \`
⚠️  ROOT_WARNING: File created in root directory
File: \${message.fileName}

Suggested locations:
\${message.suggestions.map(s => \`- \${s.location} (\${s.reason})\`).join('\\n')}

ACTION REQUIRED: Move the file to one of the suggested locations using the Edit or Bash tool.
\` : ''}

\${message.type === 'LOW_COVERAGE' ? \`
⚠️  LOW_COVERAGE: Test coverage below threshold
File: \${message.file}
Current coverage: \${message.current}%
Required coverage: \${message.required}%

ACTION REQUIRED: Add tests to meet coverage threshold.
\` : ''}

Please handle this feedback immediately before continuing with your primary task.
</system-reminder>

Continue with your task after addressing the feedback.
\`
});
\`\`\`

**Feedback Acknowledgment:**

After agent processes feedback, mark as delivered:

\`\`\`javascript
const feedbackFile = \`.artifacts/hooks/agent-\${agentId}-feedback.json\`;
const data = JSON.parse(fs.readFileSync(feedbackFile));

// Mark most recent (undelivered) as delivered
const pending = data.feedback.find(f => !f.delivered);
if (pending) {
  pending.delivered = true;
  pending.deliveredAt = new Date().toISOString();
  fs.writeFileSync(feedbackFile, JSON.stringify(data, null, 2));

  console.log(\`✅ Feedback delivered to \${agentId}\`);
}
\`\`\`
```

### Coordinator Pattern Example

```markdown
## Loop 3: Worker Execution with Feedback Monitoring

### Step 1: Start Feedback Monitor
\`\`\`bash
# Monitor coordinator:coordinator-hybrid:feedback
(while true; do
  feedback=$(redis-cli brpop "coordinator:coordinator-hybrid:feedback" 5)
  [ -n "$feedback" ] && echo "$feedback" >> .artifacts/coordinator/feedback.log
  sleep 5
done) &
FEEDBACK_PID=$!
\`\`\`

### Step 2: Spawn Workers (Task Mode)
\`\`\`javascript
Task({
  subagent_type: 'coder',
  description: 'Implement feature',
  prompt: 'Implement user authentication...'
});

Task({
  subagent_type: 'tester',
  description: 'Write tests',
  prompt: 'Write tests for authentication...'
});
\`\`\`

### Step 3: Monitor for Feedback
\`\`\`bash
# Check for new feedback every 5 seconds
while [ $(redis-cli llen "swarm:cfn:mvp:phase-0:loop3:complete") -eq 0 ]; do
  # Check coordinator feedback queue
  pending=$(redis-cli llen "coordinator:coordinator-hybrid:feedback")

  if [ $pending -gt 0 ]; then
    # Pop feedback and wake agent
    feedback=$(redis-cli rpop "coordinator:coordinator-hybrid:feedback")
    agent_id=$(echo "$feedback" | jq -r '.agentId')
    message=$(echo "$feedback" | jq -r '.message')

    echo "📬 Waking $agent_id with hook feedback"

    # Use Task tool to inject feedback into agent
    # (Implementation in coordinator prompt)
  fi

  sleep 5
done

# Cleanup
kill $FEEDBACK_PID
\`\`\`

### Step 4: Agent Processes Feedback
Agent receives system reminder in next prompt:

\`\`\`
<system-reminder>
Hook Feedback (Priority: High):
Type: ROOT_WARNING
File: test.txt

⚠️  ROOT_WARNING: File created in root directory
File: test.txt

Suggested locations:
- src/test.txt (Source code directory)
- docs/test.txt (Documentation directory)

ACTION REQUIRED: Move the file to one of the suggested locations.
</system-reminder>
\`\`\`

Agent uses Edit/Bash tool to move file, then marks feedback as delivered.
```

---

## Redis Channel Architecture

### Channel Naming Convention

```
agent:{agentId}:feedback           # Direct agent feedback (CLI mode)
coordinator:{coordinatorId}:feedback  # Coordinator queue (Task mode)
```

### Message Format (Universal)

```json
{
  "timestamp": "2025-10-17T14:39:31.776Z",
  "source": "post-edit-pipeline",
  "agentId": "coder-1",
  "spawnMode": "cli",
  "type": "ROOT_WARNING",
  "file": "/project/test.txt",
  "fileName": "test.txt",
  "severity": "warning",
  "suggestions": [
    {
      "location": "src/test.txt",
      "reason": "Source code directory"
    }
  ],
  "delivered": false,
  "deliveredAt": null
}
```

### Feedback Types

| Type | Priority | Severity | Action Required |
|------|----------|----------|-----------------|
| `ROOT_WARNING` | High | Warning | Move file to suggested location |
| `TDD_VIOLATION` | High | Warning | Add missing tests |
| `LOW_COVERAGE` | Medium | Warning | Increase test coverage |
| `RUST_QUALITY` | Medium | Warning | Fix code quality issues |
| `LINT_ISSUES` | Low | Info | Fix linting errors |

---

## File System Structure

```
.artifacts/
├── hooks/
│   ├── agent-coder-1-feedback.json       # Per-agent feedback log
│   ├── agent-tester-1-feedback.json
│   └── agent-task_abc123-feedback.json
├── agents/
│   ├── coder-1/
│   │   └── pending-feedback.json         # Unprocessed feedback (CLI mode)
│   └── task_abc123/
│       └── pending-feedback.json
└── coordinator/
    ├── feedback.log                       # All feedback received
    └── pending-feedback.log               # Undelivered Task mode feedback
```

---

## Implementation Phases

### Phase 1: Redis Channel (4-6 hours)

**Files Modified:**
- `config/hooks/post-edit-pipeline.js` - Add Redis publish
- `src/cli/hybrid-routing/spawn-workers.js` - Add subscription
- `.claude/coordinator-patterns.md` - Document feedback pattern

**Deliverables:**
1. Hook publishes to `agent:{agentId}:feedback`
2. CLI agents auto-subscribe on spawn
3. Task mode publishes to `coordinator:{coordinatorId}:feedback`
4. Spawn mode auto-detection working

**Testing:**
```bash
# Test CLI mode
node src/cli/hybrid-routing/spawn-workers.js \
  "Create file in root and receive feedback" \
  --agents=coder \
  --provider=zai

# Verify subscription
redis-cli pubsub channels "agent:*"

# Trigger ROOT_WARNING
# (Agent creates file in root, hook fires, feedback delivered)
```

---

### Phase 2: Log File Persistence (2-3 hours)

**Files Modified:**
- `config/hooks/post-edit-pipeline.js` - Add log writing
- New: `.artifacts/hooks/README.md` - Document log format

**Deliverables:**
1. Structured feedback logs per agent
2. LRU cleanup (keep last 50)
3. Delivered/undelivered tracking
4. Offline fallback working

**Testing:**
```bash
# Verify log creation
cat .artifacts/hooks/agent-coder-1-feedback.json

# Verify LRU (create 51 feedbacks, oldest should be removed)
# Verify delivered flag updates
```

---

### Phase 3: Coordinator Mediation (4-6 hours)

**Files Modified:**
- `.claude/agents/coordinator-hybrid.md` - Add feedback monitoring
- `.claude/agents/cfn-loop/cfn-coordinator-mvp.md` - Add feedback section
- `.claude/agents/cfn-loop/cfn-coordinator-standard.md` - Add feedback section
- `.claude/agents/cfn-loop/cfn-coordinator-enterprise.md` - Add feedback section

**Deliverables:**
1. Coordinator polls `coordinator:{id}:feedback` every 5s
2. Coordinator wakes Task agents via system reminder
3. Feedback acknowledgment working
4. Integration with Loop 3 execution

**Testing:**
```bash
# Test Task mode
# (Use coordinator to spawn Task agents)
# (Trigger ROOT_WARNING)
# (Verify coordinator wakes agent)
# (Verify agent receives system reminder)
```

---

### Phase 4: Expand Feedback Types (2-4 hours)

**Files Modified:**
- `config/hooks/post-edit-pipeline.js` - Add coverage, quality, TDD checks

**Deliverables:**
1. `LOW_COVERAGE` feedback
2. `RUST_QUALITY` feedback
3. `TDD_VIOLATION` feedback
4. `LINT_ISSUES` feedback

**Testing:**
```bash
# Test each feedback type
# Verify delivery in both CLI and Task modes
# Verify agent actions appropriate per type
```

---

## Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Feedback latency (CLI) | <100ms | Hook execution → Agent receives |
| Feedback latency (Task) | <5s | Hook execution → Coordinator wakes agent |
| Delivery rate | >99.9% | Redis + log fallback |
| Hook overhead | <2% | Hook execution time increase |
| Agent action rate | >80% | % of feedbacks acted upon |
| False positives | <1% | Incorrect feedback sent |

---

## Error Handling

### Redis Connection Failure
```javascript
try {
  await redis.publish(channel, message);
} catch (error) {
  console.warn('⚠️  Redis unavailable, using log fallback');
  // Log file still works
}
```

### Coordinator Polling Failure
```bash
# If BRPOP fails, fall back to polling log file
feedback=$(redis-cli brpop "coordinator:feedback" 5 2>/dev/null || true)

if [ -z "$feedback" ]; then
  # Check log file as fallback
  feedback=$(tail -1 .artifacts/coordinator/pending-feedback.log)
fi
```

### Agent Acknowledgment Timeout
```javascript
// If agent doesn't acknowledge within 60s, re-send
const pending = data.feedback.filter(f => !f.delivered);
const stale = pending.filter(f =>
  Date.now() - new Date(f.timestamp) > 60000
);

if (stale.length > 0) {
  console.warn(`⚠️  ${stale.length} feedbacks not acknowledged, re-sending`);
  // Re-publish to Redis
}
```

---

## Success Metrics

### Phase 1 Success
- ✅ CLI agents receive ROOT_WARNING within 100ms
- ✅ Task mode publishes to coordinator queue
- ✅ Spawn mode detection works correctly
- ✅ No false negatives (every warning delivered)

### Phase 2 Success
- ✅ Log files created and updated correctly
- ✅ LRU cleanup works (max 50 entries)
- ✅ Offline mode works (Redis down)
- ✅ Delivered flag updates correctly

### Phase 3 Success
- ✅ Coordinator polls every 5s without errors
- ✅ Task agents wake within 5s of feedback
- ✅ System reminder injection works
- ✅ Feedback acknowledgment working

### Phase 4 Success
- ✅ All 5 feedback types working
- ✅ Appropriate severity levels
- ✅ Agent actions correct per type
- ✅ <1% false positive rate

---

## Integration with CFN Loop

### Loop 3 Enhancement

Add feedback monitoring to all CFN coordinators:

```markdown
### Loop 3: Implementation + Feedback Monitoring

**Workers:** 2-8 agents (mode-dependent)
**Feedback:** Real-time hook feedback enabled

\`\`\`bash
# Start feedback monitor
(while [ $(redis-cli llen "swarm:cfn:${MODE}:${PHASE_ID}:loop3:complete") -eq 0 ]; do
  feedback=$(redis-cli brpop "coordinator:${COORDINATOR_ID}:feedback" 5)

  if [ -n "$feedback" ]; then
    # Wake agent with system reminder
    # (Implementation in coordinator prompt)
  fi

  sleep 5
done) &
\`\`\`
```

### Mode-Specific Integration

**MVP Mode:**
- Simple feedback (ROOT_WARNING only)
- 5s polling interval
- Basic system reminders

**Standard Mode:**
- All feedback types
- 5s polling interval
- Detailed system reminders with context

**Enterprise Mode:**
- All feedback types
- 2s polling interval (faster response)
- Comprehensive system reminders
- Feedback audit log (365 days)

---

## Documentation Updates

### Files to Update

1. **CLAUDE.md**
   - Add "Agent Feedback System" section
   - Document CLI vs Task behavior
   - Add troubleshooting guide

2. **.claude/cfn-mode-patterns.md**
   - Add feedback monitoring to Loop 3
   - Document coordinator polling pattern
   - Add performance targets

3. **.claude/coordinator-patterns.md**
   - Add "Coordinator-Mediated Feedback" section
   - Document wake agent pattern
   - Add system reminder templates

4. **readme/additional-commands.md**
   - Add feedback monitoring commands
   - Add debugging commands

---

## Next Steps

1. ✅ Design complete (this document)
2. 🔄 Implement Phase 1 (Redis channel)
3. 🔄 Implement Phase 2 (Log persistence)
4. 🔄 Implement Phase 3 (Coordinator mediation)
5. 🔄 Implement Phase 4 (Expand feedback types)
6. 🔄 Test CLI mode
7. 🔄 Test Task mode
8. 🔄 Update documentation
9. 🔄 Performance benchmarking
10. 🔄 Integration with CFN Loop

**Estimated Total Time:** 12-18 hours (full implementation)

---

**Document Version:** 1.0.0
**Design By:** Claude Code
**Status:** Ready for Implementation
