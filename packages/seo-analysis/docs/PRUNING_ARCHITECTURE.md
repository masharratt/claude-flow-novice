# Pruning Module Architecture

## System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     MDAP Beam Search                            │
│                   (Main Algorithm Loop)                         │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
      ┌──────────────────────────────────────┐
      │   Update Branch States & Metrics     │
      │  (SOLVED, PROMISING, EXPLORING, etc) │
      │  (confidence, iterations, evidence)  │
      └────────────────┬─────────────────────┘
                       │
                       ▼
      ┌──────────────────────────────────────┐
      │   PruningEngine.pruneBranches()      │
      │   (Main entry point)                 │
      └────────────────┬─────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ▼              ▼              ▼
    ┌────────┐  ┌────────────┐  ┌─────────────┐
    │Validate│  │ Parallel   │  │   Log       │
    │Config  │  │ evaluate() │  │  Summary    │
    └────────┘  └────────────┘  └─────────────┘
        │              │              │
        └──────────────┼──────────────┘
                       │
                       ▼
    ┌──────────────────────────────────────────┐
    │ Branch Evaluation Logic (5 Rules)        │
    │                                          │
    │  Rule 1: SOLVED → KEEP                   │
    │  Rule 2: PROMISING → KEEP                │
    │  Rule 3: EXPLORING → KEEP                │
    │  Rule 4: DISPROVEN → DISCARD             │
    │  Rule 5: STALLED → CONDITIONAL           │
    │    5a: if (stalled > max) → DISCARD      │
    │    5b: if (confidence < min) → DISCARD   │
    │    5c: else → KEEP                       │
    └──────────────────────────────────────────┘
        │
        ▼
    ┌──────────────────────────────────────────┐
    │        PruningDecision[] Results         │
    │  { branch_id, action, reason, evidence } │
    └──────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────┐
│  MDAP: Filter Beam to Kept Branches Only        │
│  Continue search with pruned beam               │
└──────────────────────────────────────────────────┘
```

## Data Flow

### Input: Branch State

```
Branch {
  id: string
  metrics: {
    current_iteration: 5
    last_progress_iteration: 2
    confidence: 0.7
    state: EXPLORING
    evidence: [
      {
        iteration: 2
        type: "progress"
        description: "Found new path"
        confidence: 0.7
      }
    ]
  }
}
```

### Processing: Evaluation Rules

```
evaluateBranch(branch, config)
  │
  ├─ Is SOLVED? → KEEP (Rule 1)
  │
  ├─ Is PROMISING? → KEEP (Rule 2)
  │
  ├─ Is EXPLORING? → KEEP (Rule 3)
  │
  ├─ Is DISPROVEN? → DISCARD (Rule 4)
  │
  └─ Is STALLED?
     ├─ iterations_without_progress > max? → DISCARD (5a)
     ├─ confidence < min_threshold? → DISCARD (5b)
     └─ else → KEEP (5c)
```

### Output: Decision with Evidence

```
PruningDecision {
  branch_id: "branch-42"
  action: "discard"
  reason: "Stalled for 6 iterations without progress (exceeds max 5)"
  evidence: [
    "State: STALLED",
    "Iterations without progress: 6",
    "Max allowed: 5",
    "Confidence: 0.45"
  ]
}
```

### Summary: Pruning Result

```
PruningResult {
  decisions: [
    { branch_id: "b1", action: "keep", ... },
    { branch_id: "b2", action: "discard", ... },
    ...
  ]
  kept_count: 15
  discarded_count: 5
  timestamp: 2025-12-02T10:30:00Z
}
```

## Class Hierarchy

```
┌──────────────────────────────┐
│   PruningEngine              │
├──────────────────────────────┤
│ - logger: PruningLogger      │
│ - evaluateBranch()           │
│ - pruneBranches()            │
│ - validatePruningConfig()    │
│ - evaluateStalledBranch()    │
│ - extractEvidenceStrings()   │
│ - logPruningResult()         │
└──────────────────────────────┘
         │
         ├── uses ──→ BranchState (enum)
         ├── uses ──→ Branch (interface)
         ├── uses ──→ PruningConfig (interface)
         ├── uses ──→ PruningDecision (interface)
         ├── uses ──→ PruningResult (interface)
         ├── uses ──→ PruningLogger (interface)
         └── injects ──→ DefaultPruningLogger (implementation)
```

## Interface Relationships

```
┌─────────────────────────────────┐
│      PruningConfig              │
├─────────────────────────────────┤
│ • max_stalled_iterations: 5     │
│ • min_confidence_threshold: 0.3 │
│ • require_progress_...: 3       │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│      Branch                     │
├─────────────────────────────────┤
│ • id: string                    │
│ • metrics: BranchMetrics        │
└─────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│     BranchMetrics               │
├─────────────────────────────────┤
│ • current_iteration: number     │
│ • last_progress_iteration: num  │
│ • confidence: number (0-1)      │
│ • state: BranchState            │
│ • evidence: BranchEvidence[]    │
└─────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│    BranchEvidence               │
├─────────────────────────────────┤
│ • iteration: number             │
│ • type: string                  │
│ • description: string           │
│ • confidence: number (0-1)      │
└─────────────────────────────────┘

         ┌──────────────────────────────────┐
         │     PruningDecision              │
         ├──────────────────────────────────┤
         │ • branch_id: string              │
         │ • action: 'keep' | 'discard'     │
         │ • reason: string                 │
         │ • evidence: string[]             │
         └──────────────────────────────────┘

         ┌──────────────────────────────────┐
         │     PruningResult                │
         ├──────────────────────────────────┤
         │ • decisions: PruningDecision[]   │
         │ • kept_count: number             │
         │ • discarded_count: number        │
         │ • timestamp: Date                │
         └──────────────────────────────────┘

┌─────────────────────────────────┐
│    PruningLogger (interface)     │
├─────────────────────────────────┤
│ • info(msg, data?): void        │
│ • debug(msg, data?): void       │
│ • warn(msg, data?): void        │
│ • error(msg, data?): void       │
└─────────────────────────────────┘
```

## Rule Decision Tree

```
EVALUATE BRANCH STATE
│
├─► Is state === SOLVED?
│   └─► YES → KEEP ✓ (Rule 1)
│   └─► NO ↓
│
├─► Is state === PROMISING?
│   └─► YES → KEEP ✓ (Rule 2)
│   └─► NO ↓
│
├─► Is state === EXPLORING?
│   └─► YES → KEEP ✓ (Rule 3)
│   └─► NO ↓
│
├─► Is state === DISPROVEN?
│   └─► YES → DISCARD ✗ (Rule 4)
│   └─► NO ↓
│
└─► Is state === STALLED?
    └─► YES
        │
        ├─► Is iterations_without_progress > max_stalled_iterations?
        │   └─► YES → DISCARD ✗ (Rule 5a)
        │   └─► NO ↓
        │
        ├─► Is confidence < min_confidence_threshold?
        │   └─► YES → DISCARD ✗ (Rule 5b)
        │   └─► NO ↓
        │
        └─► → KEEP ✓ (Rule 5c)
```

## Logging Architecture

```
PruningEngine
    │
    ├─► evaluateBranch()
    │   └─► debug: "Evaluating branch"
    │
    └─► pruneBranches()
        ├─► info: "Starting pruning operation"
        ├─► debug: "Validating configuration"
        ├─► promise.all() [parallel evaluations]
        │   └─► each branch → debug/info/warn
        ├─► info: "Pruning operation completed"
        ├─► info: "Discarded branches" (if any)
        └─► return PruningResult
```

### Log Example

```
[Pruning] INFO: Starting pruning operation
  { total_branches: 20, config: { max_stalled_iterations: 5, ... } }

[Pruning] DEBUG: Evaluating branch
  { branch_id: "b1", state: "EXPLORING", confidence: 0.7, ... }

[Pruning] INFO: Branch keep:
  { branch_id: "b1", reason: "Branch is being actively explored", ... }

[Pruning] WARN: Branch discard:
  { branch_id: "b5", reason: "Stalled for 6 iterations...", evidence: [...] }

[Pruning] INFO: Pruning operation completed
  { total_branches: 20, kept_count: 15, discarded_count: 5, timestamp: "2025-12-02T10:30:00Z" }

[Pruning] INFO: Discarded branches
  { count: 5, branches: ["b5", "b8", "b12", "b14", "b18"] }
```

## Configuration Space

```
┌─────────────────────────────────────────────────┐
│     Configuration Presets                       │
├─────────────────────────────────────────────────┤
│                                                 │
│  CONSERVATIVE (wide exploration)               │
│  ├─ max_stalled: 10 (lenient)                  │
│  ├─ min_confidence: 0.2 (low bar)              │
│  └─ progress_interval: 5                       │
│                                                 │
│  DEFAULT (balanced)                            │
│  ├─ max_stalled: 5 (moderate)                  │
│  ├─ min_confidence: 0.3 (moderate bar)         │
│  └─ progress_interval: 3                       │
│                                                 │
│  AGGRESSIVE (fast convergence)                 │
│  ├─ max_stalled: 3 (strict)                    │
│  ├─ min_confidence: 0.5 (high bar)             │
│  └─ progress_interval: 2                       │
│                                                 │
└─────────────────────────────────────────────────┘

            More Exploration ◄────────► Faster Pruning
            (Wider Beam)                 (Narrower Beam)
```

## State Machine

```
┌──────────────┐
│   SOLVED     │  (terminal, always keep)
└──────────────┘

┌──────────────┐
│  PROMISING   │  (high potential, always keep)
└──────────────┘

┌──────────────┐
│ EXPLORING    │  (active search, always keep)
└──────────────┘

┌──────────────┐         ┌──────────────────────┐
│   STALLED    │ ◄──────► │  Evaluation Rule 5   │
└──────────────┘         ├──────────────────────┤
                         │ • Check iteration ct │
                         │ • Check confidence   │
                         │ • Decide keep/disc   │
                         └──────────────────────┘

┌──────────────┐
│ DISPROVEN    │  (hard evidence, always discard)
└──────────────┘
```

## Memory Model

```
Input: branches[] (Branch[])
  │
  ├─ O(1) per branch for reading state
  ├─ O(1) per branch for state checking
  └─ O(evidence.length) for evidence extraction

During: pruneBranches()
  │
  ├─ decisions[]: O(branches.length) array
  ├─ promise array: O(branches.length) for Promise.all()
  └─ no mutation of input branches (immutable)

Output: PruningResult
  │
  ├─ decisions[]: O(branches.length)
  ├─ summary counters: O(1)
  └─ timestamp: O(1)

Total Space: O(n) where n = branches.length
```

## Error Handling

```
PruningEngine.pruneBranches()
│
├─► validatePruningConfig()
│   ├─► max_stalled_iterations < 1?
│   │   └─► throw Error
│   ├─► min_confidence_threshold not in [0,1]?
│   │   └─► throw Error
│   └─► require_progress_every_n_iterations < 1?
│       └─► throw Error
│
└─► Promise.all() handles async errors
    └─► rejects if any evaluateBranch() fails
```

## Type Safety

```
No 'any' types throughout module

Branch structure validated at:
  ├─ Input (type annotation)
  ├─ Evaluation (state check)
  ├─ Decision creation (union type for action)
  └─ Output (interface export)

Evidence strings formatted with:
  ├─ ${variable} interpolation
  └─ No unsafe concatenation

Enum validation ensures:
  ├─ Only valid BranchState values used
  └─ Type checker catches invalid states at compile-time
```

## Concurrency Model

```
pruneBranches(branches: Branch[], config: PruningConfig)
│
├─► Promise.all()
│   │
│   ├─► evaluateBranch(branch[0], config)  ┐
│   ├─► evaluateBranch(branch[1], config)  │ Parallel
│   ├─► evaluateBranch(branch[2], config)  │ Execution
│   └─► evaluateBranch(branch[n], config)  ┘
│
└─► Wait for all promises to resolve
    └─► Aggregate results into PruningResult
```

No shared state mutation → Safe for concurrent evaluation

## Export Structure

```
pruning.ts exports:
│
├─ Classes
│   └─ PruningEngine
│
├─ Enums
│   └─ BranchState (SOLVED, PROMISING, EXPLORING, STALLED, DISPROVEN)
│
├─ Interfaces
│   ├─ PruningConfig
│   ├─ PruningDecision
│   ├─ PruningResult
│   ├─ Branch
│   ├─ BranchMetrics
│   ├─ BranchEvidence
│   └─ PruningLogger
│
├─ Functions
│   ├─ createPruningEngine()
│   └─ createPruningEngineWithLogger()
│
├─ Constants
│   ├─ DEFAULT_PRUNING_CONFIG
│   ├─ CONSERVATIVE_PRUNING_CONFIG
│   └─ AGGRESSIVE_PRUNING_CONFIG
│
└─ Default Export
    └─ PruningEngine (class)

All re-exported from package index.ts for convenience
```

## Integration Points

```
MDAP Beam Search ──► PruningEngine
      │                    │
      ├─ provides ────────► Branch[]
      │   (state metrics)
      │
      ├─ configures ──────► PruningConfig
      │   (iteration budget)
      │
      └─ receives ◄─────── PruningResult
          (keep/discard decisions)
```
