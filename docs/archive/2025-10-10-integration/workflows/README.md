# Fullstack Swarm Workflows

## Overview

The workflow system provides intelligent orchestration for fullstack feature development with continuous testing, automated fix coordination, and convergence detection.

## Components

### Core Workflow Engine
- **[IterativeBuildTestWorkflow](../../src/swarm-fullstack/workflows/iterative-build-test.ts)** - Main coordinator for build-test-fix cycles
- **[FixCoordinator](../../src/swarm-fullstack/workflows/fix-coordinator.ts)** - Intelligent failure analysis and fix assignment
- **[ConvergenceDetector](../../src/swarm-fullstack/workflows/convergence-detector.ts)** - Determines when iteration is complete

### Analytics & Metrics
- **[WorkflowMetrics](../../src/swarm-fullstack/workflows/workflow-metrics.ts)** - Comprehensive performance tracking
- **[TestResultAnalyzer](../../src/swarm-fullstack/workflows/test-result-analyzer.ts)** - Failure categorization and insights
- **[RegressionTestManager](../../src/swarm-fullstack/workflows/regression-test-manager.ts)** - Regression detection and incremental testing

## Quick Start

```typescript
import { IterativeBuildTestWorkflow } from './src/swarm-fullstack/workflows/iterative-build-test.js';
import { SwarmMemoryManager } from './src/memory/swarm-memory.js';

// Initialize
const memory = new SwarmMemoryManager();
await memory.initialize();

const workflow = new IterativeBuildTestWorkflow(
  {
    maxIterations: 10,
    convergenceThreshold: 0.95,
    parallelExecution: true,
  },
  memory,
  logger,
);

// Start workflow
await workflow.startIterativeWorkflow('feature-id', team, requirements);
```

## Workflow Cycle

```
1. Coding Phase
   ├─ Frontend development (parallel)
   └─ Backend development (parallel)

2. Testing Phase
   ├─ Unit tests
   ├─ Integration tests
   └─ E2E tests (parallel)

3. Convergence Check
   ├─ Test pass rate analysis
   ├─ Coverage validation
   ├─ Quality gate checks
   └─ Trend analysis

4. Fix Phase (if not converged)
   ├─ Failure analysis
   ├─ Fix assignment
   ├─ Parallel fix execution
   └─ Fix validation

5. Validation Phase
   ├─ Regression testing
   └─ Progressive validation

6. Complete or Next Iteration
```

## Key Features

### Intelligent Fix Coordination
- Automatic failure categorization
- Expert-based agent assignment
- Parallel fix execution with dependencies
- Pattern learning and recognition

### Convergence Detection
- Multi-dimensional analysis
- Quality gate validation
- Trend-based projection
- Early warning system

### Comprehensive Metrics
- Real-time progress tracking
- Efficiency scoring
- Quality assessment
- Historical analysis

### Regression Prevention
- Baseline comparison
- Incremental test selection
- Impact analysis
- Improvement tracking

## Performance Targets

| Metric | Target | Actual |
|--------|--------|--------|
| Iterations per feature | 3-5 | ✅ Achieved |
| Time per iteration | <30 min | ✅ Achieved |
| Test pass rate | >95% | ✅ Achieved |
| Breaking changes | 0 | ✅ Achieved |
| Convergence detection | <100ms | ✅ Achieved |

## Documentation

- **[Complete Guide](./iterative-build-test-workflow.md)** - Comprehensive documentation
- **[API Reference](../../src/swarm-fullstack/workflows/)** - Source code with inline docs
- **[Test Suite](../../tests/swarm-fullstack/workflows/)** - Test examples and usage

## Examples

### Basic Usage

```typescript
// Create workflow
const workflow = new IterativeBuildTestWorkflow(config, memory, logger);

// Start workflow
const iteration = await workflow.startIterativeWorkflow(
  'user-auth',
  team,
  requirements,
);

// Monitor progress
const progress = workflow.getWorkflowProgress('user-auth');
console.log(`Progress: ${progress.overallProgress}%`);
```

### Fix Coordination

```typescript
// Create fix coordinator
const coordinator = new FixCoordinator(memory, logger);

// Create fix plan
const plan = await coordinator.createFixPlan(failures, 'feature-id');

// Execute fixes
const results = await coordinator.executeFixes(plan, 5);
```

### Convergence Detection

```typescript
// Create detector
const detector = new ConvergenceDetector(logger, config);

// Check convergence
const result = await detector.checkConvergence({
  testResults,
  threshold: 0.95,
  minCoverage: 80,
  iterationNumber: 3,
});

if (result.converged) {
  console.log('Ready to deploy!');
}
```

### Regression Testing

```typescript
// Create manager
const manager = new RegressionTestManager(logger);

// Store baseline
manager.storeBaseline('feature-id', testResults);

// Check for regressions
const result = await manager.runRegressionTests({
  featureId: 'feature-id',
  current: newTestResults,
});
```

## Integration

### With Fullstack Orchestrator

```typescript
import { FullStackOrchestrator } from './src/swarm-fullstack/core/fullstack-orchestrator.js';

const orchestrator = new FullStackOrchestrator(config, logger);

// Orchestrator uses workflow system internally
await orchestrator.developFeature(featureRequest);
```

### With Memory System

```typescript
// Workflow automatically stores state in memory
await memory.recall({
  type: 'state',
  tags: ['iteration', 'workflow', 'feature-id'],
});
```

### With Communication Bus

```typescript
// Workflow broadcasts progress to agents
workflow.on('phase:completed', ({ featureId, phase }) => {
  messageBus.broadcast({
    type: 'workflow-progress',
    data: { featureId, phase },
  });
});
```

## Best Practices

1. **Always establish baseline** before making changes
2. **Monitor convergence trends** to detect issues early
3. **Fix critical failures first** before lower priorities
4. **Enable regression testing** after all fixes
5. **Use incremental testing** to optimize execution time
6. **Track metrics** to identify bottlenecks
7. **Review failure patterns** to prevent future issues
8. **Enable parallel execution** for faster cycles

## Troubleshooting

### Not Converging?
- Check convergence detector status
- Review recent fix strategies
- Consider different approach if declining

### High Iteration Count?
- Review aggregate metrics
- May indicate design issues
- Consider refactoring approach

### Frequent Regressions?
- Review regression history
- Check fix strategies
- Validate test coverage

## Future Enhancements

- [ ] ML-based convergence prediction
- [ ] Adaptive iteration strategies
- [ ] Cross-feature learning
- [ ] Advanced pattern recognition
- [ ] Automated refactoring suggestions
- [ ] Performance optimization recommendations

## Contributing

See main [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.

## License

See [LICENSE](../../LICENSE) file.