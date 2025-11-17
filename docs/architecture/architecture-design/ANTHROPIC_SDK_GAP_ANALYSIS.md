# Anthropic SDK Gap Analysis: CLI Agents vs Task Agents

**Date:** 2025-10-20
**Version:** v2.6.0
**Focus:** How Anthropic SDK features can close information gaps for CLI-spawned agents

---

## Executive Summary

Task() tool agents receive rich, natural language context in their prompts, while CLI-spawned agents receive structured JSON in environment variables. This document analyzes how Anthropic SDK features can bridge this gap and improve CLI agent context awareness.

**Key Finding:** The Anthropic SDK provides powerful features (system prompts, extended context, prompt caching, message history) that can eliminate the CLI/Task agent information gap while maintaining cost efficiency.

---

## 1. Information Gap Summary

### Current State

| Context Type | Task() Agent | CLI Agent | Gap |
|--------------|--------------|-----------|-----|
| **Epic context** | ✅ Full text in prompt | ⚠️ JSON in env var | CLI agents must parse JSON |
| **Success criteria** | ✅ Natural language | ⚠️ JSON schema | CLI agents must extract values |
| **Iteration feedback** | ✅ In prompt | ❌ Not available | CLI agents don't know why they iterate |
| **Previous iterations** | ✅ Context preserved | ❌ No history | CLI agents start fresh each time |
| **Agent instructions** | ✅ In main chat context | ❌ Not injected | CLI agents don't see their markdown |
| **CLAUDE.md rules** | ✅ In main chat context | ❌ Not injected | CLI agents miss project rules |
| **Peer results** | ❌ Isolated | ✅ Via Redis | CLI agents can coordinate |
| **Real-time coordination** | ❌ No coordination | ✅ Via Redis BLPOP | CLI agents can wait efficiently |

**Conclusion:** Task agents get better **initial context**, but CLI agents have better **coordination capabilities**.

---

## 2. Anthropic SDK Features for CLI Agents

### 2.1 System Prompts

**Feature:** `system` parameter in API calls

**Current Usage:**
```typescript
// anthropic-client.ts:191-192
if (options.systemPrompt) {
  requestParams.system = options.systemPrompt;
}
```

**Opportunity:**
System prompts are **not charged for output tokens** and are **ideal for injecting large context** that agents reference but don't modify.

**Recommended Enhancement:**
```typescript
// Build comprehensive system prompt for CLI agents
const systemPrompt = buildCLIAgentSystemPrompt({
  agentType: process.env.AGENT_TYPE,
  agentMarkdown: fs.readFileSync(`.claude/agents/core-agents/${agentType}.md`, 'utf8'),
  claudeMd: fs.readFileSync('CLAUDE.md', 'utf8'),
  epicContext: process.env.EPIC_CONTEXT,
  phaseContext: process.env.PHASE_CONTEXT,
  successCriteria: process.env.SUCCESS_CRITERIA,
});

// Send message with system prompt
const response = await sendMessage({
  model: 'haiku',
  prompt: userPrompt,  // Task-specific instructions
  systemPrompt,        // Static context (not charged for output)
});
```

**Benefits:**
- ✅ Agents see full epic context in natural language
- ✅ Agent instructions (markdown) automatically included
- ✅ CLAUDE.md rules available
- ✅ Lower cost (system prompt output tokens not charged)
- ✅ Cleaner separation: system context vs task instructions

**Implementation Complexity:** 🟢 Low

---

### 2.2 Prompt Caching (Beta)

**Feature:** Cache frequently used prompt segments

**Anthropic SDK Support:**
```typescript
const response = await client.messages.create({
  model: 'claude-3-5-sonnet-20241022',
  max_tokens: 1024,
  system: [
    {
      type: "text",
      text: "You are an AI assistant in a swarm...",
      cache_control: { type: "ephemeral" }  // Cache this
    }
  ],
  messages: [...]
});
```

**Use Case for CLI Agents:**

Cache **epic context**, **agent markdown**, and **CLAUDE.md** across all agents in a swarm:

```typescript
const cachedSystemBlocks = [
  {
    type: "text",
    text: fs.readFileSync('CLAUDE.md', 'utf8'),
    cache_control: { type: "ephemeral" }  // Cache CLAUDE.md
  },
  {
    type: "text",
    text: agentMarkdown,
    cache_control: { type: "ephemeral" }  // Cache agent instructions
  },
  {
    type: "text",
    text: formatEpicContext(epicContext),
    cache_control: { type: "ephemeral" }  // Cache epic context
  }
];
```

**Cost Impact:**

| Scenario | Without Caching | With Caching | Savings |
|----------|----------------|--------------|---------|
| **Epic context** (5K tokens) | $0.075/call | $0.003/call (cached) | 96% |
| **CLAUDE.md** (10K tokens) | $0.15/call | $0.006/call (cached) | 96% |
| **Agent markdown** (2K tokens) | $0.03/call | $0.001/call (cached) | 97% |
| **Total per agent** | $0.255/call | $0.010/call | **96% savings** |

**For 10 agents × 3 iterations:**
- Without caching: $7.65
- With caching: $0.30
- **Savings: $7.35 (96%)**

**Cache Duration:** 5 minutes (sufficient for multi-iteration CFN loops)

**Implementation Complexity:** 🟡 Medium (requires SDK v0.6.0+)

---

### 2.3 Extended Context Window (200K tokens)

**Feature:** Claude models support 200K token context window

**Current Constraint:**
CLI agents receive minimal context to reduce costs. With prompt caching, we can use the full context window efficiently.

**Recommended Enhancement:**

Include **complete iteration history** in system prompt:

```typescript
const iterationHistory = [];

// Load previous iterations from Redis
for (let i = 1; i < currentIteration; i++) {
  const prevResult = await redis.get(`swarm:${taskId}:${agentId}:result:iteration-${i}`);
  const prevFeedback = await redis.get(`swarm:${taskId}:${agentId}:feedback:iteration-${i}`);

  iterationHistory.push({
    iteration: i,
    result: prevResult,
    feedback: prevFeedback,
    confidence: prevConfidence
  });
}

const systemPrompt = `
${cachedAgentContext}

## Iteration History

${iterationHistory.map(h => `
### Iteration ${h.iteration}
**Result:** ${h.result}
**Feedback:** ${h.feedback.join(', ')}
**Confidence:** ${h.confidence}
`).join('\n')}

## Current Iteration: ${currentIteration}
**Your task:** Address the feedback from iteration ${currentIteration - 1}.
`;
```

**Benefits:**
- ✅ Agents see full evolution of task
- ✅ Understand **why** they're iterating
- ✅ Can learn from previous attempts
- ✅ Can avoid repeating mistakes

**Token Usage:**
- CLAUDE.md: ~10K tokens (cached)
- Agent markdown: ~2K tokens (cached)
- Epic context: ~5K tokens (cached)
- Iteration history (3 iterations × 5K): ~15K tokens
- **Total:** ~32K tokens (well under 200K limit)

**Implementation Complexity:** 🟡 Medium

---

### 2.4 Message History & Conversation Threading

**Feature:** API supports multi-turn conversations

**Current Implementation:**
CLI agents make single API calls with no conversation memory.

**Recommended Enhancement:**

Maintain conversation thread across iterations:

```typescript
const conversationHistory: Anthropic.MessageParam[] = [];

// Load previous conversation from Redis
const prevMessages = await redis.lrange(`swarm:${taskId}:${agentId}:conversation`, 0, -1);
conversationHistory.push(...prevMessages.map(m => JSON.parse(m)));

// Add new user message
conversationHistory.push({
  role: 'user',
  content: `Iteration ${currentIteration}: ${taskPrompt}`
});

// Send with full history
const response = await client.messages.create({
  model: 'claude-3-5-haiku-20241022',
  max_tokens: 4096,
  system: systemPrompt,  // Cached context
  messages: conversationHistory  // Full conversation
});

// Store assistant response
conversationHistory.push({
  role: 'assistant',
  content: response.content[0].text
});

// Save to Redis
await redis.rpush(
  `swarm:${taskId}:${agentId}:conversation`,
  JSON.stringify(conversationHistory[conversationHistory.length - 1])
);
```

**Benefits:**
- ✅ Agents maintain context across iterations
- ✅ Natural conversation flow
- ✅ Better understanding of incremental changes
- ✅ Can reference previous decisions

**Implementation Complexity:** 🟡 Medium

---

### 2.5 Tool Use (Function Calling)

**Feature:** Agents can call predefined tools/functions

**Potential Tools for CLI Agents:**

```typescript
const tools = [
  {
    name: "read_redis_key",
    description: "Read a value from Redis by key",
    input_schema: {
      type: "object",
      properties: {
        key: { type: "string", description: "Redis key to read" }
      },
      required: ["key"]
    }
  },
  {
    name: "get_peer_result",
    description: "Get result from another agent in the swarm",
    input_schema: {
      type: "object",
      properties: {
        agentId: { type: "string", description: "Agent ID to query" }
      },
      required: ["agentId"]
    }
  },
  {
    name: "query_iteration_feedback",
    description: "Get feedback from previous iteration",
    input_schema: {
      type: "object",
      properties: {
        iteration: { type: "number", description: "Iteration number" }
      },
      required: ["iteration"]
    }
  }
];

const response = await client.messages.create({
  model: 'claude-3-5-haiku-20241022',
  max_tokens: 4096,
  system: systemPrompt,
  messages,
  tools
});

// If agent calls a tool, execute it
if (response.content.some(c => c.type === 'tool_use')) {
  // Execute tool calls and continue conversation
}
```

**Benefits:**
- ✅ Agents can **dynamically query** Redis
- ✅ Agents can **discover** peer results
- ✅ Agents can **request** specific feedback
- ✅ More autonomous behavior

**Drawbacks:**
- ⚠️ Adds API roundtrips (tool call → result → response)
- ⚠️ Increases complexity
- ⚠️ May not be cost-effective for simple queries

**Recommendation:** Use tools **only for dynamic queries** where context isn't known upfront. For static context, use system prompts.

**Implementation Complexity:** 🔴 High

---

## 3. Comparison: Task Agents vs Enhanced CLI Agents

### 3.1 Information Access Comparison

| Information | Task Agent | CLI Agent (Current) | CLI Agent (Enhanced) |
|-------------|------------|---------------------|----------------------|
| **Epic context** | ✅ In prompt (15K tokens) | ⚠️ JSON env var | ✅ In system prompt (cached) |
| **Agent instructions** | ✅ Via Main Chat context | ❌ Not available | ✅ In system prompt (cached) |
| **CLAUDE.md** | ✅ Via Main Chat context | ❌ Not available | ✅ In system prompt (cached) |
| **Success criteria** | ✅ Natural language | ⚠️ JSON env var | ✅ In system prompt (formatted) |
| **Iteration history** | ❌ No memory | ❌ No memory | ✅ Full conversation thread |
| **Previous feedback** | ❌ No feedback | ❌ No feedback | ✅ In iteration history |
| **Peer results** | ❌ Isolated | ✅ Redis read | ✅ Redis read + tool use |
| **Real-time coordination** | ❌ No coordination | ✅ Redis BLPOP | ✅ Redis BLPOP |
| **Cost per call** | 💰💰💰 $15/1M | 💰 $0.50/1M | 💰 $0.50/1M (cached context) |

**Conclusion:** Enhanced CLI agents have **superior information access** compared to Task agents, with **97% lower cost**.

---

### 3.2 Token Usage Comparison

**Task Agent (Typical):**
```
Main Chat context:       50,000 tokens  (CLAUDE.md + conversation history)
Agent spawn:             20,000 tokens  (epic context + agent instructions)
Agent response:           5,000 tokens
Total INPUT:             70,000 tokens × $15/1M = $1.05
Total OUTPUT:             5,000 tokens × $75/1M = $0.375
TOTAL COST:              $1.425 per agent call
```

**CLI Agent (Current):**
```
User prompt:              1,000 tokens  (minimal task description)
Agent response:           5,000 tokens
Total INPUT:              1,000 tokens × $0.50/1M = $0.0005
Total OUTPUT:             5,000 tokens × $2.50/1M = $0.0125
TOTAL COST:              $0.013 per agent call (99% savings)
```

**CLI Agent (Enhanced with Caching):**
```
System prompt (cached):  17,000 tokens  (CLAUDE.md + agent + epic)
  - First call:          17,000 tokens × $0.50/1M = $0.0085
  - Subsequent calls:    17,000 tokens × $0.02/1M = $0.00034 (cached)
User prompt:              1,000 tokens
Iteration history:        5,000 tokens  (3 iterations)
Agent response:           5,000 tokens

Total INPUT (first):     23,000 tokens × $0.50/1M = $0.0115
Total INPUT (cached):     6,000 tokens × $0.50/1M = $0.003
  + cached:              17,000 tokens × $0.02/1M = $0.00034
Total OUTPUT:             5,000 tokens × $2.50/1M = $0.0125

FIRST CALL:              $0.024
SUBSEQUENT CALLS:        $0.016
AVERAGE (10 agents):     $0.017 per agent call (98% savings vs Task)
```

**For CFN Loop (10 agents × 3 iterations):**

| Approach | First Iteration | Iterations 2-3 | Total | vs Task Agent |
|----------|----------------|----------------|-------|---------------|
| **Task agents** | $14.25 | $14.25 × 2 | **$42.75** | Baseline |
| **CLI (current)** | $0.13 | $0.13 × 2 | **$0.39** | 99% savings |
| **CLI (enhanced)** | $0.24 | $0.16 × 2 | **$0.56** | 99% savings |

**Conclusion:** Enhanced CLI agents cost **43% more** than current implementation but provide **10x better context** while still maintaining **99% savings vs Task agents**.

---

## 4. Recommended Implementation Plan

### Phase 1: System Prompt Enhancement (High Priority)

**Goal:** Inject epic context, agent instructions, and CLAUDE.md into system prompt

**Implementation:**
1. Create `buildCLIAgentSystemPrompt()` function
2. Load epic context from env vars
3. Load agent markdown from `.claude/agents/`
4. Load CLAUDE.md from project root
5. Format as natural language (not JSON)
6. Pass to `sendMessage()` as system prompt

**Effort:** 2-3 hours
**Impact:** 🔴 Critical - Agents get full context
**Cost Impact:** Minimal (+$0.005/call for first call)

**Code:**
```typescript
// src/cli/cli-agent-context.ts (NEW FILE)

export function buildCLIAgentSystemPrompt(options: {
  agentType: string;
  epicContext?: string;
  phaseContext?: string;
  successCriteria?: string;
}): string {
  const sections: string[] = [];

  // 1. CLAUDE.md project rules
  try {
    const claudeMd = fs.readFileSync('CLAUDE.md', 'utf8');
    sections.push(`# Project Guidelines\n\n${claudeMd}`);
  } catch { }

  // 2. Agent instructions
  try {
    const agentMd = fs.readFileSync(
      `.claude/agents/core-agents/${options.agentType}.md`,
      'utf8'
    );
    sections.push(`# Your Role and Responsibilities\n\n${agentMd}`);
  } catch { }

  // 3. Epic context (formatted from JSON)
  if (options.epicContext) {
    const epic = JSON.parse(options.epicContext);
    sections.push(`
# Epic Context

**Goal:** ${epic.epicGoal}

**In Scope:**
${epic.inScope.map(item => `- ${item}`).join('\n')}

**Out of Scope:**
${epic.outOfScope.map(item => `- ${item}`).join('\n')}
    `);
  }

  // 4. Phase context
  if (options.phaseContext) {
    const phase = JSON.parse(options.phaseContext);
    sections.push(`
# Current Phase: ${phase.currentPhase}

**Dependencies:** ${phase.dependencies.join(', ') || 'None'}

**Deliverables:**
${phase.deliverables.map(d => `- ${d}`).join('\n')}
    `);
  }

  // 5. Success criteria
  if (options.successCriteria) {
    const criteria = JSON.parse(options.successCriteria);
    sections.push(`
# Success Criteria

**Acceptance Criteria:**
${criteria.acceptanceCriteria.map(c => `- ${c}`).join('\n')}

**Quality Gates:**
- Loop 3 Gate Threshold: ${criteria.gateThreshold}
- Loop 2 Consensus Threshold: ${criteria.consensusThreshold}
    `);
  }

  return sections.join('\n\n---\n\n');
}
```

---

### Phase 2: Iteration History (Medium Priority)

**Goal:** Include previous iteration results and feedback in context

**Implementation:**
1. Store iteration results in Redis with iteration number
2. Store validator feedback in Redis
3. Load history on agent spawn
4. Include in system prompt or user message

**Effort:** 4-5 hours
**Impact:** 🟡 High - Agents understand iteration context
**Cost Impact:** +$0.003/call for history tokens

---

### Phase 3: Prompt Caching (Low Priority - Optimization)

**Goal:** Cache static context to reduce costs

**Implementation:**
1. Upgrade to Anthropic SDK v0.6.0+
2. Mark CLAUDE.md, agent markdown, and epic context as cacheable
3. Configure cache TTL (5 minutes)

**Effort:** 2-3 hours
**Impact:** 🟢 Medium - Cost optimization
**Cost Savings:** 96% on cached tokens

**Note:** Only implement if running high-volume CFN loops

---

### Phase 4: Tool Use (Future - Optional)

**Goal:** Enable dynamic queries via tool calling

**Implementation:**
1. Define tools for Redis queries
2. Implement tool execution handlers
3. Support multi-turn conversations with tool results

**Effort:** 8-10 hours
**Impact:** 🟢 Low - Nice-to-have for complex scenarios
**Cost Impact:** +$0.01-0.02/call (extra roundtrips)

**Recommendation:** Only implement if agents need dynamic discovery capabilities

---

## 5. Gap Closure Matrix

### Before Enhancements

| Gap | Severity | CLI Agent Access | Task Agent Access |
|-----|----------|------------------|-------------------|
| Epic context (natural language) | 🔴 High | ❌ JSON only | ✅ Full text |
| Agent instructions | 🔴 Critical | ❌ Not available | ✅ Via Main Chat |
| CLAUDE.md rules | 🔴 High | ❌ Not available | ✅ Via Main Chat |
| Iteration feedback | 🔴 Critical | ❌ Not available | ❌ Not available |
| Previous results | 🟡 Medium | ❌ No memory | ❌ No memory |
| Peer coordination | 🟢 Low | ✅ Via Redis | ❌ Isolated |

### After Phase 1 (System Prompts)

| Gap | Status | CLI Agent Access | Task Agent Access |
|-----|--------|------------------|-------------------|
| Epic context | ✅ CLOSED | ✅ Natural language in system prompt | ✅ Full text |
| Agent instructions | ✅ CLOSED | ✅ In system prompt | ✅ Via Main Chat |
| CLAUDE.md rules | ✅ CLOSED | ✅ In system prompt | ✅ Via Main Chat |
| Iteration feedback | ❌ OPEN | ❌ Not available | ❌ Not available |
| Previous results | ❌ OPEN | ❌ No memory | ❌ No memory |
| Peer coordination | ✅ CLOSED | ✅ Via Redis | ❌ Isolated |

### After Phase 2 (Iteration History)

| Gap | Status | CLI Agent Access | Task Agent Access |
|-----|--------|------------------|-------------------|
| Epic context | ✅ CLOSED | ✅ Natural language | ✅ Full text |
| Agent instructions | ✅ CLOSED | ✅ In system prompt | ✅ Via Main Chat |
| CLAUDE.md rules | ✅ CLOSED | ✅ In system prompt | ✅ Via Main Chat |
| Iteration feedback | ✅ CLOSED | ✅ Full iteration history | ❌ Not available |
| Previous results | ✅ CLOSED | ✅ Full conversation thread | ❌ No memory |
| Peer coordination | ✅ CLOSED | ✅ Via Redis | ❌ Isolated |

**Result:** CLI agents have **superior information access** to Task agents after Phase 2.

---

## 6. Conclusion

### Key Findings

1. **System Prompts** (Phase 1) close the most critical gaps
2. **Iteration History** (Phase 2) gives CLI agents an advantage over Task agents
3. **Prompt Caching** (Phase 3) optimizes costs without changing functionality
4. **Tool Use** (Phase 4) is optional and adds complexity

### Recommended Approach

**Implement Phase 1 immediately:**
- Inject CLAUDE.md, agent markdown, and formatted epic context into system prompts
- Effort: 2-3 hours
- Impact: Critical
- Cost: Minimal (+$0.005/call)

**Implement Phase 2 when needed:**
- Add iteration history once feedback mechanism is built
- Effort: 4-5 hours
- Impact: High
- Cost: Minimal (+$0.003/call)

**Skip Phase 3 unless:**
- Running >1000 agents/day
- Optimization is more important than simplicity

**Skip Phase 4 unless:**
- Agents need dynamic discovery
- Static context isn't sufficient

### Final Assessment

**Gap Status:** ✅ **Closeable with existing Anthropic SDK features**

**Implementation Priority:**
1. 🔴 System prompts (Phase 1)
2. 🟡 Iteration history (Phase 2)
3. 🟢 Prompt caching (Phase 3) - Optional
4. ⚪ Tool use (Phase 4) - Optional

**Cost Impact:** Minimal (+$0.008-0.01/call) while maintaining 99% savings vs Task agents

**Timeline:** Phase 1 can be implemented in 1 day, Phase 2 in 2 days

---

**Document Status:** ✅ Complete
**Next Steps:** Implement Phase 1 system prompt enhancement
**Estimated Impact:** CLI agents will have **equal or better** context than Task agents at **99% lower cost**
