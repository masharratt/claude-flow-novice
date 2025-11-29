/**
 * Phase 3 Validator Integration Test
 *
 * Tests Tasks 3.1-3.3:
 * - Task 3.1: Async Validator Orchestrator (spawn 5 validators in parallel)
 * - Task 3.2: Validation Pipeline (streaming results)
 * - Task 3.3: Quality Gate Aggregator (pass/fail decision)
 *
 * USAGE:
 *   TRIGGER_SECRET_KEY=tr_dev_xxx npx tsx test-phase3-validators.ts
 */

import { configure, tasks, runs } from "@trigger.dev/sdk/v3";
import type { DecompositionPlan } from "./src/trigger/cfn-decomposition-aggregator.js";

// Configure SDK
configure({
  secretKey: process.env.TRIGGER_SECRET_KEY!,
  baseURL: process.env.TRIGGER_API_URL || "http://localhost:8030",
});

// =============================================
// Test Data
// =============================================

const mockDecompositionPlan: DecompositionPlan = {
  taskId: "test-phase3-001",
  originalTask: "Implement user authentication with JWT tokens",
  microTasks: [
    {
      id: "task-1",
      title: "Implement JWT token generation",
      description: "Create function to generate secure JWT tokens",
      priority: "high",
      rationale: "Core authentication functionality",
      perspectives: [
        { perspective: "security", rationale: "Secure token generation is critical" },
        { perspective: "architecture", rationale: "Needs clean API design" },
      ],
      dependencies: [],
      estimatedEffort: "medium",
    },
    {
      id: "task-2",
      title: "Implement token validation middleware",
      description: "Create Express middleware to validate JWT tokens",
      priority: "high",
      rationale: "Required for protected routes",
      perspectives: [
        { perspective: "security", rationale: "Must prevent token forgery" },
        { perspective: "performance", rationale: "Minimize validation latency" },
      ],
      dependencies: ["task-1"],
      estimatedEffort: "medium",
    },
  ],
  swarmAnalysis: {
    architectureRecommendations: ["Use async/await pattern", "Separate concerns"],
    securityRecommendations: ["Use bcrypt for password hashing", "Implement rate limiting"],
    securityRiskLevel: "high",
    performanceRecommendations: ["Cache validated tokens", "Use Redis for token storage"],
    testingRecommendations: ["Test token expiration", "Test invalid tokens"],
    coverageGoal: 85,
  },
  executionPhases: [
    { phase: 1, parallelTasks: ["task-1"], sequentialDependencies: [] },
    { phase: 2, parallelTasks: ["task-2"], sequentialDependencies: ["task-1"] },
  ],
  totalEstimatedTasks: 2,
};

const mockImplementations = [
  `
// JWT Token Generation
import jwt from 'jsonwebtoken';

export async function generateToken(userId: string): Promise<string> {
  const secret = process.env.JWT_SECRET || 'default-secret';
  const token = jwt.sign({ userId }, secret, { expiresIn: '24h' });
  return token;
}
  `,
  `
// JWT Validation Middleware
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

export function validateToken(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret');
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
  `,
];

const mockTests = [
  `
// JWT Token Generation Tests
import { generateToken } from './jwt-generator';
import jwt from 'jsonwebtoken';

describe('generateToken', () => {
  it('should generate valid JWT token', async () => {
    const token = await generateToken('user-123');
    expect(token).toBeTruthy();

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret');
    expect(decoded.userId).toBe('user-123');
  });

  it('should include expiration', async () => {
    const token = await generateToken('user-123');
    const decoded = jwt.decode(token);
    expect(decoded.exp).toBeTruthy();
  });
});
  `,
];

// =============================================
// Test Functions
// =============================================

async function testOrchestratorTask() {
  console.log("========================================");
  console.log("TEST 1: Async Validator Orchestrator");
  console.log("========================================\n");

  try {
    const handle = await tasks.trigger("cfn-async-validator-orchestrator", {
      taskId: "test-orchestrator-001",
      decompositionPlan: mockDecompositionPlan,
      implementations: mockImplementations,
      tests: mockTests,
      workDir: "/tmp/test-phase3",
    });

    console.log(`Triggered orchestrator: ${handle.id}`);
    console.log("Polling for result...\n");

    const result = await runs.poll(handle.id, { pollIntervalMs: 2000 });

    if (result.status === "COMPLETED" && result.output) {
      const output = result.output as any;

      console.log("✓ Orchestrator completed successfully");
      console.log(`  Overall score: ${output.overallScore.toFixed(2)}`);
      console.log(`  Consensus: ${output.consensusReached ? "REACHED" : "FAILED"}`);
      console.log(`  Success: ${output.successCount}/${output.validators.length}`);
      console.log(`  Latency: ${output.totalLatencyMs}ms`);
      console.log("\nValidator Results:");

      for (const validator of output.validators) {
        console.log(`  - ${validator.validatorType}: ${validator.status} (score: ${validator.score.toFixed(2)}, latency: ${validator.latencyMs}ms)`);
      }

      return true;
    } else {
      console.error("✗ Orchestrator failed:", result.status);
      return false;
    }
  } catch (error) {
    console.error("✗ Error:", (error as Error).message);
    return false;
  }
}

async function testPipelineTask() {
  console.log("\n========================================");
  console.log("TEST 2: Validation Pipeline (Streaming)");
  console.log("========================================\n");

  try {
    const handle = await tasks.trigger("cfn-validation-pipeline", {
      taskId: "test-pipeline-001",
      decompositionPlan: mockDecompositionPlan,
      implementations: mockImplementations,
      tests: mockTests,
      workDir: "/tmp/test-phase3",
    });

    console.log(`Triggered pipeline: ${handle.id}`);
    console.log("Polling for result...\n");

    const result = await runs.poll(handle.id, { pollIntervalMs: 2000 });

    if (result.status === "COMPLETED" && result.output) {
      const output = result.output as any;

      console.log("✓ Pipeline completed successfully");
      console.log(`  Final score: ${output.finalMetrics.currentScore.toFixed(2)}`);
      console.log(`  Completed: ${output.finalMetrics.completedValidators}/${output.finalMetrics.totalValidators}`);
      console.log(`  First result: ${output.firstValidatorLatencyMs}ms`);
      console.log(`  Last result: ${output.lastValidatorLatencyMs}ms`);
      console.log(`  Total latency: ${output.totalPipelineLatencyMs}ms`);
      console.log("\nStreaming Progress (in completion order):");

      for (const progress of output.streamingProgress) {
        console.log(`  - ${progress.validatorType}: ${progress.status} (score: ${progress.score.toFixed(2)}, latency: ${progress.latencyMs}ms)`);
      }

      return true;
    } else {
      console.error("✗ Pipeline failed:", result.status);
      return false;
    }
  } catch (error) {
    console.error("✗ Error:", (error as Error).message);
    return false;
  }
}

async function testQualityGateTask() {
  console.log("\n========================================");
  console.log("TEST 3: Quality Gate Aggregator");
  console.log("========================================\n");

  // First get validator results from orchestrator
  console.log("Step 1: Running orchestrator to get validator results...\n");

  const orchHandle = await tasks.trigger("cfn-async-validator-orchestrator", {
    taskId: "test-gate-001",
    decompositionPlan: mockDecompositionPlan,
    implementations: mockImplementations,
    tests: mockTests,
    workDir: "/tmp/test-phase3",
  });

  const orchResult = await runs.poll(orchHandle.id, { pollIntervalMs: 2000 });

  if (orchResult.status !== "COMPLETED" || !orchResult.output) {
    console.error("✗ Orchestrator failed");
    return false;
  }

  const validatorResults = (orchResult.output as any).validators;

  console.log("Step 2: Running quality gate with validator results...\n");

  // Test with different modes
  const modes: Array<"mvp" | "standard" | "enterprise"> = ["mvp", "standard", "enterprise"];

  for (const mode of modes) {
    console.log(`\nTesting ${mode.toUpperCase()} mode:`);

    try {
      const gateHandle = await tasks.trigger("cfn-quality-gate-v2", {
        taskId: "test-gate-001",
        iterationNumber: 1,
        mode,
        validatorResults,
      });

      const gateResult = await runs.poll(gateHandle.id, { pollIntervalMs: 2000 });

      if (gateResult.status === "COMPLETED" && gateResult.output) {
        const output = gateResult.output as any;

        console.log(`  Decision: ${output.gateDecision.decision}`);
        console.log(`  Score: ${output.gateDecision.score.toFixed(2)} / ${output.gateDecision.threshold}`);
        console.log(`  Passed: ${output.gateDecision.passed ? "✓" : "✗"}`);
        console.log(`  Quorum: ${output.quorumMet ? "✓" : "✗"}`);

        if (output.focusAreas.length > 0) {
          console.log("  Focus areas:");
          for (const area of output.focusAreas.slice(0, 3)) {
            console.log(`    - ${area}`);
          }
        }
      } else {
        console.error(`  ✗ Gate check failed: ${gateResult.status}`);
      }
    } catch (error) {
      console.error(`  ✗ Error: ${(error as Error).message}`);
    }
  }

  return true;
}

// =============================================
// Main Test Runner
// =============================================

async function main() {
  console.log("Phase 3 Validator Integration Test\n");
  console.log("Testing Tasks 3.1-3.3:");
  console.log("  3.1: Async Validator Orchestrator");
  console.log("  3.2: Validation Pipeline (Streaming)");
  console.log("  3.3: Quality Gate Aggregator\n");

  const results = {
    orchestrator: false,
    pipeline: false,
    qualityGate: false,
  };

  // Test 1: Orchestrator
  results.orchestrator = await testOrchestratorTask();

  // Test 2: Pipeline
  results.pipeline = await testPipelineTask();

  // Test 3: Quality Gate
  results.qualityGate = await testQualityGateTask();

  // Summary
  console.log("\n========================================");
  console.log("TEST SUMMARY");
  console.log("========================================\n");

  console.log(`Orchestrator:  ${results.orchestrator ? "✓ PASSED" : "✗ FAILED"}`);
  console.log(`Pipeline:      ${results.pipeline ? "✓ PASSED" : "✗ FAILED"}`);
  console.log(`Quality Gate:  ${results.qualityGate ? "✓ PASSED" : "✗ FAILED"}`);

  const allPassed = results.orchestrator && results.pipeline && results.qualityGate;

  console.log(`\nOverall: ${allPassed ? "✓ ALL TESTS PASSED" : "✗ SOME TESTS FAILED"}`);

  process.exit(allPassed ? 0 : 1);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
