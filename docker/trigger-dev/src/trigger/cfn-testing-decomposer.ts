import { task } from "@trigger.dev/sdk/v3";
import type { ArchitectureAnalysis } from "./cfn-architecture-decomposer.js";
import type { SecurityAnalysis } from "./cfn-security-decomposer.js";
import type { PerformanceAnalysis } from "./cfn-performance-decomposer.js";
import {
  validateDecomposerInput,
  validateCerebrasResponse,
  validateDecompositionOutput,
} from "../lib/validation-schemas.js";

export interface TestingDecomposerPayload {
  taskId: string;
  taskDescription: string;
  workDir: string;
  previousContext?: {
    architecture?: ArchitectureAnalysis;
    securityConstraints?: SecurityAnalysis;
    performanceConstraints?: PerformanceAnalysis;
  };
}

export interface TestRequirement {
  component: string;
  testType: "unit" | "integration" | "e2e" | "security" | "performance" | "load";
  scenarios: string[];
  priority: "critical" | "high" | "medium" | "low";
}

export interface TestingAnalysis {
  taskId: string;
  perspective: "testing";
  microTasks: Array<{
    id: string;
    title: string;
    description: string;
    priority: "critical" | "high" | "medium" | "low";
    rationale: string;
    testTypes: string[];
  }>;
  testingRecommendations: string[];
  testRequirements: TestRequirement[];
  coverageGoal: number;
}

export const cfnTestingDecomposerTask = task({
  id: "cfn-testing-decomposer",
  retry: { maxAttempts: 1 },

  run: async (payload: TestingDecomposerPayload): Promise<TestingAnalysis> => {
    const startTime = Date.now();

    // P0 Fix: Task 1 - Input Validation
    const validated = validateDecomposerInput(payload, "testing-decomposer");

    console.log(`[testing-decomposer] Analyzing task: ${validated.taskDescription.substring(0, 80)}...`);

    try {
      // Build comprehensive context section
      let contextSection = "";
      if (payload.previousContext?.architecture ||
          payload.previousContext?.securityConstraints ||
          payload.previousContext?.performanceConstraints) {
        const parts = [];

        if (payload.previousContext.architecture) {
          const arch = payload.previousContext.architecture;
          parts.push(`ARCHITECTURE CONTEXT:
- Components: ${JSON.stringify(arch.components || [])}
- Boundaries: ${JSON.stringify(arch.boundaries || [])}`);
        }

        if (payload.previousContext.securityConstraints) {
          const sec = payload.previousContext.securityConstraints;
          parts.push(`SECURITY CONSTRAINTS:
- Risk Level: ${sec.riskLevel}
- Security Boundaries: ${JSON.stringify(sec.securityBoundaries || [])}`);
        }

        if (payload.previousContext.performanceConstraints) {
          const perf = payload.previousContext.performanceConstraints;
          parts.push(`PERFORMANCE CONSTRAINTS:
- Constraints: ${JSON.stringify(perf.performanceConstraints || [])}
- Optimization Strategy: ${perf.optimizationStrategy}`);
        }

        contextSection = `

${parts.join('\n\n')}

Use this context to create comprehensive test strategy:
- Test inter-service failures (from architecture boundaries)
- Test auth token expiry (from security constraints)
- Test cache invalidation (from performance optimizations)
- Test certificate rotation (from security mTLS)
- Test connection failure recovery (from performance pooling)
- Load test with performance targets (from constraints)`;
      }

      const prompt = `You are a QA engineer. Analyze this task for testing requirements and decompose into testing-focused micro-tasks.

Task: ${validated.taskDescription}${contextSection}

Provide:
1. Testing-focused micro-tasks (ID, title, description, test types)
2. Testing recommendations informed by architecture, security, and performance
3. Detailed test requirements per component
4. Coverage goal percentage

Format as JSON:
{
  "microTasks": [
    {
      "id": "test-1",
      "title": "...",
      "description": "...",
      "priority": "critical|high|medium|low",
      "rationale": "Test coverage",
      "testTypes": ["unit", "integration", "e2e", "security", "performance"]
    }
  ],
  "testingRecommendations": ["...", "..."],
  "testRequirements": [
    {
      "component": "AuthService",
      "testType": "unit|integration|e2e|security|performance|load",
      "scenarios": ["Token expiry", "Refresh flow", "Rate limiting"],
      "priority": "critical|high|medium|low"
    }
  ],
  "coverageGoal": 85
}`;

      const response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.CEREBRAS_API_KEY}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 2048,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Cerebras API error: ${response.status} - ${errorBody}\n` +
            `Check API key validity and quota limits.`
        );
      }

      const rawData = await response.json();

      // P0 Fix: Task 3 - API Response Validation
      const data = validateCerebrasResponse(rawData, "testing-decomposer");
      const content = data.choices[0].message.content;

      // Parse and validate decomposition output
      let analysis: any;
      try {
        analysis = JSON.parse(content);
      } catch (parseError) {
        throw new Error(
          `[testing-decomposer] Failed to parse JSON content: ${(parseError as Error).message}\n` +
            `Raw content (first 200 chars): ${content.substring(0, 200)}\n` +
            `This indicates malformed JSON from the AI model. Try regenerating.`
        );
      }

      // P0 Fix: Task 3 - Validate decomposition structure
      const validatedAnalysis = validateDecompositionOutput(analysis, "testing-decomposer");

      const result: TestingAnalysis = {
        taskId: validated.taskId,
        perspective: "testing",
        microTasks: validatedAnalysis.microTasks.map((task) => ({
          ...task,
          rationale: task.rationale || "",
          testTypes: [],
        })),
        testingRecommendations: analysis.testingRecommendations || [],
        testRequirements: analysis.testRequirements || [],
        coverageGoal: analysis.coverageGoal || 80,
      };

      console.log(`[testing-decomposer] ✓ Success: Coverage goal ${result.coverageGoal}%, ${result.testRequirements.length} test requirements`);
      console.log(`  Time: ${Date.now() - startTime}ms`);

      return result;
    } catch (error) {
      const errorMsg = (error as Error).message;
      const errorStack = (error as Error).stack || "No stack trace available";

      // P0 Fix: Enhanced error logging with full context
      console.error(`[testing-decomposer] ✗ Critical Error: ${errorMsg}`);
      console.error(`[testing-decomposer] Stack trace: ${errorStack}`);
      console.error(
        `[testing-decomposer] Context: taskId=${payload.taskId}, ` +
          `taskDescription length=${payload.taskDescription?.length || 0} chars`
      );

      // P0 Fix: Fail fast - do NOT return empty results silently
      throw new Error(
        `[testing-decomposer] Failed to decompose task: ${errorMsg}\n` +
          `This is a critical error. Testing requirements are mandatory for production tasks.\n` +
          `Common causes: API key invalid, network timeout, malformed prompt, quota exceeded.`
      );
    }
  },
});
