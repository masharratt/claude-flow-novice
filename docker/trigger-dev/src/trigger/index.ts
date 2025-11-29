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

// CFN Loop Tasks - Orchestrator (Coordinator)
export { cfnOrchestratorTask } from "./cfn-orchestrator.js";
export type { OrchestratorPayload, OrchestratorResult } from "./cfn-orchestrator.js";

// CFN Loop Tasks - Orchestrator v2 (Deterministic with Redis BLPOP coordination)
export { cfnOrchestratorV2Task } from "./cfn-orchestrator-v2.js";
export type { OrchestratorV2Payload, OrchestratorV2Result } from "./cfn-orchestrator-v2.js";

// CFN Loop Tasks - Strategic Coordinator (Phase 3 v3 - Decomposition Swarm)
export { cfnCoordinatorTask } from "./cfn-coordinator.js";
export type {
  CFNCoordinatorPayload,
  CFNCoordinatorResult,
} from "./cfn-coordinator.js";

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

// CFN Decomposition Swarm - Specialized Decomposers
export { cfnArchitectureDecomposerTask } from "./cfn-architecture-decomposer.js";
export type {
  ArchitectureDecomposerPayload,
  ArchitectureAnalysis,
} from "./cfn-architecture-decomposer.js";

export { cfnSecurityDecomposerTask } from "./cfn-security-decomposer.js";
export type {
  SecurityDecomposerPayload,
  SecurityAnalysis,
} from "./cfn-security-decomposer.js";

export { cfnPerformanceDecomposerTask } from "./cfn-performance-decomposer.js";
export type {
  PerformanceDecomposerPayload,
  PerformanceAnalysis,
} from "./cfn-performance-decomposer.js";

export { cfnTestingDecomposerTask } from "./cfn-testing-decomposer.js";
export type {
  TestingDecomposerPayload,
  TestingAnalysis,
} from "./cfn-testing-decomposer.js";

// CFN Decomposition Aggregator - Orchestrates 4 decomposers and merges results
export { cfnDecompositionAggregatorTask } from "./cfn-decomposition-aggregator.js";
export type {
  DecompositionAggregatorPayload,
  DecompositionPlan,
  UnifiedMicroTask,
  ExecutionPhase,
} from "./cfn-decomposition-aggregator.js";
