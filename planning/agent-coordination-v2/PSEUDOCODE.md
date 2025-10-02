# Agent Coordination System v2 - Comprehensive Pseudocode

**Version**: 2.0
**Date**: 2025-10-02
**Purpose**: Detailed pseudocode for agent waiting/helping/dependency coordination system

---

## Overview

This document provides comprehensive pseudocode for an agent coordination system where agents can:
- Transition between states: `working` → `waiting` → `helping` → `complete`
- Request dependencies from other agents
- Resolve dependencies in hierarchical (coordinator-routed) or mesh (peer-to-peer) modes
- Complete swarm when all agents are waiting with no pending dependencies

---

## Table of Contents

1. [Core Data Structures](#core-data-structures)
2. [Agent State Machine](#agent-state-machine)
3. [Dependency Management](#dependency-management)
4. [Hierarchical Coordination](#hierarchical-coordination)
5. [Mesh Coordination](#mesh-coordination)
6. [Swarm Completion Detection](#swarm-completion-detection)
7. [Message Flow Examples](#message-flow-examples)
8. [Concurrency & Race Conditions](#concurrency--race-conditions)

---

## Core Data Structures

### Agent State

```typescript
ENUM AgentState {
  IDLE,           // Not yet assigned work
  WORKING,        // Actively executing assigned task
  WAITING,        // Work complete, available to help others
  HELPING,        // Assisting another agent with dependency
  COMPLETE,       // All work done, no more help needed
  ERROR,          // Error state, requires intervention
  PAUSED          // Temporarily suspended
}

CLASS Agent {
  // Identity
  id: String
  type: String  // 'researcher', 'coder', 'reviewer', 'coordinator', etc.
  capabilities: Array<String>

  // State
  state: AgentState
  currentTask: Task?
  assignedWork: WorkItem?

  // Dependency tracking
  pendingDependencies: Map<DependencyID, DependencyRequest>
  providingHelp: Array<DependencyID>  // Dependencies this agent is fulfilling

  // Coordination
  coordinatorId: String?  // For hierarchical mode
  peers: Set<String>      // For mesh mode

  // Metrics
  metrics: {
    tasksCompleted: Integer
    dependenciesFulfilled: Integer
    averageResponseTime: Duration
    qualityScore: Float
    helpfulness: Float
  }

  // Communication
  messageQueue: Queue<Message>
  lastActivity: Timestamp
}
```

### Dependency Request

```typescript
CLASS DependencyRequest {
  id: String
  requesterId: String           // Agent requesting help
  requestedCapability: String   // What type of help is needed
  priority: Integer             // 1-5, higher = more urgent
  description: String
  context: Map<String, Any>     // Additional context data

  // State
  status: DependencyStatus
  assignedTo: String?           // Agent fulfilling this dependency
  createdAt: Timestamp
  assignedAt: Timestamp?
  resolvedAt: Timestamp?
  timeout: Duration

  // Resolution
  result: Any?
  error: Error?
}

ENUM DependencyStatus {
  PENDING,      // Waiting for someone to accept
  ASSIGNED,     // Agent has accepted, working on it
  RESOLVED,     // Completed successfully
  FAILED,       // Failed to resolve
  TIMEOUT,      // Exceeded timeout
  CANCELLED     // Requester cancelled
}
```

### Swarm State

```typescript
CLASS SwarmState {
  id: String
  topology: Topology  // MESH or HIERARCHICAL

  // Agents
  agents: Map<AgentID, Agent>
  coordinatorId: String?  // For hierarchical mode

  // Dependencies
  pendingDependencies: Map<DependencyID, DependencyRequest>
  resolvedDependencies: Map<DependencyID, DependencyRequest>

  // Completion tracking
  allAgentsWaiting: Boolean
  noPendingDependencies: Boolean
  swarmComplete: Boolean

  // Configuration
  config: {
    maxAgents: Integer
    dependencyTimeout: Duration
    coordinationStrategy: Strategy
    enableWorkStealing: Boolean
    maxHelpRequestsPerAgent: Integer
  }

  // Monitoring
  startTime: Timestamp
  completionTime: Timestamp?
  events: Array<CoordinationEvent>
}

ENUM Topology {
  MESH,          // Peer-to-peer, all agents communicate directly
  HIERARCHICAL   // Coordinator routes all dependency requests
}
```

---

## Agent State Machine

### Core State Transitions

```typescript
FUNCTION transitionAgentState(agent: Agent, newState: AgentState, reason: String) -> Void {
  // Validate transition is legal
  IF NOT isValidTransition(agent.state, newState) THEN
    THROW InvalidStateTransitionError(agent.state, newState)
  END IF

  oldState = agent.state
  agent.state = newState

  // Emit state change event for monitoring
  EMIT AgentStateChanged {
    agentId: agent.id,
    oldState: oldState,
    newState: newState,
    reason: reason,
    timestamp: NOW()
  }

  // Handle side effects of state transition
  MATCH newState {
    CASE WAITING:
      handleEnterWaitingMode(agent)
    CASE HELPING:
      handleEnterHelpingMode(agent)
    CASE COMPLETE:
      handleEnterCompleteMode(agent)
    DEFAULT:
      // No special handling needed
  }
}

FUNCTION isValidTransition(from: AgentState, to: AgentState) -> Boolean {
  // Define valid state transitions
  validTransitions = {
    IDLE:     [WORKING],
    WORKING:  [WAITING, ERROR, PAUSED],
    WAITING:  [HELPING, COMPLETE, WORKING],
    HELPING:  [WAITING, ERROR],
    PAUSED:   [WORKING],
    ERROR:    [WORKING],
    COMPLETE: []  // Terminal state
  }

  RETURN to IN validTransitions[from]
}
```

### Enter Waiting Mode

```typescript
FUNCTION handleEnterWaitingMode(agent: Agent) -> Void {
  // Agent has completed its assigned work but is available to help

  // Clear current task
  agent.currentTask = NULL

  // Notify swarm that agent is available
  EMIT AgentAvailable {
    agentId: agent.id,
    capabilities: agent.capabilities,
    timestamp: NOW()
  }

  // Check if swarm can complete
  checkSwarmCompletion()

  // Subscribe to dependency broadcasts (mesh mode)
  IF swarmState.topology == MESH THEN
    subscribeToDependencyBroadcasts(agent)
  END IF

  // Log availability
  LOG INFO "Agent ${agent.id} entered WAITING mode, available to help"
}
```

### Enter Helping Mode

```typescript
FUNCTION handleEnterHelpingMode(agent: Agent) -> Void {
  // Agent is now helping another agent with a dependency

  // Track that we're providing help
  agent.state = HELPING

  // Log help activity
  LOG INFO "Agent ${agent.id} entered HELPING mode"

  // Emit event for metrics
  EMIT AgentStartedHelping {
    agentId: agent.id,
    timestamp: NOW()
  }
}
```

### Complete Work

```typescript
FUNCTION completeAgentWork(agent: Agent, result: Any) -> Void {
  // Agent has finished its assigned work

  // Store result
  agent.assignedWork.result = result
  agent.assignedWork.completedAt = NOW()

  // Update metrics
  agent.metrics.tasksCompleted += 1

  // Check if agent has any pending dependencies
  IF agent.pendingDependencies.isEmpty() THEN
    // No dependencies, can enter waiting mode
    transitionAgentState(agent, WAITING, "Work completed, no pending dependencies")
  ELSE
    // Still waiting for dependencies, stay in WORKING state
    LOG INFO "Agent ${agent.id} completed work but waiting for ${agent.pendingDependencies.size()} dependencies"
  END IF
}
```

---

## Dependency Management

### Request Dependency

```typescript
FUNCTION requestDependency(
  requester: Agent,
  capability: String,
  description: String,
  context: Map<String, Any>,
  priority: Integer
) -> DependencyRequest {

  // Create dependency request
  dependency = NEW DependencyRequest {
    id: generateUniqueId(),
    requesterId: requester.id,
    requestedCapability: capability,
    priority: priority,
    description: description,
    context: context,
    status: PENDING,
    createdAt: NOW(),
    timeout: swarmState.config.dependencyTimeout
  }

  // Track locally
  requester.pendingDependencies.set(dependency.id, dependency)
  swarmState.pendingDependencies.set(dependency.id, dependency)

  // Emit dependency created event
  EMIT DependencyCreated {
    dependencyId: dependency.id,
    requesterId: requester.id,
    capability: capability,
    priority: priority,
    timestamp: NOW()
  }

  // Route based on topology
  IF swarmState.topology == HIERARCHICAL THEN
    routeDependencyThroughCoordinator(dependency)
  ELSE IF swarmState.topology == MESH THEN
    broadcastDependencyToAllPeers(dependency)
  END IF

  // Start timeout timer
  scheduleTimeout(dependency)

  RETURN dependency
}
```

### Fulfill Dependency

```typescript
FUNCTION fulfillDependency(helper: Agent, dependencyId: String) -> Void {
  // Agent volunteers to fulfill a dependency request

  dependency = swarmState.pendingDependencies.get(dependencyId)

  IF dependency == NULL THEN
    THROW DependencyNotFoundError(dependencyId)
  END IF

  IF dependency.status != PENDING THEN
    THROW DependencyAlreadyAssignedError(dependencyId)
  END IF

  // Verify agent has required capability
  IF NOT helper.capabilities.contains(dependency.requestedCapability) THEN
    THROW InsufficientCapabilityError(helper.id, dependency.requestedCapability)
  END IF

  // Assign dependency
  dependency.status = ASSIGNED
  dependency.assignedTo = helper.id
  dependency.assignedAt = NOW()

  // Track in helper's state
  helper.providingHelp.add(dependencyId)

  // Transition helper to HELPING state
  transitionAgentState(helper, HELPING, "Accepted dependency ${dependencyId}")

  // Notify requester
  requester = swarmState.agents.get(dependency.requesterId)
  sendMessage(requester, NEW Message {
    type: DEPENDENCY_ASSIGNED,
    from: helper.id,
    dependencyId: dependencyId,
    timestamp: NOW()
  })

  // Emit event
  EMIT DependencyAssigned {
    dependencyId: dependencyId,
    requesterId: dependency.requesterId,
    helperId: helper.id,
    timestamp: NOW()
  }

  // Begin work on dependency
  executeDependencyWork(helper, dependency)
}
```

### Resolve Dependency

```typescript
ASYNC FUNCTION resolveDependency(
  helper: Agent,
  dependencyId: String,
  result: Any
) -> Void {

  dependency = swarmState.pendingDependencies.get(dependencyId)

  IF dependency == NULL OR dependency.assignedTo != helper.id THEN
    THROW InvalidDependencyResolutionError(dependencyId, helper.id)
  END IF

  // Update dependency status
  dependency.status = RESOLVED
  dependency.result = result
  dependency.resolvedAt = NOW()

  // Move from pending to resolved
  swarmState.pendingDependencies.delete(dependencyId)
  swarmState.resolvedDependencies.set(dependencyId, dependency)

  // Update helper state
  helper.providingHelp.remove(dependencyId)
  helper.metrics.dependenciesFulfilled += 1

  // Notify requester
  requester = swarmState.agents.get(dependency.requesterId)
  sendMessage(requester, NEW Message {
    type: DEPENDENCY_RESOLVED,
    from: helper.id,
    dependencyId: dependencyId,
    result: result,
    timestamp: NOW()
  })

  // Remove from requester's pending list
  requester.pendingDependencies.delete(dependencyId)

  // Emit event
  EMIT DependencyResolved {
    dependencyId: dependencyId,
    requesterId: dependency.requesterId,
    helperId: helper.id,
    durationMs: dependency.resolvedAt - dependency.createdAt,
    timestamp: NOW()
  }

  // Transition helper back to WAITING if no more help being provided
  IF helper.providingHelp.isEmpty() THEN
    transitionAgentState(helper, WAITING, "Completed helping with dependency ${dependencyId}")
  END IF

  // Check if requester can now proceed
  IF requester.pendingDependencies.isEmpty() AND requester.state == WORKING THEN
    // Requester can now complete their work
    completeAgentWork(requester, requester.assignedWork.result)
  END IF

  // Check swarm completion
  checkSwarmCompletion()
}
```

### Dependency Timeout Handler

```typescript
FUNCTION scheduleTimeout(dependency: DependencyRequest) -> Void {
  // Schedule timeout check
  SCHEDULE_AFTER(dependency.timeout) {
    IF dependency.status == PENDING THEN
      handleDependencyTimeout(dependency)
    END IF
  }
}

FUNCTION handleDependencyTimeout(dependency: DependencyRequest) -> Void {
  // Dependency was not assigned/resolved in time

  dependency.status = TIMEOUT

  // Notify requester
  requester = swarmState.agents.get(dependency.requesterId)
  sendMessage(requester, NEW Message {
    type: DEPENDENCY_TIMEOUT,
    dependencyId: dependency.id,
    timestamp: NOW()
  })

  // Remove from pending
  swarmState.pendingDependencies.delete(dependency.id)
  requester.pendingDependencies.delete(dependency.id)

  // Emit event
  EMIT DependencyTimeout {
    dependencyId: dependency.id,
    requesterId: dependency.requesterId,
    capability: dependency.requestedCapability,
    timestamp: NOW()
  }

  // Escalate to coordinator or mark swarm as failed
  IF swarmState.topology == HIERARCHICAL THEN
    notifyCoordinatorOfTimeout(dependency)
  ELSE
    LOG WARNING "Dependency ${dependency.id} timed out in mesh topology"
  END IF
}
```

---

## Hierarchical Coordination

In hierarchical mode, a designated coordinator agent routes all dependency requests.

### Coordinator: Route Dependency

```typescript
FUNCTION routeDependencyThroughCoordinator(dependency: DependencyRequest) -> Void {
  // Send dependency request to coordinator

  coordinator = swarmState.agents.get(swarmState.coordinatorId)

  IF coordinator == NULL THEN
    THROW CoordinatorNotFoundError()
  END IF

  // Send message to coordinator
  sendMessage(coordinator, NEW Message {
    type: DEPENDENCY_REQUEST,
    from: dependency.requesterId,
    dependency: dependency,
    timestamp: NOW()
  })

  LOG INFO "Routed dependency ${dependency.id} to coordinator ${coordinator.id}"
}
```

### Coordinator: Handle Dependency Request

```typescript
FUNCTION coordinatorHandleDependencyRequest(
  coordinator: Agent,
  message: Message
) -> Void {

  dependency = message.dependency

  // Find best agent to handle this dependency
  candidateAgents = findAgentsWithCapability(dependency.requestedCapability)

  // Filter to only WAITING agents
  availableAgents = candidateAgents.filter(agent => agent.state == WAITING)

  IF availableAgents.isEmpty() THEN
    // No agents available, queue the dependency
    LOG WARNING "No available agents for dependency ${dependency.id}, queueing"
    // Dependency remains in PENDING state
    RETURN
  END IF

  // Select best agent using ranking algorithm
  selectedAgent = rankAndSelectAgent(availableAgents, dependency)

  // Route to selected agent
  sendMessage(selectedAgent, NEW Message {
    type: DEPENDENCY_ASSIGNMENT,
    from: coordinator.id,
    dependency: dependency,
    timestamp: NOW()
  })

  LOG INFO "Coordinator routed dependency ${dependency.id} to agent ${selectedAgent.id}"

  // Notify requester
  requester = swarmState.agents.get(dependency.requesterId)
  sendMessage(requester, NEW Message {
    type: DEPENDENCY_ROUTED,
    from: coordinator.id,
    dependencyId: dependency.id,
    assignedTo: selectedAgent.id,
    timestamp: NOW()
  })
}
```

### Agent Selection Algorithm

```typescript
FUNCTION rankAndSelectAgent(
  candidates: Array<Agent>,
  dependency: DependencyRequest
) -> Agent {

  // Score each candidate
  scores = MAP candidates TO (agent) => {
    score = 0.0

    // Factor 1: Quality score (40%)
    score += agent.metrics.qualityScore * 0.4

    // Factor 2: Helpfulness track record (30%)
    score += agent.metrics.helpfulness * 0.3

    // Factor 3: Current load (20% - prefer less busy)
    currentLoad = agent.providingHelp.size()
    loadPenalty = currentLoad / swarmState.config.maxHelpRequestsPerAgent
    score += (1.0 - loadPenalty) * 0.2

    // Factor 4: Response time (10% - prefer faster)
    avgTime = agent.metrics.averageResponseTime
    timeFactor = 1.0 / (1.0 + avgTime / 60000)  // Normalize by 1 minute
    score += timeFactor * 0.1

    RETURN (agent, score)
  }

  // Sort by score descending
  scores.sortBy(scoreDesc)

  // Return highest scoring agent
  RETURN scores[0].agent
}
```

### Hierarchical Message Flow

```
REQUESTER AGENT                COORDINATOR                HELPER AGENT
      |                              |                          |
      |--- DEPENDENCY_REQUEST ------>|                          |
      |                              |                          |
      |                              |--- DEPENDENCY_ASSIGN --->|
      |                              |                          |
      |<---- DEPENDENCY_ROUTED ------|                          |
      |                              |                          |
      |                              |                          | (working...)
      |                              |                          |
      |<---------------------- DEPENDENCY_RESOLVED --------------|
      |                              |                          |
      |--- DEPENDENCY_ACK ---------------------->-------------->|
      |                              |                          |
```

---

## Mesh Coordination

In mesh mode, agents broadcast dependency requests to all peers and volunteers respond.

### Broadcast Dependency

```typescript
FUNCTION broadcastDependencyToAllPeers(dependency: DependencyRequest) -> Void {
  // Send dependency request to all agents

  requester = swarmState.agents.get(dependency.requesterId)

  FOR EACH (agentId, agent) IN swarmState.agents {
    IF agentId == requester.id THEN
      CONTINUE  // Don't send to self
    END IF

    // Send broadcast message
    sendMessage(agent, NEW Message {
      type: DEPENDENCY_BROADCAST,
      from: requester.id,
      dependency: dependency,
      timestamp: NOW()
    })
  }

  LOG INFO "Broadcast dependency ${dependency.id} to ${swarmState.agents.size() - 1} peers"
}
```

### Agent: Handle Dependency Broadcast

```typescript
FUNCTION agentHandleDependencyBroadcast(
  agent: Agent,
  message: Message
) -> Void {

  dependency = message.dependency

  // Check if we can help
  canHelp = (
    agent.state == WAITING AND
    agent.capabilities.contains(dependency.requestedCapability) AND
    agent.providingHelp.size() < swarmState.config.maxHelpRequestsPerAgent
  )

  IF NOT canHelp THEN
    // Ignore this broadcast
    RETURN
  END IF

  // Calculate our suitability score
  suitabilityScore = calculateSuitability(agent, dependency)

  // Respond with offer after random backoff (prevents thundering herd)
  backoffMs = RANDOM(0, 500) + (1.0 - suitabilityScore) * 1000

  SCHEDULE_AFTER(backoffMs) {
    // Double-check dependency is still pending
    IF dependency.status == PENDING THEN
      offerToFulfillDependency(agent, dependency)
    END IF
  }
}
```

### Offer to Fulfill Dependency

```typescript
FUNCTION offerToFulfillDependency(agent: Agent, dependency: DependencyRequest) -> Void {
  // Send offer to requester

  requester = swarmState.agents.get(dependency.requesterId)

  sendMessage(requester, NEW Message {
    type: DEPENDENCY_OFFER,
    from: agent.id,
    dependencyId: dependency.id,
    suitabilityScore: calculateSuitability(agent, dependency),
    timestamp: NOW()
  })

  LOG INFO "Agent ${agent.id} offered to fulfill dependency ${dependency.id}"
}
```

### Requester: Accept Offer

```typescript
FUNCTION requesterHandleDependencyOffer(
  requester: Agent,
  message: Message
) -> Void {

  dependencyId = message.dependencyId
  offererId = message.from

  dependency = requester.pendingDependencies.get(dependencyId)

  IF dependency == NULL OR dependency.status != PENDING THEN
    // Dependency already assigned or resolved
    sendMessage(swarmState.agents.get(offererId), NEW Message {
      type: DEPENDENCY_OFFER_REJECTED,
      from: requester.id,
      dependencyId: dependencyId,
      reason: "Already assigned",
      timestamp: NOW()
    })
    RETURN
  END IF

  // Accept this offer
  dependency.status = ASSIGNED
  dependency.assignedTo = offererId
  dependency.assignedAt = NOW()

  // Notify the helper
  helper = swarmState.agents.get(offererId)
  sendMessage(helper, NEW Message {
    type: DEPENDENCY_OFFER_ACCEPTED,
    from: requester.id,
    dependencyId: dependencyId,
    timestamp: NOW()
  })

  // Update helper state
  fulfillDependency(helper, dependencyId)

  LOG INFO "Requester ${requester.id} accepted offer from ${offererId} for dependency ${dependencyId}"
}
```

### Mesh Message Flow

```
REQUESTER AGENT          AGENT 1 (BUSY)     AGENT 2 (WAITING)    AGENT 3 (WAITING)
      |                        |                   |                    |
      |--BROADCAST------------>|                   |                    |
      |--BROADCAST-------------------------->|                    |
      |--BROADCAST------------------------------------------->|
      |                        |                   |                    |
      |                        |         (evaluates offer)              |
      |                        |                   |         (evaluates offer)
      |                        |                   |                    |
      |<--------OFFER----------------------------|                    |
      |<--------OFFER--------------------------------------------------|
      |                        |                   |                    |
      |---ACCEPT_OFFER---------------------->|                    |
      |---REJECT_OFFER------------------------------------------------>|
      |                        |                   |                    |
      |                        |          (working...)                  |
      |                        |                   |                    |
      |<-----RESOLVED---------------------|                    |
      |                        |                   |                    |
```

---

## Swarm Completion Detection

### Main Completion Check

```typescript
FUNCTION checkSwarmCompletion() -> Void {
  // Check if swarm has completed all work

  allAgentsWaiting = TRUE
  noPendingDependencies = swarmState.pendingDependencies.isEmpty()

  FOR EACH (agentId, agent) IN swarmState.agents {
    IF agent.state != WAITING AND agent.state != COMPLETE THEN
      allAgentsWaiting = FALSE
      BREAK
    END IF
  }

  swarmState.allAgentsWaiting = allAgentsWaiting
  swarmState.noPendingDependencies = noPendingDependencies

  IF allAgentsWaiting AND noPendingDependencies THEN
    completeSwarm()
  ELSE
    LOG DEBUG "Swarm not complete: allWaiting=${allAgentsWaiting}, noPending=${noPendingDependencies}"
  END IF
}
```

### Complete Swarm

```typescript
FUNCTION completeSwarm() -> Void {
  // Mark all agents as complete

  FOR EACH (agentId, agent) IN swarmState.agents {
    IF agent.state == WAITING THEN
      transitionAgentState(agent, COMPLETE, "Swarm completed")
    END IF
  }

  swarmState.swarmComplete = TRUE
  swarmState.completionTime = NOW()

  // Calculate final metrics
  totalDuration = swarmState.completionTime - swarmState.startTime

  // Emit completion event
  EMIT SwarmCompleted {
    swarmId: swarmState.id,
    totalDuration: totalDuration,
    agentCount: swarmState.agents.size(),
    dependenciesResolved: swarmState.resolvedDependencies.size(),
    timestamp: NOW()
  }

  // Generate completion report
  report = generateSwarmReport(swarmState)

  LOG INFO "Swarm ${swarmState.id} completed in ${totalDuration}ms"
  LOG INFO report
}
```

### Swarm Report Generation

```typescript
FUNCTION generateSwarmReport(swarm: SwarmState) -> String {
  report = ""

  report += "=== SWARM COMPLETION REPORT ===\n"
  report += "Swarm ID: ${swarm.id}\n"
  report += "Topology: ${swarm.topology}\n"
  report += "Total Duration: ${swarm.completionTime - swarm.startTime}ms\n"
  report += "\n"

  report += "=== AGENT SUMMARY ===\n"
  FOR EACH (agentId, agent) IN swarm.agents {
    report += "Agent ${agent.id} (${agent.type}):\n"
    report += "  - Tasks Completed: ${agent.metrics.tasksCompleted}\n"
    report += "  - Dependencies Fulfilled: ${agent.metrics.dependenciesFulfilled}\n"
    report += "  - Quality Score: ${agent.metrics.qualityScore}\n"
    report += "\n"
  }

  report += "=== DEPENDENCY SUMMARY ===\n"
  report += "Total Dependencies Resolved: ${swarm.resolvedDependencies.size()}\n"

  // Calculate average dependency resolution time
  totalTime = 0
  FOR EACH (depId, dep) IN swarm.resolvedDependencies {
    totalTime += dep.resolvedAt - dep.createdAt
  }
  avgTime = totalTime / swarm.resolvedDependencies.size()
  report += "Average Resolution Time: ${avgTime}ms\n"

  RETURN report
}
```

---

## Message Flow Examples

### Example 1: Hierarchical - Frontend Needs Backend API

```
SCENARIO: Frontend agent needs API endpoint from Backend agent

Initial State:
- Frontend: WORKING
- Backend: WAITING
- Coordinator: ACTIVE

Step-by-step flow:

1. FRONTEND creates dependency request
   requestDependency(
     requester: Frontend,
     capability: "api-development",
     description: "Need POST /users endpoint",
     context: {schema: UserSchema},
     priority: 4
   )

2. FRONTEND → COORDINATOR
   Message {
     type: DEPENDENCY_REQUEST,
     from: "frontend-1",
     dependency: {
       id: "dep-001",
       capability: "api-development",
       description: "Need POST /users endpoint"
     }
   }

3. COORDINATOR evaluates available agents
   - Finds Backend agent (state=WAITING, capability=api-development)
   - Selects Backend based on quality score

4. COORDINATOR → BACKEND
   Message {
     type: DEPENDENCY_ASSIGNMENT,
     from: "coordinator-1",
     dependency: dep-001
   }

5. COORDINATOR → FRONTEND
   Message {
     type: DEPENDENCY_ROUTED,
     from: "coordinator-1",
     dependencyId: "dep-001",
     assignedTo: "backend-1"
   }

6. BACKEND transitions to HELPING
   - Begins implementing POST /users endpoint
   - Frontend remains in WORKING state

7. BACKEND completes implementation
   resolveDependency(
     helper: Backend,
     dependencyId: "dep-001",
     result: {
       endpoint: "POST /users",
       implementation: "users-controller.js",
       tests: "users.test.js"
     }
   )

8. BACKEND → FRONTEND
   Message {
     type: DEPENDENCY_RESOLVED,
     from: "backend-1",
     dependencyId: "dep-001",
     result: {...}
   }

9. BACKEND transitions back to WAITING
10. FRONTEND receives result, continues work
11. FRONTEND completes work, transitions to WAITING
12. Swarm completion check: Both agents WAITING, no pending dependencies
13. Swarm completes

Final State:
- Frontend: COMPLETE
- Backend: COMPLETE
- Coordinator: COMPLETE
```

### Example 2: Mesh - Multiple Agents Need Research

```
SCENARIO: Coder1 and Coder2 both need research on best practices

Initial State:
- Coder1: WORKING
- Coder2: WORKING
- Researcher: WAITING
- Reviewer: WAITING

Step-by-step flow:

1. CODER1 broadcasts dependency
   broadcastDependencyToAllPeers(dependency1: "research-best-practices-api")

2. BROADCAST → ALL PEERS
   - Researcher receives broadcast
   - Reviewer receives broadcast
   - Coder2 receives broadcast

3. RESEARCHER evaluates (has capability)
   - State: WAITING ✓
   - Capability: research ✓
   - Current load: 0 ✓
   - Suitability score: 0.95

4. REVIEWER evaluates (lacks capability)
   - Capability: research ✗
   - Ignores broadcast

5. CODER2 evaluates (has capability but busy)
   - State: WORKING ✗
   - Ignores broadcast

6. RESEARCHER → CODER1 (after 100ms backoff)
   Message {
     type: DEPENDENCY_OFFER,
     from: "researcher-1",
     dependencyId: "dep-002",
     suitabilityScore: 0.95
   }

7. CODER1 accepts offer
   CODER1 → RESEARCHER
   Message {
     type: DEPENDENCY_OFFER_ACCEPTED,
     from: "coder-1",
     dependencyId: "dep-002"
   }

8. RESEARCHER transitions to HELPING
   - Begins research on API best practices

9. Meanwhile, CODER2 broadcasts its own dependency
   broadcastDependencyToAllPeers(dependency2: "research-database-optimization")

10. REVIEWER evaluates (lacks research capability)
    - Ignores

11. RESEARCHER evaluates (already helping Coder1)
    - Current load: 1 (but below max)
    - Can help: TRUE
    - Suitability: 0.80 (slightly lower due to load)

12. RESEARCHER → CODER2
    Message {
      type: DEPENDENCY_OFFER,
      from: "researcher-1",
      dependencyId: "dep-003",
      suitabilityScore: 0.80
    }

13. CODER2 accepts

14. RESEARCHER now helping both (load=2)
    - Works on both research tasks

15. RESEARCHER completes first research (for Coder1)
    - Resolves dep-002
    - RESEARCHER → CODER1: DEPENDENCY_RESOLVED
    - Load decreases to 1

16. RESEARCHER completes second research (for Coder2)
    - Resolves dep-003
    - RESEARCHER → CODER2: DEPENDENCY_RESOLVED
    - Load decreases to 0
    - Transitions back to WAITING

17. CODER1 and CODER2 complete their work
    - Both transition to WAITING

18. Swarm completion check
    - All agents WAITING ✓
    - No pending dependencies ✓
    - Swarm completes

Final State:
- Coder1: COMPLETE
- Coder2: COMPLETE
- Researcher: COMPLETE (fulfilled 2 dependencies)
- Reviewer: COMPLETE (was not needed)
```

---

## Concurrency & Race Conditions

### Race Condition 1: Multiple Offers for Same Dependency

```typescript
PROBLEM: In mesh mode, multiple agents may offer to fulfill the same dependency

SOLUTION: First-accepted-wins with rejection notifications

FUNCTION requesterHandleDependencyOffer(requester: Agent, message: Message) -> Void {
  // Atomic check-and-set
  LOCK requester.pendingDependencies {
    dependency = requester.pendingDependencies.get(message.dependencyId)

    IF dependency.status != PENDING THEN
      // Already assigned, reject this offer
      sendRejectionMessage(message.from, dependency.id)
      RETURN
    END IF

    // Accept this offer atomically
    dependency.status = ASSIGNED
    dependency.assignedTo = message.from
  }

  // Continue with acceptance logic
}
```

### Race Condition 2: Agent State Transitions

```typescript
PROBLEM: Agent might receive multiple requests while transitioning states

SOLUTION: Use atomic state machine with queued transitions

CLASS Agent {
  private stateLock: Mutex
  private transitionQueue: Queue<StateTransition>

  FUNCTION transitionState(newState: AgentState, reason: String) -> Void {
    LOCK stateLock {
      IF NOT isValidTransition(this.state, newState) THEN
        THROW InvalidTransitionError
      END IF

      this.state = newState
      this.lastActivity = NOW()
    }

    // Process any queued transitions
    processTransitionQueue()
  }
}
```

### Race Condition 3: Swarm Completion Detection

```typescript
PROBLEM: Final agent might transition to WAITING while dependency is being resolved

SOLUTION: Double-check mechanism with eventual consistency

FUNCTION checkSwarmCompletion() -> Void {
  // Use snapshot of current state
  snapshot = captureSwarmStateSnapshot()

  IF NOT preliminaryCompletionCheck(snapshot) THEN
    RETURN  // Not ready
  END IF

  // Wait for pending operations to settle
  DELAY 100ms

  // Double-check with fresh snapshot
  finalSnapshot = captureSwarmStateSnapshot()

  IF confirmedCompletion(finalSnapshot) THEN
    completeSwarm()
  END IF
}

FUNCTION confirmedCompletion(snapshot: SwarmSnapshot) -> Boolean {
  // Stricter check with all invariants
  RETURN (
    snapshot.allAgentsInWaitingOrComplete AND
    snapshot.noPendingDependencies AND
    snapshot.noInFlightMessages AND
    snapshot.noActiveStateTransitions
  )
}
```

### Deadlock Prevention

```typescript
PROBLEM: Circular dependencies (A waits for B, B waits for A)

SOLUTION: Dependency graph analysis and timeout mechanisms

FUNCTION requestDependency(...) -> DependencyRequest {
  // Before creating dependency, check for cycles

  wouldCreateCycle = detectDependencyCycle(
    requester.id,
    targetCapability
  )

  IF wouldCreateCycle THEN
    THROW CircularDependencyError("Requesting ${targetCapability} would create dependency cycle")
  END IF

  // Proceed with dependency creation
}

FUNCTION detectDependencyCycle(
  requesterId: String,
  targetCapability: String
) -> Boolean {

  // Build dependency graph
  graph = buildDependencyGraph(swarmState)

  // Find agents with target capability
  targetAgents = findAgentsWithCapability(targetCapability)

  FOR EACH targetAgent IN targetAgents {
    // Check if target has pending dependency that could route back to requester
    IF hasPathInGraph(graph, targetAgent.id, requesterId) THEN
      RETURN TRUE  // Cycle detected
    END IF
  }

  RETURN FALSE
}
```

---

## Advanced Patterns

### Work Stealing

```typescript
FUNCTION enableWorkStealing(swarm: SwarmState) -> Void {
  // Periodically check for load imbalance

  INTERVAL_EVERY 5000ms {
    IF NOT swarm.config.enableWorkStealing THEN
      RETURN
    END IF

    // Calculate load across agents
    loads = MAP swarmState.agents TO (agent) => {
      RETURN (agent.id, agent.providingHelp.size())
    }

    // Find overloaded and idle agents
    maxLoad = MAX(loads.values())
    minLoad = MIN(loads.values())

    IF maxLoad - minLoad >= 2 THEN
      // Significant imbalance, attempt work stealing
      overloadedAgent = loads.findMax().agent
      idleAgent = loads.findMin().agent

      // Try to reassign one dependency
      stealableWork = overloadedAgent.providingHelp.first()

      IF canReassign(stealableWork, overloadedAgent, idleAgent) THEN
        reassignDependency(stealableWork, overloadedAgent, idleAgent)
      END IF
    END IF
  }
}
```

### Priority Queue for Dependencies

```typescript
CLASS PriorityDependencyQueue {
  private queues: Map<Priority, Queue<DependencyRequest>>

  FUNCTION enqueue(dependency: DependencyRequest) -> Void {
    queue = queues.get(dependency.priority)
    queue.add(dependency)

    // Emit alert for high-priority items
    IF dependency.priority >= 4 THEN
      EMIT HighPriorityDependency {
        dependencyId: dependency.id,
        priority: dependency.priority,
        capability: dependency.requestedCapability
      }
    END IF
  }

  FUNCTION dequeue() -> DependencyRequest? {
    // Always take highest priority first
    FOR priority IN [5, 4, 3, 2, 1] {
      queue = queues.get(priority)
      IF NOT queue.isEmpty() THEN
        RETURN queue.remove()
      END IF
    }
    RETURN NULL
  }
}
```

### Agent Health Monitoring

```typescript
FUNCTION monitorAgentHealth(agent: Agent) -> Void {
  // Detect stuck or unresponsive agents

  timeSinceLastActivity = NOW() - agent.lastActivity

  IF timeSinceLastActivity > 60000 THEN  // 1 minute
    LOG WARNING "Agent ${agent.id} appears stuck (no activity for 60s)"

    // Attempt to recover
    IF agent.state == HELPING THEN
      // Cancel help and reassign
      cancelHelpAndReassign(agent)
    ELSE IF agent.state == WORKING THEN
      // Pause and investigate
      transitionAgentState(agent, PAUSED, "Health check: appears stuck")
    END IF
  END IF

  // Check for error patterns
  IF agent.metrics.tasksFailed / agent.metrics.tasksCompleted > 0.3 THEN
    LOG ERROR "Agent ${agent.id} has high failure rate (>30%)"
    // Potentially remove from swarm or reduce assignments
  END IF
}
```

---

## Configuration Recommendations

### Small Swarms (2-5 agents)

```typescript
recommendedConfig = {
  topology: MESH,
  maxAgents: 5,
  dependencyTimeout: 30000,  // 30 seconds
  coordinationStrategy: "peer-to-peer",
  enableWorkStealing: false,
  maxHelpRequestsPerAgent: 2
}
```

### Medium Swarms (6-12 agents)

```typescript
recommendedConfig = {
  topology: HIERARCHICAL,
  maxAgents: 12,
  dependencyTimeout: 60000,  // 1 minute
  coordinationStrategy: "coordinator-led",
  enableWorkStealing: true,
  maxHelpRequestsPerAgent: 3
}
```

### Large Swarms (13+ agents)

```typescript
recommendedConfig = {
  topology: HIERARCHICAL,
  maxAgents: 20,
  dependencyTimeout: 120000,  // 2 minutes
  coordinationStrategy: "multi-coordinator",  // Multiple coordinators for subsections
  enableWorkStealing: true,
  maxHelpRequestsPerAgent: 4
}
```

---

## Implementation Notes

### TypeScript/Async Patterns

```typescript
// Use async/await for all I/O operations
ASYNC FUNCTION resolveDependency(helper: Agent, depId: String, result: Any) -> Void {
  // All message sends should be async
  AWAIT sendMessageAsync(requester, message)

  // State updates should be wrapped in transactions
  AWAIT updateStateTransactionally(helper, WAITING)

  // Event emissions can be fire-and-forget
  emitEvent('dependency:resolved', eventData)
}

// Use Promise.race for timeout handling
ASYNC FUNCTION waitForDependencyWithTimeout(depId: String, timeout: Number) -> Any {
  result = AWAIT Promise.race([
    waitForDependency(depId),
    sleepThenThrow(timeout, NEW TimeoutError())
  ])
  RETURN result
}

// Use event emitters for decoupled communication
CLASS SwarmCoordinator EXTENDS EventEmitter {
  // Components subscribe to events
  this.on('dependency:created', handleDependencyCreated)
  this.on('agent:state-changed', handleAgentStateChange)
  this.on('swarm:complete', handleSwarmComplete)
}
```

### Database Persistence

```typescript
// Persist swarm state for recovery
ASYNC FUNCTION persistSwarmState(swarm: SwarmState) -> Void {
  snapshot = {
    swarmId: swarm.id,
    topology: swarm.topology,
    agents: serializeAgents(swarm.agents),
    pendingDependencies: serializeDependencies(swarm.pendingDependencies),
    timestamp: NOW()
  }

  AWAIT database.insert('swarm_snapshots', snapshot)
}

// Recover from crash
ASYNC FUNCTION recoverSwarmState(swarmId: String) -> SwarmState {
  snapshot = AWAIT database.query('swarm_snapshots')
    .where('swarmId', swarmId)
    .orderBy('timestamp', 'DESC')
    .first()

  IF snapshot == NULL THEN
    THROW SwarmNotFoundError(swarmId)
  END IF

  swarm = deserializeSwarmState(snapshot)
  RETURN swarm
}
```

---

## Testing Strategy

### Unit Tests

```typescript
TEST "Agent transitions from WORKING to WAITING on work completion" {
  agent = createAgent(state: WORKING)

  completeAgentWork(agent, result: {success: true})

  ASSERT agent.state == WAITING
  ASSERT agent.currentTask == NULL
}

TEST "Dependency request routes through coordinator in hierarchical mode" {
  swarm = createSwarm(topology: HIERARCHICAL)
  coordinator = swarm.agents.get(swarm.coordinatorId)
  requester = createAgent()

  MOCK sendMessage

  requestDependency(requester, "api-development", "Need endpoint", {}, 3)

  ASSERT sendMessage.calledWith(coordinator, {type: DEPENDENCY_REQUEST})
}
```

### Integration Tests

```typescript
TEST "Complete workflow: request -> assign -> resolve -> complete" {
  swarm = createSwarm(topology: MESH)
  requester = addAgent(swarm, capabilities: ["frontend"])
  helper = addAgent(swarm, capabilities: ["backend"])

  // Requester creates dependency
  dep = requestDependency(requester, "backend", "API needed", {}, 4)

  // Helper offers
  offerToFulfillDependency(helper, dep)

  // Requester accepts
  SIMULATE_MESSAGE(requester, {type: DEPENDENCY_OFFER, from: helper.id})

  // Helper resolves
  resolveDependency(helper, dep.id, {api: "created"})

  // Assert final states
  ASSERT dep.status == RESOLVED
  ASSERT helper.state == WAITING
  ASSERT requester.pendingDependencies.isEmpty()
}
```

### Chaos Testing

```typescript
TEST "Swarm handles agent failures gracefully" {
  swarm = createSwarm(topology: HIERARCHICAL, maxAgents: 10)

  // Start workflow
  startWorkflow(swarm, task: complexTask)

  // Kill random agents during execution
  FOR i IN 1..3 {
    SLEEP RANDOM(1000, 5000)
    randomAgent = selectRandom(swarm.agents)
    killAgent(randomAgent)
  }

  // Swarm should recover and complete
  result = AWAIT swarmCompletion(timeout: 60000)

  ASSERT result.success == TRUE
  ASSERT result.byzantineVerified == TRUE
}
```

---

## Performance Considerations

### Memory Management

```typescript
// Cleanup resolved dependencies after completion
FUNCTION cleanupResolvedDependencies(swarm: SwarmState) -> Void {
  cutoffTime = NOW() - (60 * 60 * 1000)  // Keep 1 hour of history

  toDelete = []
  FOR EACH (depId, dep) IN swarm.resolvedDependencies {
    IF dep.resolvedAt < cutoffTime THEN
      toDelete.add(depId)
    END IF
  }

  FOR EACH depId IN toDelete {
    swarm.resolvedDependencies.delete(depId)
  }
}
```

### Message Batching

```typescript
// Batch multiple messages to same agent
CLASS MessageBatcher {
  private batches: Map<AgentID, Array<Message>>
  private flushTimer: NodeJS.Timeout

  FUNCTION queueMessage(agentId: String, message: Message) -> Void {
    batch = batches.get(agentId) OR []
    batch.add(message)
    batches.set(agentId, batch)

    // Auto-flush after 100ms
    IF NOT flushTimer THEN
      flushTimer = SCHEDULE_AFTER(100ms) {
        flushAllBatches()
      }
    END IF
  }

  FUNCTION flushAllBatches() -> Void {
    FOR EACH (agentId, messages) IN batches {
      sendBatchedMessages(agentId, messages)
    }
    batches.clear()
    flushTimer = NULL
  }
}
```

---

## Conclusion

This pseudocode provides a comprehensive blueprint for implementing an agent coordination system with:

- **Flexible state management**: Agents transition through well-defined states
- **Dual coordination modes**: Hierarchical (coordinator-led) and Mesh (peer-to-peer)
- **Robust dependency handling**: Request, route, fulfill, resolve with timeout protection
- **Automatic completion detection**: Swarm completes when all agents waiting with no pending work
- **Race condition handling**: Atomic operations and lock-free data structures
- **Production-ready patterns**: Work stealing, priority queues, health monitoring

The system is designed for TypeScript/Node.js implementation with async/await patterns, event-driven architecture, and Byzantine fault tolerance for production use.

---

**Next Steps**:
1. Implement core state machine in TypeScript
2. Add message routing layer (EventEmitter-based)
3. Implement coordinator and mesh modes
4. Add persistence layer (SQLite/PostgreSQL)
5. Build monitoring dashboard
6. Write comprehensive test suite
7. Deploy with Kubernetes for scaling
