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

// CFN Loop Tasks - Orchestrator (Coordinator)
export { cfnOrchestratorTask } from "./cfn-orchestrator.js";
export type { OrchestratorPayload, OrchestratorResult } from "./cfn-orchestrator.js";

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
