# MDAP Beam Search - Promise-Based Pruning Algorithm

## Overview

This document describes the promise-based pruning logic for MDAP Beam Search as implemented in `src/lib/pruning.ts`. The pruning engine uses **evidence-based decision making** to keep branches with promise and discard only dead-end branches, without using quota-based (percentage) thresholds.

**Key Principle**: Keep exploration open unless there's concrete evidence a branch is a dead end.

## Architecture

### Core Philosophy

The pruning engine implements a **promise-based approach** where:

- **Branches are kept** when they show potential (SOLVED, PROMISING, EXPLORING)
- **Branches are discarded** only when evidence proves they're dead ends (DISPROVEN, STALLED with zero progress)
- **No quota pruning** - decisions are never based on percentage of branches kept
- **All decisions logged** with reasoning and supporting evidence

### Type System

The module exports fully type-safe interfaces:

```typescript
// Branch state enumeration
export enum BranchState {
  SOLVED = 'SOLVED',           // Solution reached
  PROMISING = 'PROMISING',     // Strong potential
  EXPLORING = 'EXPLORING',     // Active exploration
  STALLED = 'STALLED',         // No recent progress
  DISPROVEN = 'DISPROVEN',     // Dead end proven
}

// Configuration
export interface PruningConfig {
  max_stalled_iterations: number;              // Iterations without progress before discard
  min_confidence_threshold: number;            // Minimum confidence (0.0-1.0)
  require_progress_every_n_iterations: number; // Progress tracking interval
}

// Decision output
export interface PruningDecision {
  branch_id: string;
  action: 'keep' | 'discard';
  reason: string;
  evidence: string[];
}
```

## Pruning Rules

### Rule 1: SOLVED State (Always Keep)

**Decision**: `keep`

**Criteria**: Branch has reached a solution

**Rationale**: Terminal state indicating successful completion

**Example**:
```typescript
const branch = createTestBranch('solution-1', BranchState.SOLVED, 0.1);
// Decision: KEEP (regardless of confidence or iteration count)
```

### Rule 2: PROMISING State (Always Keep)

**Decision**: `keep`

**Criteria**: Branch shows strong potential for solution

**Rationale**: Early-stage branches with high potential should not be prematurely discarded

**Example**:
```typescript
const branch = createTestBranch('early-promising', BranchState.PROMISING, 0.1);
// Decision: KEEP (even with low confidence)
```

### Rule 3: EXPLORING State (Always Keep)

**Decision**: `keep`

**Criteria**: Branch is being actively explored

**Rationale**: Active exploration deserves continued evaluation

**Example**:
```typescript
const branch = createTestBranch('active-search', BranchState.EXPLORING, 0.3, 100, 1);
// Decision: KEEP (even after many iterations without progress)
```

### Rule 4: DISPROVEN State (Always Discard)

**Decision**: `discard`

**Criteria**: Branch has hit a logical contradiction or constraint violation

**Rationale**: Hard evidence that branch cannot lead to solution

**Sub-criteria**:
- `contradiction` - Logical impossibility detected
- `constraint_violation` - Hard constraints violated
- `invalid_state` - State machine violates rules

**Example**:
```typescript
const branch = createDisprovenBranch('dead-end', 'contradiction', 0.95);
// Decision: DISCARD (regardless of confidence level or timing)
```

### Rule 5: STALLED State (Conditional)

**Decision**: `keep` or `discard` based on sub-rules

**Base Criterion**: Branch has no recent progress

**Sub-Rule 5a: Discard if Stalled > max_stalled_iterations**
- Condition: `iterations_without_progress > max_stalled_iterations`
- Action: `discard`
- Evidence: Exceeded maximum wait time without progress

**Sub-Rule 5b: Discard if Stalled AND Low Confidence**
- Condition: `confidence < min_confidence_threshold`
- Action: `discard`
- Evidence: Low confidence combined with stalled state suggests unpromising branch

**Sub-Rule 5c: Keep if Stalled but Within Limits**
- Condition: `iterations_without_progress <= max_stalled_iterations && confidence >= min_confidence_threshold`
- Action: `keep`
- Evidence: Still within time budget and sufficient confidence for further exploration

**Example (Sub-Rule 5a)**:
```typescript
const config = { max_stalled_iterations: 5, min_confidence_threshold: 0.3, ... };
const branch = createTestBranch('stalled-over-limit', BranchState.STALLED, 0.5, 10, 4);
// Iterations since progress: 6 > max 5
// Decision: DISCARD
```

**Example (Sub-Rule 5b)**:
```typescript
const config = { max_stalled_iterations: 10, min_confidence_threshold: 0.5, ... };
const branch = createTestBranch('low-confidence', BranchState.STALLED, 0.2, 5, 4);
// Confidence: 0.2 < threshold 0.5
// Decision: DISCARD
```

**Example (Sub-Rule 5c)**:
```typescript
const config = { max_stalled_iterations: 10, min_confidence_threshold: 0.3, ... };
const branch = createTestBranch('within-limits', BranchState.STALLED, 0.5, 5, 4);
// Iterations: 1 < max 10, Confidence: 0.5 >= min 0.3
// Decision: KEEP
```

## Implementation

### PruningEngine Class

The main pruning engine provides two key methods:

#### evaluateBranch()

Evaluates a single branch asynchronously.

```typescript
async evaluateBranch(
  branch: Branch,
  config: PruningConfig
): Promise<PruningDecision>
```

**Parameters**:
- `branch` - Branch to evaluate with metrics and state
- `config` - Pruning configuration with thresholds

**Returns**: Promise resolving to pruning decision with reasoning

**Flow**:
1. Check branch state
2. Apply appropriate rule
3. Log evaluation details
4. Return decision with evidence

#### pruneBranches()

Evaluates multiple branches in parallel.

```typescript
async pruneBranches(
  branches: Branch[],
  config: PruningConfig
): Promise<PruningResult>
```

**Parameters**:
- `branches` - Array of branches to evaluate
- `config` - Pruning configuration

**Returns**: Promise resolving to result with decisions and summary

**Features**:
- Parallel evaluation using `Promise.all()`
- Configuration validation
- Summary statistics (kept_count, discarded_count)
- Comprehensive logging

### Logger Interface

Pluggable logging for debugging and monitoring:

```typescript
export interface PruningLogger {
  info(message: string, data?: Record<string, unknown>): void;
  debug(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}
```

**Usage**:
```typescript
const customLogger: PruningLogger = {
  info: (msg, data) => console.log(`[PRUNE] ${msg}`, data),
  debug: (msg, data) => console.debug(`[DEBUG] ${msg}`, data),
  warn: (msg, data) => console.warn(`[WARN] ${msg}`, data),
  error: (msg, data) => console.error(`[ERROR] ${msg}`, data),
};

const engine = createPruningEngineWithLogger(customLogger);
```

## Configuration Presets

### Default Configuration

Balanced approach suitable for most scenarios:

```typescript
const DEFAULT_PRUNING_CONFIG: PruningConfig = {
  max_stalled_iterations: 5,
  min_confidence_threshold: 0.3,
  require_progress_every_n_iterations: 3,
};
```

### Conservative Configuration

Keeps more branches for wider exploration:

```typescript
const CONSERVATIVE_PRUNING_CONFIG: PruningConfig = {
  max_stalled_iterations: 10,
  min_confidence_threshold: 0.2,
  require_progress_every_n_iterations: 5,
};
```

### Aggressive Configuration

Discards branches more readily for faster convergence:

```typescript
const AGGRESSIVE_PRUNING_CONFIG: PruningConfig = {
  max_stalled_iterations: 3,
  min_confidence_threshold: 0.5,
  require_progress_every_n_iterations: 2,
};
```

## Usage Examples

### Basic Usage

```typescript
import {
  createPruningEngine,
  BranchState,
  DEFAULT_PRUNING_CONFIG,
  type Branch
} from '@claude-flow-novice/seo-analysis';

const engine = createPruningEngine();

// Create branches with metrics
const branches: Branch[] = [
  {
    id: 'branch-1',
    metrics: {
      current_iteration: 5,
      last_progress_iteration: 2,
      confidence: 0.7,
      state: BranchState.EXPLORING,
      evidence: [
        {
          iteration: 2,
          type: 'progress',
          description: 'Found promising direction',
          confidence: 0.7
        }
      ]
    }
  },
  // ... more branches
];

// Run pruning
const result = await engine.pruneBranches(branches, DEFAULT_PRUNING_CONFIG);

// Result contains:
// - decisions: Array of PruningDecision
// - kept_count: Number of branches to keep
// - discarded_count: Number of branches to discard
// - timestamp: When pruning was performed

console.log(`Kept ${result.kept_count} branches, discarded ${result.discarded_count}`);

result.decisions.forEach(decision => {
  console.log(`${decision.branch_id}: ${decision.action}`);
  console.log(`  Reason: ${decision.reason}`);
  console.log(`  Evidence: ${decision.evidence.join('; ')}`);
});
```

### Custom Configuration

```typescript
const customConfig: PruningConfig = {
  max_stalled_iterations: 7,
  min_confidence_threshold: 0.4,
  require_progress_every_n_iterations: 4,
};

const result = await engine.pruneBranches(branches, customConfig);
```

### Custom Logger

```typescript
import { createPruningEngineWithLogger, type PruningLogger } from '@claude-flow-novice/seo-analysis';

const logger: PruningLogger = {
  info: (msg, data) => {
    // Send to monitoring system
    monitoringService.log('info', msg, data);
  },
  debug: (msg, data) => console.debug(msg, data),
  warn: (msg, data) => console.warn(msg, data),
  error: (msg, data) => console.error(msg, data),
};

const engine = createPruningEngineWithLogger(logger);
const result = await engine.pruneBranches(branches, DEFAULT_PRUNING_CONFIG);
```

## Testing

The module includes 49 comprehensive tests covering:

### Rule Coverage
- All 5 pruning rules tested independently
- Sub-rules for STALLED state validated
- Edge cases and boundary conditions

### Test Suites
```
✓ Rule 1: SOLVED state (3 tests)
✓ Rule 2: PROMISING state (3 tests)
✓ Rule 3: EXPLORING state (3 tests)
✓ Rule 4: DISPROVEN state (4 tests)
✓ Rule 5: STALLED state (9 tests)
✓ Batch pruning (4 tests)
✓ Configuration validation (5 tests)
✓ Preset configurations (3 tests)
✓ Logging (3 tests)
✓ Edge cases (5 tests)
✓ Factory functions (2 tests)
✓ Promise-based behavior (3 tests)
✓ Evidence-based decisions (3 tests)
```

### Running Tests

```bash
cd packages/seo-analysis
npm test -- src/lib/pruning.test.ts

# With coverage
npm run test:coverage -- src/lib/pruning.test.ts
```

## Key Design Decisions

### 1. Promise-Based (Not Quota-Based)

**Decision**: Use state-based evaluation, not percentage thresholds

**Rationale**:
- Quota pruning (e.g., "keep top 50%") can discard high-potential branches
- Promise-based keeps branches with evidence of potential
- More aligned with beam search philosophy of keeping promising paths

**Example**:
```typescript
// WRONG: Discard bottom 50% of branches
branches.sort((a, b) => b.confidence - a.confidence);
const kept = branches.slice(0, Math.floor(branches.length / 2));

// RIGHT: Discard only branches with evidence they're dead ends
const decisions = await engine.pruneBranches(branches, config);
const kept = decisions.filter(d => d.action === 'keep');
```

### 2. Evidence-Driven Logging

**Decision**: Log all decisions with reasoning and evidence

**Rationale**:
- Transparency in pruning decisions aids debugging
- Evidence can be analyzed for algorithm tuning
- Supports audit trails for decision verification

### 3. Configurable Thresholds

**Decision**: Expose max_stalled_iterations and min_confidence_threshold as configuration

**Rationale**:
- Different scenarios require different aggressiveness
- Presets (conservative, default, aggressive) accommodate common use cases
- Allows tuning without code changes

### 4. Type Safety Throughout

**Decision**: Strict TypeScript types with no `any`

**Rationale**:
- Prevents runtime errors in branch state evaluation
- Enables IDE autocompletion for configuration
- Compiler catches invalid state transitions

## Integration with MDAP Beam Search

### Integration Points

1. **Branch State Management**
   - MDAP maintains branch states (SOLVED, PROMISING, EXPLORING, STALLED, DISPROVEN)
   - PruningEngine reads these states without modifying them

2. **Metrics Tracking**
   - MDAP tracks `current_iteration` and `last_progress_iteration`
   - PruningEngine uses these metrics for stalled detection

3. **Confidence Scoring**
   - MDAP assigns confidence scores (0.0-1.0)
   - PruningEngine uses scores for threshold-based decisions

4. **Evidence Collection**
   - MDAP collects evidence during exploration
   - PruningEngine uses evidence for DISPROVEN detection

5. **Decision Propagation**
   - PruningEngine returns keep/discard decisions
   - MDAP removes discarded branches from beam

### Integration Example

```typescript
// In MDAP beam search main loop
async function pruneBeam(branches: Branch[]): Promise<Branch[]> {
  const engine = createPruningEngine();
  const result = await engine.pruneBranches(branches, DEFAULT_PRUNING_CONFIG);

  // Filter to only kept branches
  const keptBranchIds = new Set(
    result.decisions
      .filter(d => d.action === 'keep')
      .map(d => d.branch_id)
  );

  return branches.filter(b => keptBranchIds.has(b.id));
}
```

## Performance Considerations

### Complexity Analysis

- **Time**: O(n) where n = number of branches (parallel evaluation)
- **Space**: O(n) for decision array
- **Promise.all()**: Scales with available event loop capacity

### Optimization Tips

1. **Batch Size**: Prune every 5-10 iterations for overhead balance
2. **Logger**: Use no-op logger in production for minimal overhead
3. **Config**: Use CONSERVATIVE preset for broader exploration, AGGRESSIVE for faster convergence

## Troubleshooting

### All Branches Discarded

**Symptom**: `discarded_count === branches.length`

**Possible Causes**:
- DISPROVEN branches only in input
- max_stalled_iterations too low
- min_confidence_threshold too high

**Solution**: Review configuration, check branch state assignments

### No Branches Discarded

**Symptom**: `kept_count === branches.length`

**Possible Causes**:
- No STALLED or DISPROVEN branches
- max_stalled_iterations too high
- min_confidence_threshold too low

**Solution**: MDAP may need better state tracking or confidence scoring

### Missing Evidence

**Symptom**: `decision.evidence` array is empty

**Possible Causes**:
- Branch created without evidence collection
- Evidence collection disabled in MDAP

**Solution**: Ensure evidence is attached to branch metrics during exploration

## Future Enhancements

1. **Dynamic Thresholds**: Adjust thresholds based on beam search progress
2. **Weighted Evidence**: Support confidence levels in individual evidence items
3. **Rollback Strategy**: Restore discarded branches if beam becomes exhausted
4. **Metrics Export**: Export pruning metrics for analysis and tuning
5. **Performance Profiling**: Built-in timing for evaluation speed tracking

## API Reference

### Exports

```typescript
// Main class
export class PruningEngine { }

// Enums
export enum BranchState { SOLVED, PROMISING, EXPLORING, STALLED, DISPROVEN }

// Interfaces
export interface PruningConfig { }
export interface PruningDecision { }
export interface PruningResult { }
export interface Branch { }
export interface BranchMetrics { }
export interface BranchEvidence { }
export interface PruningLogger { }

// Factory functions
export function createPruningEngine(): PruningEngine
export function createPruningEngineWithLogger(logger: PruningLogger): PruningEngine

// Presets
export const DEFAULT_PRUNING_CONFIG: PruningConfig
export const CONSERVATIVE_PRUNING_CONFIG: PruningConfig
export const AGGRESSIVE_PRUNING_CONFIG: PruningConfig
```

## Version History

- **v1.0.0** (2025-12-02): Initial implementation of promise-based pruning with 5 rules, 49 tests, full type safety
