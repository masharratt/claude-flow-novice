/**
 * CFN Troubleshooting Decomposer - Phase 5 Task 5.1
 *
 * 5th specialized decomposer that analyzes validation failures and error patterns
 * to generate targeted troubleshooting micro-tasks.
 *
 * INTEGRATION POINT: Called by cfn-coordinator when gateDecision === "ITERATE"
 *
 * INPUT:
 * - Failed validator results from async validator orchestrator
 * - Error patterns from Phase 4 RuVector error library
 * - Prior decomposition outputs from Phases 2-4
 * - Current iteration count
 *
 * OUTPUT:
 * - Root cause analysis for each failed validator
 * - Targeted micro-tasks to fix specific validation failures
 * - Suggested code changes with file paths and line numbers
 * - Estimated impact scores (confidence that fix will resolve issue)
 *
 * CONFIDENCE TARGET: 0.88+
 */

import { task } from "@trigger.dev/sdk/v3";
import type { ValidatorResult } from "./cfn-async-validator-orchestrator.js";
import type { ErrorPattern } from "../lib/ruvector-error-pattern-learning.js";
import { analyzeErrorPatterns } from "../lib/ruvector-error-pattern-learning.js";
import { parseJSONFromResponse } from "../lib/validation-schemas.js";

// =============================================
// Type Definitions
// =============================================

export interface TroubleshootingInput {
  taskId: string;
  taskDescription: string;
  failedValidators: ValidatorResult[]; // Validators that failed or timed out
  priorDecompositions: {
    architecture?: any[];
    security?: any[];
    performance?: any[];
    testing?: any[];
  };
  iterationCount: number; // How many times has this task been retried?
  workDir?: string;
}

export interface RootCause {
  validator: string; // Which validator failed (security, performance, etc.)
  cause: string; // Root cause description
  confidence: number; // 0.0-1.0 confidence in this diagnosis
  findings: string[]; // Specific findings that led to this diagnosis
  pattern?: ErrorPattern; // Learned error pattern (if known)
}

export interface TroubleshootingMicroTask {
  id: string;
  title: string;
  description: string;
  targetValidator: string; // Which validator should this fix address?
  estimatedImpact: number; // 0.0-1.0 confidence it will fix the issue
  priority: "high" | "medium" | "low";
  category: "security" | "performance" | "testing" | "architecture" | "code-quality";
  suggestedChanges?: SuggestedChange[];
}

export interface SuggestedChange {
  filePath?: string;
  lineNumbers?: number[];
  change: string; // Description of what to change
  rationale: string; // Why this change will fix the issue
}

export interface TroubleshootingAnalysis {
  taskId: string;
  timestamp: number;
  iterationCount: number;

  // Root cause analysis
  rootCauses: RootCause[];

  // Targeted micro-tasks to address failures
  microTasks: TroubleshootingMicroTask[];

  // Suggested code changes (extracted from micro-tasks)
  suggestedChanges: SuggestedChange[];

  // Metrics
  failedValidatorCount: number;
  totalFindings: number;
  knownPatternCount: number; // How many failures matched known error patterns
  averageConfidence: number; // Average confidence across root causes
  estimatedFixImpact: number; // Average estimated impact across micro-tasks

  // Metadata
  analysisTimeMs: number;
}

// =============================================
// Root Cause Analysis Logic
// =============================================

/**
 * Analyze a failed validator to determine root cause
 */
async function analyzeValidatorFailure(
  validator: ValidatorResult,
  errorPatterns: ErrorPattern[],
  iterationCount: number
): Promise<RootCause> {
  // Extract validator type and findings
  const validatorType = validator.validatorType;
  const findings = validator.findings ?? [];
  const error = validator.error;

  // Check if this failure matches a known error pattern
  const matchingPattern = errorPatterns.find(
    (p) => p.validatorName.includes(validatorType) && error?.includes(p.errorType)
  );

  // Build root cause based on validator type and findings
  let cause = "";
  let confidence = 0.70; // Base confidence

  if (matchingPattern) {
    // Known pattern - higher confidence
    cause = `Known issue: ${matchingPattern.errorType} (seen ${matchingPattern.frequency} times, ${(matchingPattern.successRate * 100).toFixed(0)}% success rate)`;
    confidence = Math.max(0.80, matchingPattern.successRate);
  } else {
    // Unknown pattern - analyze findings
    if (validator.status === "timeout") {
      cause = `Validator timed out after ${(validator.latencyMs / 1000).toFixed(0)}s - likely performance issue or infinite loop`;
      confidence = 0.75;
    } else if (validator.status === "error" && error) {
      cause = `Validator error: ${error.substring(0, 100)}`;
      confidence = 0.70;
    } else if (findings.length > 0) {
      // Analyze findings to determine root cause
      const securityKeywords = ["vulnerability", "injection", "xss", "csrf", "auth", "permission"];
      const performanceKeywords = ["slow", "timeout", "memory", "cpu", "latency", "throughput"];
      const testingKeywords = ["coverage", "test", "assertion", "mock", "edge case"];

      const findingsText = findings.join(" ").toLowerCase();

      if (securityKeywords.some((kw) => findingsText.includes(kw))) {
        cause = "Security vulnerabilities detected in implementation";
        confidence = 0.85;
      } else if (performanceKeywords.some((kw) => findingsText.includes(kw))) {
        cause = "Performance issues detected - optimization needed";
        confidence = 0.85;
      } else if (testingKeywords.some((kw) => findingsText.includes(kw))) {
        cause = "Test coverage or quality issues detected";
        confidence = 0.80;
      } else {
        cause = `Code quality issues: ${findings.length} findings`;
        confidence = 0.75;
      }
    } else {
      cause = "Unknown validator failure - no specific findings";
      confidence = 0.60;
    }
  }

  // Adjust confidence based on iteration count
  // Higher iterations = less confidence in quick fixes
  if (iterationCount > 3) {
    confidence *= 0.9; // Reduce confidence by 10%
  }
  if (iterationCount > 5) {
    confidence *= 0.85; // Further reduce for very high iterations
  }

  return {
    validator: validatorType,
    cause,
    confidence: Math.min(confidence, 0.95), // Cap at 0.95
    findings,
    pattern: matchingPattern,
  };
}

/**
 * Generate troubleshooting micro-tasks from root causes
 */
function generateTroubleshootingMicroTasks(
  rootCauses: RootCause[],
  taskDescription: string
): TroubleshootingMicroTask[] {
  const microTasks: TroubleshootingMicroTask[] = [];

  for (const rootCause of rootCauses) {
    const validatorType = rootCause.validator;
    const findings = rootCause.findings;

    // Create micro-task for each root cause
    if (validatorType === "security") {
      // Security fixes
      for (let i = 0; i < Math.min(findings.length, 3); i++) {
        const finding = findings[i];
        microTasks.push({
          id: `troubleshoot-security-${i}`,
          title: `Fix security issue: ${finding.substring(0, 50)}`,
          description: `Address security vulnerability identified by validator:\n${finding}\n\nRoot cause: ${rootCause.cause}`,
          targetValidator: "security",
          estimatedImpact: rootCause.confidence * 0.9, // Slightly lower than root cause confidence
          priority: "high",
          category: "security",
          suggestedChanges: rootCause.pattern
            ? [
                {
                  change: rootCause.pattern.suggestedStrategy.rationale,
                  rationale: `Based on ${rootCause.pattern.frequency} historical occurrences with ${(rootCause.pattern.successRate * 100).toFixed(0)}% success rate`,
                },
              ]
            : undefined,
        });
      }
    } else if (validatorType === "performance") {
      // Performance fixes
      for (let i = 0; i < Math.min(findings.length, 3); i++) {
        const finding = findings[i];
        microTasks.push({
          id: `troubleshoot-performance-${i}`,
          title: `Optimize performance: ${finding.substring(0, 50)}`,
          description: `Address performance issue identified by validator:\n${finding}\n\nRoot cause: ${rootCause.cause}`,
          targetValidator: "performance",
          estimatedImpact: rootCause.confidence * 0.85,
          priority: "medium",
          category: "performance",
        });
      }
    } else if (validatorType === "testing") {
      // Testing fixes
      for (let i = 0; i < Math.min(findings.length, 3); i++) {
        const finding = findings[i];
        microTasks.push({
          id: `troubleshoot-testing-${i}`,
          title: `Improve test coverage: ${finding.substring(0, 50)}`,
          description: `Address testing issue identified by validator:\n${finding}\n\nRoot cause: ${rootCause.cause}`,
          targetValidator: "testing",
          estimatedImpact: rootCause.confidence * 0.80,
          priority: "medium",
          category: "testing",
        });
      }
    } else if (validatorType === "architecture") {
      // Architecture fixes
      for (let i = 0; i < Math.min(findings.length, 2); i++) {
        const finding = findings[i];
        microTasks.push({
          id: `troubleshoot-architecture-${i}`,
          title: `Fix architecture issue: ${finding.substring(0, 50)}`,
          description: `Address architecture issue identified by validator:\n${finding}\n\nRoot cause: ${rootCause.cause}`,
          targetValidator: "architecture",
          estimatedImpact: rootCause.confidence * 0.85,
          priority: "high",
          category: "architecture",
        });
      }
    } else if (validatorType === "code-quality") {
      // Code quality fixes
      for (let i = 0; i < Math.min(findings.length, 2); i++) {
        const finding = findings[i];
        microTasks.push({
          id: `troubleshoot-code-quality-${i}`,
          title: `Improve code quality: ${finding.substring(0, 50)}`,
          description: `Address code quality issue identified by validator:\n${finding}\n\nRoot cause: ${rootCause.cause}`,
          targetValidator: "code-quality",
          estimatedImpact: rootCause.confidence * 0.75,
          priority: "low",
          category: "code-quality",
        });
      }
    }
  }

  // Limit total micro-tasks to avoid overwhelming implementers
  return microTasks.slice(0, 10); // Top 10 highest-impact tasks
}

// =============================================
// Main Troubleshooting Decomposer Task
// =============================================

export const cfnTroubleshootingDecomposerTask = task({
  id: "cfn-troubleshooting-decomposer",
  retry: { maxAttempts: 1 },

  run: async (payload: TroubleshootingInput): Promise<TroubleshootingAnalysis> => {
    const startTime = Date.now();

    console.log(`[troubleshooting-decomposer] ========== TROUBLESHOOTING ANALYSIS ==========`);
    console.log(`[troubleshooting-decomposer] Task: ${payload.taskId}`);
    console.log(`[troubleshooting-decomposer] Iteration: ${payload.iterationCount}`);
    console.log(`[troubleshooting-decomposer] Failed validators: ${payload.failedValidators.length}`);
    console.log(``);

    // ===== STEP 1: LOAD ERROR PATTERNS FROM PHASE 4 =====
    console.log(`[troubleshooting-decomposer] Step 1: Loading error patterns from RuVector...`);
    let errorPatterns: ErrorPattern[] = [];
    try {
      const analysis = await analyzeErrorPatterns(50); // Top 50 patterns
      errorPatterns = analysis.patterns;
      console.log(`[troubleshooting-decomposer]   ✓ Loaded ${errorPatterns.length} error patterns`);
      console.log(
        `[troubleshooting-decomposer]   Most common: ${analysis.mostCommonPattern?.key ?? "none"} (${analysis.mostCommonPattern?.frequency ?? 0} occurrences)`
      );
    } catch (error) {
      console.warn(
        `[troubleshooting-decomposer]   ⚠ Failed to load error patterns: ${error instanceof Error ? error.message : String(error)}`
      );
      // Continue with empty patterns
    }

    // ===== STEP 2: ANALYZE ROOT CAUSES =====
    console.log(``);
    console.log(`[troubleshooting-decomposer] Step 2: Analyzing root causes...`);
    const rootCauses: RootCause[] = [];

    for (const validator of payload.failedValidators) {
      const rootCause = await analyzeValidatorFailure(validator, errorPatterns, payload.iterationCount);
      rootCauses.push(rootCause);

      console.log(`[troubleshooting-decomposer]   ${validator.validatorType}: ${rootCause.cause}`);
      console.log(
        `[troubleshooting-decomposer]     Confidence: ${(rootCause.confidence * 100).toFixed(0)}% | Findings: ${rootCause.findings.length}`
      );
    }

    // ===== STEP 3: GENERATE TROUBLESHOOTING MICRO-TASKS =====
    console.log(``);
    console.log(`[troubleshooting-decomposer] Step 3: Generating troubleshooting micro-tasks...`);
    const microTasks = generateTroubleshootingMicroTasks(rootCauses, payload.taskDescription);

    console.log(`[troubleshooting-decomposer]   ✓ Generated ${microTasks.length} micro-tasks`);
    for (const task of microTasks.slice(0, 5)) {
      // Show top 5
      console.log(
        `[troubleshooting-decomposer]     [${task.priority}] ${task.title} (impact: ${(task.estimatedImpact * 100).toFixed(0)}%)`
      );
    }

    // ===== STEP 4: EXTRACT SUGGESTED CHANGES =====
    const suggestedChanges = microTasks.flatMap((t) => t.suggestedChanges ?? []);

    // ===== STEP 5: CALCULATE METRICS =====
    const knownPatternCount = rootCauses.filter((rc) => rc.pattern !== undefined).length;
    const averageConfidence =
      rootCauses.reduce((sum, rc) => sum + rc.confidence, 0) / (rootCauses.length || 1);
    const estimatedFixImpact =
      microTasks.reduce((sum, task) => sum + task.estimatedImpact, 0) / (microTasks.length || 1);

    const result: TroubleshootingAnalysis = {
      taskId: payload.taskId,
      timestamp: Date.now(),
      iterationCount: payload.iterationCount,
      rootCauses,
      microTasks,
      suggestedChanges,
      failedValidatorCount: payload.failedValidators.length,
      totalFindings: rootCauses.reduce((sum, rc) => sum + rc.findings.length, 0),
      knownPatternCount,
      averageConfidence,
      estimatedFixImpact,
      analysisTimeMs: Date.now() - startTime,
    };

    // ===== FINAL SUMMARY =====
    console.log(``);
    console.log(`[troubleshooting-decomposer] ========== ANALYSIS COMPLETE ==========`);
    console.log(`[troubleshooting-decomposer] Root causes identified: ${result.rootCauses.length}`);
    console.log(
      `[troubleshooting-decomposer] Average confidence: ${(result.averageConfidence * 100).toFixed(0)}%`
    );
    console.log(`[troubleshooting-decomposer] Troubleshooting tasks: ${result.microTasks.length}`);
    console.log(
      `[troubleshooting-decomposer] Estimated fix impact: ${(result.estimatedFixImpact * 100).toFixed(0)}%`
    );
    console.log(`[troubleshooting-decomposer] Known patterns matched: ${result.knownPatternCount}`);
    console.log(`[troubleshooting-decomposer] Analysis time: ${result.analysisTimeMs}ms`);

    return result;
  },
});
