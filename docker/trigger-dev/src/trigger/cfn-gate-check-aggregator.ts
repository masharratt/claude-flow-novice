/**
 * CFN Gate Check Aggregator Task for Trigger.dev v4
 *
 * Integrates async validator results (security + performance) and makes
 * PROCEED/ITERATE/ABORT decision based on composite score and mode thresholds.
 *
 * Runs AFTER Loop 3 execution and BEFORE Loop 2 validation:
 *
 * LOOP 3: Implementation (agents execute + spawn async validators in background)
 *   “
 * GATE CHECK (aggregates async results, decides PROCEED/ITERATE)
 *   “
 * LOOP 2: Validation (uses complete package: code + security + performance)
 */

import { task, runs } from "@trigger.dev/sdk/v3";
import type { AsyncSecurityValidatorResult } from "./cfn-async-security-validator.js";
import type { AsyncPerformanceValidatorResult } from "./cfn-async-performance-validator.js";

export interface GateCheckPayload {
  taskId: string;
  iterationNumber: number;

  // Loop 3 results
  implementations: string[]; // Generated code from agents
  tests: string[]; // Generated tests
  compileSuccess: boolean;
  compileErrors: number;

  // Async validator run IDs (from background execution)
  securityValidatorRunIds: string[];
  performanceValidatorRunIds: string[];

  // Gate thresholds (mode-dependent)
  mode: "mvp" | "standard" | "enterprise";
}

export interface GateCheckResult {
  taskId: string;
  iterationNumber: number;
  passed: boolean;
  decision: "PROCEED" | "ITERATE" | "ABORT";

  // Compilation results
  compileStatus: {
    success: boolean;
    errorCount: number;
  };

  // Aggregated async validator results
  securityAnalysis: {
    totalFindings: number;
    criticalFindings: number;
    highFindings: number;
    overallRiskLevel: "critical" | "high" | "medium" | "low";
    averageVulnerabilityScore: number;
    passed: boolean;
  };

  performanceAnalysis: {
    totalIssues: number;
    criticalIssues: number;
    averageGrade: string;
    averageThroughput: number;
    passed: boolean;
  };

  // Gate decision logic
  compositeScore: number; // 0-100
  threshold: number; // Mode-dependent
  reasoning: string[];

  // Recommendations for Loop 2
  securityRecommendations: string[];
  performanceRecommendations: string[];
}

/**
 * Gate Check Aggregator
 *
 * Integrates async validator results and makes PROCEED/ITERATE/ABORT decision
 */
export const cfnGateCheckAggregatorTask = task({
  id: "cfn-gate-check-aggregator",
  retry: { maxAttempts: 1 },

  run: async (payload: GateCheckPayload): Promise<GateCheckResult> => {
    const startTime = Date.now();

    console.log(`[gate-check-aggregator] Starting gate check`);
    console.log(`  Task ID: ${payload.taskId}`);
    console.log(`  Iteration: ${payload.iterationNumber}`);
    console.log(`  Mode: ${payload.mode}`);

    try {
      // 1. Verify compilation
      console.log(`[gate-check-aggregator] Checking compilation status...`);
      if (!payload.compileSuccess) {
        console.warn(
          `[gate-check-aggregator] Compilation failed: ${payload.compileErrors} errors`
        );
      }

      // 2. Collect async validator results
      console.log(`[gate-check-aggregator] Collecting security validator results...`);
      const securityResults = await Promise.all(
        payload.securityValidatorRunIds.map((runId) =>
          runs.poll(runId, { pollIntervalMs: 500 }).then((r) => r.output)
        )
      ).catch((err) => {
        console.warn(`[gate-check-aggregator] Security validator error: ${err.message}`);
        return [];
      });

      console.log(`[gate-check-aggregator] Collecting performance validator results...`);
      const performanceResults = await Promise.all(
        payload.performanceValidatorRunIds.map((runId) =>
          runs.poll(runId, { pollIntervalMs: 500 }).then((r) => r.output)
        )
      ).catch((err) => {
        console.warn(
          `[gate-check-aggregator] Performance validator error: ${err.message}`
        );
        return [];
      });

      // 3. Aggregate security findings
      const securityAnalysis = aggregateSecurityResults(
        securityResults as AsyncSecurityValidatorResult[]
      );

      // 4. Aggregate performance findings
      const performanceAnalysis = aggregatePerformanceResults(
        performanceResults as AsyncPerformanceValidatorResult[]
      );

      // 5. Calculate composite score
      const modeThresholds = {
        mvp: 0.7,
        standard: 0.95,
        enterprise: 0.98,
      };
      const threshold = modeThresholds[payload.mode];

      const compilationScore = payload.compileSuccess
        ? 100
        : Math.max(0, 100 - payload.compileErrors * 10);
      const securityScore = Math.max(
        0,
        100 - securityAnalysis.averageVulnerabilityScore
      );
      const performanceScore = gradeToScore(performanceAnalysis.averageGrade);

      // Weighted composite: 40% compilation, 30% security, 30% performance
      const compositeScore =
        compilationScore * 0.4 + securityScore * 0.3 + performanceScore * 0.3;

      // 6. Make decision
      const reasoning: string[] = [];
      let decision: "PROCEED" | "ITERATE" | "ABORT";

      if (compositeScore >= threshold * 100) {
        decision = "PROCEED";
        reasoning.push(
          ` Composite score ${compositeScore.toFixed(1)}/100 meets threshold ${(
            threshold * 100
          ).toFixed(1)}`
        );
      } else if (
        payload.compileSuccess &&
        securityAnalysis.passed &&
        performanceAnalysis.passed
      ) {
        // Fallback: if all subsystems pass individually, proceed anyway
        decision = "PROCEED";
        reasoning.push(` All subsystems passed (compile, security, performance)`);
      } else {
        decision = "ITERATE";
        reasoning.push(
          ` Composite score ${compositeScore.toFixed(1)}/100 below threshold ${(
            threshold * 100
          ).toFixed(1)}`
        );

        if (!payload.compileSuccess) {
          reasoning.push(`  - Compilation: ${payload.compileErrors} errors remain`);
        }

        if (!securityAnalysis.passed) {
          reasoning.push(
            `  - Security: Risk level ${securityAnalysis.overallRiskLevel}, ${securityAnalysis.criticalFindings} critical findings`
          );
        }

        if (!performanceAnalysis.passed) {
          reasoning.push(
            `  - Performance: Grade ${performanceAnalysis.averageGrade}, has critical issues`
          );
        }
      }

      // 7. Abort conditions (safety rails)
      if (
        securityAnalysis.overallRiskLevel === "critical" &&
        securityAnalysis.criticalFindings > 2
      ) {
        decision = "ABORT";
        reasoning.push(
          `  ABORT: Multiple critical security vulnerabilities detected`
        );
      }

      const result: GateCheckResult = {
        taskId: payload.taskId,
        iterationNumber: payload.iterationNumber,
        passed: decision === "PROCEED",
        decision,
        compileStatus: {
          success: payload.compileSuccess,
          errorCount: payload.compileErrors,
        },
        securityAnalysis,
        performanceAnalysis,
        compositeScore,
        threshold: threshold * 100,
        reasoning,
        securityRecommendations: securityResults.flatMap(
          (r) => r?.recommendations || []
        ),
        performanceRecommendations: performanceResults.flatMap(
          (r) => r?.recommendations || []
        ),
      };

      console.log(`[gate-check-aggregator]  Gate check complete`);
      console.log(`  Decision: ${result.decision}`);
      console.log(`  Composite score: ${result.compositeScore.toFixed(1)}/100`);
      console.log(`  Threshold: ${result.threshold.toFixed(1)}`);
      console.log(`  Security risk: ${result.securityAnalysis.overallRiskLevel}`);
      console.log(`  Performance grade: ${result.performanceAnalysis.averageGrade}`);
      console.log(`  Time: ${Date.now() - startTime}ms`);

      return result;
    } catch (error) {
      const errorMsg = (error as Error).message;
      console.error(`[gate-check-aggregator]  Error: ${errorMsg}`);

      return {
        taskId: payload.taskId,
        iterationNumber: payload.iterationNumber,
        passed: false,
        decision: "ITERATE",
        compileStatus: {
          success: false,
          errorCount: 0,
        },
        securityAnalysis: {
          totalFindings: 0,
          criticalFindings: 0,
          highFindings: 0,
          overallRiskLevel: "medium",
          averageVulnerabilityScore: 0,
          passed: false,
        },
        performanceAnalysis: {
          totalIssues: 0,
          criticalIssues: 0,
          averageGrade: "C",
          averageThroughput: 0,
          passed: false,
        },
        compositeScore: 0,
        threshold: 95,
        reasoning: [`Error during gate check: ${errorMsg}`],
        securityRecommendations: [],
        performanceRecommendations: [],
      };
    }
  },
});

// Helper functions

function aggregateSecurityResults(results: AsyncSecurityValidatorResult[]) {
  if (results.length === 0) {
    return {
      totalFindings: 0,
      criticalFindings: 0,
      highFindings: 0,
      overallRiskLevel: "low" as const,
      averageVulnerabilityScore: 0,
      passed: true,
    };
  }

  let totalFindings = 0;
  let criticalFindings = 0;
  let highFindings = 0;
  let totalVulnScore = 0;
  const riskLevels: string[] = [];

  for (const result of results) {
    totalFindings += result.findings.length;
    criticalFindings += result.findings.filter(
      (f) => f.severity === "critical"
    ).length;
    highFindings += result.findings.filter((f) => f.severity === "high").length;
    totalVulnScore += result.vulnerabilityScore || 0;
    riskLevels.push(result.overallRiskLevel);
  }

  // Highest risk level wins
  const overallRiskLevel = riskLevels.includes("critical")
    ? "critical"
    : riskLevels.includes("high")
      ? "high"
      : riskLevels.includes("medium")
        ? "medium"
        : "low";

  const averageVulnScore = totalVulnScore / results.length;
  const passed = overallRiskLevel !== "critical" && averageVulnScore < 70;

  return {
    totalFindings,
    criticalFindings,
    highFindings,
    overallRiskLevel: overallRiskLevel as "critical" | "high" | "medium" | "low",
    averageVulnerabilityScore: averageVulnScore,
    passed,
  };
}

function aggregatePerformanceResults(results: AsyncPerformanceValidatorResult[]) {
  if (results.length === 0) {
    return {
      totalIssues: 0,
      criticalIssues: 0,
      averageGrade: "B",
      averageThroughput: 100,
      passed: true,
    };
  }

  let totalIssues = 0;
  let criticalIssues = 0;
  let totalThroughput = 0;
  const grades: string[] = [];

  for (const result of results) {
    totalIssues += result.issues.length;
    criticalIssues += result.issues.filter((i) => i.severity === "critical").length;
    totalThroughput += result.estimatedThroughput || 100;
    grades.push(result.overallPerformanceGrade);
  }

  // Worst grade wins
  const gradeOrder = { A: 5, B: 4, C: 3, D: 2, F: 1 };
  const averageGrade = grades.reduce((worst, g) => {
    const gScore = gradeOrder[g as keyof typeof gradeOrder] || 0;
    const wScore = gradeOrder[worst as keyof typeof gradeOrder] || 0;
    return gScore < wScore ? g : worst;
  }, "B");

  const averageThroughput = totalThroughput / results.length;
  const passed =
    (averageGrade === "A" || averageGrade === "B") && criticalIssues === 0;

  return {
    totalIssues,
    criticalIssues,
    averageGrade,
    averageThroughput,
    passed,
  };
}

function gradeToScore(grade: string): number {
  const scores: Record<string, number> = {
    A: 100,
    B: 85,
    C: 70,
    D: 55,
    F: 40,
  };
  return scores[grade] || 70;
}
