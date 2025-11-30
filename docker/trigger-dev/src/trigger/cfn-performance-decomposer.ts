import { task } from "@trigger.dev/sdk/v3";
import type { ArchitectureAnalysis } from "./cfn-architecture-decomposer.js";
import type { SecurityAnalysis } from "./cfn-security-decomposer.js";
import {
  validateDecomposerInput,
  validateCerebrasResponse,
  validateDecompositionOutput,
  parseJSONFromResponse,
} from "../lib/validation-schemas.js";

export interface PerformanceDecomposerPayload {
  taskId: string;
  taskDescription: string;
  workDir: string;
  previousContext?: {
    architecture?: ArchitectureAnalysis;
    securityConstraints?: SecurityAnalysis;
    securityBoundaries?: any[];
  };
}

export interface PerformanceConstraint {
  metric: "latency" | "throughput" | "memory" | "cpu" | "bandwidth";
  target: string;
  rationale: string;
  impactedComponents: string[];
}

export interface PerformanceAnalysis {
  taskId: string;
  perspective: "performance";
  microTasks: Array<{
    id: string;
    title: string;
    description: string;
    priority: "critical" | "high" | "medium" | "low";
    rationale: string;
    metrics: string[];
  }>;
  performanceRecommendations: string[];
  performanceConstraints: PerformanceConstraint[];
  optimizationStrategy: string;
}

export const cfnPerformanceDecomposerTask = task({
  id: "cfn-performance-decomposer",
  retry: { maxAttempts: 1 },

  run: async (payload: PerformanceDecomposerPayload): Promise<PerformanceAnalysis> => {
    const startTime = Date.now();

    // P0 Fix: Task 1 - Input Validation
    const validated = validateDecomposerInput(payload, "performance-decomposer");

    console.log(`[performance-decomposer] Analyzing task: ${validated.taskDescription.substring(0, 80)}...`);

    try {
      // Build context section if provided
      let contextSection = "";
      if (payload.previousContext?.architecture || payload.previousContext?.securityConstraints) {
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
- Security Recommendations: ${JSON.stringify(sec.securityRecommendations || [])}
- Security Boundaries: ${JSON.stringify(sec.securityBoundaries || [])}
- Risk Level: ${sec.riskLevel}`);
        }

        contextSection = `

${parts.join('\n\n')}

Use this context to identify performance implications:
- Inter-service calls → latency overhead, need caching
- Security encryption/auth → CPU overhead, need connection pooling
- Multiple boundaries → cascading failures, need circuit breakers
- Database access → query optimization, connection pooling`;
      }

      const prompt = `You are a performance engineer. Analyze this task for performance considerations and decompose into performance-focused micro-tasks.

Task: ${validated.taskDescription}${contextSection}

Provide:
1. Performance-focused micro-tasks (ID, title, description, metrics)
2. Performance recommendations informed by architecture and security
3. Performance constraints (latency, throughput, memory targets)
4. Optimization strategy

Format as JSON:
{
  "microTasks": [
    {
      "id": "perf-1",
      "title": "...",
      "description": "...",
      "priority": "critical|high|medium|low",
      "rationale": "Performance optimization",
      "metrics": ["latency", "memory", ...]
    }
  ],
  "performanceRecommendations": ["...", "..."],
  "performanceConstraints": [
    {
      "metric": "latency|throughput|memory|cpu|bandwidth",
      "target": "< 100ms p95",
      "rationale": "User experience requirement",
      "impactedComponents": ["APIGateway", "AuthService"]
    }
  ],
  "optimizationStrategy": "..."
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
      const data = validateCerebrasResponse(rawData, "performance-decomposer");
      const content = data.choices[0].message.content;

      // Parse and validate decomposition output
      const analysis = parseJSONFromResponse(content, "performance-decomposer");

      // P0 Fix: Task 3 - Validate decomposition structure
      const validatedAnalysis = validateDecompositionOutput(analysis, "performance-decomposer");

      const result: PerformanceAnalysis = {
        taskId: validated.taskId,
        perspective: "performance",
        microTasks: validatedAnalysis.microTasks.map((task) => ({
          ...task,
          rationale: task.rationale || "",
          metrics: [],
        })),
        performanceRecommendations: analysis.performanceRecommendations || [],
        performanceConstraints: analysis.performanceConstraints || [],
        optimizationStrategy: analysis.optimizationStrategy || "",
      };

      console.log(`[performance-decomposer] ✓ Success: ${result.microTasks.length} micro-tasks, ${result.performanceConstraints.length} constraints`);
      console.log(`  Time: ${Date.now() - startTime}ms`);

      return result;
    } catch (error) {
      const errorMsg = (error as Error).message;
      const errorStack = (error as Error).stack || "No stack trace available";

      // P0 Fix: Enhanced error logging with full context
      console.error(`[performance-decomposer] ✗ Critical Error: ${errorMsg}`);
      console.error(`[performance-decomposer] Stack trace: ${errorStack}`);
      console.error(
        `[performance-decomposer] Context: taskId=${payload.taskId}, ` +
          `taskDescription length=${payload.taskDescription?.length || 0} chars`
      );

      // P0 Fix: Fail fast - do NOT return empty results silently
      throw new Error(
        `[performance-decomposer] Failed to decompose task: ${errorMsg}\n` +
          `This is a critical error. Performance analysis is mandatory for production tasks.\n` +
          `Common causes: API key invalid, network timeout, malformed prompt, quota exceeded.`
      );
    }
  },
});
