# Iterative Build-Test-Fix Workflow System

## Overview

The Iterative Build-Test-Fix Workflow system provides intelligent orchestration for fullstack feature development with continuous testing, automated fix coordination, and convergence detection.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│        Iterative Build-Test-Fix Cycle              │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─────────────┐    ┌──────────────┐              │
│  │   Coding    │───▶│   Testing    │              │
│  │  Phase      │    │    Phase     │              │
│  └─────────────┘    └──────────────┘              │
│         │                   │                      │
│         │                   ▼                      │
│         │          ┌──────────────┐                │
│         │          │ Convergence  │                │
│         │          │  Detection   │                │
│         │          └──────────────┘                │
│         │                   │                      │
│         │        No         │ Yes                  │
│         │     ◀─────────────┴──────▶ Complete     │
│         │     │                                    │
│         ▼     ▼                                    │
│  ┌─────────────┐    ┌──────────────┐              │
│  │   Fixing    │───▶│ Validation   │              │
│  │   Phase     │    │    Phase     │              │
│  └─────────────┘    └──────────────┘              │
│                                                     │
└─────────────────────────────────────────────────────┘
```

## Key Components

### 1. IterativeBuildTestWorkflow

Main coordinator that orchestrates the complete iteration cycle.

**Features:**
- Parallel frontend/backend development
- Continuous test execution
- Intelligent phase management
- Progress tracking
- Convergence detection integration

**Usage:**

```typescript
import { IterativeBuildTestWorkflow } from './src/swarm-fullstack/workflows/iterative-build-test.js';
import { SwarmMemoryManager } from './src/memory/swarm-memory.js';
import { Logger } from './src/core/logger.js';

// Initialize
const memory = new SwarmMemoryManager();
await memory.initialize();

const workflow = new IterativeBuildTestWorkflow(
  {
    maxIterations: 10,
    maxIterationDuration: 1800000, // 30 minutes
    convergenceThreshold: 0.95, // 95% tests passing
    minTestCoverage: 80,
    parallelExecution: true,
    enableRegressionTesting: true,
    maxParallelFixes: 5,
  },
  memory,
  new Logger('workflow'),
);

// Start workflow
const iteration = await workflow.startIterativeWorkflow(
  'feature-id',
  team,
  requirements,
);

// Monitor progress
const progress = workflow.getWorkflowProgress('feature-id');
console.log(`Iteration: ${progress.currentIteration}`);
console.log(`Progress: ${progress.overallProgress}%`);
console.log(`Convergence: ${progress.convergenceScore}`);
```

### 2. FixCoordinator

Intelligently analyzes test failures and coordinates fixes.

**Features:**
- Automatic failure categorization
- Agent assignment based on expertise
- Parallel fix execution
- Dependency management
- Fix pattern learning

**Usage:**

```typescript
import { FixCoordinator } from './src/swarm-fullstack/workflows/fix-coordinator.js';

const coordinator = new FixCoordinator(memory, logger);

// Create fix plan
const plan = await coordinator.createFixPlan(testFailures, 'feature-id');

console.log(`Fix strategies: ${plan.fixStrategies.length}`);
console.log(`Estimated duration: ${plan.estimatedDuration}ms`);

// Execute fixes
const results = await coordinator.executeFixes(plan, 5); // max 5 parallel

// Check results
const successfulFixes = results.filter(r => r.status === 'completed');
console.log(`Fixed: ${successfulFixes.length}/${results.length}`);
```

### 3. ConvergenceDetector

Determines when an iteration has converged and is ready to proceed.

**Features:**
- Multi-dimensional convergence analysis
- Quality gate validation
- Trend analysis
- Early convergence detection
- Divergence warnings

**Usage:**

```typescript
import { ConvergenceDetector } from './src/swarm-fullstack/workflows/convergence-detector.js';

const detector = new ConvergenceDetector(logger, {
  threshold: 0.95,
  minCoverage: 80,
  requireStability: true,
  stabilityWindow: 2,
  enableTrendAnalysis: true,
});

// Check convergence
const result = await detector.checkConvergence({
  testResults,
  threshold: 0.95,
  minCoverage: 80,
  iterationNumber: 3,
});

if (result.converged) {
  console.log('✅ Converged! Ready to proceed.');
  console.log(`Score: ${result.score}`);
  console.log(`Confidence: ${result.confidence}`);
} else {
  console.log('❌ Not converged yet');
  console.log('Recommendations:', result.recommendations);
  console.log('Blockers:', result.blockers);
}
```

### 4. WorkflowMetrics

Tracks comprehensive performance metrics across iterations.

**Features:**
- Real-time metrics calculation
- Trend analysis
- Efficiency scoring
- Quality assessment
- Aggregate reporting

**Usage:**

```typescript
import { WorkflowMetrics } from './src/swarm-fullstack/workflows/workflow-metrics.js';

const metrics = new WorkflowMetrics(logger);

// Calculate metrics for iteration
const iterationMetrics = await metrics.calculateIterationMetrics(iteration);

console.log(`Duration: ${iterationMetrics.duration}ms`);
console.log(`Test Pass Rate: ${iterationMetrics.testPassRate * 100}%`);
console.log(`Fix Success Rate: ${iterationMetrics.fixSuccessRate * 100}%`);
console.log(`Quality Score: ${iterationMetrics.qualityScore}`);

// Get aggregate metrics
const aggregate = metrics.getAggregateMetrics('feature-id');

console.log(`Total Iterations: ${aggregate.totalIterations}`);
console.log(`Average Time: ${aggregate.averageIterationTime}ms`);
console.log(`Overall Pass Rate: ${aggregate.overallPassRate * 100}%`);
```

### 5. TestResultAnalyzer

Analyzes test results to provide actionable insights.

**Features:**
- Failure pattern recognition
- Root cause analysis
- Impact assessment
- Priority classification
- Suggested fix strategies

**Usage:**

```typescript
import { TestResultAnalyzer } from './src/swarm-fullstack/workflows/test-result-analyzer.js';

const analyzer = new TestResultAnalyzer(logger);

// Analyze failures
const analysis = await analyzer.analyzeFailures(testResults);

console.log(`Total Failures: ${analysis.summary.totalFailures}`);
console.log(`Critical: ${analysis.summary.criticalFailures}`);

// View patterns
for (const pattern of analysis.patterns) {
  console.log(`Pattern: ${pattern.description}`);
  console.log(`Occurrences: ${pattern.occurrences}`);
  console.log(`Suggested Fix: ${pattern.suggestedFix}`);
}

// View root causes
for (const cause of analysis.rootCauses) {
  console.log(`Root Cause: ${cause.description}`);
  console.log(`Confidence: ${cause.confidence}`);
  console.log(`Solutions:`, cause.potentialSolutions);
}
```

### 6. RegressionTestManager

Manages regression testing and incremental test selection.

**Features:**
- Baseline management
- Regression detection
- Incremental test selection
- Impact analysis
- Test result comparison

**Usage:**

```typescript
import { RegressionTestManager } from './src/swarm-fullstack/workflows/regression-test-manager.js';

const manager = new RegressionTestManager(logger);

// Store baseline
manager.storeBaseline('feature-id', testResults);

// Run regression tests
const regressionResult = await manager.runRegressionTests({
  featureId: 'feature-id',
  current: newTestResults,
});

if (regressionResult.regressionDetected) {
  console.log(`⚠️  Regression detected: ${regressionResult.severity}`);
  console.log(`Regressions: ${regressionResult.regressions.length}`);

  for (const regression of regressionResult.regressions) {
    console.log(`- ${regression.testName}: ${regression.suggestedAction}`);
  }
} else {
  console.log('✅ No regressions detected');
}

// Create incremental test plan
const plan = await manager.createIncrementalTestPlan(
  'feature-id',
  changedFiles,
  allTests,
);

console.log(`Selected ${plan.selectedTests.length}/${plan.totalTests} tests`);
console.log(`Coverage: ${plan.coverage}%`);
```

## Complete Workflow Example

```typescript
import {
  IterativeBuildTestWorkflow,
  FixCoordinator,
  ConvergenceDetector,
  WorkflowMetrics,
  TestResultAnalyzer,
  RegressionTestManager,
} from './src/swarm-fullstack/workflows/index.js';

async function runFeatureDevelopment() {
  // Initialize components
  const memory = new SwarmMemoryManager();
  await memory.initialize();

  const workflow = new IterativeBuildTestWorkflow(
    {
      maxIterations: 10,
      convergenceThreshold: 0.95,
      minTestCoverage: 80,
      parallelExecution: true,
      enableRegressionTesting: true,
      maxParallelFixes: 5,
    },
    memory,
    logger,
  );

  // Define team
  const team = {
    swarmId: 'feature-swarm-001',
    feature: 'user-authentication',
    complexity: 'moderate',
    agents: [
      { type: 'frontend-developer', capabilities: ['react', 'typescript'] },
      { type: 'backend-developer', capabilities: ['node', 'express', 'auth'] },
      { type: 'qa-engineer', capabilities: ['testing', 'automation'] },
    ],
    estimatedDuration: 3600000,
    requiredSkills: ['frontend', 'backend', 'testing'],
    resourceLimits: {
      maxAgents: 10,
      maxCpuPerAgent: 80,
      maxMemoryPerAgent: 512,
      timeoutMinutes: 60,
    },
  };

  // Start workflow
  console.log('🚀 Starting iterative workflow...');
  const iteration = await workflow.startIterativeWorkflow(
    'user-authentication',
    team,
    {
      requirements: [
        'Implement user login',
        'Add JWT authentication',
        'Create user registration',
        'Add password reset',
      ],
    },
  );

  // Monitor progress
  const progressInterval = setInterval(() => {
    const progress = workflow.getWorkflowProgress('user-authentication');
    if (!progress) return;

    console.log(`\n📊 Progress Update:`);
    console.log(`  Iteration: ${progress.currentIteration}/${progress.totalIterations}`);
    console.log(`  Phase: ${progress.currentPhase}`);
    console.log(`  Overall Progress: ${progress.overallProgress.toFixed(1)}%`);
    console.log(`  Convergence Score: ${progress.convergenceScore.toFixed(2)}`);
    console.log(`  Test Pass Rate: ${(progress.testPassRate * 100).toFixed(1)}%`);

    if (progress.blockers.length > 0) {
      console.log(`  ⚠️  Blockers:`, progress.blockers);
    }
  }, 5000);

  // Wait for completion
  workflow.on('workflow:completed', ({ featureId, iteration }) => {
    clearInterval(progressInterval);
    console.log(`\n✅ Workflow completed for ${featureId}`);
    console.log(`  Total Iterations: ${iteration.iterationNumber}`);
    console.log(`  Final Convergence Score: ${iteration.convergenceScore}`);
    console.log(`  Duration: ${new Date(iteration.endTime!).getTime() - new Date(iteration.startTime).getTime()}ms`);
  });

  workflow.on('workflow:failed', ({ featureId, iteration, error }) => {
    clearInterval(progressInterval);
    console.error(`\n❌ Workflow failed for ${featureId}:`, error);
  });
}

// Run workflow
runFeatureDevelopment().catch(console.error);
```

## Event Listeners

The workflow system emits various events for monitoring and coordination:

```typescript
// Workflow events
workflow.on('workflow:started', ({ featureId, iteration }) => {
  console.log(`Workflow started: ${featureId}`);
});

workflow.on('workflow:completed', ({ featureId, iteration }) => {
  console.log(`Workflow completed: ${featureId}`);
});

workflow.on('workflow:failed', ({ featureId, iteration, error }) => {
  console.error(`Workflow failed: ${featureId}`, error);
});

workflow.on('phase:completed', ({ featureId, phase }) => {
  console.log(`Phase completed: ${phase}`);
});

workflow.on('iteration:completed', ({ iteration }) => {
  console.log(`Iteration ${iteration.iterationNumber} completed`);
});

// Fix coordinator events
fixCoordinator.on('fix:completed', ({ fix }) => {
  console.log(`Fix completed: ${fix.id}`);
});

// Convergence detector events
convergenceDetector.on('convergence:achieved', ({ iteration, score }) => {
  console.log(`Convergence achieved at iteration ${iteration}: ${score}`);
});

convergenceDetector.on('convergence:diverging', ({ iteration, riskFactors }) => {
  console.warn(`Warning: Convergence diverging at iteration ${iteration}`);
});

// Regression manager events
regressionManager.on('regression:detected', ({ featureId, severity }) => {
  console.warn(`Regression detected in ${featureId}: ${severity}`);
});

regressionManager.on('regression:improvements', ({ featureId, improvements }) => {
  console.log(`Improvements detected: ${improvements} fixes`);
});
```

## Configuration Options

### IterativeBuildTestWorkflow Config

```typescript
{
  maxIterations: number;              // Maximum iteration cycles (default: 10)
  maxIterationDuration: number;       // Max time per iteration in ms (default: 1800000)
  convergenceThreshold: number;       // Required pass rate 0-1 (default: 0.95)
  minTestCoverage: number;            // Minimum coverage % (default: 80)
  parallelExecution: boolean;         // Enable parallel work (default: true)
  enableRegressionTesting: boolean;   // Enable regression tests (default: true)
  enableProgressiveValidation: boolean; // Enable progressive checks (default: true)
  maxParallelFixes: number;           // Max parallel fixes (default: 5)
}
```

### ConvergenceDetector Config

```typescript
{
  threshold: number;                  // Convergence threshold 0-1 (default: 0.95)
  minCoverage: number;                // Min coverage % (default: 80)
  requireStability: boolean;          // Require stable results (default: true)
  stabilityWindow: number;            // Iterations to check (default: 2)
  enableTrendAnalysis: boolean;       // Enable trend analysis (default: true)
  qualityGates: QualityGate[];        // Custom quality gates
}
```

### RegressionTestManager Config

```typescript
{
  enableBaselineComparison: boolean;  // Enable baseline comparison (default: true)
  enableIncrementalTesting: boolean;  // Enable incremental tests (default: true)
  regressionThreshold: number;        // % threshold for regression (default: 5)
  requireApprovalForRegression: boolean; // Require approval (default: true)
}
```

## Performance Targets

- **Average 3-5 iterations per feature**
- **<30 min per iteration cycle**
- **>95% test pass rate before deployment**
- **Zero breaking changes between iterations**
- **<100ms convergence detection**
- **<200ms fix plan creation**

## Best Practices

1. **Start with baseline**: Always establish a baseline before making changes
2. **Monitor convergence**: Watch convergence trends to detect issues early
3. **Fix critical first**: Address critical failures before moving to lower priorities
4. **Enable regression testing**: Always run regression tests after fixes
5. **Use incremental testing**: Optimize test execution time with incremental selection
6. **Track metrics**: Monitor metrics to identify bottlenecks and improvements
7. **Review patterns**: Learn from failure patterns to prevent future issues
8. **Parallel execution**: Enable parallel work for faster iteration cycles

## Troubleshooting

### Workflow Not Converging

```typescript
// Check convergence status
const detector = new ConvergenceDetector(logger);
const status = detector.getStatus();

if (status.trend === 'declining') {
  console.log('⚠️  Convergence is declining');
  // Review recent fixes and consider different approach
}
```

### High Iteration Count

```typescript
// Review iteration metrics
const metrics = new WorkflowMetrics(logger);
const aggregate = metrics.getAggregateMetrics('feature-id');

if (aggregate.totalIterations > 7) {
  console.log('⚠️  High iteration count - may indicate design issues');
  // Consider refactoring approach
}
```

### Frequent Regressions

```typescript
// Review regression history
const history = regressionManager.getRegressionHistory('feature-id');
const frequentRegressions = history.filter(r => r.regressionDetected);

if (frequentRegressions.length > 3) {
  console.log('⚠️  Frequent regressions detected');
  // Review fix strategies and test coverage
}
```

## Integration with Fullstack Orchestrator

The workflow system integrates seamlessly with the FullstackOrchestrator:

```typescript
import { FullStackOrchestrator } from './src/swarm-fullstack/core/fullstack-orchestrator.js';

const orchestrator = new FullStackOrchestrator(config, logger);

// Orchestrator uses workflow internally
const status = await orchestrator.developFeature({
  id: 'feature-1',
  name: 'User Authentication',
  description: 'Implement user auth system',
  requirements: {
    frontend: ['Login UI', 'Registration form'],
    backend: ['Auth API', 'JWT tokens'],
    testing: ['Unit tests', 'E2E tests'],
  },
  constraints: {
    timeline: 86400000, // 24 hours
    quality: 'high',
  },
});
```

## Next Steps

1. Review component documentation
2. Explore example workflows
3. Customize configuration for your use case
4. Monitor and optimize iteration cycles
5. Build on the workflow system for custom needs