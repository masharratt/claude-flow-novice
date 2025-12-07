/**
 * Trigger.dev v4 Tasks Index
 *
 * Exports all task definitions for Trigger.dev v4 runtime.
 * Includes CFN Loop integration tasks for agent orchestration.
 */

// Original tasks
export { simpleTestTask } from "./simple-test.js";
export { helloWorldTask } from "./hello-world.js";
export { stressTestTask } from "./stress-test.js";

// CFN Loop Tasks - Claude Agent POC
export { claudeAgentTask } from "./claude-agent.js";
export type { ClaudeAgentPayload, ClaudeAgentResult, AIProvider } from "./claude-agent.js";

// CFN Loop Tasks - Implementer (Loop 3)
export { cfnImplementerTask } from "./cfn-implementer.js";
export type { ImplementerPayload, ImplementerResult } from "./cfn-implementer.js";

// CFN Loop Tasks - Test Runner (Gate Check)
export { cfnTestRunnerTask } from "./cfn-test-runner.js";
export type { TestRunnerPayload, TestRunnerResult } from "./cfn-test-runner.js";

// CFN Loop Tasks - Async Validators (Background Execution)
export { cfnAsyncSecurityValidatorTask } from "./cfn-async-security-validator.js";
export type {
  AsyncSecurityValidatorPayload,
  AsyncSecurityValidatorResult,
  SecurityFinding,
} from "./cfn-async-security-validator.js";

export { cfnAsyncPerformanceValidatorTask } from "./cfn-async-performance-validator.js";
export type {
  AsyncPerformanceValidatorPayload,
  AsyncPerformanceValidatorResult,
  PerformanceIssue,
} from "./cfn-async-performance-validator.js";

// CFN Loop Tasks - Gate Check Aggregator
export { cfnGateCheckAggregatorTask } from "./cfn-gate-check-aggregator.js";
export type { GateCheckPayload, GateCheckResult } from "./cfn-gate-check-aggregator.js";

// CFN Loop Tasks - Validator (Loop 2)
export { cfnValidatorTask } from "./cfn-validator.js";
export type { ValidatorPayload, ValidatorResult } from "./cfn-validator.js";

// CFN Loop Tasks - Validator v2 (Phase 3 with Redis signaling)
export { cfnValidatorV2Task } from "./cfn-validator-v2.js";
export type {
  ValidatorV2Payload,
  ValidatorV2Result,
  ReviewOutput,
} from "./cfn-validator-v2.js";

// POC Test Task
export { testClaudePocTask } from "./test-claude-poc.js";

// Z.ai Agent Test Task
export { testZaiAgentTask } from "./test-zai-agent.js";

// Parallel Provider Test Task
export { parallelProviderTestTask } from "./parallel-provider-test.js";

// Real AI Stress Test Task
export { stressTestRealAI } from "./stress-test-real-ai.js";

// Test Coordinator (for UI/CLI triggering)
export { testCoordinatorTask } from "./test-coordinator.js";

// CFN Loop Tasks - Implementer v2 (Phase 3.3 - Redis signaling)
export { cfnImplementerV2Task } from "./cfn-implementer-v2.js";
export type { ImplementerV2Payload, ImplementerV2Result } from "./cfn-implementer-v2.js";
export { buildImplementerPrompt, runAgentTests, calculateConfidence } from "./cfn-implementer-v2.js";

// CFN Loop Tasks - Implementer Cerebras (MDAP v2 - Fast, Cost-Optimized)
export { cfnImplementerCerebrasTask } from "./cfn-implementer-cerebras.js";
export type { ImplementerCerebrasPayload, ImplementerCerebrasResult } from "./cfn-implementer-cerebras.js";

// CFN Loop Tasks - Troubleshooter V2 (Thinking-First Parallel Probing)
export { cfnTroubleshooterV2Task } from "./cfn-troubleshooter-v2.js";
export type { TroubleshooterV2Payload, TroubleshooterV2Result } from "./cfn-troubleshooter-v2.js";

// CFN Thinking-Model-Driven Task Decomposer
export { cfnThinkingDecomposerTask } from "./cfn-thinking-decomposer.js";
export type {
  DecomposerPayload,
  DecomposerResult,
  DecompositionResult,
  MicroTask,
  ValidationCriteria,
} from "./cfn-thinking-decomposer.js";
export {
  performDecomposition,
  generateCacheKey,
  assessComplexity,
  assessRiskLevel,
  detectSecurityImplications,
  detectPerformanceImplications,
} from "./cfn-thinking-decomposer.js";

// Phase 3: Additional Async Validators
export { cfnAsyncTestingValidatorTask } from "./cfn-async-testing-validator.js";
export type {
  AsyncTestingValidatorPayload,
  AsyncTestingValidatorResult,
} from "./cfn-async-testing-validator.js";

export { cfnAsyncArchitectureValidatorTask } from "./cfn-async-architecture-validator.js";
export type {
  AsyncArchitectureValidatorPayload,
  AsyncArchitectureValidatorResult,
} from "./cfn-async-architecture-validator.js";

export { cfnAsyncCodeQualityValidatorTask } from "./cfn-async-code-quality-validator.js";
export type {
  AsyncCodeQualityValidatorPayload,
  AsyncCodeQualityValidatorResult,
} from "./cfn-async-code-quality-validator.js";

// Phase 5: Troubleshooting Decomposer and Smart Error Recovery
export { cfnTroubleshootingDecomposerTask } from "./cfn-troubleshooting-decomposer.js";
export type {
  TroubleshootingInput,
  TroubleshootingAnalysis,
  RootCause,
  TroubleshootingMicroTask,
  SuggestedChange,
} from "./cfn-troubleshooting-decomposer.js";

// CLI Sprint Implementer - Aggregated tasks via Claude CLI (Non-MDAP mode)
export { cfnCLISprintImplementerTask } from "./cfn-cli-sprint-implementer.js";
export type {
  CLISprintImplementerPayload,
  CLISprintImplementerResult,
  Sprint,
  SprintMicroTask,
} from "./cfn-cli-sprint-implementer.js";

// RuVector MDAP Analytics - Intelligent model performance learning
export {
  recordMDAPOutcome,
  analyzeMDAPModelPerformance,
  generatePromptOptimizations,
  queryModelPerformancePatterns,
  selectModelTierWithRuVector,
  captureMDAPFailure,
  getMDAPAnalyticsSummary,
} from "../lib/ruvector-mdap-analytics.js";
export type {
  PerformanceAnalysis as MDAPPerformanceAnalysis,
  PromptOptimization,
  PromptOptimizationResult,
  ModelPerformancePattern,
  MDAPOutcomeInput,
} from "../lib/ruvector-mdap-analytics.js";

// RuVector Schemas - MDAP Performance Entry Types
export type {
  MDAPModelPerformanceEntry,
  PromptOptimizationRecommendationEntry,
} from "../lib/ruvector-schemas.js";
export {
  isMDAPModelPerformanceEntry,
  isPromptOptimizationRecommendationEntry,
} from "../lib/ruvector-schemas.js";
