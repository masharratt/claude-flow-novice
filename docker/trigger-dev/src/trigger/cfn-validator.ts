/**
 * CFN Loop 2 Validator Task for Trigger.dev v4
 *
 * Validates CFN Loop 3 implementer work by spawning Claude Code CLI with
 * specialized validator agents (code-reviewer, security-specialist, cto-agent).
 *
 * Provides confidence scores (0.0-1.0) to indicate quality of implementation
 * and validation results for CFN Loop 2 decision making.
 *
 * Used by CFN Loop as a validator task after implementation and testing.
 * Output confidence scores feed into Product Owner decision logic.
 */

import { task } from "@trigger.dev/sdk/v3";
import { execa } from "execa";
import * as path from "path";
import type { ImplementerResult } from "./cfn-implementer.js";
import type { TestRunnerResult } from "./cfn-test-runner.js";

/**
 * Input payload for CFN Loop 2 validator task
 */
export interface ValidatorPayload {
  /** Validator agent type: code-reviewer, security-specialist, or cto-agent */
  agentType: "code-reviewer" | "security-specialist" | "cto-agent";
  /** Working directory where validation will occur */
  workDir: string;
  /** Results from CFN Loop 3 implementer task */
  implementerResults: ImplementerResult[];
  /** Results from test runner gate check task */
  testResult: TestRunnerResult;
  /** Current CFN Loop iteration number */
  iteration: number;
}

/**
 * Output result from CFN Loop 2 validator task
 */
export interface ValidatorResult {
  /** Whether validation execution was successful (CLI executed, parsed output) */
  success: boolean;
  /** Agent type that performed validation */
  agentType: string;
  /** Confidence score from 0.0 (no confidence) to 1.0 (complete confidence) */
  confidence: number;
  /** Detailed feedback from the validator agent */
  feedback: string;
  /** List of specific issues identified during validation */
  issues: string[];
  /** Total execution duration in milliseconds */
  duration: number;
  /** Error message if execution failed */
  error?: string;
}

/**
 * Configuration for each validator agent type
 */
interface ValidatorConfig {
  name: string;
  description: string;
  focusAreas: string[];
}

const VALIDATOR_CONFIGS: Record<string, ValidatorConfig> = {
  "code-reviewer": {
    name: "Code Reviewer",
    description:
      "Reviews code quality, readability, maintainability, and adherence to best practices",
    focusAreas: [
      "Code structure and organization",
      "Naming conventions",
      "DRY principle adherence",
      "Test coverage",
      "Documentation quality",
      "Type safety",
      "Error handling",
      "Performance considerations",
    ],
  },
  "security-specialist": {
    name: "Security Specialist",
    description:
      "Reviews code for security vulnerabilities, data protection, and compliance issues",
    focusAreas: [
      "Input validation and sanitization",
      "Authentication and authorization",
      "Data encryption and protection",
      "SQL injection prevention",
      "XSS prevention",
      "CSRF protection",
      "Dependency vulnerabilities",
      "Secrets management",
      "Access control",
    ],
  },
  "cto-agent": {
    name: "CTO Agent",
    description: "Strategic review of architecture, scalability, maintainability, and tech debt",
    focusAreas: [
      "Architectural decisions",
      "Scalability implications",
      "Technical debt introduced",
      "Code complexity",
      "Dependency management",
      "Performance impact",
      "Maintainability score",
      "Testing strategy",
      "Documentation completeness",
      "Integration points",
    ],
  },
};

const TIMEOUT_MS = 300000; // 5 minutes
const MAX_ATTEMPTS = 1; // No retry for validator tasks
const CLI_COMMAND = "npx";
const CLI_PACKAGE = "@anthropic-ai/claude-code";

/**
 * Build validation prompt for Claude Code CLI
 */
function buildValidationPrompt(payload: ValidatorPayload): string {
  const config = VALIDATOR_CONFIGS[payload.agentType];
  const filesModified = payload.implementerResults
    .flatMap((r) => r.filesModified)
    .join("\n");
  const testStats = `
    Total Tests: ${payload.testResult.totalTests}
    Passed: ${payload.testResult.passedTests}
    Failed: ${payload.testResult.failedTests}
    Pass Rate: ${(payload.testResult.passRate * 100).toFixed(2)}%
  `;

  return `
You are a CFN Loop 2 ${config.name} validator agent.
Your role is to review CFN Loop 3 implementation work and provide validation feedback.

## Review Context
- CFN Loop Iteration: ${payload.iteration}
- Working Directory: ${payload.workDir}
- Validator Type: ${payload.agentType}
- Review Focus: ${config.description}

## Implementation Summary
The following files were modified by CFN Loop 3 implementer agents:
\`\`\`
${filesModified}
\`\`\`

## Test Results from Gate Check
\`\`\`
${testStats}
\`\`\`

## Validation Instructions

Review the modified files in ${payload.workDir} and provide a comprehensive validation report.

### Focus Areas for ${config.name}
${config.focusAreas.map((area) => `- ${area}`).join("\n")}

### Required Output Format

After your review, provide a JSON block with the following structure (MUST be at the end of your response):

\`\`\`json
{
  "confidence": 0.85,
  "feedback": "Overall assessment and summary of validation findings",
  "issues": [
    "Issue 1: Specific problem found",
    "Issue 2: Another concern identified",
    "Issue 3: Additional recommendation"
  ],
  "strengths": [
    "Strength 1: What was done well",
    "Strength 2: Another positive finding"
  ],
  "recommendations": [
    "Recommendation 1: Suggested improvement",
    "Recommendation 2: Future enhancement"
  ]
}
\`\`\`

### Confidence Score Guidelines
- 0.0-0.2: Critical issues, implementation fails validation, should not proceed
- 0.2-0.4: Significant issues, should not proceed without fixes
- 0.4-0.6: Moderate issues, proceed with caution
- 0.6-0.8: Minor issues, ready to proceed with recommendations noted
- 0.8-0.95: Well implemented, minor suggestions only
- 0.95-1.0: Excellent implementation, meets all validation criteria

### Rules
1. Be thorough and honest in your assessment
2. Provide specific, actionable feedback
3. Balance critical issues with positive findings
4. Consider the iteration context (iteration ${payload.iteration})
5. Confidence should reflect genuine assessment, not pressure to proceed
6. Include both blockers and improvements
`;
}

/**
 * Extract validation result from Claude Code CLI output
 */
function extractValidationResult(output: string): {
  confidence: number;
  feedback: string;
  issues: string[];
  strengths: string[];
  recommendations: string[];
  error?: string;
} {
  // Try to find JSON block at end of output
  const jsonMatch = output.match(/```json\s*({[\s\S]*?})\s*```/);

  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);

      // Validate required fields
      const confidence =
        typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5;

      const feedback =
        typeof parsed.feedback === "string" ? parsed.feedback : "No feedback provided";

      const issues = Array.isArray(parsed.issues)
        ? parsed.issues.filter((i: unknown) => typeof i === "string")
        : [];

      const strengths = Array.isArray(parsed.strengths)
        ? parsed.strengths.filter((s: unknown) => typeof s === "string")
        : [];

      const recommendations = Array.isArray(parsed.recommendations)
        ? parsed.recommendations.filter((r: unknown) => typeof r === "string")
        : [];

      return {
        confidence,
        feedback,
        issues,
        strengths,
        recommendations,
      };
    } catch (e) {
      const error =
        e instanceof Error ? e.message : "Failed to parse JSON from validator output";
      return {
        confidence: 0.5,
        feedback: "JSON parsing failed, using default confidence",
        issues: [error],
        strengths: [],
        recommendations: [],
        error,
      };
    }
  }

  // Fallback: extract confidence from text patterns
  const confidenceMatch = output.match(/confidence[:\s]+([0-9.]+)/i);
  const confidence = confidenceMatch
    ? Math.max(0, Math.min(1, parseFloat(confidenceMatch[1])))
    : 0.5;

  return {
    confidence,
    feedback: "Could not parse structured JSON output from validator",
    issues: ["Unable to extract detailed validation results from output"],
    strengths: [],
    recommendations: [],
    error: "No valid JSON structure found in validator output",
  };
}

/**
 * Validate payload structure
 */
function validatePayload(payload: unknown): payload is ValidatorPayload {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }

  const p = payload as Record<string, unknown>;
  return (
    (p.agentType === "code-reviewer" ||
      p.agentType === "security-specialist" ||
      p.agentType === "cto-agent") &&
    typeof p.workDir === "string" &&
    Array.isArray(p.implementerResults) &&
    typeof p.testResult === "object" &&
    typeof p.iteration === "number" &&
    p.workDir.length > 0 &&
    p.iteration >= 0
  );
}

/**
 * Execute Claude Code CLI with validation prompt
 */
async function executeValidatorCLI(payload: ValidatorPayload): Promise<ValidatorResult> {
  const startTime = Date.now();

  try {
    const prompt = buildValidationPrompt(payload);

    const cliArgs = [
      CLI_PACKAGE,
      "-p",
      prompt,
      "--print",
      "--output-format",
      "json",
      "--dangerously-skip-permissions",
    ];

    console.log(`[Validator] Executing Claude Code CLI for ${payload.agentType}`);
    console.log(`[Validator] Working directory: ${payload.workDir}`);
    console.log(`[Validator] Timeout: ${TIMEOUT_MS}ms`);

    const result = await execa(CLI_COMMAND, cliArgs, {
      cwd: payload.workDir,
      timeout: TIMEOUT_MS,
      reject: false,
      all: true,
    });

    const output = result.all || result.stdout || "";
    const duration = Date.now() - startTime;

    console.log(`[Validator] CLI execution completed in ${duration}ms`);

    // Extract validation result from output
    const extractedResult = extractValidationResult(output);

    return {
      success: true,
      agentType: payload.agentType,
      confidence: extractedResult.confidence,
      feedback: extractedResult.feedback,
      issues: extractedResult.issues,
      duration,
      error: extractedResult.error,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Timeout specific handling
    if (errorMessage.includes("timeout") || errorMessage.includes("ETIMEDOUT")) {
      console.error(`[Validator] Execution timeout after ${duration}ms`);

      return {
        success: false,
        agentType: payload.agentType,
        confidence: 0.0,
        feedback: `Validator execution timed out after ${duration}ms`,
        issues: [`Validation timeout: execution exceeded ${TIMEOUT_MS}ms limit`],
        duration,
        error: `Validation timeout (${duration}ms)`,
      };
    }

    // Other execution errors
    console.error(`[Validator] Execution error: ${errorMessage}`);

    return {
      success: false,
      agentType: payload.agentType,
      confidence: 0.0,
      feedback: "Validator execution failed",
      issues: [`Validation failed: ${errorMessage}`],
      duration,
      error: errorMessage,
    };
  }
}

/**
 * Main validator task handler
 */
export async function handleValidatorTask(payload: unknown): Promise<ValidatorResult> {
  // Validate input
  if (!validatePayload(payload)) {
    console.error("[Validator] Invalid payload structure:", payload);
    return {
      success: false,
      agentType: "unknown",
      confidence: 0.0,
      feedback: "Invalid validator payload",
      issues: ["Invalid payload: missing or incorrect fields"],
      duration: 0,
      error: "Invalid payload structure",
    };
  }

  // Normalize working directory path
  const workDir = path.resolve(payload.workDir);
  const normalizedPayload: ValidatorPayload = {
    ...payload,
    workDir,
  };

  console.log("[Validator] Starting CFN Loop 2 validator task");
  console.log(`[Validator] Agent Type: ${normalizedPayload.agentType}`);
  console.log(`[Validator] Iteration: ${normalizedPayload.iteration}`);
  console.log(`[Validator] Max Attempts: ${MAX_ATTEMPTS}`);

  const startTime = Date.now();

  try {
    // Execute validator CLI
    const result = await executeValidatorCLI(normalizedPayload);

    // Log final result
    if (result.success) {
      console.log("[Validator] ✓ Validation completed successfully");
      console.log(`[Validator] Confidence Score: ${(result.confidence * 100).toFixed(2)}%`);
      console.log(`[Validator] Issues Identified: ${result.issues.length}`);
    } else {
      console.error("[Validator] ✗ Validation failed");
      console.error(`[Validator] Error: ${result.error}`);
    }

    console.log(`[Validator] Total Duration: ${result.duration}ms`);

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error("[Validator] ✗ Unexpected error:", errorMessage);

    return {
      success: false,
      agentType: normalizedPayload.agentType,
      confidence: 0.0,
      feedback: "Unexpected validation error",
      issues: [`Unexpected error: ${errorMessage}`],
      duration,
      error: `Unexpected error: ${errorMessage}`,
    };
  }
}

/**
 * CFN Validator Task for Trigger.dev
 *
 * Entry point for Trigger.dev task that validates CFN Loop 3 implementation work.
 * Spawns Claude Code CLI with specified validator agent type and returns confidence score.
 *
 * Success criteria:
 * - CLI execution completes (may contain feedback, but execution succeeds)
 * - Confidence score extracted (0.0-1.0)
 * - Feedback and issues collected
 *
 * The caller (CFN Loop orchestrator) determines if confidence meets validation threshold.
 */
export const cfnValidatorTask = task({
  id: "cfn-validator",
  retry: {
    maxAttempts: 1, // No retries for validator tasks
  },
  run: async (payload: ValidatorPayload): Promise<ValidatorResult> => {
    return handleValidatorTask(payload);
  },
});

/**
 * Legacy default export for backwards compatibility
 */
export default async function (payload: unknown): Promise<ValidatorResult> {
  return handleValidatorTask(payload);
}
