/**
 * Fullstack Swarm Workflows - Exports
 *
 * Comprehensive workflow system for iterative build-test-fix cycles
 * with intelligent coordination, testing, and convergence detection.
 */

// Main workflow engine
export {
  IterativeBuildTestWorkflow,
  type IterationConfig,
  type FeatureIteration,
  type IterationPhase,
  type IterationActivity,
  type TestExecutionResult,
  type TestFailure,
  type TestWarning,
  type FixExecutionResult,
  type CodeChange,
  type ValidationResult,
  type IterationMetrics,
  type WorkflowProgress,
} from './iterative-build-test.js';

// Fix coordination
export {
  FixCoordinator,
  type FixPlan,
  type FixStrategy,
  type FixPriority,
  type FixPattern,
} from './fix-coordinator.js';

// Convergence detection
export {
  ConvergenceDetector,
  type ConvergenceConfig,
  type ConvergenceCheck,
  type ConvergenceResult,
  type ConvergenceMetrics,
  type QualityGate,
  type QualityGateResult,
  type TrendAnalysis,
} from './convergence-detector.js';

// Metrics tracking
export {
  WorkflowMetrics,
  type MetricSnapshot,
  type MetricTrends,
  type AggregateMetrics,
} from './workflow-metrics.js';

// Test result analysis
export {
  TestResultAnalyzer,
  type FailureAnalysis,
  type FailureSummary,
  type FailurePattern,
  type RootCause,
  type AnalysisRecommendation,
  type ImpactAssessment,
} from './test-result-analyzer.js';

// Regression testing
export {
  RegressionTestManager,
  type RegressionTestConfig,
  type RegressionTestRequest,
  type RegressionTestResult,
  type RegressionSummary,
  type Regression,
  type Improvement,
  type IncrementalTestPlan,
} from './regression-test-manager.js';