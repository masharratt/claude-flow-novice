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

// CFN Loop Tasks - Strategic Coordinator (Phase 3 v2)
export { cfnCoordinatorTask } from "./cfn-coordinator.js";
export type {
  CoordinatorPayload,
  CoordinatorResult,
  AgentManifest,
  Phase,
  AgentDefinition,
  TaskPattern,
  AgentType,
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
