# Conversation Coordinator Analysis

## Current Context Injection Architecture

### What You Have Now

Your current system has **THREE distinct context injection paths**:

#### 1. ACE System (Adaptive Context Engine)
**Location:** `.claude/skills/cfn-loop-orchestration/helpers/context-injection.sh`

```bash
# Retrieves learned context from SQLite database
inject_ace_context() {
  local task_description="$1"
  local task_tags="$2"
  local domain="$3"

  # Calls ACE system to get relevant past learnings
  "$ACE_INJECT_SCRIPT" \
    --task-description "$task_description" \
    --task-tags "$task_tags" \
    --domain "$domain"
}
```

**What it does:**
- Queries SQLite database for relevant past experiences
- Returns "positive context" (things that worked)
- Returns "negative context" (anti-patterns to avoid)
- Based on tags, domain classification, and similarity matching

**Example ACE context:**
```markdown
# Adaptive Context

## Relevant Learnings (Confidence: 0.85)
- Use TypeScript for type safety in agent implementations
- Redis coordination prevents race conditions
- Always validate input before spawning agents

## Anti-Patterns to Avoid
- Don't mix Task() and CLI spawning modes
- Avoid hardcoding file paths (use PROJECT_ROOT)
```

#### 2. Loop-Specific Context
**Location:** `.claude/skills/cfn-loop-orchestration/inject-loop-context.sh`

```bash
# Injects CFN Loop methodology and role-specific guidance
LOOP_TYPE="$1"     # loop3, loop2, loop4
AGENT_CONTEXT="$2"

# Load base context (CFN Loop rules)
BASE_CONTEXT=$(cat ".claude/prompts/cfn-loop-context.md")

# Load loop-specific context (what Loop 3 agents should do)
LOOP_CONTEXT=$(cat ".claude/prompts/loop-specific/${LOOP_TYPE}.md")

# Combine
echo "$BASE_CONTEXT"
echo "$LOOP_CONTEXT"
echo "# Your Task"
echo "$AGENT_CONTEXT"
```

**What it does:**
- Adds CFN Loop methodology (3-loop architecture)
- Adds role-specific guidance (Loop 3 = implementers, Loop 2 = validators)
- Adds iteration-specific context (this is iteration 3, here's what failed last time)

**Example loop context:**
```markdown
# CFN Loop Context

You are a Loop 3 agent (implementer).

## Your Role:
- Implement the task with high quality
- Report confidence score (0.75-1.0)
- Create deliverables listed in task requirements

## This Iteration: 3/10
Previous attempts failed because:
- Missing error handling in auth.ts
- No input validation on user endpoints

## Success Criteria:
- All tests pass
- Code coverage >80%
- No security vulnerabilities
```

#### 3. Epic/Phase Context (Hierarchical)
**Location:** Passed as `--epic-context` and `--phase-context` arguments

```bash
./orchestrate.sh \
  --task-id "auth-impl" \
  --epic-context '{
    "epicGoal": "Build authentication system",
    "phases": ["JWT implementation", "OAuth integration"],
    "currentPhase": 1,
    "deliverables": ["auth.ts", "auth.test.ts"]
  }' \
  --phase-context '{
    "phaseGoal": "JWT implementation",
    "acceptanceCriteria": ["Valid JWT tokens", "Refresh token rotation"],
    "technicalConstraints": ["Use jsonwebtoken library"]
  }'
```

**What it does:**
- Provides high-level project context (epic goal)
- Provides mid-level phase context (current sprint/phase)
- Provides deliverables checklist
- Provides acceptance criteria

---

### Current Context Flow (Task Mode)

```
User: /cfn-loop-task "Implement authentication"
  ↓
Main Chat (cfn-v3-coordinator spawned via Task())
  ↓
Coordinator reads task description
  ↓
┌─────────────────────────────────────────┐
│ Context Assembly                        │
├─────────────────────────────────────────┤
│ 1. ACE Context (past learnings)         │
│ 2. Loop Context (CFN methodology)       │
│ 3. Epic Context (project hierarchy)     │
│ 4. Task Description (current work)      │
└─────────────────────────────────────────┘
  ↓
Spawns Loop 3 agents via Task() with combined context
  ↓
backend-developer receives:
```markdown
# Adaptive Context (ACE)
[Past learnings about authentication...]

# CFN Loop Context
You are a Loop 3 implementer...

# Epic Context
Epic: Build authentication system
Phase 1: JWT implementation

# Your Task
Implement JWT authentication in auth.ts
```

**Problem: Context is assembled ONCE per agent spawn, no conversation memory.**

---

## What a Conversation Coordinator Is

A **Conversation Coordinator** is a stateful layer that sits between the user and agents, maintaining conversation history and managing context across multiple turns.

### Core Concept

```javascript
class ConversationCoordinator {
  conversations = new Map(); // conversationId → ConversationState

  async handleMessage(conversationId, message) {
    // 1. Get or create conversation
    const conversation = this.getConversation(conversationId);

    // 2. Add message to history
    conversation.addMessage({role: "user", content: message});

    // 3. Assemble context from multiple sources
    const context = this.assembleContext(conversation);

    // 4. Spawn agent with full context
    const result = await this.spawnAgent(conversation.agentType, context);

    // 5. Add response to history
    conversation.addMessage({role: "assistant", content: result});

    // 6. Manage context window (prune if too large)
    this.pruneHistory(conversation);

    return result;
  }
}
```

---

## Conversation Coordinator vs Current Architecture

### Current (Stateless)

```
Turn 1:
User: "Implement JWT auth"
  → Spawn agent with ACE + Loop + Epic context
  → Agent works, returns result, exits
  → NO MEMORY RETAINED

Turn 2:
User: "Add refresh tokens"
  → Spawn NEW agent with ACE + Loop + Epic context
  → Agent has NO KNOWLEDGE of Turn 1
  → Must manually include "build on previous work" in task description
```

**Problem:** Agent doesn't "remember" Turn 1 unless you explicitly describe it in Turn 2's task description.

---

### With Conversation Coordinator (Stateful)

```
Turn 1:
User: "Implement JWT auth"
  → Coordinator creates conversation
  → Spawns agent with context:
      - ACE context
      - Loop context
      - Epic context
      - Conversation: []
  → Agent works, returns result, exits
  → Coordinator saves:
      conversations["auth-123"] = [
        {role: "user", content: "Implement JWT auth"},
        {role: "assistant", content: "I created auth.ts with JWT..."}
      ]

Turn 2:
User: "Add refresh tokens"
  → Coordinator retrieves conversation["auth-123"]
  → Spawns agent with context:
      - ACE context (same)
      - Loop context (same)
      - Epic context (same)
      - Conversation: [
          {role: "user", content: "Implement JWT auth"},
          {role: "assistant", content: "I created auth.ts with JWT..."},
          {role: "user", content: "Add refresh tokens"}
        ]
  → Agent has FULL CONTEXT of Turn 1
  → Agent knows it needs to modify auth.ts, not create it
  → Coordinator saves updated history
```

**Benefit:** Agent "remembers" previous turns without manual description.

---

## How Conversation Coordinator Works (Detailed)

### Architecture

```
┌──────────────────────────────────────────────────────┐
│                User/Main Chat                        │
└────────────────────┬─────────────────────────────────┘
                     │
                     ↓
┌──────────────────────────────────────────────────────┐
│           Conversation Coordinator                   │
│                                                      │
│  ┌────────────────────────────────────────────┐    │
│  │  Conversation Store (Redis/SQLite)         │    │
│  │                                            │    │
│  │  conversations: {                          │    │
│  │    "auth-conv-123": {                      │    │
│  │      agentType: "backend-developer",       │    │
│  │      history: [                            │    │
│  │        {role: "user", content: "..."},     │    │
│  │        {role: "assistant", content: "..."} │    │
│  │      ],                                    │    │
│  │      metadata: {                           │    │
│  │        epic: "auth-system",                │    │
│  │        phase: "jwt-impl",                  │    │
│  │        deliverables: ["auth.ts"]           │    │
│  │      }                                     │    │
│  │    }                                       │    │
│  │  }                                         │    │
│  └────────────────────────────────────────────┘    │
│                                                      │
│  ┌────────────────────────────────────────────┐    │
│  │  Context Assembly                          │    │
│  │                                            │    │
│  │  assembleContext(conversation) {           │    │
│  │    return {                                │    │
│  │      aceContext: getACEContext(),          │    │
│  │      loopContext: getLoopContext(),        │    │
│  │      epicContext: getEpicContext(),        │    │
│  │      conversationHistory: conversation.history│ │
│  │    }                                       │    │
│  │  }                                         │    │
│  └────────────────────────────────────────────┘    │
│                                                      │
│  ┌────────────────────────────────────────────┐    │
│  │  Context Pruning                           │    │
│  │                                            │    │
│  │  pruneHistory(conversation) {              │    │
│  │    if (tokenCount > 150k) {                │    │
│  │      // Keep last 20 messages              │    │
│  │      // OR summarize old messages          │    │
│  │    }                                       │    │
│  │  }                                         │    │
│  └────────────────────────────────────────────┘    │
└────────────────────┬─────────────────────────────────┘
                     │
                     ↓
┌──────────────────────────────────────────────────────┐
│            Agent Spawning Layer                      │
│                                                      │
│  npx claude-flow-novice agent-spawn \              │
│    backend-developer \                              │
│    --context "{                                     │
│      aceContext: ...,                               │
│      loopContext: ...,                              │
│      conversationHistory: [...]                     │
│    }"                                               │
└──────────────────────────────────────────────────────┘
```

---

### Core Components

#### 1. Conversation Store

**What it stores:**
```typescript
interface Conversation {
  id: string;
  agentType: string;  // Which agent is handling this conversation
  history: Message[]; // Full conversation history
  metadata: {
    epicContext?: object;
    phaseContext?: object;
    deliverables: string[];
    startedAt: number;
    lastActivity: number;
  };
}

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  metadata?: {
    confidence?: number;
    iteration?: number;
    filesModified?: string[];
  };
}
```

**Storage options:**
- **Redis:** Fast, ephemeral (conversations expire after inactivity)
- **SQLite:** Persistent, searchable (for long-term projects)
- **In-memory:** Simple, but lost on restart

---

#### 2. Context Assembly

**Assembles 4 layers of context:**

```javascript
assembleContext(conversation) {
  // Layer 1: ACE Context (past learnings)
  const aceContext = this.getACEContext(
    conversation.metadata.taskDescription,
    conversation.metadata.tags
  );

  // Layer 2: Loop Context (CFN methodology)
  const loopContext = this.getLoopContext(
    conversation.metadata.loopType || "loop3"
  );

  // Layer 3: Epic/Phase Context (project hierarchy)
  const epicContext = conversation.metadata.epicContext;

  // Layer 4: Conversation History
  const conversationHistory = conversation.history;

  return {
    aceContext,
    loopContext,
    epicContext,
    conversationHistory
  };
}
```

**Formatted for agent:**
```markdown
# Adaptive Context (ACE)
[Relevant learnings from past tasks...]

# CFN Loop Context
You are a Loop 3 implementer...

# Epic Context
Epic: Build authentication system
Phase 1: JWT implementation
Deliverables: auth.ts, auth.test.ts

# Conversation History

## Previous Messages:
**User (Turn 1):** Implement JWT authentication
**Assistant (Turn 1):** I created auth.ts with the following implementation...

**User (Turn 2):** Add refresh token functionality

# Current Task
Add refresh token functionality to the existing auth.ts implementation.
```

---

#### 3. Context Pruning Strategies

**Problem:** Conversation history grows unbounded.

**Strategy 1: Sliding Window**
```javascript
pruneHistory(conversation) {
  const MAX_MESSAGES = 20; // Keep last 20 messages

  if (conversation.history.length > MAX_MESSAGES) {
    conversation.history = conversation.history.slice(-MAX_MESSAGES);
  }
}
```

**Strategy 2: Token-Based Pruning**
```javascript
pruneHistory(conversation) {
  const MAX_TOKENS = 150000; // Claude 200k context window

  let tokenCount = estimateTokens(conversation.history);

  while (tokenCount > MAX_TOKENS && conversation.history.length > 2) {
    conversation.history.shift(); // Remove oldest message
    tokenCount = estimateTokens(conversation.history);
  }
}
```

**Strategy 3: Summarization**
```javascript
async pruneHistory(conversation) {
  if (conversation.history.length > 30) {
    // Summarize messages 1-20, keep 21-30 verbatim
    const oldMessages = conversation.history.slice(0, 20);
    const recentMessages = conversation.history.slice(20);

    const summary = await this.summarizeMessages(oldMessages);

    conversation.history = [
      {role: "system", content: `Summary of earlier conversation: ${summary}`},
      ...recentMessages
    ];
  }
}
```

**Strategy 4: Importance Scoring**
```javascript
pruneHistory(conversation) {
  // Keep messages with high importance
  const importanceScores = conversation.history.map(msg => ({
    msg,
    score: this.calculateImportance(msg)
  }));

  // Sort by importance, keep top 20
  const importantMessages = importanceScores
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map(item => item.msg);

  conversation.history = importantMessages;
}

calculateImportance(msg) {
  let score = 0;
  if (msg.metadata?.filesModified?.length > 0) score += 10; // Created files
  if (msg.metadata?.confidence > 0.9) score += 5;            // High confidence
  if (msg.content.includes("error") || msg.content.includes("bug")) score += 8; // Bug fixes
  return score;
}
```

---

## Implementation Options

### Option A: Minimal Conversation Coordinator (Recommended)

**What it does:**
- Maintains conversation history in Redis
- Injects history into existing context assembly
- Uses sliding window pruning (last 20 messages)
- **Does NOT change agent spawning** (still spawn-execute-exit)

**Architecture:**
```
┌─────────────────────────────────────┐
│  Enhanced Main Chat                 │
│                                     │
│  conversations = new Map()          │
│                                     │
│  handleTurn(conversationId, msg) {  │
│    history = conversations.get(id)  │
│    history.push({role: "user"...})  │
│                                     │
│    context = {                      │
│      ace: getACE(),                 │
│      loop: getLoop(),               │
│      epic: getEpic(),               │
│      history: history               │
│    }                                │
│                                     │
│    result = spawnAgent(context)     │
│    history.push({role: "asst"...})  │
│                                     │
│    prune(history) // Keep last 20   │
│  }                                  │
└─────────────────────────────────────┘
```

**Implementation:**
```javascript
// .claude/skills/conversation-coordinator/simple-coordinator.js

class SimpleConversationCoordinator {
  constructor(redis) {
    this.redis = redis;
  }

  async handleMessage(conversationId, agentType, message, contextOptions = {}) {
    // 1. Get conversation history
    const history = await this.getHistory(conversationId);

    // 2. Add user message
    history.push({
      role: "user",
      content: message,
      timestamp: Date.now()
    });

    // 3. Assemble full context
    const context = await this.assembleContext({
      conversationId,
      agentType,
      history,
      ...contextOptions  // aceContext, loopContext, epicContext
    });

    // 4. Spawn agent (existing mechanism)
    const result = await this.spawnAgent(agentType, context);

    // 5. Add assistant response
    history.push({
      role: "assistant",
      content: result.output,
      timestamp: Date.now(),
      metadata: {
        confidence: result.confidence,
        filesModified: result.filesModified
      }
    });

    // 6. Prune history (keep last 20)
    const prunedHistory = history.slice(-20);

    // 7. Save to Redis
    await this.saveHistory(conversationId, prunedHistory);

    return result;
  }

  async assembleContext(options) {
    const { conversationId, agentType, history, aceContext, loopContext, epicContext } = options;

    // Format conversation history for agent
    const formattedHistory = this.formatHistory(history);

    return {
      aceContext: aceContext || await this.getACEContext(options),
      loopContext: loopContext || await this.getLoopContext(options),
      epicContext: epicContext || {},
      conversationHistory: formattedHistory
    };
  }

  formatHistory(history) {
    return history.map(msg =>
      `**${msg.role === 'user' ? 'User' : 'Assistant'}**: ${msg.content}`
    ).join('\n\n');
  }

  async spawnAgent(agentType, context) {
    // Use existing agent spawning mechanism
    const { execSync } = require('child_process');

    const contextJson = JSON.stringify(context);
    const result = execSync(
      `npx claude-flow-novice agent-spawn ${agentType} --context '${contextJson}'`,
      { encoding: 'utf-8' }
    );

    return JSON.parse(result);
  }

  async getHistory(conversationId) {
    const stored = await this.redis.get(`conversation:${conversationId}`);
    return stored ? JSON.parse(stored) : [];
  }

  async saveHistory(conversationId, history) {
    await this.redis.set(
      `conversation:${conversationId}`,
      JSON.stringify(history),
      'EX',
      86400 // 24 hour TTL
    );
  }
}
```

**Benefits:**
- ✅ Minimal changes to existing architecture
- ✅ Agents still spawn-execute-exit (clean state)
- ✅ Conversation continuity without persistence complexity
- ✅ Easy to disable (just don't use coordinator)

**Trade-offs:**
- ❌ Still 46ms spawn overhead (but we proved this doesn't matter)
- ❌ Conversation history grows (but pruning handles it)

---

### Option B: Full Conversation Coordinator with State Management

**What it does:**
- Everything from Option A, PLUS:
- Manages multi-agent conversations (backend-developer, tester, reviewer)
- Tracks deliverables and acceptance criteria
- Provides conversation branching (explore alternative approaches)
- Integrates with CFN Loop iterations

**Architecture:**
```
ConversationCoordinator
├── ConversationManager (create, retrieve, list conversations)
├── ContextAssembler (ACE + Loop + Epic + History)
├── HistoryPruner (sliding window, token-based, summarization)
├── AgentRouter (route to appropriate agent based on task type)
└── DeliverableTracker (track files created, tests passing)
```

**This is overkill unless you have specific use case.**

---

## Recommended Implementation Path

### Phase 1: Add Conversation History to Current Architecture (1 week)

**Goal:** Enable multi-turn conversations without changing agent spawning.

**Steps:**
1. Create `SimpleConversationCoordinator` class (above)
2. Integrate with Main Chat in Task Mode
3. Store conversations in Redis with 24h TTL
4. Use sliding window pruning (last 20 messages)

**Usage:**
```javascript
// In Main Chat (cfn-v3-coordinator)
const coordinator = new SimpleConversationCoordinator(redis);

// User sends message
const result = await coordinator.handleMessage(
  "auth-conversation-123",    // conversationId
  "backend-developer",         // agentType
  "Implement JWT auth",        // message
  {
    aceContext: await getACEContext(),
    loopContext: await getLoopContext(),
    epicContext: {goal: "Build auth system"}
  }
);

// Later, user sends follow-up
const result2 = await coordinator.handleMessage(
  "auth-conversation-123",     // SAME conversationId
  "backend-developer",
  "Add refresh tokens"         // Agent gets full history
);
```

**Testing:**
```bash
# Test conversation continuity
./.claude/skills/conversation-coordinator/test-conversation.sh

# Expected: Agent references previous turn without manual context
```

---

### Phase 2: Add Context Pruning Strategies (1 week)

**Goal:** Handle long conversations without context window explosion.

**Add:**
- Token counting
- Importance scoring
- Summarization (optional)

---

### Phase 3: Integration with CFN Loop (1 week)

**Goal:** Use conversation history across loop iterations.

**Example:**
```
Iteration 1:
User: "Implement auth"
Loop 3: Creates auth.ts (confidence 0.65, below gate)

Iteration 2:
Loop 3 receives conversation:
  - Previous: "I created auth.ts but lacked error handling"
  - Current: "Add error handling and improve to pass gate"
Loop 3: Improves auth.ts (confidence 0.80, passes gate)
```

---

## Critical Questions to Answer Before Building

### 1. What's the actual pain point?

**Current system:**
```bash
# Turn 1
/cfn-loop-task "Implement auth"
# → Agent works, exits

# Turn 2
/cfn-loop-task "Add refresh tokens to the auth system we just built"
#                 ↑ Must manually describe "auth system we just built"
```

**With coordinator:**
```bash
# Turn 1
/cfn-conversation start auth-work "Implement auth"
# → Coordinator creates conversation, spawns agent

# Turn 2
/cfn-conversation continue auth-work "Add refresh tokens"
#                                      ↑ Agent knows about Turn 1 automatically
```

**Question:** How often do you have multi-turn refinement?
- If rare (1-2 turns) → Manual context description is fine
- If common (5-10 turns) → Coordinator provides value

---

### 2. What about CFN Loop iterations?

**Current:** Loop iterations already maintain context via Redis
```bash
# Iteration 1
Loop 3 creates auth.ts (confidence 0.65)
Redis stores: task:auth-impl:iteration:1:output

# Iteration 2
Loop 3 reads previous iteration from Redis
Improves auth.ts (confidence 0.80)
```

**Question:** Does CFN Loop iteration context differ from conversation history?
- Iteration context: Technical output (code, confidence scores)
- Conversation context: Human dialogue (requirements, clarifications)

**They're complementary, not competing.**

---

### 3. How do you handle task switching?

**Scenario:**
```
Conversation A: "Build authentication" (5 turns)
Conversation B: "Fix dashboard bug" (3 turns)
Back to A: "Add OAuth to authentication"
```

**With coordinator:**
```javascript
// Create separate conversations
coordinator.handleMessage("auth-conv", "backend-dev", "Build auth");
coordinator.handleMessage("dashboard-conv", "frontend-dev", "Fix bug");
coordinator.handleMessage("auth-conv", "backend-dev", "Add OAuth");
//                         ↑ Retrieves auth conversation, not dashboard
```

**Question:** Do you need to switch between multiple ongoing conversations?

---

## Honest Assessment

### Conversation Coordinator Solves:
1. ✅ **Multi-turn refinement** - "Now add X" without re-explaining context
2. ✅ **Context continuity** - Agent references previous work naturally
3. ✅ **Reduced user effort** - Don't manually describe "what we did before"

### Conversation Coordinator Does NOT Solve:
1. ❌ **Spawn overhead** - Still spawning agents (46ms, but irrelevant)
2. ❌ **Agent specialization** - Still need to specify agent type
3. ❌ **Task isolation** - Still need separate conversations for different tasks
4. ❌ **Long-term learning** - ACE system already handles this

### When You DON'T Need It:
- Single-turn tasks (most of your CFN Loop usage)
- Well-defined epic/phase context (already have this)
- Rare refinement iterations (just include context in task description)

### When You DO Need It:
- Frequent multi-turn refinement (>3 turns per task)
- Exploratory development ("try approach A, now try B")
- Long-running project work (weeks on same codebase)
- User wants conversational "feel" (aesthetic preference)

---

## Recommended Next Step

**Before building anything, answer these questions:**

1. **How many turns per task typically?**
   - If 1-2: Don't build coordinator
   - If 3-5: Consider coordinator
   - If 5+: Build coordinator

2. **How often do users refine tasks?**
   - Rarely: Don't build
   - Sometimes: Consider
   - Frequently: Build

3. **Is CFN Loop iteration context sufficient?**
   - If yes: Don't build
   - If no: Explain what's missing

4. **What problem are you actually trying to solve?**
   - Speed? (Coordinator doesn't help - spawn is 46ms)
   - Context loss? (Manual description works, coordinator is convenience)
   - User experience? (Aesthetic preference, not functional requirement)

**My recommendation:** Start with **Option A (Minimal Coordinator)** as a skill that users can opt into. If multi-turn refinement becomes common, it provides value. If not, users ignore it and nothing changes.

**Implementation time:** 1 week for basic version, test with real usage, iterate based on actual pain points.

Want me to build the minimal coordinator implementation?
