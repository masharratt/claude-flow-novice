# Agent Coordination System V2

## Overview

This directory contains the complete architecture and technical specifications for the Agent Coordination System V2, which introduces human-team-inspired dynamics to claude-flow-novice agent coordination.

## Key Features

- **Agent State Machine**: Clear lifecycle states (idle → working → waiting → blocked → complete)
- **Dependency Resolution**: Active resolution through hierarchical or mesh coordination patterns
- **Waiting Mode**: Agents help others when their work is complete
- **Natural Completion**: Swarm completes when all agents waiting with no pending dependencies
- **Deadlock Detection**: Automatic cycle detection and resolution strategies

## Documents

### [ARCHITECTURE.md](./ARCHITECTURE.md)
Complete system architecture including:
- Core principles and design philosophy
- Agent lifecycle state machine with transition diagram
- Hierarchical vs Mesh coordination patterns
- Dependency resolution protocols
- Swarm completion detection algorithms
- Communication patterns and message bus design
- Deadlock detection and resolution
- Performance characteristics
- Migration path

### [TECHNICAL_SPECS.md](./TECHNICAL_SPECS.md)
Detailed technical specifications including:
- Data structures (AgentInstance, DependencyGraph, Message schemas)
- API contracts for all managers (Coordination, Dependency, StateMachine, MessageBus)
- Memory schema for SwarmMemory V2
- Performance requirements and scalability limits
- Complete implementation examples with code
- Testing strategy (unit, integration, performance)
- Migration and rollout plan

## Quick Start

### State Machine Example
```typescript
// Agent transitions from IDLE to WORKING when task assigned
await stateMachine.transition(agentId, AgentState.WORKING, 'Task assigned');

// Completes work, enters WAITING mode
await stateMachine.transition(agentId, AgentState.WAITING, 'Task complete');

// Available to help other agents
await coordinator.matchHelpRequest(helpRequest);
```

### Dependency Resolution (Hierarchical)
```typescript
// Agent requests dependency from PM/Coordinator
const request = {
  requesterId: 'agent-1',
  type: DependencyType.DATA,
  requirements: { dataType: 'api_schema' }
};

// PM finds provider and resolves
const providers = await depManager.findProviders(request);
await depManager.resolveDependency(dependencyId, {
  providerId: providers[0],
  data: schemaData
});
```

### Dependency Resolution (Mesh)
```typescript
// Agent broadcasts dependency need
await messageBus.broadcast('dependency_channel', {
  type: 'dependency_request',
  payload: { type: DependencyType.EXPERTISE, expertise: ['react'] }
});

// Waiting agent with matching capability responds directly
agent2.onMessage(request => {
  if (hasCapability(request.expertise)) {
    agent2.sendDirect(request.requesterId, { expertise: myKnowledge });
  }
});
```

### Completion Detection
```typescript
// Hierarchical: PM checks periodically
const complete = await coordinator.checkSwarmCompletion();
// Returns true when:
// - All agents in WAITING or COMPLETE state
// - No pending dependencies
// - Task queue empty

// Mesh: Distributed consensus
const complete = await agent.initiateCompletionCheck();
// Returns true when:
// - Local state is WAITING
// - All peers respond WAITING
// - 2-phase commit consensus achieved
```

## Coordination Patterns

### When to Use Hierarchical
- 8+ agents
- Complex workflows with many dependencies
- Need centralized oversight
- Prefer simpler agent logic
- Examples: Full-stack development, enterprise systems

### When to Use Mesh
- 2-7 agents
- Collaborative workflows
- Peer-to-peer interaction preferred
- Need fault tolerance
- Examples: Code review, research synthesis

## Performance Targets

| Metric | Hierarchical | Mesh |
|--------|-------------|------|
| State Transition | <100ms | <50ms |
| Dependency Resolution | <500ms | <500ms |
| Completion Detection | <1s | <2s |
| Max Agents | 50 | 10 |
| Messages/sec | 1000 | 500 |

## Implementation Phases

1. **Phase 1**: Core state machine (Week 1-2)
2. **Phase 2**: Dependency system (Week 3-4)
3. **Phase 3**: Message bus channels (Week 5-6)
4. **Phase 4**: Completion detection (Week 7-8)
5. **Phase 5**: Integration (Week 9-10)
6. **Phase 6**: Hardening (Week 11-12)

## Integration Points

Extends existing infrastructure:
- `src/coordination/swarm-coordinator.ts` - Enhanced with state machine
- `src/memory/swarm-memory.ts` - Stores dependency graph and state transitions
- `src/core/orchestrator.ts` - Orchestrates multi-agent workflows
- `src/mcp/swarm-tools.ts` - MCP integration for external control

## Next Steps

1. Review architecture and technical specs
2. Approve design decisions
3. Create implementation tickets from migration plan
4. Begin Phase 1 development
5. Set up testing infrastructure

## Contact

For questions or clarifications about this architecture, refer to the detailed diagrams and specifications in the individual documents.
