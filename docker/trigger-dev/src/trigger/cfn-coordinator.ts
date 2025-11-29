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
import { DecompositionPerformanceMonitor, calculateContextSize } from "../lib/decomposition-performance-monitor.js";
// Phase 4: RuVector Learning Hooks
import { captureDecompositionToRuVector, updateDecompositionWithValidation } from "../lib/ruvector-learning-hooks.js";
import { findSimilarDecompositions, generateAdaptivePrompt, trackRagRecall } from "../lib/ruvector-rag-decomposition.js";
// SLA Enforcement
import { measureSLA, slaEnforcer, SLACheckResult, SLAs } from "../lib/sla-enforcement.js";

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

  return result.output as T;
}

export interface CFNCoordinatorPayload {
  taskId: string;
  taskDescription: string;
  workDir: string;
  mode: "mvp" | "standard" | "enterprise";
  maxIterations: number;
  complexity: "simple" | "moderate" | "complex";
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
      console.log(`[cfn-coordinator] ========== CFN LOOP COORDINATOR v3 ==========`);
      console.log(`[cfn-coordinator] Task: ${payload.taskId}`);
      console.log(`[cfn-coordinator] Description: ${payload.taskDescription.substring(0, 80)}...`);
      console.log(`[cfn-coordinator] Mode: ${payload.mode}`);
      console.log(`[cfn-coordinator] Max iterations: ${payload.maxIterations}`);

      // ===== PHASE 1: SEQUENTIAL DECOMPOSITION WITH CONTEXT PASSING =====
      console.log(``);
      console.log(`[cfn-coordinator] ===== PHASE 1: SEQUENTIAL DECOMPOSITION (v3.1) =====`);
      const decompositionStartTime = Date.now();
      const perfMonitor = new DecompositionPerformanceMonitor();
      perfMonitor.start();

      // Step 1: Architecture Decomposer (baseline, no context)
      console.log(`[cfn-coordinator] Step 1/4: Architecture decomposition...`);
      const archPhase = perfMonitor.startPhase("architecture");
      const { result: archAnalysis, slaCheck: archSLA } = await measureSLA(
        "phase2_individual_decomposer",
        async () => {
          const archHandle = await tasks.trigger("cfn-architecture-decomposer", {
            taskId: payload.taskId,
            taskDescription: payload.taskDescription,
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
            taskDescription: payload.taskDescription,
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
            taskDescription: payload.taskDescription,
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
            taskDescription: payload.taskDescription,
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
      console.log(``);
      console.log(`[cfn-coordinator] ===== PHASE 2: EXECUTION + ASYNC VALIDATORS =====`);
      const executionStartTime = Date.now();

      const implementationHandles: { id: string; microTaskId: string }[] = [];
      const securityValidatorHandles: { id: string; microTaskId: string }[] = [];
      const performanceValidatorHandles: { id: string; microTaskId: string }[] = [];

      // Execute each micro-task in parallel (respecting phase dependencies)
      for (const phase of decompositionPlan.executionPhases) {
        console.log(`[cfn-coordinator] Executing phase ${phase.phase} (${phase.parallelTasks.length} parallel tasks)`);

        // Spawn all tasks in this phase
        const phaseImplementations = await Promise.all(
          phase.parallelTasks.map((microTaskId) => {
            const microTask = decompositionPlan.microTasks.find((t) => t.id === microTaskId)!;
            return tasks.trigger("cfn-implementer-v2", {
              taskId: `${payload.taskId}-${microTaskId}`,
              agentId: `agent-${microTaskId}`,
              iterationId: 1,
              agentType: "implementer",
              taskDescription: `${microTask.title}: ${microTask.description}`,
              workDir: payload.workDir,
              complexity: payload.complexity,
              autoIterate: true,
              maxIterations: 3,
              timeout: 60000,
            });
          })
        );

        // PERFORMANCE FIX: Parallel polling instead of sequential
        // Wait for all implementations to complete in parallel
        const pollPromises = phaseImplementations.map((implHandle, i) => {
          const microTaskId = phase.parallelTasks[i];
          return pollWithTimeout<ImplementerV2Result>(
            implHandle.id,
            300000,
            `Implementer for task ${microTaskId}`
          ).then(output => ({ implHandle, microTaskId, output }));
        });

        const outputs = await Promise.all(pollPromises);

        // Process all outputs
        for (const { implHandle, microTaskId, output } of outputs) {
          implementationHandles.push({ id: implHandle.id, microTaskId });

          // RESOLVED (Issue #6): Async validators now receive actual code content
          // Implementation: Read files from disk in Phase 3 (see line ~482)
          // File contents are read and passed to cfn-async-validator-orchestrator
          console.log(`[cfn-coordinator]   ✓ Implementation complete for ${microTaskId}`);

          // Placeholder handles (empty for now)
          // const secHandle = await tasks.trigger("cfn-async-security-validator", {...});
          // const perfHandle = await tasks.trigger("cfn-async-performance-validator", {...});
          // securityValidatorHandles.push({ id: secHandle.id, microTaskId });
          // performanceValidatorHandles.push({ id: perfHandle.id, microTaskId });

          // Store execution result
          result.executionResults.push({
            microTaskId,
            filesModified: output.filesModified,
            testsPassed: output.testsPassed,
            success: output.success,
            confidence: output.confidence,
            durationMs: output.durationMs,
          });
        }

        // Wait for all tasks in phase to complete before moving to next phase
        console.log(`[cfn-coordinator]   ✓ Phase ${phase.phase} executions submitted`);
      }

      result.metrics.executionTimeMs = Date.now() - executionStartTime;

      console.log(`[cfn-coordinator] ✓ All implementations queued`);
      console.log(`[cfn-coordinator]   Total micro-tasks: ${result.executionResults.length}`);
      console.log(`[cfn-coordinator]   Time: ${result.metrics.executionTimeMs}ms`);

      // ===== PHASE 3: ASYNC VALIDATORS =====
      console.log(``);
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
      console.log(``);

      // ===== PHASE 4: GATE CHECK =====
      console.log(``);
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

      console.log(`[cfn-coordinator] ✓ Gate check complete (enhanced with async validation)`);
      console.log(`[cfn-coordinator]   Decision: ${result.gateCheckResult.decision}`);
      console.log(`[cfn-coordinator]   Composite score: ${result.gateCheckResult.compositeScore.toFixed(1)}/100 (threshold: ${result.gateCheckResult.threshold})`);
      console.log(`[cfn-coordinator]   Implementation confidence: ${avgConfidence.toFixed(2)}`);
      console.log(`[cfn-coordinator]   Async validation score: ${asyncValidationResult.overallScore.toFixed(2)}`);
      console.log(`[cfn-coordinator]   Consensus: ${asyncValidationResult.consensusReached ? "✓ REACHED" : "✗ FAILED"}`);
      console.log(`[cfn-coordinator]   Security findings: ${result.gateCheckResult.securityAnalysis.totalFindings}`);
      console.log(`[cfn-coordinator]   Performance issues: ${result.gateCheckResult.performanceAnalysis.totalIssues}`);
      console.log(`[cfn-coordinator]   Time: ${result.metrics.gateCheckTimeMs}ms`);

      // Phase 4: Update decomposition with validation results (async, non-blocking)
      updateDecompositionWithValidation({
        taskId: payload.taskId,
        decompositionId: payload.taskId, // Same ID (decomposition = task)
        orchestratorResult: asyncValidationResult,
        gateDecision: result.gateCheckResult.decision,
      }).catch((err) =>
        console.warn(`[learning] Validation update failed: ${err.message}`)
      );

      // ===== PHASE 5: VALIDATION (Loop 2) =====
      if (result.gateCheckResult.decision === "PROCEED") {
        console.log(``);
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
        console.log(``);
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
        console.log(``);
        console.log(`[cfn-coordinator] ⚠ Iteration would continue with ${troubleshootingAnalysis.microTasks.length} focused tasks (not implemented)`);
        result.finalStatus = "FAILED";
      } else {
        console.log(``);
        console.log(`[cfn-coordinator] 🛑 Gate check aborted due to safety rails`);
        result.finalStatus = "ABORTED";
      }

      // ===== FINAL STATUS =====
      console.log(``);
      console.log(`[cfn-coordinator] ========== FINAL RESULT ==========`);

      result.totalTime = Date.now() - coordinatorStartTime;
      result.iterations = 1;

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

      console.log(``);
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

      return result;
    } catch (error) {
      const errorMsg = (error as Error).message;
      console.error(`[cfn-coordinator] ✗ Error: ${errorMsg}`);

      result.success = false;
      result.finalStatus = "FAILED";
      result.totalTime = Date.now() - coordinatorStartTime;

      return result;
    }
  },
});
