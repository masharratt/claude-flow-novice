# Phase 7: Agent Help System - Architecture Design

**Version**: 1.0
**Date**: 2025-10-03
**Status**: Architecture Design - Ready for Implementation
**Dependencies**: Phases 1-6 Complete

---

## Executive Summary

Phase 7 introduces a **dynamic help request system** enabling blocked agents to request assistance from capable helpers with minimal latency. The system provides:

- **Fast help routing** (<200ms request-to-helper assignment)
- **Capability matching** (<100ms p95 helper discovery)
- **Zero-cost waiting** (SDK pause for blocked agents)
- **Quick resume** (<50ms helper resume latency)
- **Checkpoint recovery** (<500ms state restoration)

**Architecture Highlights**:
- Request/reply pattern via existing MessageBroker (Phase 3)
- Capability-based helper matching using existing AgentCapabilitySystem
- SDK pause/resume integration (Phase 1 QueryController)
- Checkpoint-based state preservation (Phase 1 CheckpointManager)
- State machine transitions: WAITING → HELPING (Phase 1 StateMachine)

---

## 1. System Architecture

### 1.1 Core Components

```typescript
┌─────────────────────────────────────────────────────────────┐
│                    Help Request System                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────┐    ┌─────────────────────────┐         │
│  │ HelpRequestBus │───→│ CapabilityMatcher       │         │
│  │ (MessageBroker)│←───│ (<100ms lookup)         │         │
│  └────────────────┘    └─────────────────────────┘         │
│         │                         │                          │
│         ▼                         ▼                          │
│  ┌────────────────┐    ┌─────────────────────────┐         │
│  │ WaitingAgentPool│   │ HelperRegistry          │         │
│  │ (SDK paused)   │    │ (capability index)      │         │
│  └────────────────┘    └─────────────────────────┘         │
│         │                         │                          │
│         └──────────┬──────────────┘                          │
│                    ▼                                          │
│         ┌─────────────────────┐                             │
│         │ HelperResumeService │                             │
│         │ (<50ms resume)      │                             │
│         └─────────────────────┘                             │
│                    │                                          │
│                    ▼                                          │
│         ┌─────────────────────┐                             │
│         │ CheckpointRecovery  │                             │
│         │ (<500ms restore)    │                             │
│         └─────────────────────┘                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Data Flow

```
1. Agent Encounters Blocker
   └─→ Transition to WAITING state
      └─→ Create help request message
         └─→ Publish to help.request topic
            └─→ Pause agent (zero token cost)

2. Capability Matching (<100ms)
   └─→ CapabilityMatcher receives request
      └─→ Query HelperRegistry for capable agents
         └─→ Filter by required capabilities
            └─→ Rank by availability + capability score

3. Helper Assignment (<200ms total)
   └─→ Select top-ranked helper
      └─→ Transition helper: IDLE/WAITING → HELPING
         └─→ Create checkpoint before state change
            └─→ Resume helper with context
               └─→ Publish help.accepted reply

4. Collaborative Work
   └─→ Helper performs assistance task
      └─→ Updates shared state via artifacts
         └─→ Publishes help.completed message
            └─→ Transitions: HELPING → WORKING (helper)
               └─→ Transitions: WAITING → WORKING (requester)

5. State Restoration (<500ms)
   └─→ Restore requester from checkpoint
      └─→ Resume requester with helper's output
         └─→ Continue original task execution
```

---

## 2. Component Specifications

### 2.1 HelpRequestBus

**Purpose**: Message routing for help requests using existing MessageBroker

**Integration Point**: `src/coordination/v2/core/message-broker.ts` (Phase 3)

**Topics**:
```typescript
- help.request.<domain>     // Help request by domain
- help.accepted.<requestId>  // Helper acceptance reply
- help.completed.<requestId> // Completion notification
- help.timeout.<requestId>   // Timeout notification
```

**Message Structure**:
```typescript
interface HelpRequest {
  requestId: string;
  requesterId: string;
  requesterSessionId: string;
  domain: string;  // e.g., "backend", "security", "testing"
  requiredCapabilities: string[];
  preferredCapabilities: string[];
  context: {
    blocker: string;
    currentTask: string;
    dependencies: string[];
    priority: number;
  };
  checkpointId: string;  // For requester state restoration
  timeout: number;  // ms until fallback
  timestamp: number;
}

interface HelpAcceptance {
  requestId: string;
  helperId: string;
  helperSessionId: string;
  estimatedDuration: number;
  helperCheckpointId: string;  // For helper state preservation
  capabilities: string[];
}

interface HelpCompletion {
  requestId: string;
  helperId: string;
  success: boolean;
  output?: any;
  error?: string;
  duration: number;
}
```

**Implementation**:
```typescript
// src/coordination/v2/help/help-request-bus.ts
export class HelpRequestBus {
  constructor(
    private messageBroker: MessageBroker,
    private capabilityMatcher: CapabilityMatcher,
    private helperResume: HelperResumeService
  ) {
    this.subscribeToHelpRequests();
  }

  async publishHelpRequest(request: HelpRequest): Promise<void> {
    await this.messageBroker.publish({
      topic: `help.request.${request.domain}`,
      payload: request,
      priority: MessagePriority.HIGH,
      correlationId: request.requestId
    });
  }

  private async subscribeToHelpRequests(): Promise<void> {
    await this.messageBroker.subscribe({
      topic: 'help.request.*',
      handler: async (msg) => {
        const request = msg.payload as HelpRequest;
        await this.handleHelpRequest(request);
      },
      priority: 10  // High priority processing
    });
  }

  private async handleHelpRequest(request: HelpRequest): Promise<void> {
    const startTime = performance.now();

    // 1. Find capable helper (<100ms)
    const helper = await this.capabilityMatcher.findBestHelper(request);

    if (!helper) {
      await this.publishTimeout(request);
      return;
    }

    // 2. Resume helper (<50ms)
    await this.helperResume.resumeHelper(helper, request);

    // 3. Publish acceptance
    await this.messageBroker.reply(
      { ...request, replyTo: `help.accepted.${request.requestId}` } as any,
      {
        requestId: request.requestId,
        helperId: helper.agentId,
        helperSessionId: helper.sessionId,
        estimatedDuration: 30000,  // 30s default
        capabilities: helper.capabilities
      },
      true
    );

    const latency = performance.now() - startTime;

    // Validation: <200ms total
    if (latency > 200) {
      console.warn(`Help request exceeded 200ms: ${latency.toFixed(2)}ms`);
    }
  }
}
```

---

### 2.2 CapabilityMatcher

**Purpose**: Fast lookup of capable helpers using indexed capability registry

**Integration Point**: `src/cli/agents/capabilities.ts` (existing AgentCapabilitySystem)

**Data Structure** (Inverted Index):
```typescript
interface CapabilityIndex {
  // capability → agents with that capability
  index: Map<string, Set<string>>;

  // agentId → { state, capabilities, workload }
  agents: Map<string, HelperMetadata>;
}

interface HelperMetadata {
  agentId: string;
  sessionId: string;
  state: AgentState;
  capabilities: string[];
  workload: number;  // 0.0-1.0
  availability: boolean;
  lastActive: number;
}
```

**Matching Algorithm** (<100ms target):
```typescript
1. Lookup Phase (O(1) per capability):
   - Query index for required capabilities
   - Intersect agent sets (Set intersection)
   - Filter by state (IDLE or WAITING only)

2. Ranking Phase (O(n log n), n = matched agents):
   - Score = capability_match * 0.6 + availability * 0.4
   - Sort by score descending
   - Return top candidate

3. Validation Phase:
   - Verify agent still available
   - Check workload capacity
   - Confirm state transition allowed
```

**Implementation**:
```typescript
// src/coordination/v2/help/capability-matcher.ts
export class CapabilityMatcher {
  private index: CapabilityIndex;
  private registry: AgentCapabilitySystem;

  constructor(registry: AgentCapabilitySystem) {
    this.registry = registry;
    this.index = { index: new Map(), agents: new Map() };
  }

  async findBestHelper(request: HelpRequest): Promise<HelperMetadata | null> {
    const startTime = performance.now();

    // Step 1: Fast capability lookup (O(k) where k = required capabilities)
    const candidates = this.queryIndex(request.requiredCapabilities);

    if (candidates.size === 0) {
      return null;
    }

    // Step 2: Filter by availability
    const available = Array.from(candidates)
      .map(id => this.index.agents.get(id)!)
      .filter(agent =>
        (agent.state === AgentState.IDLE || agent.state === AgentState.WAITING) &&
        agent.availability &&
        agent.workload < 0.8
      );

    if (available.length === 0) {
      return null;
    }

    // Step 3: Rank by score
    const ranked = available
      .map(agent => ({
        agent,
        score: this.calculateScore(agent, request)
      }))
      .sort((a, b) => b.score - a.score);

    const latency = performance.now() - startTime;

    // Validation: <100ms p95
    if (latency > 100) {
      console.warn(`Capability matching exceeded 100ms: ${latency.toFixed(2)}ms`);
    }

    return ranked[0]?.agent || null;
  }

  private queryIndex(capabilities: string[]): Set<string> {
    // Intersect all capability sets
    let result: Set<string> | null = null;

    for (const cap of capabilities) {
      const agents = this.index.index.get(cap);
      if (!agents || agents.size === 0) {
        return new Set();  // No agents have this capability
      }

      if (result === null) {
        result = new Set(agents);
      } else {
        result = new Set([...result].filter(id => agents.has(id)));
      }

      // Early exit if intersection is empty
      if (result.size === 0) {
        return result;
      }
    }

    return result || new Set();
  }

  private calculateScore(agent: HelperMetadata, request: HelpRequest): number {
    // Capability match score (0.0-1.0)
    const requiredMatch = request.requiredCapabilities.filter(
      cap => agent.capabilities.includes(cap)
    ).length / request.requiredCapabilities.length;

    const preferredMatch = request.preferredCapabilities.filter(
      cap => agent.capabilities.includes(cap)
    ).length / Math.max(request.preferredCapabilities.length, 1);

    const capabilityScore = requiredMatch * 0.8 + preferredMatch * 0.2;

    // Availability score (0.0-1.0)
    const workloadScore = 1 - agent.workload;
    const freshnessScore = Math.max(0, 1 - (Date.now() - agent.lastActive) / 60000);
    const availabilityScore = workloadScore * 0.7 + freshnessScore * 0.3;

    // Final score
    return capabilityScore * 0.6 + availabilityScore * 0.4;
  }

  // Index maintenance
  registerHelper(helper: HelperMetadata): void {
    this.index.agents.set(helper.agentId, helper);

    for (const cap of helper.capabilities) {
      if (!this.index.index.has(cap)) {
        this.index.index.set(cap, new Set());
      }
      this.index.index.get(cap)!.add(helper.agentId);
    }
  }

  unregisterHelper(agentId: string): void {
    const helper = this.index.agents.get(agentId);
    if (!helper) return;

    for (const cap of helper.capabilities) {
      this.index.index.get(cap)?.delete(agentId);
    }
    this.index.agents.delete(agentId);
  }

  updateHelperState(agentId: string, updates: Partial<HelperMetadata>): void {
    const helper = this.index.agents.get(agentId);
    if (helper) {
      Object.assign(helper, updates);
    }
  }
}
```

---

### 2.3 WaitingAgentPool

**Purpose**: Zero-cost paused agents using SDK pause

**Integration Point**: `src/coordination/v2/sdk/query-controller.ts` (Phase 1)

**State Management**:
```typescript
interface WaitingAgent {
  agentId: string;
  sessionId: string;
  checkpointId: string;  // Checkpoint before pause
  helpRequestId: string;
  pausedAt: number;
  timeoutAt: number;
  context: {
    blocker: string;
    currentTask: string;
  };
}
```

**Implementation**:
```typescript
// src/coordination/v2/help/waiting-agent-pool.ts
export class WaitingAgentPool {
  private waitingAgents: Map<string, WaitingAgent> = new Map();

  constructor(
    private queryController: QueryController,
    private checkpointManager: CheckpointManager
  ) {}

  async pauseAndWait(
    agentId: string,
    sessionId: string,
    helpRequest: HelpRequest
  ): Promise<void> {
    // 1. Create checkpoint before pausing
    const checkpointId = await this.checkpointManager.createCheckpoint(
      sessionId,
      agentId,
      `msg_${Date.now()}`,  // Current message UUID
      AgentState.WAITING,
      { blocker: helpRequest.context.blocker },
      {
        reason: `Waiting for help: ${helpRequest.requestId}`,
        autoCheckpoint: false,
        context: helpRequest.context
      }
    );

    // 2. Pause agent (zero token cost)
    await this.queryController.pauseAgent(
      agentId,
      `Help requested: ${helpRequest.requestId}`
    );

    // 3. Track waiting agent
    this.waitingAgents.set(agentId, {
      agentId,
      sessionId,
      checkpointId,
      helpRequestId: helpRequest.requestId,
      pausedAt: Date.now(),
      timeoutAt: Date.now() + helpRequest.timeout,
      context: helpRequest.context
    });
  }

  async resumeFromHelp(
    agentId: string,
    helpOutput: any
  ): Promise<void> {
    const waiting = this.waitingAgents.get(agentId);
    if (!waiting) {
      throw new Error(`Agent ${agentId} not in waiting pool`);
    }

    const startTime = performance.now();

    // 1. Restore from checkpoint (<500ms target)
    await this.checkpointManager.restoreCheckpoint(waiting.checkpointId);

    // 2. Resume agent with help output
    await this.queryController.resumeAgent(
      agentId,
      waiting.checkpointId,
      waiting.checkpointId  // Use checkpoint's messageUUID
    );

    const latency = performance.now() - startTime;

    // Validation: <500ms restoration
    if (latency > 500) {
      console.warn(`State restoration exceeded 500ms: ${latency.toFixed(2)}ms`);
    }

    // 3. Remove from waiting pool
    this.waitingAgents.delete(agentId);
  }

  // Timeout handling
  async checkTimeouts(): Promise<void> {
    const now = Date.now();

    for (const [agentId, waiting] of this.waitingAgents) {
      if (now > waiting.timeoutAt) {
        // Timeout: resume without help
        await this.resumeFromHelp(agentId, { timeout: true });
      }
    }
  }

  getWaitingAgent(agentId: string): WaitingAgent | undefined {
    return this.waitingAgents.get(agentId);
  }

  getWaitingCount(): number {
    return this.waitingAgents.size;
  }
}
```

---

### 2.4 HelperResumeService

**Purpose**: Quick resume of helper agents (<50ms)

**Integration Point**:
- `src/coordination/v2/sdk/query-controller.ts` (resume)
- `src/coordination/v2/core/state-machine.ts` (state transition)

**Implementation**:
```typescript
// src/coordination/v2/help/helper-resume-service.ts
export class HelperResumeService {
  constructor(
    private queryController: QueryController,
    private stateMachine: StateMachine,
    private checkpointManager: CheckpointManager
  ) {}

  async resumeHelper(
    helper: HelperMetadata,
    request: HelpRequest
  ): Promise<void> {
    const startTime = performance.now();

    // 1. Create checkpoint before state change (preserves current context)
    const checkpointId = await this.checkpointManager.createCheckpoint(
      helper.sessionId,
      helper.agentId,
      `msg_${Date.now()}`,
      helper.state,
      { beforeHelping: true },
      {
        reason: `Helping ${request.requesterId}`,
        autoCheckpoint: true,
        context: { requestId: request.requestId }
      }
    );

    // 2. Transition state: IDLE/WAITING → HELPING
    await this.stateMachine.transition(
      helper.agentId,
      AgentState.HELPING,
      {
        metadata: {
          requestId: request.requestId,
          requesterId: request.requesterId,
          checkpointId
        }
      }
    );

    // 3. Resume agent if paused
    if (helper.state === AgentState.WAITING) {
      await this.queryController.resumeAgent(
        helper.agentId,
        checkpointId,
        checkpointId
      );
    }

    const latency = performance.now() - startTime;

    // Validation: <50ms resume
    if (latency > 50) {
      console.warn(`Helper resume exceeded 50ms: ${latency.toFixed(2)}ms`);
    }
  }

  async completeHelp(
    helperId: string,
    requestId: string,
    output: any
  ): Promise<void> {
    // Transition back: HELPING → WORKING
    await this.stateMachine.transition(
      helperId,
      AgentState.WORKING,
      {
        metadata: {
          completedHelpRequest: requestId,
          output
        }
      }
    );
  }
}
```

---

## 3. State Machine Integration

### 3.1 New Transitions

**WAITING → HELPING** (Agent receives help request while waiting):
```typescript
STATE_TRANSITIONS[AgentState.WAITING] = [
  AgentState.WORKING,
  AgentState.HELPING,  // NEW: Allow helping while waiting
  AgentState.BLOCKED,
  AgentState.PAUSED,
  AgentState.TERMINATED,
  AgentState.ERROR
];
```

**Event Mapping**:
```typescript
EVENT_STATE_MAPPING[TransitionEventType.HELP_REQUESTED] = {
  from: [AgentState.WORKING, AgentState.IDLE],
  to: AgentState.WAITING  // Requester waits for help
};

EVENT_STATE_MAPPING[TransitionEventType.HELP_ASSIGNED] = {
  from: [AgentState.IDLE, AgentState.WAITING],
  to: AgentState.HELPING  // Helper starts helping
};

EVENT_STATE_MAPPING[TransitionEventType.HELP_COMPLETED] = {
  from: [AgentState.HELPING],
  to: AgentState.WORKING  // Helper returns to work
};
```

### 3.2 State Metadata

**WAITING state metadata**:
```typescript
{
  state: AgentState.WAITING,
  metadata: {
    reason: 'waiting-for-help',
    helpRequestId: 'req_abc123',
    checkpointId: 'cp_xyz789',
    blocker: 'Missing authentication implementation'
  }
}
```

**HELPING state metadata**:
```typescript
{
  state: AgentState.HELPING,
  metadata: {
    requestId: 'req_abc123',
    requesterId: 'agent_requester',
    checkpointId: 'cp_helper_state',
    estimatedDuration: 30000
  }
}
```

---

## 4. Performance Targets & Validation

### 4.1 Latency Targets

| Metric | Target | Validation Method |
|--------|--------|-------------------|
| Help routing | <200ms | End-to-end request → acceptance |
| Capability matching | <100ms (p95) | Index query + ranking |
| Helper resume | <50ms | SDK pause → resume |
| State restoration | <500ms | Checkpoint restore |
| Agent pause | <5ms | QueryController.pauseAgent |

### 4.2 Throughput Targets

| Metric | Target | Validation Method |
|--------|--------|-------------------|
| Concurrent help requests | 50+ | Load test with 50 requests/sec |
| Helper pool size | 100+ agents | Index 100 agents, query <100ms |
| Message throughput | >8000 msg/sec | Reuse Phase 3 message broker benchmark |

### 4.3 Quality Targets

| Metric | Target | Validation Method |
|--------|--------|-------------------|
| Helper match accuracy | >90% | Capability match correctness |
| False positive rate | <5% | Helpers actually capable |
| Timeout handling | 100% | All timeouts handled gracefully |
| State consistency | 100% | No state corruption on resume |

---

## 5. Integration Points

### 5.1 Phase 1 (State Machine)

**Integration**:
- **StateMachine**: Add WAITING → HELPING transition
- **QueryController**: Use pause/resume for waiting pool
- **CheckpointManager**: Create checkpoints before state changes

**Changes Required**: Minimal (add transition, already supported)

### 5.2 Phase 3 (Message Bus)

**Integration**:
- **MessageBroker**: Use request/reply pattern for help requests
- **Topics**: `help.request.*`, `help.accepted.*`, `help.completed.*`
- **Priority**: HIGH for help requests

**Changes Required**: None (existing infrastructure)

### 5.3 Phase 5/6 (Coordinators)

**Integration**:
- **HierarchicalCoordinator**: Register helpers in CapabilityMatcher
- **MeshCoordinator**: Peer-to-peer help via direct messaging
- **Both**: Track agent capabilities during spawn

**Changes Required**: Add helper registration on agent spawn

---

## 6. Implementation Plan

### Week 7: Help System Implementation

**Day 1-2: Core Infrastructure** (16 hours)
- CapabilityMatcher with inverted index
- HelpRequestBus message handling
- Unit tests for capability matching

**Day 3-4: Waiting Pool & Resume** (16 hours)
- WaitingAgentPool implementation
- HelperResumeService implementation
- State machine transition additions
- Integration tests

**Day 5-6: Integration & Testing** (16 hours)
- Coordinator integration (helper registration)
- End-to-end help request flow
- Performance benchmarking
- Load testing

**Day 7: Validation & Documentation** (8 hours)
- Security audit (message validation)
- API documentation
- Migration guide
- Final approval

**Total Effort**: 56 hours (1 developer week)

---

## 7. File Structure

```
src/coordination/v2/help/
├── help-request-bus.ts               # NEW: Message routing
├── capability-matcher.ts             # NEW: Fast helper lookup
├── waiting-agent-pool.ts             # NEW: Paused agent management
├── helper-resume-service.ts          # NEW: Helper resume logic
├── help-types.ts                     # NEW: Type definitions
└── index.ts                          # NEW: Exports

src/coordination/v2/core/
├── state-machine-config.ts           # MODIFY: Add WAITING → HELPING
└── state-transition.ts               # MODIFY: Add help events

tests/coordination/v2/help/
├── unit/
│   ├── capability-matcher.test.ts    # NEW: Capability matching tests
│   ├── help-request-bus.test.ts      # NEW: Message handling tests
│   ├── waiting-agent-pool.test.ts    # NEW: Pool management tests
│   └── helper-resume.test.ts         # NEW: Resume logic tests
├── integration/
│   └── help-system-integration.test.ts # NEW: End-to-end tests
└── performance/
    └── help-system-performance.test.ts # NEW: Latency benchmarks
```

---

## 8. Risk Analysis

### Risk 1: Capability Matching Latency
**Impact**: Medium | **Probability**: Medium
**Mitigation**:
- Inverted index for O(1) capability lookup
- Pre-filter by state before ranking
- Limit ranking to top 10 candidates

### Risk 2: Stale Helper Metadata
**Impact**: Medium | **Probability**: Medium
**Mitigation**:
- Periodic index refresh (every 10s)
- Verify helper state before assignment
- Fallback to alternative helpers on failure

### Risk 3: Checkpoint Corruption
**Impact**: High | **Probability**: Low
**Mitigation**:
- Checksum validation before restore
- Multiple checkpoint retention
- Rollback to previous checkpoint on failure

### Risk 4: Message Delivery Failures
**Impact**: Medium | **Probability**: Low
**Mitigation**:
- Message broker at-least-once delivery (Phase 3)
- Timeout/retry on no response
- Dead letter queue for failed messages

---

## 9. Confidence Score

```json
{
  "agent": "system-architect",
  "confidence": 0.88,
  "reasoning": "Architecture leverages existing Phase 1-6 infrastructure (MessageBroker, QueryController, CheckpointManager, StateMachine) with minimal new code. Inverted index provides <100ms capability matching. SDK pause/resume enables zero-cost waiting. Checkpoint system supports <500ms restoration. State machine transition (WAITING → HELPING) is straightforward. Primary uncertainty: capability index scalability beyond 100 agents and potential for helper assignment conflicts under high concurrency.",
  "blockers": []
}
```

---

## 10. Next Steps

**Immediate** (Today):
1. Lead architect review
2. Phase 1-6 compatibility validation
3. Security review (message authentication)

**Implementation** (Week 7):
1. Build capability matcher with inverted index
2. Implement help request bus using MessageBroker
3. Create waiting pool with SDK pause integration
4. Add helper resume service
5. Integrate with coordinators
6. Performance validation

**Post-Implementation**:
1. Load testing (50+ concurrent requests)
2. Latency validation (all targets <200ms, <100ms, <50ms, <500ms)
3. Documentation (API reference, usage examples)
4. Production readiness review

---

**Architecture Status**: Ready for Implementation
**Dependencies**: Phases 1-6 Complete
**Confidence**: 88%
**Estimated Effort**: 56 developer hours
