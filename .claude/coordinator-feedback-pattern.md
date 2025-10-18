# Coordinator Hook Feedback Pattern

**Phase 4.5: Unified Hook Feedback Integration**

This pattern enables coordinators to receive and forward hook feedback to Task-spawned agents via Redis.

---

## Pattern Overview

### Problem
- **CLI-spawned agents** can subscribe directly to Redis (`agent:{agentId}:feedback`)
- **Task-spawned agents** are one-shot prompts - no persistent Redis connection
- **Hooks** need a way to notify Task agents about issues (ROOT_WARNING, etc.)

### Solution
**Coordinator-mediated feedback** - Coordinator acts as Redis-to-Task bridge:

```
Hook fires → LPUSH coordinator:{id}:feedback → Coordinator polls → Wake agent via Task tool
```

---

## Implementation (All Coordinators)

### Step 1: Start Feedback Monitor (Background Process)

Add this at the start of Loop 3 execution:

```bash
# Monitor coordinator:{coordinatorId}:feedback every 5 seconds
export COORDINATOR_ID="coordinator-mvp"  # or standard/enterprise

# Background feedback monitor
(while [ $(redis-cli llen "swarm:cfn:${MODE}:${PHASE_ID}:loop3:complete") -eq 0 ]; do
  # BRPOP with 5s timeout (non-blocking)
  feedback=$(redis-cli brpop "coordinator:${COORDINATOR_ID}:feedback" 5 2>/dev/null)

  if [ -n "$feedback" ]; then
    # Parse and log feedback
    echo "$feedback" | jq '.' >> .artifacts/coordinator/pending-feedback.log
    echo "📬 Hook feedback received for agent $(echo "$feedback" | jq -r '.[1]' | jq -r '.agentId')"
  fi

  sleep 5
done) &

FEEDBACK_MONITOR_PID=$!
echo "✅ Feedback monitor started (PID: $FEEDBACK_MONITOR_PID)"
```

**Key Points:**
- Uses `BRPOP` with 5s timeout (blocks until feedback or timeout)
- Runs in background while Loop 3 executes
- Terminates when Loop 3 completes
- Non-blocking - doesn't slow down main coordination

---

### Step 2: Wake Agent with Feedback (On Receipt)

When feedback received, use Task tool to inject as system reminder:

```javascript
// Parse feedback from Redis (BRPOP returns [channel, message])
const feedbackData = JSON.parse(redisMessage[1]);
const { agentId, message } = feedbackData;

// Determine agent type from agentId
const agentType = agentId.match(/^(coder|tester|architect|security|validator)/)?.[1] || 'coder';

// Wake agent via Task tool with system reminder
Task({
  subagent_type: agentType,
  description: "Process hook feedback",
  prompt: `
You received feedback from the post-edit hook system:

<system-reminder>
Hook Feedback (Priority: High):
Type: ${message.type}
File: ${message.file}
Timestamp: ${message.timestamp}

${message.type === 'ROOT_WARNING' ? `
⚠️  ROOT_WARNING: File created in root directory
File: ${message.fileName}

Suggested locations:
${message.suggestions.map(s => `- ${s.location} (${s.reason})`).join('\n')}

**ACTION REQUIRED:** Move the file to one of the suggested locations using the Bash tool.

Example:
\`\`\`bash
mv "${message.file}" "${message.suggestions[0].location}"
\`\`\`
` : ''}

${message.type === 'LOW_COVERAGE' ? `
⚠️  LOW_COVERAGE: Test coverage below threshold
File: ${message.file}
Current coverage: ${message.current}%
Required coverage: ${message.required}%

**ACTION REQUIRED:** Add tests to meet coverage threshold.
` : ''}

${message.type === 'TDD_VIOLATION' ? `
⚠️  TDD_VIOLATION: Missing tests for implementation
File: ${message.file}

**ACTION REQUIRED:** Write tests before continuing implementation.
` : ''}

Please handle this feedback immediately before continuing with your primary task.
Mark feedback as delivered after processing:
\`\`\`bash
echo '{"agentId": "${agentId}", "timestamp": "${message.timestamp}", "delivered": true}' >> .artifacts/coordinator/feedback-delivered.log
\`\`\`
</system-reminder>

Continue with your task after addressing the feedback.
`
});
```

---

### Step 3: Cleanup (After Loop 3 Completes)

```bash
# Kill feedback monitor process
if [ -n "$FEEDBACK_MONITOR_PID" ]; then
  kill $FEEDBACK_MONITOR_PID 2>/dev/null
  echo "✅ Feedback monitor stopped"
fi

# Check for undelivered feedback
undelivered=$(redis-cli llen "coordinator:${COORDINATOR_ID}:feedback")
if [ $undelivered -gt 0 ]; then
  echo "⚠️  ${undelivered} feedback messages not delivered (agents completed before feedback arrived)"
  # Optionally: LPUSH to backlog for manual review
fi
```

---

## Mode-Specific Adaptations

### MVP Mode
- **Polling interval:** 5s (balanced)
- **Feedback types:** ROOT_WARNING only (simplicity)
- **Action:** Basic system reminder with suggested command

### Standard Mode
- **Polling interval:** 5s
- **Feedback types:** ROOT_WARNING, LOW_COVERAGE, TDD_VIOLATION
- **Action:** Detailed system reminder with examples

### Enterprise Mode
- **Polling interval:** 2s (faster response)
- **Feedback types:** All (ROOT_WARNING, LOW_COVERAGE, TDD_VIOLATION, RUST_QUALITY, LINT_ISSUES)
- **Action:** Comprehensive system reminder with compliance notes
- **Audit:** Log all feedback delivery to 365-day retention

---

## Integration with Loop 3

### Recommended Placement

Add feedback monitoring right after worker spawning:

```bash
### Loop 3: Workers + Feedback Monitoring

# Step 1: Start feedback monitor (background)
(... feedback monitor code ...)

# Step 2: Spawn workers
npx claude-flow-spawn ...

# Step 3: Monitor workers AND feedback simultaneously
while [ $(redis-cli llen "swarm:cfn:${MODE}:${PHASE_ID}:loop3:complete") -eq 0 ]; do
  # Check worker progress
  # Check feedback queue
  sleep 5
done

# Step 4: Cleanup
kill $FEEDBACK_MONITOR_PID
```

---

## Testing

### Test 1: ROOT_WARNING Delivery

```bash
# 1. Start coordinator with feedback monitoring
# 2. Spawn Task agent
# 3. Agent creates file in root
# 4. Hook fires → LPUSH coordinator:feedback
# 5. Coordinator polls → receives feedback
# 6. Coordinator wakes agent with system reminder
# 7. Agent sees ROOT_WARNING in prompt
# 8. Agent moves file
```

**Expected:** Agent receives feedback within 5s and takes action.

### Test 2: Multiple Agents

```bash
# 1. Spawn 3 Task agents (coder-1, coder-2, tester-1)
# 2. All agents create files in root
# 3. All hooks fire → 3x LPUSH coordinator:feedback
# 4. Coordinator polls → receives all 3
# 5. Coordinator wakes each agent sequentially
```

**Expected:** All agents receive feedback, no messages lost.

### Test 3: Feedback After Agent Completes

```bash
# 1. Spawn agent
# 2. Agent completes quickly
# 3. Hook fires after agent exits
# 4. Coordinator receives feedback but agent is gone
```

**Expected:** Coordinator logs undelivered feedback, no errors.

---

## Redis Channels

| Channel | Purpose | Access |
|---------|---------|--------|
| `agent:{agentId}:feedback` | Direct feedback to CLI agents | Hook publishes, agent subscribes |
| `coordinator:{coordinatorId}:feedback` | Queue for Task agent feedback | Hook pushes (LPUSH), coordinator pops (BRPOP) |

---

## File Structure

```
.artifacts/
├── coordinator/
│   ├── pending-feedback.log       # All received feedback
│   ├── feedback-delivered.log     # Delivered confirmations
│   └── feedback-undelivered.log   # Missed deliveries
└── hooks/
    └── agent-{agentId}-feedback.json  # Per-agent feedback log (persistence)
```

---

## Performance Targets

| Metric | Target | Mode-Specific |
|--------|--------|---------------|
| Feedback latency | <5s | Enterprise: <2s |
| Delivery rate | >95% | Enterprise: >99% |
| Coordinator overhead | <50ms per poll | All modes |
| False positives | <1% | All modes |

---

## Troubleshooting

### Issue: Feedback not received by coordinator

**Debug:**
```bash
# Check if hook published
redis-cli llen "coordinator:${COORDINATOR_ID}:feedback"

# Check if coordinator is polling
ps aux | grep "redis-cli brpop"

# Check coordinator logs
cat .artifacts/coordinator/pending-feedback.log
```

**Fix:**
- Verify `COORDINATOR_ID` matches in hook and coordinator
- Check Redis connection
- Verify feedback monitor is running

---

### Issue: Agent doesn't act on feedback

**Debug:**
```bash
# Check if system reminder was injected
cat .artifacts/coordinator/feedback-delivered.log | grep "$AGENT_ID"

# Check agent prompt (if logged)
# Should contain <system-reminder> block
```

**Fix:**
- Verify Task tool prompt includes system reminder
- Check agent instructions handle ROOT_WARNING
- Verify agent has Edit/Bash tool access

---

## References

- **Hook Implementation:** `config/hooks/post-edit-pipeline.js`
- **Feedback Subscriber (CLI):** `src/cli/hybrid-routing/agent-feedback-subscriber.js`
- **Unified Design:** `docs/architecture/REDIS-HOOK-FEEDBACK-UNIFIED-DESIGN.md`
- **Epic Plan:** `planning/orchestration/redis-coordination-epic.json` (Phase 4.5)

---

**Document Version:** 1.0.0
**Phase:** 4.5 - Hook Feedback Integration
**Status:** Ready for Coordinator Integration
