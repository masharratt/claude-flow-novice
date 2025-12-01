/**
 * CFN Orchestrator v2 - Deterministic Loop Manager
 *
 * Manages the full CFN Loop iteration cycle with:
 * - Mode configuration (mvp, standard, enterprise) with thresholds
 * - Coordinator spawning for task decomposition
 * - Phase execution with Redis BLPOP waiting (not polling!)
 * - Gate check implementation
 * - Validator spawning and consensus collection
 * - Product Owner decision logic (PROCEED/ITERATE/ABORT)
 * - Database tracking via cfn-db
 * - Redis coordination via cfn-redis
 *
 * Reference: planning/trigger/architecture/TRIGGER_CFN_IMPLEMENTATION_PLAN.md Phase 3.2
 */

import { task, tasks, runs } from "@trigger.dev/sdk/v3";
import * as db from "../lib/cfn-db.js";
import * as redis from "../lib/cfn-redis.js";
import { executeCommand } from "../lib/cli-executor.js";

// =============================================
// Type Definitions
// =============================================

/**
 * Input payload for CFN Orchestrator v2
 */
export interface OrchestratorV2Payload {
  /** Description of the task to be implemented */
  taskDescription: string;
  /** Working directory for implementation */
  workDir: string;
  /** Execution mode: mvp (fast), standard (production), enterprise (compliance) */
  mode: "mvp" | "standard" | "enterprise";
  /** Override max iterations (default from mode config) */
  maxIterations?: number;
  /** AI provider to use for all agents */
  provider?: "zai" | "kimi" | "anthropic" | "openrouter" | "gemini" | "xai";
  /** Test command to execute (default: "npm test") */
  testCommand?: string;
  /** Custom implementer agent types (default: standard set) */
  implementerAgents?: string[];
  /** Custom validator agent types (default: standard set) */
  validatorAgents?: string[];
  /** Environment variable overrides */
  _env?: {
    ANTHROPIC_API_KEY?: string;
    ANTHROPIC_BASE_URL?: string;
    ZAI_API_KEY?: string;
    ZAI_BASE_URL?: string;
  };
}

/**
 * Output result from CFN Orchestrator v2
 */
export interface OrchestratorV2Result {
  /** Whether the orchestration succeeded */
  success: boolean;
  /** Unique task ID */
  taskId: string;
  /** Number of iterations completed */
  iterations: number;
  /** Final Product Owner decision */
  decision?: "PROCEED" | "ITERATE" | "ABORT";
  /** Final pass rate from test suite */
  passRate?: number;
  /** Final consensus from validators */
  consensus?: number;
  /** Reason for failure (if applicable) */
  reason?: string;
  /** Error message (if applicable) */
  error?: string;
  /** Execution duration in milliseconds */
  durationMs: number;
}

/**
 * Mode configuration with thresholds
 */
interface ModeConfig {
  /** Pass rate threshold for gate check */
  gateThreshold: number;
  /** Consensus threshold for validators */
  consensusThreshold: number;
  /** Maximum iterations before abort */
  maxIterations: number;
  /** Number of validators to spawn */
  validatorCount: number;
}

/**
 * Result from gate check
 */
interface GateCheckResult {
  passRate: number;
  exitCode: number;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  durationMs: number;
  stdout: string;
  stderr: string;
  failedTestNames: string[];
}

/**
 * Agent manifest from coordinator
 */
interface AgentManifest {
  phases: Phase[];
  dependencies: Record<string, string[]>;
  totalAgents: number;
}

/**
 * Phase definition from coordinator
 */
interface Phase {
  phase: number;
  name: string;
  parallel: boolean;
  agents: AgentDefinition[];
}

/**
 * Agent definition from coordinator
 */
interface AgentDefinition {
  id: string;
  type: string;
  task: string;
  files: string[];
  tests: string[];
}

// =============================================
// Configuration
// =============================================

/**
 * Mode configurations with different quality thresholds
 *
 * MVP: Fast prototyping with lower gates
 * Standard: Production default with balanced gates
 * Enterprise: Compliance-focused with higher gates
 */
const MODE_CONFIGS: Record<string, ModeConfig> = {
  mvp: {
    gateThreshold: 0.7,
    consensusThreshold: 0.8,
    maxIterations: 5,
    validatorCount: 2,
  },
  standard: {
    gateThreshold: 0.95,
    consensusThreshold: 0.9,
    maxIterations: 10,
    validatorCount: 3,
  },
  enterprise: {
    gateThreshold: 0.98,
    consensusThreshold: 0.95,
    maxIterations: 15,
    validatorCount: 5,
  },
};

/**
 * Default implementer agent types for Loop 3
 */
const DEFAULT_IMPLEMENTER_AGENTS = [
  "typescript-specialist",
  "backend-developer",
  "tester",
];

/**
 * Default validator agent types for Loop 2
 */
const DEFAULT_VALIDATOR_AGENTS = [
  "code-reviewer",
  "security-specialist",
  "cto-agent",
];

// =============================================
// Helper Functions
// =============================================

/**
 * Generate unique task ID with timestamp and random suffix
 */
function generateTaskId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `task-${timestamp}-${random}`;
}

/**
 * Run gate check by executing test command and parsing results
 */
async function runGateCheck(
  workDir: string,
  testCommand: string,
  taskId: string
): Promise<GateCheckResult> {
  const startTime = Date.now();

  await db.logger.info("orchestrator-v2", "Running gate check", {
    taskId,
    data: { testCommand, workDir },
  });

  try {
    // Split command for execa
    const [cmd, ...args] = testCommand.split(/\s+/);

    const result = await executeCommand(cmd, args, {
      cwd: workDir,
      timeout: 300000, // 5 minutes for tests
      forceKillAfterDelay: 10000,
    });

    const durationMs = Date.now() - startTime;
    const stdout = result.stdout || "";
    const stderr = result.stderr || "";

    // Try to extract test counts from Jest-style output
    // Format: Tests:  X passed, Y failed, Z total
    const testsMatch = stdout.match(
      /Tests:\s+(\d+)\s+passed.*?(\d+)\s+total/i
    );
    const failedMatch = stdout.match(/(\d+)\s+failed/i);

    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;

    if (testsMatch) {
      passedTests = parseInt(testsMatch[1], 10);
      totalTests = parseInt(testsMatch[2], 10);
      failedTests = failedMatch ? parseInt(failedMatch[1], 10) : 0;
    } else {
      // Fallback: try simpler patterns
      const passedMatch = stdout.match(/(\d+)\s+pass(?:ed|ing)?/i);
      const totalMatch = stdout.match(/(\d+)\s+(?:tests?|specs?)\s+(?:total|found)?/i);
      const failMatch = stdout.match(/(\d+)\s+fail(?:ed|ing)?/i);

      if (passedMatch) passedTests = parseInt(passedMatch[1], 10);
      if (totalMatch) totalTests = parseInt(totalMatch[1], 10);
      if (failMatch) failedTests = parseInt(failMatch[1], 10);

      // If no patterns matched, use exit code as indicator
      if (totalTests === 0) {
        totalTests = 1;
        passedTests = result.success ? 1 : 0;
        failedTests = result.success ? 0 : 1;
      }
    }

    const passRate = totalTests > 0 ? passedTests / totalTests : 0;

    // Extract failed test names (Jest-style: lines with checkmark/cross)
    const failedTestNames: string[] = [];
    const failedMatches = stdout.matchAll(/[x\u2717]\s+(.+)/gi);
    for (const match of failedMatches) {
      failedTestNames.push(match[1].trim());
    }

    await db.logger.info("orchestrator-v2", "Gate check complete", {
      taskId,
      data: {
        passRate,
        totalTests,
        passedTests,
        failedTests,
        exitCode: result.exitCode,
        durationMs,
      },
    });

    return {
      passRate,
      exitCode: result.exitCode ?? 1,
      totalTests,
      passedTests,
      failedTests,
      durationMs,
      stdout,
      stderr,
      failedTestNames,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;

    await db.logger.error(
      "orchestrator-v2",
      "Gate check failed",
      error as Error,
      { taskId }
    );

    return {
      passRate: 0,
      exitCode: 1,
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      durationMs,
      stdout: "",
      stderr: (error as Error).message,
      failedTestNames: [],
    };
  }
}

/**
 * Calculate Product Owner decision based on gate check and consensus
 */
function makeProductOwnerDecision(
  iteration: number,
  maxIterations: number,
  gatePassRate: number,
  gateThreshold: number,
  consensus: number,
  consensusThreshold: number
): "PROCEED" | "ITERATE" | "ABORT" {
  const gatePassed = gatePassRate >= gateThreshold;
  const consensusPassed = consensus >= consensusThreshold;

  // If both thresholds met, proceed
  if (gatePassed && consensusPassed) {
    return "PROCEED";
  }

  // If max iterations reached, abort
  if (iteration >= maxIterations) {
    return "ABORT";
  }

  // Otherwise, iterate
  return "ITERATE";
}

// =============================================
// Main Orchestrator Task
// =============================================

/**
 * CFN Orchestrator v2 Task
 *
 * Orchestrates the complete CFN Loop with:
 * 1. Coordinator spawning for task decomposition
 * 2. Phase execution with implementer agents
 * 3. Redis BLPOP waiting for agent completions
 * 4. Gate check with test suite execution
 * 5. Validator spawning and consensus collection
 * 6. Product Owner decision (PROCEED/ITERATE/ABORT)
 *
 * Timeout: 60 minutes for complex orchestrations
 */
export const cfnOrchestratorV2Task = task({
  id: "cfn-orchestrator-v2",
  maxDuration: 3600, // 60 minutes
  retry: {
    maxAttempts: 0, // No retries - iterations handle recovery
  },

  run: async (payload: OrchestratorV2Payload): Promise<OrchestratorV2Result> => {
    const taskStartTime = Date.now();
    const taskId = generateTaskId();
    const modeConfig = MODE_CONFIGS[payload.mode] || MODE_CONFIGS.standard;
    const maxIterations = payload.maxIterations ?? modeConfig.maxIterations;
    const testCommand = payload.testCommand || "npm test";

    console.log(`\n${"=".repeat(80)}`);
    console.log(`CFN Orchestrator v2 Starting`);
    console.log(`${"=".repeat(80)}`);
    console.log(`Task ID: ${taskId}`);
    console.log(`Mode: ${payload.mode}`);
    console.log(`Max Iterations: ${maxIterations}`);
    console.log(`Gate Threshold: ${(modeConfig.gateThreshold * 100).toFixed(0)}%`);
    console.log(`Consensus Threshold: ${(modeConfig.consensusThreshold * 100).toFixed(0)}%`);
    console.log(`Work Directory: ${payload.workDir}`);
    console.log(`Test Command: ${testCommand}`);
    console.log(`${"=".repeat(80)}\n`);

    // Create task record in database
    try {
      await db.createTask({
        id: taskId,
        description: payload.taskDescription,
        mode: payload.mode,
        maxIterations,
        provider: payload.provider,
        workDir: payload.workDir,
      });
    } catch (dbError) {
      console.warn(`[orchestrator-v2] Database not available, continuing without persistence: ${dbError}`);
    }

    await db.logger.info("orchestrator-v2", "Starting CFN Loop", {
      taskId,
      data: { mode: payload.mode, maxIterations },
    });

    let lastPassRate = 0;
    let lastConsensus = 0;
    let finalDecision: "PROCEED" | "ITERATE" | "ABORT" = "ITERATE";
    let lastError: string | undefined;

    try {
      await db.updateTaskStatus(taskId, "running");

      // ========================================
      // Main Iteration Loop
      // ========================================
      for (let iteration = 1; iteration <= maxIterations; iteration++) {
        console.log(`\n--- ITERATION ${iteration}/${maxIterations} ---\n`);

        await db.updateTaskStatus(taskId, "running", {
          currentIteration: iteration,
        });

        // Create iteration record
        let iterRecord: { id: number } = { id: iteration };
        try {
          iterRecord = await db.createIteration({
            taskId,
            iterationNumber: iteration,
          });
        } catch (dbError) {
          console.warn(`[orchestrator-v2] Could not create iteration record: ${dbError}`);
        }

        await db.logger.info(
          "orchestrator-v2",
          `Starting iteration ${iteration}`,
          {
            taskId,
            data: { iterationId: iterRecord.id },
          }
        );

        // ========================================
        // Step 1: Spawn Coordinator
        // ========================================
        console.log(`[Step 1] Spawning coordinator for task analysis...`);

        const coordHandle = await tasks.trigger("cfn-coordinator", {
          taskId,
          iterationId: iterRecord.id,
          taskDescription: payload.taskDescription,
          mode: payload.mode,
          workDir: payload.workDir,
        });

        await db.logger.info("orchestrator-v2", "Coordinator spawned", {
          taskId,
          data: { triggerRunId: coordHandle.id },
        });

        // Wait for coordinator using SDK polling (fast - coordinator is lightweight)
        console.log(`[Step 1] Waiting for coordinator to complete...`);
        const coordResult = await runs.poll(coordHandle.id, {
          pollIntervalMs: 2000,
        });

        if (coordResult.status !== "COMPLETED") {
          throw new Error(
            `Coordinator failed with status: ${coordResult.status}`
          );
        }

        const manifest = (coordResult.output as { manifest: AgentManifest })
          ?.manifest;

        if (!manifest || !manifest.phases) {
          throw new Error("Coordinator returned invalid manifest");
        }

        // Update iteration with manifest
        try {
          await db.updateIteration(iterRecord.id, {
            coordinatorManifest: manifest,
          });
        } catch (dbError) {
          console.warn(`[orchestrator-v2] Could not update iteration: ${dbError}`);
        }

        console.log(
          `[Step 1] Coordinator complete: ${manifest.phases.length} phases, ${manifest.totalAgents} agents`
        );

        await db.logger.info("orchestrator-v2", "Coordinator complete", {
          taskId,
          data: {
            phases: manifest.phases.length,
            agents: manifest.totalAgents,
          },
        });

        // ========================================
        // Step 2: Execute Phases
        // ========================================
        for (const phase of manifest.phases) {
          console.log(
            `\n[Step 2] Processing phase ${phase.phase}: ${phase.name} (${phase.agents.length} agents, parallel=${phase.parallel})`
          );

          await db.logger.info(
            "orchestrator-v2",
            `Processing phase ${phase.phase}: ${phase.name}`,
            {
              taskId,
              data: {
                parallel: phase.parallel,
                agentCount: phase.agents.length,
              },
            }
          );

          // Create agent records and spawn agents
          const agentHandles: Array<{ agentId: string; runId: string }> = [];

          for (const agent of phase.agents) {
            const agentId = `${taskId}-${agent.id}`;

            try {
              await db.createAgent({
                id: agentId,
                taskId,
                iterationId: iterRecord.id,
                agentType: agent.type,
                role: "implementer",
                assignedFiles: agent.files,
                assignedTests: agent.tests,
                taskDescription: agent.task,
              });
            } catch (dbError) {
              console.warn(`[orchestrator-v2] Could not create agent record: ${dbError}`);
            }

            // Spawn implementer agent
            console.log(`  Spawning agent: ${agentId} (${agent.type})`);

            const handle = await tasks.trigger("cfn-implementer-v2", {
              taskId,
              agentId,
              iterationId: iterRecord.id,
              agentType: agent.type,
              taskDescription: agent.task,
              workDir: payload.workDir,
              files: agent.files,
              tests: agent.tests,
              provider: payload.provider,
              _env: payload._env,
            });

            await db.updateAgentStatus(agentId, "running");
            agentHandles.push({ agentId, runId: handle.id });
          }

          // ========================================
          // Step 3: Wait for Completions via Redis BLPOP
          // ========================================
          console.log(
            `[Step 3] Waiting for ${phase.agents.length} agents via Redis BLPOP...`
          );

          try {
            const completions = await redis.waitForCompletions(
              taskId,
              phase.agents.length,
              600 // 10 minute timeout
            );

            // Update agent records with results
            for (const completion of completions) {
              await db.updateAgentStatus(
                completion.agentId,
                completion.success ? "completed" : "failed",
                {
                  success: completion.success,
                  testsPassed: completion.testsPassed,
                  confidence: completion.confidence,
                  filesModified: completion.filesModified,
                  errorMessage: completion.errorMessage,
                  durationMs: completion.durationMs,
                }
              );

              console.log(
                `  Agent ${completion.agentId}: ${completion.success ? "SUCCESS" : "FAILED"} (tests: ${completion.testsPassed ? "passed" : "failed"})`
              );

              await db.logger.info(
                "orchestrator-v2",
                `Agent completed: ${completion.agentId}`,
                {
                  taskId,
                  agentId: completion.agentId,
                  data: {
                    success: completion.success,
                    testsPassed: completion.testsPassed,
                  },
                }
              );
            }

            // Check phase success
            const phasePassed = completions.every((c) => c.testsPassed);
            if (!phasePassed) {
              const failedAgents = completions
                .filter((c) => !c.testsPassed)
                .map((c) => c.agentId);

              await db.logger.warn(
                "orchestrator-v2",
                `Phase ${phase.phase} had failures`,
                {
                  taskId,
                  data: { failed: failedAgents },
                }
              );
            }
          } catch (redisError) {
            // If Redis is not available, fall back to polling
            console.warn(
              `[orchestrator-v2] Redis BLPOP failed, falling back to SDK polling: ${redisError}`
            );

            for (const { agentId, runId } of agentHandles) {
              try {
                const result = await runs.poll(runId, { pollIntervalMs: 5000 });
                const success = result.status === "COMPLETED";

                await db.updateAgentStatus(
                  agentId,
                  success ? "completed" : "failed",
                  {
                    success,
                    output: result.output as object,
                  }
                );

                console.log(
                  `  Agent ${agentId}: ${success ? "SUCCESS" : "FAILED"}`
                );
              } catch (pollError) {
                console.error(
                  `  Agent ${agentId}: POLL FAILED - ${pollError}`
                );
              }
            }
          }
        }

        // ========================================
        // Step 4: Gate Check
        // ========================================
        console.log(`\n[Step 4] Running gate check...`);

        await db.logger.info("orchestrator-v2", "Running gate check", {
          taskId,
        });

        const gateResult = await runGateCheck(
          payload.workDir,
          testCommand,
          taskId
        );

        lastPassRate = gateResult.passRate;

        try {
          await db.updateIteration(iterRecord.id, {
            gatePassRate: gateResult.passRate,
            gatePassed: gateResult.passRate >= modeConfig.gateThreshold,
          });

          await db.recordTestRun({
            taskId,
            iterationId: iterRecord.id,
            testCommand,
            workDir: payload.workDir,
            exitCode: gateResult.exitCode,
            durationMs: gateResult.durationMs,
            totalTests: gateResult.totalTests,
            passedTests: gateResult.passedTests,
            failedTests: gateResult.failedTests,
            stdout: gateResult.stdout,
            stderr: gateResult.stderr,
            failedTestNames: gateResult.failedTestNames,
          });
        } catch (dbError) {
          console.warn(`[orchestrator-v2] Could not record test run: ${dbError}`);
        }

        console.log(
          `[Step 4] Gate check result: ${(gateResult.passRate * 100).toFixed(1)}% (threshold: ${(modeConfig.gateThreshold * 100).toFixed(0)}%)`
        );

        // If gate check failed, iterate
        if (gateResult.passRate < modeConfig.gateThreshold) {
          try {
            await db.updateIteration(iterRecord.id, {
              status: "completed",
              decision: "ITERATE",
            });
          } catch (dbError) {
            console.warn(`[orchestrator-v2] Could not update iteration: ${dbError}`);
          }

          await db.logger.info(
            "orchestrator-v2",
            "Gate check failed, iterating",
            {
              taskId,
              data: {
                passRate: gateResult.passRate,
                threshold: modeConfig.gateThreshold,
              },
            }
          );

          console.log(`[Step 4] Gate check FAILED - continuing to next iteration`);
          continue; // Next iteration
        }

        console.log(`[Step 4] Gate check PASSED - proceeding to validators`);

        // ========================================
        // Step 5: Spawn Validators (Gate Passed)
        // ========================================
        console.log(
          `\n[Step 5] Spawning ${modeConfig.validatorCount} validators...`
        );

        await db.logger.info(
          "orchestrator-v2",
          "Gate passed, spawning validators",
          {
            taskId,
            data: { passRate: gateResult.passRate },
          }
        );

        const validatorHandles: Array<{ agentId: string; runId: string }> = [];

        for (let i = 0; i < modeConfig.validatorCount; i++) {
          const agentId = `${taskId}-validator-${i + 1}`;

          try {
            await db.createAgent({
              id: agentId,
              taskId,
              iterationId: iterRecord.id,
              agentType: "code-reviewer",
              role: "validator",
              taskDescription:
                "Review implementation quality and suggest improvements",
            });
          } catch (dbError) {
            console.warn(`[orchestrator-v2] Could not create validator record: ${dbError}`);
          }

          console.log(`  Spawning validator: ${agentId}`);

          const handle = await tasks.trigger("cfn-validator", {
            taskId,
            agentId,
            iterationId: iterRecord.id,
            workDir: payload.workDir,
            provider: payload.provider,
          });

          await db.updateAgentStatus(agentId, "running");
          validatorHandles.push({ agentId, runId: handle.id });
        }

        // Wait for validator completions via Redis BLPOP
        console.log(
          `[Step 5] Waiting for ${modeConfig.validatorCount} validators via Redis BLPOP...`
        );

        let validatorCompletions: redis.CompletionSignal[] = [];

        try {
          validatorCompletions = await redis.waitForCompletions(
            taskId,
            modeConfig.validatorCount,
            300 // 5 minute timeout for validators
          );
        } catch (redisError) {
          // Fall back to polling if Redis fails
          console.warn(
            `[orchestrator-v2] Redis BLPOP failed for validators, falling back to SDK polling: ${redisError}`
          );

          for (const { agentId, runId } of validatorHandles) {
            try {
              const result = await runs.poll(runId, { pollIntervalMs: 5000 });
              const output = result.output as {
                confidence?: number;
                success?: boolean;
              };

              validatorCompletions.push({
                agentId,
                status: result.status === "COMPLETED" ? "completed" : "failed",
                success: output?.success ?? false,
                confidence: output?.confidence ?? 0.5,
                durationMs: 0,
                completedAt: Date.now(),
              });
            } catch (pollError) {
              console.error(`  Validator ${agentId}: POLL FAILED - ${pollError}`);
              validatorCompletions.push({
                agentId,
                status: "failed",
                success: false,
                confidence: 0,
                durationMs: 0,
                completedAt: Date.now(),
                errorMessage: String(pollError),
              });
            }
          }
        }

        // Calculate consensus
        const avgConfidence =
          validatorCompletions.length > 0
            ? validatorCompletions.reduce(
                (sum, c) => sum + (c.confidence || 0),
                0
              ) / validatorCompletions.length
            : 0;

        lastConsensus = avgConfidence;
        const consensusPassed = avgConfidence >= modeConfig.consensusThreshold;

        console.log(
          `[Step 5] Validator consensus: ${(avgConfidence * 100).toFixed(1)}% (threshold: ${(modeConfig.consensusThreshold * 100).toFixed(0)}%)`
        );

        try {
          await db.updateIteration(iterRecord.id, {
            consensusScore: avgConfidence,
            consensusPassed,
          });
        } catch (dbError) {
          console.warn(`[orchestrator-v2] Could not update consensus: ${dbError}`);
        }

        // ========================================
        // Step 6: Product Owner Decision
        // ========================================
        console.log(`\n[Step 6] Making Product Owner decision...`);

        finalDecision = makeProductOwnerDecision(
          iteration,
          maxIterations,
          gateResult.passRate,
          modeConfig.gateThreshold,
          avgConfidence,
          modeConfig.consensusThreshold
        );

        try {
          await db.updateIteration(iterRecord.id, {
            status: "completed",
            decision: finalDecision,
          });
        } catch (dbError) {
          console.warn(`[orchestrator-v2] Could not update decision: ${dbError}`);
        }

        console.log(`[Step 6] Decision: ${finalDecision}`);

        await db.logger.info(
          "orchestrator-v2",
          `Decision: ${finalDecision}`,
          {
            taskId,
            data: {
              consensus: avgConfidence,
              threshold: modeConfig.consensusThreshold,
            },
          }
        );

        // Handle decision outcomes
        if (finalDecision === "PROCEED") {
          await db.updateTaskStatus(taskId, "completed", {
            finalDecision: "PROCEED",
            finalPassRate: gateResult.passRate,
            finalConsensus: avgConfidence,
          });

          await redis.cleanupTask(taskId);

          const durationMs = Date.now() - taskStartTime;

          console.log(`\n${"=".repeat(80)}`);
          console.log(`CFN Orchestrator v2 Complete - PROCEED`);
          console.log(`${"=".repeat(80)}`);
          console.log(`Iterations: ${iteration}`);
          console.log(`Pass Rate: ${(gateResult.passRate * 100).toFixed(1)}%`);
          console.log(`Consensus: ${(avgConfidence * 100).toFixed(1)}%`);
          console.log(`Duration: ${(durationMs / 1000).toFixed(1)}s`);
          console.log(`${"=".repeat(80)}\n`);

          return {
            success: true,
            taskId,
            iterations: iteration,
            decision: "PROCEED",
            passRate: gateResult.passRate,
            consensus: avgConfidence,
            durationMs,
          };
        }

        if (finalDecision === "ABORT") {
          await db.updateTaskStatus(taskId, "aborted", {
            finalDecision: "ABORT",
            finalPassRate: gateResult.passRate,
            finalConsensus: avgConfidence,
            errorMessage: "Max iterations reached without consensus",
          });

          await redis.cleanupTask(taskId);

          const durationMs = Date.now() - taskStartTime;

          console.log(`\n${"=".repeat(80)}`);
          console.log(`CFN Orchestrator v2 Complete - ABORT`);
          console.log(`${"=".repeat(80)}`);
          console.log(`Iterations: ${iteration}`);
          console.log(`Pass Rate: ${(gateResult.passRate * 100).toFixed(1)}%`);
          console.log(`Consensus: ${(avgConfidence * 100).toFixed(1)}%`);
          console.log(`Reason: Max iterations reached without consensus`);
          console.log(`Duration: ${(durationMs / 1000).toFixed(1)}s`);
          console.log(`${"=".repeat(80)}\n`);

          return {
            success: false,
            taskId,
            iterations: iteration,
            decision: "ABORT",
            passRate: gateResult.passRate,
            consensus: avgConfidence,
            reason: "max_iterations",
            durationMs,
          };
        }

        // ITERATE - continue to next iteration
        console.log(`[Step 6] ITERATE - continuing to iteration ${iteration + 1}`);
      }

      // Should not reach here, but handle gracefully
      await db.updateTaskStatus(taskId, "completed", {
        finalDecision: "ABORT",
      });

      const durationMs = Date.now() - taskStartTime;

      return {
        success: false,
        taskId,
        iterations: maxIterations,
        decision: "ABORT",
        reason: "loop_exhausted",
        durationMs,
      };
    } catch (error) {
      lastError = (error as Error).message;

      await db.logger.error(
        "orchestrator-v2",
        "Orchestrator failed",
        error as Error,
        { taskId }
      );

      await db.updateTaskStatus(taskId, "failed", {
        errorMessage: lastError,
      });

      await redis.cleanupTask(taskId);

      const durationMs = Date.now() - taskStartTime;

      console.log(`\n${"=".repeat(80)}`);
      console.log(`CFN Orchestrator v2 FAILED`);
      console.log(`${"=".repeat(80)}`);
      console.log(`Error: ${lastError}`);
      console.log(`Duration: ${(durationMs / 1000).toFixed(1)}s`);
      console.log(`${"=".repeat(80)}\n`);

      return {
        success: false,
        taskId,
        iterations: 0,
        error: lastError,
        passRate: lastPassRate,
        consensus: lastConsensus,
        durationMs,
      };
    }
  },
});
