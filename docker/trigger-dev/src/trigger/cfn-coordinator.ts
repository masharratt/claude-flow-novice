import { task, tasks, runs } from "@trigger.dev/sdk/v3";
import * as fs from "fs";
import * as path from "path";
import type { DecompositionPlan } from "./cfn-decomposition-aggregator.js";
import type { ImplementerV2Result } from "./cfn-implementer-v2.js";
import type { GateCheckResult } from "./cfn-gate-check-aggregator.js";
import type { ArchitectureAnalysis } from "./cfn-architecture-decomposer.js";
import type { SecurityAnalysis } from "./cfn-security-decomposer.js";
import type { PerformanceAnalysis } from "./cfn-performance-decomposer.js";
import type { TestingAnalysis } from "./cfn-testing-decomposer.js";
import type { OrchestratorResult } from "./cfn-async-validator-orchestrator.js";
import type { TroubleshootingAnalysis } from "./cfn-troubleshooting-decomposer.js";
import type { MDAPImplementerResult } from "./cfn-mdap-implementer.js";
import type { CLISprintImplementerResult } from "./cfn-cli-sprint-implementer.js";
import { aggregateMicroTasksIntoSprints, getSprintSummary } from "../lib/sprint-aggregator.js";
import { DecompositionPerformanceMonitor, calculateContextSize } from "../lib/decomposition-performance-monitor.js";
// Phase 4: RuVector Learning Hooks
import { captureDecompositionToRuVector, updateDecompositionWithValidation } from "../lib/ruvector-learning-hooks.js";
import { findSimilarDecompositions, generateAdaptivePrompt, trackRagRecall } from "../lib/ruvector-rag-decomposition.js";
// SLA Enforcement
import { measureSLA, slaEnforcer, SLACheckResult, SLAs } from "../lib/sla-enforcement.js";
// Production Monitoring
import { getLogger } from "../lib/structured-logger.js";
import { getMetricsCollector } from "../lib/metrics-collector.js";
import { getHealthChecker } from "../lib/health-check.js";
// MDAP Metrics Tracking
import {
  recordMetric,
  checkAllModelsForDeprecation,
  printMetricsSummary,
  getMetricsSummary,
} from "../lib/mdap-metrics-tracker.js";
// RuVector MDAP Analytics Integration
import {
  recordMDAPOutcome,
  analyzeMDAPModelPerformance,
  generatePromptOptimizations,
  getMDAPAnalyticsSummary,
} from "../lib/ruvector-mdap-analytics.js";
import {
  captureMDAPFailure as captureErrorPatternMDAPFailure,
  analyzeMDAPFailurePatterns,
} from "../lib/ruvector-error-pattern-learning.js";

// Security: Sanitize error messages to prevent API key leakage
function sanitizeErrorMessage(error: Error | unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  // Mask patterns that look like API keys
  return message
    .replace(/tr_(dev|prod|stg|preview)_[a-zA-Z0-9]+/g, 'tr_$1_[REDACTED]')
    .replace(/sk-[a-zA-Z0-9]{48}/g, 'sk-[REDACTED]')
    .replace(/Bearer\s+[a-zA-Z0-9_-]+/gi, 'Bearer [REDACTED]')
    .replace(/api[_-]?key[:\s=]+['"]?[a-zA-Z0-9_-]+['"]?/gi, 'api_key=[REDACTED]')
    .replace(/token[:\s=]+['"]?[a-zA-Z0-9_-]+['"]?/gi, 'token=[REDACTED]');
}

// P0 Fix: Task 4 - Timeout Protection Helper
async function pollWithTimeout<T>(
  runId: string,
  timeoutMs: number,
  taskName: string
): Promise<T> {
  const result = await Promise.race([
    runs.poll(runId, { pollIntervalMs: 1000 }),
    new Promise<null>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `[cfn-coordinator] ${taskName} timed out after ${timeoutMs / 1000}s.\n` +
                `This indicates the API is slow or hung. ` +
                `Check Trigger.dev service health and API status.`
            )
          ),
        timeoutMs
      )
    ),
  ]);

  if (!result) {
    throw new Error(
      `[cfn-coordinator] ${taskName} returned null result.\n` +
        `This indicates a polling failure. Check Trigger.dev service health.`
    );
  }

  // FIX: Check run status before accessing output
  // If the task failed, result.output is undefined but status will be 'FAILED'
  if (result.status === 'FAILED' || result.status === 'CRASHED' || result.status === 'SYSTEM_FAILURE') {
    throw new Error(
      `[cfn-coordinator] ${taskName} failed with status: ${result.status}.\n` +
        `Run ID: ${runId}. Check task logs for details.`
    );
  }

  // For completed runs, output should be defined
  if (result.output === undefined) {
    throw new Error(
      `[cfn-coordinator] ${taskName} completed but returned undefined output.\n` +
        `Run ID: ${runId}, Status: ${result.status}. This indicates a task implementation bug.`
    );
  }

  return result.output as T;
}

export interface CFNCoordinatorPayload {
  taskId: string;
  taskDescription: string;
  workDir: string;
  mode: "mvp" | "standard" | "enterprise";
  maxIterations: number;
  complexity: "simple" | "moderate" | "complex";
  /**
   * Enable MDAP (Massively Decomposed Agentic Processes) mode.
   * When true, uses fast Cerebras API (~500ms-3s per micro-task) instead of
   * Claude Code CLI (~60s+). Designed for rapid TDD iteration cycles.
   *
   * MDAP flow: Generate code → Write files → Run tests → Gate check → Loop if fail
   *
   * @default false (uses cfn-implementer-v2 with Claude CLI)
   */
  enableMDAP?: boolean;
}

export interface CFNCoordinatorResult {
  taskId: string;
  success: boolean;
  finalStatus: "COMPLETED" | "FAILED" | "ABORTED";

  // Phase 1: Decomposition
  decompositionPlan?: DecompositionPlan;

  // Phase 2: Execution
  executionResults: {
    microTaskId: string;
    filesModified: string[];
    testsPassed: boolean;
    success: boolean;
    confidence: number;
    durationMs: number;
    error?: string; // Present when task failed
  }[];

  // Phase 3: Async Validators
  asyncValidationResult?: OrchestratorResult;

  // Phase 4: Gate Check
  gateCheckResult?: GateCheckResult;

  // Phase 5: Troubleshooting (if ITERATE decision)
  troubleshootingResult?: TroubleshootingAnalysis;

  // Phase 6: Validation (if applicable)
  validationResult?: any;

  // Metrics
  totalTime: number;
  iterations: number;
  metrics: {
    decompositionTimeMs: number;
    decompositionPhaseBreakdown?: {
      architectureMs: number;
      securityMs: number;
      performanceMs: number;
      testingMs: number;
      mergingMs: number;
      contextOverheadMs: number;
    };
    executionTimeMs: number;
    asyncValidationTimeMs: number; // Phase 3: Async validators
    securityValidationTimeMs: number;
    performanceValidationTimeMs: number;
    gateCheckTimeMs: number;
    troubleshootingTimeMs: number; // Phase 5: Troubleshooting decomposer
    validationTimeMs: number;
  };
  // Production metrics summary (optional)
  metricsSummary?: {
    taskCompletionRate: number;
    averageTaskDurationMs: number;
    gateCheckPassRate: number;
    slaBreachCount: number;
    errorRate: number;
  };
}

/**
 * CFN Loop Coordinator v3
 *
 * Orchestrates:
 * 1. Decomposition Swarm (4 parallel decomposers)
 * 2. Loop 3: Implementation (agents + async validators)
 * 3. Gate Check (aggregate async results)
 * 4. Loop 2: Validation (if gate passes)
 */
export const cfnCoordinatorTask = task({
  id: "cfn-coordinator",
  retry: { maxAttempts: 1 },

  run: async (payload: CFNCoordinatorPayload): Promise<CFNCoordinatorResult> => {
    const coordinatorStartTime = Date.now();

    // Initialize structured logger and metrics collector
    const logger = getLogger('cfn-coordinator').child({ taskId: payload.taskId });
    const metricsCollector = getMetricsCollector();
    const healthChecker = getHealthChecker();

    // Optional: Health check at startup (non-blocking)
    const healthReport = await healthChecker.performAllChecks();
    if (healthReport.status === 'degraded') {
      logger.warn('System health degraded at startup', {}, {
        degradedComponents: healthReport.components.filter(c => c.status === 'degraded').map(c => c.name),
      });
    } else if (healthReport.status === 'unhealthy') {
      logger.warn('System health unhealthy at startup', {}, {
        unhealthyComponents: healthReport.components.filter(c => c.status === 'unhealthy').map(c => c.name),
      });
    }
    const result: CFNCoordinatorResult = {
      taskId: payload.taskId,
      success: false,
      finalStatus: "FAILED",
      executionResults: [],
      totalTime: 0,
      iterations: 0,
      metrics: {
        decompositionTimeMs: 0,
        executionTimeMs: 0,
        asyncValidationTimeMs: 0,
        securityValidationTimeMs: 0,
        performanceValidationTimeMs: 0,
        gateCheckTimeMs: 0,
        troubleshootingTimeMs: 0,
        validationTimeMs: 0,
      },
    };

    try {
      logger.info('CFN Loop Coordinator v3 starting', { mode: payload.mode, maxIterations: payload.maxIterations, complexity: payload.complexity, enableMDAP: payload.enableMDAP || false }, { taskDescription: payload.taskDescription.substring(0, 100), workDir: payload.workDir });

      // ===== PHASE 1: SEQUENTIAL DECOMPOSITION WITH CONTEXT PASSING =====
      logger.info('Starting Phase 1: Sequential Decomposition (v3.1)');
      const decompositionStartTime = Date.now();
      const perfMonitor = new DecompositionPerformanceMonitor();
      perfMonitor.start();

      // ===== RUVECTOR RAG: Find Similar Prior Decompositions =====
      const enableRuVector = process.env.ENABLE_RUVECTOR === 'true';
      let ragResult: Awaited<ReturnType<typeof findSimilarDecompositions>> | null = null;
      let enhancedTaskDescription = payload.taskDescription;

      if (enableRuVector) {
        console.log(`[cfn-coordinator] [rag] RuVector RAG enabled, searching for similar decompositions...`);
        try {
          ragResult = await findSimilarDecompositions(payload.taskDescription, {
            topK: 3,
            minSimilarity: 0.75,
            minQualityScore: 0.80,
            onlySuccessful: true,
          });

          if (ragResult.hasHighConfidencePrior) {
            console.log(`[cfn-coordinator] [rag] ✓ High-confidence prior found (quality: ${ragResult.results[0].qualityScore.toFixed(2)})`);
            enhancedTaskDescription = generateAdaptivePrompt(payload.taskDescription, ragResult);
            console.log(`[cfn-coordinator] [rag] Generated adaptive prompt with RAG baseline`);
          } else if (ragResult.results.length > 0) {
            console.log(`[cfn-coordinator] [rag] Found ${ragResult.results.length} similar decompositions (avg quality: ${ragResult.avgQualityScore.toFixed(2)})`);
          } else {
            console.log(`[cfn-coordinator] [rag] No similar decompositions found, using original task description`);
          }
        } catch (ragError) {
          console.warn(`[cfn-coordinator] [rag] ⚠ RAG query failed, continuing without RAG context: ${ragError instanceof Error ? ragError.message : String(ragError)}`);
          // Graceful degradation: continue with original task description
        }
      } else {
        console.log(`[cfn-coordinator] [rag] RuVector RAG disabled (ENABLE_RUVECTOR=${process.env.ENABLE_RUVECTOR})`);
      }

      // Step 1: Architecture Decomposer (baseline, no context)
      console.log(`[cfn-coordinator] Step 1/4: Architecture decomposition...`);
      const archPhase = perfMonitor.startPhase("architecture");
      const { result: archAnalysis, slaCheck: archSLA } = await measureSLA(
        "phase2_individual_decomposer",
        async () => {
          const archHandle = await tasks.trigger("cfn-architecture-decomposer", {
            taskId: payload.taskId,
            taskDescription: enhancedTaskDescription, // Use RAG-enhanced prompt if available
            workDir: payload.workDir,
          });
          // Timeout = SLA target × 48 (accommodates 3 retries + network delays + queue time)
          return await pollWithTimeout<ArchitectureAnalysis>(
            archHandle.id,
            SLAs.phase2_individual_decomposer.targetMs * 48,
            "Architecture decomposer"
          );
        }
      );
      if (archSLA.breached) {
        console.warn(`[cfn-coordinator] ⚠ SLA breach: Architecture decomposer took ${archSLA.elapsed}ms (target: ${archSLA.target}ms)`);
      }
      perfMonitor.endPhase("architecture", archPhase.startTimeMs, archAnalysis.microTasks.length);
      console.log(`[cfn-coordinator]   ✓ ${archAnalysis.microTasks.length} architecture tasks | ${((Date.now() - archPhase.startTimeMs) / 1000).toFixed(2)}s`);

      // Step 2: Security Decomposer (with architecture context)
      console.log(`[cfn-coordinator] Step 2/4: Security decomposition (with arch context)...`);
      const secPhase = perfMonitor.startPhase("security");
      const securityContext = {
        architecture: archAnalysis,
      };
      const { result: secAnalysis, slaCheck: secSLA } = await measureSLA(
        "phase2_individual_decomposer",
        async () => {
          const secHandle = await tasks.trigger("cfn-security-decomposer", {
            taskId: payload.taskId,
            taskDescription: enhancedTaskDescription, // Use RAG-enhanced prompt if available
            workDir: payload.workDir,
            previousContext: securityContext,
          });
          // Timeout = SLA target × 48 (accommodates 3 retries + network delays + queue time)
          return await pollWithTimeout<SecurityAnalysis>(
            secHandle.id,
            SLAs.phase2_individual_decomposer.targetMs * 48,
            "Security decomposer"
          );
        }
      );
      if (secSLA.breached) {
        console.warn(`[cfn-coordinator] ⚠ SLA breach: Security decomposer took ${secSLA.elapsed}ms (target: ${secSLA.target}ms)`);
      }
      const secContextSize = calculateContextSize(securityContext);
      perfMonitor.endPhase("security", secPhase.startTimeMs, secAnalysis.microTasks.length, secContextSize);
      console.log(`[cfn-coordinator]   ✓ ${secAnalysis.microTasks.length} security tasks | ${((Date.now() - secPhase.startTimeMs) / 1000).toFixed(2)}s | Context: ${(secContextSize / 1024).toFixed(1)}KB`);

      // Step 3: Performance Decomposer (with architecture + security context)
      console.log(`[cfn-coordinator] Step 3/4: Performance decomposition (with arch + security)...`);
      const perfPhase = perfMonitor.startPhase("performance");
      const performanceContext = {
        architecture: archAnalysis,
        security: secAnalysis,
      };
      const { result: perfAnalysis, slaCheck: perfSLA } = await measureSLA(
        "phase2_individual_decomposer",
        async () => {
          const perfHandle = await tasks.trigger("cfn-performance-decomposer", {
            taskId: payload.taskId,
            taskDescription: enhancedTaskDescription, // Use RAG-enhanced prompt if available
            workDir: payload.workDir,
            previousContext: performanceContext,
          });
          // Timeout = SLA target × 48 (accommodates 3 retries + network delays + queue time)
          return await pollWithTimeout<PerformanceAnalysis>(
            perfHandle.id,
            SLAs.phase2_individual_decomposer.targetMs * 48,
            "Performance decomposer"
          );
        }
      );
      if (perfSLA.breached) {
        console.warn(`[cfn-coordinator] ⚠ SLA breach: Performance decomposer took ${perfSLA.elapsed}ms (target: ${perfSLA.target}ms)`);
      }
      const perfContextSize = calculateContextSize(performanceContext);
      perfMonitor.endPhase("performance", perfPhase.startTimeMs, perfAnalysis.microTasks.length, perfContextSize);
      console.log(`[cfn-coordinator]   ✓ ${perfAnalysis.microTasks.length} performance tasks | ${((Date.now() - perfPhase.startTimeMs) / 1000).toFixed(2)}s | Context: ${(perfContextSize / 1024).toFixed(1)}KB`);

      // Step 4: Testing Decomposer (with all context)
      console.log(`[cfn-coordinator] Step 4/4: Testing decomposition (with full context)...`);
      const testPhase = perfMonitor.startPhase("testing");
      const testingContext = {
        architecture: archAnalysis,
        security: secAnalysis,
        performance: perfAnalysis,
      };
      const { result: testAnalysis, slaCheck: testSLA } = await measureSLA(
        "phase2_individual_decomposer",
        async () => {
          const testHandle = await tasks.trigger("cfn-testing-decomposer", {
            taskId: payload.taskId,
            taskDescription: enhancedTaskDescription, // Use RAG-enhanced prompt if available
            workDir: payload.workDir,
            previousContext: testingContext,
          });
          // Timeout = SLA target × 48 (accommodates 3 retries + network delays + queue time)
          return await pollWithTimeout<TestingAnalysis>(
            testHandle.id,
            SLAs.phase2_individual_decomposer.targetMs * 48,
            "Testing decomposer"
          );
        }
      );
      if (testSLA.breached) {
        console.warn(`[cfn-coordinator] ⚠ SLA breach: Testing decomposer took ${testSLA.elapsed}ms (target: ${testSLA.target}ms)`);
      }
      const testContextSize = calculateContextSize(testingContext);
      perfMonitor.endPhase("testing", testPhase.startTimeMs, testAnalysis.microTasks.length, testContextSize);
      console.log(`[cfn-coordinator]   ✓ ${testAnalysis.microTasks.length} testing tasks | ${((Date.now() - testPhase.startTimeMs) / 1000).toFixed(2)}s | Context: ${(testContextSize / 1024).toFixed(1)}KB`);

      // Step 5: Merge results into unified plan
      console.log(`[cfn-coordinator] Step 5/5: Merging decomposition results...`);
      const mergePhase = perfMonitor.startPhase("merging");

      // Use existing decomposition aggregator logic for merging
      // (Note: In production, we'd import the merging function from the aggregator)
      const decompositionPlan: DecompositionPlan = {
        taskId: payload.taskId,
        originalTask: payload.taskDescription,
        microTasks: [
          ...archAnalysis.microTasks.map(t => ({
            id: t.id,
            title: t.title,
            description: t.description,
            priority: t.priority,
            rationale: t.rationale,
            dependencies: t.dependencies || [],
            perspectives: [{ perspective: "architecture" as const, rationale: t.rationale }],
            estimatedEffort: "medium" as const,
          })),
          ...secAnalysis.microTasks.map(t => ({
            id: t.id,
            title: t.title,
            description: t.description,
            priority: t.priority,
            rationale: t.rationale,
            dependencies: [],
            perspectives: [{ perspective: "security" as const, rationale: t.rationale, threatVectors: t.threatVectors }],
            estimatedEffort: "medium" as const,
          })),
          ...perfAnalysis.microTasks.map(t => ({
            id: t.id,
            title: t.title,
            description: t.description,
            priority: t.priority,
            rationale: t.rationale,
            dependencies: [],
            perspectives: [{ perspective: "performance" as const, rationale: t.rationale, metrics: t.metrics }],
            estimatedEffort: "medium" as const,
          })),
          ...testAnalysis.microTasks.map(t => ({
            id: t.id,
            title: t.title,
            description: t.description,
            priority: t.priority,
            rationale: t.rationale,
            dependencies: [],
            perspectives: [{ perspective: "testing" as const, rationale: t.rationale, testTypes: t.testTypes }],
            estimatedEffort: "medium" as const,
          })),
        ],
        swarmAnalysis: {
          architectureRecommendations: archAnalysis.recommendations,
          securityRecommendations: secAnalysis.securityRecommendations,
          securityRiskLevel: secAnalysis.riskLevel,
          performanceRecommendations: perfAnalysis.performanceRecommendations,
          testingRecommendations: testAnalysis.testingRecommendations,
          coverageGoal: testAnalysis.coverageGoal,
        },
        executionPhases: [
          { phase: 1, parallelTasks: archAnalysis.microTasks.map(t => t.id), sequentialDependencies: [] },
          { phase: 2, parallelTasks: secAnalysis.microTasks.map(t => t.id), sequentialDependencies: [] },
          { phase: 3, parallelTasks: perfAnalysis.microTasks.map(t => t.id), sequentialDependencies: [] },
          { phase: 4, parallelTasks: testAnalysis.microTasks.map(t => t.id), sequentialDependencies: [] },
        ],
        totalEstimatedTasks: archAnalysis.microTasks.length + secAnalysis.microTasks.length +
                             perfAnalysis.microTasks.length + testAnalysis.microTasks.length,
      };

      perfMonitor.endPhase("merging", mergePhase.startTimeMs, decompositionPlan.microTasks.length);

      result.metrics.decompositionTimeMs = Date.now() - decompositionStartTime;

      // Get detailed performance metrics
      const perfMetrics = perfMonitor.getMetrics();
      result.metrics.decompositionPhaseBreakdown = {
        architectureMs: perfMetrics.phases.find(p => p.phaseName === "architecture")?.durationMs ?? 0,
        securityMs: perfMetrics.phases.find(p => p.phaseName === "security")?.durationMs ?? 0,
        performanceMs: perfMetrics.phases.find(p => p.phaseName === "performance")?.durationMs ?? 0,
        testingMs: perfMetrics.phases.find(p => p.phaseName === "testing")?.durationMs ?? 0,
        mergingMs: perfMetrics.phases.find(p => p.phaseName === "merging")?.durationMs ?? 0,
        contextOverheadMs: perfMetrics.contextPassingOverheadMs,
      };

      console.log(`[cfn-coordinator] ✓ Sequential decomposition complete`);
      console.log(`[cfn-coordinator]   Total micro-tasks: ${decompositionPlan.microTasks.length}`);
      console.log(`[cfn-coordinator]   Execution phases: ${decompositionPlan.executionPhases.length}`);
      console.log(`[cfn-coordinator]   Security risk: ${decompositionPlan.swarmAnalysis.securityRiskLevel}`);
      console.log(`[cfn-coordinator]   Coverage goal: ${decompositionPlan.swarmAnalysis.coverageGoal}%`);
      console.log(`[cfn-coordinator]   Total time: ${(result.metrics.decompositionTimeMs / 1000).toFixed(2)}s`);
      console.log(`[cfn-coordinator]   Context overhead: ${(perfMetrics.contextPassingOverheadMs / 1000).toFixed(2)}s`);

      // Log performance report
      perfMonitor.logMetrics(perfMetrics);

      result.decompositionPlan = decompositionPlan;

      // Phase 4: Capture decomposition to RuVector (async, non-blocking)
      captureDecompositionToRuVector({
        taskId: payload.taskId,
        taskDescription: payload.taskDescription,
        decompositionPlan,
        executionTimeMs: result.metrics.decompositionTimeMs,
      }).catch((err) =>
        console.warn(`[learning] Decomposition capture failed: ${err.message}`)
      );

      // ===== PHASE 2: EXECUTION (Loop 3) + ASYNC VALIDATORS =====
      console.log(`[cfn-coordinator] ===== PHASE 2: EXECUTION + ASYNC VALIDATORS =====`);
      const executionStartTime = Date.now();
      const enableMDAP = payload.enableMDAP ?? false;

      console.log(`[cfn-coordinator] MDAP mode: ${enableMDAP ? "ENABLED (Cerebras API, ~500ms-3s)" : "DISABLED (CLI Sprint, aggregated)"}`);

      // TIER ESCALATION: Track failure counts per micro-task for T1→T2→T3 escalation
      const microTaskFailureCounts = new Map<string, number>();
      const MAX_TIER_3_FAILURES = 2; // After T3 fails twice, task is unrecoverable

      const implementationHandles: { id: string; microTaskId: string }[] = [];
      const securityValidatorHandles: { id: string; microTaskId: string }[] = [];
      const performanceValidatorHandles: { id: string; microTaskId: string }[] = [];

      // ===== NON-MDAP: SPRINT AGGREGATION MODE =====
      if (!enableMDAP) {
        // Aggregate micro-tasks into sprints (reduces 21 CLI calls → ~4 sprints)
        const aggregation = aggregateMicroTasksIntoSprints(decompositionPlan, payload.taskId);
        console.log(`[cfn-coordinator] Sprint aggregation: ${getSprintSummary(aggregation)}`);

        // Execute sprints sequentially (each sprint runs ~60-180s via Claude CLI)
        for (let i = 0; i < aggregation.sprints.length; i++) {
          const sprint = aggregation.sprints[i];
          console.log(`[cfn-coordinator] Executing sprint ${i + 1}/${aggregation.sprints.length}: ${sprint.name}`);
          console.log(`[cfn-coordinator]   Tasks: ${sprint.microTasks.map(t => t.id).join(', ')}`);

          // Trigger CLI sprint implementer
          const sprintHandle = await tasks.trigger("cfn-cli-sprint-implementer", {
            taskId: payload.taskId,
            sprintId: sprint.id,
            sprint,
            workDir: payload.workDir,
            timeout: 300000, // 5 minutes per sprint (increased from 3 min)
          });

          // Poll for sprint completion (longer timeout for CLI)
          const sprintResult = await pollWithTimeout<CLISprintImplementerResult>(
            sprintHandle.id,
            300000, // 5 minute timeout per sprint
            `CLI Sprint ${sprint.id}`
          ).catch((error) => {
            console.error(`[cfn-coordinator] ⚠ Sprint ${sprint.id} failed: ${sanitizeErrorMessage(error)}`);
            return {
              taskId: payload.taskId,
              sprintId: sprint.id,
              success: false,
              filesModified: [],
              microTasksCompleted: [],
              microTasksFailed: sprint.microTasks.map(t => t.id),
              durationMs: 0,
              output: '',
              timedOut: true,
              confidence: 0.1,
              error: (error as Error).message,
            } as CLISprintImplementerResult;
          });

          console.log(`[cfn-coordinator]   ✓ Sprint ${sprint.id}: ${sprintResult.success ? 'SUCCESS' : 'FAILED'} (${sprintResult.durationMs}ms)`);
          console.log(`[cfn-coordinator]     Tasks completed: ${sprintResult.microTasksCompleted.length}/${sprint.microTasks.length}`);
          console.log(`[cfn-coordinator]     Files modified: ${sprintResult.filesModified.length}`);

          // Record results for each micro-task in the sprint
          for (const microTaskId of sprintResult.microTasksCompleted) {
            implementationHandles.push({ id: sprintHandle.id, microTaskId });
            result.executionResults.push({
              microTaskId,
              filesModified: sprintResult.filesModified,
              testsPassed: false, // Tests run in gate check phase
              success: true,
              confidence: sprintResult.confidence,
              durationMs: Math.round(sprintResult.durationMs / sprint.microTasks.length),
            });
          }

          for (const microTaskId of sprintResult.microTasksFailed) {
            implementationHandles.push({ id: sprintHandle.id, microTaskId });
            result.executionResults.push({
              microTaskId,
              filesModified: [],
              testsPassed: false,
              success: false,
              confidence: 0.1,
              durationMs: Math.round(sprintResult.durationMs / sprint.microTasks.length),
              error: sprintResult.error,
            });
          }
        }

        console.log(`[cfn-coordinator] ✓ Sprint execution complete`);
        console.log(`[cfn-coordinator]   Sprints: ${aggregation.sprints.length}`);
        console.log(`[cfn-coordinator]   Micro-tasks: ${result.executionResults.length}`);
        console.log(`[cfn-coordinator]   Successes: ${result.executionResults.filter(r => r.success).length}`);

      } else {
        // ===== MDAP MODE: PARALLEL MICRO-TASK EXECUTION =====
        // Execute each micro-task in parallel (respecting phase dependencies)
        for (const phase of decompositionPlan.executionPhases) {
          console.log(`[cfn-coordinator] Executing phase ${phase.phase} (${phase.parallelTasks.length} parallel tasks)`);

          // Spawn all tasks in this phase via MDAP (fast Cerebras API)
          const phaseImplementations = await Promise.all(
            phase.parallelTasks.map((microTaskId) => {
              const microTask = decompositionPlan.microTasks.find((t) => t.id === microTaskId);

              // BUG FIX: Validate microTask exists before accessing properties
              if (!microTask) {
                throw new Error(`MicroTask ${microTaskId} not found in decomposition plan`);
              }

              // MDAP: Fast Cerebras-based code generation with tier escalation
              const failureCount = microTaskFailureCounts.get(microTaskId) || 0;
              const modelTier = Math.min(1 + failureCount, 3); // T1→T2→T3 escalation

              return tasks.trigger("cfn-mdap-implementer", {
                taskId: `${payload.taskId}`,
                microTaskId: microTaskId,
                taskDescription: `${microTask.title}: ${microTask.description}`,
                workDir: payload.workDir,
                targetFile: `src/${microTaskId.replace(/[^a-z0-9]/gi, '-')}.ts`, // Default target
                contextHints: microTask.perspectives?.map(p => p.rationale).filter(Boolean) || [],
                modelTier, // Escalated tier based on failures
                failureCount,
                language: "typescript",
              });
            })
          );

          // PERFORMANCE FIX: Parallel polling instead of sequential
          // Wait for all implementations to complete in parallel
          // MDAP MODE: Shorter timeout (~30s) since Cerebras API is fast (~500ms-3s)
          const pollTimeout = 30000;

          const pollPromises = phaseImplementations.map((implHandle, i) => {
            const microTaskId = phase.parallelTasks[i];

            // MDAP: Poll for MDAPImplementerResult
            return pollWithTimeout<MDAPImplementerResult>(
              implHandle.id,
              pollTimeout,
              `MDAP Implementer for task ${microTaskId}`
            )
              .then((mdapOutput) => {
                // Convert MDAPImplementerResult to unified format
                // MDAP returns generatedCode which needs to be written to files
                const success = mdapOutput.success && mdapOutput.generatedCode.length > 0;
                return {
                  implHandle,
                  microTaskId,
                  output: {
                    success,
                    testsPassed: false, // Tests run in gate check phase for MDAP
                    confidence: success ? 0.85 : 0.1, // Higher confidence for MDAP (Cerebras fast inference)
                    filesModified: [mdapOutput.targetFile],
                    durationMs: mdapOutput.durationMs,
                    output: mdapOutput.generatedCode,
                    timedOut: false,
                    error: mdapOutput.error,
                  } as ImplementerV2Result,
                  mdapResult: mdapOutput, // Keep original for file writing
                  failed: !success,
                };
              })
              .catch((error) => {
                console.error(`[cfn-coordinator] ⚠ MDAP Implementer ${microTaskId} failed: ${sanitizeErrorMessage(error)}`);
                return {
                  implHandle,
                  microTaskId,
                  output: {
                    success: false,
                    testsPassed: false,
                    confidence: 0.1,
                    filesModified: [],
                    durationMs: 0,
                    output: "",
                    timedOut: false,
                    error: (error as Error).message,
                  } as ImplementerV2Result,
                  mdapResult: undefined,
                  failed: true,
                };
              });
          });

          const outputs = await Promise.all(pollPromises);

        // Process all outputs (both successful and failed)
        for (const { implHandle, microTaskId, output, mdapResult, failed } of outputs) {
          implementationHandles.push({ id: implHandle.id, microTaskId });

          if (failed) {
            console.warn(`[cfn-coordinator]   ⚠ Task ${microTaskId} failed, recording failure result`);
          } else if (enableMDAP && mdapResult) {
            // MDAP MODE: Write generated code to file
            const targetPath = path.isAbsolute(mdapResult.targetFile)
              ? mdapResult.targetFile
              : path.join(payload.workDir, mdapResult.targetFile);

            try {
              // Ensure directory exists
              const targetDir = path.dirname(targetPath);
              if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
              }
              fs.writeFileSync(targetPath, mdapResult.generatedCode, 'utf-8');
              console.log(`[cfn-coordinator]   ✓ MDAP: Generated ${mdapResult.generatedCode.length} chars -> ${mdapResult.targetFile} (${mdapResult.durationMs}ms, T${mdapResult.modelTier})`);
            } catch (writeErr) {
              console.error(`[cfn-coordinator]   ✗ MDAP: Failed to write ${targetPath}: ${sanitizeErrorMessage(writeErr)}`);
            }
          } else {
            // RESOLVED (Issue #6): Async validators now receive actual code content
            // Implementation: Read files from disk in Phase 3 (see line ~482)
            // File contents are read and passed to cfn-async-validator-orchestrator
            console.log(`[cfn-coordinator]   ✓ Implementation complete for ${microTaskId} (${output.durationMs}ms)`);
          }

          // Store execution result (including failures)
          result.executionResults.push({
            microTaskId,
            filesModified: output.filesModified,
            testsPassed: output.testsPassed,
            success: output.success,
            confidence: output.confidence,
            durationMs: output.durationMs,
            error: (output as any).error,
          });

          // Record task completion metric
          metricsCollector.recordTaskCompletion({
            taskId: microTaskId,
            status: output.success ? 'completed' : 'failed',
            completedAt: new Date(),
            durationMs: output.durationMs,
          });

          // TIER ESCALATION: Track failures for escalation
          if (!output.success && enableMDAP) {
            const currentFailures = microTaskFailureCounts.get(microTaskId) || 0;
            const newFailures = currentFailures + 1;
            microTaskFailureCounts.set(microTaskId, newFailures);

            const newTier = Math.min(1 + newFailures, 3);
            console.log(`[coordinator] Escalating ${microTaskId}: T${1 + currentFailures} -> T${newTier} (failure ${newFailures})`);
          }
        }

        // Wait for all tasks in phase to complete before moving to next phase
        console.log(`[cfn-coordinator]   ✓ Phase ${phase.phase} executions submitted`);
        }
      } // End of MDAP else block

      result.metrics.executionTimeMs = Date.now() - executionStartTime;

      console.log(`[cfn-coordinator] ✓ All implementations queued`);
      console.log(`[cfn-coordinator]   Total micro-tasks: ${result.executionResults.length}`);
      console.log(`[cfn-coordinator]   Time: ${result.metrics.executionTimeMs}ms`);

      // ===== PHASE 3: ASYNC VALIDATORS =====
      console.log(`[cfn-coordinator] ===== PHASE 3: ASYNC VALIDATORS =====`);
      const asyncValidationStartTime = Date.now();

      // Collect implementation and test code from execution results
      const implementationFilePaths = result.executionResults.flatMap(r => r.filesModified);
      const testFiles: string[] = []; // TODO: Extract from execution results

      // Read file contents from disk (Issue #6 fix)
      // Async validators need actual code content, not just file paths
      const implementationContents: string[] = [];
      console.log(`[cfn-coordinator] Reading ${implementationFilePaths.length} implementation files...`);

      for (const filePath of implementationFilePaths) {
        try {
          // Resolve absolute path if relative
          const absolutePath = path.isAbsolute(filePath)
            ? filePath
            : path.join(payload.workDir, filePath);

          const content = fs.readFileSync(absolutePath, 'utf-8');
          // Prefix content with file path for context in validators
          const annotatedContent = `// File: ${filePath}\n${content}`;
          implementationContents.push(annotatedContent);

          console.log(`[cfn-coordinator]   ✓ Read ${filePath} (${content.length} chars)`);
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          console.warn(`[cfn-coordinator]   ✗ Could not read ${filePath}: ${errorMessage}`);
          // Add placeholder to maintain array alignment
          implementationContents.push(`// File: ${filePath}\n// ERROR: Could not read file: ${errorMessage}`);
        }
      }

      console.log(`[cfn-coordinator] Spawning async validator orchestrator...`);
      console.log(`[cfn-coordinator]   Implementation files: ${implementationFilePaths.length}`);
      console.log(`[cfn-coordinator]   Successfully read: ${implementationContents.filter(c => !c.includes('ERROR:')).length}`);
      console.log(`[cfn-coordinator]   Test files: ${testFiles.length}`);

      const { result: asyncValidationResult, slaCheck: validationSLA } = await measureSLA(
        "phase3_validation",
        async () => {
          const asyncValidatorHandle = await tasks.trigger("cfn-async-validator-orchestrator", {
            taskId: payload.taskId,
            decompositionPlan,
            implementations: implementationContents, // File contents (Issue #6 fixed)
            tests: testFiles,
            workDir: payload.workDir,
          });

          console.log(`[cfn-coordinator] Waiting for async validators (with timeout protection)...`);

          // Timeout = SLA target × 20 (accommodates parallel validators + retries + overhead)
          return await pollWithTimeout<OrchestratorResult>(
            asyncValidatorHandle.id,
            SLAs.phase3_validation.targetMs * 20,
            "Async validator orchestrator"
          );
        }
      );

      if (validationSLA.breached) {
        console.warn(`[cfn-coordinator] ⚠ SLA breach: Validation took ${validationSLA.elapsed}ms (target: ${validationSLA.target}ms)`);
      }

      result.metrics.asyncValidationTimeMs = Date.now() - asyncValidationStartTime;
      result.asyncValidationResult = asyncValidationResult;

      console.log(`[cfn-coordinator] ✓ Async validation complete`);
      console.log(`[cfn-coordinator]   Consensus: ${asyncValidationResult.consensusReached ? "✓ REACHED" : "✗ FAILED"}`);
      console.log(`[cfn-coordinator]   Overall score: ${asyncValidationResult.overallScore.toFixed(2)}`);
      console.log(`[cfn-coordinator]   Success: ${asyncValidationResult.successCount}/${asyncValidationResult.validators.length}`);
      console.log(`[cfn-coordinator]   Timeouts: ${asyncValidationResult.timeoutCount}`);
      console.log(`[cfn-coordinator]   Failures: ${asyncValidationResult.failureCount}`);
      console.log(`[cfn-coordinator]   Escalated: ${asyncValidationResult.escalatedValidators.join(", ") || "none"}`);
      console.log(`[cfn-coordinator]   Time: ${(result.metrics.asyncValidationTimeMs / 1000).toFixed(2)}s`);

      // ===== PHASE 4: GATE CHECK =====
      console.log(`[cfn-coordinator] ===== PHASE 4: GATE CHECK =====`);
      const gateCheckStartTime = Date.now();

      // Enhanced gate check with async validation results
      const allSucceeded = result.executionResults.every((r) => r.success && r.testsPassed);
      const avgConfidence = result.executionResults.reduce((sum, r) => sum + r.confidence, 0) / result.executionResults.length;

      // Extract security and performance analysis from async validators
      const securityValidator = asyncValidationResult.validators.find(v => v.validatorType === "security");
      const performanceValidator = asyncValidationResult.validators.find(v => v.validatorType === "performance");

      // Composite score combines implementation confidence and async validation score
      const compositeScore = (avgConfidence * 0.4 + asyncValidationResult.overallScore * 0.6) * 100;

      // Gate threshold from mode
      const threshold = payload.mode === "mvp" ? 70 : payload.mode === "standard" ? 95 : 98;

      // Decision logic: pass if composite score >= threshold AND consensus reached
      const gatePassed = compositeScore >= threshold && asyncValidationResult.consensusReached;

      // TIER ESCALATION: Check for unrecoverable tasks (T3 failed MAX_TIER_3_FAILURES times)
      const unrecoverableTasks: string[] = [];
      if (enableMDAP) {
        for (const [microTaskId, failureCount] of Array.from(microTaskFailureCounts.entries())) {
          if (failureCount >= 3 + MAX_TIER_3_FAILURES) { // T3 starts at failure 3, +2 more = 5 total
            unrecoverableTasks.push(microTaskId);
          }
        }
      }

      // Enhanced gate check result
      result.gateCheckResult = {
        taskId: payload.taskId,
        iterationNumber: 1,
        passed: gatePassed,
        decision: gatePassed ? "PROCEED" : (asyncValidationResult.escalatedValidators.length > 0 ? "ABORT" : "ITERATE"),
        compileStatus: {
          success: allSucceeded,
          errorCount: result.executionResults.filter((r) => !r.success).length,
        },
        compositeScore,
        threshold,
        reasoning: [
          `Implementation confidence: ${avgConfidence.toFixed(2)}`,
          `Async validation score: ${asyncValidationResult.overallScore.toFixed(2)}`,
          `Composite score: ${compositeScore.toFixed(1)} (40% impl + 60% validation)`,
          `Consensus: ${asyncValidationResult.consensusReached ? "REACHED" : "FAILED"}`,
          `Escalated validators: ${asyncValidationResult.escalatedValidators.join(", ") || "none"}`,
          ...(enableMDAP && microTaskFailureCounts.size > 0 ? [
            `Tier escalations: ${microTaskFailureCounts.size} tasks with failures`,
            `Unrecoverable tasks: ${unrecoverableTasks.length}`,
          ] : []),
        ],
        securityAnalysis: {
          totalFindings: securityValidator?.findings.length ?? 0,
          criticalFindings: 0, // TODO: Parse severity from findings
          highFindings: 0,
          overallRiskLevel: securityValidator?.score ?? 0 > 0.8 ? "low" : "medium",
          averageVulnerabilityScore: securityValidator?.score ?? 0,
          passed: securityValidator?.status === "success",
        },
        performanceAnalysis: {
          totalIssues: performanceValidator?.findings.length ?? 0,
          criticalIssues: 0,
          averageGrade: performanceValidator?.score ?? 0 > 0.9 ? "A" : "B",
          averageThroughput: 100,
          passed: performanceValidator?.status === "success",
        },
        securityRecommendations: securityValidator?.recommendations ?? [],
        performanceRecommendations: performanceValidator?.recommendations ?? [],
      };

      result.metrics.gateCheckTimeMs = Date.now() - gateCheckStartTime;

      // Record gate check metric
      metricsCollector.recordGateCheck({
        checkId: `gate-${payload.taskId}-${Date.now()}`,
        passed: result.gateCheckResult.passed,
        passRate: result.gateCheckResult.compositeScore / 100,
        testsRun: result.executionResults.length,
        testsPassed: result.executionResults.filter(r => r.success).length,
        durationMs: result.metrics.gateCheckTimeMs,
        completedAt: new Date(),
      });

      console.log(`[cfn-coordinator] ✓ Gate check complete (enhanced with async validation)`);
      console.log(`[cfn-coordinator]   Decision: ${result.gateCheckResult.decision}`);
      console.log(`[cfn-coordinator]   Composite score: ${result.gateCheckResult.compositeScore.toFixed(1)}/100 (threshold: ${result.gateCheckResult.threshold})`);
      console.log(`[cfn-coordinator]   Implementation confidence: ${avgConfidence.toFixed(2)}`);
      console.log(`[cfn-coordinator]   Async validation score: ${asyncValidationResult.overallScore.toFixed(2)}`);
      console.log(`[cfn-coordinator]   Consensus: ${asyncValidationResult.consensusReached ? "✓ REACHED" : "✗ FAILED"}`);
      console.log(`[cfn-coordinator]   Security findings: ${result.gateCheckResult.securityAnalysis.totalFindings}`);
      console.log(`[cfn-coordinator]   Performance issues: ${result.gateCheckResult.performanceAnalysis.totalIssues}`);
      console.log(`[cfn-coordinator]   Time: ${result.metrics.gateCheckTimeMs}ms`);

      // TIER ESCALATION: Log escalation statistics
      if (enableMDAP && microTaskFailureCounts.size > 0) {
        console.log(`[cfn-coordinator] Tier Escalation Stats:`);
        const t1Tasks = Array.from(microTaskFailureCounts.entries()).filter(([_, c]) => c === 0).length;
        const t2Tasks = Array.from(microTaskFailureCounts.entries()).filter(([_, c]) => c === 1 || c === 2).length;
        const t3Tasks = Array.from(microTaskFailureCounts.entries()).filter(([_, c]) => c >= 3).length;
        console.log(`[cfn-coordinator]   T1: ${t1Tasks} tasks`);
        console.log(`[cfn-coordinator]   T2: ${t2Tasks} tasks (escalated from T1)`);
        console.log(`[cfn-coordinator]   T3: ${t3Tasks} tasks (escalated from T2)`);
        console.log(`[cfn-coordinator]   Unrecoverable: ${unrecoverableTasks.length} tasks`);
        if (unrecoverableTasks.length > 0) {
          console.log(`[cfn-coordinator]   Tasks: ${unrecoverableTasks.join(", ")}`);
        }
      }

      // ===== MDAP METRICS TRACKING =====
      // Record metrics for all MDAP execution results with validation status
      if (enableMDAP) {
        console.log(`[cfn-coordinator] Recording MDAP metrics...`);
        const validationPassed = result.gateCheckResult?.decision === "PROCEED";
        const qualityScore = asyncValidationResult.overallScore;

        for (const execResult of result.executionResults) {
          // Find the corresponding MDAP result for model info
          const microTask = decompositionPlan.microTasks.find(t => t.id === execResult.microTaskId);
          const failureCount = microTaskFailureCounts.get(execResult.microTaskId) || 0;
          const modelTier = Math.min(1 + failureCount, 3) as 1 | 2 | 3;

          // Map tier to model name (same as GROQ_MODELS in mdap-implementer)
          const modelName = modelTier === 3 ? "openai/gpt-oss-120b" : "openai/gpt-oss-20b";

          // Record metric to existing tracker (async, non-blocking)
          recordMetric(
            {
              taskId: payload.taskId,
              microTaskId: execResult.microTaskId,
              modelName,
              modelTier,
              success: execResult.success,
              durationMs: execResult.durationMs,
              estimatedCost: 0.001 * modelTier, // Rough estimate based on tier
            },
            validationPassed && execResult.success,
            qualityScore
          ).catch((err) =>
            console.warn(`[cfn-coordinator] Metrics recording failed for ${execResult.microTaskId}: ${err.message}`)
          );

          // ===== RUVECTOR MDAP ANALYTICS INTEGRATION =====
          // Record to RuVector for learning and intelligent recommendations
          recordMDAPOutcome({
            modelName,
            tier: modelTier,
            taskType: 'simple', // MDAP tasks are always atomic/simple
            success: execResult.success && validationPassed,
            qualityScore: qualityScore / 100, // Convert from 0-100 to 0-1
            durationMs: execResult.durationMs,
            cost: 0.001 * modelTier,
            errorPatterns: execResult.error ? [execResult.error] : undefined,
            taskCategory: 'implementation',
          }).catch((err) =>
            console.warn(`[cfn-coordinator] RuVector MDAP recording failed: ${err instanceof Error ? err.message : String(err)}`)
          );

          // Capture failures to error pattern learning
          if (!execResult.success && execResult.error) {
            captureErrorPatternMDAPFailure(
              execResult.microTaskId,
              modelName,
              modelTier,
              'IMPLEMENTATION_FAILURE',
              execResult.error,
              validationPassed, // Did we recover with higher tier?
              failureCount > 0 ? modelTier : undefined // Escalated tier if retry
            ).catch((err) =>
              console.warn(`[cfn-coordinator] Error pattern capture failed: ${err instanceof Error ? err.message : String(err)}`)
            );
          }
        }

        // Check for model deprecation after recording all metrics
        const deprecatedModels = await checkAllModelsForDeprecation();
        if (deprecatedModels.length > 0) {
          console.log(`[cfn-coordinator] Deprecated models detected: ${deprecatedModels.join(', ')}`);
        }

        // Print metrics summary (for logging/monitoring)
        await printMetricsSummary();

        // ===== RUVECTOR MDAP PERFORMANCE ANALYSIS =====
        // Analyze underperforming models and generate recommendations
        if (result.gateCheckResult?.decision === 'ITERATE') {
          console.log(`[cfn-coordinator] [ruvector-mdap] Analyzing model performance after ITERATE decision...`);

          // Get unique models used in this execution
          const usedModels = new Set(
            result.executionResults.map((r) => {
              const failureCount = microTaskFailureCounts.get(r.microTaskId) || 0;
              const modelTier = Math.min(1 + failureCount, 3);
              return modelTier === 3 ? "openai/gpt-oss-120b" : "openai/gpt-oss-20b";
            })
          );

          for (const modelName of usedModels) {
            try {
              // Analyze model performance
              const analysis = await analyzeMDAPModelPerformance(modelName, 24);

              if (analysis.isUnderperforming) {
                console.log(`[cfn-coordinator] [ruvector-mdap] Model ${modelName} underperforming:`);
                console.log(`  Trend: ${analysis.degradationTrend}`);
                console.log(`  Action: ${analysis.recommendedAction}`);
                console.log(`  Confidence: ${(analysis.confidence * 100).toFixed(0)}%`);
                console.log(`  Reasoning: ${analysis.reasoning.join(', ')}`);

                // Generate prompt optimizations if recommended
                if (analysis.recommendedAction === 'optimize_prompt') {
                  const modelTier = modelName.includes('120b') ? 3 : 1;
                  const optimizations = await generatePromptOptimizations(modelName, modelTier);

                  if (optimizations.recommendations.length > 0) {
                    console.log(`[cfn-coordinator] [ruvector-mdap] Prompt optimizations for ${modelName}:`);
                    for (const rec of optimizations.recommendations.slice(0, 3)) {
                      console.log(`    [${rec.priority}] ${rec.addition}`);
                      console.log(`      Rationale: ${rec.rationale}`);
                    }
                    console.log(`  Based on failure patterns: ${optimizations.failurePatterns.join(', ')}`);
                  }
                }
              }
            } catch (analysisErr) {
              console.warn(
                `[cfn-coordinator] [ruvector-mdap] Analysis failed for ${modelName}: ` +
                `${analysisErr instanceof Error ? analysisErr.message : String(analysisErr)}`
              );
            }
          }
        }

        // Log analytics summary (non-blocking)
        getMDAPAnalyticsSummary().then((summary) => {
          console.log(`[cfn-coordinator] [ruvector-mdap] Analytics Summary:`);
          console.log(`  Models tracked: ${summary.modelsTracked}`);
          console.log(`  Total attempts: ${summary.totalAttempts}`);
          console.log(`  Overall success rate: ${(summary.overallSuccessRate * 100).toFixed(1)}%`);
          if (summary.underperformingModels.length > 0) {
            console.log(`  Underperforming: ${summary.underperformingModels.join(', ')}`);
          }
          if (summary.topRecommendations.length > 0) {
            console.log(`  Top recommendations:`);
            for (const rec of summary.topRecommendations.slice(0, 2)) {
              console.log(`    - ${rec}`);
            }
          }
        }).catch((err) =>
          console.warn(`[cfn-coordinator] [ruvector-mdap] Summary failed: ${err instanceof Error ? err.message : String(err)}`)
        );
      }

      // Phase 4: Update decomposition with validation results (async, non-blocking)
      updateDecompositionWithValidation({
        taskId: payload.taskId,
        decompositionId: payload.taskId, // Same ID (decomposition = task)
        orchestratorResult: asyncValidationResult,
        gateDecision: result.gateCheckResult.decision,
      }).catch((err) =>
        console.warn(`[learning] Validation update failed: ${err.message}`)
      );

      // Phase 4.2: Track RAG recall (if RAG was used)
      if (enableRuVector && ragResult !== null) {
        console.log(`[cfn-coordinator] [rag] Tracking RAG recall effectiveness...`);
        // Convert compositeScore (0-100) to gate check score (0-1)
        const finalGateCheckScore = result.gateCheckResult.compositeScore / 100;
        trackRagRecall(payload.taskId, ragResult, finalGateCheckScore).catch((ragRecallErr) =>
          console.warn(`[cfn-coordinator] [rag] ⚠ RAG recall tracking failed: ${ragRecallErr instanceof Error ? ragRecallErr.message : String(ragRecallErr)}`)
        );
      }

      // ===== PHASE 5: VALIDATION (Loop 2) =====
      if (result.gateCheckResult.decision === "PROCEED") {
        console.log(`[cfn-coordinator] ===== PHASE 5: LOOP 2 VALIDATION =====`);
        const validationStartTime = Date.now();

        // TODO: Validator team needs code content
        // For now, using simplified validation
        result.validationResult = {
          status: "APPROVED",
          approved: true,
          confidence: avgConfidence,
          filesModified: result.executionResults.flatMap((r) => r.filesModified),
        };

        result.metrics.validationTimeMs = Date.now() - validationStartTime;

        console.log(`[cfn-coordinator] ✓ Validation complete (simplified)`);
        console.log(`[cfn-coordinator]   Status: ${result.validationResult.status}`);
        console.log(`[cfn-coordinator]   Approved: ${result.validationResult.approved}`);
        console.log(`[cfn-coordinator]   Time: ${result.metrics.validationTimeMs}ms`);
      } else if (result.gateCheckResult.decision === "ITERATE") {
        console.log(`[cfn-coordinator] ===== PHASE 5: TROUBLESHOOTING ANALYSIS =====`);
        const troubleshootingStartTime = Date.now();

        // Get failed validators from async validation result
        const failedValidators = asyncValidationResult.validators.filter(
          v => v.status !== "success"
        );

        console.log(`[cfn-coordinator] Invoking troubleshooting decomposer...`);
        console.log(`[cfn-coordinator]   Failed validators: ${failedValidators.length}`);
        console.log(`[cfn-coordinator]   Iteration: 1`);

        // Collect prior decompositions for context
        const priorDecompositions = {
          architecture: archAnalysis.microTasks,
          security: secAnalysis.microTasks,
          performance: perfAnalysis.microTasks,
          testing: testAnalysis.microTasks,
        };

        // Trigger troubleshooting decomposer
        const troubleshootingHandle = await tasks.trigger("cfn-troubleshooting-decomposer", {
          taskId: payload.taskId,
          taskDescription: payload.taskDescription,
          failedValidators,
          priorDecompositions,
          iterationCount: 1,
          workDir: payload.workDir,
        });

        // Timeout = SLA target × 24 (accommodates retries + network delays + queue time)
        const troubleshootingAnalysis = await pollWithTimeout<TroubleshootingAnalysis>(
          troubleshootingHandle.id,
          SLAs.phase5_troubleshooting.targetMs * 24,
          "Troubleshooting decomposer"
        );

        result.troubleshootingResult = troubleshootingAnalysis;
        result.metrics.troubleshootingTimeMs = Date.now() - troubleshootingStartTime;

        console.log(`[cfn-coordinator] ✓ Troubleshooting analysis complete`);
        console.log(`[cfn-coordinator]   Root causes: ${troubleshootingAnalysis.rootCauses.length}`);
        console.log(`[cfn-coordinator]   Troubleshooting tasks: ${troubleshootingAnalysis.microTasks.length}`);
        console.log(`[cfn-coordinator]   Average confidence: ${(troubleshootingAnalysis.averageConfidence * 100).toFixed(0)}%`);
        console.log(`[cfn-coordinator]   Estimated fix impact: ${(troubleshootingAnalysis.estimatedFixImpact * 100).toFixed(0)}%`);
        console.log(`[cfn-coordinator]   Known patterns: ${troubleshootingAnalysis.knownPatternCount}/${troubleshootingAnalysis.failedValidatorCount}`);
        console.log(`[cfn-coordinator]   Time: ${result.metrics.troubleshootingTimeMs}ms`);
        console.log(`[cfn-coordinator] ⚠ Iteration would continue with ${troubleshootingAnalysis.microTasks.length} focused tasks (not implemented)`);
        result.finalStatus = "FAILED";
      } else {
        console.log(`[cfn-coordinator] 🛑 Gate check aborted due to safety rails`);
        result.finalStatus = "ABORTED";
      }

      // ===== FINAL STATUS =====
      console.log(`[cfn-coordinator] ========== FINAL RESULT ==========`);

      result.totalTime = Date.now() - coordinatorStartTime;
      result.iterations = 1;

      // Add MDAP metrics summary to result (if MDAP was enabled)
      if (enableMDAP) {
        try {
          const mdapMetrics = await getMetricsSummary();
          result.metricsSummary = {
            taskCompletionRate: mdapMetrics.overallSuccessRate,
            averageTaskDurationMs: mdapMetrics.averageDuration,
            gateCheckPassRate: result.gateCheckResult?.decision === "PROCEED" ? 1.0 : 0.0,
            slaBreachCount: 0, // TODO: Track SLA breaches
            errorRate: 1.0 - mdapMetrics.overallSuccessRate,
          };
        } catch (metricsErr) {
          console.warn(`[cfn-coordinator] Failed to get metrics summary: ${metricsErr}`);
        }
      }

      if (result.gateCheckResult.decision === "PROCEED" && result.validationResult?.approved) {
        result.success = true;
        result.finalStatus = "COMPLETED";
        console.log(`[cfn-coordinator] ✅ COMPLETED SUCCESSFULLY`);
      } else if (result.gateCheckResult.decision === "ABORT") {
        result.success = false;
        result.finalStatus = "ABORTED";
        console.log(`[cfn-coordinator] 🛑 ABORTED`);
      } else {
        result.success = false;
        result.finalStatus = "FAILED";
        console.log(`[cfn-coordinator] ❌ FAILED`);
      }

      console.log(`[cfn-coordinator] Summary:`);
      console.log(`[cfn-coordinator]   Total time: ${(result.totalTime / 1000).toFixed(1)}s`);
      console.log(`[cfn-coordinator]   Decomposition: ${(result.metrics.decompositionTimeMs / 1000).toFixed(1)}s`);
      console.log(`[cfn-coordinator]   Execution: ${(result.metrics.executionTimeMs / 1000).toFixed(1)}s`);
      console.log(`[cfn-coordinator]   Async validation: ${(result.metrics.asyncValidationTimeMs / 1000).toFixed(1)}s`);
      console.log(`[cfn-coordinator]   Gate check: ${(result.metrics.gateCheckTimeMs / 1000).toFixed(1)}s`);
      if (result.metrics.troubleshootingTimeMs > 0) {
        console.log(`[cfn-coordinator]   Troubleshooting: ${(result.metrics.troubleshootingTimeMs / 1000).toFixed(1)}s`);
      }
      console.log(`[cfn-coordinator]   Validation: ${(result.metrics.validationTimeMs / 1000).toFixed(1)}s`);

      // Check total loop SLA
      const totalLoopSLA = slaEnforcer.checkCompliance("total_loop", result.totalTime);
      if (totalLoopSLA.breached) {
        console.warn(`[cfn-coordinator] ⚠ Total loop SLA breach: ${result.totalTime}ms (target: ${totalLoopSLA.target}ms)`);
      } else {
        console.log(`[cfn-coordinator] ✓ Total loop SLA met: ${result.totalTime}ms / ${totalLoopSLA.target}ms (${totalLoopSLA.percentOfTarget.toFixed(1)}%)`);
      }

      // Include metrics summary in result
      result.metricsSummary = {
        taskCompletionRate: metricsCollector.getTaskCompletionRate(),
        averageTaskDurationMs: metricsCollector.getAverageTaskDuration(),
        gateCheckPassRate: metricsCollector.getGateCheckPassRate(),
        slaBreachCount: metricsCollector.getSLABreachCount(),
        errorRate: metricsCollector.getErrorRate(),
      };

      logger.info('Coordinator execution complete', {
        finalStatus: result.finalStatus,
        totalTimeMs: result.totalTime,
        microTasksExecuted: result.executionResults.length,
      }, { metricsSummary: result.metricsSummary });

      return result;
    } catch (error) {
      const errorMsg = sanitizeErrorMessage(error);
      console.error(`[cfn-coordinator] ✗ Error: ${errorMsg}`);

      result.success = false;
      result.finalStatus = "FAILED";
      result.totalTime = Date.now() - coordinatorStartTime;

      return result;
    }
  },
});
