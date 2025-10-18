# Phase Orchestrator (Loop 0) - Multi-Phase Progression Management

**Version**: 1.0
**Status**: Production Ready
**Module**: `src/cfn-loop/phase-orchestrator.ts`

---

## Overview

The **PhaseOrchestrator** manages **Loop 0** (the parent loop) for multi-phase progression in the CFN Loop system. It orchestrates execution across Phase 0 → Phase N, providing:

- **Dependency graph building** with cycle detection
- **Topological phase ordering** for correct execution sequence
- **Automatic phase transitions** without manual intervention
- **Phase completion validation** via consensus
- **Self-looping prompt generation** for continuous autonomous execution
- **Integration with CFNLoopOrchestrator** (Loop 1/2/3) for phase execution

---

## Architecture

### Loop Hierarchy

```
Loop 0 (PhaseOrchestrator)           ← Multi-phase progression
  ├─ Phase 0 (CFNLoopOrchestrator)   ← Loop 1/2/3 execution
  │   ├─ Loop 1: Swarm initialization
  │   ├─ Loop 2: Consensus validation (max 5 iterations)
  │   └─ Loop 3: Primary swarm execution (max 10 iterations)
  │
  ├─ Phase 1 (CFNLoopOrchestrator)
  │   └─ Loop 1/2/3...
  │
  └─ Phase N (CFNLoopOrchestrator)
      └─ Loop 1/2/3...
```

### Key Components

1. **PhaseOrchestrator**: Parent loop coordinator (Loop 0)
2. **CFNLoopOrchestrator**: Phase-level loop executor (Loop 1/2/3)
3. **Dependency Graph**: DAG structure with cycle detection
4. **Topological Sort**: Execution ordering algorithm
5. **Self-Looping Prompts**: Auto-continuation instructions

---

## Phase Configuration Schema

### Phase Interface

```typescript
interface Phase {
  /** Unique phase identifier (e.g., "PHASE_00_SDK_FOUNDATION") */
  id: string;

  /** Execution order hint (for validation) */
  order: number;

  /** Human-readable phase name */
  name: string;

  /** Phase description and objectives */
  description: string;

  /** List of phase IDs this phase depends on */
  dependsOn: string[];

  /** Completion validation criteria */
  completionCriteria: {
    /** Minimum consensus score required (0-1) */
    minConsensusScore: number;

    /** Required deliverables that must exist */
    requiredDeliverables: string[];

    /** Optional custom validation function */
    customValidation?: (result: PhaseResult) => Promise<boolean>;
  };

  /** Self-looping prompt for auto-continuation (optional) */
  selfLoopingPrompt?: string;

  /** CFN loop configuration overrides */
  loopConfig?: {
    maxLoop2Iterations?: number;
    maxLoop3Iterations?: number;
    confidenceThreshold?: number;
    consensusThreshold?: number;
  };
}
```

---

## Core Functionality

### 1. Dependency Graph Building

**Purpose**: Build DAG structure and detect circular dependencies.

**Features**:
- Validates all phase dependencies exist
- Detects circular dependencies (throws error)
- Builds reverse dependency edges (dependents)
- Validates dependency consistency

**Example**:

```typescript
// Phase 0: No dependencies
const phase0: Phase = {
  id: 'PHASE_00',
  dependsOn: [], // Foundation phase
  // ...
};

// Phase 1: Depends on Phase 0
const phase1: Phase = {
  id: 'PHASE_01',
  dependsOn: ['PHASE_00'],
  // ...
};

// Phase 2: Depends on Phase 1
const phase2: Phase = {
  id: 'PHASE_02',
  dependsOn: ['PHASE_01'],
  // ...
};

// Builds graph: PHASE_00 → PHASE_01 → PHASE_02
```

**Cycle Detection**:

```typescript
// ❌ INVALID: Circular dependency
const badPhase1: Phase = {
  id: 'PHASE_A',
  dependsOn: ['PHASE_B'], // Depends on B
};

const badPhase2: Phase = {
  id: 'PHASE_B',
  dependsOn: ['PHASE_A'], // Depends on A (circular!)
};

// Throws: "Dependency cycle detected: PHASE_A → PHASE_B → PHASE_A"
```

---

### 2. Topological Phase Ordering

**Purpose**: Compute execution order satisfying all dependencies.

**Algorithm**: Depth-First Search (DFS) with post-order traversal

**Guarantees**:
- Dependencies execute before dependents
- No phase executes before its dependencies
- Deterministic ordering

**Example**:

```typescript
// Input phases (unordered)
const phases = [phase2, phase0, phase1];

// After topological sort
// Execution order: [phase0, phase1, phase2]
```

---

### 3. Phase Execution with Retry

**Purpose**: Execute phases with automatic retry on validation failure.

**Retry Logic**:

```typescript
// Configuration
const config: PhaseOrchestratorConfig = {
  phases: [...],
  maxPhaseRetries: 3, // Max 3 attempts per phase
};

// Execution flow
for (let attempt = 1; attempt <= maxPhaseRetries; attempt++) {
  // 1. Execute phase via CFNLoopOrchestrator
  const result = await executePhase(phase, context, task);

  // 2. Validate phase completion
  const valid = await validatePhaseCompletion(phase, result);

  if (valid) {
    // Success! Proceed to next phase
    break;
  } else {
    // Retry with feedback
    console.log(`Retry ${attempt}/${maxPhaseRetries}`);
  }
}
```

**Retry Strategy**:
- **Attempt 1**: Initial execution
- **Attempt 2-N**: Re-execute with validator feedback
- **Max retries exceeded**: Mark phase as failed, escalate

---

### 4. Phase Completion Validation

**Purpose**: Validate phase meets all success criteria.

**Validation Checks**:

1. **Basic Success**: `result.success === true`
2. **Consensus Score**: `consensusScore >= minConsensusScore`
3. **Required Deliverables**: All deliverables present
4. **Custom Validation**: Optional user-defined validation

**Example**:

```typescript
const phase: Phase = {
  id: 'PHASE_EXAMPLE',
  completionCriteria: {
    minConsensusScore: 0.90, // ≥90% consensus required

    requiredDeliverables: [
      'session-manager',
      'query-controller',
      'checkpoint-manager',
    ],

    // Custom validation (optional)
    customValidation: async (result) => {
      // Check metadata
      const allValid = result.finalDeliverables.every(
        (d) => d.metadata?.validated === true
      );
      return allValid;
    },
  },
};
```

---

### 5. Self-Looping Prompt Generation

**Purpose**: Generate continuation prompts for autonomous phase transitions.

**Features**:
- Auto-generate prompts if `selfLoopingPrompt` not provided
- Include next phase context and dependencies
- Emphasize **IMMEDIATE** continuation (no human approval)
- Provide success criteria for next phase

**Default Prompt Template**:

```typescript
// Generated automatically
const defaultPrompt = `
Phase {phaseId} completed successfully with {consensusScore}% consensus.

{deliverableCount} deliverables produced:
  1. deliverable-1
  2. deliverable-2
  ...

✅ **IMMEDIATELY proceed to Phase {nextPhaseId}: {nextPhaseName}**

Phase {nextPhaseId} Description:
{description}

Dependencies satisfied: {deps} ✅ ALL SATISFIED

DO NOT wait for human approval. IMMEDIATELY initialize swarm and begin execution.

Success criteria:
- Minimum consensus score: {minConsensusScore}%
- Required deliverables: {requiredDeliverables}

NEXT STEP: Initialize swarm for Phase {nextPhaseId} and spawn agents.
`;
```

**Custom Prompt Example**:

```typescript
const phase: Phase = {
  id: 'PHASE_00_SDK_FOUNDATION',
  selfLoopingPrompt: `
Phase 0 (SDK Foundation) complete with {consensusScore}% consensus.

✅ SDK components operational:
- Session forking: 20 agents in <2s ✅
- Query control: pause/resume <50ms ✅
- Checkpoints: recovery <500ms ✅
- Artifacts: storage <12ms ✅

🚀 **IMMEDIATELY proceed to Phase 1: State Machine Foundation**

DO NOT wait for human approval. Initialize swarm NOW.

Dependencies: All satisfied ✅

Success criteria for Phase 1:
- 7-state agent lifecycle (IDLE, WORKING, WAITING, HELPING, BLOCKED, COMPLETED, ERROR)
- State transitions <100ms
- Auto-checkpoint on transitions

NEXT ACTION: Initialize swarm for Phase 1 and spawn 3 agents (coder, tester, reviewer).
  `.trim(),
};
```

**Prompt Interpolation**:

Available variables:
- `{phaseId}`: Current phase ID
- `{nextPhaseId}`: Next phase ID
- `{consensusScore}`: Consensus score percentage
- `{deliverableCount}`: Number of deliverables

---

## Integration with CFNLoopOrchestrator

### Loop 0 → Loop 1/2/3 Flow

```typescript
// PhaseOrchestrator (Loop 0)
async executePhase(phase: Phase, context: PhaseContext, task: string) {
  // Merge loop configuration
  const loopConfig = {
    phaseId: phase.id,
    ...this.defaultLoopConfig,
    ...phase.loopConfig,
  };

  // Create CFNLoopOrchestrator (Loop 1/2/3)
  const orchestrator = new CFNLoopOrchestrator(loopConfig);

  try {
    // Execute phase (runs Loop 1/2/3)
    const result = await orchestrator.executePhase(phaseTask);

    // Store result in memory
    await this.storePhaseResult(phase.id, result);

    return result;
  } finally {
    // Cleanup
    await orchestrator.shutdown();
  }
}
```

### Configuration Inheritance

```typescript
// Loop 0 default config
const orchestratorConfig: PhaseOrchestratorConfig = {
  defaultLoopConfig: {
    maxLoop2Iterations: 5,
    maxLoop3Iterations: 10,
    confidenceThreshold: 0.75,
    consensusThreshold: 0.90,
  },
};

// Phase-specific overrides
const phase: Phase = {
  loopConfig: {
    maxLoop2Iterations: 7, // Override: 7 instead of 5
    consensusThreshold: 0.95, // Override: 95% instead of 90%
  },
};

// Final merged config for this phase
// maxLoop2Iterations: 7 ✅
// maxLoop3Iterations: 10 ✅
// confidenceThreshold: 0.75 ✅
// consensusThreshold: 0.95 ✅
```

---

## Usage Examples

### Example 1: Basic Phase Orchestration

```typescript
import {
  createPhaseOrchestrator,
  Phase,
  PhaseOrchestratorConfig,
} from './cfn-loop/phase-orchestrator.js';

// Define phases
const phases: Phase[] = [
  {
    id: 'PHASE_00_SDK_FOUNDATION',
    order: 0,
    name: 'SDK Foundation',
    description: 'Establish SDK foundation',
    dependsOn: [],
    completionCriteria: {
      minConsensusScore: 0.90,
      requiredDeliverables: ['session-manager', 'query-controller'],
    },
  },
  {
    id: 'PHASE_01_STATE_MACHINE',
    order: 1,
    name: 'State Machine',
    description: 'Implement agent state machine',
    dependsOn: ['PHASE_00_SDK_FOUNDATION'],
    completionCriteria: {
      minConsensusScore: 0.90,
      requiredDeliverables: ['agent-state', 'state-machine'],
    },
  },
];

// Create orchestrator
const config: PhaseOrchestratorConfig = {
  phases,
  maxPhaseRetries: 3,
};

const orchestrator = createPhaseOrchestrator(config);

// Initialize (builds dependency graph)
await orchestrator.initialize();

// Execute all phases
const result = await orchestrator.executeAllPhases('Implement Coordination System');

// Results
console.log(`Success: ${result.success}`);
console.log(`Completed: ${result.completedPhases.length}/${result.totalPhases}`);
```

### Example 2: Custom Validation

```typescript
const phase: Phase = {
  id: 'PHASE_CUSTOM',
  // ... other properties
  completionCriteria: {
    minConsensusScore: 0.85,
    requiredDeliverables: ['component'],

    // Custom validation function
    customValidation: async (result) => {
      // Example: Check test coverage
      const coverage = result.statistics.averageConfidenceScore;
      if (coverage < 0.80) {
        console.log('❌ Test coverage too low:', coverage);
        return false;
      }

      // Example: Check security audit
      const hasSecurityAudit = result.finalDeliverables.some(
        (d) => d.name === 'security-audit'
      );
      if (!hasSecurityAudit) {
        console.log('❌ Missing security audit');
        return false;
      }

      return true;
    },
  },
};
```

### Example 3: Event Monitoring

```typescript
// Listen for phase completion events
orchestrator.on('phase:complete', (data) => {
  console.log(`✅ Phase ${data.phaseId} complete`);
  console.log(`Consensus: ${data.result.consensusResult.consensusScore}`);
  console.log(`Next Phase: ${data.nextPhaseId}`);
  console.log(`\nContinuation Prompt:\n${data.continuationPrompt}`);
});

// Execute phases
await orchestrator.executeAllPhases('Multi-phase task');
```

### Example 4: Statistics Monitoring

```typescript
// Monitor progress
const interval = setInterval(() => {
  const stats = orchestrator.getStatistics();
  console.log(`Progress: ${stats.completedPhases}/${stats.totalPhases}`);
  console.log(`Failed: ${stats.failedPhases}`);
  console.log(`Duration: ${stats.duration}ms`);
}, 5000);

await orchestrator.executeAllPhases('Task');
clearInterval(interval);
```

---

## Error Handling

### Dependency Errors

```typescript
// Missing dependency
const phase: Phase = {
  id: 'PHASE_A',
  dependsOn: ['PHASE_NONEXISTENT'], // Error!
};

// Throws: "Phase PHASE_A depends on non-existent phase PHASE_NONEXISTENT"
```

### Circular Dependencies

```typescript
// Circular dependency
const phaseA: Phase = {
  id: 'A',
  dependsOn: ['B'],
};

const phaseB: Phase = {
  id: 'B',
  dependsOn: ['A'], // Circular!
};

// Throws: "Dependency cycle detected: A → B → A"
```

### Phase Validation Failure

```typescript
// Phase fails validation after max retries
const result = await orchestrator.executeAllPhases('Task');

if (!result.success) {
  console.log('Failed phases:', result.failedPhases);

  result.failedPhases.forEach((phaseId) => {
    const phaseResult = result.phaseResults.get(phaseId);
    console.log(`Phase ${phaseId} failed:`);
    console.log(`  Reason: ${phaseResult?.escalationReason}`);
    console.log(`  Attempts: ${orchestrator.phaseRetries.get(phaseId)}`);
  });
}
```

---

## Best Practices

### 1. Phase Granularity

**✅ Good**: Atomic, well-defined phases
```typescript
const phases = [
  { id: 'PHASE_00_SDK', ... },
  { id: 'PHASE_01_STATE_MACHINE', ... },
  { id: 'PHASE_02_DEPENDENCY_GRAPH', ... },
];
```

**❌ Bad**: Overly broad phases
```typescript
const phases = [
  { id: 'PHASE_EVERYTHING', description: 'Build entire system', ... },
];
```

### 2. Dependency Specification

**✅ Good**: Explicit dependencies
```typescript
const phase: Phase = {
  dependsOn: ['PHASE_00_SDK_FOUNDATION', 'PHASE_01_STATE_MACHINE'],
};
```

**❌ Bad**: Implicit dependencies
```typescript
// Don't rely on execution order without declaring dependencies
const phase: Phase = {
  dependsOn: [], // Missing dependencies!
};
```

### 3. Self-Looping Prompts

**✅ Good**: Specific, actionable prompts
```typescript
selfLoopingPrompt: `
Phase complete. IMMEDIATELY proceed to next phase.
Initialize swarm with 3 agents: coder, tester, reviewer.
Success criteria: 90% consensus, 5 deliverables.
`;
```

**❌ Bad**: Vague prompts
```typescript
selfLoopingPrompt: 'Continue to next phase.';
```

### 4. Validation Criteria

**✅ Good**: Measurable criteria
```typescript
completionCriteria: {
  minConsensusScore: 0.90,
  requiredDeliverables: ['component-a', 'component-b'],
  customValidation: async (result) => {
    return result.statistics.averageConfidenceScore >= 0.80;
  },
};
```

**❌ Bad**: Subjective criteria
```typescript
completionCriteria: {
  minConsensusScore: 0.50, // Too low
  requiredDeliverables: [], // No deliverables required
};
```

---

## Performance Characteristics

### Dependency Graph Construction

- **Time Complexity**: O(V + E) where V = phases, E = dependencies
- **Space Complexity**: O(V + E)
- **Cycle Detection**: O(V + E) via DFS

### Topological Sort

- **Time Complexity**: O(V + E)
- **Space Complexity**: O(V)

### Phase Execution

- **Per Phase**: Depends on CFNLoopOrchestrator (Loop 1/2/3)
- **Retry Overhead**: Linear with `maxPhaseRetries`

---

## Future Enhancements

### Phase Configuration Loader

```typescript
// Load phases from JSON/YAML
const phases = await loadPhasesFromConfig('./config/phases.json');
```

### Parallel Phase Execution

```typescript
// Execute independent phases in parallel
// (currently sequential)
const config: PhaseOrchestratorConfig = {
  parallelExecution: true, // Future feature
};
```

### Checkpoint Recovery

```typescript
// Resume from specific phase
await orchestrator.resumeFromPhase('PHASE_02_DEPENDENCY_GRAPH');
```

---

## Summary

**PhaseOrchestrator (Loop 0)** provides:

✅ **Dependency Management**: DAG structure with cycle detection
✅ **Topological Ordering**: Correct execution sequence
✅ **Automatic Transitions**: No manual intervention required
✅ **Validation**: Consensus + deliverables + custom checks
✅ **Self-Looping**: Autonomous multi-phase progression
✅ **Retry Logic**: Up to 3 attempts per phase
✅ **Integration**: Seamless CFNLoopOrchestrator (Loop 1/2/3) execution

**Result**: Fully autonomous multi-phase orchestration system with built-in quality gates and self-correction mechanisms.
