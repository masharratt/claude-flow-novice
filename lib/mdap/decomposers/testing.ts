/**
 * Testing Decomposer
 *
 * Analyzes tasks for testing requirements and decomposes into testing-focused micro-tasks.
 * Receives full context from architecture, security, and performance decomposers.
 *
 * @module testing
 * @version 1.0.0 - Extracted from Trigger.dev
 */

import { callGLMWithThinking } from '../glm-client.js';
import { parseJSONFromResponse } from '../validation.js';
import type { ArchitectureAnalysis } from './architecture.js';
import type { SecurityAnalysis } from './security.js';
import type { PerformanceAnalysis } from './performance.js';

// =============================================
// Type Definitions
// =============================================

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

// =============================================
// Testing Decomposer Function
// =============================================

/**
 * Decompose a task from a testing perspective
 *
 * @param payload - Task description and metadata with optional context
 * @returns Testing analysis with micro-tasks
 */
export async function decomposeTesting(
  payload: TestingDecomposerPayload
): Promise<TestingAnalysis> {
  const startTime = Date.now();

  console.log(`[testing-decomposer] Analyzing task: ${payload.taskDescription.substring(0, 80)}...`);

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

Task: ${payload.taskDescription}${contextSection}

IMPORTANT: Return ONLY valid JSON with NO comments, NO trailing commas. Use double quotes for all strings.

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

  try {
    // Call GLM with thinking enabled for test planning
    const glmResult = await callGLMWithThinking(prompt, {
      temperature: 0.7,
      maxTokens: 2048,
    });

    console.log(`[testing-decomposer] GLM API: ${glmResult.durationMs}ms, ${glmResult.inputTokens}+${glmResult.outputTokens} tokens (thinking: ${glmResult.thinkingEnabled})`);

    // Parse JSON response with robust error handling
    const analysis = parseJSONFromResponse(glmResult.content, "testing-decomposer") as {
      microTasks?: Array<any>;
      testingRecommendations?: string[];
      testRequirements?: TestRequirement[];
      coverageGoal?: number;
    };

    // Validate and structure the result
    const result: TestingAnalysis = {
      taskId: payload.taskId,
      perspective: "testing",
      microTasks: (analysis.microTasks || []).map((task: any) => ({
        id: task.id,
        title: task.title,
        description: task.description,
        priority: task.priority,
        rationale: task.rationale || "",
        testTypes: task.testTypes || [],
      })),
      testingRecommendations: analysis.testingRecommendations || [],
      testRequirements: analysis.testRequirements || [],
      coverageGoal: analysis.coverageGoal || 80,
    };

    console.log(`[testing-decomposer] Success: Coverage goal ${result.coverageGoal}%, ${result.testRequirements.length} test requirements`);
    console.log(`  Time: ${Date.now() - startTime}ms`);

    return result;
  } catch (error) {
    const errorMsg = (error as Error).message;

    console.error(`[testing-decomposer] Critical Error: ${errorMsg}`);
    console.error(`[testing-decomposer] Context: taskId=${payload.taskId}, taskDescription length=${payload.taskDescription?.length || 0} chars`);

    // Re-throw with context
    throw new Error(
      `[testing-decomposer] Failed to decompose task: ${errorMsg}\n` +
      `This is a critical error. Testing requirements are mandatory for production tasks.\n` +
      `Common causes: API key invalid, network timeout, malformed prompt, quota exceeded.`
    );
  }
}