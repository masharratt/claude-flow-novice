# Decomposition Merger Test Suite

## Overview

This directory contains tests for **Phase 2 Task 2.2: Sequential Merger & Context Refinement** from the Decomposition Swarm RuVector Implementation Plan.

## Test Coverage

### merger.test.ts (5 test cases)

Tests the sequential context refinement merger:

1. **Basic Refinement Flow** - Validates that tasks are refined sequentially through all 4 stages (architecture → security → performance → testing)
2. **New Tasks at Later Stages** - Ensures new security/performance/testing tasks are added without duplicating existing ones
3. **Constraint Completeness Metric** - Verifies constraint completeness calculation (% of tasks with all 4 perspective constraints)
4. **Refinement History Tracking** - Confirms refinement history is tracked with timestamps for each stage
5. **Natural Deduplication** - Tests fuzzy matching algorithm (no explicit deduplication rules needed)

**Key assertions:**
- Final task count in range 12-16 (target)
- Tasks refined, not duplicated
- Each task accumulates constraints from all perspectives
- Refinement history tracked correctly

### execution-phase-planner.test.ts (10 test cases)

Tests execution phase planning and dependency management:

1. **Linear Dependencies** - Sequential execution for linear task chains
2. **Parallel Execution Opportunities** - Groups independent tasks into parallel phases
3. **Diamond Dependency Pattern** - Handles diamond-shaped dependencies correctly
4. **Complex Multi-Level Dependencies** - Validates complex dependency graphs with multiple levels
5. **Critical Path Identification** - Identifies longest execution path correctly
6. **Circular Dependency Detection** - Detects and rejects circular dependencies
7. **Self-Dependency Detection** - Handles self-referencing dependencies
8. **Missing Dependency References** - Gracefully handles missing dependencies (warning logged)
9. **Isolated Tasks** - Groups all independent tasks into one parallel phase
10. **Parallelism Score Calculation** - Validates parallelism scoring algorithm

**Key assertions:**
- Valid execution phases (no circular dependencies)
- Correct topological ordering
- Critical path identification
- Parallelism metrics

### quality-metrics.test.ts (5 test cases)

Tests quality metrics and sequential vs parallel comparison:

1. **Task Count Within Target** - High score when task count is 12-16
2. **Coverage Score Calculation** - Validates perspective coverage calculation (% of tasks with each constraint type)
3. **Deduplication Effectiveness** - Measures reduction from estimated parallel task count
4. **Sequential > Parallel Comparison** - Demonstrates sequential approach is better than parallel
5. **Execution Quality Metrics** - Analyzes execution plan quality (phases, duration, parallelism)

**Key assertions:**
- Sequential task count < parallel estimate
- Coverage score reflects constraint integration
- Deduplication percentage calculated correctly
- Sequential approach scores higher than parallel

## Running Tests

### Run all decomposition tests
```bash
npm test -- tests/decomposition
```

### Run specific test file
```bash
npm test -- tests/decomposition/merger.test.ts
npm test -- tests/decomposition/execution-phase-planner.test.ts
npm test -- tests/decomposition/quality-metrics.test.ts
```

### Run with coverage
```bash
npm test -- --coverage tests/decomposition
```

### Run in watch mode
```bash
npm test -- --watch tests/decomposition
```

## Success Criteria

All tests must pass with the following validations:

✅ Context flows correctly through all 4 decomposers
✅ Micro-tasks refined at each stage (not duplicated)
✅ Final micro-task count 12-16 (higher quality than parallel)
✅ Each micro-task includes arch + security + perf + testing constraints
✅ Natural deduplication through refinement (no explicit rules)
✅ Execution phases valid (no circular dependencies)
✅ Quality scores higher than parallel decomposition
✅ Metrics demonstrate sequential approach advantage

## Implementation Files

The tests validate these implementation files:

- `src/lib/decomposition-merger.ts` - Sequential context refinement algorithm
- `src/lib/execution-phase-planner.ts` - Dependency-aware execution planning
- `src/lib/decomposition-quality-metrics.ts` - Quality metrics and comparison

## Integration

These components integrate with the existing decomposition swarm:

1. **Input**: Outputs from 4 decomposers (architecture, security, performance, testing)
2. **Processing**: Sequential refinement → execution planning → quality analysis
3. **Output**: Unified micro-tasks with execution plan and quality metrics

## Metrics Targets

- **Task Count**: 12-16 tasks (vs 40+ for parallel approach)
- **Constraint Completeness**: >80% of tasks with all 4 constraints
- **Deduplication**: >60% reduction vs parallel estimate
- **Coverage Score**: >0.75 (75% average constraint coverage)
- **Parallelism Score**: >0.5 (efficient execution planning)

## Related Documentation

- Implementation Plan: `planning/DECOMPOSITION_SWARM_RUVECTOR_IMPLEMENTATION_PLAN.md` (lines 593-687)
- Phase 2 Task 2.2: Sequential Merger and Context Refinement
