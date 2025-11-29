/**
 * Decomposition Performance Monitor
 *
 * Tracks and validates performance metrics for sequential decomposition swarm.
 * Target metrics from DECOMPOSITION_SWARM_RUVECTOR_IMPLEMENTATION_PLAN.md (Task 2.4):
 *
 * - Architecture decomposer: <2 seconds (baseline)
 * - Security decomposer: <2.5 seconds (with arch context)
 * - Performance decomposer: <2 seconds (with arch+security)
 * - Testing decomposer: <2 seconds (with all contexts)
 * - Total decomposition: 8.5-10 seconds (all 4 + merging)
 * - Context passing overhead: <1 second total
 */

export interface DecompositionPhaseMetrics {
  phaseName: "architecture" | "security" | "performance" | "testing" | "merging" | "async-validation" | "gate-check";
  startTimeMs: number;
  endTimeMs: number;
  durationMs: number;
  taskCount: number;
  contextSizeBytes?: number;
  success: boolean;
  errorMessage?: string;
}

export interface ValidatorLatencyMetrics {
  validatorName: string;
  spawnTime: number;
  completeTime: number;
  latencyMs: number;
  retriesUsed: number;
  timedOut: boolean;
}

export interface SequentialDecompositionMetrics {
  totalDurationMs: number;
  phases: DecompositionPhaseMetrics[];
  contextPassingOverheadMs: number;
  totalTasksGenerated: number;
  successRate: number;

  // Phase 3 metrics
  asyncValidation?: {
    totalLatencyMs: number;
    validators: ValidatorLatencyMetrics[];
    parallelReduction: number; // Expected: 50-67%
    gateDecisionLatencyMs: number; // Target: <500ms
    cacheHitRate: number;
  };

  // Performance targets validation
  meetsTargets: {
    architectureUnder2s: boolean;
    securityUnder2_5s: boolean;
    performanceUnder2s: boolean;
    testingUnder2s: boolean;
    totalUnder10s: boolean;
    contextOverheadUnder1s: boolean;
  };
}

export interface PerformanceTargets {
  architectureMaxMs: number;    // Default: 2000
  securityMaxMs: number;         // Default: 2500
  performanceMaxMs: number;      // Default: 2000
  testingMaxMs: number;          // Default: 2000
  totalMaxMs: number;            // Default: 10000
  contextOverheadMaxMs: number;  // Default: 1000
}

export class DecompositionPerformanceMonitor {
  private phases: DecompositionPhaseMetrics[] = [];
  private startTime: number = 0;
  private targets: PerformanceTargets;
  private asyncValidationMetrics?: {
    totalLatencyMs: number;
    validators: ValidatorLatencyMetrics[];
    parallelReduction: number;
    gateDecisionLatencyMs: number;
    cacheHitRate: number;
  };

  constructor(targets?: Partial<PerformanceTargets>) {
    this.targets = {
      architectureMaxMs: targets?.architectureMaxMs ?? 2000,
      securityMaxMs: targets?.securityMaxMs ?? 2500,
      performanceMaxMs: targets?.performanceMaxMs ?? 2000,
      testingMaxMs: targets?.testingMaxMs ?? 2000,
      totalMaxMs: targets?.totalMaxMs ?? 10000,
      contextOverheadMaxMs: targets?.contextOverheadMaxMs ?? 1000,
    };
  }

  /**
   * Start monitoring the overall decomposition process
   */
  start(): void {
    this.startTime = Date.now();
    this.phases = [];
  }

  /**
   * Start a specific decomposition phase
   */
  startPhase(
    phaseName: DecompositionPhaseMetrics["phaseName"]
  ): { startTimeMs: number } {
    const startTimeMs = Date.now();
    return { startTimeMs };
  }

  /**
   * End a specific decomposition phase and record metrics
   */
  endPhase(
    phaseName: DecompositionPhaseMetrics["phaseName"],
    startTimeMs: number,
    taskCount: number,
    contextSizeBytes?: number,
    error?: Error
  ): DecompositionPhaseMetrics {
    const endTimeMs = Date.now();
    const durationMs = endTimeMs - startTimeMs;

    const metrics: DecompositionPhaseMetrics = {
      phaseName,
      startTimeMs,
      endTimeMs,
      durationMs,
      taskCount,
      contextSizeBytes,
      success: !error,
      errorMessage: error?.message,
    };

    this.phases.push(metrics);
    return metrics;
  }

  /**
   * Calculate context passing overhead (time spent serializing/passing context)
   * Estimated as the total time minus actual decomposer execution time
   */
  calculateContextOverhead(): number {
    const totalDecomposerTime = this.phases
      .filter((p) => p.phaseName !== "merging" && p.phaseName !== "async-validation" && p.phaseName !== "gate-check")
      .reduce((sum, p) => sum + p.durationMs, 0);

    const totalTime = this.phases.reduce((sum, p) => sum + p.durationMs, 0);

    // Overhead = total time - sum of decomposer times
    // This includes context serialization, network transfer, etc.
    return totalTime - totalDecomposerTime;
  }

  /**
   * Record Phase 3 async validation metrics
   * Captures per-validator latency and calculates parallel reduction
   */
  recordAsyncValidationMetrics(
    validatorMetrics: ValidatorLatencyMetrics[],
    totalLatencyMs: number,
    gateDecisionLatencyMs: number,
    cacheHitRate: number = 0
  ): void {
    // Calculate parallel reduction (expected: 50-67%)
    const sequentialLatencyMs = validatorMetrics.reduce((sum, v) => sum + v.latencyMs, 0);
    const parallelReduction = sequentialLatencyMs > 0
      ? ((sequentialLatencyMs - totalLatencyMs) / sequentialLatencyMs) * 100
      : 0;

    this.asyncValidationMetrics = {
      totalLatencyMs,
      validators: validatorMetrics,
      parallelReduction,
      gateDecisionLatencyMs,
      cacheHitRate,
    };
  }

  /**
   * Get complete metrics report with target validation
   */
  getMetrics(): SequentialDecompositionMetrics {
    const totalDurationMs = Date.now() - this.startTime;
    const successfulPhases = this.phases.filter((p) => p.success).length;
    const successRate = this.phases.length > 0 ? successfulPhases / this.phases.length : 0;
    const totalTasksGenerated = this.phases.reduce((sum, p) => sum + p.taskCount, 0);
    const contextOverheadMs = this.calculateContextOverhead();

    // Find specific phase durations
    const archPhase = this.phases.find((p) => p.phaseName === "architecture");
    const secPhase = this.phases.find((p) => p.phaseName === "security");
    const perfPhase = this.phases.find((p) => p.phaseName === "performance");
    const testPhase = this.phases.find((p) => p.phaseName === "testing");

    // Validate against targets
    const meetsTargets = {
      architectureUnder2s: (archPhase?.durationMs ?? 0) < this.targets.architectureMaxMs,
      securityUnder2_5s: (secPhase?.durationMs ?? 0) < this.targets.securityMaxMs,
      performanceUnder2s: (perfPhase?.durationMs ?? 0) < this.targets.performanceMaxMs,
      testingUnder2s: (testPhase?.durationMs ?? 0) < this.targets.testingMaxMs,
      totalUnder10s: totalDurationMs < this.targets.totalMaxMs,
      contextOverheadUnder1s: contextOverheadMs < this.targets.contextOverheadMaxMs,
    };

    return {
      totalDurationMs,
      phases: this.phases,
      contextPassingOverheadMs: contextOverheadMs,
      totalTasksGenerated,
      successRate,
      asyncValidation: this.asyncValidationMetrics,
      meetsTargets,
    };
  }

  /**
   * Log metrics to console in human-readable format
   */
  logMetrics(metrics: SequentialDecompositionMetrics): void {
    console.log("");
    console.log("=== SEQUENTIAL DECOMPOSITION PERFORMANCE REPORT ===");
    console.log("");
    console.log(`Total Duration: ${(metrics.totalDurationMs / 1000).toFixed(2)}s`);
    console.log(`Total Tasks Generated: ${metrics.totalTasksGenerated}`);
    console.log(`Success Rate: ${(metrics.successRate * 100).toFixed(1)}%`);
    console.log(`Context Passing Overhead: ${(metrics.contextPassingOverheadMs / 1000).toFixed(2)}s`);
    console.log("");
    console.log("Phase Breakdown:");

    for (const phase of metrics.phases) {
      const status = phase.success ? "✓" : "✗";
      const contextInfo = phase.contextSizeBytes
        ? ` | Context: ${(phase.contextSizeBytes / 1024).toFixed(1)}KB`
        : "";

      console.log(
        `  ${status} ${phase.phaseName.padEnd(15)} ${(phase.durationMs / 1000).toFixed(2)}s | ${phase.taskCount} tasks${contextInfo}`
      );

      if (!phase.success && phase.errorMessage) {
        console.log(`    Error: ${phase.errorMessage}`);
      }
    }

    console.log("");

    // Phase 3 async validation metrics (if available)
    if (metrics.asyncValidation) {
      console.log("Phase 3 Async Validation:");
      console.log(`  Total latency: ${(metrics.asyncValidation.totalLatencyMs / 1000).toFixed(2)}s`);
      console.log(`  Parallel reduction: ${metrics.asyncValidation.parallelReduction.toFixed(1)}% (target: 50-67%)`);
      console.log(`  Gate decision latency: ${metrics.asyncValidation.gateDecisionLatencyMs}ms (target: <500ms)`);
      console.log(`  Cache hit rate: ${(metrics.asyncValidation.cacheHitRate * 100).toFixed(1)}%`);
      console.log("");
      console.log("  Per-Validator Latency:");

      for (const validator of metrics.asyncValidation.validators) {
        const status = validator.timedOut ? "✗ TIMEOUT" : "✓";
        console.log(
          `    ${status} ${validator.validatorName.padEnd(20)} ${(validator.latencyMs / 1000).toFixed(2)}s | retries: ${validator.retriesUsed}`
        );
      }

      console.log("");
    }

    console.log("Target Validation:");
    console.log(`  Architecture < 2.0s:     ${metrics.meetsTargets.architectureUnder2s ? "✓ PASS" : "✗ FAIL"}`);
    console.log(`  Security < 2.5s:         ${metrics.meetsTargets.securityUnder2_5s ? "✓ PASS" : "✗ FAIL"}`);
    console.log(`  Performance < 2.0s:      ${metrics.meetsTargets.performanceUnder2s ? "✓ PASS" : "✗ FAIL"}`);
    console.log(`  Testing < 2.0s:          ${metrics.meetsTargets.testingUnder2s ? "✓ PASS" : "✗ FAIL"}`);
    console.log(`  Total < 10.0s:           ${metrics.meetsTargets.totalUnder10s ? "✓ PASS" : "✗ FAIL"}`);
    console.log(`  Context Overhead < 1.0s: ${metrics.meetsTargets.contextOverheadUnder1s ? "✓ PASS" : "✗ FAIL"}`);
    console.log("");

    // Overall result
    const allTargetsMet = Object.values(metrics.meetsTargets).every((v) => v);
    if (allTargetsMet) {
      console.log("OVERALL: ✓ ALL PERFORMANCE TARGETS MET");
    } else {
      console.log("OVERALL: ✗ SOME PERFORMANCE TARGETS NOT MET");
    }
    console.log("");
  }

  /**
   * Get metrics as JSON (for storage/analysis)
   */
  getMetricsJSON(): string {
    return JSON.stringify(this.getMetrics(), null, 2);
  }

  /**
   * Reset monitor for a new decomposition run
   */
  reset(): void {
    this.phases = [];
    this.startTime = 0;
  }
}

/**
 * Helper to calculate size of context object in bytes
 */
export function calculateContextSize(context: any): number {
  try {
    return new TextEncoder().encode(JSON.stringify(context)).length;
  } catch {
    return 0;
  }
}
