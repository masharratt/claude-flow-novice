# Quick Start: MDAP Beam Search Pruning

## Installation

The pruning module is included in `@claude-flow-novice/seo-analysis`:

```bash
npm install @claude-flow-novice/seo-analysis
```

## Basic Usage (30 seconds)

```typescript
import {
  createPruningEngine,
  BranchState,
  DEFAULT_PRUNING_CONFIG,
  type Branch
} from '@claude-flow-novice/seo-analysis';

// 1. Create engine
const engine = createPruningEngine();

// 2. Define branches with state
const branches: Branch[] = [
  {
    id: 'search-1',
    metrics: {
      current_iteration: 10,
      last_progress_iteration: 8,
      confidence: 0.7,
      state: BranchState.EXPLORING,
      evidence: []
    }
  },
  {
    id: 'search-2',
    metrics: {
      current_iteration: 5,
      last_progress_iteration: 1,
      confidence: 0.2,
      state: BranchState.STALLED,
      evidence: []
    }
  }
];

// 3. Run pruning
const result = await engine.pruneBranches(branches, DEFAULT_PRUNING_CONFIG);

// 4. Use decisions
result.decisions.forEach(d => {
  console.log(`${d.branch_id}: ${d.action} - ${d.reason}`);
});
```

## Common Tasks

### Task: Keep Only Best Branches

```typescript
// Get IDs of branches to keep
const keptIds = new Set(
  result.decisions
    .filter(d => d.action === 'keep')
    .map(d => d.branch_id)
);

// Filter input branches
const prunedBranches = branches.filter(b => keptIds.has(b.id));
```

### Task: Log Pruning Decisions

```typescript
const kept = result.decisions.filter(d => d.action === 'keep');
const discarded = result.decisions.filter(d => d.action === 'discard');

console.log(`Kept ${kept.length}/${branches.length} branches`);

discarded.forEach(d => {
  console.log(`  Discarded ${d.branch_id}: ${d.reason}`);
});
```

### Task: Use Different Pruning Strategy

```typescript
// More lenient (keep more branches)
await engine.pruneBranches(branches, CONSERVATIVE_PRUNING_CONFIG);

// More aggressive (discard more branches)
await engine.pruneBranches(branches, AGGRESSIVE_PRUNING_CONFIG);

// Custom thresholds
const customConfig = {
  max_stalled_iterations: 8,
  min_confidence_threshold: 0.25,
  require_progress_every_n_iterations: 4
};
await engine.pruneBranches(branches, customConfig);
```

### Task: Add Custom Logging

```typescript
import { createPruningEngineWithLogger, type PruningLogger } from '@claude-flow-novice/seo-analysis';

const myLogger: PruningLogger = {
  info: (msg, data) => console.log(`[INFO] ${msg}`, data),
  debug: (msg, data) => console.debug(`[DEBUG] ${msg}`, data),
  warn: (msg, data) => console.warn(`[WARN] ${msg}`, data),
  error: (msg, data) => console.error(`[ERROR] ${msg}`, data),
};

const engine = createPruningEngineWithLogger(myLogger);
```

## Understanding Branch States

| State | Action | Why |
|-------|--------|-----|
| `SOLVED` | KEEP | Solution found |
| `PROMISING` | KEEP | Strong potential |
| `EXPLORING` | KEEP | Active search |
| `STALLED` | CONDITIONAL | Check iterations & confidence |
| `DISPROVEN` | DISCARD | Dead end proven |

## Configuration Presets

### DEFAULT_PRUNING_CONFIG
Best for most scenarios. Balanced approach.

```typescript
{
  max_stalled_iterations: 5,
  min_confidence_threshold: 0.3,
  require_progress_every_n_iterations: 3
}
```

### CONSERVATIVE_PRUNING_CONFIG
Explore more branches. Lower pruning rate.

```typescript
{
  max_stalled_iterations: 10,
  min_confidence_threshold: 0.2,
  require_progress_every_n_iterations: 5
}
```

### AGGRESSIVE_PRUNING_CONFIG
Prune more branches. Faster convergence.

```typescript
{
  max_stalled_iterations: 3,
  min_confidence_threshold: 0.5,
  require_progress_every_n_iterations: 2
}
```

## Decision Explanation

### Example 1: Exploring Branch (KEEP)

```
Branch ID: search-1
State: EXPLORING
Confidence: 0.7
Iterations without progress: 2

Decision: KEEP
Reason: "Branch is being actively explored"
Evidence:
  - "State is EXPLORING"
  - "Iterations since progress: 2"
  - "Confidence: 0.7"
```

### Example 2: Stalled with Low Confidence (DISCARD)

```
Branch ID: search-2
State: STALLED
Confidence: 0.15
Iterations without progress: 6
Config: max_stalled_iterations = 5

Decision: DISCARD
Reason: "Stalled for 6 iterations without progress (exceeds max 5)"
Evidence:
  - "State: STALLED"
  - "Iterations without progress: 6"
  - "Max allowed: 5"
  - "Confidence: 0.15"
```

### Example 3: Dead End (DISCARD)

```
Branch ID: search-3
State: DISPROVEN
Evidence: "Constraint violation: Branch violates requirement X"

Decision: DISCARD
Reason: "Branch has been disproven (contradiction or constraint violation)"
Evidence:
  - [evidence from branch metrics]
```

## Integration with MDAP

```typescript
// In your MDAP beam search main loop
async function pruneBeam(currentBranches: Branch[]): Promise<Branch[]> {
  const engine = createPruningEngine();
  const result = await engine.pruneBranches(
    currentBranches,
    DEFAULT_PRUNING_CONFIG
  );

  // Keep only branches marked as 'keep'
  const keepIds = new Set(
    result.decisions
      .filter(d => d.action === 'keep')
      .map(d => d.branch_id)
  );

  return currentBranches.filter(b => keepIds.has(b.id));
}

// Usage in main loop
while (iterations < maxIterations && beam.length > 0) {
  // ... expand branches, update metrics ...

  // Prune beam every 5 iterations
  if (iterations % 5 === 0) {
    beam = await pruneBeam(beam);
  }

  iterations++;
}
```

## Testing

Run tests to verify installation:

```bash
cd node_modules/@claude-flow-novice/seo-analysis
npm test -- src/lib/pruning.test.ts
```

Expected output: 49 tests pass in ~10 seconds

## Troubleshooting

### Q: All branches are being discarded

**A**: Check configuration. Either:
- Branches are mostly DISPROVEN (check state assignment)
- `min_confidence_threshold` is too high
- `max_stalled_iterations` is too low

Try CONSERVATIVE preset:
```typescript
await engine.pruneBranches(branches, CONSERVATIVE_PRUNING_CONFIG);
```

### Q: No branches are being pruned

**A**: Expected if:
- All branches are SOLVED, PROMISING, or EXPLORING
- Stalled branches have high confidence and are within iteration limit

This is correct behavior - only discard dead ends!

### Q: How do I measure pruning effectiveness?

**A**: Track metrics:
```typescript
const result = await engine.pruneBranches(branches, config);
const pruneRate = result.discarded_count / branches.length;
const keepRate = result.kept_count / branches.length;

console.log(`Pruned ${(pruneRate * 100).toFixed(1)}%`);
console.log(`Kept ${(keepRate * 100).toFixed(1)}%`);
```

## API Cheat Sheet

```typescript
// Create engine
const engine = createPruningEngine();
const engine = createPruningEngineWithLogger(logger);

// Evaluate single branch
const decision = await engine.evaluateBranch(branch, config);

// Evaluate multiple branches
const result = await engine.pruneBranches(branches, config);

// Result contains:
result.decisions      // Array of PruningDecision
result.kept_count     // Number of branches to keep
result.discarded_count // Number of branches to discard
result.timestamp      // When pruning was performed

// Decision contains:
decision.branch_id    // Branch identifier
decision.action       // 'keep' or 'discard'
decision.reason       // Human readable explanation
decision.evidence     // Array of supporting facts
```

## Performance Tips

1. **Batch Pruning**: Prune every 5-10 iterations, not every iteration
2. **Config Selection**:
   - Use CONSERVATIVE for broad exploration
   - Use AGGRESSIVE for fast convergence
3. **Logging**: Use no-op logger for production
4. **Parallel**: Multiple branches evaluated concurrently (via Promise.all)

## Next Steps

1. Read `MDAP_BEAM_SEARCH_PRUNING.md` for detailed algorithm explanation
2. Read `PRUNING_ARCHITECTURE.md` for system design
3. Review `src/lib/pruning.test.ts` for comprehensive test examples
4. Check `src/lib/pruning.ts` for full API documentation

## Support

For issues or questions:
1. Check test cases for usage examples
2. Review decision evidence for debugging
3. Consult architecture documentation for design details
