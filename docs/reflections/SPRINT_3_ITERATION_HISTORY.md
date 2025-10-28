# Sprint 3: Iteration History Implementation

**Phase 2 - Anthropic SDK Gap Analysis Implementation**

## Overview

Sprint 3 implements complete iteration history for CLI-spawned agents, enabling them to learn from previous attempts and validator feedback across multiple CFN Loop iterations.

## Implementation Status

**Status:** ✅ Complete
**Confidence:** 0.92
**Sprint:** 3 (Phase 2)
**Dependencies:** Sprint 1 (feedback), Sprint 2 (system prompts)

## Architecture

### Components

1. **Iteration History Module** (`src/cli/iteration-history.ts`)
   - Loads iteration results from Redis
   - Formats history for system prompt inclusion
   - Manages result storage lifecycle

2. **Agent Prompt Builder** (`src/cli/agent-prompt-builder.ts`)
   - Integrates iteration history into prompts
   - Conditional loading for iteration > 1
   - Formats execution instructions based on history

3. **CFN Loop Orchestrator** (`.claude/skills/redis-coordination/orchestrate-cfn-loop.sh`)
   - Stores iteration results after consensus collection
   - Includes feedback from validators
   - 24-hour TTL for all history keys

### Data Storage Pattern

#### Result Storage
```
Key: swarm:${TASK_ID}:${AGENT_ID}:result:iteration-${N}
Value: {
  "result": "Result text/output",
  "confidence": 0.85,
  "iteration": 2,
  "timestamp": "2025-10-20T10:15:00Z"
}
TTL: 86400 seconds (24 hours)
```

#### Feedback Storage
```
Key: swarm:${TASK_ID}:${AGENT_ID}:feedback:iteration-${N}
Value: {
  "feedback": "Validator feedback text",
  "iteration": 2,
  "timestamp": "2025-10-20T10:16:00Z"
}
TTL: 86400 seconds (24 hours)
```

## API Reference

### loadIterationHistory()

```typescript
async function loadIterationHistory(
  taskId: string,
  agentId: string,
  currentIteration: number
): Promise<IterationResult[]>
```

**Purpose:** Load previous iterations (1 to currentIteration - 1) from Redis

**Returns:** Array of iteration results with feedback

### storeIterationResult()

```typescript
async function storeIterationResult(
  taskId: string,
  agentId: string,
  iteration: number,
  result: string,
  confidence: number
): Promise<void>
```

**Purpose:** Store iteration result with metadata in Redis

**TTL:** 24 hours (86400 seconds)

### formatIterationHistory()

```typescript
function formatIterationHistory(
  history: IterationResult[],
  currentIteration: number
): string
```

**Purpose:** Format iteration history as markdown for system prompt

**Output Format:**
```markdown
## Iteration History

### Iteration 1
**Result:** [result text, truncated to 500 chars]
**Feedback:** [validator feedback]
**Confidence:** 0.75
**Timestamp:** 2025-10-20T10:00:00Z

---

### Iteration 2
**Result:** [result text]
**Feedback:** [validator feedback]
**Confidence:** 0.82
**Timestamp:** 2025-10-20T10:10:00Z

---

## Current Iteration: 3
**Your Task:** Address the feedback from the previous iteration:
[Last iteration feedback]
```

## Integration

### Agent Spawn Flow

1. **Orchestrator stores results** (after consensus collection):
   ```bash
   # For each agent, store result + confidence
   RESULT_DATA='{"result":"...", "confidence":0.85, "iteration":1}'
   redis-cli setex "swarm:${TASK_ID}:${AGENT}:result:iteration-1" 86400 "$RESULT_DATA"

   # Store feedback if available
   FEEDBACK_DATA='{"feedback":"...", "iteration":1}'
   redis-cli setex "swarm:${TASK_ID}:${AGENT}:feedback:iteration-1" 86400 "$FEEDBACK_DATA"
   ```

2. **Agent spawned for iteration N**:
   ```bash
   npx cfn-spawn agent backend-dev --task-id task-123 --iteration 2
   ```

3. **Prompt builder loads history**:
   ```typescript
   const history = await loadIterationHistory(taskId, agentId, 2);
   // Returns iteration 1 with result + feedback
   ```

4. **History included in system prompt**:
   - Agent sees previous result
   - Agent sees validator feedback
   - Agent receives updated execution instructions

### Prompt Structure (Iteration > 1)

```markdown
# Agent: backend-dev

## Task
[Task description]

## Iteration History
[Formatted history from previous iterations]

## Agent Definition
[Agent capabilities, responsibilities]

## CFN Loop Redis Completion Protocol
[Protocol steps]

## Execution Instructions
1. Read and understand the task requirements
2. Review iteration history and feedback from validators
3. Address specific feedback points from previous iteration
4. Execute your core responsibilities as defined above
5. Provide clear, concise output
6. Report confidence score if applicable
```

## Testing

### Test Suite
Run complete integration tests:
```bash
./tests/test-iteration-history.sh
```

### Test Coverage
- ✅ Store iteration results
- ✅ Store multiple iterations
- ✅ Load iteration history
- ✅ Verify history format structure
- ✅ Verify 24-hour TTL
- ✅ Iteration 3 includes previous feedback
- ✅ Agent ID format consistency
- ✅ Empty history for iteration 1

### Manual Testing
```bash
# 1. Start Redis
redis-server

# 2. Store test result
redis-cli setex "swarm:task-123:coder-1:result:iteration-1" 86400 \
  '{"result":"Implemented feature","confidence":0.75,"iteration":1}'

# 3. Store test feedback
redis-cli setex "swarm:task-123:coder-1:feedback:iteration-1" 86400 \
  '{"feedback":"Add error handling","iteration":1}'

# 4. Spawn agent for iteration 2
npx cfn-spawn agent coder --task-id task-123 --iteration 2

# 5. Verify history in agent prompt (check logs)
# Should see "Iteration history: included"
```

## Benefits

### For Agents
- **Learning from mistakes**: See what didn't work in previous iterations
- **Focused improvements**: Specific feedback from validators
- **Context preservation**: Full conversation thread across iterations
- **Confidence tracking**: See progress from iteration to iteration

### For System
- **Convergence acceleration**: Agents improve faster with feedback
- **Quality gates**: Track confidence scores over iterations
- **Audit trail**: Complete history of all attempts
- **Cost optimization**: Fewer iterations needed to reach consensus

## Performance Impact

### Token Usage
```
Without iteration history:
  User prompt:        1,000 tokens
  Agent response:     5,000 tokens
  Total:              6,000 tokens

With iteration history (iteration 3):
  User prompt:        1,000 tokens
  Iteration history:  3,000 tokens (2 previous iterations)
  Agent response:     5,000 tokens
  Total:              9,000 tokens (+50%)

Cost increase: ~50% tokens, but:
- Faster convergence (fewer iterations overall)
- Higher quality output (targeted improvements)
- Better consensus scores (feedback-driven)
```

### Storage
```
Per agent per iteration:
  Result:   ~500 bytes
  Feedback: ~200 bytes
  Total:    ~700 bytes

10 agents × 3 iterations = 21 KB
TTL: 24 hours (automatic cleanup)
```

## Comparison with Task Agents

| Feature | Task Agent | CLI Agent (Sprint 3) |
|---------|-----------|---------------------|
| Iteration memory | ❌ None | ✅ Full history |
| Validator feedback | ❌ Not available | ✅ Included |
| Confidence tracking | ❌ No history | ✅ Per iteration |
| Context preservation | ❌ No memory | ✅ 24-hour TTL |
| Learning capability | ❌ Static | ✅ Improves over time |
| Cost per iteration | 💰💰💰 $1.42 | 💰 $0.02 |

## Dependencies

### Sprint 1: Feedback Storage
- Validator feedback mechanism
- Redis key patterns: `swarm:${TASK_ID}:${AGENT_ID}:feedback:iteration-${N}`

### Sprint 2: System Prompts
- CLI agent context builder
- System prompt construction
- Phase 1 natural language context

## Next Steps

### Sprint 4: Agent Memory
- Persistent memory beyond 24 hours
- Cross-task learning
- Agent specialization tracking

### Future Enhancements
- **Selective history**: Load only relevant iterations (e.g., last 2)
- **Compression**: Summarize older iterations to reduce token usage
- **Peer learning**: Load history from related agents (e.g., coder sees reviewer feedback)
- **Success patterns**: Extract and share successful approaches across tasks

## Troubleshooting

### History not loading
```bash
# Check if results are stored
redis-cli --scan --pattern "swarm:${TASK_ID}:${AGENT_ID}:result:*"

# Check TTL
redis-cli ttl "swarm:${TASK_ID}:${AGENT_ID}:result:iteration-1"

# Verify JSON format
redis-cli get "swarm:${TASK_ID}:${AGENT_ID}:result:iteration-1" | jq .
```

### Feedback missing
```bash
# Check feedback keys
redis-cli --scan --pattern "swarm:${TASK_ID}:${AGENT_ID}:feedback:*"

# Verify orchestrator stored feedback
# Check orchestrator logs for "Storing iteration results"
```

### Prompt not including history
```bash
# Check agent logs for:
# "✓ Iteration history: included"

# Verify iteration > 1
# History only loads for iteration >= 2

# Check buildAgentPrompt async call
# Ensure await is used in agent-command.ts
```

## References

- **Gap Analysis**: `docs/ANTHROPIC_SDK_GAP_ANALYSIS.md` (Phase 2, lines 336-382)
- **Orchestrator**: `.claude/skills/redis-coordination/orchestrate-cfn-loop.sh`
- **Prompt Builder**: `src/cli/agent-prompt-builder.ts`
- **History Module**: `src/cli/iteration-history.ts`
- **Tests**: `tests/test-iteration-history.sh`

## Validation

### Acceptance Criteria
- ✅ Iteration results stored in Redis after each iteration
- ✅ Agents load full history on spawn (iteration > 1)
- ✅ History formatted in system prompt
- ✅ Includes both results and feedback
- ✅ Works seamlessly with Sprint 1 and Sprint 2
- ✅ 24-hour TTL for automatic cleanup
- ✅ Integration tests pass
- ✅ Documentation complete

### Confidence Score: 0.92

**Rationale:**
- Core functionality implemented and tested
- Integration with existing sprints verified
- Storage pattern follows Redis best practices
- Prompt formatting enhances agent learning
- Cost impact is reasonable (+50% tokens, faster convergence)
- Known limitation: No compression for older iterations (future enhancement)
