# PHASE 05: Hierarchical Coordination + Nested Agent Control

**Duration**: Week 5
**Phase Type**: Coordination Pattern
**Dependencies**: PHASE_04_COMPLETION_DETECTION (completion detection operational)
**Next Phase**: PHASE_06_MESH_COORDINATION

---

## Overview

Implement hierarchical coordination pattern (Project Manager-based) with SDK session forking for multi-level agent hierarchies. Enable Level 0 coordinator (Claude Code chat) to control all nested levels via pause/inject/resume, and implement background bash process orchestration for child agent monitoring.

## Success Criteria

### Numerical Thresholds
- [ ] **Agent Spawn Time**: <2s for 10 hierarchical agents across multiple levels
  - Measured via: Session forking benchmark with nested hierarchy
  - Target: <2s total for complete hierarchy creation
- [ ] **Parent Control Latency**: Parent can pause any child at any level
  - Measured via: Multi-level pause/inject/resume tests
  - Target: <100ms latency for parent control operations
- [ ] **Nested Hierarchy Depth**: Support 10+ nested agent levels
  - Measured via: Deep hierarchy integration tests
  - Target: 100% success rate for 10+ level hierarchies
- [ ] **Background Process Detection**: Detect child failures within 500ms
  - Measured via: BashOutput monitoring performance tests
  - Target: <500ms detection latency for child process failures
- [ ] **Checkpoint Recovery**: <500ms for nested hierarchy recovery
  - Measured via: Checkpoint recovery benchmark
  - Target: <500ms (p99) for full hierarchy restoration
- [ ] **Cascading Shutdown Time**: Graceful termination across all levels
  - Measured via: Shutdown performance tests
  - Target: <1s for complete hierarchy shutdown (20 agents)

### Binary Completion Checklist
- [ ] `src/coordination/v2/coordinators/hierarchical-coordinator.ts` implemented
- [ ] Parent-child agent relationship management operational
- [ ] Hierarchical completion detection integration complete
- [ ] Task delegation workflows (PM → workers) functional
- [ ] Hierarchical state propagation (parent → children) working
- [ ] Resource allocation in hierarchical topology implemented
- [ ] Level 0 coordinator in Claude Code chat operational (supervisor role)
- [ ] SDK session forking for hierarchical agent spawning enabled
- [ ] Background bash process orchestration for child agents working
- [ ] BashOutput monitoring for all child levels (Level 1-N) operational
- [ ] Pause/inject/resume from Level 0 to any child level validated
- [ ] Cascading shutdown for graceful hierarchical termination tested

## Developer Assignments

### Developer 1 (Lead)
**Responsibilities**:
- Design hierarchical coordinator architecture (PM-based pattern)
- Implement parent-child relationship management system
- Build Level 0 coordinator in Claude Code chat (supervisor)
- Integrate SDK session forking for hierarchical agent spawning

**Files Owned**:
- `src/coordination/v2/coordinators/hierarchical-coordinator.ts`
- Parent-child relationship manager
- Level 0 coordinator implementation
- Session forking integration

### Developer 2
**Responsibilities**:
- Integrate hierarchical completion detection from PHASE_04
- Build task delegation workflows (PM delegates to workers)
- Implement background bash process orchestration for child agents
- Create BashOutput monitoring for all child levels (Level 1-N)

**Files Owned**:
- Hierarchical completion integration
- Task delegation system
- Background bash orchestrator
- BashOutput monitoring system

### Developer 3
**Responsibilities**:
- Implement hierarchical state propagation (parent → children)
- Build resource allocation system for hierarchical topology
- Enable pause/inject/resume from Level 0 (parent controls all children)
- Implement cascading shutdown for graceful hierarchical termination

**Files Owned**:
- State propagation system
- Resource allocator
- Pause/inject/resume control
- Cascading shutdown coordinator

### SDK Specialist
**Responsibilities**:
- Build multi-level hierarchy coordinator (10+ depth support)
- Implement nested agent control via query interrupt and resume
- Enable parent checkpoint triggers child checkpoints
- Create background process lifecycle management system

**Files Owned**:
- Multi-level hierarchy coordinator
- Nested agent control system
- Checkpoint cascading logic
- Background process lifecycle manager

## Technical Implementation Details

### Hierarchical Coordinator Architecture
```typescript
// PM-based hierarchical coordination
class HierarchicalCoordinator {
  private pm: Agent; // Project Manager (Level 0 or 1)
  private workers: Map<string, Agent>; // Worker agents (children)
  private sessionManager: SessionManager;
  private queryController: QueryController;

  async initialize(swarmId: string, config: HierarchicalConfig): Promise<void> {
    // Create PM agent at Level 0 (Claude Code chat) or Level 1 (background)
    this.pm = await this.createPM(swarmId, config.pmType);

    // Fork worker sessions from PM session (pointer-based context sharing)
    this.workers = await this.forkWorkers(this.pm, config.workerCount);

    // Establish parent-child relationships
    for (const [workerId, worker] of this.workers) {
      this.setParent(worker.id, this.pm.id);
    }
  }

  private async forkWorkers(pm: Agent, count: number): Promise<Map<string, Agent>> {
    // Session forking for parallel worker spawning (<2s for 10 workers)
    const workers = await Promise.all(
      Array.from({ length: count }, (_, i) =>
        this.sessionManager.forkSession(pm.id, {
          agentType: 'worker',
          workerId: `worker_${i}`,
          parentId: pm.id
        })
      )
    );

    return new Map(workers.map((worker, i) => [`worker_${i}`, worker]));
  }

  async delegateTask(workerId: string, task: Task): Promise<void> {
    // PM delegates task to worker
    const worker = this.workers.get(workerId);
    if (!worker) throw new Error(`Worker ${workerId} not found`);

    // Pause worker before injecting task (prevents token waste)
    await this.queryController.pauseAgent(worker.id);

    // Inject task message into worker session
    await this.sessionManager.injectMessage(worker.id, {
      type: 'task_assignment',
      task,
      senderId: this.pm.id
    });

    // Resume worker to process task
    await this.queryController.resumeAgent(worker.id);
  }
}
```

### Multi-Level Hierarchy (Nested Agents)
```typescript
// Support 10+ nested levels
class MultiLevelHierarchy {
  async createNestedHierarchy(
    rootId: string,
    depth: number,
    branchingFactor: number
  ): Promise<Agent[]> {
    const agents: Agent[] = [];
    const queue: Array<{ agentId: string; level: number }> = [
      { agentId: rootId, level: 0 }
    ];

    while (queue.length > 0) {
      const { agentId, level } = queue.shift()!;

      // Stop at target depth
      if (level >= depth) continue;

      // Fork child agents from current agent
      const children = await Promise.all(
        Array.from({ length: branchingFactor }, (_, i) =>
          this.sessionManager.forkSession(agentId, {
            agentType: 'nested_agent',
            parentId: agentId,
            level: level + 1,
            childIndex: i
          })
        )
      );

      agents.push(...children);

      // Add children to queue for next level
      children.forEach(child =>
        queue.push({ agentId: child.id, level: level + 1 })
      );
    }

    return agents;
  }
}
```

### Parent Control System (Level 0 → Level N)
```typescript
// Level 0 coordinator controls all nested levels
class ParentControlSystem {
  async pauseChild(parentId: string, childId: string): Promise<void> {
    // Parent can pause any child at any level
    await this.queryController.pauseAgent(childId);

    // Create checkpoint for child state preservation
    await this.checkpointManager.createCheckpoint(
      childId,
      `paused_by_parent_${parentId}`
    );
  }

  async injectMessageToChild(
    parentId: string,
    childId: string,
    message: any
  ): Promise<void> {
    // Parent can inject messages into child sessions
    await this.sessionManager.injectMessage(childId, {
      ...message,
      injectedBy: parentId,
      timestamp: Date.now()
    });
  }

  async resumeChild(
    parentId: string,
    childId: string,
    checkpointId?: string
  ): Promise<void> {
    // Parent can resume child from checkpoint or current state
    if (checkpointId) {
      await this.checkpointManager.restoreCheckpoint(childId, checkpointId);
    }

    await this.queryController.resumeAgent(childId);
  }

  async cascadeControl(
    parentId: string,
    operation: 'pause' | 'resume' | 'shutdown'
  ): Promise<void> {
    // Cascade control operation from parent to all descendants
    const descendants = await this.getAllDescendants(parentId);

    for (const descendant of descendants) {
      switch (operation) {
        case 'pause':
          await this.pauseChild(parentId, descendant.id);
          break;
        case 'resume':
          await this.resumeChild(parentId, descendant.id);
          break;
        case 'shutdown':
          await this.sessionManager.closeSession(descendant.id);
          break;
      }
    }
  }
}
```

### Background Process Orchestration
```typescript
// Background bash process orchestration for child agents (Level 1-N)
class BackgroundProcessOrchestrator {
  async spawnBackgroundAgent(
    parentId: string,
    agentConfig: AgentConfig
  ): Promise<Agent> {
    // Spawn agent as background bash process
    const command = this.buildBackgroundCommand(agentConfig);

    // Start background process
    const process = await this.bash.runInBackground(command);

    // Create SDK session for background agent
    const session = await this.sessionManager.createSession({
      agentId: agentConfig.id,
      parentId,
      processId: process.pid,
      level: agentConfig.level
    });

    // Monitor via BashOutput
    this.bashOutputMonitor.startMonitoring(process.pid, session.id);

    return { id: agentConfig.id, sessionId: session.id, processId: process.pid };
  }

  private buildBackgroundCommand(config: AgentConfig): string {
    // Build bash command to spawn agent in background
    return `
      claude-code sdk start-session \\
        --session-id ${config.id} \\
        --parent-id ${config.parentId} \\
        --agent-type ${config.agentType} \\
        --level ${config.level} \\
        > /tmp/agent_${config.id}.log 2>&1 &
    `;
  }
}
```

### BashOutput Monitoring System
```typescript
// Monitor all child levels via BashOutput
class BashOutputMonitor {
  private monitors: Map<number, NodeJS.Timeout>;

  startMonitoring(pid: number, sessionId: string): void {
    // Poll BashOutput for process status
    const interval = setInterval(async () => {
      const output = await this.bash.getOutput(pid);

      // Parse output for completion, errors, or hangs
      if (output.includes('COMPLETED')) {
        await this.handleCompletion(sessionId);
        this.stopMonitoring(pid);
      } else if (output.includes('ERROR')) {
        await this.handleError(sessionId, output);
      } else if (this.isHanging(output)) {
        await this.handleHang(sessionId);
      }
    }, 500); // 500ms detection latency

    this.monitors.set(pid, interval);
  }

  stopMonitoring(pid: number): void {
    const interval = this.monitors.get(pid);
    if (interval) {
      clearInterval(interval);
      this.monitors.delete(pid);
    }
  }

  private async handleCompletion(sessionId: string): Promise<void> {
    // Notify parent of child completion
    await this.sessionManager.emitEvent('child_completed', { sessionId });
  }

  private async handleError(sessionId: string, output: string): Promise<void> {
    // Create checkpoint before error handling
    await this.checkpointManager.createCheckpoint(sessionId, 'error_state');

    // Notify parent of error
    await this.sessionManager.emitEvent('child_error', { sessionId, output });
  }

  private async handleHang(sessionId: string): Promise<void> {
    // Pause hanging agent and notify parent
    await this.queryController.pauseAgent(sessionId);
    await this.sessionManager.emitEvent('child_hanging', { sessionId });
  }
}
```

### Cascading Shutdown
```typescript
// Graceful shutdown from root to leaves
class CascadingShutdown {
  async shutdown(rootId: string): Promise<void> {
    // DFS traversal for shutdown (leaves first)
    await this.shutdownDescendants(rootId);

    // Finally shutdown root
    await this.sessionManager.closeSession(rootId);
  }

  private async shutdownDescendants(agentId: string): Promise<void> {
    const children = await this.getChildren(agentId);

    // Shutdown children first (recursive)
    await Promise.all(
      children.map(child => this.shutdownDescendants(child.id))
    );

    // Then shutdown current agent
    await this.sessionManager.closeSession(agentId);

    // Clean up background process if exists
    const agent = await this.getAgent(agentId);
    if (agent.processId) {
      await this.bash.killProcess(agent.processId);
    }
  }
}
```

## Risk Mitigation Strategies

### Risk 1: Deep Hierarchy Performance Degradation
**Probability**: Medium
**Impact**: Medium

**Mitigation**:
- Performance testing with 10+ levels early (Week 5, Day 2-3)
- Pointer-based context sharing (no duplication across levels)
- Lazy loading for deep descendants (only load when needed)
- Level depth limits configurable (default max 15 levels)

### Risk 2: Background Process Monitoring Failures
**Probability**: Medium
**Impact**: High (child failures undetected)

**Mitigation**:
- BashOutput monitoring every 500ms
- Heartbeat system for active agents
- Auto-restart on child process crashes
- Parent notification on all child failures

### Risk 3: Cascading Shutdown Bugs
**Probability**: Low
**Impact**: High (orphaned processes)

**Mitigation**:
- DFS shutdown order (leaves first, then root)
- Process tracking with cleanup verification
- Timeout mechanisms for unresponsive children
- Force kill fallback after 30s graceful shutdown attempt

### Risk 4: Parent Control Latency Issues
**Probability**: Low
**Impact**: Medium

**Mitigation**:
- Query controller performance <100ms (budgeted)
- Parallel control operations across siblings
- Async pause/resume (non-blocking)
- Control operation caching for frequently used patterns

## Integration Points

### With Previous Phases
- **PHASE_01 (State Machine)**: Hierarchical state propagation
- **PHASE_02 (Dependency Graph)**: Dependency resolution across levels
- **PHASE_03 (Message Bus)**: Parent-child messaging via task channel
- **PHASE_04 (Completion Detection)**: Hierarchical completion detector used

### With Future Phases
- **PHASE_07 (Help System)**: Workers request help from PM or siblings
- **PHASE_08 (Deadlock Detection)**: Hierarchical deadlock detection

### With SDK Foundation (PHASE_00)
- Session forking for parallel worker spawning
- Query controller for parent control (pause/inject/resume)
- Checkpoint manager for hierarchical state snapshots
- Background orchestrator for multi-level processes

## Testing Requirements

### Unit Tests
**Test Files**:
- `test/coordination/v2/unit/hierarchical-coordinator.test.ts`
- `test/coordination/v2/unit/parent-control-system.test.ts`
- `test/coordination/v2/unit/background-orchestrator.test.ts`
- `test/coordination/v2/unit/bash-output-monitor.test.ts`

**Test Scenarios**:
- PM-worker task delegation
- Multi-level hierarchy creation (10+ levels)
- Parent pause/inject/resume operations
- Background process spawning and monitoring
- Cascading shutdown correctness

### Integration Tests
**Scenarios**:
- Hierarchical coordinator + completion detection
- Hierarchical coordinator + state machine
- Background orchestration + BashOutput monitoring
- Multi-level hierarchy + checkpoint recovery

### Performance Tests
**Benchmarks**:
- Agent spawn time: <2s for 10 agents
- Parent control latency: <100ms
- Background process detection: <500ms
- Checkpoint recovery: <500ms (p99)
- Cascading shutdown: <1s for 20 agents

## Documentation Deliverables

### Hierarchical Coordination Design Doc
**Sections**:
1. PM-based coordination pattern
2. Multi-level hierarchy architecture (10+ levels)
3. Parent control system (Level 0 → Level N)
4. Background process orchestration
5. BashOutput monitoring strategy
6. Cascading shutdown algorithm

### API Reference
**Components**:
- HierarchicalCoordinator API
- ParentControlSystem API
- BackgroundProcessOrchestrator API
- BashOutputMonitor API

## Phase Completion Criteria

**This phase is complete when**:
1. All 12 binary checklist items are verified
2. All 6 numerical thresholds are met or exceeded
3. Hierarchical coordinator manages 20+ agents across 10+ levels
4. Parent can pause/inject/resume any child at any level
5. Background processes spawn and monitored correctly
6. BashOutput monitoring detects child failures within 500ms
7. Nested hierarchy recovers from checkpoints in <500ms
8. Cascading shutdown gracefully terminates all levels
9. Integration tests pass with all previous phases
10. Performance benchmarks meet targets
11. Lead architect approves hierarchical coordination for production use

**Sign-off Required From**:
- Developer 1 (hierarchical coordinator and Level 0)
- Developer 2 (completion integration and background orchestration)
- Developer 3 (state propagation and cascading shutdown)
- SDK Specialist (multi-level hierarchy and nested control)
- Lead Architect (overall approval)

---

**Phase Status**: Not Started
**Estimated Effort**: 50-70 developer hours
**Critical Path**: Yes (required for hierarchical topology support)
